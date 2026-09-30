const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { startServer, sleep, waitFor, parseSSE } = require('./helpers/server-harness');

// Compuertas de aprobación de punta a punta con el servidor real (motor mock): detección, resolución,
// reapertura, recarga (F5) y proyecto nuevo.

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

const { Pipeline } = require('../core/pipeline');
const GATE1 = new Pipeline().getGate('gate-1');
const APPROVE = GATE1.options[0].value;
const ADJUST = GATE1.options[1].value;

async function chat(srv, message, sessionId = 'session-gates-1') {
  const res = await srv.api('/api/chat', { method: 'POST', body: { message, engine: 'mock', sessionId } });
  assert.strictEqual(res.status, 200);
  return parseSSE(await res.text());
}

async function history(srv) {
  return (await srv.api('/api/chat/history')).json();
}

async function runSuite() {
  console.log('\n--- Test Suite: Compuertas de aprobación (servidor real) ---\n');

  const srv = await startServer({ env: { MOCK_DELAY_MS: '20' } });
  try {
    await it('should create the project and surface no gate while the flow is in Phase 1', async () => {
      await chat(srv, 'Acme');
      const body = await history(srv);
      assert.strictEqual(body.hasProject, true);
      assert.strictEqual(body.pendingAction, null);
      assert.deepStrictEqual(body.gates, {});
    });

    // Fase 4: hay showcase en disco
    const projectDir = path.join(srv.workspaceDir, 'acme');
    fs.writeFileSync(path.join(projectDir, 'design-system-state.json'), JSON.stringify({ brand: { name: 'Acme' }, current_phase: 4 }));
    fs.writeFileSync(path.join(projectDir, 'Acme_Design_System.html'), '<html><body>showcase</body></html>');
    await waitFor(async () => (await (await srv.api('/api/deliverables')).json()).status.showcaseExists, { timeoutMs: 8000 });

    await it('should attach gate 1 to the reply that asks the approval question', async () => {
      const events = await chat(srv, 'muestra el showcase');
      const done = events.find(e => e.name === 'done');
      assert(done.data.action, 'la respuesta debe abrir una compuerta');
      assert.strictEqual(done.data.action.stepId, 'gate-1');
      assert.strictEqual((await history(srv)).pendingAction.stepId, 'gate-1');
    });

    await it('should record the approval and not offer the gate again after a reload', async () => {
      const events = await chat(srv, APPROVE);
      assert(!events.find(e => e.name === 'done').data.action, 'la respuesta a la aprobación no abre otra compuerta');
      const body = await history(srv);
      assert.strictEqual(body.gates['gate-1'].status, 'approved');
      assert.strictEqual(body.pendingAction, null, 'showcase en disco sin prototipo no debe re-inferir la compuerta');
    });

    await it('should reopen the gate when the agent asks the question again', async () => {
      await chat(srv, 'muestra el showcase otra vez');
      const body = await history(srv);
      assert.strictEqual(body.pendingAction.stepId, 'gate-1');
      assert.strictEqual(body.gates['gate-1'], undefined);
    });

    await it('should treat "request adjustments" as resolving the gate until the agent reopens it', async () => {
      await chat(srv, ADJUST);
      const body = await history(srv);
      assert.strictEqual(body.gates['gate-1'].status, 'adjusting');
      assert.strictEqual(body.pendingAction, null);
    });

    await it('should restore the gate if the turn that resolved it is cancelled', async () => {
      await chat(srv, 'muestra el showcase');
      assert.strictEqual((await history(srv)).pendingAction.stepId, 'gate-1');

      const slow = await startServer({ env: { MOCK_DELAY_MS: '400' }, beforeStart: (dir) => {
        const p = path.join(dir, 'acme');
        fs.mkdirSync(p, { recursive: true });
        fs.writeFileSync(path.join(p, 'design-system-state.json'), JSON.stringify({ brand: { name: 'Acme' }, current_phase: 4 }));
        fs.writeFileSync(path.join(p, 'Acme_Design_System.html'), '<html></html>');
        fs.writeFileSync(path.join(dir, '.active_project'), 'acme');
      } });
      try {
        await waitFor(async () => (await (await slow.api('/api/deliverables')).json()).status.showcaseExists, { timeoutMs: 8000 });
        const first = await chat(slow, 'muestra el showcase', 'session-slow-1');
        assert(first.find(e => e.name === 'done').data.action);

        const pending = slow.api('/api/chat', { method: 'POST', body: { message: APPROVE, engine: 'mock', sessionId: 'session-slow-1' } });
        const res = await pending;
        const text = res.text();
        await sleep(30);
        await slow.api('/api/chat/cancel', { method: 'POST', body: { sessionId: 'session-slow-1' } });
        await text;

        const body = await history(slow);
        assert.strictEqual(body.gates['gate-1'], undefined, 'la aprobación de un turno cancelado no se conserva');
        assert.strictEqual(body.pendingAction.stepId, 'gate-1', 'la compuerta sigue abierta');
        assert(!body.messages.some(m => m.content === APPROVE), 'el mensaje cancelado no queda en el historial');
      } finally {
        await slow.stop();
      }
    });

    await it('should start a new project without archiving the current one, and resume it by brand name', async () => {
      const res = await srv.api('/api/project/new', { method: 'POST', body: { sessionId: 'session-gates-1' } });
      const body = await res.json();
      assert.strictEqual(body.ok, true);
      assert.strictEqual(body.previousProject, 'acme');

      assert.strictEqual((await history(srv)).hasProject, false);
      assert(fs.existsSync(path.join(projectDir, 'chat_history.json')), 'el historial del proyecto anterior se conserva');
      assert(fs.existsSync(path.join(projectDir, 'design-system-state.json')), 'el estado del proyecto anterior se conserva');
      assert(!fs.readdirSync(projectDir).some(f => f.includes('.backup-')), 'a diferencia de /api/reset no se archiva nada');

      await chat(srv, 'Zeta', 'session-gates-2');
      assert.strictEqual((await history(srv)).projectName, 'zeta');
      assert(fs.existsSync(path.join(srv.workspaceDir, 'zeta')));

      await srv.api('/api/project/new', { method: 'POST', body: {} });
      await chat(srv, 'Acme', 'session-gates-3');
      const resumed = await history(srv);
      assert.strictEqual(resumed.projectName, 'acme');
      assert(resumed.messages.length > 2, 'se retoma el historial de la marca existente');
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
