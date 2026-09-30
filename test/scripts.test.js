const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

// Scripts que los agentes ejecutan desde el workspace: compile_showcase, audit_showcase y verify_fidelity.
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

console.log('[1] compile_showcase + audit_showcase (14 secciones):');
it('should refuse to guess a project when no state path is given', () => {
  const res = run('compile_showcase.cjs', [], tmp);
  assert.notStrictEqual(res.status, 0);
  assert(/Uso: node compile_showcase\.cjs/.test(res.stderr), res.stderr);
});

it('should compile the showcase for the documented palette schema without leaking the sample brand', () => {
  const workspace = fs.mkdtempSync(path.join(tmp, 'ws-'));
  fs.writeFileSync(path.join(workspace, 'design-system-state.json'), JSON.stringify(STATE));
  const res = run('compile_showcase.cjs', ['design-system-state.json'], workspace);
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

it('the audit should accept a 14-section showcase and flag a missing canonical section', () => {
  const workspace = fs.mkdtempSync(path.join(tmp, 'ws-'));
  fs.writeFileSync(path.join(workspace, 'design-system-state.json'), JSON.stringify(STATE));
  run('compile_showcase.cjs', ['design-system-state.json'], workspace);
  const file = path.join(workspace, 'AcmeLabs_Design_System.html');

  const ok = run('audit_showcase.cjs', [file], workspace);
  assert.strictEqual(ok.status, 0, ok.stdout);
  assert(!/sec-sitemap/.test(ok.stdout), 'no debe exigir una sección de sitemap');

  fs.writeFileSync(file, fs.readFileSync(file, 'utf-8').replace('id="sec-motion"', 'id="sec-otra"'));
  const broken = run('audit_showcase.cjs', [file], workspace);
  assert.strictEqual(broken.status, 1);
  assert(broken.stdout.includes('#sec-motion'));
});

it('the template, the audit and the phase doc should agree on the same 14 section ids', () => {
  const template = fs.readFileSync(path.join(ROOT, 'templates', 'design-system.html'), 'utf-8');
  const templateIds = [...template.matchAll(/id="(sec-[a-z-]+)"/g)].map(m => m[1]);

  const audit = fs.readFileSync(script('audit_showcase.cjs'), 'utf-8');
  const block = audit.slice(audit.indexOf('const requiredSectionIds = ['), audit.indexOf('];', audit.indexOf('const requiredSectionIds = [')));
  const auditIds = [...block.matchAll(/'(sec-[a-z-]+)'/g)].map(m => m[1]);

  assert.strictEqual(templateIds.length, 14);
  assert.deepStrictEqual([...auditIds].sort(), [...templateIds].sort());

  const phaseDoc = fs.readFileSync(path.join(ROOT, 'references', 'phases', 'phase-4-validation.md'), 'utf-8');
  assert(/14 secciones/.test(phaseDoc) && !/15 secciones/.test(phaseDoc));
});

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

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\nSummary: ${passedTests}/${totalTests} tests passed.`);
if (passedTests !== totalTests) process.exit(1);
