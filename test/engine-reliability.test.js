const assert = require('assert');
const http = require('http');
const { PassThrough } = require('stream');
const { spawn } = require('child_process');
const { AgentEngine, StreamParser } = require('../lib/agent-engine');
const OllamaAdapter = require('../lib/agent-engine/adapters/ollama-adapter');
const LlamaCppAdapter = require('../lib/agent-engine/adapters/llamacpp-adapter');
const AgyAdapter = require('../lib/agent-engine/adapters/agy-adapter');
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
    const parsed = StreamParser.parse('node scripts/compile_design_system.cjs\nWriting state to x.json\n', 'stdout');
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

  console.log('\n[3b] agy: stream interrumpido y reintentos:');
  const { AgyEventTracker } = AgyAdapter;
  const agyStep = (step) => JSON.stringify({ event: 'step_update', step_update: { conversation_id: 'c1', ...step } });
  const agyResult = (result) => JSON.stringify({ event: 'result', result: { conversation_id: 'c1', ...result } });
  const agyText = (index, text, state = 'ACTIVE') => agyStep({ step_index: index, step_type: 'agent_response', state, text_delta: text });
  const agyError = (index) => agyStep({ step_index: index, step_type: 'error_message', state: 'DONE' });

  // Reproduce lo que hace el motor con los chunks: acumula text_delta y aplica reset
  function runAgy(lines) {
    let text = '';
    const resets = [];
    const discards = [];
    const tracker = new AgyEventTracker({
      onStdout: (chunk, type) => {
        if (type === 'text_delta') text += chunk;
        if (type === 'reset') { resets.push(Number(chunk)); text = text.slice(0, Number(chunk)); }
        if (type === 'discard') { discards.push(Number(chunk)); text = text.slice(0, Number(chunk)); }
      }
    });
    for (const line of lines) tracker.handleLine(line);
    const outcome = tracker.finish();
    return { text, resets, discards, outcome };
  }

  await it('should keep a clean turn untouched', () => {
    const r = runAgy([agyText(1, '> **Blueprint**\n'), agyText(1, 'Pregunta final', 'DONE'), agyResult({ status: 'SUCCESS' })]);
    assert.strictEqual(r.text, '> **Blueprint**\nPregunta final');
    assert.deepStrictEqual(r.resets, []);
    assert.strictEqual(r.outcome.incomplete, false);
    assert.strictEqual(r.outcome.warning, null);
  });

  await it('should discard aborted attempts that restart the same text and keep the last one', () => {
    const r = runAgy([
      agyText(1, '> **Blueprint — Estado actual**\n> - Marca: Devin\n', 'DONE'),
      agyError(2),
      agyText(3, '> **Blueprint — Estado actual**\n'),
      agyText(3, '> - Marca: Devin\n#### Etapa 3.4: Motion Tokens', 'DONE'),
      agyResult({ status: 'SUCCESS' })
    ]);
    assert.strictEqual(r.text, '> **Blueprint — Estado actual**\n> - Marca: Devin\n#### Etapa 3.4: Motion Tokens');
    assert.deepStrictEqual(r.resets, [0]);
    assert.strictEqual(r.outcome.incomplete, false);
  });

  const agyTool = (index, name = 'view_file') => agyStep({ step_index: index, step_type: 'tool_call', state: 'DONE', tool_name: name, tool_input: { AbsolutePath: 'C:\\x\\a.md' } });

  await it('should still discard an aborted attempt that restarts after the narration before a tool was dropped', () => {
    const r = runAgy([
      agyText(1, 'Texto previo. ', 'DONE'),
      agyTool(2),
      agyText(3, 'Intento que se corta aqui y es largo', 'DONE'),
      agyError(4),
      agyText(5, 'Intento que se corta aqui y es largo, ahora completo.', 'DONE'),
      agyResult({ status: 'SUCCESS' })
    ]);
    assert.strictEqual(r.text, 'Intento que se corta aqui y es largo, ahora completo.');
    assert.deepStrictEqual(r.discards, [0], 'la narración previa a la herramienta se descarta');
    assert.deepStrictEqual(r.resets, [0], 'el intento abortado cuenta como reintento del motor');
  });

  await it('should drop the narration before a tool call and keep only the text that follows the last one', () => {
    const r = runAgy([
      agyText(1, 'Ejecutando la extracción. Un momento…', 'DONE'),
      agyTool(2),
      agyText(3, 'Esperando la finalización.', 'DONE'),
      agyTool(4, 'run_command'),
      agyText(5, '> **Blueprint**\nPregunta final', 'DONE'),
      agyResult({ status: 'SUCCESS' })
    ]);
    assert.strictEqual(r.text, '> **Blueprint**\nPregunta final');
    assert.deepStrictEqual(r.discards, [0, 0], 'un descarte por cada tramo de narración');
    assert.deepStrictEqual(r.resets, [], 'no es un reintento del motor');
    assert.strictEqual(r.outcome.incomplete, false);
  });

  await it('should fall back to the last discarded segment when the turn ends right after a tool call', () => {
    const r = runAgy([
      agyText(1, 'Primer aviso.', 'DONE'),
      agyTool(2),
      agyText(3, 'Respuesta completa con la pregunta final', 'DONE'),
      agyTool(4, 'write_to_file'),
      agyTool(5, 'write_to_file'),
      agyResult({ status: 'SUCCESS' })
    ]);
    assert.strictEqual(r.text, 'Respuesta completa con la pregunta final', 'consecutive tool calls do not erase the segment kept as fallback');
    assert.strictEqual(r.outcome.incomplete, false);
  });

  await it('should keep a turn that only ran tools and said nothing as empty, not invent text', () => {
    const r = runAgy([agyTool(1), agyTool(2), agyResult({ status: 'SUCCESS' })]);
    assert.strictEqual(r.text, '');
    assert.deepStrictEqual(r.discards, []);
  });

  await it('should still count a turn as complete when it ERRORs after the narration was dropped but a segment exists', () => {
    const r = runAgy([
      agyText(1, 'Respuesta que se escribió antes de guardar el estado', 'DONE'),
      agyTool(2, 'write_to_file'),
      agyResult({ status: 'ERROR', error: 'The stream was interrupted.' })
    ]);
    assert.strictEqual(r.text, 'Respuesta que se escribió antes de guardar el estado');
    assert.strictEqual(r.outcome.incomplete, false);
  });

  await it('should treat text after an error as a continuation when it does not repeat the aborted one', () => {
    const r = runAgy([
      agyText(1, 'Primera parte del analisis. ', 'DONE'),
      agyError(2),
      agyText(3, 'Continuo con otra cosa distinta.', 'DONE'),
      agyResult({ status: 'SUCCESS' })
    ]);
    assert.strictEqual(r.text, 'Primera parte del analisis. Continuo con otra cosa distinta.');
    assert.deepStrictEqual(r.resets, []);
  });

  await it('should flag the turn as incomplete when it ends in ERROR right after an aborted attempt', () => {
    const r = runAgy([
      agyText(1, 'Un token de diseño es la unidad atómica mínima\n', 'DONE'),
      agyError(2),
      agyResult({ status: 'ERROR', error: 'The stream was interrupted. Please continue the task you were working on.' })
    ]);
    assert.strictEqual(r.outcome.incomplete, true);
    assert(r.outcome.error.includes('stream was interrupted'));
  });

  await it('should flag the turn as incomplete when the last attempt never finished', () => {
    const r = runAgy([
      agyText(1, '> **Blueprint — Estado actual**\n> - Marca:'),
      agyResult({ status: 'ERROR', error: 'The stream was interrupted.' })
    ]);
    assert.strictEqual(r.outcome.incomplete, true);
  });

  await it('should flag an ERROR result without any text as incomplete', () => {
    const r = runAgy([agyResult({ status: 'ERROR', error: 'boom' })]);
    assert.strictEqual(r.outcome.incomplete, true);
  });

  await it('should accept a finished last attempt even if the result says ERROR, with a warning', () => {
    const r = runAgy([
      agyText(1, 'Un token de diseño es la unidad', 'DONE'),
      agyError(2),
      agyText(3, 'Un token de diseño es la unidad mínima de decisión visual.\n', 'DONE'),
      agyResult({ status: 'ERROR', error: 'The stream was interrupted.' })
    ]);
    assert.strictEqual(r.text, 'Un token de diseño es la unidad mínima de decisión visual.\n');
    assert.strictEqual(r.outcome.incomplete, false);
    assert(/reintent/.test(r.outcome.warning));
  });

  await it('engine: a discard chunk trims the reply like a reset but is not reported as an engine retry', async () => {
    const engine = new AgentEngine();
    engine.registerAdapter('discard', new ScriptedAdapter(({ onStdout, onExit }) => {
      setImmediate(() => {
        onStdout('Voy a leer el archivo…', 'text_delta');
        onStdout('0', 'discard');
        onStdout('Respuesta final', 'text_delta');
        onExit(0);
      });
    }));
    const stream = engine.executeTurn({ sessionId: 'discard', message: 'hola', engine: 'discard' });
    const ev = collect(stream);
    await tick();
    assert.strictEqual(ev.done.length, 1);
    assert.strictEqual(ev.done[0].resets, 0, 'descartar narración no es un reintento del motor');
    const stored = engine.sessionStore.get('discard').messages.filter(m => m.role === 'assistant');
    assert.strictEqual(stored[0].content, 'Respuesta final');
    assert.deepStrictEqual(ev.chunks.filter(c => c.type === 'reset').map(c => c.keep), [0], 'el cliente recibe el recorte como un reset');
  });

  await it('engine: a reset chunk trims the stored reply and the SSE text, and an incomplete agy turn is an error', async () => {
    const engine = new AgentEngine();
    engine.registerAdapter('resets', new ScriptedAdapter(({ onStdout, onExit }) => {
      setImmediate(() => {
        onStdout('Intento abortado', 'text_delta');
        onStdout('0', 'reset');
        onStdout('Respuesta final', 'text_delta');
        onExit(0);
      });
    }));
    const stream = engine.executeTurn({ sessionId: 'resets', message: 'hola', engine: 'resets' });
    const ev = collect(stream);
    await tick();
    assert.strictEqual(ev.done.length, 1);
    const stored = engine.sessionStore.get('resets').messages.filter(m => m.role === 'assistant');
    assert.strictEqual(stored.length, 1);
    assert.strictEqual(stored[0].content, 'Respuesta final');
    const resetChunks = ev.chunks.filter(c => c.type === 'reset');
    assert.deepStrictEqual(resetChunks.map(c => c.keep), [0]);

    const failing = new AgentEngine();
    failing.registerAdapter('agy-fail', new ScriptedAdapter(({ onStdout, onError }) => {
      setImmediate(() => {
        onStdout('Texto a medias', 'text_delta');
        onError(new Error('agy interrumpió la respuesta antes de terminar'));
      });
    }));
    const failStream = failing.executeTurn({ sessionId: 'agy-fail', message: 'hola', engine: 'agy-fail' });
    const failEv = collect(failStream);
    await tick();
    assert.strictEqual(failEv.error.length, 1);
    assert.strictEqual(failEv.done.length, 0);
    assert.strictEqual(failing.sessionStore.get('agy-fail').messages.length, 0, 'no se guarda la respuesta cortada');
  });

  console.log('\n[3c] Registro de turnos del motor:');
  await it('should log each turn exactly once with its outcome, duration, sizes and agy resets', async () => {
    const records = [];
    const engine = new AgentEngine({ turnLogger: (record, dir) => records.push({ ...record, dir }) });

    engine.registerAdapter('ok', new ScriptedAdapter(({ onStdout, onExit }) => {
      setImmediate(() => { onStdout('Aborto', 'text_delta'); onStdout('0', 'reset'); onStdout('Final', 'text_delta'); onExit(0); onExit(0); });
    }));
    collect(engine.executeTurn({ sessionId: 'log-ok', message: 'hola', engine: 'ok' }));

    engine.registerAdapter('bad', new ScriptedAdapter(({ onError }) => setImmediate(() => { onError(new Error('boom')); onError(new Error('otra vez')); })));
    collect(engine.executeTurn({ sessionId: 'log-bad', message: 'hola', engine: 'bad' }));

    const hang = new ScriptedAdapter(() => {});
    engine.registerAdapter('hang2', hang);
    const hanging = engine.executeTurn({ sessionId: 'log-hang', message: 'hola', engine: 'hang2' });
    hanging.kill();
    hang.params.onExit(null);
    await tick(50);

    assert.strictEqual(records.length, 3, `un registro por turno: ${JSON.stringify(records.map(r => r.outcome))}`);
    const byEngine = Object.fromEntries(records.map(r => [r.engine, r]));
    assert.strictEqual(byEngine.ok.outcome, 'done');
    assert.strictEqual(byEngine.ok.resets, 1);
    assert.strictEqual(byEngine.ok.responseChars, 'Final'.length);
    assert(byEngine.ok.promptChars > 0 && byEngine.ok.durationMs >= 0 && byEngine.ok.dir);
    assert.strictEqual(byEngine.bad.outcome, 'error');
    assert.strictEqual(byEngine.bad.error, 'boom');
    assert.strictEqual(byEngine.hang2.outcome, 'cancelled');
    assert(!JSON.stringify(records).includes('hola'), 'sin contenido de la conversación');
  });

  await it('turn-log should append JSON lines, skip a truncated line and keep only recent turns when asked', () => {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const { appendTurnLog, readTurnLog } = require('../lib/turn-log');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'turnlog-'));
    try {
      assert.deepStrictEqual(readTurnLog(dir), []);
      for (let i = 1; i <= 5; i++) appendTurnLog(dir, { n: i });
      fs.appendFileSync(path.join(dir, 'turns.jsonl'), '{"n": 6, "cortado');
      assert.deepStrictEqual(readTurnLog(dir, 100).map(t => t.n), [1, 2, 3, 4, 5]);
      assert.deepStrictEqual(readTurnLog(dir, 3).map(t => t.n), [3, 4, 5]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
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
