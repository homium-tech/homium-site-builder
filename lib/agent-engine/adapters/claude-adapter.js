const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const EngineAdapter = require('./engine-adapter');
const { resolveInvocation } = require('./cli-spawn');

function knownClaudePaths() {
  if (process.platform !== 'win32') return [];
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return [
    path.join(localAppData, 'Programs', 'Claude', 'claude.exe'),
    path.join(os.homedir(), '.local', 'bin', 'claude.exe')
  ];
}

class ClaudeAdapter extends EngineAdapter {
  constructor() {
    super('claude');
  }

  buildCommandAndArgs({ prompt }) {
    return {
      command: 'claude',
      args: [
        '-p', prompt,
        '--dangerously-skip-permissions'
      ]
    };
  }

  spawnTurn({ prompt, session, isFirstTurn, cwd, onStdout, onStderr, onExit, onError }) {
    const { command, args } = this.buildCommandAndArgs({ prompt, session, isFirstTurn });
    let child;

    try {
      // Sin shell: el prompt llega intacto (en Windows, shell:true lo parte en palabras e interpreta & | > %)
      const invocation = resolveInvocation(command, args, { envVar: 'CLAUDE_BIN', extraPaths: knownClaudePaths() });
      child = spawn(invocation.file, invocation.args, {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
        windowsHide: true,
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
