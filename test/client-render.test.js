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

  app.context.__snapshot = { status: { stateExists: true, specExists: true, specFile: EVIL, showcaseExists: true, showcaseFile: EVIL } };
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

console.log(`\nSummary: ${passedTests}/${totalTests} tests passed.`);
if (passedTests !== totalTests) process.exit(1);
