/**
 * Showcase & Living Spec Auditor
 * Verifies generated HTML showcases for unresolved placeholders, token completeness,
 * and WCAG contract compliance.
 *
 * Usage: node audit_showcase.cjs <path-to-showcase.html>
 */

'use strict';

const fs = require('fs');
const path = require('path');

const targetFile = process.argv[2];

if (!targetFile) {
  console.error('Uso: node audit_showcase.cjs <path-to-showcase.html>');
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

// 3. Check for essential 15 connected sections
const requiredSectionIds = [
  'sec-discovery',
  'sec-equalizer',
  'sec-sitemap',
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
    errors.push(`Sección requerida del Showcase ausente: #${id}`);
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
    errors.push(`Falta el estado real de CSS "${token}" en el showcase — los 6 estados no pueden demostrarse solo con estilos inline.`);
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

// 6j. Responsive / móvil
if (!/@media\s*\(max-width:\s*767px\)/.test(cssOnly)) {
  errors.push('Sin breakpoint móvil (@media max-width: 767px) — el showcase debe tener modo móvil, no solo ocultar el rail.');
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
  warnings.push('El showcase menciona "Accent (Serif) Italic" pero no hay ninguna muestra .accent-italic — verificar typography.reference_uses_italic (o quitar la etiqueta).');
}

// Report results
console.log('========================================');
console.log(`AUDITORÍA TÉCNICA DEL SHOWCASE: ${path.basename(filePath)}`);
console.log('========================================');

if (errors.length === 0 && warnings.length === 0) {
  console.log('✅ ESTADO: 100% PASS — Showcase validado con éxito. Sin placeholders huérfanos.');
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
