#!/usr/bin/env node
/**
 * Homium Site Builder — Setup & Diagnostics Doctor
 * Universal CLI diagnostic and setup assistant for Windows, macOS and Linux.
 */

const { execSync } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');

const isCheckOnly = process.argv.includes('--check-only');

// ANSI Colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m'
};

function log(msg = '') {
  console.log(msg);
}

function printHeader() {
  log(`\n${colors.cyan}${colors.bright}======================================================================${colors.reset}`);
  log(`${colors.cyan}${colors.bright}   HOMIUM SITE BUILDER — Asistente de Instalación y Diagnóstico      ${colors.reset}`);
  log(`${colors.cyan}   Sistema Operativo: ${os.type()} ${os.release()} (${os.arch()}) | Node: ${process.version}${colors.reset}`);
  log(`${colors.cyan}${colors.bright}======================================================================${colors.reset}\n`);
}

function checkCommandInPath(cmd) {
  try {
    const isWin = process.platform === 'win32';
    const checkCmd = isWin ? `where ${cmd}` : `command -v ${cmd} || which ${cmd}`;
    execSync(checkCmd, { stdio: 'pipe', encoding: 'utf-8' });
    return true;
  } catch (e) {
    return false;
  }
}

function checkHttpService(urlStr, timeoutMs = 1200) {
  return new Promise((resolve) => {
    try {
      const url = new URL(urlStr);
      const req = http.request(
        url,
        {
          method: 'GET',
          timeout: timeoutMs
        },
        (res) => {
          resolve({ ok: true, status: res.statusCode });
        }
      );
      req.on('timeout', () => {
        req.destroy();
        resolve({ ok: false, error: 'Timeout' });
      });
      req.on('error', (err) => {
        resolve({ ok: false, error: err.code || err.message });
      });
      req.end();
    } catch (err) {
      resolve({ ok: false, error: err.message });
    }
  });
}

async function main() {
  printHeader();

  // 1. Verificación de Node.js
  const nodeMajor = parseInt(process.version.slice(1).split('.')[0], 10);
  if (nodeMajor < 18) {
    log(`${colors.red}❌ Error: Node.js >= 18 es requerido (tienes ${process.version}).${colors.reset}`);
    process.exit(1);
  }
  log(`${colors.green}✔ Node.js:${colors.reset} ${process.version} (Cumple requisito >= 18)`);

  // 2. Verificación de pnpm
  const hasPnpm = checkCommandInPath('pnpm');
  if (hasPnpm) {
    let pnpmVer = '';
    try {
      pnpmVer = execSync('pnpm --version', { stdio: 'pipe', encoding: 'utf-8' }).trim();
    } catch (e) {}
    log(`${colors.green}✔ Gestor de paquetes (pnpm):${colors.reset} v${pnpmVer || 'detectado'}`);
  } else {
    log(`${colors.yellow}⚠️ pnpm no está en el PATH global.${colors.reset}`);
    log(`  Para habilitarlo rápidamente puedes ejecutar:`);
    log(`  ${colors.bright}corepack enable && corepack prepare pnpm@latest --activate${colors.reset}`);
    log(`  o: ${colors.bright}npm install -g pnpm${colors.reset}\n`);
  }

  // 3. Espacio de trabajo (Workspace)
  const defaultWorkspace = path.join(os.homedir(), 'Downloads', 'homium_projects');
  const activeWorkspace = process.env.WORKSPACE_DIR ? path.resolve(process.env.WORKSPACE_DIR) : defaultWorkspace;
  if (!fs.existsSync(activeWorkspace)) {
    try {
      fs.mkdirSync(activeWorkspace, { recursive: true });
    } catch (e) {}
  }
  log(`${colors.green}✔ Espacio de Trabajo (CWD):${colors.reset} ${activeWorkspace}`);
  log(`  ${colors.dim}(Los entregables y proyectos se guardarán fuera de la app en Downloads)${colors.reset}\n`);

  // 4. Instalación de dependencias (si no es --check-only)
  if (!isCheckOnly) {
    log(`${colors.cyan}📦 Instalando dependencias del proyecto con pnpm...${colors.reset}`);
    try {
      execSync('pnpm install', {
        stdio: 'inherit',
        cwd: path.resolve(__dirname, '..')
      });
      log(`${colors.green}✔ Dependencias instaladas correctamente.${colors.reset}\n`);
    } catch (e) {
      log(`${colors.red}❌ Falló la instalación de dependencias.${colors.reset}\n`);
    }
  }

  // 5. Diagnóstico de Motores de IA
  log(`${colors.cyan}${colors.bright}--- Estado de Motores de Inteligencia Artificial ---${colors.reset}`);

  const engines = [
    { name: 'Claude Code CLI', cmd: 'claude', type: 'cli' },
    { name: 'Antigravity CLI (AGY)', cmd: 'agy', type: 'cli' },
    { name: 'Codex CLI (OpenAI)', cmd: 'codex', type: 'cli' },
    { name: 'OpenCode CLI', cmd: 'opencode', type: 'cli' },
    { name: 'llama.cpp Server', url: 'http://127.0.0.1:8080/health', type: 'http', port: 8080 },
    { name: 'Ollama Local Server', url: 'http://127.0.0.1:11434/api/tags', type: 'http', port: 11434 }
  ];

  let readyEnginesCount = 0;

  for (const eng of engines) {
    if (eng.type === 'cli') {
      const isAvailable = checkCommandInPath(eng.cmd);
      if (isAvailable) {
        readyEnginesCount++;
        log(`  ${colors.green}[LISTO]${colors.reset}         ${eng.name.padEnd(26)} (CLI disponible en PATH)`);
      } else {
        log(`  ${colors.dim}[OPCIONAL]${colors.reset}      ${eng.name.padEnd(26)} (No detectado en PATH)`);
      }
    } else if (eng.type === 'http') {
      const res = await checkHttpService(eng.url);
      if (res.ok) {
        readyEnginesCount++;
        log(`  ${colors.green}[LISTO]${colors.reset}         ${eng.name.padEnd(26)} (Servidor activo en puerto ${eng.port})`);
      } else {
        log(`  ${colors.dim}[OPCIONAL]${colors.reset}      ${eng.name.padEnd(26)} (Apagado / No disponible)`);
      }
    }
  }

  // El simulador Mock siempre está listo
  readyEnginesCount++;
  log(`  ${colors.green}[LISTO]${colors.reset}         ${'Simulador Mock (En Memoria)'.padEnd(26)} (Siempre disponible para pruebas)\n`);

  // 6. Diagnóstico de Playwright (Forense de URLs - Opcional bajo demanda)
  log(`${colors.cyan}${colors.bright}--- Extracción Forense de URLs (Playwright) ---${colors.reset}`);
  let playwrightReady = false;
  try {
    const testPlaywright = `node -e "const p = require('playwright'); process.stdout.write(p.chromium.executablePath());"`;
    const execPath = execSync(testPlaywright, { stdio: 'pipe', encoding: 'utf-8' }).trim();
    if (execPath && fs.existsSync(execPath)) {
      playwrightReady = true;
    }
  } catch (e) {}

  if (playwrightReady) {
    log(`  ${colors.green}✔ Chromium Forense:${colors.reset} Instalado y listo para extraer URLs.`);
  } else {
    log(`  ${colors.yellow}ℹ️ Chromium Forense:${colors.reset} No instalado actualmente.`);
    log(`    ${colors.dim}Es un paso opcional bajo demanda. Si planeas clonar el DNA visual de URLs existentes,`);
    log(`    puedes instalarlo en cualquier momento ejecutando:${colors.reset}`);
    log(`    ${colors.bright}pnpm run install:playwright${colors.reset}`);
  }

  // 7. Resumen de Ejecución
  log(`\n${colors.cyan}${colors.bright}======================================================================${colors.reset}`);
  if (readyEnginesCount > 1) {
    log(`${colors.green}${colors.bright}✔ Homium Site Builder está completamente listo para ejecutarse.${colors.reset}`);
  } else {
    log(`${colors.yellow}ℹ️ Tienes al menos 1 motor listo. Puedes iniciar Homium Site Builder.${colors.reset}`);
  }
  log(`  Para iniciar el servidor ejecuta:`);
  log(`  ${colors.bright}pnpm start${colors.reset}`);
  if (process.platform === 'win32') {
    log(`  o haz doble clic en: ${colors.bright}start.bat${colors.reset}`);
  } else {
    log(`  o ejecuta: ${colors.bright}./start.sh${colors.reset}`);
  }
  log(`${colors.cyan}${colors.bright}======================================================================${colors.reset}\n`);
}

main().catch((err) => {
  console.error('Error fatal en asistente:', err);
  process.exit(1);
});
