const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

// Scripts que los agentes ejecutan desde el workspace: compile_design_system, audit_design_system y verify_fidelity.
// Se invocan con rutas absolutas y desde otra carpeta, como hace el prompt.

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

const ROOT = path.join(__dirname, '..');
const script = (name) => path.join(ROOT, 'scripts', name);
const run = (name, args, cwd) => spawnSync(process.execPath, [script(name), ...args], { cwd, encoding: 'utf-8' });

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scripts-test-'));

const STATE = {
  brand: { name: 'Acme Labs', purpose: 'Diseño web' },
  palette: {
    primary: '#0B2E5E', secondary: '#8899AA', accent: '#00B2D6', bg_base: '#101313', surface_card: '#171b1c', text_primary: '#F1F3F3',
    allowed_hexes: ['#0B2E5E', '#8899AA', '#00B2D6', '#101313', '#171b1c', '#F1F3F3', '#FFFFFF']
  },
  typography: { font_display: 'Rubik', font_ui: 'Inter', font_mono: 'Fira Code' }
};

console.log('\n--- Test Suite: Scripts de la app (rutas absolutas desde el workspace) ---\n');

console.log('[1] compile_design_system + audit_design_system (14 secciones):');
it('should refuse to guess a project when no state path is given', () => {
  const res = run('compile_design_system.cjs', [], tmp);
  assert.notStrictEqual(res.status, 0);
  assert(/Uso: node compile_design_system\.cjs/.test(res.stderr), res.stderr);
});

it('should compile the Design System for the documented palette schema without leaking the sample brand', () => {
  const workspace = fs.mkdtempSync(path.join(tmp, 'ws-'));
  fs.writeFileSync(path.join(workspace, 'design-system-state.json'), JSON.stringify(STATE));
  const res = run('compile_design_system.cjs', ['design-system-state.json'], workspace);
  assert.strictEqual(res.status, 0, res.stderr);

  const out = path.join(workspace, 'AcmeLabs_Design_System.html');
  assert(fs.existsSync(out), 'el archivo se nombra <Marca>_Design_System.html junto al state.json');
  const html = fs.readFileSync(out, 'utf-8');
  assert(html.includes('Acme Labs'));
  assert(html.includes('#0B2E5E') && html.includes('#00B2D6'), 'usa los colores del state, no los de la marca de ejemplo');
  assert(!/ViewDev/.test(html), 'no debe quedar rastro de la marca de ejemplo');
  assert(!/\{\{[A-Z0-9_-]+\}\}/.test(html), 'sin placeholders sin reemplazar');
  assert(!html.includes('id="sec-sitemap"'), 'la fase de sitemap ya no existe');
  assert.strictEqual((html.match(/id="sec-[a-z-]+"/g) || []).length, 14);
});

it('the audit should accept a 14-section Design System and flag a missing canonical section', () => {
  const workspace = fs.mkdtempSync(path.join(tmp, 'ws-'));
  fs.writeFileSync(path.join(workspace, 'design-system-state.json'), JSON.stringify(STATE));
  run('compile_design_system.cjs', ['design-system-state.json'], workspace);
  const file = path.join(workspace, 'AcmeLabs_Design_System.html');

  const ok = run('audit_design_system.cjs', [file], workspace);
  assert.strictEqual(ok.status, 0, ok.stdout);
  assert(!/sec-sitemap/.test(ok.stdout), 'no debe exigir una sección de sitemap');

  fs.writeFileSync(file, fs.readFileSync(file, 'utf-8').replace('id="sec-motion"', 'id="sec-otra"'));
  const broken = run('audit_design_system.cjs', [file], workspace);
  assert.strictEqual(broken.status, 1);
  assert(broken.stdout.includes('#sec-motion'));
});

it('the audit should fail a table nested inside <tbody>, which makes the browser push later sections out of <main>', () => {
  const { findStructureProblems } = require(script('html-structure.cjs'));
  assert.strictEqual(findStructureProblems('<main><table><tbody><tr><td>a</td></tr></tbody></table></main>').length, 0);
  assert.strictEqual(findStructureProblems('<ul><li>a<li>b</ul><p>x<p>y<script>if (a < b) { x("</div>") }</script>').length, 0, 'cierres opcionales y scripts no son errores');
  const nested = findStructureProblems('<main><table><tbody><div class="table-wrap"><table><tbody><tr><td>a</td></tr></tbody></table></div></tbody></table></main>');
  assert(nested.some(p => /<div> dentro de <tbody>/.test(p.message)), JSON.stringify(nested));
  assert(findStructureProblems('<main><section><div>a</div></div></section></main>').some(p => /sin etiqueta de apertura/.test(p.message)));
  assert(findStructureProblems('<main><div><section>a</section></main>').some(p => /nunca se cierra/.test(p.message)));

  const workspace = fs.mkdtempSync(path.join(tmp, 'ws-'));
  fs.writeFileSync(path.join(workspace, 'design-system-state.json'), JSON.stringify(STATE));
  run('compile_design_system.cjs', ['design-system-state.json'], workspace);
  const file = path.join(workspace, 'AcmeLabs_Design_System.html');
  const html = fs.readFileSync(file, 'utf-8');
  assert.strictEqual(run('audit_design_system.cjs', [file], workspace).status, 0, 'el Design System compilado está bien anidado');

  fs.writeFileSync(file, html.replace('<tbody>', '<tbody><div class="table-wrap"><table><tbody><tr><td>x</td></tr></tbody></table></div>'));
  const broken = run('audit_design_system.cjs', [file], workspace);
  assert.strictEqual(broken.status, 1);
  assert(broken.stdout.includes('HTML mal anidado'), broken.stdout);
});

it('compiled Design Systems should keep the left rail readable even when the palette is light and the rail is dark', () => {
  const workspace = fs.mkdtempSync(path.join(tmp, 'ws-'));
  const light = {
    ...STATE,
    palette: { primary: '#946EDB', primary_dark: '#000000', secondary: '#000000', accent: '#C7A9FE', bg_base: '#EBE1FF', surface_card: '#FFFFFF', text_primary: '#000000' }
  };
  fs.writeFileSync(path.join(workspace, 'design-system-state.json'), JSON.stringify(light));
  assert.strictEqual(run('compile_design_system.cjs', ['design-system-state.json'], workspace).status, 0);
  const audit = run('audit_design_system.cjs', [path.join(workspace, 'AcmeLabs_Design_System.html')], workspace);
  assert(!/Contraste insuficiente/.test(audit.stdout), audit.stdout);
});

it('the audit should fail a Design System whose rail text or tertiary text has no contrast', () => {
  const workspace = fs.mkdtempSync(path.join(tmp, 'ws-'));
  fs.writeFileSync(path.join(workspace, 'design-system-state.json'), JSON.stringify(STATE));
  run('compile_design_system.cjs', ['design-system-state.json'], workspace);
  const file = path.join(workspace, 'AcmeLabs_Design_System.html');
  const html = fs.readFileSync(file, 'utf-8');

  // Caso real: marca clara, rail casi negro y texto del rail heredando el --fg negro global
  const bad = html
    .replace(/(--bg-sunken:\s*)#[0-9a-fA-F]{6}/, '$1#010101')
    .replace(/(--fg:\s*)#[0-9a-fA-F]{6}/, '$1#000000')
    .replace(/(--rail-fg:\s*)#[0-9a-fA-F]{6}/, '$1#000000')
    .replace(/(--rail-fg-muted:\s*)rgba\([^)]*\)/, '$1rgba(0, 0, 0, 0.72)')
    .replace(/(--rail-fg-subtle:\s*)rgba\([^)]*\)/, '$1rgba(0, 0, 0, 0.45)');
  fs.writeFileSync(file, bad);
  const res = run('audit_design_system.cjs', [file], workspace);
  assert.strictEqual(res.status, 1, res.stdout);
  assert(/Contraste insuficiente[^\n]*rail izquierdo/.test(res.stdout), res.stdout);
});

it('compile_design_system should read modular_scale and density_mode from the state and compute real WCAG ratios', () => {
  const workspace = fs.mkdtempSync(path.join(tmp, 'ws-'));
  const state = { ...STATE, modular_scale: { name: 'Perfect Fourth', ratio: 1.333 }, density_mode: { mode: 'compact', base_px: 4 } };
  fs.writeFileSync(path.join(workspace, 'design-system-state.json'), JSON.stringify(state));
  assert.strictEqual(run('compile_design_system.cjs', ['design-system-state.json'], workspace).status, 0);
  const html = fs.readFileSync(path.join(workspace, 'AcmeLabs_Design_System.html'), 'utf-8');
  assert(html.includes('Perfect Fourth (1.333)'), 'usa la escala del estado');
  assert(!html.includes('Major Third (1.250)'), 'ya no queda fija en Major Third');
  assert(html.includes('Escala base 4px'), 'densidad compacta = base 4px sin duplicar la unidad');
  assert(!/4pxpx|8pxpx/.test(html));
  assert(!html.includes('14.8:1') && !html.includes('11.2:1'), 'los ratios de la tabla WCAG ya no son valores fijos de muestra');
  assert(/Vacíos Conocidos/.test(html) && /multilingüe/.test(html), 'Vacíos Conocidos menciona legal y multilingüe como no asumidos');
});

it('the audit should flag a client semantic color with no contrast against the background', () => {
  const workspace = fs.mkdtempSync(path.join(tmp, 'ws-'));
  fs.writeFileSync(path.join(workspace, 'design-system-state.json'), JSON.stringify(STATE));
  run('compile_design_system.cjs', ['design-system-state.json'], workspace);
  const file = path.join(workspace, 'AcmeLabs_Design_System.html');
  const html = fs.readFileSync(file, 'utf-8');
  // --bg es oscuro (#101313): un "error" casi igual de oscuro no se distingue
  fs.writeFileSync(file, html.replace('--sev-critico:', '--client-error: #14171a;\n      --sev-critico:'));
  const res = run('audit_design_system.cjs', [file], workspace);
  assert.strictEqual(res.status, 1, res.stdout);
  assert(/color semántico --client-error/.test(res.stdout), res.stdout);
});

it('the motion tokens of the phase guides should share one naming and the doc ranges (150 / 300 / 500ms)', () => {
  const phase3 = fs.readFileSync(path.join(ROOT, 'references', 'phases', 'phase-3-components.md'), 'utf-8');
  const arch = fs.readFileSync(path.join(ROOT, 'references', 'token-architecture.md'), 'utf-8');
  for (const doc of [phase3, arch]) {
    assert(/motion-duration-fast`[^\n]*150ms/.test(doc) && /motion-duration-medium`[^\n]*300ms/.test(doc) && /motion-duration-slow`[^\n]*500ms/.test(doc));
    assert(/motion-easing-emphasized/.test(doc), 'incluye la curva enfatizada');
  }
  const spacing = arch.split('ESPACIADO Y DENSIDAD DUAL')[1].split('### 4.')[0];
  assert(!/\| 6px \|/.test(spacing), 'el modo compacto solo usa múltiplos de 4 (sin 6px)');
});

it('the template, the audit and the phase doc should agree on the same 14 section ids', () => {
  const template = fs.readFileSync(path.join(ROOT, 'templates', 'design-system.html'), 'utf-8');
  const templateIds = [...template.matchAll(/id="(sec-[a-z-]+)"/g)].map(m => m[1]);

  const audit = fs.readFileSync(script('audit_design_system.cjs'), 'utf-8');
  const block = audit.slice(audit.indexOf('const requiredSectionIds = ['), audit.indexOf('];', audit.indexOf('const requiredSectionIds = [')));
  const auditIds = [...block.matchAll(/'(sec-[a-z-]+)'/g)].map(m => m[1]);

  assert.strictEqual(templateIds.length, 14);
  assert.deepStrictEqual([...auditIds].sort(), [...templateIds].sort());

  const phaseDoc = fs.readFileSync(path.join(ROOT, 'references', 'phases', 'phase-4-validation.md'), 'utf-8');
  assert(/14 secciones/.test(phaseDoc) && !/15 secciones/.test(phaseDoc));
});

console.log('\n[1b] audit_spec (especificación maestra .md):');
const CLEAN_SPEC = [
  '# Design System Documentación Maestra: Acme Labs',
  '',
  '## ÍNDICE',
  '',
  ...[1, 2, 3, 4, 5].map(n => `## SECCIÓN ${n}: CONTENIDO\n\nTexto real de la sección ${n} con #0B2E5E.\n`),
  '### 5.1. Variables CSS',
  '',
  '```css',
  ':root { --color-primary: #0B2E5E; }',
  '```',
  ''
].join('\n');

function auditSpec(markdown, state = { ...STATE, export_format: 'css' }) {
  const workspace = fs.mkdtempSync(path.join(tmp, 'ws-'));
  fs.writeFileSync(path.join(workspace, 'design-system-state.json'), JSON.stringify(state));
  fs.writeFileSync(path.join(workspace, 'Acme_Design_System.md'), markdown);
  return run('audit_spec.cjs', ['Acme_Design_System.md', '--state', 'design-system-state.json'], workspace);
}

it('audit_spec should accept a clean spec', () => {
  const res = auditSpec(CLEAN_SPEC);
  assert.strictEqual(res.status, 0, res.stdout);
  assert(/100% PASS/.test(res.stdout), res.stdout);
});

it('audit_spec should fail on unresolved placeholders, even inside a code block', () => {
  const res = auditSpec(CLEAN_SPEC.replace('--color-primary: #0B2E5E;', '{{#EACH ACCENT_COLORS}} --x-{{name}}: {{value}}; {{/EACH}}'));
  assert.strictEqual(res.status, 1, res.stdout);
  assert(/Placeholders de plantilla sin resolver[^\n]*\{\{name\}\}/.test(res.stdout), res.stdout);
});

it('audit_spec should fail on leftover template comments but allow HTML comments inside code blocks', () => {
  const withComment = CLEAN_SPEC.replace('## SECCIÓN 2: CONTENIDO', '<!-- INSTRUCCIÓN PARA EL AGENTE: generar esto -->\n## SECCIÓN 2: CONTENIDO');
  const bad = auditSpec(withComment);
  assert.strictEqual(bad.status, 1, bad.stdout);
  assert(/1 con "INSTRUCCIÓN PARA EL AGENTE"/.test(bad.stdout), bad.stdout);

  const inCode = CLEAN_SPEC.replace(':root {', '/* <!-- comentario de ejemplo en código --> */\n:root {');
  assert.strictEqual(auditSpec(inCode).status, 0);
});

it('audit_spec should fail when a canonical section is missing', () => {
  const res = auditSpec(CLEAN_SPEC.replace(/## SECCIÓN 4:[^\n]*\n/, ''));
  assert.strictEqual(res.status, 1, res.stdout);
  assert(/SECCIÓN 4/.test(res.stdout), res.stdout);
});

it('audit_spec should require the block of the export format chosen in stage 4.1', () => {
  const tailwind = { ...STATE, export_format: 'tailwind' };
  const missing = auditSpec(CLEAN_SPEC, tailwind);
  assert.strictEqual(missing.status, 1, missing.stdout);
  assert(/formato de exportación elegido \("tailwind"\)/.test(missing.stdout), missing.stdout);

  const present = auditSpec(CLEAN_SPEC.replace('```css', '```css\n@import "tailwindcss";\n@theme { --color-brand: #0B2E5E; }\n```\n\n```css'), tailwind);
  assert.strictEqual(present.status, 0, present.stdout);
});

it('audit_spec should only warn about "(Opcional)" headings and colors outside the allowlist', () => {
  const res = auditSpec(CLEAN_SPEC.replace('### 5.1. Variables CSS', '### 5.1. Variables CSS (Opcional)') + '\nColor suelto #123456.\n');
  assert.strictEqual(res.status, 0, res.stdout);
  assert(/\(Opcional\)/.test(res.stdout) && /#123456/.test(res.stdout), res.stdout);
});

it('the md template, audit_spec and the phase doc should agree on the five canonical sections', () => {
  const template = fs.readFileSync(path.join(ROOT, 'templates', 'design-system.md'), 'utf-8');
  const sections = [...template.matchAll(/^##\s+SECCIÓN\s+(\d)\b/gm)].map(m => m[1]);
  assert.deepStrictEqual(sections, ['1', '2', '3', '4', '5']);

  // La plantilla sin rellenar es, por definición, una especificación sin terminar: el audit debe rechazarla
  const workspace = fs.mkdtempSync(path.join(tmp, 'ws-'));
  fs.writeFileSync(path.join(workspace, 'Template.md'), template);
  assert.strictEqual(run('audit_spec.cjs', ['Template.md'], workspace).status, 1);

  const phaseDoc = fs.readFileSync(path.join(ROOT, 'references', 'phases', 'phase-4-validation.md'), 'utf-8');
  assert(phaseDoc.includes('<APP_ROOT>/scripts/audit_spec.cjs'), 'la guía de la Fase 4 debe invocar audit_spec.cjs por APP_ROOT');
});

it('the chosen export format should be the main handoff in the template and the phase 4 guide, not an optional section', () => {
  const template = fs.readFileSync(path.join(ROOT, 'templates', 'design-system.md'), 'utf-8');
  const heading = template.match(/^### 5\.2\..*$/m)[0];
  assert(/Exportación principal/.test(heading) && !/Opcional/.test(heading), heading);

  const phaseDoc = fs.readFileSync(path.join(ROOT, 'references', 'phases', 'phase-4-validation.md'), 'utf-8');
  assert(/no una sección opcional/.test(phaseDoc), 'la guía debe decir que §5.2 no es opcional');
  assert(/theme\.extend/.test(phaseDoc) && /@theme/.test(phaseDoc), 'la guía distingue Tailwind v3 (theme.extend) de v4 (@theme)');
});

console.log('\n[1c] Auditorías de compuerta (lib/audits):');
const { runGateAudits, parseTextAudit } = require('../lib/audits');

it('parseTextAudit should read warnings and critical errors from the audit scripts output', () => {
  const stdout = [
    '========================================',
    'AUDITORÍA TÉCNICA DEL DESIGN SYSTEM: X.html',
    '========================================',
    '⚠️  ADVERTENCIAS (2):',
    '   - primera advertencia',
    '   - segunda advertencia',
    '❌ ERRORES CRÍTICOS (1):',
    '   - falta la sección #sec-code',
    '',
    'El archivo no cumple con la compuerta de aprobación de la Fase 4.'
  ].join('\n');
  assert.deepStrictEqual(parseTextAudit(stdout), {
    errors: ['falta la sección #sec-code'],
    warnings: ['primera advertencia', 'segunda advertencia']
  });
  assert.deepStrictEqual(parseTextAudit('✅ ESTADO: 100% PASS'), { errors: [], warnings: [] });
});

it('runGateAudits(gate-1) should combine Design System, spec and palette audits and flag a missing spec', () => {
  const workspace = fs.mkdtempSync(path.join(tmp, 'ws-'));
  fs.writeFileSync(path.join(workspace, 'design-system-state.json'), JSON.stringify(STATE));
  assert.strictEqual(run('compile_design_system.cjs', ['design-system-state.json'], workspace).status, 0);

  let audit = runGateAudits('gate-1', workspace);
  const byId = Object.fromEntries(audit.checks.map(c => [c.id, c]));
  assert.deepStrictEqual(Object.keys(byId).sort(), ['design-system', 'palette', 'spec']);
  assert.strictEqual(byId.spec.status, 'fail');
  assert(/No se encontró/.test(byId.spec.errors[0]));
  assert(audit.summary.fail >= 1);

  fs.writeFileSync(path.join(workspace, 'AcmeLabs_Design_System.md'), CLEAN_SPEC);
  audit = runGateAudits('gate-1', workspace);
  assert.strictEqual(audit.checks.find(c => c.id === 'spec').status, 'pass');

  fs.writeFileSync(path.join(workspace, 'AcmeLabs_Design_System.md'), CLEAN_SPEC + '\n{{PENDIENTE}}\n');
  const bad = runGateAudits('gate-1', workspace).checks.find(c => c.id === 'spec');
  assert.strictEqual(bad.status, 'fail');
  assert(/PENDIENTE/.test(bad.errors[0]));
});

it('runGateAudits(gate-2) should report the offending color of the prototype', () => {
  const workspace = fs.mkdtempSync(path.join(tmp, 'ws-'));
  fs.writeFileSync(path.join(workspace, 'design-system-state.json'), JSON.stringify(STATE));
  fs.mkdirSync(path.join(workspace, 'prototype'));
  fs.writeFileSync(path.join(workspace, 'prototype', 'index.html'), '<style>body{color:#0B2E5E}</style>');
  const palette = (audit) => audit.checks.find(c => c.id === 'palette');
  assert.strictEqual(palette(runGateAudits('gate-2', workspace)).status, 'pass');

  fs.writeFileSync(path.join(workspace, 'prototype', 'index.html'), '<style>body{color:#0B2E5E;background:#ABCDEF}</style>');
  const failed = runGateAudits('gate-2', workspace);
  assert.strictEqual(palette(failed).status, 'fail');
  assert(/#ABCDEF/i.test(palette(failed).errors.join(' ')), palette(failed).errors.join(' '));
  assert(failed.checks.some(c => c.id === 'a11y'), 'la compuerta 2 también audita accesibilidad y estructura');
});

it('runGateAudits should return null when there is nothing to audit', () => {
  assert.strictEqual(runGateAudits('gate-1', path.join(tmp, 'no-existe')), null);
  assert.strictEqual(runGateAudits('gate-2', fs.mkdtempSync(path.join(tmp, 'ws-'))), null);
  assert.strictEqual(runGateAudits('otra', fs.mkdtempSync(path.join(tmp, 'ws-'))), null);
});

console.log('\n[1d] audit_prototype (accesibilidad y estructura del prototipo):');
const GOOD_PROTO = {
  'index.html': [
    '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>Acme</title><link rel="icon" href="data:,"><link rel="stylesheet" href="styles.css"></head><body>',
    '<a href="#main" class="skip">Saltar al contenido</a>',
    '<header><nav aria-label="Principal"><a href="index.html" aria-current="page">Inicio</a></nav>',
    '<button type="button" class="menu-btn" aria-label="Abrir menú" aria-expanded="false" aria-controls="drawer">Menú</button></header>',
    '<aside id="drawer" class="mobile-drawer" aria-label="Menú móvil" inert><a href="index.html">Inicio</a></aside>',
    '<main id="main"><h1>Acme</h1><label for="n">Nombre</label><input id="n"></main></body></html>'
  ].join('\n'),
  // Las fuentes del estado deben cargarse: archivos locales (sin CDN, para no sumar una dependencia externa)
  'rubik.woff2': 'x',
  'inter.woff2': 'x',
  'styles.css': [
    "@font-face{font-family:'Rubik';src:url('rubik.woff2') format('woff2')}@font-face{font-family:'Inter';src:url('inter.woff2') format('woff2')}",
    ':root{--bg:#101313;--fg:#F1F3F3;--accent:#00B2D6;--ring:#00B2D6}',
    'html[data-theme="light"]{--bg:#F1F3F3;--fg:#101313;--accent:#0B2E5E;--ring:#0B2E5E}',
    'body{background-color:var(--bg);color:var(--fg)}',
    '.stat{color:var(--accent)}',
    ':focus-visible{outline:3px solid var(--ring)}',
    '.mobile-drawer{position:fixed;right:-100%;visibility:hidden}'
  ].join('\n')
};

function auditProto(mutate = {}, args = [], state = STATE) {
  const workspace = fs.mkdtempSync(path.join(tmp, 'ws-'));
  fs.writeFileSync(path.join(workspace, 'design-system-state.json'), JSON.stringify(state));
  fs.mkdirSync(path.join(workspace, 'prototype'));
  const files = { ...GOOD_PROTO };
  for (const [name, fn] of Object.entries(mutate)) files[name] = fn(files[name]);
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(workspace, 'prototype', name), content);
  return run('audit_prototype.cjs', ['--dir', 'prototype', '--state', 'design-system-state.json', ...args], workspace);
}

it('audit_prototype should accept a clean prototype', () => {
  const res = auditProto();
  assert.strictEqual(res.status, 0, res.stdout);
  assert(/100% PASS/.test(res.stdout), res.stdout);
});

it('audit_prototype should fail when an accent that works on dark is used as text on the light theme', () => {
  const res = auditProto({ 'styles.css': css => css.replace('--accent:#0B2E5E', '--accent:#FFB300') });
  assert.strictEqual(res.status, 1, res.stdout);
  assert(/Contraste \(tema light\): "\.stat"[^\n]*#FFB300/.test(res.stdout), res.stdout);
});

it('audit_prototype should measure the focus ring composited with its alpha against the background', () => {
  const res = auditProto({
    'styles.css': css => css.replace(':focus-visible{outline:3px solid var(--ring)}', ':focus-visible{box-shadow:0 0 0 3px rgba(0,178,214,0.15)}')
  });
  assert.strictEqual(res.status, 1, res.stdout);
  assert(/Anillo de foco \(tema base\)/.test(res.stdout), res.stdout);
});

it('audit_prototype should fail an off-canvas drawer that stays reachable by keyboard, and a menu button without aria-expanded', () => {
  const res = auditProto({
    'index.html': html => html.replace(' inert', '').replace(' aria-expanded="false" aria-controls="drawer"', ''),
    'styles.css': css => css.replace(';visibility:hidden', '')
  });
  assert.strictEqual(res.status, 1, res.stdout);
  assert(/tabulables/.test(res.stdout) && /aria-expanded/.test(res.stdout), res.stdout);
});

it('audit_prototype should fail missing h1, images without alt and unlabeled controls', () => {
  const res = auditProto({
    'index.html': html => html.replace('<h1>Acme</h1>', '<img src="a.png">').replace('<label for="n">Nombre</label>', '')
  });
  assert.strictEqual(res.status, 1, res.stdout);
  assert(/no tiene <h1>/.test(res.stdout) && /sin atributo alt/.test(res.stdout) && /sin <label>/.test(res.stdout), res.stdout);
});

it('audit_prototype should only warn about unapproved fonts, missing skip link and external dependencies', () => {
  const res = auditProto({
    'index.html': html => html.replace(/<a href="#main"[^>]*>[^<]*<\/a>/, ''),
    'styles.css': css => `@import url('https://fonts.googleapis.com/css2?family=Comic+Neue:wght@400;500&display=swap');\n${css}\nbody{font-family:'Comic Neue',cursive}`
  });
  assert.strictEqual(res.status, 0, res.stdout);
  assert(/Saltar al contenido/.test(res.stdout) && /comic neue/i.test(res.stdout) && /fonts\.googleapis\.com/.test(res.stdout), res.stdout);
});

it('audit_prototype should not count social <a href> links as dependencies, and should warn about @latest', () => {
  const res = auditProto({
    'index.html': html => html.replace('</body>', '<a href="https://linkedin.com/acme">in</a><script src="https://cdn.jsdelivr.net/npm/lenis@latest/dist/lenis.min.js"></script></body>')
  });
  assert.strictEqual(res.status, 0, res.stdout);
  assert(!/linkedin\.com/.test(res.stdout), 'un enlace de navegación no es una dependencia');
  assert(/Dependencia externa \(cdn\.jsdelivr\.net\)/.test(res.stdout) && /usa @latest/.test(res.stdout), res.stdout);
});

it('audit_prototype should accept every family of a saved font stack, its fallbacks and the self-hosted ones', () => {
  const state = { ...STATE, typography: { font_display: 'Fira Code, sans-serif', font_display_fallback: 'Rubik, sans-serif', font_ui: 'Inter', self_hosted_fonts: [{ family: 'Space Mono' }] } };
  const ok = auditProto({ 'styles.css': css => css + "\n.x{font-family:'Fira Code','Rubik',sans-serif}.y{font-family:'Space Mono',monospace}" }, [], state);
  assert(!/no están en el estado/.test(ok.stdout), ok.stdout);
  const bad = auditProto({ 'styles.css': css => css + "\n.x{font-family:'Comic Neue',cursive}" }, [], state);
  assert(/comic neue/i.test(bad.stdout), bad.stdout);
});

it('audit_prototype should warn about links whose estimated touch target is under 24px and accept a sized one', () => {
  const small = auditProto({ 'styles.css': css => css + '\n.footer-links a{font-size:0.8rem;line-height:1.2}' });
  assert.strictEqual(small.status, 0, small.stdout);
  assert(/Objetivo táctil pequeño: "\.footer-links a" mide ~15px/.test(small.stdout), small.stdout);

  const sized = auditProto({ 'styles.css': css => css + '\n.footer-links a{font-size:0.8rem;line-height:1.2;display:inline-flex;min-height:44px}' });
  assert(!/Objetivo táctil/.test(sized.stdout), sized.stdout);
});

it('audit_prototype should not let an @import with ";" inside its URL swallow the :root variables', () => {
  const res = auditProto({
    'styles.css': css => `@import url('https://fonts.googleapis.com/css2?family=Rubik:wght@0,600;0,700&display=swap');\n${css}`
  });
  assert.strictEqual(res.status, 0, res.stdout);
  assert(!/no se encontró el fondo/.test(res.stdout), res.stdout);
});

it('the prototype base (templates/prototype) should pass audit_prototype once its markers are filled', () => {
  const dir = path.join(ROOT, 'templates', 'prototype');
  const workspace = fs.mkdtempSync(path.join(tmp, 'ws-'));
  fs.writeFileSync(path.join(workspace, 'design-system-state.json'), JSON.stringify(STATE));
  fs.mkdirSync(path.join(workspace, 'prototype'));
  fs.writeFileSync(path.join(workspace, 'prototype', 'index.html'), fs.readFileSync(path.join(dir, 'base.html'), 'utf-8').replace(/\{\{[A-Z0-9_]+\}\}/g, 'x'));
  fs.writeFileSync(path.join(workspace, 'prototype', 'rubik.woff2'), 'x');
  fs.writeFileSync(path.join(workspace, 'prototype', 'inter.woff2'), 'x');
  fs.writeFileSync(path.join(workspace, 'prototype', 'styles.css'), "@font-face{font-family:'Rubik';src:url('rubik.woff2')}@font-face{font-family:'Inter';src:url('inter.woff2')}\n" + fs.readFileSync(path.join(dir, 'base.css'), 'utf-8'));
  fs.writeFileSync(path.join(workspace, 'prototype', 'main.js'), fs.readFileSync(path.join(dir, 'base.js'), 'utf-8'));
  const res = run('audit_prototype.cjs', ['--dir', 'prototype', '--state', 'design-system-state.json'], workspace);
  assert.strictEqual(res.status, 0, res.stdout);
  assert(/100% PASS/.test(res.stdout), res.stdout);
});

it('the phase 5 guide should point to the prototype base and state the delivery rules', () => {
  const doc = fs.readFileSync(path.join(ROOT, 'references', 'phases', 'phase-5-prototype.md'), 'utf-8');
  assert(doc.includes('templates/prototype/') && doc.includes('Reglas de Entrega del Prototipo'));
  for (const rule of ['Fuentes', 'Iconos', 'Anillo de foco', 'Temas', 'Estilos', 'Contenido de ejemplo']) {
    assert(doc.includes(`**${rule}:**`), `falta la regla "${rule}"`);
  }
});

it('the phase 5 guide should invoke audit_prototype through <APP_ROOT>', () => {
  const doc = fs.readFileSync(path.join(ROOT, 'references', 'phases', 'phase-5-prototype.md'), 'utf-8');
  assert(doc.includes('<APP_ROOT>/scripts/audit_prototype.cjs'));
});

console.log('\n[1e] fidelity_report (qué no se pudo replicar y por qué):');
const FIDELITY_STATE = {
  ...STATE,
  typography: {},
  fidelity_notes: [{ topic: 'Menú overlay', reason: 'Se simplificó a un drawer', substitute: 'Drawer lateral' }],
  visual_dna: {
    fidelity_mode: 'TOTAL_ARCHITECTURAL_FIDELITY',
    typography: {
      font_display: 'Bagoss, sans-serif', font_display_fallback: 'Syne, sans-serif',
      font_ui: 'ABC Diatype, sans-serif', font_ui_fallback: 'Inter, sans-serif',
      self_hosted_fonts: [{ family: 'Bagoss', woff2_src: '/fonts/Bagoss.woff2' }, { family: 'ABC Diatype', woff2_src: '/fonts/Diatype.woff2' }]
    },
    structural_blueprint: {
      global: {},
      motion_dna: { has_smooth_scroll: true, has_custom_cursor: false },
      hero: { has_canvas: true, page_canvas_count: 2, heading_color_runs: null },
      section_sequence: [{ index: 1, media_slots: [{ role: 'embedded_iframe', is_embedded_iframe: true, embed_provider: 'vimeo' }] }]
    }
  }
};
const FIDELITY_PROTO = {
  'index.html': '<!doctype html><html lang="es"><head><title>A</title><link rel="stylesheet" href="styles.css"></head><body><main><h1>A</h1><section>x</section></main></body></html>',
  'about.html': '<!doctype html><html lang="es"><head><title>B</title></head><body><main><h1>B</h1></main></body></html>',
  'styles.css': "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400&family=Syne:wght@600&display=swap');\n:root{--font-display:'Bagoss','Syne',sans-serif;--font-ui:'ABC Diatype','Inter',sans-serif}\nbody{font-family:var(--font-ui)}"
};
function fidelityReport(state, protoMutate = {}, extra = {}) {
  const workspace = fs.mkdtempSync(path.join(tmp, 'ws-'));
  fs.writeFileSync(path.join(workspace, 'design-system-state.json'), JSON.stringify(state));
  fs.mkdirSync(path.join(workspace, 'prototype'));
  const files = { ...FIDELITY_PROTO };
  for (const [name, fn] of Object.entries(protoMutate)) files[name] = fn(files[name]);
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(workspace, 'prototype', name), content);
  for (const [rel, content] of Object.entries(extra)) {
    fs.mkdirSync(path.dirname(path.join(workspace, rel)), { recursive: true });
    fs.writeFileSync(path.join(workspace, rel), content);
  }
  const res = run('fidelity_report.cjs', ['--dir', 'prototype', '--state', 'design-system-state.json'], workspace);
  assert.strictEqual(res.status, 0, res.stderr);
  return { report: JSON.parse(res.stdout), workspace };
}
const titles = (report, kind) => report.items.filter(i => i.kind === kind).map(i => i.title);

it('fidelity_report should list proprietary fonts that the prototype does not load, with their substitute', () => {
  const { report } = fidelityReport(FIDELITY_STATE);
  const fonts = report.items.filter(i => i.kind === 'sustituido' && /fuente/.test(i.title));
  assert.strictEqual(fonts.length, 2);
  const bagoss = fonts.find(i => /Bagoss/.test(i.title));
  const diatype = fonts.find(i => /ABC Diatype/.test(i.title));
  assert.strictEqual(bagoss.instead, 'Syne');
  assert.strictEqual(diatype.instead, 'Inter');
  assert(/autoalojada/.test(bagoss.reason));
});

it('fidelity_report should not list a font that the prototype does load', () => {
  const { report } = fidelityReport(FIDELITY_STATE, { 'styles.css': (css) => css + "\n@font-face{font-family:'Bagoss';src:url(b.woff2)}" });
  assert(!report.items.some(i => /Bagoss/.test(i.title)));
});

it('fidelity_report should flag motion, canvas and embedded video that the prototype does not reproduce', () => {
  const { report } = fidelityReport(FIDELITY_STATE);
  assert(titles(report, 'no_replicado').some(t => /Scroll suave/.test(t)));
  assert(titles(report, 'no_replicado').some(t => /canvas/.test(t) && /2 capas/.test(t)));
  assert(titles(report, 'sustituido').some(t => /Video embebido \(vimeo\)/.test(t)));
  assert(titles(report, 'parcial').some(t => /Animaciones de entrada/.test(t)));
});

it('fidelity_report should not flag motion that the prototype does reproduce', () => {
  const { report } = fidelityReport(FIDELITY_STATE, {
    'index.html': (h) => h.replace('<main>', '<script src="https://cdn.jsdelivr.net/npm/lenis@1.3.26/dist/lenis.min.js"></script><canvas id="g"></canvas><iframe src="x"></iframe><main>')
  });
  assert(!titles(report, 'no_replicado').length, JSON.stringify(report.items));
  assert(!titles(report, 'sustituido').some(t => /Video/.test(t)));
});

it('fidelity_report should say that coverage is unavailable for an old state, and report a low coverage', () => {
  const { report } = fidelityReport(FIDELITY_STATE);
  assert.strictEqual(report.coverage.available, false);
  assert(titles(report, 'no_capturado').some(t => /Cobertura de la referencia no disponible/.test(t)));
  const low = JSON.parse(JSON.stringify(FIDELITY_STATE));
  low.visual_dna.structural_blueprint.global = { coverage_pct: 18 };
  const lowReport = fidelityReport(low).report;
  assert.strictEqual(lowReport.coverage.pct, 18);
  assert(titles(lowReport, 'no_capturado').some(t => /18 %/.test(t)));
  const ok = JSON.parse(JSON.stringify(FIDELITY_STATE));
  ok.visual_dna.structural_blueprint.global = { coverage_pct: 92 };
  const okReport = fidelityReport(ok).report;
  assert(!titles(okReport, 'no_capturado').some(t => /Cobertura|Solo se captur/.test(t)));
});

it('fidelity_report should mention secondary pages without a blueprint of their own', () => {
  const { report } = fidelityReport(FIDELITY_STATE);
  assert(titles(report, 'parcial').some(t => /about\.html/.test(t)));
});

it('fidelity_report should append the notes of the agent as they are', () => {
  const { report } = fidelityReport(FIDELITY_STATE);
  const note = report.items.find(i => i.kind === 'nota_agente');
  assert.deepStrictEqual({ title: note.title, reason: note.reason, instead: note.instead }, { title: 'Menú overlay', reason: 'Se simplificó a un drawer', instead: 'Drawer lateral' });
});

it('fidelity_report should read the last visual verification and mark it stale when the prototype changed later', () => {
  const fresh = new Date(Date.now() + 60000).toISOString();
  const { report } = fidelityReport(FIDELITY_STATE, {}, { 'scratch/fidelity_verify.json': JSON.stringify({ at: fresh, hero: 0.9, full_page: 0.7 }) });
  assert.strictEqual(report.verify.stale, false);
  assert(titles(report, 'parcial').some(t => /Similitud visual baja/.test(t)));
  const old = new Date(Date.now() - 3600000).toISOString();
  const stale = fidelityReport(FIDELITY_STATE, {}, { 'scratch/fidelity_verify.json': JSON.stringify({ at: old, hero: 0.95, full_page: 0.9 }) }).report;
  assert.strictEqual(stale.verify.stale, true);
  assert(titles(stale, 'parcial').some(t => /desactualizada/.test(t)));
  assert(titles(report, 'no_capturado').every(t => !/Sin comparación visual/.test(t)));
});

it('fidelity_report should only check fonts and agent notes outside the total fidelity mode, and never fail', () => {
  const state = JSON.parse(JSON.stringify(FIDELITY_STATE));
  state.visual_dna.fidelity_mode = 'INSPIRATION';
  const { report } = fidelityReport(state);
  assert(report.items.every(i => i.kind === 'sustituido' || i.kind === 'nota_agente'), JSON.stringify(report.items));
  const broken = run('fidelity_report.cjs', ['--dir', 'prototype', '--state', 'no-existe.json'], fs.mkdtempSync(path.join(tmp, 'ws-')));
  assert.strictEqual(broken.status, 0);
  assert.deepStrictEqual(JSON.parse(broken.stdout).items, []);
});

it('verify_fidelity should score the full page and write the visual summary for the report', () => {
  const src = fs.readFileSync(script('verify_fidelity.cjs'), 'utf-8');
  assert(/simFull < 0\.65/.test(src) && /simFull < 0\.80/.test(src), 'puntúa la página completa');
  assert(src.includes('fidelity_verify.json'), 'escribe el resumen para el informe');
});

it('the phase 5 guide should ask the agent to register fidelity_notes', () => {
  const doc = fs.readFileSync(path.join(ROOT, 'references', 'phases', 'phase-5-prototype.md'), 'utf-8');
  assert(doc.includes('**Limitaciones de fidelidad:**') && doc.includes('fidelity_notes'));
});

it('fidelity_report should say that the header and footer of the reference could not be captured', () => {
  const state = JSON.parse(JSON.stringify(FIDELITY_STATE));
  state.visual_dna.structural_blueprint.navbar = { height_px: null, nav_links: [], utility_controls: [], capture_failed: true };
  state.visual_dna.structural_blueprint.footer = { found: false, capture_failed: true, reason: 'no_footer_found' };
  const { report } = fidelityReport(state);
  assert(titles(report, 'no_capturado').some(t => /Header de la referencia no capturado/.test(t)));
  assert(titles(report, 'no_capturado').some(t => /Footer de la referencia no encontrado/.test(t)));
  // Un estado anterior sin capture_failed pero con el navbar vacío cuenta igual
  const old = JSON.parse(JSON.stringify(FIDELITY_STATE));
  old.visual_dna.structural_blueprint.navbar = { height_px: null, nav_links: [], utility_controls: [] };
  assert(titles(fidelityReport(old).report, 'no_capturado').some(t => /Header de la referencia no capturado/.test(t)));
  // Con datos reales no se dice nada
  const ok = JSON.parse(JSON.stringify(FIDELITY_STATE));
  ok.visual_dna.structural_blueprint.navbar = { height_px: 54, nav_links: [{ text: 'Email' }], link_items: [{ text: 'Email' }], capture_failed: false };
  ok.visual_dna.structural_blueprint.footer = { found: true, top_links: ['Privacy'] };
  assert(!titles(fidelityReport(ok).report, 'no_capturado').some(t => /Header|Footer/.test(t)));
});

it('fidelity_report should list the sections below 80 %, a coverage between 70 and 90 %, and the header and footer differences', () => {
  const state = JSON.parse(JSON.stringify(FIDELITY_STATE));
  state.visual_dna.structural_blueprint.global = { coverage_pct: 81 };
  const now = new Date(Date.now() + 60000).toISOString();
  const verifyFile = JSON.stringify({
    at: now, visual_at: now, hero: 0.97, full_page: 0.9,
    sections: [{ section: 1, similarity: 0.96 }, { section: 2, similarity: 0.6665 }, { section: 3, similarity: 0.74 }],
    navbar: { status: 'FAIL', issues: [{ severity: 'critical', message: 'enlaces de más en el header: el prototipo muestra 3' }, { severity: 'warning', message: 'sombra' }] },
    footer: { status: 'WARN', issues: [{ severity: 'warning', message: 'altura del footer' }] }
  });
  const { report } = fidelityReport(state, {}, { 'scratch/fidelity_verify.json': verifyFile });
  const partial = titles(report, 'parcial');
  assert(partial.some(t => /Se capturó el 81 %/.test(t)), 'cobertura intermedia');
  assert(partial.some(t => /Sección 2: similitud visual 67 %/.test(t)) && partial.some(t => /Sección 3: similitud visual 74 %/.test(t)));
  assert(!partial.some(t => /Sección 1:/.test(t)), 'una sección sobre 80 % no se lista');
  const header = report.items.find(i => /^Header: /.test(i.title));
  assert(header && /1 diferencia\(s\) críticas/.test(header.title) && /enlaces de más/.test(header.reason));
  assert(report.items.some(i => /^Footer: /.test(i.title)));
});

it('verify_fidelity should compare header and footer, and never pass silently against an empty blueprint', () => {
  const src = fs.readFileSync(script('verify_fidelity.cjs'), 'utf-8');
  assert(/async function checkFooter\(/.test(src) && /async function checkNavbar\(/.test(src));
  assert(/navbarBlueprintIsEmpty/.test(src) && /blueprint de navbar vacío/.test(src), 'un blueprint vacío no aprueba en silencio');
  assert(/enlaces de más en el header/.test(src) && /enlaces del footer/.test(src), 'enlaces inventados son críticos');
  assert(/headerFooterSummary/.test(src), 'el resumen para el informe lleva header y footer');
});

it('the extractor should find a footer below the fold and detect header and footer without semantic tags', () => {
  const src = fs.readFileSync(script('extract_reference_dna.cjs'), 'utf-8');
  assert(/detectHeaderByGeometry/.test(src) && /navDetectedBy/.test(src), 'header por geometría');
  assert(/isRendered/.test(src) && /footerDetectedBy/.test(src), 'footer sin exigir viewport y por posición');
  assert(/capture_failed/.test(src) && /_header\.webp/.test(src) && /_footer\.webp/.test(src), 'aviso de captura vacía y capturas dedicadas');
});

(function headerFooterWithChromium() {
  let chromium = null;
  try { chromium = require('playwright').chromium; } catch (e) { try { chromium = require('@playwright/test').chromium; } catch (e2) { /* sin Playwright */ } }
  let available = false;
  try { available = !!chromium && fs.existsSync(chromium.executablePath()); } catch (e) { available = false; }
  const runVerify = (proto) => {
    const workspace = fs.mkdtempSync(path.join(tmp, 'ws-'));
    const blueprint = {
      navbar: { height_px: 54, is_sticky: true, has_backdrop: false, border_radius_px: 32, is_full_width: false, width_px: 750, left_px: 345, top_px: 30, shadow: '0 4px 12px rgba(0,0,0,.12)', bg_color: 'rgb(252, 250, 247)', nav_links: [{ text: 'Email' }], link_items: [{ text: 'Email' }], icon_links: [{ tag: 'a', aria_label: 'Instagram' }], utility_controls: [], brand: { text: 'Ref', has_logo_svg_or_img: true }, capture_failed: false },
      footer: { found: true, height_px: 220, top_links: ['Privacy', 'Twitter'], has_social: true, has_newsletter: false, copyright_text: '© 2026 Ref' },
      section_sequence: []
    };
    fs.writeFileSync(path.join(workspace, 'design-system-state.json'), JSON.stringify({
      brand: { name: 'Acme' },
      palette: { allowed_hexes: ['#FFFFFF', '#FCFAF7', '#1F2A44', '#0000EE', '#666666', '#000000', '#DDDDDD'] },
      visual_dna: { fidelity_mode: 'TOTAL_ARCHITECTURAL_FIDELITY', structural_blueprint: blueprint }
    }));
    fs.mkdirSync(path.join(workspace, 'prototype'));
    fs.writeFileSync(path.join(workspace, 'prototype', 'index.html'), proto);
    const res = run('verify_fidelity.cjs', ['--state', 'design-system-state.json'], workspace);
    return JSON.parse(res.stdout.slice(res.stdout.indexOf('{')));
  };
  const HEAD_BAR = '<header style="position:sticky;top:0;height:72px;background:#fff;display:flex;gap:20px;align-items:center;padding:0 40px"><a class="brand" href="index.html">Acme</a><nav><a href="a.html">Inicio</a><a href="b.html">Servicios</a><a href="c.html">Contacto</a></nav></header>';
  const HEAD_PILL = '<header style="position:fixed;top:30px;left:345px;width:750px;height:54px;border-radius:32px;background:#FCFAF7;box-shadow:0 4px 12px rgba(0,0,0,.12);display:flex;justify-content:space-between;align-items:center;padding:0 24px;box-sizing:border-box"><a class="brand" href="index.html"><svg width="20" height="20"><circle cx="10" cy="10" r="9"/></svg>Acme</a><div><a href="mailto:a@b.c">Email</a><a href="https://instagram.com/x" aria-label="Instagram"><svg width="20" height="20"><rect width="18" height="18"/></svg></a></div></header>';
  const FOOT_BAD = '<footer style="height:120px"><p>© 2026 Acme</p><a href="a">Inicio</a><a href="b">Servicios</a><a href="c">Contacto</a><a href="d">Blog</a></footer>';
  const FOOT_OK = '<footer style="height:220px"><p>© 2026 Ref</p><a href="/privacy">Privacy</a><a href="https://twitter.com/x">Twitter</a></footer>';
  const page = (head, foot) => `<!doctype html><html lang="es"><head><title>x</title><style>body{margin:0;color:#1F2A44}</style></head><body>${head}<main><h1>Hola</h1></main>${foot}</body></html>`;

  it('verify_fidelity should fail a full-width header with invented links and a footer with invented links', () => {
    if (!available) return console.log('    (omitido: no hay Chromium de Playwright)');
    const report = runVerify(page(HEAD_BAR, FOOT_BAD));
    assert.strictEqual(report.checks.navbar.status, 'FAIL');
    const messages = report.checks.navbar.issues.map(i => i.message).join('\n');
    assert(/morfología navbar/.test(messages) && /enlaces de más en el header/.test(messages) && /faltan controles de icono/.test(messages), messages);
    assert.strictEqual(report.checks.footer.status, 'FAIL');
    assert(report.checks.footer.issues.some(i => i.severity === 'critical' && /enlaces del footer/.test(i.message)));
    assert(report.summary.critical >= 2);
  });

  it('verify_fidelity should pass a header and a footer that reproduce the reference', () => {
    if (!available) return console.log('    (omitido: no hay Chromium de Playwright)');
    const report = runVerify(page(HEAD_PILL, FOOT_OK));
    assert.strictEqual(report.checks.navbar.status, 'PASS', JSON.stringify(report.checks.navbar.issues));
    assert.strictEqual(report.checks.footer.status, 'PASS', JSON.stringify(report.checks.footer.issues));
  });

  it('verify_fidelity should warn, not pass, when the blueprint of the header and footer is empty', () => {
    if (!available) return console.log('    (omitido: no hay Chromium de Playwright)');
    const workspace = fs.mkdtempSync(path.join(tmp, 'ws-'));
    fs.writeFileSync(path.join(workspace, 'design-system-state.json'), JSON.stringify({
      brand: { name: 'Acme' },
      palette: { allowed_hexes: ['#FFFFFF', '#1F2A44'] },
      visual_dna: { fidelity_mode: 'TOTAL_ARCHITECTURAL_FIDELITY', structural_blueprint: {
        navbar: { height_px: null, nav_links: [], utility_controls: [] },
        footer: { found: false },
        section_sequence: []
      } }
    }));
    fs.mkdirSync(path.join(workspace, 'prototype'));
    fs.writeFileSync(path.join(workspace, 'prototype', 'index.html'), page(HEAD_BAR, FOOT_BAD));
    const res = run('verify_fidelity.cjs', ['--state', 'design-system-state.json'], workspace);
    const report = JSON.parse(res.stdout.slice(res.stdout.indexOf('{')));
    assert.strictEqual(report.checks.navbar.status, 'WARN');
    assert(report.checks.navbar.issues.some(i => /blueprint de navbar vacío/.test(i.message)));
    assert.strictEqual(report.checks.footer.status, 'WARN');
    assert(fs.existsSync(path.join(workspace, 'scratch', 'fidelity_verify.json')), 'el resumen para el informe se escribe también sin --visual');
    // Una corrida sin --visual no inventa una medición visual, ni siquiera en la segunda pasada
    run('verify_fidelity.cjs', ['--state', 'design-system-state.json'], workspace);
    const summary = JSON.parse(fs.readFileSync(path.join(workspace, 'scratch', 'fidelity_verify.json'), 'utf-8'));
    assert.strictEqual(summary.visual_at, null);
    assert(summary.navbar && summary.footer, 'lleva el resultado de header y footer');
  });

  // Fondo de sección: un hex permitido (#DBDBDB) no sirve como fondo si la referencia mide otro (#EBE9E4)
  const verifySectionBg = (refBg, protoBg) => {
    const workspace = fs.mkdtempSync(path.join(tmp, 'ws-'));
    fs.writeFileSync(path.join(workspace, 'design-system-state.json'), JSON.stringify({
      brand: { name: 'Acme' },
      palette: { allowed_hexes: ['#EBE9E4', '#DBDBDB', '#111111', '#FFFFFF'] },
      visual_dna: { fidelity_mode: 'TOTAL_ARCHITECTURAL_FIDELITY', structural_blueprint: {
        navbar: { height_px: null, nav_links: [], utility_controls: [] },
        footer: { found: false },
        section_sequence: [{ index: 1, effective_bg: refBg }]
      } }
    }));
    fs.mkdirSync(path.join(workspace, 'prototype'));
    fs.writeFileSync(path.join(workspace, 'prototype', 'index.html'),
      `<!doctype html><html lang="es"><head><title>x</title><style>body{margin:0;background:#FFFFFF}</style></head><body><main><section data-section="1" style="${protoBg};height:300px"><h1>Hola</h1></section></main></body></html>`);
    const res = run('verify_fidelity.cjs', ['--state', 'design-system-state.json'], workspace);
    return JSON.parse(res.stdout.slice(res.stdout.indexOf('{'))).checks.geometry;
  };

  it('verify_fidelity should fail a section whose background differs from the measured one even if the hex is allowed', () => {
    if (!available) return console.log('    (omitido: no hay Chromium de Playwright)');
    const geometry = verifySectionBg({ hex: '#EBE9E4', gradient_stops: null }, 'background:#DBDBDB');
    assert.strictEqual(geometry.status, 'FAIL');
    assert(geometry.issues.some(i => i.severity === 'critical' && /fondo de la sección: #DBDBDB ≠ referencia #EBE9E4/.test(i.message)), JSON.stringify(geometry.issues));
  });

  it('verify_fidelity should accept the measured background (±3 per channel) and skip sections with no single color to compare', () => {
    if (!available) return console.log('    (omitido: no hay Chromium de Playwright)');
    assert(!verifySectionBg({ hex: '#EBE9E4', gradient_stops: null }, 'background:#EBE9E5').issues.some(i => /fondo de la sección/.test(i.message)));
    assert(!verifySectionBg({ hex: '#EBE9E4', gradient_stops: ['rgb(0,0,0)'] }, 'background:#111111').issues.some(i => /fondo de la sección/.test(i.message)), 'referencia con degradado: no se compara');
    assert(!verifySectionBg({ hex: null, gradient_stops: null }, 'background:#111111').issues.some(i => /fondo de la sección/.test(i.message)), 'referencia sin color medido: no se compara');
    assert(!verifySectionBg({ hex: '#EBE9E4', gradient_stops: null }, 'background:linear-gradient(#111111,#222222)').issues.some(i => /fondo de la sección/.test(i.message)), 'prototipo con degradado: no se compara');
  });
})();

console.log('\n[2] verify_fidelity --check A (allowlist cromática de un archivo):');
function checkA(colorsInHtml, allowed = STATE.palette.allowed_hexes) {
  const workspace = fs.mkdtempSync(path.join(tmp, 'ws-'));
  fs.writeFileSync(path.join(workspace, 'design-system-state.json'), JSON.stringify({ ...STATE, palette: { ...STATE.palette, allowed_hexes: allowed } }));
  fs.writeFileSync(path.join(workspace, 'Acme_Design_System.html'), `<style>body{${colorsInHtml}}</style>`);
  return run('verify_fidelity.cjs', ['--state', 'design-system-state.json', '--check', 'A', '--file', 'Acme_Design_System.html'], workspace);
}

it('should PASS when every literal color belongs to the allowlist (no prototype/ folder needed)', () => {
  const res = checkA('color:#0B2E5E;background:#ffffff;border-color:rgb(0,178,214)');
  assert.strictEqual(res.status, 0, res.stderr);
  const report = JSON.parse(res.stdout);
  assert.strictEqual(report.check, 'A');
  assert.strictEqual(report.status, 'PASS');
  assert.strictEqual(report.scanned_files, 1);
  assert(report.color_tokens_found >= 3);
});

it('should FAIL and report the offending color when one is outside the allowlist', () => {
  const res = checkA('color:#0B2E5E;background:#FF00AA');
  assert.strictEqual(res.status, 1);
  const report = JSON.parse(res.stdout);
  assert.strictEqual(report.status, 'FAIL');
  assert.strictEqual(report.violation_count, 1);
  assert.strictEqual(report.violations[0].resolved_hex.toLowerCase(), '#ff00aa');
  assert.strictEqual(report.violations[0].file, 'Acme_Design_System.html');
});

it('should fail clearly when --file does not exist', () => {
  const workspace = fs.mkdtempSync(path.join(tmp, 'ws-'));
  fs.writeFileSync(path.join(workspace, 'design-system-state.json'), JSON.stringify(STATE));
  const res = run('verify_fidelity.cjs', ['--state', 'design-system-state.json', '--check', 'A', '--file', 'no-existe.html'], workspace);
  assert.strictEqual(res.status, 1);
  assert(/Archivo no encontrado/.test(res.stderr));
});

console.log('\n[3] Guías de fase coherentes con el prompt:');
const phaseDocs = fs.readdirSync(path.join(ROOT, 'references', 'phases')).filter(f => /^phase-\d-.*\.md$/.test(f));

it('should ship five phase guides that warn their paths are relative to APP_ROOT', () => {
  assert.strictEqual(phaseDocs.length, 5);
  for (const file of phaseDocs) {
    const text = fs.readFileSync(path.join(ROOT, 'references', 'phases', file), 'utf-8');
    assert(text.includes('relativas a `<APP_ROOT>`'), `${file} debe avisar que sus rutas son relativas a APP_ROOT`);
  }
});

it('should invoke every script through <APP_ROOT> (the agent runs inside the project folder, not the repo)', () => {
  for (const file of phaseDocs) {
    const text = fs.readFileSync(path.join(ROOT, 'references', 'phases', file), 'utf-8');
    const relativeCalls = text.match(/^[>\s]*node scripts\//gm) || [];
    assert.strictEqual(relativeCalls.length, 0, `${file} usa "node scripts/..." con ruta relativa`);
  }
});

it('should not require emoji swatches, which directive 10 forbids, and every option list should end in a custom option', () => {
  const phase2 = fs.readFileSync(path.join(ROOT, 'references', 'phases', 'phase-2-foundations.md'), 'utf-8');
  assert(!/Muestras de Color Unicode Nativas Obligatorias/.test(phase2));
  assert(!/[\u{1F7E6}-\u{1F7EB}]/u.test(phase2), 'sin emojis de color');
  assert(phase2.includes('Escribir mi propia opción personalizada'));
  const phase4 = fs.readFileSync(path.join(ROOT, 'references', 'phases', 'phase-4-validation.md'), 'utf-8');
  assert((phase4.match(/Escribir mi propia opción personalizada/g) || []).length >= 2, 'formato y plataforma de exportación con opción personalizada');
});

console.log('\n[fuentes] una fuente del estado solo cuenta si se carga de verdad:');

function fontWorkspace(state, extraCss, files = {}) {
  const workspace = fs.mkdtempSync(path.join(tmp, 'ws-font-'));
  fs.writeFileSync(path.join(workspace, 'design-system-state.json'), JSON.stringify({ ...STATE, typography: { font_display: 'Rubik', font_ui: 'Inter', ...state } }));
  run('compile_design_system.cjs', ['design-system-state.json'], workspace);
  const file = path.join(workspace, 'AcmeLabs_Design_System.html');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf-8').replace('</style>', `${extraCss}\n</style>`));
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(workspace, rel)), { recursive: true });
    fs.writeFileSync(path.join(workspace, rel), content);
  }
  return { workspace, file };
}
const ES_FACE_LOCAL = "@font-face{font-family:'ES Face';src:local('ES Face'),local('ESFace-Regular')}";

it('audit_design_system should fail a brand font that only has a local() @font-face (the Selvaria case)', () => {
  const { workspace, file } = fontWorkspace({ font_display: 'ES Face, sans-serif' }, ES_FACE_LOCAL);
  const res = run('audit_design_system.cjs', [file], workspace);
  assert.strictEqual(res.status, 1, res.stdout);
  assert(/ES Face/.test(res.stdout) && /solo usa local\(\)/.test(res.stdout), res.stdout);
});

it('audit_design_system should fail a font whose @font-face points at a raw .cff extracted from a PDF', () => {
  const { workspace, file } = fontWorkspace({ font_display: 'ES Face, sans-serif' },
    "@font-face{font-family:'ES Face';src:url('assets/fonts/ESFace-Bold.cff')}", { 'assets/fonts/ESFace-Bold.cff': 'x' });
  const res = run('audit_design_system.cjs', [file], workspace);
  assert.strictEqual(res.status, 1, res.stdout);
  assert(/no existe o que el navegador no puede cargar/.test(res.stdout) && /WOFF2/.test(res.stdout), res.stdout);
});

it('audit_design_system should accept a font loaded from an existing woff2 and keep Google Fonts families working', () => {
  const { workspace, file } = fontWorkspace({ font_display: 'ES Face, sans-serif' },
    "@font-face{font-family:'ES Face';src:url('assets/fonts/ESFace.woff2') format('woff2')}", { 'assets/fonts/ESFace.woff2': 'x' });
  const res = run('audit_design_system.cjs', [file], workspace);
  assert.strictEqual(res.status, 0, res.stdout);
  assert(!/no se carga/.test(res.stdout), res.stdout);
});

it('audit_design_system should only warn when the missing font is declared as substituted in the state', () => {
  const { workspace, file } = fontWorkspace({
    font_display: 'ES Face, sans-serif',
    font_substitutions: [{ family: 'ES Face', reason: 'El manual no incluye el archivo', substitute: 'Hind Madurai' }]
  }, ES_FACE_LOCAL);
  const res = run('audit_design_system.cjs', [file], workspace);
  assert.strictEqual(res.status, 0, res.stdout);
  assert(/ES Face/.test(res.stdout) && /sustituida/.test(res.stdout), res.stdout);
});

it('fidelity_report should not count a local()-only @font-face as loaded', () => {
  const state = { ...FIDELITY_STATE };
  const { report } = fidelityReport(state, { 'styles.css': (css) => css + "\n@font-face{font-family:'Bagoss';src:local('Bagoss')}" });
  assert(report.items.some(i => /Bagoss/.test(i.title)), 'una fuente con solo local() sigue figurando como sustituida');
});

it('a light page should get a light --bg-sunken for code, tables and swatches, and a dark --rail-bg for the rail', () => {
  const workspace = fs.mkdtempSync(path.join(tmp, 'ws-sunken-'));
  const light = { ...STATE, palette: { primary: '#2E3D20', accent: '#CEF891', bg_base: '#F8F7D6', surface_card: '#FFFFFF', text_primary: '#222617' } };
  fs.writeFileSync(path.join(workspace, 'design-system-state.json'), JSON.stringify(light));
  assert.strictEqual(run('compile_design_system.cjs', ['design-system-state.json'], workspace).status, 0);
  const file = path.join(workspace, 'AcmeLabs_Design_System.html');
  const html = fs.readFileSync(file, 'utf-8');
  const sunken = html.match(/--bg-sunken:\s*(#[0-9a-fA-F]{6})/)[1];
  const railBg = html.match(/--rail-bg:\s*(#[0-9a-fA-F]{6})/)[1];
  const { parseColor, contrastRatio } = require(script('contrast.cjs'));
  assert(contrastRatio(parseColor('#222617'), parseColor(sunken)) >= 7, `--bg-sunken ${sunken} debe ser legible con el texto`);
  assert(contrastRatio(parseColor('#FFFFFF'), parseColor(railBg)) >= 7, 'el rail sigue oscuro');

  // El caso Selvaria: --bg-sunken oscuro en una página clara deja ilegibles código, tablas y muestras
  fs.writeFileSync(file, html.replace(/(--bg-sunken:\s*)#[0-9a-fA-F]{6}/, '$1#1C2117'));
  const bad = run('audit_design_system.cjs', [file], workspace);
  assert.strictEqual(bad.status, 1, bad.stdout);
  assert(/bloques de código, tablas y muestras/.test(bad.stdout), bad.stdout);
});

it('audit_design_system should fail a table whose rows have more cells than its header', () => {
  const { workspace, file } = fontWorkspace({}, '');
  const table = '<table class="demo-table"><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td><td>3</td></tr></tbody></table>';
  fs.writeFileSync(file, fs.readFileSync(file, 'utf-8').replace('</body>', `${table}</body>`));
  const res = run('audit_design_system.cjs', [file], workspace);
  assert.strictEqual(res.status, 1, res.stdout);
  assert(/desalineadas/.test(res.stdout) && /demo-table/.test(res.stdout), res.stdout);
});

console.log('\n[contraste] las razones y el anillo de foco declarados se comprueban contra el cálculo real:');

const { findRatioMismatches } = require(script('contrast.cjs'));

it('findRatioMismatches should flag a declared ratio that differs from the measured one and accept a correct one', () => {
  const rows = [
    '| Texto sobre Lino | var(--a) (#222617) | var(--b) (#F8F7D6) | 10.68:1 | PASS |',
    '| Texto sobre Lino | var(--a) (#222617) | var(--b) (#F8F7D6) | 14.19:1 | PASS |',
    '| Solo un color | (#222617) | 5.00:1 | PASS |'
  ].join('\n');
  const wrong = findRatioMismatches(rows);
  assert.strictEqual(wrong.length, 1, 'solo la fila con la cifra errada');
  assert.strictEqual(wrong[0].line, 1);
  assert.strictEqual(wrong[0].claimed, 10.68);
  assert.strictEqual(wrong[0].measured, 14.19);
});

it('audit_spec should fail an invented contrast table and a translucent focus ring that falls under 3:1', () => {
  const workspace = fs.mkdtempSync(path.join(tmp, 'ws-ratio-'));
  fs.writeFileSync(path.join(workspace, 'design-system-state.json'), JSON.stringify({ ...STATE, palette: { ...STATE.palette, bg_base: '#F8F7D6' } }));
  const base = [
    '# Acme', '## ÍNDICE', '## SECCIÓN 1', '## SECCIÓN 2', '## SECCIÓN 3', '## SECCIÓN 4', '## SECCIÓN 5',
    '| Par | Foreground | Background | Contraste | Cumple |', '| :--- | :--- | :--- | :--- | :--- |'
  ];
  const write = (lines) => { fs.writeFileSync(path.join(workspace, 'Acme_Design_System.md'), lines.join('\n')); return run('audit_spec.cjs', ['Acme_Design_System.md', '--state', 'design-system-state.json'], workspace); };

  const bad = write([...base, '| Texto | (#222617) | (#F8F7D6) | 10.68:1 | PASS |', '`--focus-ring: 0 0 0 3px rgba(46, 61, 32, 0.45)`']);
  assert.strictEqual(bad.status, 1, bad.stdout);
  assert(/razón\(es\) de contraste declaradas/.test(bad.stdout) && /14\.19:1/.test(bad.stdout), bad.stdout);
  assert(/anillo de foco no llega a 3:1/.test(bad.stdout), bad.stdout);

  const good = write([...base, '| Texto | (#222617) | (#F8F7D6) | 14.19:1 | PASS |', '`--focus-ring: 0 0 0 3px rgba(46, 61, 32, 0.75)`']);
  assert(!/razón\(es\) de contraste/.test(good.stdout) && !/anillo de foco/.test(good.stdout), good.stdout);
});

it('audit_design_system should fail a Design System table with a made-up contrast ratio', () => {
  const { workspace, file } = fontWorkspace({}, '');
  const html = fs.readFileSync(file, 'utf-8').replace('</body>', '<table><tr><td><code>Texto (#222617)</code> sobre <code>Fondo (#F8F7D6)</code></td><td>10.68:1</td></tr></table></body>');
  fs.writeFileSync(file, html);
  const res = run('audit_design_system.cjs', [file], workspace);
  assert.strictEqual(res.status, 1, res.stdout);
  assert(/razón\(es\) de contraste declaradas/.test(res.stdout), res.stdout);
});

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\nSummary: ${passedTests}/${totalTests} tests passed.`);
if (passedTests !== totalTests) process.exit(1);
