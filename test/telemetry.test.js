const assert = require('assert');
const http = require('http');
const { AgentEngine } = require('../lib/agent-engine');
const ClaudeAdapter = require('../lib/agent-engine/adapters/claude-adapter');
const LlamaCppAdapter = require('../lib/agent-engine/adapters/llamacpp-adapter');
const OllamaAdapter = require('../lib/agent-engine/adapters/ollama-adapter');
const { normalizeUsage, contextOf, contextWindowFor, TurnUsage, summarizeTurns } = require('../lib/telemetry');

const { ClaudeEventTracker } = ClaudeAdapter;

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

const tick = (ms) => new Promise(r => setTimeout(r, ms));

// Salida real de `claude -p --output-format stream-json --verbose` (recortada a lo que importa)
const CLAUDE_LINES = [
  { type: 'system', subtype: 'hook_started' },
  { type: 'system', subtype: 'init', model: 'claude-sonnet-5-5' },
  { type: 'assistant', message: { id: 'msg_1', model: 'claude-sonnet-5-5', usage: { input_tokens: 2, output_tokens: 30, cache_read_input_tokens: 10000, cache_creation_input_tokens: 5000 } } },
  { type: 'assistant', message: { id: 'msg_1', model: 'claude-sonnet-5-5', usage: { input_tokens: 2, output_tokens: 30, cache_read_input_tokens: 10000, cache_creation_input_tokens: 5000 } } },
  { type: 'user', message: { content: 'tool_result' } },
  { type: 'assistant', message: { id: 'msg_2', model: 'claude-sonnet-5-5', usage: { input_tokens: 3, output_tokens: 4, cache_read_input_tokens: 15000, cache_creation_input_tokens: 200 } } },
  { type: 'assistant', parent_tool_use_id: 'toolu_x', message: { id: 'msg_sub', model: 'claude-haiku-4-5', usage: { input_tokens: 999999, output_tokens: 1 } } },
  { type: 'rate_limit_event' },
  {
    type: 'result',
    subtype: 'success',
    is_error: false,
    result: 'respuesta final',
    total_cost_usd: 0.0123,
    duration_ms: 3364,
    usage: { input_tokens: 5, output_tokens: 34, cache_read_input_tokens: 25000, cache_creation_input_tokens: 5200, output_tokens_details: { thinking_tokens: 7 } },
    modelUsage: { 'claude-sonnet-5-5': { contextWindow: 1000000 } }
  }
].map(o => JSON.stringify(o));

function runClaude(lines) {
  const out = [];
  const err = [];
  const usage = new TurnUsage('claude');
  const events = [];
  const tracker = new ClaudeEventTracker({
    onStdout: (t) => out.push(t),
    onStderr: (t) => err.push(t),
    onMetrics: (m) => { events.push(m); usage.add(m); }
  });
  const unhandled = lines.filter(l => !tracker.handleLine(l.trim()));
  return { out, err, usage, events, unhandled };
}

(async () => {
  console.log('\n--- Test Suite: Telemetría de uso por motor ---\n');

  console.log('[1] Normalización y ventana de contexto:');
  await it('should normalize usage and never report a total below the sum of its parts', () => {
    const u = normalizeUsage({ input_tokens: 10, output_tokens: 5, cache_read_tokens: 100, cache_write_tokens: 20, total_tokens: 0 });
    assert.strictEqual(u.total_tokens, 135);
    assert.strictEqual(normalizeUsage({ input_tokens: 1, output_tokens: 1, total_tokens: 50 }).total_tokens, 50);
    assert.deepStrictEqual(normalizeUsage(null), normalizeUsage({}));
    assert.strictEqual(normalizeUsage({ input_tokens: 'x', output_tokens: -3 }).total_tokens, 0);
  });

  await it('should count cached tokens as part of the context sent to the model', () => {
    assert.strictEqual(contextOf({ input_tokens: 2, cache_read_tokens: 13813, cache_write_tokens: 14214, output_tokens: 4 }), 28029);
  });

  await it('should prefer the CONTEXT_WINDOW_<ENGINE> override, then known patterns, and otherwise not guess', () => {
    const saved = process.env.CONTEXT_WINDOW_AGY;
    try {
      delete process.env.CONTEXT_WINDOW_AGY;
      assert.deepStrictEqual(contextWindowFor('agy', 'Gemini 3.x'), { tokens: 1000000, estimated: true });
      assert.deepStrictEqual(contextWindowFor('claude', 'claude-haiku-4-5'), { tokens: 200000, estimated: true });
      assert.strictEqual(contextWindowFor('opencode', 'desconocido'), null);
      process.env.CONTEXT_WINDOW_AGY = '2000000';
      assert.deepStrictEqual(contextWindowFor('agy', 'Gemini 3.x'), { tokens: 2000000, estimated: false });
    } finally {
      if (saved === undefined) delete process.env.CONTEXT_WINDOW_AGY; else process.env.CONTEXT_WINDOW_AGY = saved;
    }
  });

  console.log('\n[2] Acumulado de un turno:');
  await it('should replace a call that repeats its call_id instead of counting it twice', () => {
    const t = new TurnUsage('agy');
    t.add({ call_id: 1, usage: { input_tokens: 100, output_tokens: 10 } });
    t.add({ call_id: 1, usage: { input_tokens: 100, output_tokens: 10 } });
    t.add({ call_id: 2, usage: { input_tokens: 150, output_tokens: 20 } });
    const s = t.snapshot();
    assert.strictEqual(s.usage.input_tokens, 250);
    assert.strictEqual(s.usage.output_tokens, 30);
    assert.strictEqual(s.context_tokens, 150, 'el contexto es el de la última llamada, no la suma');
  });

  await it('should sum per-call cost and let the engine turn total win only when it is not smaller', () => {
    const t = new TurnUsage('opencode');
    t.add({ call_id: 'a', cost_usd: 0.01, usage: { input_tokens: 100, output_tokens: 10 } });
    t.add({ call_id: 'b', cost_usd: 0.02, usage: { input_tokens: 200, output_tokens: 10 } });
    assert.strictEqual(+t.snapshot().cost_usd.toFixed(4), 0.03);
    t.add({ scope: 'turn', cost_usd: 0.5, usage: { input_tokens: 1, output_tokens: 1 } });
    assert.strictEqual(t.snapshot().usage.input_tokens, 300, 'un total del turno menor que las llamadas no las pisa');
    t.add({ scope: 'turn', cost_usd: 0.5, usage: { input_tokens: 400, output_tokens: 20 } });
    assert.strictEqual(t.snapshot().usage.input_tokens, 400);
    assert.strictEqual(t.snapshot().cost_usd, 0.5);
  });

  await it('should report the model without usage, and null when nothing arrived', () => {
    const t = new TurnUsage('claude');
    assert.strictEqual(t.snapshot(), null);
    t.add({ model: 'claude-sonnet-5-5' });
    assert.deepStrictEqual([t.snapshot().usage, t.snapshot().model], [null, 'claude-sonnet-5-5']);
  });

  console.log('\n[3] Claude (stream-json):');
  await it('should deliver the final text once and take model, context, totals, cost and window from the events', () => {
    const { out, err, usage, unhandled } = runClaude(CLAUDE_LINES);
    assert.deepStrictEqual(out, ['respuesta final']);
    assert.deepStrictEqual(err, []);
    assert.deepStrictEqual(unhandled, [], 'todo evento con type se consume: ninguno acaba como texto de la respuesta');
    const s = usage.snapshot();
    assert.strictEqual(s.model, 'claude-sonnet-5-5');
    assert.strictEqual(s.context_tokens, 3 + 15000 + 200, 'contexto = última llamada del agente principal (sin subagentes)');
    assert.strictEqual(s.context_window, 1000000);
    assert.strictEqual(s.context_window_estimated, false);
    assert.strictEqual(s.cost_usd, 0.0123);
    assert.strictEqual(s.usage.cache_read_tokens, 25000, 'el acumulado es el del result, no la suma de las llamadas');
    assert.strictEqual(s.usage.thinking_tokens, 7);
    assert.strictEqual(s.duration_seconds, 3.364);
  });

  await it('should route an error result to stderr so the turn fails instead of saving it as an answer', () => {
    const { out, err } = runClaude([
      JSON.stringify({ type: 'system', subtype: 'init', model: 'claude-sonnet-5-5' }),
      JSON.stringify({ type: 'result', is_error: true, result: 'Credit balance is too low' })
    ]);
    assert.deepStrictEqual(out, []);
    assert.deepStrictEqual(err, ['Credit balance is too low']);
  });

  await it('should leave text that is not an event for the adapter to treat as the reply', () => {
    const { unhandled } = runClaude(['solo texto', '{"sin":"tipo"}']);
    assert.strictEqual(unhandled.length, 2);
  });

  await it('should ask the CLI for stream-json and keep the flags the engine relies on', () => {
    const { command, args } = new ClaudeAdapter().buildCommandAndArgs({ prompt: 'hola' });
    assert.strictEqual(command, 'claude');
    assert.deepStrictEqual(args.slice(args.indexOf('--output-format'), args.indexOf('--output-format') + 2), ['--output-format', 'stream-json']);
    assert(args.includes('--verbose'), 'stream-json en modo -p exige --verbose');
    assert(args.includes('--dangerously-skip-permissions'));
  });

  console.log('\n[3b] AGY (el usage del result es el acumulado de la conversación):');
  const AgyAdapter = require('../lib/agent-engine/adapters/agy-adapter');
  const runAgy = (session, isFirstTurn, lines) => {
    const usage = new TurnUsage('agy');
    const tracker = new AgyAdapter.AgyEventTracker({ session, isFirstTurn, onStdout() {}, onStderr() {}, onMetrics: (m) => usage.add(m) });
    for (const l of lines) tracker.handleLine(JSON.stringify(l));
    return usage.snapshot();
  };
  const agyTurn = (stepIndex, stepUsage, cumulative) => [
    { event: 'step_update', step_update: { step_index: stepIndex, step_type: 'agent_response', state: 'DONE', text_delta: 'ok', usage: stepUsage } },
    { event: 'result', result: { status: 'SUCCESS', duration_seconds: 2, usage: cumulative } }
  ];
  const u = (input, output) => ({ input_tokens: input, output_tokens: output, thinking_tokens: 0, cache_read_tokens: 0, total_tokens: input + output });

  await it('should charge each turn only its own tokens, not the running total of the conversation', async () => {
    const session = {};
    const t1 = runAgy(session, true, agyTurn(1, u(13290, 110), u(13290, 110)));
    assert.strictEqual(t1.usage.total_tokens, 13400);
    const t2 = runAgy(session, false, agyTurn(4, u(13606, 134), u(26896, 244)));
    assert.strictEqual(t2.usage.total_tokens, 13740, 'turno 2 = acumulado 27140 - 13400');
    assert.strictEqual(t2.context_tokens, 13606);
    const t3 = runAgy(session, false, agyTurn(7, u(14000, 100), u(40896, 344)));
    assert.strictEqual(t3.usage.total_tokens, 14100);
  });

  await it('should fall back to the usage of its own steps when the cumulative baseline is unknown (server restarted mid-conversation)', async () => {
    const t = runAgy({}, false, agyTurn(9, u(500, 50), u(900000, 90000)));
    assert.strictEqual(t.usage.total_tokens, 550, 'no se carga el acumulado completo de la conversación a un solo turno');
  });

  console.log('\n[4] Registro del turno en AgentEngine:');
  await it('should send the running turn total to the client and log usage, model, context and cost without content', async () => {
    const records = [];
    const engine = new AgentEngine({ defaultEngine: 'scripted', turnLogger: (r) => records.push(r) });
    engine.registerAdapter('scripted', {
      buildCommandAndArgs: () => ({ command: 'scripted', args: [] }),
      spawnTurn: ({ onStdout, onMetrics, onExit }) => {
        setImmediate(() => {
          onMetrics({ engine: 'claude', model: 'claude-sonnet-5-5' });
          onMetrics({ engine: 'claude', call_id: 'm1', usage: { input_tokens: 10, output_tokens: 5, cache_read_tokens: 1000 } });
          onMetrics({ engine: 'claude', call_id: 'm2', usage: { input_tokens: 20, output_tokens: 5, cache_read_tokens: 2000 } });
          onStdout('Hola mundo secreto', 'text_delta');
          onExit(0);
        });
        return { kill() {} };
      }
    });
    const stream = engine.executeTurn({ sessionId: 'tele-1', message: 'mensaje privado', engine: 'scripted' });
    const metrics = [];
    stream.on('metrics', (m) => metrics.push(m));
    await tick(50);

    const last = metrics[metrics.length - 1];
    assert.strictEqual(last.usage.input_tokens, 30);
    assert.strictEqual(last.usage.cache_read_tokens, 3000);
    assert.strictEqual(last.context_tokens, 2020);
    assert.strictEqual(last.model, 'claude-sonnet-5-5');

    assert.strictEqual(records.length, 1);
    const rec = records[0];
    assert.strictEqual(rec.usage.total_tokens, 3040);
    assert.strictEqual(rec.contextTokens, 2020);
    assert.strictEqual(rec.model, 'claude-sonnet-5-5');
    assert(!JSON.stringify(rec).includes('secreto') && !JSON.stringify(rec).includes('privado'));
  });

  await it('should still log the tokens of a turn that fails after spending them', async () => {
    const records = [];
    const engine = new AgentEngine({ defaultEngine: 'scripted', turnLogger: (r) => records.push(r) });
    engine.registerAdapter('scripted', {
      buildCommandAndArgs: () => ({ command: 'scripted', args: [] }),
      spawnTurn: ({ onMetrics, onError }) => {
        setImmediate(() => {
          onMetrics({ engine: 'claude', call_id: 'm1', usage: { input_tokens: 10, output_tokens: 5 } });
          onError(new Error('boom'));
        });
        return { kill() {} };
      }
    });
    const stream = engine.executeTurn({ sessionId: 'tele-2', message: 'x', engine: 'scripted' });
    stream.on('error', () => {});
    await tick(50);
    assert.strictEqual(records[0].outcome, 'error');
    assert.strictEqual(records[0].usage.total_tokens, 15);
  });

  console.log('\n[5] Suma del proyecto:');
  await it('should add every logged turn (also failed ones), group by engine and model and keep the last context', () => {
    const summary = summarizeTurns([
      { at: '2026-10-02T10:00:00Z', engine: 'claude', model: 'sonnet', outcome: 'done', durationMs: 1000, usage: normalizeUsage({ input_tokens: 10, output_tokens: 5, cache_read_tokens: 100 }), contextTokens: 110, contextWindow: 1000000, costUsd: 0.01 },
      { at: '2026-10-02T10:05:00Z', engine: 'claude', model: 'sonnet', outcome: 'error', durationMs: 500, usage: normalizeUsage({ input_tokens: 20, output_tokens: 5 }), contextTokens: 20, contextWindow: 1000000, costUsd: 0.02 },
      { at: '2026-10-02T10:10:00Z', engine: 'agy', model: 'Gemini 3.x', outcome: 'done', durationMs: 2000, usage: normalizeUsage({ input_tokens: 1000, output_tokens: 50 }), contextTokens: 1000, contextWindow: null, costUsd: null },
      { at: '2026-10-02T10:15:00Z', engine: 'codex', outcome: 'done', durationMs: 100, usage: null }
    ]);
    assert.strictEqual(summary.turns, 4);
    assert.strictEqual(summary.turns_with_usage, 3);
    assert.strictEqual(summary.usage.total_tokens, 115 + 25 + 1050);
    assert.strictEqual(+summary.cost_usd.toFixed(2), 0.03);
    assert.strictEqual(summary.duration_ms, 3600);
    assert.deepStrictEqual(summary.by_model.map(g => [g.engine, g.turns]), [['agy', 1], ['claude', 2]]);
    assert.strictEqual(summary.last_context.engine, 'agy');
    assert.strictEqual(summary.last_context.tokens, 1000);
  });

  await it('should report no cost when no engine informed one, and cope with an empty log', () => {
    const s = summarizeTurns([{ engine: 'ollama', usage: normalizeUsage({ input_tokens: 5 }), contextTokens: 5 }]);
    assert.strictEqual(s.cost_usd, null);
    const empty = summarizeTurns([]);
    assert.strictEqual(empty.turns, 0);
    assert.strictEqual(empty.last_context, null);
    assert.strictEqual(summarizeTurns(undefined).usage.total_tokens, 0);
  });

  console.log('\n[6] Ventana de contexto de los motores locales:');
  const startServer = (handler) => new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });

  await it('llama.cpp: should read n_ctx and the model name from /props', async () => {
    const server = await startServer((req, res) => {
      req.resume();
      if (req.url === '/props') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ default_generation_settings: { n_ctx: 32768 }, model_path: 'C:\\models\\qwen3-8b.gguf' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'ok' } }] })}\n\n`);
      res.write(`data: ${JSON.stringify({ usage: { prompt_tokens: 3000, completion_tokens: 20, total_tokens: 3020 } })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    });
    try {
      const engine = new AgentEngine({ defaultEngine: 'llama-test' });
      engine.registerAdapter('llama-test', new LlamaCppAdapter({ host: `http://127.0.0.1:${server.address().port}` }));
      const stream = engine.executeTurn({ sessionId: 'tele-lla', message: 'hola', engine: 'llama-test' });
      const metrics = [];
      let done = 0;
      stream.on('metrics', (m) => metrics.push(m));
      stream.on('done', () => done++);
      await tick(200);
      assert.strictEqual(done, 1);
      assert.strictEqual(metrics.length, 1);
      assert.strictEqual(metrics[0].context_window, 32768);
      assert.strictEqual(metrics[0].context_tokens, 3000);
      assert.strictEqual(metrics[0].model, 'qwen3-8b.gguf');
    } finally {
      server.close();
    }
  });

  await it('Ollama: should use the context the model is loaded with (/api/ps) and report metrics before closing the turn', async () => {
    const server = await startServer((req, res) => {
      req.resume();
      if (req.url === '/api/ps') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ models: [{ name: 'qwen-test', context_length: 16384 }] }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
      res.write(JSON.stringify({ message: { content: 'ok' }, done: false }) + '\n');
      res.write(JSON.stringify({ message: { content: '' }, done: true, eval_count: 7, prompt_eval_count: 900, total_duration: 2e9 }) + '\n');
      res.end();
    });
    try {
      const engine = new AgentEngine({ defaultEngine: 'ollama-test' });
      engine.registerAdapter('ollama-test', new OllamaAdapter({ host: `http://127.0.0.1:${server.address().port}`, model: 'qwen-test' }));
      const stream = engine.executeTurn({ sessionId: 'tele-oll', message: 'hola', engine: 'ollama-test' });
      const order = [];
      stream.on('metrics', (m) => order.push(['metrics', m]));
      stream.on('done', () => order.push(['done']));
      await tick(200);
      assert.deepStrictEqual(order.map(e => e[0]), ['metrics', 'done'], 'las métricas llegan antes de cerrar el turno');
      assert.strictEqual(order[0][1].context_window, 16384);
      assert.strictEqual(order[0][1].context_tokens, 900);
      assert.strictEqual(order[0][1].duration_seconds, 2);
    } finally {
      server.close();
    }
  });

  await it('Ollama: should finish the turn without a window when the server does not answer the probe', async () => {
    const server = await startServer((req, res) => {
      req.resume();
      if (req.url === '/api/chat') {
        res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
        res.write(JSON.stringify({ message: { content: 'ok' }, done: true, eval_count: 1, prompt_eval_count: 2 }) + '\n');
        res.end();
        return;
      }
      res.writeHead(404);
      res.end();
    });
    try {
      const engine = new AgentEngine({ defaultEngine: 'ollama-test' });
      engine.registerAdapter('ollama-test', new OllamaAdapter({ host: `http://127.0.0.1:${server.address().port}`, model: 'm' }));
      const stream = engine.executeTurn({ sessionId: 'tele-oll-2', message: 'hola', engine: 'ollama-test' });
      const metrics = [];
      let done = 0;
      stream.on('metrics', (m) => metrics.push(m));
      stream.on('done', () => done++);
      await tick(200);
      assert.strictEqual(done, 1);
      assert.strictEqual(metrics[0].context_window, null);
      assert.strictEqual(metrics[0].context_tokens, 2);
    } finally {
      server.close();
    }
  });

  console.log('\n========================================');
  console.log(`Summary: ${passedTests}/${totalTests} tests passed.`);
  console.log('========================================\n');
})();
