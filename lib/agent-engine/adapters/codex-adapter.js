const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const EngineAdapter = require('./engine-adapter');
const { resolveInvocation, buildSpawnOptions, useUtf8Streams, killProcessTree } = require('./cli-spawn');

function knownCodexPaths() {
  if (process.platform !== 'win32') return [];
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return [path.join(localAppData, 'codex', 'bin', 'codex.exe')];
}

class CodexAdapter extends EngineAdapter {
  constructor() {
    super('codex');
  }

  buildCommandAndArgs({ prompt }) {
    return {
      command: 'codex',
      args: ['exec', prompt]
    };
  }

  spawnTurn({ prompt, session, isFirstTurn, cwd, onStdout, onStderr, onExit, onError }) {
    const { command, args } = this.buildCommandAndArgs({ prompt, session, isFirstTurn });
    let child;

    try {
      // Sin shell: el prompt llega intacto (en Windows, shell:true lo parte en palabras e interpreta & | > %)
      const invocation = resolveInvocation(command, args, { envVar: 'CODEX_BIN', extraPaths: knownCodexPaths() });
      child = spawn(invocation.file, invocation.args, buildSpawnOptions(cwd));
      useUtf8Streams(child);
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
      kill: () => killProcessTree(child)
    };
  }
}

module.exports = CodexAdapter;
