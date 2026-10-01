const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { AgentEngine } = require('../lib/agent-engine');
const SessionStore = require('../lib/agent-engine/session-store');
const rules = require('../core/prompts/system-rules');

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

async function runSuite() {
  console.log('\n--- Test Suite: Contrato de prompts ---\n');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-contract-'));

  console.log('[1] Herramientas de la app (APP_ROOT):');
  await it('APP_ROOT should point at the repository that holds scripts, templates and phase docs', () => {
    for (const rel of ['scripts/extract_reference_dna.cjs', 'scripts/verify_fidelity.cjs', 'scripts/audit_showcase.cjs', 'scripts/audit_spec.cjs', 'scripts/audit_prototype.cjs', 'templates/design-system.html', 'references/phases/phase-4-validation.md']) {
      assert(fs.existsSync(path.join(rules.APP_ROOT, rel)), `${rel} debe existir bajo APP_ROOT`);
    }
  });

  await it('activation prompt should use absolute tool paths and resolve every placeholder', () => {
    const prompt = rules.buildActivationPrompt('Acme', { workspaceDir: tmp });
    assert(!prompt.includes('{{APP_ROOT}}') && !prompt.includes('{{WORKSPACE_DIR}}'), 'placeholders sin resolver');
    assert(prompt.includes(`${rules.APP_ROOT}/templates/design-system.html`), 'plantilla con ruta absoluta');
    assert(prompt.includes('scripts/extract_reference_dna.cjs'));
    assert(!/node scripts\//.test(prompt), 'ningún comando puede usar una ruta relativa al workspace');
  });

  await it('every follow-up turn should carry the format invariants, the tool paths and the revision/state rules', async () => {
    const engine = new AgentEngine({ cwd: tmp });
    const spy = new SpyAdapter();
    engine.registerAdapter('spy', spy);
    await runTurn(engine, 'inv', 'Acme');
    await runTurn(engine, 'inv', 'B2B');
    await runTurn(engine, 'inv', 'sigue');

    for (const prompt of spy.prompts.slice(1)) {
      assert(prompt.includes('FORMATO OBLIGATORIO DE CADA RESPUESTA'), 'invariantes de formato');
      assert(prompt.includes('HEX con #'), 'regla de HEX con #');
      assert(prompt.includes('cero <br> en tablas'));
      assert(prompt.includes('opción personalizada'));
      assert(prompt.includes(`APP_ROOT=${rules.APP_ROOT}`), 'ruta absoluta de las herramientas');
      assert(prompt.includes('REVISIONES:') && prompt.includes('Nuevo proyecto'));
      assert(prompt.includes('CONTRATO DE ESTADO') && prompt.includes('phase_1_complete'));
      assert(prompt.includes('2.1 Paleta cromática') && prompt.includes('1.3 Modelo de Negocio'));
      assert(/Mensaje actual del usuario: \S+$/.test(prompt.trim()), 'el mensaje del usuario cierra el prompt');
    }
  });

  console.log('\n[2] Tamaño del contexto reinyectado:');
  await it('should send a bounded digest of design-system-state.json instead of the whole file', async () => {
    const dir = fs.mkdtempSync(path.join(tmp, 'big-'));
    const hugeState = {
      brand: { name: 'Acme' },
      current_phase: 3,
      current_stage: '3.2',
      phase_1_complete: true,
      phase_2_complete: true,
      palette: { allowed_hexes: ['#0B2E5E', '#FFFFFF'] },
      structural_blueprint: { sections: Array.from({ length: 4000 }, (_, i) => ({ id: i, html: 'x'.repeat(40) })) }
    };
    fs.writeFileSync(path.join(dir, 'design-system-state.json'), JSON.stringify(hugeState));
    assert(fs.statSync(path.join(dir, 'design-system-state.json')).size > 150000);

    const engine = new AgentEngine({ cwd: dir });
    const spy = new SpyAdapter();
    engine.registerAdapter('spy', spy);
    await runTurn(engine, 'big', 'Acme');
    await runTurn(engine, 'big', 'sigue');

    const second = spy.prompts[1];
    assert(second.length < 9000, `el prompt de seguimiento debe ser acotado (fue ${second.length} caracteres)`);
    assert(second.includes('ESTADO EN DISCO (resumen'));
    assert(second.includes('"current_stage":"3.2"') && second.includes('"completed_phases":[1,2]') && second.includes('"allowed_hexes_count":2'));
    assert(!second.includes('xxxxxxxxxx'), 'el contenido del blueprint no se reenvía');
    assert(second.includes('relee el archivo completo'));
  });

  await it('should tell the agent when design-system-state.json is not valid JSON instead of hiding it', async () => {
    const dir = fs.mkdtempSync(path.join(tmp, 'corrupt-'));
    fs.writeFileSync(path.join(dir, 'design-system-state.json'), '{"brand": {"name": "Ac');
    const engine = new AgentEngine({ cwd: dir });
    const spy = new SpyAdapter();
    engine.registerAdapter('spy', spy);
    await runTurn(engine, 'bad', 'Acme');
    await runTurn(engine, 'bad', 'sigue');
    assert(spy.prompts[1].includes('no es JSON válido'));
  });

  await it('buildStateDigest should tolerate unexpected shapes', () => {
    assert.strictEqual(rules.buildStateDigest(null), '');
    assert.strictEqual(rules.buildStateDigest([1, 2]), '');
    assert.strictEqual(rules.buildStateDigest('x'), '');
    assert(rules.buildStateDigest({ brand: 'Solo texto' }).includes('"brand":"Solo texto"'));
  });

  await it('should clip the last exchange keeping the end of the assistant reply (where the pending question is)', () => {
    const store = new SessionStore();
    store.getOrCreate('clip', 'spy');
    store.addMessage('clip', 'user', 'u'.repeat(2000));
    store.addMessage('clip', 'assistant', 'INICIO-' + 'a'.repeat(9000) + '-FINAL: ¿Qué opción eliges?');
    const exchange = store.getLastExchange('clip');
    assert(exchange.length < 2400, `intercambio acotado (fue ${exchange.length})`);
    assert(exchange.includes('-FINAL: ¿Qué opción eliges?'));
    assert(!exchange.includes('INICIO-'));
  });

  await it('should still skip the pending block when the clipped exchange already ends with it, and keep it otherwise', async () => {
    const engine = new AgentEngine({ cwd: tmp });
    const spy = new SpyAdapter();
    engine.registerAdapter('spy', spy);
    const question = '#### Etapa 1.3: Modelo de Negocio\n\nSelecciona una opción:\n1. B2C\n2. B2B\n3. *(Escribir mi propia opción personalizada)*';

    spy.nextReply = question;
    await runTurn(engine, 'pend', 'Acme');
    await runTurn(engine, 'pend', 'B2B');
    assert(!spy.prompts[1].includes('PASO PENDIENTE'), 'ya está en el último intercambio');

    // Tras una respuesta larga y ajena, el último intercambio ya no contiene la pregunta: debe reinyectarse
    spy.nextReply = 'Respuesta larga. ' + 'relleno '.repeat(400);
    await runTurn(engine, 'pend', 'dame un dato curioso');
    await runTurn(engine, 'pend', '2');
    const last = spy.prompts[3];
    assert(last.includes('PASO PENDIENTE'));
    assert(last.includes('Etapa 1.3: Modelo de Negocio'));
    assert(last.indexOf('PASO PENDIENTE') > last.indexOf('ÚLTIMO INTERCAMBIO'), 'el paso pendiente va justo antes del mensaje');
    assert(last.trim().endsWith('Mensaje actual del usuario: 2'));
  });

  console.log('\n[3] Coherencia de las directivas:');
  await it('should require measured accessibility claims and a short closing message', () => {
    const d = rules.SYSTEM_DIRECTIVES;
    assert(d.includes('audit_prototype.cjs') && /anillo de foco cumple >= 3:1/.test(d), 'la directiva 8 exige foco >= 3:1 y audit_prototype');
    assert(/no declares como verificado nada que/.test(d), 'no se declara verificado lo que ningún script midió');
    assert(/mensaje de cierre tras aprobar la compuerta 2 es breve/.test(d), 'el cierre final es breve');
  });

  await it('should not contradict itself: no bracket templates, no emoji swatches, 14 showcase sections', () => {
    const d = rules.SYSTEM_DIRECTIVES;
    assert(!/\[Nombre del Componente\]|\[descripción|\[valor|\[HEX\]|\[fuente\]/i.test(d), 'plantillas con corchetes contradicen la directiva 11');
    assert(d.includes('CERO EMOJIS (INTERFAZ Y CHAT)'));
    assert(d.includes('14 secciones canónicas') && !d.includes('15 secciones'));
    assert(d.includes('18. REVISIONES') && d.includes('19. CONTRATO DE ESTADO'));
    assert(d.includes('17. MANEJO DE DESVÍOS') && d.includes('Directiva 18'), 'el desvío reconoce la excepción de revisiones');
  });

  await it('should describe one order for every reply: blueprint, feedback, separator, title, question', () => {
    assert(rules.SYSTEM_DIRECTIVES.includes('el bloque Blueprint acumulativo de la Directiva 15'));
    assert(rules.FORMAT_INVARIANTS.indexOf('Blueprint') < rules.FORMAT_INVARIANTS.indexOf('línea ---'));
  });

  await it('should keep the compact turn prompt well below the full activation prompt', () => {
    const turn = rules.buildTurnPrompt('hola', { workspaceDir: tmp });
    const activation = rules.buildActivationPrompt('hola', { workspaceDir: tmp });
    assert(turn.length < activation.length / 2);
    assert(turn.length < 6000, `turno compacto: ${turn.length}`);
  });

  await it('should ask for the URL or attachment alone after the user picks a reference type, before the fidelity question', () => {
    assert(/SOLO la URL o el adjunto/.test(rules.STAGE_MAP), 'el mapa por turno lo repite');
    assert(/SOLO la URL o el adjunto/.test(rules.SYSTEM_DIRECTIVES), 'el prompt de activación lo incluye');
    const phase1 = fs.readFileSync(path.join(__dirname, '..', 'references', 'phases', 'phase-1-discovery.md'), 'utf-8');
    assert(/ELEGIR UNA OPCIÓN NO ES ENTREGAR LA REFERENCIA/.test(phase1));
    assert(phase1.indexOf('ELEGIR UNA OPCIÓN NO ES ENTREGAR') < phase1.indexOf('#### Etapa 1.5.2'), 'la regla precede a la pregunta de fidelidad');
  });

  await it('should place the Brand Equalizer at the end of Phase 1, before palette and typography (document order), with no Stage 2.3', () => {
    const map = rules.STAGE_MAP;
    assert(map.includes('1.6 Personalidad visual'));
    assert(map.indexOf('1.6 Personalidad') < map.indexOf('Fase 2 Foundations'), 'el ecualizador va antes de la Fase 2');
    assert(!/2\.3 Personalidad/.test(map) && !/Etapa 2\.3/.test(rules.SYSTEM_DIRECTIVES), 'no queda una Etapa 2.3 de personalidad');
    assert(/Etapa 1\.6 → Arquetipo/.test(rules.SYSTEM_DIRECTIVES), 'el Blueprint acumula el arquetipo en 1.6');

    const phase1 = fs.readFileSync(path.join(__dirname, '..', 'references', 'phases', 'phase-1-discovery.md'), 'utf-8');
    const phase2 = fs.readFileSync(path.join(__dirname, '..', 'references', 'phases', 'phase-2-foundations.md'), 'utf-8');
    assert(/### Etapa 1\.6 — Personalidad Visual/.test(phase1));
    assert(!/## Etapa 2\.3 — Personalidad Visual/.test(phase2));
    const equalizer = fs.readFileSync(path.join(__dirname, '..', 'references', 'brand-equalizer.md'), 'utf-8');
    assert(!/\*\*opcional\*\*/i.test(equalizer) && !/Este feature es OPCIONAL/.test(equalizer));
  });

  await it('should carry the golden rule (ask instead of assuming, inferences are hypotheses) in the full and the compact prompt', () => {
    assert(rules.SYSTEM_DIRECTIVES.includes('REGLA DE ORO'));
    assert(/HIPÓTESIS/.test(rules.SYSTEM_DIRECTIVES));
    const turn = rules.buildTurnPrompt('hola', { workspaceDir: tmp });
    assert(turn.includes('Regla de oro'));
  });

  await it('should ask the agent to persist density_mode and modular_scale, derived rather than asked', () => {
    assert(rules.STATE_CONTRACT.includes('density_mode') && rules.STATE_CONTRACT.includes('modular_scale'));
    assert(/density_mode/.test(rules.SYSTEM_DIRECTIVES) && /hipótesis editable/.test(rules.SYSTEM_DIRECTIVES));
  });

  fs.rmSync(tmp, { recursive: true, force: true });

  console.log(`\n========================================`);
  console.log(`Summary: ${passedTests}/${totalTests} tests passed.`);
  console.log(`========================================\n`);

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runSuite();
