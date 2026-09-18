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
const { buildActivationPrompt } = require('../../core/prompts/system-rules');

/**
 * TurnStream — Flujo reactivo de eventos producido durante un turno
 */
class TurnStream extends EventEmitter {
  constructor(cancelFn) {
    super();
    this.cancelFn = cancelFn;
    this.isCompleted = false;
    this.queue = [];
    this.resolvers = [];
  }

  pushEvent(event) {
    if (this.isCompleted && event.name !== 'done' && event.name !== 'error') return;

    this.emit(event.name, event.data);

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

  kill() {
    if (typeof this.cancelFn === 'function') {
      this.cancelFn();
    }
    this.isCompleted = true;
  }

  /**
   * Encapsula la canalización completa del flujo de eventos hacia una respuesta HTTP Server-Sent Events (SSE).
   * Gestiona cabeceras, serialización de eventos, acumulación de texto para transformación final,
   * y liberación limpia del subproceso si el cliente se desconecta anticipadamente.
   *
   * @param {import('http').ServerResponse} res - Objeto de respuesta HTTP de Node / Express
   * @param {Object} [options]
   * @param {Function} [options.transformDone] - Función opcional (doneData, fullText) => transformedDoneData
   * @returns {TurnStream} this
   */
  pipeToSSE(res, { transformDone } = {}) {
    if (!res || typeof res.write !== 'function') {
      throw new Error('TurnStream.pipeToSSE requiere un objeto ServerResponse válido');
    }

    // Cabeceras estándar para SSE si no han sido enviadas
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      if (typeof res.flushHeaders === 'function') {
        res.flushHeaders();
      }
    }

    const sendEvent = (event, data) => {
      if (!res.writableEnded) {
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
      const finalData = typeof transformDone === 'function'
        ? transformDone(data, accumulatedText)
        : data;
      sendEvent('done', finalData);
      if (!res.writableEnded) {
        res.end();
      }
    });

    this.on('error', (err) => {
      const errorPayload = { error: err.error || err.message || String(err) };
      sendEvent('error', errorPayload);
      if (!res.writableEnded) {
        res.end();
      }
    });

    // Desconexión prematura del cliente: liberar el subproceso automáticamente
    const onClose = () => {
      if (!res.writableEnded && !this.isCompleted) {
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
  constructor({ cwd = null, defaultEngine = 'claude' } = {}) {
    this.cwd = cwd || Workspace.resolveDefaultDir();
    this.defaultEngine = defaultEngine;
    this.sessionStore = new SessionStore();
    this.adapters = new Map();

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
   * @returns {TurnStream}
   */
  executeTurn({ sessionId, message, engine }) {
    const engineType = engine || this.defaultEngine;
    const session = this.sessionStore.getOrCreate(sessionId, engineType);

    if (session.isExecuting) {
      throw new Error(`Ya hay un turno en ejecución para la sesión "${session.id}". Espera a que termine.`);
    }
    session.isExecuting = true;

    const releaseLock = () => {
      session.isExecuting = false;
    };

    const isGlobalFirstTurn = session.messageCount === 0;
    const isFirstTurnForEngine = (session.engineTurnCount && (session.engineTurnCount[engineType] || 0) === 0);
    this.sessionStore.incrementTurn(session.id, engineType);

    const adapter = this.getAdapter(engineType);
    if (!adapter) {
      releaseLock();
      throw new Error(`Adaptador de motor no reconocido: "${engineType}"`);
    }

    // Refuerzo para activar la identidad y reglas canónicas con confinamiento de workspace
    let promptText = message;

    if (isFirstTurnForEngine) {
      promptText = buildActivationPrompt(message, { workspaceDir: this.cwd });
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

      const lastExchange = this.sessionStore.getLastExchange(session.id);
      const lastExchangeBlock = lastExchange
        ? `\n\nÚLTIMO INTERCAMBIO (posición exacta en el flujo):\n${lastExchange}\n`
        : '';

      promptText = `[DIRECTIVA HOMIUM: Operas de forma autónoma sin skills externas. Tono 100% neutral, sobrio y pragmático. Prohibido frases de adulación. 5 fases canónicas, termina en Fase 5 con prototipo vanilla HTML/CSS/JS. PROHIBIDO Fase 6 o frameworks externos. Single-Question Rule: UNA sola pregunta por turno. Workspace: ${this.cwd}]${jsonStateBlock}${lastExchangeBlock}\nMensaje actual del usuario: ${message}`;
    }

    // Store user message before executing the turn
    this.sessionStore.addMessage(session.id, 'user', message);

    const startTime = Date.now();
    let turnProcessHandle = null;
    let accumulatedResponse = '';

    const stream = new TurnStream(() => {
      releaseLock();
      if (turnProcessHandle && typeof turnProcessHandle.kill === 'function') {
        turnProcessHandle.kill();
      }
    });
    stream.sessionId = session.id;

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
          releaseLock();
          if (accumulatedResponse) {
            this.sessionStore.addMessage(session.id, 'assistant', accumulatedResponse);
          }
          const durationMs = Date.now() - startTime;
          stream.pushEvent({
            name: 'done',
            data: { code: code ?? 0, durationMs }
          });
        },
        onError: (err) => {
          releaseLock();
          stream.pushEvent({
            name: 'error',
            data: { error: err.message }
          });
        }
      });
    } catch (err) {
      releaseLock();
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
