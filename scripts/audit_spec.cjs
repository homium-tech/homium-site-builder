/**
 * Master Spec Auditor
 * Verifica la especificación maestra [Brand]_Design_System.md: sin marcas de plantilla sin resolver,
 * con las 5 secciones canónicas y coherente con design-system-state.json.
 *
 * Usage: node audit_spec.cjs <path-to-spec.md> [--state design-system-state.json]
 *
 * Exit codes: 0 = pasa (puede haber advertencias), 1 = errores críticos.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const stateFlag = args.indexOf('--state');
const statePath = stateFlag !== -1 ? args[stateFlag + 1] : null;
const targetFile = args.find((a, i) => !a.startsWith('--') && (stateFlag === -1 || i !== stateFlag + 1));

if (!targetFile) {
  console.error('Uso: node audit_spec.cjs <path-to-spec.md> [--state design-system-state.json]');
  process.exit(1);
}

const filePath = path.resolve(process.cwd(), targetFile);
if (!fs.existsSync(filePath)) {
  console.error(`[Audit Error]: Archivo no encontrado en ${filePath}`);
  process.exit(1);
}

let state = null;
if (statePath) {
  const resolvedState = path.resolve(process.cwd(), statePath);
  if (!fs.existsSync(resolvedState)) {
    console.error(`[Audit Error]: Estado no encontrado en ${resolvedState}`);
    process.exit(1);
  }
  try {
    state = JSON.parse(fs.readFileSync(resolvedState, 'utf8').replace(/^﻿/, ''));
  } catch (err) {
    console.error(`[Audit Error]: ${resolvedState} no es JSON válido (${err.message})`);
    process.exit(1);
  }
}

const markdown = fs.readFileSync(filePath, 'utf8').replace(/^﻿/, '');
const errors = [];
const warnings = [];

// Texto fuera de bloques de código (``` o ~~~): los comentarios HTML dentro de un bloque son contenido legítimo
function stripFencedCode(text) {
  const lines = text.split('\n');
  const kept = [];
  let fence = null;
  for (const line of lines) {
    const m = line.match(/^\s*(`{3,}|~{3,})/);
    if (m) {
      if (!fence) fence = m[1][0];
      else if (m[1][0] === fence) fence = null;
      continue;
    }
    if (!fence) kept.push(line);
  }
  return kept.join('\n');
}
const prose = stripFencedCode(markdown);

// 1. Placeholders de plantilla sin resolver ({{NOMBRE}}, {{name}}, {{#EACH X}}, {{/EACH}}): también dentro de bloques de código
const placeholders = new Set(markdown.match(/\{\{[^\n]*?\}\}/g) || []);
if (placeholders.size > 0) {
  errors.push(`Placeholders de plantilla sin resolver: ${Array.from(placeholders).slice(0, 8).join(', ')}${placeholders.size > 8 ? ' …' : ''}. Reemplázalos por los valores reales (los bucles {{#EACH}} se expanden uno por elemento).`);
}

// 2. Comentarios HTML de la plantilla (instrucciones al agente) que no se eliminaron
const comments = prose.match(/<!--[\s\S]*?-->/g) || [];
if (comments.length > 0) {
  const instructions = comments.filter(c => /INSTRUCCI[ÓO]N/i.test(c)).length;
  errors.push(`Quedan ${comments.length} comentario(s) <!-- --> de la plantilla en la especificación${instructions ? ` (${instructions} con "INSTRUCCIÓN PARA EL AGENTE")` : ''}. Elimínalos: son instrucciones internas, no contenido del entregable.`);
}

// 3. Esqueleto canónico: índice y 5 secciones
if (!/^##\s+ÍNDICE\b/m.test(markdown)) {
  warnings.push('Falta el encabezado "## ÍNDICE".');
}
for (let n = 1; n <= 5; n++) {
  if (!new RegExp(`^##\\s+SECCI[ÓO]N\\s+${n}\\b`, 'm').test(markdown)) {
    errors.push(`Sección canónica ausente: "## SECCIÓN ${n}".`);
  }
}

// 4. Encabezados que conservan la marca "(Opcional)" de la plantilla aunque la sección se generó
const optionalHeadings = (prose.match(/^#{2,4}\s+.*\(Opcional\).*$/gm) || []).map(h => h.replace(/^#+\s+/, ''));
if (optionalHeadings.length > 0) {
  warnings.push(`Encabezado(s) con "(Opcional)" en secciones ya generadas: ${optionalHeadings.join(' · ')}. Quita la marca (o elimina la sección si no aplica).`);
}

// 5. Coherencia con el estado del proyecto
if (state) {
  const brandName = typeof state.brand === 'string' ? state.brand : state.brand && state.brand.name;
  const title = (markdown.match(/^#\s+.*$/m) || [''])[0];
  if (brandName && !title.toLowerCase().includes(String(brandName).toLowerCase())) {
    warnings.push(`El título no menciona la marca del estado ("${brandName}").`);
  }

  // El formato de exportación elegido en la Etapa 4.1 debe tener su bloque en la §5
  const format = String(state.export_format || '').toLowerCase();
  const exportChecks = [
    { test: /tailwind/, block: /@theme|theme\.extend|tailwind\.config/, label: 'Tailwind (@theme o theme.extend)' },
    { test: /scss|sass/, block: /^\s*\$[a-z0-9_-]+\s*:/m, label: 'variables SCSS ($nombre: valor)' },
    { test: /json|dtcg|style dictionary/, block: /\$value/, label: 'tokens DTCG ($value)' },
    { test: /css/, block: /:root\s*\{/, label: 'variables CSS (:root)' }
  ];
  const wanted = exportChecks.find(c => c.test.test(format));
  if (wanted) {
    const section5 = markdown.split(/^##\s+SECCI[ÓO]N\s+5\b/m)[1] || '';
    if (!wanted.block.test(section5)) {
      errors.push(`El formato de exportación elegido ("${state.export_format}") no tiene su bloque en la SECCIÓN 5: se esperaba ${wanted.label}.`);
    }
  }

  // Colores literales fuera de la lista permitida del proyecto
  const allowed = new Set(((state.palette && state.palette.allowed_hexes) || []).map(h => String(h).toLowerCase()));
  if (allowed.size > 0) {
    const stray = new Set();
    for (const hex of markdown.match(/#[0-9a-fA-F]{6}\b/g) || []) {
      const lower = hex.toLowerCase();
      if (!allowed.has(lower) && lower !== '#ffffff' && lower !== '#000000') stray.add(hex);
    }
    if (stray.size > 0) {
      warnings.push(`Colores en la especificación que no están en palette.allowed_hexes: ${Array.from(stray).slice(0, 10).join(', ')}${stray.size > 10 ? ' …' : ''}.`);
    }
  }
}

// Razones de contraste declaradas: se comparan con el cálculo real (los agentes las escriben de memoria y suelen errar)
{
  const { findRatioMismatches } = require('./contrast.cjs');
  const wrong = findRatioMismatches(markdown);
  if (wrong.length > 0) {
    const sample = wrong.slice(0, 4).map(w => `línea ${w.line}: ${w.fg} sobre ${w.bg} declara ${w.claimed}:1 y mide ${w.measured}:1`).join(' · ');
    errors.push(`${wrong.length} razón(es) de contraste declaradas que no coinciden con el cálculo real (${sample}${wrong.length > 4 ? ' …' : ''}). Calcula cada razón con scripts/contrast.cjs, no de memoria.`);
  }
}

// Anillo de foco: un rgba translúcido pierde contraste al componerse con el fondo (WCAG 1.4.11 / 2.4.13 piden >= 3:1)
{
  const { parseColor, flatten, contrastRatio } = require('./contrast.cjs');
  const bgHex = (state && state.palette && (state.palette.bg_base || state.palette.background)) || '#FFFFFF';
  const bg = parseColor(String(bgHex)) || parseColor('#FFFFFF');
  const weak = new Set();
  for (const m of markdown.matchAll(/focus-ring[^\n]*?0 0 0 \d+px\s+(rgba?\([^)]*\))/gi)) {
    const ring = parseColor(m[1]);
    if (!ring) continue;
    const ratio = contrastRatio(flatten(ring, bg), bg);
    if (ratio < 3) weak.add(`${m[1]} compuesto sobre ${bgHex} = ${ratio.toFixed(2)}:1`);
  }
  if (weak.size > 0) {
    errors.push(`El anillo de foco no llega a 3:1 una vez compuesto con el fondo (${Array.from(weak).join('; ')}). Sube su opacidad o usa un color sólido.`);
  }
}

// Reporte
console.log('========================================');
console.log(`AUDITORÍA DE LA ESPECIFICACIÓN: ${path.basename(filePath)}`);
console.log('========================================');

if (errors.length === 0 && warnings.length === 0) {
  console.log('✅ ESTADO: 100% PASS — Especificación limpia, sin marcas de plantilla.');
  process.exit(0);
}
if (warnings.length > 0) {
  console.log(`⚠️  ADVERTENCIAS (${warnings.length}):`);
  warnings.forEach(w => console.log(`   - ${w}`));
}
if (errors.length > 0) {
  console.log(`❌ ERRORES CRÍTICOS (${errors.length}):`);
  errors.forEach(e => console.log(`   - ${e}`));
  console.log('\nLa especificación no cumple con la compuerta de aprobación de la Fase 4.');
  process.exit(1);
}
console.log('\n✅ Aprobado con advertencias menores.');
process.exit(0);
