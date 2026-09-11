const { spawn, exec } = require('child_process');
const EngineAdapter = require('./engine-adapter');

class AgyAdapter extends EngineAdapter {
  constructor() {
    super('agy');
  }

  buildCommandAndArgs({ prompt, isFirstTurn }) {
    const args = isFirstTurn
      ? ['-p', prompt, '--output-format', 'stream-json', '--dangerously-skip-permissions']
      : ['-c', '-p', prompt, '--output-format', 'stream-json', '--dangerously-skip-permissions'];

    return {
      command: 'agy',
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

          // Ignorar banners de inicialización de herramientas del sistema (ej. mise)
          if (/^mise\s+.*tools:/i.test(trimmed)) continue;

          if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
            try {
              const eventObj = JSON.parse(trimmed);

              if (eventObj.event === 'init') {
                if (session && eventObj.conversation_id) {
                  session.agyConversationId = eventObj.conversation_id;
                }
                if (onMetrics) {
                  onMetrics({
                    engine: 'agy',
                    conversationId: eventObj.conversation_id,
                    model: eventObj.init?.model || 'Gemini 3.x'
                  });
                }
              } else if (eventObj.event === 'step_update') {
                const step = eventObj.step_update;
                if (step) {
                  if (step.text_delta) {
                    onStdout(step.text_delta, 'text_delta');
                  }
                  if (step.usage && onMetrics) {
                    onMetrics({
                      engine: 'agy',
                      conversationId: step.conversation_id,
                      duration_seconds: step.duration_seconds,
                      usage: step.usage
                    });
                  }
                  if (step.step_type === 'tool_call' && onStderr) {
                    onStderr(`[Tool] Ejecutando: ${step.tool_name || 'herramienta'}`);
                  }
                }
              } else if (eventObj.event === 'result') {
                const res = eventObj.result;
                if (res && res.usage && onMetrics) {
                  onMetrics({
                    engine: 'agy',
                    conversationId: res.conversation_id,
                    duration_seconds: res.duration_seconds,
                    usage: res.usage,
                    status: res.status
                  });
                }
              }
              continue;
            } catch (e) {
              // Si no fue JSON parseable, tratar como texto plano
            }
          }

          onStdout(trimmed + '\n');
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
        // Vaciar buffer remanente si existe
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

module.exports = AgyAdapter;
