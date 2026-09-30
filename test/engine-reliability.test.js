const assert = require('assert');
const http = require('http');
const { PassThrough } = require('stream');
const { spawn } = require('child_process');
const { AgentEngine, StreamParser } = require('../lib/agent-engine');
const OllamaAdapter = require('../lib/agent-engine/adapters/ollama-adapter');
const LlamaCppAdapter = require('../lib/agent-engine/adapters/llamacpp-adapter');
const { buildSpawnOptions, useUtf8Streams, killProcessTree } = require('../lib/agent-engine/adapters/cli-spawn');

let passedTests = 0;
let totalTests = 0;

async function it(desc, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✓ ${desc}`);
  } catch (err) {
    console.error(`  ✗ ${desc}`);
    console.error(err);
    process.exitCode = 1;
  }
}

// Adaptador programable: cada test decide cómo se comporta el "motor"
class ScriptedAdapter {
  constructor(script) {
    this.script = script;
    this.prompts = [];
    this.killed = false;
  }
  buildCommandAndArgs() {
    return { command: 'scripted', args: [] };
  }
  spawnTurn(params) {
    this.prompts.push(params.prompt);
    this.params = params;
    this.script(params);
    return { kill: () => { this.killed = true; } };
  }
}

function collect(stream) {
  const events = { done: [], error: [], chunks: [] };
  stream.on('done', (d) => events.done.push(d));
  stream.on('error', (e) => events.error.push(e));
  stream.on('chunk', (c) => events.chunks.push(c));
  return events;
}

function tick(ms = 20) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function startServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function runSuite() {
  console.log('\n--- Test Suite: Fiabilidad del motor ---\n');

  console.log('[1] StreamParser:');
  await it('should keep leading spaces and newlines of token-by-token chunks', () => {
    const tokens = ['Hola', ' mundo', '\n\n', '- item'];
    const joined = tokens.map(t => StreamParser.parse(t, 'stdout').text).join('');
    assert.strictEqual(joined, 'Hola mundo\n\n- item');
  });

  await it('should still strip the mise banner and trim what follows it', () => {
    const parsed = StreamParser.parse('mise ~/.config/mise/config.toml tools: node@22\n\nHola', 'stdout');
    assert.strictEqual(parsed.type, 'text_delta');
    assert.strictEqual(parsed.text, 'Hola');
  });

  await it('should treat a full reply that mentions a script as conversation, not tool activity', () => {
    const reply = '### Etapa 1.2\nEjecuté node scripts/extract_reference_dna.cjs sobre la URL.\n\n¿Cuál es el propósito del sitio?';
    const parsed = StreamParser.parse(reply, 'stdout');
    assert.strictEqual(parsed.type, 'text_delta');
    assert.strictEqual(parsed.text, reply);
  });

  await it('should classify a chunk made only of tool lines as tool_activity', () => {
    const parsed = StreamParser.parse('node scripts/compile_showcase.cjs\nWriting state to x.json\n', 'stdout');
    assert.strictEqual(parsed.type, 'tool_activity');
  });

  console.log('\n[2] Adaptadores HTTP (Ollama / llama.cpp):');
  await it('Ollama: token stream keeps whitespace and emits exactly one done', async () => {
    const server = await startServer((req, res) => {
      req.resume();
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
      for (const t of ['Hola', ' mundo', '\n\n', '- item']) {
        res.write(JSON.stringify({ message: { content: t }, done: false }) + '\n');
      }
      res.write(JSON.stringify({ message: { content: '' }, done: true, eval_count: 4, prompt_eval_count: 2 }) + '\n');
      res.end();
    });
    try {
      const engine = new AgentEngine({ defaultEngine: 'ollama-test' });
      engine.registerAdapter('ollama-test', new OllamaAdapter({ host: `http://127.0.0.1:${server.address().port}` }));
      const stream = engine.executeTurn({ sessionId: 'oll', message: 'hola', engine: 'ollama-test' });
      const ev = collect(stream);
      let text = '';
      stream.on('chunk', (c) => { if (c.type === 'text_delta') text += c.text; });
      await tick(150);
      assert.strictEqual(ev.done.length, 1, 'exactly one done event');
      assert.strictEqual(text, 'Hola mundo\n\n- item');
      const session = engine.sessionStore.get('oll');
      assert.strictEqual(session.messages.filter(m => m.role === 'assistant').length, 1, 'reply stored once');
      assert.strictEqual(session.messageCount, 1);
    } finally {
      server.close();
    }
  });

  await it('llama.cpp: [DONE] followed by stream end emits exactly one done', async () => {
    const server = await startServer((req, res) => {
      req.resume();
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      for (const t of ['Uno', ' dos']) {
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`);
      }
      res.write(`data: ${JSON.stringify({ usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 } })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    });
    try {
      const engine = new AgentEngine({ defaultEngine: 'llama-test' });
      engine.registerAdapter('llama-test', new LlamaCppAdapter({ host: `http://127.0.0.1:${server.address().port}` }));
      const stream = engine.executeTurn({ sessionId: 'lla', message: 'hola', engine: 'llama-test' });
      const ev = collect(stream);
      const metrics = [];
      stream.on('metrics', (m) => metrics.push(m));
      let text = '';
      stream.on('chunk', (c) => { if (c.type === 'text_delta') text += c.text; });
      await tick(150);
      assert.strictEqual(ev.done.length, 1);
      assert.strictEqual(text, 'Uno dos');
      assert.strictEqual(metrics.length, 1, 'usage metrics are reported (onMetrics was not wired before)');
    } finally {
      server.close();
    }
  });

  await it('Ollama: non-200 responses fail the turn with a clear error', async () => {
    const server = await startServer((req, res) => {
      req.resume();
      res.writeHead(500);
      res.end('boom');
    });
    try {
      const engine = new AgentEngine({ defaultEngine: 'ollama-test' });
      engine.registerAdapter('ollama-test', new OllamaAdapter({ host: `http://127.0.0.1:${server.address().port}` }));
      const stream = engine.executeTurn({ sessionId: 'oll-500', message: 'hola', engine: 'ollama-test' });
      const ev = collect(stream);
      await tick(150);
      assert.strictEqual(ev.error.length, 1);
      assert(/HTTP 500/.test(ev.error[0].error));
      assert.strictEqual(ev.done.length, 0);
    } finally {
      server.close();
    }
  });

  console.log('\n[3] Ciclo de vida del turno:');
  await it('should emit only the first terminal event when an adapter exits twice', async () => {
    const engine = new AgentEngine();
    engine.registerAdapter('twice', new ScriptedAdapter(({ onStdout, onExit }) => {
      setImmediate(() => { onStdout('Respuesta', 'text_delta'); onExit(0); onExit(0); });
    }));
    const stream = engine.executeTurn({ sessionId: 'twice', message: 'hola', engine: 'twice' });
    const ev = collect(stream);
    await tick();
    assert.strictEqual(ev.done.length, 1);
    assert.strictEqual(engine.sessionStore.get('twice').messages.length, 2);
  });

  await it('should report a non-zero exit without output as an error that includes stderr', async () => {
    const engine = new AgentEngine();
    engine.registerAdapter('fails', new ScriptedAdapter(({ onStderr, onExit }) => {
      setImmediate(() => { onStderr('Not logged in. Run /login'); onExit(1); });
    }));
    const stream = engine.executeTurn({ sessionId: 'fails', message: 'hola', engine: 'fails' });
    const ev = collect(stream);
    await tick();
    assert.strictEqual(ev.done.length, 0);
    assert.strictEqual(ev.error.length, 1);
    assert(ev.error[0].error.includes('código 1'));
    assert(ev.error[0].error.includes('Not logged in'));
  });

  await it('should not count a failed first turn, so the retry sends the activation prompt again', async () => {
    const engine = new AgentEngine();
    let attempt = 0;
    const adapter = new ScriptedAdapter(({ onStdout, onExit, onError }) => {
      attempt++;
      setImmediate(() => {
        if (attempt === 1) return onError(new Error('spawn claude ENOENT'));
        onStdout('Listo', 'text_delta');
        onExit(0);
      });
    });
    engine.registerAdapter('flaky', adapter);

    const first = engine.executeTurn({ sessionId: 'flaky', message: 'Acme', engine: 'flaky' });
    const ev1 = collect(first);
    await tick();
    assert.strictEqual(ev1.error.length, 1);
    assert.strictEqual(engine.sessionStore.get('flaky').engineTurnCount.flaky, 0);
    assert.strictEqual(engine.sessionStore.get('flaky').isExecuting, false, 'lock released after failure');

    const second = engine.executeTurn({ sessionId: 'flaky', message: 'Acme', engine: 'flaky' });
    collect(second);
    await tick();
    assert(adapter.prompts[1].includes('17. MANEJO DE DESVÍOS'), 'retry must carry the full activation prompt');
    assert.strictEqual(engine.sessionStore.get('flaky').engineTurnCount.flaky, 1);
  });

  await it('should not persist or emit anything after an explicit cancel, even if the process reports exit', async () => {
    const engine = new AgentEngine();
    const adapter = new ScriptedAdapter(() => {});
    engine.registerAdapter('hang', adapter);
    const stream = engine.executeTurn({ sessionId: 'hang', message: 'hola', engine: 'hang' });
    const ev = collect(stream);

    adapter.params.onStdout('Respuesta parcial', 'text_delta');
    stream.kill();
    assert.strictEqual(adapter.killed, true);
    adapter.params.onExit(null);
    await tick();

    assert.strictEqual(ev.done.length, 0);
    assert.strictEqual(ev.error.length, 0);
    const session = engine.sessionStore.get('hang');
    assert.strictEqual(session.messages.length, 0, 'partial reply must not be stored');
    assert.strictEqual(session.pendingStep, undefined);
    assert.strictEqual(session.isExecuting, false);
    assert.strictEqual(engine.isBusy(), false);
  });

  await it('should abort the turn with a clear error when TURN_TIMEOUT_MS is exceeded', async () => {
    const engine = new AgentEngine({ turnTimeoutMs: 30 });
    const adapter = new ScriptedAdapter(() => {});
    engine.registerAdapter('slow', adapter);
    const stream = engine.executeTurn({ sessionId: 'slow', message: 'hola', engine: 'slow' });
    const ev = collect(stream);
    await tick(100);
    assert.strictEqual(ev.error.length, 1);
    assert(/tiempo máximo/.test(ev.error[0].error));
    assert.strictEqual(adapter.killed, true);
    assert.strictEqual(engine.sessionStore.get('slow').isExecuting, false);
  });

  await it('should surface a synchronous spawn failure as a clean, typed exception', () => {
    const engine = new AgentEngine();
    engine.registerAdapter('nobin', new ScriptedAdapter(({ onError }) => onError(new Error('spawn nobin ENOENT'))));
    assert.throws(
      () => engine.executeTurn({ sessionId: 'nobin', message: 'hola', engine: 'nobin' }),
      (err) => err.code === 'SPAWN_FAILED' && err.message === 'spawn nobin ENOENT'
    );
    assert.strictEqual(engine.sessionStore.get('nobin').isExecuting, false);
  });

  await it('should reject unknown engines without taking the session lock', () => {
    const engine = new AgentEngine();
    assert.throws(
      () => engine.executeTurn({ sessionId: 'x', message: 'hola', engine: 'inexistente' }),
      (err) => err.code === 'UNKNOWN_ENGINE'
    );
    assert.strictEqual(engine.sessionStore.has('x'), false);
  });

  await it('should tag concurrent turns with a BUSY error code', () => {
    const engine = new AgentEngine();
    engine.registerAdapter('busy', new ScriptedAdapter(() => {}));
    engine.executeTurn({ sessionId: 'b', message: 'uno', engine: 'busy' });
    assert.throws(
      () => engine.executeTurn({ sessionId: 'b', message: 'dos', engine: 'busy' }),
      (err) => err.code === 'BUSY'
    );
    engine.cancelAll();
    assert.strictEqual(engine.isBusy(), false);
    assert.strictEqual(engine.sessionStore.get('b').isExecuting, false);
  });

  console.log('\n[4] Procesos hijo:');
  await it('useUtf8Streams should keep multibyte characters split across chunks', async () => {
    const child = { stdout: new PassThrough(), stderr: new PassThrough() };
    useUtf8Streams(child);
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    const bytes = Buffer.from('¿Cuál es tu acción?', 'utf-8');
    // Corta justo en medio de un carácter de 2 bytes
    child.stdout.write(bytes.subarray(0, 2));
    child.stdout.write(bytes.subarray(2));
    child.stdout.end();
    await tick(10);
    assert.strictEqual(out, '¿Cuál es tu acción?');
  });

  await it('killProcessTree should terminate a running child process', async () => {
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], buildSpawnOptions(process.cwd()));
    const closed = new Promise((resolve) => child.once('close', resolve));
    await tick(150);
    killProcessTree(child, { graceMs: 500 });
    await Promise.race([
      closed,
      new Promise((_, reject) => setTimeout(() => reject(new Error('child was not terminated')), 5000))
    ]);
  });

  console.log(`\n========================================`);
  console.log(`Summary: ${passedTests}/${totalTests} tests passed.`);
  console.log(`========================================\n`);

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runSuite();
