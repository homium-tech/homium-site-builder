const assert = require('assert');
const { loadApp } = require('./helpers/dom-sandbox');

// Lógica de render del cliente (public/app.js) ejecutada con un DOM simulado: verifica que los valores
// que llegan del estado (escrito por un LLM) o de errores del servidor no se inyecten como HTML.

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

const EVIL = '<img src=x onerror=alert(1)>';

function renderBlueprint(state) {
  const app = loadApp();
  app.context.__state = state;
  app.run('renderBlueprintRaw(__state)');
  return app.el('blueprintView').innerHTML;
}

function assertNoActiveMarkup(html, label) {
  assert(!/<img\b/i.test(html), `${label}: etiqueta <img> inyectada`);
  assert(!/<script\b/i.test(html), `${label}: etiqueta <script> inyectada`);
  assert(!/javascript:/i.test(html), `${label}: URL javascript: presente`);
  // Un manejador de evento solo es peligroso si está dentro de una etiqueta real
  const tags = html.match(/<[a-zA-Z](?:[^>"']|"[^"]*"|'[^']*')*>/g) || [];
  for (const tag of tags) {
    assert(!/\son[a-z]+\s*=/i.test(tag.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''")), `${label}: manejador de evento en ${tag}`);
  }
}

console.log('\n--- Test Suite: Render del cliente (app.js en vm) ---\n');

console.log('[1] Blueprint:');
it('should load app.js without a browser and render a legitimate state', () => {
  const html = renderBlueprint({
    brand: { name: 'Acme', purpose: 'Diseño web' },
    palette: { allowed_hexes: ['#0B2E5E', '#FFFFFF'], primary: '#0B2E5E', bg_base: '#101313' },
    typography: { font_display: 'Fira Code', font_ui: 'Rubik' }
  });
  assert(html.includes('Acme'));
  assert(html.includes('data-copy-hex="#0B2E5E"'));
  assert(html.includes("font-family: 'Fira Code', sans-serif"));
  assert(html.includes('Diseño web'));
});

it('should show a readable label when the logo is an object in the state, never [object Object]', () => {
  const html = renderBlueprint({
    brand: { name: 'Acme', logo: { type: 'SVG_ISOTYPE_TYPOGRAPHIC', source: 'generated' } }
  });
  assert(!html.includes('[object Object]'));
  assert(html.includes('SVG ISOTYPE TYPOGRAPHIC (generated)'));
});

it('should fall back to the Blueprint quote of the reply when the state lacks the Phase 1 keys', () => {
  const app = loadApp();
  app.context.__reply = [
    '> **Blueprint — Estado actual**',
    '> - Marca: Acme',
    '> - Propósito: Diseño y desarrollo web',
    '> - Modelo de negocio: B2B',
    '> - Logo: Isotipo SVG',
    '> - Fidelidad: Fast-Track',
    '',
    'Confirmado.',
    '',
    '---',
    '',
    '¿Siguiente?'
  ].join('\n');
  app.context.__state = { brand: { name: 'Acme' }, decisions: { '1.2': { texto: 'x' } } };
  app.run('syncBlueprintFromReply(__reply)');
  app.run('renderBlueprintRaw(deepMergeState(dynamicBlueprintState, __state))');
  const html = app.el('blueprintView').innerHTML;
  assert(html.includes('Diseño y desarrollo web'), 'propósito desde la cita');
  assert(html.includes('Isotipo SVG'), 'logo desde la cita');
  assert(html.includes('Fast-Track'), 'fidelidad desde la cita');
  assert(!html.includes('Pendiente de Definir'), 'sin pendientes');
});

it('should not repeat the numbered options in the message when the approval gate is active', () => {
  const app = loadApp();
  app.context.__text = '¿Apruebas el sistema de diseño?\n\n1. Aprobar y continuar\n2. Solicitar ajustes\n3. (Escribir mi propia opción personalizada)';
  const withButtons = app.run('renderAgentMessage(__text)');
  assert(withButtons.includes('inline-option'), 'sin compuerta las opciones son botones');
  const withGate = app.run('renderAgentMessage(__text, { gateActive: true })');
  assert(!withGate.includes('inline-option'), 'con compuerta no hay botones duplicados');
  assert(!withGate.includes('Aprobar y continuar'), 'con compuerta no se repite la lista');
  assert(withGate.includes('¿Apruebas el sistema de diseño?'), 'la pregunta se conserva');
});

it('should escape strings coming from the state before building innerHTML', () => {
  const html = renderBlueprint({
    brand: { name: EVIL, purpose: EVIL, business_model: EVIL, logo_type: EVIL },
    personality: { archetype: EVIL, tone: EVIL },
    sitemap: { site_type: EVIL, p1_home: true, p1_description: EVIL, mode: EVIL },
    geometry_tokens: { style: EVIL, radius_controls: EVIL },
    components: { buttons: { style: EVIL }, cards: { style: EVIL, border: EVIL, radius: EVIL } },
    typography: { character: EVIL, font_display: 'Rubik' },
    palette: { allowed_hexes: ['#0B2E5E'] }
  });
  assertNoActiveMarkup(html, 'estado hostil');
  assert(html.includes('&lt;img src=x onerror=alert(1)&gt;'), 'el texto se conserva escapado');
});

it('should drop colors that are not plain CSS colors instead of putting them in style attributes', () => {
  const html = renderBlueprint({
    brand: { name: 'Acme' },
    palette: {
      allowed_hexes: ['#0B2E5E', '#fff"><img src=x onerror=alert(1)>', 'red; background:url(javascript:alert(1))'],
      primary: 'red; background:url(javascript:alert(1))',
      secondary: '#fff" onmouseover="alert(1)',
      accent: '#00FFFF',
      bg_base: 'url(javascript:alert(1))',
      surface_card: '#171b1c',
      border_subtle: 'red;}</style><script>alert(1)</script>'
    },
    typography: { font_display: 'Rubik' }
  });
  assertNoActiveMarkup(html, 'colores hostiles');
  assert(html.includes('data-copy-hex="#0B2E5E"'));
  assert(!html.includes('data-copy-hex="#fff'), 'hex inválidos no se listan');
  assert(html.includes('#00FFFF'), 'los colores válidos se conservan');
});

it('should strip characters that could break out of a font-family declaration', () => {
  const html = renderBlueprint({
    brand: { name: 'Acme' },
    palette: { allowed_hexes: ['#0B2E5E'], primary: '#0B2E5E' },
    typography: { font_display: "Rubik'; } body { display:none } /*", font_ui: 'Inter", sans-serif; x:"', font_mono: "Fira'><script>alert(1)</script>" }
  });
  assertNoActiveMarkup(html, 'fuentes hostiles');
  assert(!html.includes("display:none }"), 'la declaración no puede cerrarse');
  assert(!html.includes("'; }"));
});

console.log('\n[2] Errores y adjuntos:');
it('should escape server error text shown in the chat and in system events', () => {
  const app = loadApp();
  app.run(`appendSystemEvent('${EVIL.replace(/'/g, "\\'")}')`);
  const chat = app.el('chatMessages');
  const eventNode = chat.children[chat.children.length - 1];
  assert(!/<img\b/i.test(eventNode.innerHTML));
  assert(eventNode.innerHTML.includes('&lt;img'));
});

it('should escape attachment names and tracker file names', () => {
  const app = loadApp();
  app.context.__files = [{ name: EVIL }];
  app.run('pendingAttachments = __files; renderAttachmentsTray();');
  assert(!/<img\b/i.test(app.el('attachmentsTray').innerHTML));

  app.context.__snapshot = { status: { stateExists: true, specExists: true, specFile: EVIL, designSystemExists: true, designSystemFile: EVIL } };
  app.run('updateDeliverablesTracker(__snapshot)');
  const pills = app.el('trackerPills').innerHTML;
  assert(!/<img\b/i.test(pills));
  assert(pills.includes('&lt;img'));
});

console.log('\n[3] Inferencia del Blueprint desde mensajes del usuario:');

function infer(...messages) {
  const app = loadApp();
  app.context.__messages = messages;
  app.run('__messages.forEach(m => inspectUserMessageForState(m)); dynamicBlueprintState');
  return app.run('JSON.parse(JSON.stringify(dynamicBlueprintState))');
}

it('should take a short answer as the brand but never commands, greetings or requests', () => {
  assert.strictEqual(infer('Acme').brand_name, 'Acme');
  assert.strictEqual(infer('Studio Alpha').brand_name, 'Studio Alpha');
  for (const text of ['No sé', 'Sí, avancemos', 'Buenos días', 'Crear sitio web', 'Empezar', '¿Qué es un isotipo?']) {
    assert.strictEqual(infer(text).brand_name, undefined, `no debe tomar como marca: ${text}`);
  }
});

it('should infer the business model only from short option-like answers, with the canonical label', () => {
  assert.strictEqual(infer('Acme', '2. B2B — Venta a empresas').business_model, 'B2B — Venta a empresas / corporativo');
  assert.strictEqual(infer('Acme', 'Marketplace').business_model, 'Marketplace — Plataforma multivendedor');
  const sentences = [
    'Somos una agencia de SaaS',
    'Vendemos software SaaS para agencias de marketing digital en toda Latinoamérica',
    'No quiero una agencia'
  ];
  for (const text of sentences) {
    assert.strictEqual(infer('Acme', text).business_model, undefined, `no debe inferir modelo de negocio de: ${text}`);
  }
});

console.log('\n[3] Stream del chat:');
it('should drop an aborted attempt when the engine sends a reset chunk', () => {
  const app = loadApp();
  // finished: true evita que el render diferido toque el DOM simulado
  const result = app.run(`(() => {
    const ctx = { fullResponse: '', finished: true };
    handleChatEvent({ name: 'chunk', data: { type: 'text_delta', text: 'Previo. ' } }, ctx);
    handleChatEvent({ name: 'chunk', data: { type: 'text_delta', text: 'Intento abortado' } }, ctx);
    handleChatEvent({ name: 'chunk', data: { type: 'reset', keep: 8, text: '' } }, ctx);
    handleChatEvent({ name: 'chunk', data: { type: 'text_delta', text: 'Intento completo' } }, ctx);
    return ctx.fullResponse;
  })()`);
  assert.strictEqual(result, 'Previo. Intento completo');
});

console.log('\n[3b] Compuerta con verificación automática:');
it('should render the audit results inside the gate and escape what the scripts report', () => {
  const app = loadApp();
  app.context.__audit = {
    summary: { fail: 1, warn: 0 },
    checks: [
      { id: 'spec', label: 'Especificación (.md)', status: 'fail', errors: [`Placeholders: ${EVIL}`], warnings: [] },
      { id: 'palette', label: 'Paleta permitida', status: 'pass', errors: [], warnings: [] }
    ]
  };
  const html = app.run('renderGateAudit(__audit)');
  assert(html.includes('Con errores (1)') && html.includes('Sin problemas'));
  app.context.__mixed = { summary: { fail: 1, warn: 0 }, checks: [{ id: 'a11y', label: 'A11y', status: 'fail', errors: ['e1', 'e2'], warnings: ['w1', 'w2', 'w3'] }, { id: 'w', label: 'W', status: 'warn', errors: [], warnings: ['w1'] }] };
  const mixed = app.run('renderGateAudit(__mixed)');
  assert(mixed.includes('Con errores (2) · 3 avisos') && mixed.includes('Con advertencias (1)'), 'el contador no mezcla errores y avisos');
  assert(html.includes('hay errores que conviene revisar antes de aprobar'));
  assertNoActiveMarkup(html, 'auditoría de la compuerta');
  assert.strictEqual(app.run('renderGateAudit(null)'), '');
  assert.strictEqual(app.run('renderGateAudit({ checks: [] })'), '');
});

console.log('\n[3b2] Informe de limitaciones de fidelidad en la compuerta:');
it('should render what could not be replicated, grouped by kind, and escape everything the report carries', () => {
  const app = loadApp();
  app.context.__fidelity = {
    mode: 'TOTAL_ARCHITECTURAL_FIDELITY',
    items: [
      { kind: 'sustituido', title: `No se usó la fuente ${EVIL}`, reason: `Propietaria ${EVIL}`, instead: `Syne ${EVIL}` },
      { kind: 'no_replicado', title: 'Scroll suave', reason: 'Sin librería' },
      { kind: 'nota_agente', title: EVIL, reason: EVIL, instead: EVIL },
      { kind: 'desconocido', title: 'No debe pintarse', reason: 'x' }
    ],
    coverage: { available: false },
    verify: { at: '2026-10-01T10:00:00Z', hero: 0.9, full_page: 0.55, stale: true }
  };
  const html = app.run('renderFidelityReport(__fidelity)');
  assert(html.includes('Qué no se pudo replicar y por qué'));
  assert(html.includes('Sustituido') && html.includes('No replicado') && html.includes('Nota del agente'));
  assert(html.includes('En su lugar:') && html.includes('Motivo:'));
  assert(!html.includes('No debe pintarse'), 'los tipos desconocidos no se pintan');
  assert(html.includes('hero 90 %') && html.includes('página completa 55 %') && html.includes('desactualizada'));
  assertNoActiveMarkup(html, 'informe de fidelidad');
  assert.strictEqual(app.run('renderFidelityReport(null)'), '');
  assert.strictEqual(app.run('renderFidelityReport({ items: [] })'), '');
});

console.log('\n[3c] Blueprint plegado en el chat:');
it('should fold the cumulative Blueprint block into a collapsed details and keep the question visible', () => {
  const app = loadApp();
  app.context.__msg = [
    '> **Blueprint — Estado actual**',
    '> - Marca: Devin',
    '> - Propósito: Diseño web',
    '',
    'Cierre de la decisión anterior.',
    '',
    '---',
    '',
    '#### Etapa 1.3: Modelo de Negocio',
    '',
    '¿Cuál es el modelo?',
    '',
    '1. B2C',
    '2. B2B',
    '3. *(Escribir mi propia opción personalizada)*'
  ].join('\n');
  const html = app.run('renderAgentMessage(__msg)');
  assert(/^<details class="chat-blueprint">/.test(html), 'el Blueprint va primero y plegado');
  assert(!/<details[^>]*\bopen\b/.test(html));
  assert(html.includes('Blueprint — Estado actual') && html.includes('2 datos') && html.includes('Marca: Devin'));
  const outside = html.split('</details>')[1];
  assert(outside.includes('Etapa 1.3') && outside.includes('¿Cuál es el modelo?'), 'la pregunta queda fuera del bloque plegado');
  assert(outside.includes('class="inline-options"'), 'las opciones siguen siendo botones');
  assert(!outside.includes('Marca: Devin'));
});

it('should leave messages without a Blueprint block untouched and escape the folded content', () => {
  const app = loadApp();
  app.context.__plain = 'Respuesta breve sin Blueprint.';
  assert.strictEqual(app.run('renderAgentMessage(__plain)'), app.run('formatText(__plain)'));
  app.context.__evil = `> **Blueprint — Estado actual**\n> - Marca: ${EVIL}\n\nTexto`;
  assertNoActiveMarkup(app.run('renderAgentMessage(__evil)'), 'Blueprint plegado');
});

console.log('\n[3d] Proyecto finalizado:');
it('should show the finished-project card with the deliverables, never over a gate, and remove it when the state changes', () => {
  const app = loadApp();
  const container = app.el('approvalGateContainer');
  app.context.__done = { status: 'PROYECTO_FINALIZADO', artifacts: { design_system_html: 'Acme_Design_System.html', prototype_screen_1: 'prototype/index.html', empty: null } };
  app.run('renderProjectFinished(__done)');
  assert(container.innerHTML.includes('Proyecto finalizado') && container.innerHTML.includes('Descargar proyecto'));
  assert(container.innerHTML.includes('Acme_Design_System.html') && container.innerHTML.includes('prototype/index.html'));
  assert.strictEqual(container.style.display, 'block');

  // El DOM simulado no resuelve selectores: se simula lo que el navegador devolvería
  container.querySelector = (sel) => (sel === '.project-finished' && container.innerHTML.includes('project-finished') ? {} : null);
  app.context.__running = { status: 'EN_CURSO' };
  app.run('renderProjectFinished(__running)');
  assert.strictEqual(container.innerHTML, '');

  // Una compuerta abierta no se pisa
  container.innerHTML = '<div class="approval-gate-banner">gate</div>';
  container.querySelector = (sel) => (sel === '.approval-gate-banner' ? {} : null);
  app.run('renderProjectFinished(__done)');
  assert.strictEqual(container.innerHTML, '<div class="approval-gate-banner">gate</div>');
});

it('should escape the artifact names of the finished-project card', () => {
  const app = loadApp();
  app.context.__evil = { status: 'PROYECTO_FINALIZADO', artifacts: { a: EVIL } };
  app.run('renderProjectFinished(__evil)');
  assertNoActiveMarkup(app.el('approvalGateContainer').innerHTML, 'tarjeta de proyecto finalizado');
});

console.log('\n[4] Indicador En vivo / Pausado:');
it('should show En vivo, pause on a manual tab choice and resume when the phase target changes', () => {
  const app = loadApp();
  const label = () => app.el('followLiveLabel').textContent;
  app.run('followLiveTab({ phase: 1, designSystemExists: false, prototypeExists: false })');
  assert.strictEqual(label(), 'En vivo');

  app.run('followPaused = true; renderFollowIndicator()');
  assert.strictEqual(label(), 'Pausado');
  assert(/pausado/i.test(app.el('followIndicator').title));

  // Misma fase: sigue pausado; al cambiar la pestaña objetivo (fase 4 = Design System) se reanuda sola
  app.run('followLiveTab({ phase: 2, designSystemExists: false, prototypeExists: false })');
  assert.strictEqual(label(), 'Pausado');
  app.run('followLiveTab({ phase: 4, designSystemExists: false, prototypeExists: false })');
  assert.strictEqual(label(), 'En vivo');
});

it('should be a read-only indicator: no toggle button or click handler, and the old key is cleaned up', () => {
  const fs = require('fs');
  const path = require('path');
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf-8');
  assert(!/id="btnFollowLive"/.test(html), 'el botón ya no existe');
  assert(/<span[^>]*id="followIndicator"/.test(html), 'el indicador es un span, no un botón');

  const app = loadApp({ storage: { homium_follow_live: 'off' } });
  assert.strictEqual(app.run('typeof renderFollowButton'), 'undefined');
  assert.strictEqual(app.run('localStorage.getItem("homium_follow_live")'), null);
});

console.log(`\nSummary: ${passedTests}/${totalTests} tests passed.`);
if (passedTests !== totalTests) process.exit(1);
