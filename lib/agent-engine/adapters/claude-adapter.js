const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const EngineAdapter = require('./engine-adapter');
const { resolveInvocation, buildSpawnOptions, useUtf8Streams, killProcessTree } = require('./cli-spawn');

function knownClaudePaths() {
  if (process.platform !== 'win32') return [];
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return [
    path.join(localAppData, 'Programs', 'Claude', 'claude.exe'),
    path.join(os.homedir(), '.local', 'bin', 'claude.exe')
  ];
}

/** Tokens de la API de Anthropic → nombres de la telemetría (la caché no va dentro de input_tokens) */
function mapUsage(usage) {
  const u = usage || {};
  return {
    input_tokens: u.input_tokens || 0,
    output_tokens: u.output_tokens || 0,
    thinking_tokens: u.output_tokens_details?.thinking_tokens || 0,
    cache_read_tokens: u.cache_read_input_tokens || 0,
    cache_write_tokens: u.cache_creation_input_tokens || 0
  };
}

/**
 * Interpreta el stream-json de `claude -p`. La respuesta que se entrega es la del evento `result`
 * (el texto final, igual que con la salida de texto plano: lo que el agente dice entre herramientas no cuenta).
 * De los demás eventos sale la telemetría: el modelo, el uso de cada llamada (= contexto en uso) y,
 * en el `result`, el acumulado del turno con su costo y la ventana de contexto del modelo.
 */
class ClaudeEventTracker {
  constructor({ onStdout, onStderr, onMetrics } = {}) {
    this.onStdout = onStdout;
    this.onStderr = onStderr;
    this.onMetrics = onMetrics;
    this.model = null;
  }

  _metrics(data) {
    if (this.onMetrics) this.onMetrics({ engine: 'claude', ...data });
  }

  _setModel(model) {
    // Los mensajes sintéticos (p. ej. un error de API) traen "<synthetic>" en lugar de un modelo
    if (model && !String(model).startsWith('<')) this.model = model;
  }

  /** @returns {boolean} true si la línea era un evento JSON (ya procesado) */
  handleLine(trimmed) {
    if (!(trimmed.startsWith('{') && trimmed.endsWith('}'))) return false;
    let ev;
    try {
      ev = JSON.parse(trimmed);
    } catch (e) {
      return false;
    }

    if (ev.type === 'system' && ev.subtype === 'init') {
      this._setModel(ev.model);
      if (this.model) this._metrics({ model: this.model });
    } else if (ev.type === 'assistant' && ev.message && !ev.parent_tool_use_id) {
      // Una llamada al modelo (cada bloque de contenido repite el mismo message.id y usage)
      this._setModel(ev.message.model);
      if (ev.message.usage) {
        this._metrics({ model: this.model, call_id: ev.message.id, usage: mapUsage(ev.message.usage) });
      }
    } else if (ev.type === 'result') {
      this._handleResult(ev);
    }
    // Todo evento con `type` se consume (hooks, rate limits, herramientas…): solo el texto que no es JSON es respuesta
    return typeof ev.type === 'string';
  }

  _handleResult(ev) {
    const byModel = ev.modelUsage || {};
    const entry = (this.model && byModel[this.model]) || Object.values(byModel)[0] || null;
    if (ev.usage) {
      this._metrics({
        scope: 'turn',
        model: this.model,
        usage: mapUsage(ev.usage),
        cost_usd: ev.total_cost_usd,
        duration_seconds: ev.duration_ms != null ? +(ev.duration_ms / 1000).toFixed(3) : undefined,
        context_window: entry?.contextWindow
      });
    }

    const text = typeof ev.result === 'string' ? ev.result : '';
    if (!text) return;
    if (ev.is_error) {
      // Un error del motor (crédito, límite, sesión) no es una respuesta: viaja por stderr para que el turno falle con su mensaje
      if (this.onStderr) this.onStderr(text);
    } else if (this.onStdout) {
      this.onStdout(text);
    }
  }
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
        '--output-format', 'stream-json',
        '--verbose',
        '--dangerously-skip-permissions'
      ]
    };
  }

  spawnTurn({ prompt, session, isFirstTurn, cwd, onStdout, onStderr, onExit, onError, onMetrics }) {
    const { command, args } = this.buildCommandAndArgs({ prompt, session, isFirstTurn });
    let child;

    try {
      // Sin shell: el prompt llega intacto (en Windows, shell:true lo parte en palabras e interpreta & | > %)
      const invocation = resolveInvocation(command, args, { envVar: 'CLAUDE_BIN', extraPaths: knownClaudePaths() });
      child = spawn(invocation.file, invocation.args, buildSpawnOptions(cwd));
      useUtf8Streams(child);
    } catch (err) {
      if (onError) onError(err);
      return { kill: () => {} };
    }

    let stdoutBuffer = '';
    const tracker = new ClaudeEventTracker({ onStdout, onStderr, onMetrics });

    const processLine = (line) => {
      const trimmed = line.trim();
      if (!trimmed || tracker.handleLine(trimmed)) return;
      // Texto que no es un evento (un banner, una versión que ignora el formato): se trata como respuesta
      if (onStdout) onStdout(trimmed + '\n');
    };

    child.stdout.on('data', (data) => {
      stdoutBuffer += data.toString('utf-8');
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop(); // conservar fragmento incompleto
      for (const line of lines) processLine(line);
    });
    if (onStderr) {
      child.stderr.on('data', (data) => onStderr(data.toString('utf-8')));
    }
    if (onError) {
      child.on('error', onError);
    }
    child.on('close', (code) => {
      // El evento `result` puede llegar sin salto de línea final
      if (stdoutBuffer.trim()) {
        const remaining = stdoutBuffer;
        stdoutBuffer = '';
        processLine(remaining);
      }
      if (onExit) onExit(code);
    });

    return {
      kill: () => killProcessTree(child)
    };
  }
}

ClaudeAdapter.ClaudeEventTracker = ClaudeEventTracker;

module.exports = ClaudeAdapter;
