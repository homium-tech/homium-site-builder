/**
 * Design System & Living Spec Auditor
 * Verifies generated Design System HTML files for unresolved placeholders, token completeness,
 * and WCAG contract compliance.
 *
 * Usage: node audit_design_system.cjs <path-to-design-system.html>
 */

'use strict';

const fs = require('fs');
const path = require('path');

const targetFile = process.argv[2];

if (!targetFile) {
  console.error('Uso: node audit_design_system.cjs <path-to-design-system.html>');
  process.exit(1);
}

const filePath = path.resolve(process.cwd(), targetFile);

if (!fs.existsSync(filePath)) {
  console.error(`[Audit Error]: Archivo no encontrado en ${filePath}`);
  process.exit(1);
}

const htmlContent = fs.readFileSync(filePath, 'utf8');
// Content checks (filler copy, hardcoded values) run against a comment-stripped copy so
// instructional comments in the template don't trip them.
const htmlNoComments = htmlContent.replace(/<!--[\s\S]*?-->/g, '');

const errors = [];
const warnings = [];

// 1. Check for unreplaced {{...}} placeholders
const placeholderRegex = /\{\{([A-Z0-9_-]+)\}\}/g;
let match;
const unreplacedPlaceholders = new Set();
while ((match = placeholderRegex.exec(htmlContent)) !== null) {
  unreplacedPlaceholders.add(match[0]);
}

if (unreplacedPlaceholders.size > 0) {
  errors.push(`Placeholders sin reemplazar encontrados: ${Array.from(unreplacedPlaceholders).join(', ')}`);
}

// 2. Check for documented client variables in :root
const requiredClientVars = [
  '--client-primary',
  '--client-secondary',
  '--client-accent',
  '--client-bg',
  '--client-surface',
  '--client-text',
  '--client-font-display',
  '--client-font-ui',
  '--client-radius-sm',
  '--client-radius-md',
  '--client-radius-lg',
  '--client-radius-full',
  '--sample-accent'
];

requiredClientVars.forEach(v => {
  if (!htmlContent.includes(v)) {
    warnings.push(`Variable del cliente recomendada ausente en el CSS: ${v}`);
  }
});

// 3. Check for essential 14 connected sections (la fase de sitemap fue eliminada del flujo: no hay sec-sitemap)
const requiredSectionIds = [
  'sec-discovery',
  'sec-equalizer',
  'sec-visual-dna',
  'sec-spacing',
  'sec-colors',
  'sec-typography',
  'sec-geometry',
  'sec-icons',
  'sec-motion',
  'sec-atoms',
  'sec-molecules',
  'sec-organisms',
  'sec-wcag',
  'sec-code'
];

requiredSectionIds.forEach(id => {
  if (!htmlContent.includes(`id="${id}"`)) {
    errors.push(`Sección requerida del Design System ausente: #${id}`);
  } else {
    // Verify section has non-trivial content (not just an empty container)
    const sectionMatch = htmlContent.match(new RegExp(`id="${id}"[^>]*>([\\s\\S]*?)</section>`, 'i'));
    if (sectionMatch) {
      const innerText = sectionMatch[1].replace(/<[^>]*>/g, '').replace(/&[a-z]+;/gi, ' ').trim();
      if (innerText.length < 50) {
        warnings.push(`Sección #${id} parece vacía o sin contenido real (< 50 chars de texto)`);
      }
    }
  }
});

// 4. Check for color swatches (at least one color-dot should be present)
if (!htmlContent.includes('class="color-dot"') && !htmlContent.includes("class='color-dot'")) {
  warnings.push('No se encontró ningún swatch de color (.color-dot) — la Sección 6 puede estar incompleta');
}

// 5. Living Component Library (§9, §11, §12, §13) — patrón "Component Block"
const dsBlockCount = (htmlContent.match(/class="ds-block"/g) || []).length;
if (dsBlockCount < 6) {
  errors.push(`Biblioteca de componentes viva incompleta: se esperaban >= 6 .ds-block (§11–§13), se encontraron ${dsBlockCount}. Las secciones de componentes deben renderizar instancias vivas, no maquetas estáticas.`);
}

// 5a. Filler content de la plantilla antigua no debe sobrevivir
if (/Capacidad 0\d/.test(htmlNoComments)) {
  errors.push('Contenido de relleno detectado ("Capacidad 0X") — la Sección 13 debe usar organismos reales del catálogo, no placeholders.');
}

// 5b. Los estados deben ser reales de CSS, no solo inline
['.dsc-btn:hover', ':focus-visible'].forEach(token => {
  if (!htmlContent.includes(token)) {
    errors.push(`Falta el estado real de CSS "${token}" en el Design System — los 6 estados no pueden demostrarse solo con estilos inline.`);
  }
});

// 5c. Grid vivo de iconografía (§9)
if (!htmlContent.includes('ds-icon-grid') || !htmlContent.includes('ds-icon-cell')) {
  warnings.push('La Sección 9 (Iconografía) no usa el grid vivo (.ds-icon-grid / .ds-icon-cell).');
}

// 5d. Helpers JS de componentes con estado
['dsOpenDrawer', 'dsChipToggle', 'dsStep'].forEach(fn => {
  if (!htmlContent.includes(fn)) {
    warnings.push(`Helper JS "${fn}" ausente — algún componente con estado (§12/§13) puede no ser funcional.`);
  }
});

// 5e. Sección "Vacíos conocidos"
if (!/V[aá]c[ií]os Conocidos/i.test(htmlContent)) {
  warnings.push('Falta la sección "Vacíos Conocidos" (transparencia de entrega).');
}

// 6. Datos reales vs valores hardcodeados de plantilla
// 6a. Fuente mono no debe quedar hardcodeada a "Fira Code / UI Mono"
if (/Fira Code \/ UI Mono/.test(htmlNoComments)) {
  errors.push('Fuente monospace hardcodeada ("Fira Code / UI Mono") — debe usar la mono real de la referencia (typography.font_mono).');
}

// 6b. Copy de relleno genérico de la plantilla no debe sobrevivir
const fillerCopy = [
  'Impacto Visual Maestro',
  'Arquitectura de Software y Marca',
  'Experiencias Digitales de Alta Conversión',
  'Cimientos Modulares y Escalables',
  'Diseño de sistemas con',
  'El detalle no es un detalle',
  'verificación de identidad',
];
const foundFiller = fillerCopy.filter(s => htmlNoComments.includes(s));
if (foundFiller.length) {
  errors.push(`Copy de relleno genérico detectado (viola frontend-design.md §1): ${foundFiller.join(' · ')}. Las muestras deben usar copy real de la marca.`);
}

// 6c. La escala tipográfica §7.3 no debe ser la fija HOMIUM 64/48/40
if (/4\.00rem \(64px\)[\s\S]{0,120}3\.00rem \(48px\)[\s\S]{0,120}2\.50rem \(40px\)/.test(htmlNoComments)) {
  warnings.push('La escala tipográfica de §7.3 parece la fija HOMIUM (64/48/40px). Debe reflejar los tamaños medidos de state.typography.');
}

// 6d. Export §15: debe ser el bloque completo, no la versión reducida
if (/--radius-pill: 999px;\s*}<\/code>/.test(htmlContent) && !/prefers-reduced-motion/.test(htmlContent.split('sec-code')[1] || '')) {
  warnings.push('El export de tokens de §15 parece la versión reducida (6 colores). Debe ser el :root completo del Master MD §5.1.');
}

// 6e. Motion / elevación deben reflejar la extracción
if (!/--motion-(fast|duration-fast|easing-standard)/.test(htmlContent)) {
  warnings.push('§10 no muestra los tokens --motion-* reales (solo el playground GSAP).');
}

// 6g. La matriz de 6 estados debe mostrar muestras de color junto a los hex
const stateMatrix = (htmlContent.match(/Matriz de 6 estados[\s\S]*?<\/table>/) || [''])[0];
if (stateMatrix) {
  const hexCount = (stateMatrix.match(/#[0-9A-Fa-f]{6}/g) || []).length;
  const dotCount = (stateMatrix.match(/class="color-dot color-dot--inline"|class="color-dot--inline color-dot"|color-dot--inline/g) || []).length;
  if (hexCount >= 3 && dotCount === 0) {
    errors.push('La "Matriz de 6 estados" lista hex sin muestra de color (.color-dot--inline). Cada hex debe llevar su swatch, igual que Component DNA.');
  }
}

// 6h. El modal (§13) no debe conservar el estilo/copy HOMIUM de la plantilla
if (/Arquitectura HOMIUM|resplandor cyan/.test(htmlNoComments)) {
  errors.push('El modal de §13 conserva copy de la plantilla ("Arquitectura HOMIUM" / "resplandor cyan") — debe portar copy y morfología de la referencia.');
}

// 6i. Los componentes vivos (.dsc-*) no deben usar el acento/pill HOMIUM
const cssOnly = (htmlNoComments.match(/<style>[\s\S]*?<\/style>/g) || []).join('\n');
const dscRules = (cssOnly.match(/\.dsc-[a-z-]+[^{]*\{[^}]*\}/g) || []).join('\n');
const dscHomium = [];
if (/var\(--accent\)/.test(dscRules)) dscHomium.push('var(--accent) (cian HOMIUM → usar var(--sample-accent))');
if (/var\(--radius-pill\)(?!\s*\))/.test(dscRules) && !/var\(--client-radius-full,\s*var\(--radius-pill\)\)/.test(dscRules)) {
  dscHomium.push('var(--radius-pill) sin fallback de cliente (→ var(--client-radius-full, var(--radius-pill)))');
}
if (/var\(--focus-ring\)/.test(dscRules)) dscHomium.push('var(--focus-ring) (cian HOMIUM)');
if (/rgba\(0,\s*255,\s*255/.test(dscRules)) dscHomium.push('rgba(0,255,255,…) cian hardcodeado');
if (dscHomium.length) {
  errors.push(`Componentes vivos (.dsc-*) con cromática/geometría HOMIUM en lugar de la referencia: ${dscHomium.join(' · ')}.`);
}

// 6k. Estructura del DOM: una tabla/div dentro de <tbody> o un cierre de más hace que el navegador saque las
// secciones siguientes de <main> y las deje debajo del rail lateral (se ven cortadas a la izquierda).
const { findStructureProblems } = require('./html-structure.cjs');
const structureProblems = findStructureProblems(htmlContent);
if (structureProblems.length) {
  const shown = structureProblems.slice(0, 5).map(p => `línea ${p.line}: ${p.message}`).join(' · ');
  const more = structureProblems.length > 5 ? ` (+${structureProblems.length - 5} más)` : '';
  errors.push(`HTML mal anidado — el navegador reordena el DOM y las secciones se salen del contenedor. ${shown}${more}`);
}

// 6j. Responsive / móvil
if (!/@media\s*\(max-width:\s*767px\)/.test(cssOnly)) {
  errors.push('Sin breakpoint móvil (@media max-width: 767px) — el Design System debe tener modo móvil, no solo ocultar el rail.');
}
if (!/class="mobile-nav"/.test(htmlNoComments) || !/id="mobile-jump"/.test(htmlNoComments)) {
  errors.push('Falta la navegación móvil (.mobile-nav / #mobile-jump) — sin ella no hay forma de navegar las secciones cuando el rail está oculto.');
}
const bareTables = (htmlNoComments.match(/<table class="(tech-table|type-scale-table)"/g) || []).length;
const wrappedCtx = (htmlNoComments.match(/(table-wrap|overflow-x:\s*auto)[\s\S]{0,120}?<table class="(tech-table|type-scale-table)"/g) || []).length;
const jsWrapsTables = /querySelectorAll\(['"][^'"]*table[^'"]*['"]\)[\s\S]{0,220}table-wrap/.test(htmlContent);
if (bareTables > wrappedCtx && !jsWrapsTables) {
  warnings.push(`${bareTables - wrappedCtx} tabla(s) ancha(s) sin contenedor de scroll (.table-wrap ni wrap por JS) — desbordan en móvil.`);
}

// 6f. Chip de itálica sin respaldo: "Accent Serif Italic" no debe aparecer si no hay itálica real
if (/Accent Serif Italic|Display &amp; Accent Italic/.test(htmlNoComments) &&
    !/class="accent-italic"/.test(htmlNoComments)) {
  warnings.push('El Design System menciona "Accent (Serif) Italic" pero no hay ninguna muestra .accent-italic — verificar typography.reference_uses_italic (o quitar la etiqueta).');
}

// 7. Contraste del chrome del Design System (WCAG): texto vs. el fondo sobre el que realmente se pinta
// El rail izquierdo va sobre --bg-sunken (no sobre --bg): una marca clara con rail oscuro dejaba el texto ilegible.
const { parseColor, contrastRatio } = require('./contrast.cjs');

function readVars(cssBlock) {
  const vars = {};
  const re = /(--[a-z0-9-]+)\s*:\s*([^;]+);/gi;
  let m;
  while ((m = re.exec(cssBlock)) !== null) vars[m[1]] = m[2].trim();
  return vars;
}

function resolveVar(vars, name, depth = 0) {
  if (depth > 6 || vars[name] === undefined) return null;
  const raw = vars[name];
  const ref = raw.match(/^var\(\s*(--[a-z0-9-]+)\s*(?:,\s*([^)]+))?\)$/i);
  if (!ref) return raw;
  return resolveVar(vars, ref[1], depth + 1) || (ref[2] ? ref[2].trim() : null);
}

function blockBody(css, selectorRegex) {
  const m = css.match(new RegExp(selectorRegex.source + '\\s*\\{([^}]*)\\}', selectorRegex.flags));
  return m ? m[1] : '';
}

const cssPlain = cssOnly.replace(/\/\*[\s\S]*?\*\//g, '');
const rootVars = readVars(blockBody(cssPlain, /:root/));
const lightVars = readVars(blockBody(cssPlain, /html\[data-theme="light"\],\s*body\.theme-light/));
const railScope = blockBody(cssPlain, /\.left-rail-sidebar/);
const railHasOwnTokens = /--fg-subtle:\s*var\(--rail-fg-subtle\)/.test(railScope) && /--fg:\s*var\(--rail-fg\)/.test(railScope);

// [token del texto, token del fondo, mínimo (error), AAA recomendado (advertencia), descripción]
const contrastPairs = [
  ['--fg', '--bg', 4.5, 7, 'texto principal sobre el fondo'],
  ['--fg', '--bg-elevated', 4.5, 0, 'texto principal sobre superficies elevadas'],
  ['--fg-muted', '--bg', 4.5, 0, 'texto secundario sobre el fondo'],
  ['--fg-subtle', '--bg', 4.5, 0, 'texto terciario (etiquetas, metadatos) sobre el fondo'],
  ['--fg-subtle', '--bg-elevated', 4.5, 0, 'texto terciario sobre superficies elevadas'],
  ['--accent', '--bg', 3, 4.5, 'acento (eyebrows, links, nav activo) sobre el fondo'],
  ['--fg-on-accent', '--accent', 4.5, 0, 'texto de botones sobre el acento'],
];

function railToken(vars, own, fallback) {
  return railHasOwnTokens ? own : fallback;
}

function auditTheme(label, vars) {
  const get = (name) => parseColor(resolveVar(vars, name) || '');
  const pairs = contrastPairs.slice();
  // El rail usa sus propios tokens; si la regla del rail no los aplica, hereda los globales (y se mide igual)
  pairs.push(
    [railToken(vars, '--rail-fg', '--fg'), '--bg-sunken', 4.5, 7, 'texto del rail izquierdo sobre su fondo (--bg-sunken)'],
    [railToken(vars, '--rail-fg-muted', '--fg-muted'), '--bg-sunken', 4.5, 0, 'texto secundario del rail'],
    [railToken(vars, '--rail-fg-subtle', '--fg-subtle'), '--bg-sunken', 4.5, 0, 'etiquetas e ítems de navegación del rail'],
    [railToken(vars, '--rail-accent', '--accent'), '--bg-sunken', 4.5, 0, 'acento del rail (ítem activo, grupo abierto)'],
    [railToken(vars, '--rail-on-accent', '--fg-on-accent'), railToken(vars, '--rail-accent', '--accent'), 4.5, 0, 'texto del botón del rail sobre su acento']
  );

  const unresolved = new Set();
  for (const [fgName, bgName, min, aaa, desc] of pairs) {
    const fg = get(fgName);
    const bg = get(bgName);
    if (!fg || !bg || bg.a < 1) { unresolved.add(`${fgName}/${bgName}`); continue; }
    const ratio = contrastRatio(fg, bg);
    if (ratio < min) {
      errors.push(`Contraste insuficiente (${label}): ${desc} — ${fgName} sobre ${bgName} = ${ratio.toFixed(2)}:1 (mínimo ${min}:1). Ajusta el token (para texto sobre el acento usa #000000 o #FFFFFF, el de mayor contraste; para el rail define --rail-* contra --bg-sunken).`);
    } else if (aaa && ratio < aaa) {
      warnings.push(`Contraste por debajo de AAA (${label}): ${desc} — ${fgName} sobre ${bgName} = ${ratio.toFixed(2)}:1 (recomendado ${aaa}:1).`);
    }
  }
  // Colores semánticos (éxito, advertencia, error, info): se miden sobre el fondo y la superficie del tema.
  // Los --sev-* son tokens fijos del chrome (solo advertencia); los --client-* provienen de la paleta del cliente (error < 3:1).
  const semantic = Object.keys(vars).filter(k => /^--(sev-[a-z]+|client-(success|warning|error|danger|info))$/.test(k));
  for (const name of semantic) {
    const fg = get(name);
    if (!fg) continue;
    for (const bgName of ['--bg', '--bg-elevated']) {
      const bg = get(bgName);
      if (!bg || bg.a < 1) continue;
      const ratio = contrastRatio(fg, bg);
      const isClient = name.startsWith('--client-');
      if (isClient && ratio < 3) {
        errors.push(`Contraste insuficiente (${label}): color semántico ${name} sobre ${bgName} = ${ratio.toFixed(2)}:1 (mínimo 3:1). Deriva el tono de la rampa del primario con más diferencia tonal.`);
      } else if (ratio < 4.5) {
        warnings.push(`Contraste por debajo de 4.5:1 (${label}): color semántico ${name} sobre ${bgName} = ${ratio.toFixed(2)}:1. Acompáñalo siempre con ícono o texto y usa un tono más oscuro/claro si se usa como texto.`);
      }
    }
  }
  return unresolved;
}

if (!rootVars['--bg'] || !rootVars['--fg']) {
  warnings.push('No se pudieron leer --bg / --fg del :root: se omitió la verificación de contraste del chrome.');
} else {
  const unresolved = auditTheme('tema base', rootVars);
  if (Object.keys(lightVars).length > 0) {
    // El tema claro redefine solo parte de los tokens: el resto se hereda del :root
    const light = { ...rootVars, ...lightVars };
    auditTheme('tema claro', light).forEach(x => unresolved.add(x));
  }
  if (unresolved.size > 0) {
    warnings.push(`Contraste no verificable (token ausente, no opaco o no hex/rgb): ${Array.from(unresolved).join(', ')}`);
  }
}

// 8. Las fuentes que el estado declara deben cargarse de verdad
// Un @font-face con solo local('X') o con un archivo inexistente deja el Design System en la fuente de respaldo
// sin que se note: lo que se muestra no es la fuente que el cliente eligió. Si no hay archivo utilizable, el estado
// debe declarar la sustitución (typography.font_substitutions) para que quede como advertencia explícita.
{
  const { firstFamily, fontLoader } = require('./font-loading.cjs');
  const stateCandidates = [path.join(path.dirname(filePath), 'design-system-state.json'), path.join(process.cwd(), 'design-system-state.json')];
  let state = null;
  for (const candidate of stateCandidates) {
    try { state = JSON.parse(fs.readFileSync(candidate, 'utf8').replace(/^﻿/, '')); break; } catch (e) { /* siguiente */ }
  }
  const typo = state && state.typography && typeof state.typography === 'object' ? state.typography : null;
  if (typo) {
    const loader = fontLoader(cssOnly, htmlNoComments, path.dirname(filePath));
    const declared = Array.isArray(typo.font_substitutions) ? typo.font_substitutions : [];
    const substituted = new Set(declared.filter(s => s && s.family).map(s => String(s.family).trim().toLowerCase()));
    const roles = [['font_display', 'titulares'], ['font_ui', 'interfaz y texto'], ['font_accent_italic', 'acento']];
    const seen = new Set();
    for (const [key, label] of roles) {
      const family = firstFamily(typo[key]);
      if (!family || seen.has(family.toLowerCase())) continue;
      seen.add(family.toLowerCase());
      if (loader.has(family)) continue;
      if (substituted.has(family.toLowerCase())) {
        warnings.push(`La fuente ${family} (${label}) no se carga y está declarada como sustituida en typography.font_substitutions: el Design System se ve con la fuente de respaldo.`);
      } else {
        errors.push(`La fuente ${family} (${label}) está en el estado pero no se carga: ${loader.why(family)}. Adjunta su archivo (TTF, OTF, WOFF o WOFF2) a uploads/, cópialo a assets/fonts/ y declara @font-face con url(); si el cliente no puede aportarlo, declara la sustitución en typography.font_substitutions ({ family, reason, substitute }) y avísale.`);
      }
    }
  }
}

// Report results
console.log('========================================');
console.log(`AUDITORÍA TÉCNICA DEL DESIGN SYSTEM: ${path.basename(filePath)}`);
console.log('========================================');

if (errors.length === 0 && warnings.length === 0) {
  console.log('✅ ESTADO: 100% PASS — Design System validado con éxito. Sin placeholders huérfanos.');
  process.exit(0);
} else {
  if (warnings.length > 0) {
    console.log(`⚠️  ADVERTENCIAS (${warnings.length}):`);
    warnings.forEach(w => console.log(`   - ${w}`));
  }
  if (errors.length > 0) {
    console.log(`❌ ERRORES CRÍTICOS (${errors.length}):`);
    errors.forEach(e => console.log(`   - ${e}`));
    console.log('\nEl archivo no cumple con la compuerta de aprobación de la Fase 4.');
    process.exit(1);
  } else {
    console.log('\n✅ Aprobado con advertencias menores.');
    process.exit(0);
  }
}
