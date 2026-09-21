const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const EngineAdapter = require('./engine-adapter');

function resolveOpenCodeBinary(cmd = 'opencode') {
  if (process.platform === 'win32') {
    // Preferir el binario instalado via npm (versión más reciente)
    const npmBin = path.join(
      process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
      'npm', 'opencode.cmd'
    );
    if (fs.existsSync(npmBin)) return npmBin;
  }
  return cmd;
}

class OpenCodeAdapter extends EngineAdapter {
  constructor() {
    super('opencode');
  }

  /**
   * Primer turno: extrae systemContent → AGENTS.md, devuelve solo el userMessage corto.
   * Turnos siguientes (-c): OpenCode ya tiene el contexto en su sesión; solo extraer el
   * mensaje del usuario (el resto es redundante y podría exceder el límite de cmd.exe).
   */
  _resolveCliMessage(prompt, isFirstTurn, cwd) {
    const match = prompt.match(/Mensaje(?:\s+actual)?\s+del\s+usuario:\s*([\s\S]+)$/);
    const userMessage = match ? match[1].trim() : prompt;

    if (isFirstTurn && match) {
      const systemContent = prompt.slice(0, prompt.lastIndexOf(match[0])).trim();
      if (systemContent && cwd) {
        try {
          fs.writeFileSync(path.join(cwd, 'AGENTS.md'), systemContent, 'utf-8');
        } catch (e) {}
      }
    }

    return userMessage;
  }

  buildCommandAndArgs({ userMessage, isFirstTurn }) {
    const isFirst = isFirstTurn !== false;
    const args = isFirst
      ? ['run', '--format', 'json', '--dangerously-skip-permissions', userMessage]
      : ['run', '-c', '--format', 'json', '--dangerously-skip-permissions', userMessage];

    return { command: 'opencode', args };
  }

  spawnTurn({ prompt, session, isFirstTurn, cwd, onStdout, onStderr, onExit, onError, onMetrics }) {
    const userMessage = this._resolveCliMessage(prompt, isFirstTurn !== false, cwd);
    const { command, args } = this.buildCommandAndArgs({ userMessage, isFirstTurn });
    const executable = resolveOpenCodeBinary(command);
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

    let stdoutBuffer = '';

    if (onStdout) {
      child.stdout.on('data', (data) => {
        stdoutBuffer += data.toString('utf-8');
        const lines = stdoutBuffer.split('\n');
        stdoutBuffer = lines.pop(); // conservar fragmento incompleto

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          // Filtrar banners de mise
          if (/^mise\s+.*tools:/i.test(trimmed) || /^opencode@/i.test(trimmed)) continue;

          if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
            try {
              const eventObj = JSON.parse(trimmed);

              if (eventObj.type === 'text' && eventObj.part && eventObj.part.text) {
                onStdout(eventObj.part.text, 'text_delta');
              } else if (eventObj.type === 'step_finish' && eventObj.part && eventObj.part.tokens) {
                const tokens = eventObj.part.tokens;
                if (onMetrics) {
                  onMetrics({
                    engine: 'opencode',
                    sessionId: eventObj.sessionID,
                    cost: eventObj.part.cost,
                    usage: {
                      input_tokens: tokens.input,
                      output_tokens: tokens.output,
                      thinking_tokens: tokens.reasoning || 0,
                      cache_read_tokens: tokens.cache?.read || 0,
                      total_tokens: tokens.total
                    }
                  });
                }
              } else if (eventObj.type === 'tool_use' || eventObj.type === 'tool_call') {
                if (onStderr) {
                  onStderr(`[Tool] ${eventObj.part?.name || 'Ejecutando herramienta...'}`);
                }
              }
              continue;
            } catch (e) {}
          }

          // Si es un log de switch o servidor local (ej. [llama-switch]), redirigir a stderr
          if (/^\[llama-switch\]/i.test(trimmed) || /^\[server\]/i.test(trimmed)) {
            if (onStderr) onStderr(trimmed);
          } else {
            onStdout(trimmed + '\n');
          }
        }
      });
    }

    if (onStderr) {
      child.stderr.on('data', (data) => {
        const text = data.toString('utf-8');
        if (!/^mise\s+.*tools:/i.test(text.trim())) {
          onStderr(text);
        }
      });
    }

    if (onError) {
      child.on('error', onError);
    }

    if (onExit) {
      child.on('close', (code) => {
        if (stdoutBuffer && stdoutBuffer.trim() && onStdout) {
          const trimmed = stdoutBuffer.trim();
          if (!trimmed.startsWith('{') && !/^mise\s+/i.test(trimmed)) {
            onStdout(trimmed);
          }
        }
        onExit(code);
      });
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

module.exports = OpenCodeAdapter;
