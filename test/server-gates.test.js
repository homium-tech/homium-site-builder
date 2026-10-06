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
const GATE2_APPROVE = new Pipeline().getGate('gate-2').options[0].value;

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

    await it('should not offer a stored gate while the Design System does not exist yet', async () => {
      const file = path.join(srv.workspaceDir, 'acme', 'chat_history.json');
      const original = fs.readFileSync(file, 'utf-8');
      const stored = JSON.parse(original);
      stored.lastAction = GATE1; // falso positivo guardado antes de construir el Design System
      fs.writeFileSync(file, JSON.stringify(stored));
      try {
        assert.strictEqual((await history(srv)).pendingAction, null);
      } finally {
        fs.writeFileSync(file, original);
      }
    });

    // Fase 4: hay Design System en disco
    const projectDir = path.join(srv.workspaceDir, 'acme');
    fs.writeFileSync(path.join(projectDir, 'design-system-state.json'), JSON.stringify({ brand: { name: 'Acme' }, current_phase: 4 }));
    fs.writeFileSync(path.join(projectDir, 'Acme_Design_System.html'), '<html><body>design system</body></html>');
    await waitFor(async () => (await (await srv.api('/api/deliverables')).json()).status.designSystemExists, { timeoutMs: 8000 });

    await it('should attach gate 1 to the reply that asks the approval question', async () => {
      const events = await chat(srv, 'muestra el Design System');
      const done = events.find(e => e.name === 'done');
      assert(done.data.action, 'la respuesta debe abrir una compuerta');
      assert.strictEqual(done.data.action.stepId, 'gate-1');
      assert.strictEqual((await history(srv)).pendingAction.stepId, 'gate-1');
    });

    await it('should attach the real audit results to the gate, on the reply and after a reload', async () => {
      const events = await chat(srv, 'muestra el Design System otra vez');
      const audit = events.find(e => e.name === 'done').data.action.audit;
      assert(audit, 'la compuerta lleva el resultado de las auditorías');
      const byId = Object.fromEntries(audit.checks.map(c => [c.id, c]));
      assert(byId['design-system'] && byId.spec && byId.palette, 'Design System, especificación y paleta');
      assert.strictEqual(byId.spec.status, 'fail', 'no hay .md en el proyecto de prueba');
      assert(/No se encontró/.test(byId.spec.errors[0]));
      assert.strictEqual(byId['design-system'].status, 'fail', 'el Design System de prueba no tiene las 14 secciones');
      assert(audit.summary.fail >= 2);

      const reloaded = (await history(srv)).pendingAction;
      assert.strictEqual(reloaded.stepId, 'gate-1');
      assert(reloaded.audit && reloaded.audit.checks.length === audit.checks.length, 'tras recargar vuelve con auditoría');
    });

    await it('should record the approval and not offer the gate again after a reload', async () => {
      const events = await chat(srv, APPROVE);
      assert(!events.find(e => e.name === 'done').data.action, 'la respuesta a la aprobación no abre otra compuerta');
      const body = await history(srv);
      assert.strictEqual(body.gates['gate-1'].status, 'approved');
      assert.strictEqual(body.pendingAction, null, 'Design System en disco sin prototipo no debe re-inferir la compuerta');
    });

    await it('should reopen the gate when the agent asks the question again', async () => {
      await chat(srv, 'muestra el Design System otra vez');
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
      await chat(srv, 'muestra el Design System');
      assert.strictEqual((await history(srv)).pendingAction.stepId, 'gate-1');

      const slow = await startServer({ env: { MOCK_DELAY_MS: '400' }, beforeStart: (dir) => {
        const p = path.join(dir, 'acme');
        fs.mkdirSync(p, { recursive: true });
        fs.writeFileSync(path.join(p, 'design-system-state.json'), JSON.stringify({ brand: { name: 'Acme' }, current_phase: 4 }));
        fs.writeFileSync(path.join(p, 'Acme_Design_System.html'), '<html></html>');
        fs.writeFileSync(path.join(dir, '.active_project'), 'acme');
      } });
      try {
        await waitFor(async () => (await (await slow.api('/api/deliverables')).json()).status.designSystemExists, { timeoutMs: 8000 });
        const first = await chat(slow, 'muestra el Design System', 'session-slow-1');
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

    await it('should attach the fidelity limitations report to gate 2, on the reply and after a reload, without blocking it', async () => {
      fs.writeFileSync(path.join(projectDir, 'design-system-state.json'), JSON.stringify({
        brand: { name: 'Acme' },
        current_phase: 5,
        fidelity_notes: [{ topic: 'Hero WebGL', reason: 'Depende del código de la referencia', substitute: 'Degradado CSS' }],
        visual_dna: {
          fidelity_mode: 'TOTAL_ARCHITECTURAL_FIDELITY',
          typography: { font_display: 'Bagoss, sans-serif', font_display_fallback: 'Syne, sans-serif', self_hosted_fonts: [{ family: 'Bagoss', woff2_src: '/fonts/Bagoss.woff2' }] },
          structural_blueprint: { global: {}, section_sequence: [] }
        }
      }));
      fs.mkdirSync(path.join(projectDir, 'prototype'), { recursive: true });
      fs.writeFileSync(path.join(projectDir, 'prototype', 'index.html'), '<!doctype html><html lang="es"><head><title>A</title></head><body><main><h1>A</h1></main></body></html>');
      await waitFor(async () => (await (await srv.api('/api/deliverables')).json()).status.prototypeExists, { timeoutMs: 8000 });

      const events = await chat(srv, 'muestra el prototipo en la compuerta 2');
      const action = events.find(e => e.name === 'done').data.action;
      assert(action && action.stepId === 'gate-2', 'la respuesta abre la compuerta 2');
      const fidelity = action.audit && action.audit.fidelity;
      assert(fidelity && Array.isArray(fidelity.items), 'la compuerta 2 lleva el informe de fidelidad');
      const byKind = (kind) => fidelity.items.filter(i => i.kind === kind);
      assert(byKind('sustituido').some(i => /Bagoss/.test(i.title) && i.instead === 'Syne'), 'fuente sustituida');
      assert(byKind('nota_agente').some(i => i.title === 'Hero WebGL' && i.instead === 'Degradado CSS'), 'nota del agente');
      assert(action.options.length >= 1 && action.audit.summary.fail >= 0, 'el informe es informativo: las opciones siguen disponibles');

      const reloaded = (await history(srv)).pendingAction;
      assert.strictEqual(reloaded.stepId, 'gate-2');
      assert(reloaded.audit.fidelity && reloaded.audit.fidelity.items.length === fidelity.items.length, 'tras recargar vuelve el informe');
    });

    await it('should keep status EN_CURSO until gate 2 is approved, finalize on approval and reopen if the gate comes back', async () => {
      const statePath = path.join(projectDir, 'design-system-state.json');
      const readState = () => JSON.parse(fs.readFileSync(statePath, 'utf-8'));
      // El agente declaró el proyecto terminado antes de que el usuario respondiera la compuerta 2
      fs.writeFileSync(statePath, JSON.stringify({ ...readState(), status: 'COMPLETADO', phase_5_complete: true }));

      await chat(srv, 'muestra el prototipo en la compuerta 2');
      assert.strictEqual(readState().status, 'EN_CURSO', 'con la compuerta abierta el proyecto sigue en curso');
      assert.strictEqual(readState().phase_5_complete, false, 'la fase 5 se confirma con la compuerta 2');

      await chat(srv, GATE2_APPROVE);
      assert.strictEqual((await history(srv)).gates['gate-2'].status, 'approved');
      assert.strictEqual(readState().status, 'PROYECTO_FINALIZADO');
      assert.strictEqual(readState().phase_5_complete, true);
      assert(readState().brand && readState().visual_dna, 'el resto del estado queda intacto');

      await chat(srv, 'muestra el prototipo en la compuerta 2');
      assert.strictEqual(readState().status, 'EN_CURSO', 'si el agente reabre la compuerta, el proyecto deja de estar finalizado');
    });

    await it('should leave an unreadable or missing state file alone', async () => {
      const statePath = path.join(projectDir, 'design-system-state.json');
      const original = fs.readFileSync(statePath, 'utf-8');
      fs.writeFileSync(statePath, '{ "status": "COMPLETADO", ');
      try {
        await chat(srv, 'cualquier mensaje');
        assert.strictEqual(fs.readFileSync(statePath, 'utf-8'), '{ "status": "COMPLETADO", ', 'un JSON ilegible no se reescribe');
      } finally {
        fs.writeFileSync(statePath, original);
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
