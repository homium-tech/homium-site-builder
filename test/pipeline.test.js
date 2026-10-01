const assert = require('assert');
const { Pipeline } = require('../core/pipeline');

let passedTests = 0;
let totalTests = 0;

function it(desc, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✓ ${desc}`);
  } catch (err) {
    console.error(`  ✗ ${desc}`);
    console.error(err);
    process.exitCode = 1;
  }
}

console.log('\n--- Test Suite: Pipeline Deep Module ---\n');

// 1. Pipeline Lifecycle & Extensibility
console.log('[1] Pipeline Fases y Expansión:');
it('should initialize with 5 canonical phases and correct default properties', () => {
  const pipeline = new Pipeline();
  const phases = pipeline.getPhases();
  assert.strictEqual(phases.length, 5);
  assert.strictEqual(pipeline.isExpanded, false);
  assert.strictEqual(phases[0].slug, 'discovery');
  assert.strictEqual(phases[0].hasFastTrack, true);
  assert.strictEqual(phases[3].approvalGate, true);
  assert.strictEqual(phases[4].slug, 'prototype');
});

it('should look up phases by ID and slug', () => {
  const pipeline = new Pipeline();
  const phase1 = pipeline.getPhaseById(1);
  assert.strictEqual(phase1.slug, 'discovery');

  const phaseValidation = pipeline.getPhaseBySlug('validation');
  assert.strictEqual(phaseValidation.id, 4);
  assert.strictEqual(phaseValidation.gateTitle, 'Compuerta 1: Validación del Design System');

  assert.strictEqual(pipeline.getPhaseById(999), null);
  assert.strictEqual(pipeline.getPhaseBySlug('non-existent'), null);
});

it('should strictly maintain 5 canonical phases and refuse external phase 6 expansion', () => {
  const pipeline = new Pipeline();
  const phases = pipeline.enableAdvancedPhases(true);
  assert.strictEqual(phases.length, 5);
  assert.strictEqual(pipeline.isExpanded, false);
  assert.strictEqual(pipeline.getPhaseById(6), null);
  assert.strictEqual(pipeline.getPhaseBySlug('stack-scaffolding'), null);

  const collapsed = pipeline.enableAdvancedPhases(false);
  assert.strictEqual(collapsed.length, 5);
  assert.strictEqual(pipeline.isExpanded, false);
});

// 2. Server-side Action Detection & Sanitization
console.log('\n[2] Detección de Compuertas:');
it('should detect Gate 1 (Validación Showcase) and Gate 2 (Aprobación Prototipo)', () => {
  const pipeline = new Pipeline();
  const gate1Text = 'He compilado el showcase. ¿Apruebas el design system para proceder con la fase 5?';
  const gate1 = pipeline.detectAction(gate1Text);
  assert(gate1 !== null);
  assert.strictEqual(gate1.stepId, 'gate-1');
  assert.strictEqual(gate1.type, 'gate');
  assert.strictEqual(gate1.options.length, 2);
  assert.strictEqual(gate1.triggerPattern, undefined, 'triggerPattern must NOT be exposed');

  const gate2Text = 'El prototipo interactivo de 3 pantallas está listo. ¿Apruebas el prototipo final?';
  const gate2 = pipeline.detectAction(gate2Text);
  assert(gate2 !== null);
  assert.strictEqual(gate2.stepId, 'gate-2');
  assert.strictEqual(gate2.type, 'gate');
});

it('should detect the real gate wording from the phase docs and the mock engine', () => {
  const pipeline = new Pipeline();
  const gate1 = pipeline.detectAction('Showcase compilado.\n\n---\n\n#### Compuerta 1\n\n¿Apruebas el Design System y los tokens cromáticos para proceder a la construcción del Prototipo interactivo en HTML/CSS/JS?');
  assert.strictEqual(gate1.stepId, 'gate-1');
  const mock = pipeline.detectAction('Compuerta 1: ¿Apruebas el Design System y los tokens cromáticos para proceder a la construcción del Prototipo interactivo en HTML/CSS/JS?');
  assert.strictEqual(mock.stepId, 'gate-1');
  const gate2 = pipeline.detectAction('#### Compuerta 2\n\n¿Apruebas el Prototipo interactivo de 3 pantallas generado en prototype/?');
  assert.strictEqual(gate2.stepId, 'gate-2');
});

it('should match regardless of accents, markdown emphasis and case', () => {
  const pipeline = new Pipeline();
  assert.strictEqual(pipeline.detectAction('**¿APRUEBAS** el *Design System* para **proceder** a la **Fase 5**?').stepId, 'gate-1');
  assert.strictEqual(pipeline.detectAction('¿Apruebas el prototipo de 3 pantallas?').stepId, 'gate-2');
  assert.strictEqual(pipeline.detectAction('Compuerta 2 - Aprobacion final. Apruebas el prototipo?').stepId, 'gate-2');
});

it('should NOT open a gate from a closed gate, a progress message or a statement', () => {
  const pipeline = new Pipeline();
  const texts = [
    // Mensaje posterior a aprobar la compuerta 1
    'Compuerta 1 aprobada. Construyendo las 3 pantallas de la Fase 5 del prototipo interactivo.',
    'Compuerta 1 aprobada previamente. Avanzando a la Fase 5: prototipo interactivo de 3 pantallas en construcción.',
    // Cierre tras aprobar la compuerta 2
    'Prototipo aprobado. El prototipo interactivo de 3 pantallas es el entregable final del proyecto.',
    // Avance de la Fase 4 sin pregunta
    'Generando el showcase del Design System con las 14 secciones. El prototipo interactivo de 3 pantallas vendrá después.',
    'Entendido, analizando la estructura del proyecto y compilando dependencias...'
  ];
  for (const text of texts) {
    assert.strictEqual(pipeline.detectAction(text), null, `no debe abrir compuerta: ${text}`);
  }
});

it('should NOT open a gate from phase confirmations or other approval questions', () => {
  const pipeline = new Pipeline();
  const texts = [
    '¿Está correcta la información de la Fase 1 para avanzar a la Fase 2 (Foundations Visuales), o deseas volver a ajustar algún paso anterior?',
    '¿Confirmar la fase 3 para compilar el showcase y design system?',
    // Caso real: transición a Fase 4 no debe disparar la compuerta 1
    '¿Confirmas estos cimientos visuales de la Fase 3 para avanzar a la Fase 4: Validación Visual (Generación desacoplada: Spec Markdown Maestro + Showcase HTML), o deseas ajustar algún detalle?',
    // Caso real (redacción de references/phases/phase-3-components.md): cierre de la Fase 3 que nombra el showcase como algo por construir
    '¿Apruebas el catálogo consolidado para avanzar a la Fase 4 (Validación Visual), donde se construirán Devin_Design_System.md y el showcase vivo Devin_Design_System.html?',
    '¿Apruebas el catálogo para avanzar a la **Fase 4 (VALIDACIÓN VISUAL)** donde se generarán `Acme_Design_System.md` y `Acme_Design_System.html`?',
    '¿Apruebas esta paleta cromática para continuar con la tipografía?',
    '¿Cuál es el modelo de negocio de tu marca (B2C, B2B, SaaS)?',
    '¿Dispones de un logo existente o creamos un isotipo SVG minimalista?'
  ];
  for (const text of texts) {
    assert.strictEqual(pipeline.detectAction(text), null, `no debe abrir compuerta: ${text}`);
  }
});

it('should decide by the LAST question, so a mention of the other gate does not win', () => {
  const pipeline = new Pipeline();
  const text = 'Compuerta 1 aprobada previamente. ¿Apruebas el prototipo interactivo de 3 pantallas?';
  assert.strictEqual(pipeline.detectAction(text).stepId, 'gate-2');
  const back = 'El prototipo de 3 pantallas quedará después.\n\n¿Apruebas el Design System para construir el prototipo en la Fase 5?';
  assert.strictEqual(pipeline.detectAction(back).stepId, 'gate-1');
});

it('should ignore the cumulative Blueprint block and summary tables when detecting', () => {
  const pipeline = new Pipeline();
  const blueprint = [
    '> **Blueprint — Estado actual**',
    '> - Marca: Acme',
    '> - Fidelidad: Fast-Track',
    '> - Logo: Isotipo SVG',
    '> - Aprobado el prototipo: no',
    '',
    'Confirmado: paleta registrada.',
    '',
    '---',
    '',
    '#### Etapa 2.2: Tipografía',
    '',
    '| Campo | Valor |',
    '|---|---|',
    '| Apruebas el Design System | sí |',
    '',
    '¿Qué tipografía display prefieres?'
  ].join('\n');
  assert.strictEqual(pipeline.detectAction(blueprint), null);
});

// 3. Client Leakage Prevention & JSON Serialization Safety
console.log('\n[3] Inmunidad a Fugas de Regex y Serialización JSON Limpia:');
it('should guarantee all steps from getAllSteps are 100% serializable without empty regex objects', () => {
  const pipeline = new Pipeline();
  const steps = pipeline.getAllSteps();
  assert(Array.isArray(steps));
  assert.strictEqual(steps.length, 2, 'only the two approval gates are described by the server');

  const serialized = JSON.stringify(steps);
  const parsed = JSON.parse(serialized);

  for (const step of parsed) {
    assert.strictEqual(step.triggerPattern, undefined, `Step ${step.stepId} must not have triggerPattern`);
    assert.strictEqual(step.type, 'gate');
    assert(typeof step.title === 'string');
    assert(Array.isArray(step.options));
    assert(step.options.length > 0);
  }
});

it('should retrieve individual gate descriptors via getGate()', () => {
  const pipeline = new Pipeline();
  const gate1 = pipeline.getGate('gate-1');
  assert(gate1 !== null);
  assert.strictEqual(gate1.title, 'Compuerta 1: Aprobación del Design System');
  assert.strictEqual(pipeline.getGate('gate-2').options.length, 2);
  assert.strictEqual(pipeline.getGate('unknown-gate'), null);
});

it('should only consider a gate ready when its deliverable exists on disk', () => {
  const pipeline = new Pipeline();
  const gate1 = pipeline.getGate('gate-1');
  const gate2 = pipeline.getGate('gate-2');
  assert.strictEqual(pipeline.isGateReady(gate1, { showcaseExists: false, prototypeExists: false }), false);
  assert.strictEqual(pipeline.isGateReady(gate1, { showcaseExists: true, prototypeExists: false }), true);
  assert.strictEqual(pipeline.isGateReady(gate2, { showcaseExists: true, prototypeExists: false }), false);
  assert.strictEqual(pipeline.isGateReady(gate2, { showcaseExists: true, prototypeExists: true }), true);
  assert.strictEqual(pipeline.isGateReady(gate1, undefined), false);
  assert.strictEqual(pipeline.isGateReady(null, {}), true, 'sin acción no hay nada que bloquear');
});

// 4. Turnos desviados: la detección no debe dispararse por explicaciones ajenas
console.log('\n[4] Detección en turnos desviados:');
it('should NOT open a gate from an off-topic answer that only mentions flow terms', () => {
  const pipeline = new Pipeline();
  const cases = [
    ['dime qué es un prototipo interactivo', '¿Apruebas que un prototipo interactivo de 3 pantallas es común en UX para validar ideas?'],
    ['explícame qué es un design system', 'Un design system es un conjunto de tokens. ¿Apruebas el Design System para proceder a la Fase 5 de tu propio proyecto?']
  ];
  for (const [userMessage, reply] of cases) {
    assert.strictEqual(pipeline.detectAction(reply, { userMessage }), null, `no debe detectar acción para: ${userMessage}`);
  }
});

it('should detect the restated gate after a deviation answer when it carries the step heading', () => {
  const pipeline = new Pipeline();
  const reply = 'Un prototipo es una maqueta navegable.\n\n---\n\n### Fase 4: Validación Visual\n\n#### Etapa 4.3: Compuerta 1\n\n¿Apruebas el Design System para proceder a la construcción del prototipo en la Fase 5?';
  const action = pipeline.detectAction(reply, { userMessage: 'explícame qué es un prototipo' });
  assert(action !== null);
  assert.strictEqual(action.stepId, 'gate-1');
});

it('should ignore an explanation before --- even when the user message is a normal answer', () => {
  const pipeline = new Pipeline();
  const reply = '¿Apruebas el prototipo? es una pregunta que hacemos al final.\n\n---\n\n#### Etapa 2.2: Tipografía\n\n¿Qué tipografía display prefieres?';
  assert.strictEqual(pipeline.detectAction(reply, { userMessage: '2' }), null);
});

it('should keep detecting normal gate questions when the user message is not a question or request', () => {
  const pipeline = new Pipeline();
  const reply = 'Aprobado y registrado.\n\n---\n\n#### Compuerta 2\n\n¿Apruebas el prototipo de 3 pantallas?';
  assert.strictEqual(pipeline.detectAction(reply, { userMessage: 'Aprobado. Continúa.' }).stepId, 'gate-2');
});

it('PhaseDescriptors.detectAction should delegate to the same logic', () => {
  const { PhaseDescriptors } = require('../core/pipeline');
  const reply = '¿Apruebas el Design System para proceder con la Fase 5?';
  assert.strictEqual(PhaseDescriptors.detectAction(reply).stepId, 'gate-1');
  assert.strictEqual(PhaseDescriptors.detectAction(reply, { userMessage: '¿qué es un design system?' }), null);
});

console.log(`\n========================================`);
console.log(`Summary: ${passedTests}/${totalTests} tests passed.`);
console.log(`========================================\n`);

if (passedTests !== totalTests) {
  process.exitCode = 1;
}
