const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');

// Arnés para pruebas de integración: arranca el server.js real en un puerto libre con un workspace temporal.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

async function waitFor(predicate, { timeoutMs = 5000, stepMs = 25 } = {}) {
  const start = Date.now();
  for (;;) {
    const value = await predicate();
    if (value) return value;
    if (Date.now() - start > timeoutMs) throw new Error('waitFor: timeout');
    await sleep(stepMs);
  }
}

function parseSSE(text) {
  const events = [];
  for (const block of text.split('\n\n')) {
    const match = block.match(/^event: (\w+)\ndata: (.*)$/m);
    if (match) events.push({ name: match[1], data: JSON.parse(match[2]) });
  }
  return events;
}

/**
 * @param {Object} [options]
 * @param {Object} [options.env] Variables de entorno adicionales para el servidor
 * @param {boolean} [options.login=true] Iniciar sesión y adjuntar la cookie a `api()`
 * @param {(workspaceDir: string) => void} [options.beforeStart] Preparar archivos en el workspace antes de arrancar
 */
async function startServer({ env = {}, login = true, beforeStart = null } = {}) {
  const port = await freePort();
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'server-harness-'));
  if (beforeStart) beforeStart(workspaceDir);

  // Ningún test puede lanzar un motor real (claude, agy, codex...): consumiría cuota y ejecutaría un agente con
  // permisos abiertos. El servidor corre con un PATH vacío y un HOME temporal, de modo que los CLIs no se encuentran
  // ni en el PATH ni en las rutas conocidas bajo el directorio de usuario; solo el motor mock funciona.
  const sandboxHome = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-home-'));
  const baseEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (/^path$/i.test(key) || /_BIN$/.test(key)) continue;
    baseEnv[key] = value;
  }

  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..', '..'),
    env: {
      ...baseEnv,
      PATH: sandboxHome,
      HOME: sandboxHome,
      USERPROFILE: sandboxHome,
      LOCALAPPDATA: sandboxHome,
      APPDATA: sandboxHome,
      PORT: String(port),
      HOST: '127.0.0.1',
      AUTH_USER: 'tester',
      AUTH_PASS: 'secret-pass',
      SESSION_SECRET: 'test-secret',
      WORKSPACE_DIR: workspaceDir,
      MOCK_DELAY_MS: '15',
      ...env
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let logs = '';
  child.stdout.on('data', (d) => { logs += d; });
  child.stderr.on('data', (d) => { logs += d; });
  await waitFor(() => logs.includes('activo en'), { timeoutMs: 10000 });

  const base = `http://127.0.0.1:${port}`;
  let cookie = '';

  const doLogin = async (email = 'tester', password = 'secret-pass', headers = {}) => {
    const res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ email, password })
    });
    return res;
  };

  if (login) {
    const loginRes = await doLogin();
    assert.strictEqual(loginRes.status, 200);
    cookie = loginRes.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  }

  // Un FormData (subida de archivos) viaja tal cual y fija su propio Content-Type con el límite multipart
  const api = (route, { method = 'GET', body, signal, headers = {} } = {}) => fetch(`${base}${route}`, {
    method,
    headers: { ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: body instanceof FormData ? body : (body ? JSON.stringify(body) : undefined),
    signal
  });

  return {
    base,
    api,
    doLogin,
    workspaceDir,
    logs: () => logs,
    stop: async () => {
      child.kill('SIGTERM');
      await new Promise((resolve) => child.once('close', resolve));
      fs.rmSync(workspaceDir, { recursive: true, force: true });
      fs.rmSync(sandboxHome, { recursive: true, force: true });
    }
  };
}

module.exports = { startServer, sleep, waitFor, parseSSE };
