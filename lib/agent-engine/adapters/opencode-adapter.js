const { spawn, exec } = require('child_process');
const EngineAdapter = require('./engine-adapter');

class OpenCodeAdapter extends EngineAdapter {
  constructor() {
    super('opencode');
  }

  buildCommandAndArgs({ prompt, isFirstTurn }) {
    const isFirst = isFirstTurn !== false;
    const args = isFirst
      ? ['run', '--auto', '--format', 'json', prompt]
      : ['run', '-c', '--auto', '--format', 'json', prompt];

    return {
      command: 'opencode',
      args
    };
  }

  spawnTurn({ prompt, session, isFirstTurn, cwd, onStdout, onStderr, onExit, onError, onMetrics }) {
    const { command, args } = this.buildCommandAndArgs({ prompt, session, isFirstTurn });
    let child;

    try {
      child = spawn(command, args, {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: process.platform === 'win32',
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
