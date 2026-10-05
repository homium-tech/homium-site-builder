const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const EngineAdapter = require('./engine-adapter');
const { resolveInvocation, buildSpawnOptions, useUtf8Streams, killProcessTree } = require('./cli-spawn');

function knownOpenCodePaths() {
  if (process.platform !== 'win32') return [];
  // Preferir el binario instalado via npm (versión más reciente); cli-spawn resuelve el shim .cmd al .exe real
  return [path.join(
    process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
    'npm', 'opencode.cmd'
  )];
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
    let child;

    try {
      // Sin shell: el prompt llega intacto (en Windows, shell:true lo parte en palabras e interpreta & | > %)
      const invocation = resolveInvocation(command, args, { envVar: 'OPENCODE_BIN', extraPaths: knownOpenCodePaths() });
      child = spawn(invocation.file, invocation.args, buildSpawnOptions(cwd));
      useUtf8Streams(child);
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
                    cost_usd: eventObj.part.cost,
                    call_id: eventObj.part.id,
                    usage: {
                      input_tokens: tokens.input,
                      output_tokens: tokens.output,
                      thinking_tokens: tokens.reasoning || 0,
                      cache_read_tokens: tokens.cache?.read || 0,
                      cache_write_tokens: tokens.cache?.write || 0,
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
      kill: () => killProcessTree(child)
    };
  }
}

module.exports = OpenCodeAdapter;
