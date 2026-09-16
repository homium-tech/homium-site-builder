const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const EngineAdapter = require('./engine-adapter');

function resolveClaudeBinary(cmd = 'claude') {
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    const directWinPath = path.join(localAppData, 'Programs', 'Claude', 'claude.exe');
    if (fs.existsSync(directWinPath)) {
      return directWinPath;
    }
  }
  return cmd;
}

class ClaudeAdapter extends EngineAdapter {
  constructor() {
    super('claude');
  }

  buildCommandAndArgs({ prompt, session }) {
    return {
      command: 'claude',
      args: [
        '-p', prompt,
        '--session-id', session.id,
        '--dangerously-skip-permissions'
      ]
    };
  }

  spawnTurn({ prompt, session, isFirstTurn, cwd, onStdout, onStderr, onExit, onError }) {
    const { command, args } = this.buildCommandAndArgs({ prompt, session, isFirstTurn });
    const executable = resolveClaudeBinary(command);
    const isDirectExe = process.platform === 'win32' && executable.toLowerCase().endsWith('.exe');
    let child;

    try {
      child = spawn(executable, args, {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: isDirectExe ? false : process.platform === 'win32',
        env: {
          ...process.env,
          FORCE_COLOR: '0',
          PAGER: process.platform === 'win32' ? '' : 'cat',
          MISE_QUIET: '1',
          MISE_SILENT: '1'
        }
      });
    } catch (err) {
      if (onError) onError(err);
      return { kill: () => {} };
    }

    if (onStdout) {
      child.stdout.on('data', (data) => onStdout(data.toString('utf-8')));
    }
    if (onStderr) {
      child.stderr.on('data', (data) => onStderr(data.toString('utf-8')));
    }
    if (onError) {
      child.on('error', onError);
    }
    if (onExit) {
      child.on('close', (code) => onExit(code));
    }

    return {
      kill: () => {
        try {
          if (process.platform === 'win32' && child.pid) {
            exec(`taskkill /pid ${child.pid} /T /F`, () => {});
          } else {
            child.kill('SIGTERM');
          }
        } catch (e) {}
      }
    };
  }
}

module.exports = ClaudeAdapter;
