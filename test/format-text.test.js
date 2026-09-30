const assert = require('assert');
const fs = require('fs');
const path = require('path');

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

// formatText vive en public/app.js (script de navegador): se extrae con sus helpers para probarla sin DOM
const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf-8');
const start = source.indexOf('function escapeAttrValue');
const end = source.indexOf('function appendLog');
assert(start > -1 && end > start, 'no se pudo extraer formatText de public/app.js');
const formatText = new Function(`${source.slice(start, end)}\nreturn formatText;`)();

// Quita los valores entrecomillados de cada etiqueta: lo que quede son atributos reales
function realAttributes(html) {
  // Como el parser HTML: un ">" dentro de un valor entrecomillado no cierra la etiqueta
  const tags = html.match(/<[a-zA-Z](?:[^>"']|"[^"]*"|'[^']*')*>/g) || [];
  return tags.map(tag => tag.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''"));
}

function assertNoActiveContent(html, label) {
  assert(!/href="\s*(?:javascript|data|vbscript):/i.test(html), `${label}: href peligroso en ${html}`);
  for (const tag of realAttributes(html)) {
    assert(!/\son[a-z]+\s*=/i.test(tag), `${label}: manejador de evento inyectado en ${tag}`);
  }
}

console.log('\n--- Test Suite: formatText (salida del modelo hacia el DOM) ---\n');

it('should drop links whose scheme is not http(s) or a site-absolute path', () => {
  const payloads = [
    '[clic](javascript:alert(1))',
    '[clic](JaVaScRiPt:alert`1`)',
    '[clic](data:text/html,<script>alert(1)</script>)',
    '[clic](vbscript:msgbox(1))',
    '[clic](//evil.example.com/x)'
  ];
  for (const p of payloads) {
    const html = formatText(p);
    assertNoActiveContent(html, p);
    assert(!html.includes('<a '), `no debe generar enlace para: ${p}`);
    assert(html.includes('clic'), 'el texto del enlace se conserva');
  }
});

it('should not allow attribute injection through quotes in link URLs or labels', () => {
  const payloads = [
    '[x](" onmouseover="alert`1`" x=")',
    '[x](https://ok.example/a" onclick="alert`1`)',
    '[" onmouseover="alert`1`](https://ok.example)',
    '[x](https://ok.example/\' onfocus=\'alert`1`)'
  ];
  for (const p of payloads) {
    assertNoActiveContent(formatText(p), p);
  }
});

it('should not allow attribute injection through decoded file paths', () => {
  const payloads = [
    '[f](file:///C:/a%22%20onclick=%22alert`1`/x.png)',
    '[f](file:///C:/a%27%20onmouseover=%27alert`1`/x.png)',
    '[f](file:///C:/%3Cimg%20src=x%20onerror=alert`1`%3E.png)'
  ];
  for (const p of payloads) {
    const html = formatText(p);
    assertNoActiveContent(html, p);
    assert(!/<img/i.test(html), `no debe crear etiquetas desde la ruta: ${p}`);
  }
});

it('should not throw on malformed percent-encoding in file links', () => {
  assert.doesNotThrow(() => formatText('[f](file:///C:/100%/x.png)'));
  assert(formatText('[f](file:///C:/100%/x.png)').includes('inline-file-chip'));
});

it('should keep legitimate links, file chips, hex swatches and basic markdown working', () => {
  const link = formatText('[Linear](https://linear.app/features)');
  assert(link.includes('<a href="https://linear.app/features"'));
  assert(link.includes('rel="noopener noreferrer"'));

  const local = formatText('[Showcase](/preview/showcase)');
  assert(local.includes('<a href="/preview/showcase"'));

  const chip = formatText('[Estado](file:///C:/proyectos/acme/design-system-state.json)');
  assert(chip.includes('class="inline-file-chip"'));
  assert(chip.includes('data-file="design-system-state.json"'));
  assert(chip.includes('data-path="/C:/proyectos/acme/design-system-state.json"'));

  assert(formatText('Primario #0B2E5E listo').includes('hex-swatch-pill'));
  assert(formatText('**negrita** y `codigo`').includes('<strong>negrita</strong>'));
  assert(formatText('texto con <b>html</b>').includes('&lt;b&gt;html&lt;/b&gt;'));
});

it('should tolerate non-string input', () => {
  assert.doesNotThrow(() => formatText(undefined));
  assert.doesNotThrow(() => formatText(null));
});

console.log(`\nSummary: ${passedTests}/${totalTests} tests passed.`);
