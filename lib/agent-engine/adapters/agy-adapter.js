const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const EngineAdapter = require('./engine-adapter');
const { resolveInvocation, buildSpawnOptions, useUtf8Streams, killProcessTree } = require('./cli-spawn');

function knownAgyPaths() {
  if (process.platform !== 'win32') return [];
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return [path.join(localAppData, 'agy', 'bin', 'agy.exe')];
}

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
      // Sin shell: el prompt llega intacto (en Windows, shell:true lo parte en palabras e interpreta & | > %)
      const invocation = resolveInvocation(command, args, { envVar: 'AGY_BIN', extraPaths: knownAgyPaths() });
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
                  if (step.step_type === 'tool_call') {
                    const toolName = step.tool_name || 'herramienta';
                    const toolInput = step.tool_input || {};
                    let target = '';
                    if (toolInput.TargetFile) target = path.basename(toolInput.TargetFile);
                    else if (toolInput.AbsolutePath) target = path.basename(toolInput.AbsolutePath);
                    else if (toolInput.SearchPath) target = path.basename(toolInput.SearchPath);
                    else if (toolInput.CommandLine) target = toolInput.CommandLine.substring(0, 40);

                    let activityText = `Ejecutando ${toolName}...`;
                    if (toolName === 'write_to_file') activityText = `Creando ${target || 'archivo'}...`;
                    else if (toolName === 'replace_file_content' || toolName === 'multi_replace_file_content') activityText = `Actualizando ${target || 'archivo'}...`;
                    else if (toolName === 'view_file') activityText = `Leyendo ${target || 'especificaciones'}...`;
                    else if (toolName === 'run_command') activityText = `Ejecutando proceso: ${target || 'comando'}...`;
                    else if (toolName === 'grep_search' || toolName === 'list_dir') activityText = `Inspeccionando directorio...`;

                    if (onStdout) {
                      onStdout(activityText, 'tool_activity');
                    }
                    if (onStderr) {
                      onStderr(`[Tool] ${toolName} ${target}`);
                    }
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
      kill: () => killProcessTree(child)
    };
  }
}

module.exports = AgyAdapter;
