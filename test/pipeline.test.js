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
console.log('\n[2] Detección Semántica de Acciones y Compuertas:');
it('should detect Step 1.3 (Modelo de Negocio) and return sanitized action', () => {
  const pipeline = new Pipeline();
  const text = 'Para continuar, ¿cuál es el modelo de negocio de tu marca (b2c, b2b, saas)?';
  const action = pipeline.detectAction(text);
  assert(action !== null);
  assert.strictEqual(action.stepId, '1.3');
  assert.strictEqual(action.type, 'chips');
  assert.strictEqual(action.options.length, 6, 'Should contain 5 preset options + 1 custom option');
  assert.strictEqual(action.triggerPattern, undefined, 'triggerPattern must NOT be exposed');

  // Verificar que también detecte fraseos alternativos como "modelo comercial"
  const altText = 'Paso 1.2 — Audiencia objetivo y modelo de negocio: ¿cuál es su modelo comercial?';
  const altAction = pipeline.detectAction(altText);
  assert(altAction !== null);
  assert.strictEqual(altAction.stepId, '1.3');
});

it('should detect Step 1.4 (Logo / Isotipo)', () => {
  const pipeline = new Pipeline();
  const text = '¿Dispones de un logo existente o creamos un isotipo SVG minimalista?';
  const action = pipeline.detectAction(text);
  assert(action !== null);
  assert.strictEqual(action.stepId, '1.4');
  assert.strictEqual(action.options.length, 3, 'Should contain 2 preset options + 1 custom option');
});

it('should detect Step 1.5.a (Referencias Visuales)', () => {
  const pipeline = new Pipeline();
  const text = '¿Tienes sitios web de referencia visual o URLs para inspirar la identidad?';
  const action = pipeline.detectAction(text);
  assert(action !== null);
  assert.strictEqual(action.stepId, '1.5.a');
  assert.strictEqual(action.type, 'chips');
  assert.strictEqual(action.options.length, 4, 'Should contain 3 preset options + 1 custom option');
});

it('should detect Step 1.5.b (Nivel de Fidelidad / Fast-Track)', () => {
  const pipeline = new Pipeline();
  const text = 'Indica el nivel de fidelidad deseado: [Fidelidad Arquitectónica Total] con Fast-Track o Inspiración?';
  const action = pipeline.detectAction(text);
  assert(action !== null);
  assert.strictEqual(action.stepId, '1.5.b');
  assert.strictEqual(action.type, 'cards');
  assert.strictEqual(action.options[0].badge, 'Recomendado');
});

it('should detect Gate 1 (Validación Showcase) and Gate 2 (Aprobación Prototipo)', () => {
  const pipeline = new Pipeline();
  const gate1Text = 'He compilado el showcase. ¿Apruebas el design system para proceder con la fase 5?';
  const gate1 = pipeline.detectAction(gate1Text);
  assert(gate1 !== null);
  assert.strictEqual(gate1.stepId, 'gate-1');
  assert.strictEqual(gate1.type, 'gate');
  assert.strictEqual(gate1.options.length, 2);

  const gate2Text = 'El prototipo interactivo de 3 pantallas está listo. ¿Apruebas el prototipo final?';
  const gate2 = pipeline.detectAction(gate2Text);
  assert(gate2 !== null);
  assert.strictEqual(gate2.stepId, 'gate-2');
  assert.strictEqual(gate2.type, 'gate');
});

it('should NOT trigger Step 1.3 on Phase 1 summary table and should detect Phase 1 confirmation', () => {
  const pipeline = new Pipeline();
  const summaryText = `
Resumen de la Fase 1: Identidad & Discovery

| Parámetro | Valor Registrado |
|---|---|
| Marca | HomeDev |
| Propósito & Misión | Diseño y desarrollo web |
| Modelo de Negocio | Servicios Profesionales / Agencia / Consultoría |
| Logo / Isotipo | Generar Isotipo SVG / Logo Tipográfico limpio |
| Ruta de Trabajo | Ruta B (Entrevista Estándar) — Diseño original sin referencias |

El estado ha sido guardado en design-system-state.json.

¿Está correcta la información de la Fase 1 para avanzar a la Fase 2 (Tipo de Sitio & Arquitectura de Páginas), o deseas volver a ajustar algún paso anterior?
  `;
  const action = pipeline.detectAction(summaryText);
  assert(action !== null);
  assert.strictEqual(action.stepId, '1.summary');
  assert.strictEqual(action.title, '¿Confirmar Fase 1 y avanzar a la Fase 2?');
  assert.strictEqual(action.options.length, 2);
});

it('should detect Phase 2 and Phase 3 confirmations', () => {
  const pipeline = new Pipeline();
  const phase2Text = '¿Está correcta la información de la Fase 2 para avanzar a la Fase 3?';
  const a2 = pipeline.detectAction(phase2Text);
  assert(a2 !== null);
  assert.strictEqual(a2.stepId, '2.summary');

  const phase3Text = '¿Confirmar la fase 3 para compilar el showcase y design system?';
  const a3 = pipeline.detectAction(phase3Text);
  assert(a3 !== null);
  assert.strictEqual(a3.stepId, '3.summary');
});

it('should return null when text contains no structured triggers', () => {
  const pipeline = new Pipeline();
  const text = 'Entendido, analizando la estructura del proyecto y compilando dependencias...';
  const action = pipeline.detectAction(text);
  assert.strictEqual(action, null);
});

// 3. Client Leakage Prevention & JSON Serialization Safety
console.log('\n[3] Inmunidad a Fugas de Regex y Serialización JSON Limpia:');
it('should guarantee all steps from getAllSteps are 100% serializable without empty regex objects', () => {
  const pipeline = new Pipeline();
  const steps = pipeline.getAllSteps();
  assert(Array.isArray(steps));
  assert(steps.length >= 6);

  const serialized = JSON.stringify(steps);
  const parsed = JSON.parse(serialized);

  // Asegurar que ningún triggerPattern existe en el JSON emitido
  for (const step of parsed) {
    assert.strictEqual(step.triggerPattern, undefined, `Step ${step.stepId} must not have triggerPattern`);
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
  assert.strictEqual(pipeline.getGate('unknown-gate'), null);
});

console.log(`\n========================================`);
console.log(`Summary: ${passedTests}/${totalTests} tests passed.`);
console.log(`========================================\n`);

if (passedTests !== totalTests) {
  process.exitCode = 1;
}
