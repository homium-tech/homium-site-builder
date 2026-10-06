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

    await it('should never reach a real engine under the test harness (sandboxed PATH and HOME)', async () => {
      const res = await srv.api('/api/chat', { method: 'POST', body: { message: 'Acme', engine: 'claude', sessionId: 'session-sandbox-1' } });
      const raw = await res.text();
      // Fallo de arranque: o bien una excepción síncrona (500 JSON) o bien un evento SSE de error
      const reason = res.status === 200 ? (parseSSE(raw).find(e => e.name === 'error') || {}).data?.error : JSON.parse(raw).error;
      assert(/ENOENT|no se puede|not found/i.test(reason || ''), `el motor real no debe ejecutarse: ${reason} / ${raw.slice(0, 200)}`);
      const history = historyOf(srv.workspaceDir, 'acme');
      assert(!history || !history.messages.some(m => m.role === 'assistant'), 'sin respuesta de un agente real');
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

  console.log('\n[3b] Manual de marca adjunto en el primer mensaje (antes de que exista el proyecto):');
  srv = await startServer();
  try {
    const upload = async (name, content) => {
      const form = new FormData();
      form.append('files', new Blob([content]), name);
      return srv.api('/api/upload', { method: 'POST', body: form });
    };

    await it('should accept an upload before the project exists and move it to uploads/ when the brand name arrives', async () => {
      const res = await upload('Manual-de-marca.pdf', '%PDF-1.4 fake');
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.staged, true, 'sin proyecto el archivo queda en espera');
      const name = body.files[0].name;
      assert(fs.existsSync(path.join(srv.workspaceDir, '.pending_uploads', name)));

      // El cliente añade la nota de adjuntos al mensaje: no debe formar parte del nombre del proyecto
      const chat = await srv.api('/api/chat', { method: 'POST', body: { message: `Selvaria\n\n[Archivos adjuntos en uploads/: ${name}]`, engine: 'mock', sessionId: 'session-manual-1' } });
      assert.strictEqual(chat.status, 200);
      await chat.text();

      assert(fs.existsSync(path.join(srv.workspaceDir, 'selvaria', 'uploads', name)), 'el manual llega a uploads/ del proyecto');
      assert(!fs.existsSync(path.join(srv.workspaceDir, '.pending_uploads')), 'la carpeta de espera se limpia');
      const history = historyOf(srv.workspaceDir, 'selvaria');
      assert(history.messages[0].content.includes(`[Archivos adjuntos en uploads/: ${name}]`));
    });

    await it('should tell the engine about files adopted from the waiting folder even if the message carries no note', async () => {
      await srv.api('/api/project/new', { method: 'POST', body: {} });
      const up = await (await upload('Guia.pdf', '%PDF-1.4')).json();
      const name = up.files[0].name;
      const chat = await srv.api('/api/chat', { method: 'POST', body: { message: 'Nimbus', engine: 'mock', sessionId: 'session-manual-2' } });
      await chat.text();
      assert(fs.existsSync(path.join(srv.workspaceDir, 'nimbus', 'uploads', name)));
      assert(historyOf(srv.workspaceDir, 'nimbus').messages[0].content.includes(`[Archivos adjuntos en uploads/: ${name}]`));
    });

    await it('should keep the files waiting when the first message has no brand name', async () => {
      await srv.api('/api/project/new', { method: 'POST', body: {} });
      const up = await (await upload('Otro.pdf', '%PDF-1.4')).json();
      const name = up.files[0].name;
      const chat = await srv.api('/api/chat', { method: 'POST', body: { message: `He adjuntado archivos de referencia para el proyecto.\n\n[Archivos adjuntos en uploads/: ${name}]`, engine: 'mock', sessionId: 'session-manual-3' } });
      await chat.text();
      assert(fs.existsSync(path.join(srv.workspaceDir, '.pending_uploads', name)), 'siguen en espera hasta que haya proyecto');
      const body = await (await srv.api('/api/chat/history')).json();
      assert.strictEqual(body.hasProject, false);
    });
  } finally {
    await srv.stop();
  }

  console.log('\n[4] Registro de turnos:');
  srv = await startServer();
  try {
    await it('should record every turn with metrics and without conversation content, and expose it at /api/turns', async () => {
      const ok = await srv.api('/api/chat', { method: 'POST', body: { message: 'Registro', engine: 'mock', sessionId: 'session-turnlog-1' } });
      assert.strictEqual(ok.status, 200);
      await ok.text();

      const body = await (await srv.api('/api/turns')).json();
      assert.strictEqual(body.ok, true);
      const done = body.turns.find(t => t.engine === 'mock' && t.outcome === 'done');
      assert(done, JSON.stringify(body.turns));
      assert(done.durationMs >= 0 && done.promptChars > 0 && done.responseChars > 0 && done.resets === 0);
      assert(done.at && done.sessionId === 'session-turnlog-1');
      assert(!JSON.stringify(body.turns).includes('Registro'), 'el contenido del mensaje no se guarda en el registro');

      const file = path.join(srv.workspaceDir, 'registro', 'turns.jsonl');
      assert(fs.existsSync(file), 'turns.jsonl vive en la carpeta del proyecto');
    });

    await it('should log token usage per turn and add it up at /api/telemetry without storing the conversation', async () => {
      const turns = (await (await srv.api('/api/turns')).json()).turns;
      const done = turns.find(t => t.engine === 'mock' && t.outcome === 'done');
      assert(done.usage && done.usage.total_tokens === 505, JSON.stringify(done));
      assert.strictEqual(done.contextTokens, 420, 'el contexto es lo enviado al modelo en su última llamada');

      const body = await (await srv.api('/api/telemetry')).json();
      assert.strictEqual(body.ok, true);
      assert(body.summary.turns_with_usage >= 1);
      assert(body.summary.usage.total_tokens >= 505);
      assert.strictEqual(body.summary.last_context.tokens, 420);
      assert(Array.isArray(body.recent) && body.recent.length >= 1);
      assert(!JSON.stringify(body).includes('Registro'), 'el contenido del mensaje no viaja en la telemetría');
    });

    await it('should log a failed engine start as an error turn and honor the limit', async () => {
      const failed = await srv.api('/api/chat', { method: 'POST', body: { message: 'otro', engine: 'claude', sessionId: 'session-turnlog-2' } });
      await failed.text();
      const all = (await (await srv.api('/api/turns')).json()).turns;
      assert(all.length >= 1);
      const last = all[all.length - 1];
      assert(last.engine !== 'claude' || last.outcome === 'error', 'un motor que no arranca queda como error');
      assert.strictEqual((await (await srv.api('/api/turns?limit=1')).json()).turns.length, 1, 'respeta el límite');
    });

    await it('should drop a user message left without a reply by an interrupted turn and report it', async () => {
      const file = path.join(srv.workspaceDir, 'registro', 'chat_history.json');
      const history = JSON.parse(fs.readFileSync(file, 'utf-8'));
      const before = history.messages.length;
      history.messages.push({ role: 'user', content: 'continua', timestamp: Date.now() });
      history.messages.push({ role: 'user', content: 'continua otra vez', timestamp: Date.now() + 1 });
      fs.writeFileSync(file, JSON.stringify(history));

      const body = await (await srv.api('/api/chat/history')).json();
      assert.deepStrictEqual(body.interrupted, ['continua', 'continua otra vez']);
      assert.strictEqual(body.messages.length, before);
      assert.strictEqual(body.messages[body.messages.length - 1].role, 'assistant');
      assert.strictEqual(JSON.parse(fs.readFileSync(file, 'utf-8')).messages.length, before, 'el historial en disco queda limpio');

      const again = await (await srv.api('/api/chat/history')).json();
      assert.deepStrictEqual(again.interrupted, [], 'no se vuelve a reportar');
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
