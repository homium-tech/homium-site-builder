const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const SessionStore = require('./session-store');
const StreamParser = require('./stream-parser');
const ClaudeAdapter = require('./adapters/claude-adapter');
const AgyAdapter = require('./adapters/agy-adapter');
const CodexAdapter = require('./adapters/codex-adapter');
const OpenCodeAdapter = require('./adapters/opencode-adapter');
const LlamaCppAdapter = require('./adapters/llamacpp-adapter');
const OllamaAdapter = require('./adapters/ollama-adapter');
const MockAdapter = require('./adapters/mock-adapter');
const { buildActivationPrompt, buildTurnPrompt, buildStateDigest } = require('../../core/prompts/system-rules');
const MessageHeuristics = require('../../core/text/message-heuristics');
const { TurnUsage } = require('../telemetry');

/**
 * TurnStream — Flujo reactivo de eventos producido durante un turno
 */
class TurnStream extends EventEmitter {
  constructor(cancelFn) {
    super();
    this.cancelFn = cancelFn;
    this.isCompleted = false;
    this.cancelled = false;
    this.queue = [];
    this.resolvers = [];
  }

  pushEvent(event) {
    // Tras el cierre (done/error) o una cancelación explícita no se emite nada más:
    // el primer evento terminal gana y evita respuestas duplicadas o parciales.
    if (this.isCompleted || this.cancelled) return;

    if (event.name === 'error' && this.listenerCount('error') === 0) {
      // Fallo síncrono antes de que alguien escuche (p. ej. el ejecutable no existe): EventEmitter lanzaría
      // una excepción opaca; se conserva para que executeTurn la relance con un mensaje limpio.
      this.failure = event.data;
    } else {
      this.emit(event.name, event.data);
    }

    if (this.resolvers.length > 0) {
      const resolve = this.resolvers.shift();
      resolve({ value: event, done: false });
    } else {
      this.queue.push(event);
    }

    if (event.name === 'done' || event.name === 'error') {
      this.isCompleted = true;
      while (this.resolvers.length > 0) {
        const resolve = this.resolvers.shift();
        resolve({ value: undefined, done: true });
      }
    }
  }

  /**
   * Cancelación explícita: termina el subproceso y descarta cualquier evento posterior
   * (no se persiste respuesta parcial ni se avanza el paso pendiente).
   */
  kill() {
    this.cancelled = true;
    if (typeof this.cancelFn === 'function') {
      this.cancelFn();
    }
    this.isCompleted = true;
    while (this.resolvers.length > 0) {
      const resolve = this.resolvers.shift();
      resolve({ value: undefined, done: true });
    }
    this.emit('cancelled');
  }

  /**
   * Encapsula la canalización completa del flujo de eventos hacia una respuesta HTTP Server-Sent Events (SSE).
   * Gestiona cabeceras, serialización de eventos, acumulación de texto para transformación final
   * y un latido periódico que evita que proxies/túneles cierren la conexión por inactividad.
   *
   * Si el cliente se desconecta, el turno NO se mata por defecto: termina, y `transformDone`
   * sigue ejecutándose para persistir la respuesta (el cliente la recupera al reconectar).
   *
   * @param {import('http').ServerResponse} res - Objeto de respuesta HTTP de Node / Express
   * @param {Object} [options]
   * @param {Function} [options.transformDone] - Función opcional (doneData, fullText) => transformedDoneData
   * @param {number} [options.heartbeatMs=15000] - Intervalo del comentario SSE `: ping` (0 lo desactiva)
   * @param {boolean} [options.killOnClose=false] - Matar el subproceso si el cliente se desconecta
   * @returns {TurnStream} this
   */
  pipeToSSE(res, { transformDone, heartbeatMs = 15000, killOnClose = false } = {}) {
    if (!res || typeof res.write !== 'function') {
      throw new Error('TurnStream.pipeToSSE requiere un objeto ServerResponse válido');
    }

    // Cabeceras estándar para SSE si no han sido enviadas
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      // Evita que nginx u otros proxies acumulen la respuesta en buffer
      res.setHeader('X-Accel-Buffering', 'no');
      if (typeof res.flushHeaders === 'function') {
        res.flushHeaders();
      }
    }

    let clientGone = false;
    let heartbeat = null;
    const canWrite = () => !clientGone && !res.writableEnded && !res.destroyed;

    const stopHeartbeat = () => {
      if (heartbeat) {
        clearInterval(heartbeat);
        heartbeat = null;
      }
    };

    if (heartbeatMs > 0) {
      heartbeat = setInterval(() => {
        if (canWrite()) res.write(': ping\n\n');
      }, heartbeatMs);
      if (typeof heartbeat.unref === 'function') heartbeat.unref();
    }

    const sendEvent = (event, data) => {
      if (canWrite()) {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      }
    };

    let accumulatedText = '';

    this.on('chunk', (data) => {
      if (data && data.type === 'text_delta' && data.text) {
        accumulatedText += data.text;
      } else if (data && data.type === 'reset') {
        accumulatedText = accumulatedText.slice(0, data.keep || 0);
      }
      sendEvent('chunk', data);
    });

    this.on('metrics', (data) => {
      sendEvent('metrics', data);
    });

    this.on('done', (data) => {
      stopHeartbeat();
      let finalData = data;
      if (typeof transformDone === 'function') {
        try {
          finalData = transformDone(data, accumulatedText);
        } catch (err) {
          console.error('[TurnStream] Error en transformDone:', err.message);
        }
      }
      sendEvent('done', finalData);
      if (!res.writableEnded) {
        res.end();
      }
    });

    this.on('error', (err) => {
      stopHeartbeat();
      const errorPayload = { error: err.error || err.message || String(err) };
      sendEvent('error', errorPayload);
      if (!res.writableEnded) {
        res.end();
      }
    });

    // Cancelación explícita: se informa al cliente y se cierra la respuesta (no hay 'done' ni 'error')
    this.on('cancelled', () => {
      stopHeartbeat();
      sendEvent('cancelled', {});
      if (!res.writableEnded) {
        res.end();
      }
    });

    // Desconexión del cliente (p. ej. corte del túnel): el turno continúa salvo que se pida lo contrario
    const onClose = () => {
      clientGone = true;
      stopHeartbeat();
      if (killOnClose && !res.writableEnded && !this.isCompleted) {
        this.kill();
      }
    };
    res.on('close', onClose);

    return this;
  }

  [Symbol.asyncIterator]() {
    return {
      next: () => {
        if (this.queue.length > 0) {
          const event = this.queue.shift();
          return Promise.resolve({
            value: event,
            done: false
          });
        }
        if (this.isCompleted) {
          return Promise.resolve({ value: undefined, done: true });
        }
        return new Promise((resolve) => {
          this.resolvers.push(resolve);
        });
      }
    };
  }
}

const Workspace = require('../workspace');

/**
 * AgentEngine — Módulo profundo de orquestación conversacional
 */
class AgentEngine {
  constructor({ cwd = null, defaultEngine = 'claude', turnTimeoutMs = null, turnLogger = null } = {}) {
    this.cwd = cwd || Workspace.resolveDefaultDir();
    this.defaultEngine = defaultEngine;
    // Registro de turnos: función (registro, carpetaDelProyecto) llamada una vez al cerrar cada turno (done / error / cancelled)
    this.turnLogger = typeof turnLogger === 'function' ? turnLogger : null;
    this.sessionStore = new SessionStore();
    this.adapters = new Map();
    this.activeStreams = new Set();
    // Tiempo máximo por turno (ms). 0 = sin límite (comportamiento por defecto); configurable con TURN_TIMEOUT_MS
    this.turnTimeoutMs = turnTimeoutMs != null
      ? turnTimeoutMs
      : (parseInt(process.env.TURN_TIMEOUT_MS, 10) || 0);

    // Registrar adaptadores integrados por defecto (CLIs locales y APIs de servidor)
    this.registerAdapter('claude', new ClaudeAdapter());
    this.registerAdapter('agy', new AgyAdapter());
    this.registerAdapter('codex', new CodexAdapter());
    this.registerAdapter('opencode', new OpenCodeAdapter());
    this.registerAdapter('llamacpp', new LlamaCppAdapter());
    this.registerAdapter('ollama', new OllamaAdapter());
    this.registerAdapter('mock', new MockAdapter());
  }

  setCwd(newCwd) {
    this.cwd = newCwd;
    return this;
  }

  registerAdapter(name, adapter) {
    this.adapters.set(name, adapter);
  }

  getAdapter(name) {
    return this.adapters.get(name) || this.adapters.get(this.defaultEngine);
  }

  hasAdapter(name) {
    return this.adapters.has(name);
  }

  /**
   * @param {string} [sessionId] Si se indica, solo cuenta el turno de esa sesión
   * @returns {boolean} true si hay un turno en ejecución
   */
  isBusy(sessionId = null) {
    if (!sessionId) return this.activeStreams.size > 0;
    for (const stream of this.activeStreams) {
      if (stream.sessionId === sessionId) return true;
    }
    return false;
  }

  /** Cancela todos los turnos activos (reset del proyecto, apagado del servidor) */
  cancelAll() {
    for (const stream of [...this.activeStreams]) {
      stream.kill();
    }
  }

  getOrCreateSession(sessionId, engine) {
    return this.sessionStore.getOrCreate(sessionId, engine || this.defaultEngine);
  }

  resetSession(sessionId) {
    return this.sessionStore.reset(sessionId);
  }

  /**
   * Ejecuta un turno conversacional.
   * @param {Object} params
   * @param {string} params.sessionId
   * @param {string} params.message
   * @param {string} [params.engine]
   * @param {string} [params.pendingStep] Última pregunta del flujo aún sin responder (p. ej. leída del historial en disco)
   * @returns {TurnStream}
   */
  executeTurn({ sessionId, message, engine, pendingStep = null }) {
    const engineType = engine || this.defaultEngine;

    const adapter = this.adapters.get(engineType);
    if (!adapter) {
      const err = new Error(`Adaptador de motor no reconocido: "${engineType}"`);
      err.code = 'UNKNOWN_ENGINE';
      throw err;
    }

    const session = this.sessionStore.getOrCreate(sessionId, engineType);

    if (session.isExecuting) {
      const err = new Error(`Ya hay un turno en ejecución para la sesión "${session.id}". Espera a que termine.`);
      err.code = 'BUSY';
      throw err;
    }
    session.isExecuting = true;

    const releaseLock = () => {
      session.isExecuting = false;
    };

    const isGlobalFirstTurn = session.messageCount === 0;
    const isFirstTurnForEngine = (session.engineTurnCount && (session.engineTurnCount[engineType] || 0) === 0);

    // Refuerzo para activar la identidad y reglas canónicas con confinamiento de workspace
    let promptText = message;
    const effectivePendingStep = pendingStep || session.pendingStep || '';

    if (isFirstTurnForEngine) {
      promptText = buildActivationPrompt(message, { workspaceDir: this.cwd, pendingStep: effectivePendingStep });
      if (!isGlobalFirstTurn) {
        promptText += `\n[NOTA DE CONTEXTO: El usuario cambió al motor ${engineType} en el turno ${session.messageCount}. Continúa guiando el proceso con fidelidad arquitectónica en el espacio de trabajo ${this.cwd} para la solicitud actual: "${message}"]`;
      }
    } else {
      // --- Hybrid context: JSON state (structured) + last exchange (positional) ---
      let jsonStateBlock = '';
      const statePath = path.join(this.cwd, 'design-system-state.json');
      if (fs.existsSync(statePath)) {
        try {
          const raw = fs.readFileSync(statePath, 'utf-8').replace(/^﻿/, '');
          // Solo un resumen: el JSON completo puede pesar decenas de KB y viajaría en cada turno por argv
          jsonStateBlock = buildStateDigest(JSON.parse(raw));
        } catch (e) {
          // Un JSON ilegible no puede omitirse en silencio: el agente debe repararlo antes de seguir
          jsonStateBlock = '\n\nAVISO: design-system-state.json existe pero no es JSON válido (posible escritura interrumpida). Revísalo y repáralo antes de continuar.\n';
        }
      }

      promptText = buildTurnPrompt(message, {
        workspaceDir: this.cwd,
        jsonStateBlock,
        pendingStep: effectivePendingStep,
        lastExchange: this.sessionStore.getLastExchange(session.id)
      });
    }

    const startTime = Date.now();
    const turnDir = this.cwd; // el proyecto activo puede cambiar mientras el turno corre: el registro va al de origen
    let turnProcessHandle = null;
    let accumulatedResponse = '';
    let stderrTail = '';
    let finished = false;
    let timeoutTimer = null;
    let resets = 0;
    let turnLogged = false;
    const turnUsage = new TurnUsage(engineType);

    // Un registro por turno (sin contenido de la conversación: solo métricas y el error)
    const logTurn = (outcome, error = null) => {
      if (turnLogged || !this.turnLogger) return;
      turnLogged = true;
      try {
        const telemetry = turnUsage.snapshot();
        this.turnLogger({
          at: new Date().toISOString(),
          sessionId: session.id,
          engine: engineType,
          outcome,
          durationMs: Date.now() - startTime,
          promptChars: promptText.length,
          responseChars: accumulatedResponse.length,
          resets,
          error: error ? String(error).slice(0, 300) : null,
          // Uso de tokens (también de un turno fallido: gastó igual). contextTokens = lo enviado al modelo en su última llamada
          model: telemetry?.model || null,
          usage: telemetry?.usage || null,
          contextTokens: telemetry?.context_tokens ?? null,
          contextWindow: telemetry?.context_window ?? null,
          costUsd: telemetry?.cost_usd ?? null
        }, turnDir);
      } catch (err) {
        console.warn('[AgentEngine] No se pudo registrar el turno:', err.message);
      }
    };

    // Cierra el turno una sola vez: libera el candado y deja de rastrear el stream
    const finishTurn = () => {
      finished = true;
      if (timeoutTimer) clearTimeout(timeoutTimer);
      releaseLock();
      this.activeStreams.delete(stream);
    };

    const stream = new TurnStream(() => {
      if (!finished) logTurn('cancelled');
      finishTurn();
      if (turnProcessHandle && typeof turnProcessHandle.kill === 'function') {
        turnProcessHandle.kill();
      }
    });
    stream.sessionId = session.id;
    this.activeStreams.add(stream);

    const failTurn = (errorMessage) => {
      if (finished) return;
      logTurn('error', errorMessage);
      finishTurn();
      stream.pushEvent({ name: 'error', data: { error: errorMessage } });
    };

    if (this.turnTimeoutMs > 0) {
      timeoutTimer = setTimeout(() => {
        const seconds = Math.round(this.turnTimeoutMs / 1000);
        failTurn(`El motor ${engineType} superó el tiempo máximo de ${seconds}s y se detuvo.`);
        if (turnProcessHandle && typeof turnProcessHandle.kill === 'function') {
          turnProcessHandle.kill();
        }
      }, this.turnTimeoutMs);
      if (typeof timeoutTimer.unref === 'function') timeoutTimer.unref();
    }

    // Invocación a través de la costura del adaptador
    try {
      turnProcessHandle = adapter.spawnTurn({
        prompt: promptText,
        session,
        isFirstTurn: isFirstTurnForEngine,
        cwd: this.cwd,
        onStdout: (chunkText, forcedType) => {
          let type = forcedType;
          let text = chunkText;
          if (!type) {
            const parsed = StreamParser.parse(chunkText, 'stdout');
            type = parsed.type;
            text = parsed.text;
          }
          if (type === 'reset' || type === 'discard') {
            // El motor descartó texto: `text` es la cantidad de caracteres de la respuesta que se conservan.
            // 'reset' = un intento abortado que el motor reintentó; 'discard' = narración previa a una herramienta (no es un reintento)
            const keep = Math.max(0, parseInt(text, 10) || 0);
            if (type === 'reset') resets++;
            accumulatedResponse = accumulatedResponse.slice(0, keep);
            stream.pushEvent({ name: 'chunk', data: { type: 'reset', keep, text: '' } });
            return;
          }
          if (type === 'text_delta' && text) {
            accumulatedResponse += text;
          }
          stream.pushEvent({
            name: 'chunk',
            data: {
              type, // 'text_delta' o 'tool_activity'
              text,
              raw: chunkText
            }
          });
        },
        onStderr: (chunkText) => {
          const parsed = StreamParser.parse(chunkText, 'stderr');
          stderrTail = (stderrTail + parsed.text).slice(-600);
          stream.pushEvent({
            name: 'chunk',
            data: {
              type: 'log',
              text: parsed.text,
              raw: parsed.raw
            }
          });
        },
        onMetrics: (metrics) => {
          // Al cliente va el acumulado del turno (tokens, contexto en uso, ventana), no solo el último evento del motor
          turnUsage.add(metrics);
          stream.pushEvent({
            name: 'metrics',
            data: { ...metrics, ...(turnUsage.snapshot() || {}), engine: metrics.engine || engineType }
          });
        },
        onExit: (code) => {
          if (finished) return;
          const hasResponse = Boolean(accumulatedResponse.trim());
          const failedExit = code === null || (code !== undefined && code !== 0);

          // Salida anómala sin respuesta utilizable: es un error del motor, no un turno completado
          if (failedExit && !hasResponse) {
            const reason = code === null
              ? `El motor ${engineType} se interrumpió antes de responder.`
              : `El motor ${engineType} terminó con código ${code} sin responder.`;
            const detail = StreamParser.stripAnsi(stderrTail).trim();
            failTurn(detail ? `${reason}\n${detail}` : reason);
            return;
          }

          finishTurn();
          if (hasResponse) {
            // Solo un turno exitoso cuenta: si falló, el reintento vuelve a enviar el prompt de activación
            this.sessionStore.incrementTurn(session.id, engineType);
            this.sessionStore.addMessage(session.id, 'user', message);
            this.sessionStore.addMessage(session.id, 'assistant', accumulatedResponse);
            // Un desvío respondido sin título de Etapa/Fase no reemplaza la pregunta pendiente
            if (MessageHeuristics.isFlowMessage(accumulatedResponse)) {
              session.pendingStep = accumulatedResponse;
            }
          }
          const durationMs = Date.now() - startTime;
          logTurn('done');
          stream.pushEvent({
            name: 'done',
            data: { code: code ?? 0, durationMs, engine: engineType, resets }
          });
        },
        onError: (err) => {
          failTurn(err.message);
        }
      });
    } catch (err) {
      if (!finished) finishTurn();
      throw err;
    }

    // El adaptador falló de forma síncrona (p. ej. ejecutable inexistente) antes de que hubiera oyentes
    if (stream.failure) {
      const err = new Error(stream.failure.error);
      err.code = 'SPAWN_FAILED';
      throw err;
    }

    return stream;
  }
}

module.exports = {
  AgentEngine,
  TurnStream,
  StreamParser,
  SessionStore,
  ClaudeAdapter,
  AgyAdapter,
  MockAdapter
};
