const assert = require('assert');
const path = require('path');
const {
  AgentEngine,
  TurnStream,
  StreamParser,
  SessionStore,
  ClaudeAdapter,
  AgyAdapter,
  MockAdapter
} = require('../lib/agent-engine');

let passedTests = 0;
let totalTests = 0;

function it(desc, fn) {
  totalTests++;
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result.then(() => {
        passedTests++;
        console.log(`  ✓ ${desc}`);
      }).catch((err) => {
        console.error(`  ✗ ${desc}`);
        console.error(err);
        process.exitCode = 1;
      });
    }
    passedTests++;
    console.log(`  ✓ ${desc}`);
  } catch (err) {
    console.error(`  ✗ ${desc}`);
    console.error(err);
    process.exitCode = 1;
  }
}

async function runSuite() {
  console.log('\n--- Test Suite: AgentEngine & Subsystems ---\n');

  // 1. SessionStore Tests
  console.log('[1] SessionStore:');
  it('should create and retrieve a session with default values', () => {
    const store = new SessionStore();
    const session = store.getOrCreate(null, 'claude');
    assert(session.id, 'Session ID should exist');
    assert.strictEqual(session.engine, 'claude');
    assert.strictEqual(session.messageCount, 0);

    const retrieved = store.get(session.id);
    assert.strictEqual(retrieved.id, session.id);
  });

  it('should increment turn count and update timestamp', () => {
    const store = new SessionStore();
    const session = store.getOrCreate('test-session-1', 'agy');
    assert.strictEqual(session.messageCount, 0);

    store.incrementTurn('test-session-1');
    assert.strictEqual(session.messageCount, 1);
    assert(session.updatedAt >= session.createdAt);
  });

  it('should reset (delete) an existing session', () => {
    const store = new SessionStore();
    store.getOrCreate('session-to-delete', 'claude');
    assert(store.has('session-to-delete'));

    store.reset('session-to-delete');
    assert(!store.has('session-to-delete'));
  });

  it('should track per-engine turns when switching engines', () => {
    const store = new SessionStore();
    const s1 = store.getOrCreate('multi-engine-session', 'opencode');
    store.incrementTurn('multi-engine-session', 'opencode');
    assert.strictEqual(s1.engineTurnCount['opencode'], 1);

    // Cambiar a agy en el siguiente turno
    const s2 = store.getOrCreate('multi-engine-session', 'agy');
    assert.strictEqual(s2.engine, 'agy');
    assert.strictEqual(s2.engineTurnCount['agy'], 0); // primer turno para agy
    store.incrementTurn('multi-engine-session', 'agy');
    assert.strictEqual(s2.engineTurnCount['agy'], 1);
    assert.strictEqual(s2.messageCount, 2);
  });

  // 2. StreamParser Tests
  console.log('\n[2] StreamParser:');
  it('should strip ANSI escape sequences accurately', () => {
    const rawAnsi = '\u001b[32mTexto en Verde\u001b[0m y \u001b[1;34mNegrita Azul\u001b[0m';
    const stripped = StreamParser.stripAnsi(rawAnsi);
    assert.strictEqual(stripped, 'Texto en Verde y Negrita Azul');
  });

  it('should classify conversational chunks as text_delta', () => {
    const parsed = StreamParser.parse('Hola, ¿cuál es el nombre de tu marca?', 'stdout');
    assert.strictEqual(parsed.type, 'text_delta');
    assert.strictEqual(parsed.text, 'Hola, ¿cuál es el nombre de tu marca?');
  });

  it('should classify script/tool invocations as tool_activity', () => {
    const toolLogs = [
      'node scripts/extract_reference_dna.cjs --url https://homium.com',
      'Playwright browser launched for extraction',
      'Writing state to design-system-state.json'
    ];
    for (const log of toolLogs) {
      const parsed = StreamParser.parse(log, 'stdout');
      assert.strictEqual(parsed.type, 'tool_activity', `Failed for: ${log}`);
    }
  });

  it('should classify stderr as log', () => {
    const parsed = StreamParser.parse('aviso interno de warning', 'stderr');
    assert.strictEqual(parsed.type, 'log');
  });

  it('should filter out mise preamble and classify environment tool banners as tool_activity', () => {
    const miseOutput = 'mise ~/.config/mise/config.toml tools: opencode@1.18.25';
    const parsed = StreamParser.parse(miseOutput, 'stdout');
    assert.strictEqual(parsed.type, 'tool_activity');
  });

  // 3. Adapter Command & Arg Generation Tests
  console.log('\n[3] Adapters:');
  it('ClaudeAdapter should build correct CLI command and args', () => {
    const adapter = new ClaudeAdapter();
    const config = adapter.buildCommandAndArgs({
      prompt: 'Hola Claude',
      session: { id: 'sess-abc-123' }
    });
    assert.strictEqual(config.command, 'claude');
    assert(config.args.includes('-p'));
    assert(config.args.includes('Hola Claude'));
    // --session-id se eliminó a propósito (conflicto de lock entre turnos): no debe volver a aparecer
    assert(!config.args.includes('--session-id'));
    assert(config.args.includes('--dangerously-skip-permissions'));
  });

  it('AgyAdapter should build correct args for first turn vs subsequent turns', () => {
    const adapter = new AgyAdapter();
    const firstTurn = adapter.buildCommandAndArgs({
      prompt: 'Prompt 1',
      isFirstTurn: true
    });
    assert.strictEqual(firstTurn.command, 'agy');
    assert.deepStrictEqual(firstTurn.args, ['-p', 'Prompt 1', '--output-format', 'stream-json', '--dangerously-skip-permissions']);

    const secondTurn = adapter.buildCommandAndArgs({
      prompt: 'Prompt 2',
      isFirstTurn: false
    });
    assert.deepStrictEqual(secondTurn.args, ['-c', '-p', 'Prompt 2', '--output-format', 'stream-json', '--dangerously-skip-permissions']);
  });

  // 4. AgentEngine End-to-End with MockAdapter
  console.log('\n[4] AgentEngine Execution with MockAdapter:');
  await it('should execute turn and stream typed events via EventEmitter', async () => {
    const engine = new AgentEngine({ defaultEngine: 'mock' });
    const eventsReceived = [];

    const stream = engine.executeTurn({
      sessionId: 'mock-session-test',
      message: 'Inicia la marca Homium',
      engine: 'mock'
    });

    await new Promise((resolve, reject) => {
      stream.on('chunk', (chunk) => {
        eventsReceived.push(chunk);
      });
      stream.on('done', (doneData) => {
        assert(doneData.durationMs >= 0);
        assert.strictEqual(doneData.code, 0);
        resolve();
      });
      stream.on('error', reject);
    });

    assert(eventsReceived.length >= 3, `Expected at least 3 events, got ${eventsReceived.length}`);
    // Check that we have both text_delta and tool_activity events
    const hasTextDelta = eventsReceived.some(e => e.type === 'text_delta');
    const hasToolActivity = eventsReceived.some(e => e.type === 'tool_activity');
    assert(hasTextDelta, 'Should contain text_delta chunk');
    assert(hasToolActivity, 'Should contain tool_activity chunk');
  });

  await it('should support AsyncIterable consumption for TurnStream', async () => {
    const engine = new AgentEngine({ defaultEngine: 'mock' });
    const stream = engine.executeTurn({
      sessionId: 'mock-session-async',
      message: 'Test async iterable',
      engine: 'mock'
    });

    const collected = [];
    for await (const event of stream) {
      collected.push(event);
    }

    assert(collected.length >= 3, `AsyncIterable should yield events (got ${collected.length})`);
    assert(collected.some(e => e.name === 'chunk'));
    assert(collected.some(e => e.name === 'done'));
  });

  await it('should terminate cleanly on stream.kill()', async () => {
    const engine = new AgentEngine({ defaultEngine: 'mock' });
    const stream = engine.executeTurn({
      sessionId: 'mock-session-kill',
      message: 'Prueba de kill',
      engine: 'mock'
    });

    stream.on('chunk', () => {
      stream.kill();
    });

    // Pequeña espera para constatar que se detuvo
    await new Promise(r => setTimeout(r, 60));
    assert.strictEqual(stream.isCompleted, true);
  });

  // 5. TurnStream.pipeToSSE Deep SSE Encapsulation
  console.log('\n[5] TurnStream.pipeToSSE Canal Profundo SSE:');
  await it('should pipe events to SSE response with headers, formatting and transformDone', async () => {
    const engine = new AgentEngine({ defaultEngine: 'mock' });
    const stream = engine.executeTurn({
      sessionId: 'test-sse-session',
      message: 'Hola mundo mock SSE',
      engine: 'mock'
    });

    const writtenChunks = [];
    const headers = {};
    let ended = false;

    const mockRes = {
      headersSent: false,
      writableEnded: false,
      setHeader: (k, v) => { headers[k] = v; },
      flushHeaders: () => {},
      write: (str) => { writtenChunks.push(str); },
      end: () => { mockRes.writableEnded = true; ended = true; },
      on: (evt, cb) => {}
    };

    stream.pipeToSSE(mockRes, {
      transformDone: (doneData, fullText) => ({
        ...doneData,
        transformed: true,
        fullTextLength: fullText.length
      })
    });

    await new Promise((resolve) => {
      stream.on('done', resolve);
    });

    assert.strictEqual(headers['Content-Type'], 'text/event-stream');
    assert.strictEqual(headers['Cache-Control'], 'no-cache');
    assert.strictEqual(ended, true);

    const fullOutput = writtenChunks.join('');
    assert(fullOutput.includes('event: chunk'));
    assert(fullOutput.includes('event: done'));
    assert(fullOutput.includes('"transformed":true'));
  });

  function makeCloseableRes() {
    const res = {
      headersSent: false,
      writableEnded: false,
      writes: [],
      closeHandler: null,
      setHeader: () => {},
      flushHeaders: () => {},
      write: (s) => { res.writes.push(s); },
      end: () => { res.writableEnded = true; },
      on: (evt, cb) => {
        if (evt === 'close') res.closeHandler = cb;
      }
    };
    return res;
  }

  await it('should keep the turn running and still run transformDone if the client disconnects (tunnel drop)', async () => {
    const engine = new AgentEngine({ defaultEngine: 'mock' });
    const stream = engine.executeTurn({
      sessionId: 'test-sse-close',
      message: 'Prueba desconexión cliente',
      engine: 'mock'
    });

    const mockRes = makeCloseableRes();
    let transformed = null;
    stream.pipeToSSE(mockRes, { transformDone: (data, fullText) => { transformed = fullText; return data; } });

    assert(typeof mockRes.closeHandler === 'function', 'Must register close event listener on response');
    mockRes.closeHandler(); // Corte de conexión del cliente
    assert.strictEqual(stream.isCompleted, false, 'The turn must not be killed on client disconnect');

    await new Promise((resolve) => stream.on('done', resolve));
    assert(transformed && transformed.length > 0, 'transformDone must run so the reply can be persisted');
    assert.strictEqual(mockRes.writes.length, 0, 'Nothing is written to a disconnected client');
  });

  await it('should kill the process on client disconnect only when killOnClose is requested', async () => {
    const engine = new AgentEngine({ defaultEngine: 'mock' });
    const stream = engine.executeTurn({
      sessionId: 'test-sse-close-kill',
      message: 'Prueba desconexión con kill',
      engine: 'mock'
    });

    const mockRes = makeCloseableRes();
    stream.pipeToSSE(mockRes, { killOnClose: true });
    mockRes.closeHandler();

    assert.strictEqual(stream.isCompleted, true);
    assert.strictEqual(stream.cancelled, true);
  });

  await it('should send SSE heartbeat comments while the turn is silent and stop after done', async () => {
    const engine = new AgentEngine({ defaultEngine: 'mock' });
    const stream = engine.executeTurn({
      sessionId: 'test-sse-heartbeat',
      message: 'Prueba latido',
      engine: 'mock'
    });

    const mockRes = makeCloseableRes();
    stream.pipeToSSE(mockRes, { heartbeatMs: 5 });
    await new Promise((resolve) => stream.on('done', resolve));
    assert(mockRes.writes.some(w => w === ': ping\n\n'), 'Expected at least one heartbeat ping');
    const pingsAtDone = mockRes.writes.filter(w => w === ': ping\n\n').length;
    await new Promise(r => setTimeout(r, 30));
    assert.strictEqual(mockRes.writes.filter(w => w === ': ping\n\n').length, pingsAtDone, 'Heartbeat must stop after done');
  });

  await it('should prevent concurrent turns on the same session via isExecuting mutex', async () => {
    const engine = new AgentEngine({ defaultEngine: 'mock' });
    const stream1 = engine.executeTurn({
      sessionId: 'test-concurrency-session',
      message: 'Primer turno en paralelo',
      engine: 'mock'
    });

    assert.throws(() => {
      engine.executeTurn({
        sessionId: 'test-concurrency-session',
        message: 'Segundo turno concurrente',
        engine: 'mock'
      });
    }, /Ya hay un turno en ejecución/);

    await new Promise((resolve) => stream1.on('done', resolve));

    const stream2 = engine.executeTurn({
      sessionId: 'test-concurrency-session',
      message: 'Tercer turno secuencial',
      engine: 'mock'
    });
    await new Promise((resolve) => stream2.on('done', resolve));
    assert.strictEqual(stream2.isCompleted, true);
  });

  console.log(`\n========================================`);
  console.log(`Summary: ${passedTests}/${totalTests} tests passed.`);
  console.log(`========================================\n`);

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runSuite();
