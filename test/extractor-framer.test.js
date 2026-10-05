const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

// Regresión de la extracción sobre un sitio estilo Framer (sin <main>/<nav>/<header>/<footer>/<section>):
//  - los wrappers `display: contents` esconden las secciones (rect de 0 px)
//  - una capa absoluta de fondo cubre todo el alto de la página
//  - el pie es el último bloque de la página
//  - el header es fijo y se oculta al bajar: solo reaparece con scroll hacia arriba
// Antes de los arreglos solo se capturaba el 11 % de la página, sin header ni footer.

const ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'extract_reference_dna.cjs');

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

console.log('\n--- Test Suite: Extracción sobre un sitio estilo Framer ---\n');

let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) { try { chromium = require('@playwright/test').chromium; } catch (e2) { /* sin Playwright */ } }
let available = false;
try { available = !!chromium && fs.existsSync(chromium.executablePath()); } catch (e) { available = false; }

const block = (i, bg, fg) => `
  <div class="sec" style="background:${bg};color:${fg};height:640px;position:relative;box-sizing:border-box;padding:80px 60px">
    <h2 style="font:700 48px sans-serif;margin:0">Sección ${i}</h2>
    <p style="font:20px sans-serif">Texto de la sección ${i} con contenido real.</p>
    <a href="#s${i}" style="color:inherit">Ver más ${i}</a>
  </div>`;

const FIXTURE = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Framer-like</title>
<style>
  html,body{margin:0}
  .root{position:relative;display:flex;flex-direction:column;width:100%}
  .bgl{position:absolute;inset:0;pointer-events:none}
  .hdr{position:fixed;top:32px;left:50px;width:310px;height:44px;display:flex;gap:24px;align-items:center;transition:transform .1s;z-index:5}
  .hdr a{font:600 14px sans-serif;color:#111;text-decoration:none}
</style></head><body>
<div id="main"><div class="root">
  <div class="bgl"></div>
  <div style="display:contents"><div style="position:relative">
    <div class="sec" style="background:#EBE9E4;height:900px;position:relative;box-sizing:border-box;padding:120px 60px">
      <h1 style="font:800 90px sans-serif;margin:0">HERO TITULAR</h1><a href="#go" style="font:20px sans-serif">Gespräch buchen</a>
    </div>
    ${block(2, '#111111', '#EBE9E4')}${block(3, '#EBE9E4', '#111111')}${block(4, '#111111', '#EBE9E4')}${block(5, '#EBE9E4', '#111111')}
  </div></div>
  <div style="display:contents"><div class="sec" style="background:#111111;color:#EBE9E4;height:700px;box-sizing:border-box;padding:80px 60px">
    <h2 style="font:700 48px sans-serif;margin:0">Bereit für deine neue Website?</h2><a href="#c" style="color:inherit">Kontakt</a>
  </div></div>
  <div class="foot" style="background:#EBE9E4;color:#111;height:255px;box-sizing:border-box;padding:40px 60px">
    <a href="/a">Home</a> <a href="/b">Services</a> <a href="/c">Projekte</a> <a href="/d">Kontakt</a>
    <p style="font:14px sans-serif">© 2026 | Fixture</p>
  </div>
</div>
<div class="hdr" id="hdr"><a href="#a">Services</a><a href="#b">Projekte</a><a href="#c">Über mich</a></div></div>
<script>
  // Como Framer: el header sale de pantalla al bajar y solo vuelve con scroll hacia arriba por pasos (un salto de miles de px no lo reabre)
  var last = 0;
  addEventListener('scroll', function () {
    var y = scrollY;
    var el = document.getElementById('hdr');
    if (y > last) el.style.transform = 'translateY(-90px)';
    else if (last - y <= 1000) el.style.transform = 'translateY(0)'; // un gesto de scroll hacia arriba, no un salto a la cima
    last = y;
  }, { passive: true });
</script></body></html>`;

async function runExtractor(url) {
  // Copia de prueba: el extractor real rechaza loopback por seguridad y esa protección no se debilita
  const dir = fs.mkdtempSync(path.join(__dirname, 'scratch_test_extractor_'));
  try {
    const src = fs.readFileSync(SCRIPT, 'utf-8');
    const marker = 'function validatePublicUrl(rawUrl) {';
    assert(src.includes(marker), 'el extractor ya no define validatePublicUrl');
    const copy = path.join(dir, 'extract_copy.cjs');
    fs.writeFileSync(copy, src.replace(marker, `${marker}\n  if (process.env.EXTRACTOR_TEST_ALLOW_LOOPBACK) return String(rawUrl);`));
    const cwd = path.join(dir, 'cwd');
    fs.mkdirSync(cwd);
    // Asíncrono: el servidor de la página de prueba vive en este mismo proceso y no puede quedar bloqueado
    const res = await new Promise((resolve) => {
      const child = spawn(process.execPath, [copy, url], { cwd, env: { ...process.env, EXTRACTOR_TEST_ALLOW_LOOPBACK: '1' } });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => child.kill(), 180000);
      child.stdout.on('data', (d) => { stdout += d; });
      child.stderr.on('data', (d) => { stderr += d; });
      child.on('close', (status) => { clearTimeout(timer); resolve({ status, stdout, stderr }); });
    });
    assert.strictEqual(res.status, 0, res.stderr);
    return JSON.parse(res.stdout.slice(res.stdout.indexOf('{')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

(async () => {
  if (!available) {
    console.log('  (omitido: no hay Chromium de Playwright; usa `pnpm run install:playwright`)');
    return;
  }
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(FIXTURE);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  let dna;
  try {
    dna = await runExtractor(`http://127.0.0.1:${server.address().port}/`);
  } catch (err) {
    console.error('  ✗ la extracción de la página de prueba falló');
    console.error(err);
    process.exitCode = 1;
    server.close();
    return;
  }
  server.close();
  const sb = dna.structural_blueprint;

  it('should see through display:contents wrappers and skip full-page background layers', () => {
    assert(sb.global.sections_captured >= 6, `secciones capturadas: ${sb.global.sections_captured}`);
    assert(sb.global.coverage_pct >= 90, `cobertura: ${sb.global.coverage_pct} %`);
    assert(!sb.section_sequence.some(s => s.min_height_px >= 4000), 'la capa de fondo absoluta no cuenta como sección');
  });

  it('should find the header when it hides on scroll down (the scroll pass returns to the top stepwise)', () => {
    assert.strictEqual(sb.navbar.detected_by, 'geometry');
    assert.strictEqual(sb.navbar.capture_failed, false);
    assert.strictEqual(sb.navbar.nav_links.length, 3, JSON.stringify(sb.navbar.nav_links));
  });

  it('should detect the page-end block as the footer instead of counting it as a section', () => {
    assert.strictEqual(sb.footer.found, true);
    assert.strictEqual(sb.footer.detected_by, 'geometry');
    assert(sb.footer.top_links.includes('Projekte'), JSON.stringify(sb.footer.top_links));
    assert(!sb.section_sequence.some(s => s.min_height_px === 255), 'el footer no figura entre las secciones');
  });
})().then(() => {
  console.log('\n========================================');
  console.log(`Summary: ${passedTests}/${totalTests} tests passed.`);
  console.log('========================================\n');
});
