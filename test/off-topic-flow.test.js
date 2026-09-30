const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { AgentEngine } = require('../lib/agent-engine');
const Workspace = require('../lib/workspace');

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

// Adaptador espía: captura el prompt de cada turno y responde con el texto que se le indique
class SpyAdapter {
  constructor() {
    this.prompts = [];
    this.nextReply = 'Respuesta.';
  }
  buildCommandAndArgs() {
    return { command: 'spy', args: [] };
  }
  spawnTurn({ prompt, onStdout, onExit }) {
    this.prompts.push(prompt);
    const reply = this.nextReply;
    setImmediate(() => {
      onStdout(reply, 'text_delta');
      onExit(0);
    });
    return { kill: () => {} };
  }
}

function runTurn(engine, sessionId, message, extra = {}) {
  return new Promise((resolve, reject) => {
    const stream = engine.executeTurn({ sessionId, message, engine: 'spy', ...extra });
    stream.on('done', resolve);
    stream.on('error', (e) => reject(new Error(e.error)));
  });
}

const FLOW_QUESTION = '### Fase 1: Discovery y Marca\n\n#### Etapa 1.3: Modelo de Negocio\n\nSelecciona una opción:\n1. B2C\n2. B2B\n6. *(Escribir mi propia opción personalizada)*';

async function runSuite() {
  console.log('\n--- Test Suite: Flujo ante mensajes fuera de tema ---\n');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'off-topic-test-'));

  console.log('[1] Prompts enviados al motor:');
  await it('first-turn prompt should carry the deviation rule (directive 17)', async () => {
    const engine = new AgentEngine({ cwd: tmp });
    const spy = new SpyAdapter();
    engine.registerAdapter('spy', spy);
    await runTurn(engine, 's1', 'Acme');
    assert(spy.prompts[0].includes('17. MANEJO DE DESVÍOS'));
    assert(spy.prompts[0].includes('repite literalmente la pregunta pendiente'));
  });

  await it('follow-up turns should carry the deviation rule and the stage map', async () => {
    const engine = new AgentEngine({ cwd: tmp });
    const spy = new SpyAdapter();
    engine.registerAdapter('spy', spy);
    await runTurn(engine, 's2', 'Acme');
    await runTurn(engine, 's2', 'dame una receta de arepas');
    const second = spy.prompts[1];
    assert(second.includes('MANEJO DE DESVÍOS'));
    assert(second.includes('ETAPAS CANÓNICAS'));
    assert(second.includes('1.3 Modelo de Negocio'));
    assert(second.trim().endsWith('Mensaje actual del usuario: dame una receta de arepas'));
  });

  await it('should keep the pending flow question after an off-topic reply that does not restate it', async () => {
    const engine = new AgentEngine({ cwd: tmp });
    const spy = new SpyAdapter();
    engine.registerAdapter('spy', spy);

    spy.nextReply = FLOW_QUESTION;
    await runTurn(engine, 's3', 'Acme');
    spy.nextReply = 'La capital de Francia es París.';
    await runTurn(engine, 's3', '¿Cuál es la capital de Francia?');
    await runTurn(engine, 's3', '2');

    const third = spy.prompts[2];
    assert(third.includes('PASO PENDIENTE'), 'debe reinyectar el paso pendiente');
    assert(third.includes('Etapa 1.3: Modelo de Negocio'));
    assert(third.includes('2. B2B'));
  });

  await it('should not duplicate the pending step when the last exchange already contains it', async () => {
    const engine = new AgentEngine({ cwd: tmp });
    const spy = new SpyAdapter();
    engine.registerAdapter('spy', spy);

    spy.nextReply = FLOW_QUESTION;
    await runTurn(engine, 's4', 'Acme');
    await runTurn(engine, 's4', 'B2B');
    assert(!spy.prompts[1].includes('PASO PENDIENTE'));
    assert(spy.prompts[1].includes('ÚLTIMO INTERCAMBIO'));
  });

  await it('should move the pending step forward when the agent asks the next flow question', async () => {
    const engine = new AgentEngine({ cwd: tmp });
    const spy = new SpyAdapter();
    engine.registerAdapter('spy', spy);

    spy.nextReply = FLOW_QUESTION;
    await runTurn(engine, 's5', 'Acme');
    spy.nextReply = '#### Etapa 1.4: Logo de la Marca\n\n1. Tengo un logo existente';
    await runTurn(engine, 's5', 'B2B');
    spy.nextReply = 'Claro, una receta corta.';
    await runTurn(engine, 's5', 'dame una receta');
    await runTurn(engine, 's5', 'sigamos');

    const last = spy.prompts[3];
    assert(last.includes('Etapa 1.4: Logo de la Marca'));
    assert(!last.includes('PASO PENDIENTE (última pregunta del flujo aún sin responder; si el mensaje actual no la responde, repítela):\n### Fase 1: Discovery y Marca'));
  });

  await it('should accept a pendingStep from disk on the first turn of an engine (server restart)', async () => {
    const engine = new AgentEngine({ cwd: tmp });
    const spy = new SpyAdapter();
    engine.registerAdapter('spy', spy);
    await runTurn(engine, 's6', 'continuemos', { pendingStep: FLOW_QUESTION });
    assert(spy.prompts[0].includes('PASO PENDIENTE'));
    assert(spy.prompts[0].includes('Etapa 1.3: Modelo de Negocio'));
  });

  console.log('\n[2] Paso pendiente persistido en disco (Workspace.getPendingStep):');
  await it('should return the last flow message and ignore later deviations and synthetic messages', () => {
    const ws = new Workspace({ baseDir: path.join(tmp, 'projects') });
    assert.strictEqual(ws.getPendingStep(), null, 'sin proyecto no hay paso pendiente');

    ws.setProject('acme');
    assert.strictEqual(ws.getPendingStep(), null, 'sin historial no hay paso pendiente');

    ws.addChatMessage({ role: 'user', content: 'Acme' });
    ws.addChatMessage({ role: 'assistant', content: FLOW_QUESTION });
    ws.addChatMessage({ role: 'user', content: 'dame una receta' });
    ws.addChatMessage({ role: 'assistant', content: 'Arepas: harina, agua y sal.' });
    assert.strictEqual(ws.getPendingStep(), FLOW_QUESTION);

    ws.addChatMessage({ role: 'assistant', content: '#### Etapa 1.4: Logo\n1. Logo existente' });
    assert(ws.getPendingStep().includes('Etapa 1.4'));
  });

  await it('should not treat the synthetic resume message as a pending step', () => {
    const ws = new Workspace({ baseDir: path.join(tmp, 'projects2') });
    ws.setProject('beta');
    fs.writeFileSync(path.join(ws.getDir(), 'design-system-state.json'), JSON.stringify({ brand: { name: 'Beta' }, current_phase: 4 }));
    const history = ws.getChatHistory();
    assert(history.messages[0].synthetic === true);
    assert.strictEqual(ws.getPendingStep(), null);
  });

  console.log('\n[3] Acción pendiente persistida (lastAction):');
  await it('should keep lastAction through a deviation and clear it when the flow moves to a step without controls', () => {
    const ws = new Workspace({ baseDir: path.join(tmp, 'projects3') });
    ws.setProject('gamma');
    const chips = { stepId: '1.3', type: 'chips', title: 'Modelo', options: [] };

    ws.addChatMessage({ role: 'assistant', content: FLOW_QUESTION, action: chips });
    assert.strictEqual(ws.getChatHistory().lastAction.stepId, '1.3');

    // Desvío respondido sin título de Etapa/Fase: la acción pendiente sigue vigente
    ws.addChatMessage({ role: 'assistant', content: 'La capital de Francia es París.', action: null });
    assert.strictEqual(ws.getChatHistory().lastAction.stepId, '1.3');

    // El flujo avanza a una pregunta sin controles: la acción anterior deja de ser válida
    ws.addChatMessage({ role: 'assistant', content: '#### Etapa 2.1: Paleta\n\n¿Qué color primario prefieres?', action: null });
    assert.strictEqual(ws.getChatHistory().lastAction, null);
  });

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\nSummary: ${passedTests}/${totalTests} tests passed.`);
}

runSuite();
