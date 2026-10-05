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

// Caracteres que se comparan para decidir si un intento nuevo repite el texto del intento abortado
const RESTART_PROBE_CHARS = 24;

/**
 * Interpreta los eventos stream-json de agy de un turno.
 *
 * Cuando el stream del modelo se interrumpe, agy emite un paso `error_message`, reintenta la
 * generación desde cero (el texto vuelve a empezar) y termina con exit code 0 pero con
 * `result.status === 'ERROR'`. Sin este control, los intentos abortados se concatenan en la
 * respuesta (Blueprint duplicado, texto cortado) y el turno se da por bueno.
 *
 * - Un intento que reaparece tras un error y repite el inicio del abortado emite `reset`
 *   (texto = cantidad de caracteres de la respuesta que se conservan) para descartar el abortado.
 * - Si el turno termina en ERROR sin una respuesta completa, `finish()` lo marca como incompleto.
 */
class AgyEventTracker {
  constructor({ onStdout, onStderr, onMetrics, session, isFirstTurn = false } = {}) {
    this.onStdout = onStdout;
    this.onStderr = onStderr;
    this.onMetrics = onMetrics;
    this.session = session;
    this.isFirstTurn = isFirstTurn;

    this.text = '';              // texto de la respuesta emitido hasta ahora (tras los reset)
    this.attemptStart = null;    // offset donde empezó el intento en curso (null: sin texto desde el último corte)
    this.aborted = null;         // { text, start } del último intento interrumpido por un error
    this.pending = '';           // texto del intento nuevo retenido hasta decidir si repite al abortado
    this.errorSinceText = false; // hubo un error y desde entonces no llegó texto
    this.lastAgentDone = true;   // el último paso agent_response llegó a DONE
    this.lastAgentIndex = null;
    this.result = null;
  }

  /** @returns {boolean} true si la línea era un evento JSON de agy (ya procesado) */
  handleLine(trimmed) {
    if (!(trimmed.startsWith('{') && trimmed.endsWith('}'))) return false;
    let eventObj;
    try {
      eventObj = JSON.parse(trimmed);
    } catch (e) {
      return false;
    }

    if (eventObj.event === 'init') {
      if (this.session && eventObj.conversation_id) {
        this.session.agyConversationId = eventObj.conversation_id;
      }
      if (this.onMetrics) {
        this.onMetrics({
          engine: 'agy',
          conversationId: eventObj.conversation_id,
          model: eventObj.init?.model || 'Gemini 3.x'
        });
      }
    } else if (eventObj.event === 'step_update') {
      if (eventObj.step_update) this._handleStep(eventObj.step_update);
    } else if (eventObj.event === 'result') {
      const res = eventObj.result;
      this.result = res || null;
      if (res && this.onMetrics) {
        const usage = this._turnUsage(res.usage);
        this.onMetrics({
          engine: 'agy',
          conversationId: res.conversation_id,
          duration_seconds: res.duration_seconds,
          ...(usage ? { usage, scope: 'turn' } : {}),
          status: res.status
        });
      }
    }
    return true;
  }

  /**
   * El `usage` del evento result de agy es el acumulado de TODA la conversación (con -c cada turno suma al anterior),
   * no el del turno: el gasto de este turno es la diferencia con el acumulado que dejó el turno previo.
   * Sin acumulado previo conocido (el servidor se reinició a mitad de conversación) no hay diferencia fiable: se omite
   * y el turno cuenta solo con el uso de sus pasos.
   */
  _turnUsage(cumulative) {
    if (!cumulative) return null;
    const session = this.session;
    if (!session) return cumulative;
    const base = this.isFirstTurn ? {} : session.agyUsageTotal;
    session.agyUsageTotal = cumulative;
    if (!base) return null;
    const delta = {};
    for (const key of Object.keys(cumulative)) {
      delta[key] = Math.max(0, (Number(cumulative[key]) || 0) - (Number(base[key]) || 0));
    }
    return delta;
  }

  _handleStep(step) {
    if (step.step_type === 'agent_response') {
      if (step.step_index !== this.lastAgentIndex) {
        this.lastAgentIndex = step.step_index;
        this.lastAgentDone = false;
      }
      if (step.text_delta) this._pushText(step.text_delta);
      if (step.state === 'DONE') this.lastAgentDone = true;
    } else if (step.text_delta) {
      this._pushText(step.text_delta);
    }

    if (step.step_type === 'error_message') {
      this._resolvePending(true);
      if (this.attemptStart !== null) {
        this.aborted = { text: this.text.slice(this.attemptStart), start: this.attemptStart };
        this.attemptStart = null;
      }
      this.errorSinceText = true;
    } else if (step.step_type === 'tool_call') {
      // Una herramienta marca un corte: el texto posterior continúa la respuesta, no la reinicia
      this._resolvePending(true);
      this.aborted = null;
      this.attemptStart = null;
    }

    if (step.usage && this.onMetrics) {
      this.onMetrics({
        engine: 'agy',
        conversationId: step.conversation_id,
        duration_seconds: step.duration_seconds,
        usage: step.usage,
        call_id: step.step_index
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

      if (this.onStdout) this.onStdout(activityText, 'tool_activity');
      if (this.onStderr) this.onStderr(`[Tool] ${toolName} ${target}`);
    }
  }

  _pushText(delta) {
    this.errorSinceText = false;
    if (this.aborted) {
      // Tras un error: retener el inicio del intento nuevo hasta saber si repite el abortado
      this.pending += delta;
      this._resolvePending(false);
      return;
    }
    this._emit(delta);
  }

  _resolvePending(force) {
    if (!this.aborted) return;
    const abortedHead = this.aborted.text.trim();
    const pendingHead = this.pending.trimStart();
    const need = Math.min(abortedHead.length, RESTART_PROBE_CHARS);
    if (!force && pendingHead.length < need) return;

    const { start } = this.aborted;
    const probe = pendingHead.slice(0, need);
    const isRestart = need > 0 && probe.length > 0 && abortedHead.startsWith(probe);
    this.aborted = null;

    if (isRestart) {
      this.text = this.text.slice(0, start);
      if (this.onStdout) this.onStdout(String(start), 'reset');
    }
    const buffered = this.pending;
    this.pending = '';
    if (buffered) this._emit(buffered);
  }

  _emit(delta) {
    if (this.attemptStart === null) this.attemptStart = this.text.length;
    this.text += delta;
    if (this.onStdout) this.onStdout(delta, 'text_delta');
  }

  /**
   * Cierra el turno.
   * @returns {{ incomplete: boolean, error: string|null, warning: string|null }}
   */
  finish() {
    this._resolvePending(true);
    const res = this.result;
    if (!res || res.status !== 'ERROR') return { incomplete: false, error: null, warning: null };

    const reason = res.error || 'el motor devolvió status ERROR';
    const hasText = this.text.trim().length > 0;
    if (!hasText || this.errorSinceText || !this.lastAgentDone) {
      return { incomplete: true, error: reason, warning: null };
    }
    // Hubo errores internos pero el último intento terminó: se acepta y se deja constancia
    return { incomplete: false, error: null, warning: `[agy] El stream se interrumpió y se reintentó: ${reason}` };
  }
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
    const tracker = new AgyEventTracker({ onStdout, onStderr, onMetrics, session, isFirstTurn });

    // Procesa una línea de stdout; devuelve true si se consumió como evento
    const processLine = (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      // Ignorar banners de inicialización de herramientas del sistema (ej. mise)
      if (/^mise\s+.*tools:/i.test(trimmed)) return;

      if (tracker.handleLine(trimmed)) return;
      if (onStdout) onStdout(trimmed + '\n');
    };

    if (onStdout) {
      child.stdout.on('data', (data) => {
        stdoutBuffer += data.toString('utf-8');
        const lines = stdoutBuffer.split('\n');
        stdoutBuffer = lines.pop(); // conservar fragmento incompleto
        for (const line of lines) processLine(line);
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

    child.on('close', (code) => {
      // Vaciar buffer remanente si existe (el evento `result` puede llegar sin salto de línea final)
      if (stdoutBuffer && stdoutBuffer.trim() && onStdout) {
        const remaining = stdoutBuffer.trim();
        stdoutBuffer = '';
        if (remaining.startsWith('{')) {
          tracker.handleLine(remaining);
        } else if (!/^mise\s+/i.test(remaining)) {
          onStdout(remaining);
        }
      }

      // agy puede salir con código 0 aunque el stream se haya interrumpido: el turno no está completo
      const outcome = tracker.finish();
      if (outcome.incomplete) {
        if (onError) onError(new Error(`agy interrumpió la respuesta antes de terminar (${outcome.error}). Reenvía el mensaje.`));
        return;
      }
      if (outcome.warning && onStderr) onStderr(outcome.warning);
      if (onExit) onExit(code);
    });

    return {
      kill: () => killProcessTree(child)
    };
  }
}

AgyAdapter.AgyEventTracker = AgyEventTracker;

module.exports = AgyAdapter;
