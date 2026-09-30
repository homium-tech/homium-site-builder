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
const { buildActivationPrompt, buildTurnPrompt } = require('../../core/prompts/system-rules');
const MessageHeuristics = require('../../core/text/message-heuristics');

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
  constructor({ cwd = null, defaultEngine = 'claude', turnTimeoutMs = null } = {}) {
    this.cwd = cwd || Workspace.resolveDefaultDir();
    this.defaultEngine = defaultEngine;
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

  /** @returns {boolean} true si hay algún turno en ejecución (en cualquier sesión) */
  isBusy() {
    return this.activeStreams.size > 0;
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
      const statePath = require('path').join(this.cwd, 'design-system-state.json');
      if (require('fs').existsSync(statePath)) {
        try {
          const raw = require('fs').readFileSync(statePath, 'utf-8').replace(/^﻿/, '');
          const state = JSON.parse(raw);
          const compactState = JSON.stringify(state, null, 0);
          jsonStateBlock = `\n\nESTADO ACTUAL EN DISCO (design-system-state.json — decisiones confirmadas hasta ahora):\n${compactState}\n`;
        } catch (e) {}
      }

      promptText = buildTurnPrompt(message, {
        workspaceDir: this.cwd,
        jsonStateBlock,
        pendingStep: effectivePendingStep,
        lastExchange: this.sessionStore.getLastExchange(session.id)
      });
    }

    const startTime = Date.now();
    let turnProcessHandle = null;
    let accumulatedResponse = '';
    let stderrTail = '';
    let finished = false;
    let timeoutTimer = null;

    // Cierra el turno una sola vez: libera el candado y deja de rastrear el stream
    const finishTurn = () => {
      finished = true;
      if (timeoutTimer) clearTimeout(timeoutTimer);
      releaseLock();
      this.activeStreams.delete(stream);
    };

    const stream = new TurnStream(() => {
      finishTurn();
      if (turnProcessHandle && typeof turnProcessHandle.kill === 'function') {
        turnProcessHandle.kill();
      }
    });
    stream.sessionId = session.id;
    this.activeStreams.add(stream);

    const failTurn = (errorMessage) => {
      if (finished) return;
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
          stream.pushEvent({
            name: 'metrics',
            data: metrics
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
          stream.pushEvent({
            name: 'done',
            data: { code: code ?? 0, durationMs }
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
