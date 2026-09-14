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
    const isGlobalFirstTurn = session.messageCount === 0;
    const isFirstTurnForEngine = (session.engineTurnCount && (session.engineTurnCount[engineType] || 0) === 0);
    this.sessionStore.incrementTurn(session.id, engineType);

    const adapter = this.getAdapter(engineType);
    if (!adapter) {
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
      promptText = `[DIRECTIVA HOMIUM: Operas de forma autónoma sin skills externas. Tono 100% neutral, sobrio y pragmático. Prohibido usar frases de adulación o cortesía artificial ("excelente elección/decisión/trabajo", "perfecto", "me encanta"). Comienza directo con la estructura técnica o el paso siguiente. El proceso consta de 5 fases canónicas estrictas y finaliza definitivamente en la Fase 5 con el prototipo vanilla HTML/CSS/JS. PROHIBIDO invocar una Fase 6 o frameworks externos (Astro/Next.js). Workspace: ${this.cwd}]. Mensaje del usuario: ${message}`;
    }

    const startTime = Date.now();
    let turnProcessHandle = null;

    const stream = new TurnStream(() => {
      if (turnProcessHandle && typeof turnProcessHandle.kill === 'function') {
        turnProcessHandle.kill();
      }
    });
    stream.sessionId = session.id;

    // Invocación a través de la costura del adaptador
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
        const durationMs = Date.now() - startTime;
        stream.pushEvent({
          name: 'done',
          data: { code: code ?? 0, durationMs }
        });
      },
      onError: (err) => {
        stream.pushEvent({
          name: 'error',
          data: { error: err.message }
        });
      }
    });

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
