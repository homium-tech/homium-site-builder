const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { startServer, sleep, waitFor, parseSSE } = require('./helpers/server-harness');

// Prueba de integración: arranca server.js real (motor mock) y ejercita el flujo HTTP/SSE de /api/chat.

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

function historyOf(workspaceDir, project) {
  const file = path.join(workspaceDir, project, 'chat_history.json');
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf-8')) : null;
}

async function runSuite() {
  console.log('\n--- Test Suite: Flujo HTTP de /api/chat (servidor real, motor mock) ---\n');

  console.log('[1] Validación de entrada:');
  let srv = await startServer();
  try {
    await it('should reject unknown engines, bad session ids and oversized messages', async () => {
      let res = await srv.api('/api/chat', { method: 'POST', body: { message: 'Acme', engine: 'inexistente', sessionId: 'session-abc-123' } });
      assert.strictEqual(res.status, 400);
      res = await srv.api('/api/chat', { method: 'POST', body: { message: 'Acme', engine: 'mock', sessionId: '../../etc' } });
      assert.strictEqual(res.status, 400);
      res = await srv.api('/api/chat', { method: 'POST', body: { message: 'x'.repeat(20001), engine: 'mock', sessionId: 'session-abc-123' } });
      assert.strictEqual(res.status, 413);
      res = await srv.api('/api/chat', { method: 'POST', body: { message: 42, engine: 'mock' } });
      assert.strictEqual(res.status, 400);
    });

    console.log('\n[2] Turno completo:');
    await it('should stream a full turn, create the project and persist both messages once', async () => {
      const res = await srv.api('/api/chat', { method: 'POST', body: { message: 'Acme', engine: 'mock', sessionId: 'session-full-1' } });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers.get('x-accel-buffering'), 'no');
      const events = parseSSE(await res.text());
      assert.strictEqual(events.filter(e => e.name === 'done').length, 1);

      const history = historyOf(srv.workspaceDir, 'acme');
      assert(history, 'chat_history.json must exist in the project folder');
      assert.deepStrictEqual(history.messages.map(m => m.role), ['user', 'assistant']);
      assert(history.messages[1].content.length > 0);
    });

    await it('should report busy=false in /api/chat/history once the turn is over', async () => {
      const res = await srv.api('/api/chat/history');
      const body = await res.json();
      assert.strictEqual(body.hasProject, true);
      assert.strictEqual(body.busy, false);
      assert.strictEqual(body.messages.length, 2);
    });
  } finally {
    await srv.stop();
  }

  console.log('\n[3] Concurrencia, desconexión y cancelación:');
  srv = await startServer({ env: { MOCK_DELAY_MS: '150' } });
  try {
    await it('should answer 409 to a concurrent turn without leaving a phantom user message', async () => {
      const first = await srv.api('/api/chat', { method: 'POST', body: { message: 'Acme', engine: 'mock', sessionId: 'session-busy-1' } });
      assert.strictEqual(first.status, 200);

      const second = await srv.api('/api/chat', { method: 'POST', body: { message: 'segundo mensaje', engine: 'mock', sessionId: 'session-busy-1' } });
      assert.strictEqual(second.status, 409);

      await first.text();
      const history = historyOf(srv.workspaceDir, 'acme');
      assert.deepStrictEqual(history.messages.map(m => m.content === 'segundo mensaje'), history.messages.map(() => false));
      assert.deepStrictEqual(history.messages.map(m => m.role), ['user', 'assistant']);
    });

    await it('should finish and persist the reply even if the client disconnects mid-turn', async () => {
      const controller = new AbortController();
      const res = await srv.api('/api/chat', { method: 'POST', body: { message: 'Continua con el flujo', engine: 'mock', sessionId: 'session-drop-1' }, signal: controller.signal });
      assert.strictEqual(res.status, 200);
      controller.abort(); // corte del túnel

      await waitFor(async () => {
        const body = await (await srv.api('/api/chat/history')).json();
        return body.busy === false && body.messages.length === 4;
      }, { timeoutMs: 8000 });

      const history = historyOf(srv.workspaceDir, 'acme');
      assert.deepStrictEqual(history.messages.map(m => m.role), ['user', 'assistant', 'user', 'assistant']);
    });

    await it('should cancel a running turn on request and keep no partial reply or dangling user message', async () => {
      const before = historyOf(srv.workspaceDir, 'acme').messages.length;
      const res = await srv.api('/api/chat', { method: 'POST', body: { message: 'mensaje a cancelar', engine: 'mock', sessionId: 'session-cancel-1' } });
      assert.strictEqual(res.status, 200);
      const bodyText = res.text();

      const cancelRes = await srv.api('/api/chat/cancel', { method: 'POST', body: { sessionId: 'session-cancel-1' } });
      assert.deepStrictEqual(await cancelRes.json(), { ok: true, cancelled: true });

      const events = parseSSE(await bodyText);
      assert(events.some(e => e.name === 'cancelled'), 'client is told the turn was cancelled');
      assert(!events.some(e => e.name === 'done'));

      await sleep(500); // el proceso simulado ya no debe escribir nada
      const history = historyOf(srv.workspaceDir, 'acme');
      assert.strictEqual(history.messages.length, before);
      assert.strictEqual((await (await srv.api('/api/chat/history')).json()).busy, false);

      const again = await srv.api('/api/chat/cancel', { method: 'POST', body: { sessionId: 'session-cancel-1' } });
      assert.deepStrictEqual(await again.json(), { ok: true, cancelled: false });
    });

    await it('should cancel running turns on /api/reset', async () => {
      const res = await srv.api('/api/chat', { method: 'POST', body: { message: 'otro turno', engine: 'mock', sessionId: 'session-reset-1' } });
      assert.strictEqual(res.status, 200);
      const bodyText = res.text();

      await srv.api('/api/reset', { method: 'POST', body: { sessionId: 'session-reset-1' } });
      const events = parseSSE(await bodyText);
      assert(events.some(e => e.name === 'cancelled'));
      const body = await (await srv.api('/api/chat/history')).json();
      assert.strictEqual(body.hasProject, false);
      assert.strictEqual(body.busy, false);
    });
  } finally {
    await srv.stop();
  }

  console.log(`\n========================================`);
  console.log(`Summary: ${passedTests}/${totalTests} tests passed.`);
  console.log(`========================================\n`);

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error(err);
  process.exit(1);
});
