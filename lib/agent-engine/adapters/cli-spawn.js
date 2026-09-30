const fs = require('fs');
const path = require('path');

/**
 * cli-spawn — Resolución segura del ejecutable de un CLI de agente.
 *
 * En Windows, lanzar un .cmd/.bat exige `shell: true`, y Node concatena los argumentos sin escapar:
 * el prompt se parte en palabras y caracteres como & | > % " se interpretan en cmd.exe.
 * Este módulo localiza el ejecutable nativo (o el script JS de un shim de npm) para poder usar
 * `shell: false`, donde cada argumento llega intacto al proceso hijo.
 */

function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch (e) {
    return false;
  }
}

function searchPath(name) {
  const win = process.platform === 'win32';
  const dirs = (process.env.PATH || process.env.Path || '').split(path.delimiter).filter(Boolean);
  // .exe/.com primero: un .cmd anterior en el PATH suele ser solo un shim del binario nativo
  const exts = win ? ['.exe', '.com', '.cmd', '.bat'] : [''];
  for (const ext of exts) {
    for (const dir of dirs) {
      const candidate = path.join(dir, name + ext);
      if (isFile(candidate)) return candidate;
    }
  }
  return null;
}

/**
 * Extrae el destino real de un shim .cmd de npm:
 *   "%dp0%\node_modules\pkg\bin\tool.exe"   %*
 *   "%_prog%"  "%dp0%\node_modules\pkg\bin\cli.js" %*
 * @returns {{ file: string, prefixArgs: string[] } | null}
 */
function unwrapCmdShim(shimPath) {
  let text;
  try {
    text = fs.readFileSync(shimPath, 'utf-8');
  } catch (e) {
    return null;
  }
  const match = text.match(/"%~?dp0%?\\([^"\r\n]+\.(exe|js|cjs|mjs))"/i);
  if (!match) return null;

  const target = path.join(path.dirname(shimPath), ...match[1].split('\\'));
  if (!isFile(target)) return null;

  if (match[2].toLowerCase() === 'exe') {
    return { file: target, prefixArgs: [] };
  }
  return { file: process.execPath, prefixArgs: [target] };
}

/**
 * Resuelve cómo lanzar un CLI sin shell.
 *
 * @param {string} name Nombre base del comando (ej: 'claude')
 * @param {string[]} args Argumentos del comando
 * @param {Object} [options]
 * @param {string} [options.envVar] Variable de entorno que fuerza la ruta del ejecutable (ej: CLAUDE_BIN)
 * @param {string[]} [options.extraPaths] Rutas conocidas adicionales (se prueban antes que el PATH)
 * @returns {{ file: string, args: string[] }}
 * @throws {Error} si solo existe un .cmd/.bat que no se puede lanzar de forma segura sin shell
 */
function resolveInvocation(name, args, { envVar = null, extraPaths = [] } = {}) {
  let resolved = null;

  const override = envVar && process.env[envVar];
  if (override && isFile(override)) {
    resolved = override;
  }
  if (!resolved) {
    resolved = extraPaths.find(isFile) || null;
  }
  if (!resolved) {
    resolved = searchPath(name);
  }

  // No encontrado: se deja el nombre tal cual para que spawn emita ENOENT y el adaptador lo reporte
  if (!resolved) return { file: name, args };

  if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(resolved)) {
    const unwrapped = unwrapCmdShim(resolved);
    if (!unwrapped) {
      throw new Error(
        `No se puede lanzar "${resolved}" de forma segura sin shell. ` +
        (envVar ? `Define ${envVar} con la ruta del ejecutable nativo (.exe).` : 'Usa el ejecutable nativo (.exe).')
      );
    }
    return { file: unwrapped.file, args: [...unwrapped.prefixArgs, ...args] };
  }

  return { file: resolved, args };
}

/**
 * Opciones de spawn comunes a los CLIs de agente.
 * En POSIX el hijo lidera su propio grupo de procesos (detached) para poder terminar también
 * a sus nietos (Chromium de Playwright, scripts node) sin dejar huérfanos.
 */
function buildSpawnOptions(cwd) {
  return {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    windowsHide: true,
    detached: process.platform !== 'win32',
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      PAGER: process.platform === 'win32' ? '' : 'cat',
      MISE_QUIET: '1',
      MISE_SILENT: '1'
    }
  };
}

/**
 * Configura la codificación UTF-8 de stdout/stderr: el decodificador de streams de Node
 * conserva los caracteres multibyte (acentos) partidos entre dos fragmentos.
 */
function useUtf8Streams(child) {
  if (child.stdout) child.stdout.setEncoding('utf8');
  if (child.stderr) child.stderr.setEncoding('utf8');
}

/**
 * Termina el proceso hijo y todo su árbol. En POSIX envía SIGTERM al grupo y escala a SIGKILL
 * si sigue vivo tras `graceMs`.
 */
function killProcessTree(child, { graceMs = 3000 } = {}) {
  if (!child || !child.pid) return;
  try {
    if (process.platform === 'win32') {
      require('child_process').exec(`taskkill /pid ${child.pid} /T /F`, () => {});
      return;
    }
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch (e) {
      child.kill('SIGTERM');
    }
    const timer = setTimeout(() => {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch (e) {
        try { child.kill('SIGKILL'); } catch (e2) {}
      }
    }, graceMs);
    timer.unref();
    child.once('close', () => clearTimeout(timer));
  } catch (e) {}
}

module.exports = { resolveInvocation, unwrapCmdShim, searchPath, buildSpawnOptions, useUtf8Streams, killProcessTree };
