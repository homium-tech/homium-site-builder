/**
 * Prototype Auditor
 * Automatiza el "Checklist Manual Complementario" de la Etapa 5.5: contraste de los textos y del anillo
 * de foco en cada tema, foco visible, accesibilidad del menú móvil, estructura semántica de cada pantalla,
 * dependencias externas y decisiones del proyecto (fuentes, sistema de iconos).
 *
 * Es un análisis estático (sin navegador): complementa a verify_fidelity.cjs, no lo reemplaza.
 *
 * Usage: node audit_prototype.cjs [--dir prototype] [--state design-system-state.json]
 *
 * Exit codes: 0 = pasa (puede haber advertencias), 1 = errores críticos.
 */

'use strict';

const fs = require('fs');
const { findStructureProblems } = require('./html-structure.cjs');
const path = require('path');
const { parseColor, flatten, contrastRatio } = require('./contrast.cjs');

function flag(name, fallback) {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const protoDir = path.resolve(process.cwd(), flag('--dir', 'prototype'));
const statePath = flag('--state', null);

if (!fs.existsSync(protoDir) || !fs.statSync(protoDir).isDirectory()) {
  console.error(`[Audit Error]: Carpeta del prototipo no encontrada en ${protoDir}`);
  process.exit(1);
}

let state = null;
if (statePath) {
  try {
    state = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), statePath), 'utf8').replace(/^﻿/, ''));
  } catch (err) {
    console.error(`[Audit Error]: No se pudo leer el estado (${err.message})`);
    process.exit(1);
  }
}

const errors = [];
const warnings = [];
const read = (f) => fs.readFileSync(path.join(protoDir, f), 'utf8');
const files = fs.readdirSync(protoDir);
const htmlFiles = files.filter(f => f.endsWith('.html')).sort();
const cssFiles = files.filter(f => f.endsWith('.css'));
const jsFiles = files.filter(f => f.endsWith('.js'));

if (htmlFiles.length === 0) {
  console.error(`[Audit Error]: No hay archivos .html en ${protoDir}`);
  process.exit(1);
}

const pages = htmlFiles.map(f => ({ name: f, html: read(f).replace(/<!--[\s\S]*?-->/g, '') }));
// CSS de los .css y de los <style> de las páginas
const css = [
  ...cssFiles.map(read),
  ...pages.flatMap(p => (p.html.match(/<style[^>]*>([\s\S]*?)<\/style>/g) || []).map(s => s.replace(/<\/?style[^>]*>/g, '')))
].join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
// Los @import/@charset terminan en ";" y, sin quitarlos, se pegarían al selector de la regla siguiente (:root).
// La URL de Google Fonts contiene ";" (wght@0,600;0,700), por eso se salta la URL antes de buscar el cierre.
const cssRules = css
  .replace(/@import\s+(?:url\([^)]*\)|'[^']*'|"[^"]*")[^;]*;/gi, '')
  .replace(/@(charset|namespace)\b[^;]*;/gi, '');
const js = [
  ...jsFiles.map(read),
  ...pages.flatMap(p => (p.html.match(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g) || []).map(s => s.replace(/<\/?script[^>]*>/g, '')))
].join('\n');

// ---------------------------------------------------------------------------
// CSS: reglas y variables por tema
// ---------------------------------------------------------------------------
const rules = [];
for (const m of cssRules.matchAll(/([^{}@][^{}]*)\{([^{}]*)\}/g)) {
  const selector = m[1].trim();
  if (!selector || /^(from|to|\d+%)(\s*,\s*(from|to|\d+%))*$/.test(selector)) continue;
  rules.push({ selector, body: m[2] });
}

function readVars(body) {
  const vars = {};
  for (const m of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);?/gi)) vars[m[1]] = m[2].trim();
  return vars;
}

const baseVars = {};
const themeVars = {};
for (const r of rules) {
  const vars = readVars(r.body);
  if (Object.keys(vars).length === 0) continue;
  const theme = r.selector.match(/\[data-theme=["']?([\w-]+)["']?\]/);
  if (theme) Object.assign(themeVars[theme[1]] = themeVars[theme[1]] || {}, vars);
  else if (/^(:root|html)$/.test(r.selector)) Object.assign(baseVars, vars);
}
const themes = [{ label: 'tema base', vars: baseVars }];
for (const [name, vars] of Object.entries(themeVars)) themes.push({ label: `tema ${name}`, vars: { ...baseVars, ...vars } });

function resolve(vars, value, depth = 0) {
  if (value == null || depth > 8) return value;
  return String(value).replace(/var\(\s*(--[a-z0-9-]+)\s*(?:,\s*([^)]+))?\)/gi, (all, name, fallback) => {
    if (vars[name] !== undefined) return resolve(vars, vars[name], depth + 1);
    return fallback !== undefined ? resolve(vars, fallback.trim(), depth + 1) : all;
  });
}

function decl(body, prop) {
  const m = body.match(new RegExp(`(?:^|;|\\s)${prop}\\s*:\\s*([^;]+)`, 'i'));
  return m ? m[1].trim() : null;
}

function colorOf(vars, value, over) {
  const resolved = resolve(vars, value);
  if (!resolved) return null;
  const token = resolved.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/);
  const c = token ? parseColor(token[0]) : parseColor(resolved.trim());
  if (!c) return null;
  return c.a < 1 && over ? flatten(c, over) : c;
}

function pageBackground(vars) {
  for (const sel of [/^(html\s*,\s*)?body$/, /^html$/, /^:root$/]) {
    for (const r of rules.filter(x => sel.test(x.selector))) {
      const bg = decl(r.body, 'background-color') || decl(r.body, 'background');
      const c = bg && colorOf(vars, bg);
      if (c && c.a === 1) return c;
    }
  }
  const name = Object.keys(vars).find(k => /^--(color-)?(bg|background)(-base|-default|-page)?$/.test(k));
  const c = name && colorOf(vars, vars[name]);
  return c && c.a === 1 ? c : null;
}

const hex = (c) => '#' + [c.r, c.g, c.b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();

// ---------------------------------------------------------------------------
// 1. Contraste de textos y del anillo de foco, por tema
// ---------------------------------------------------------------------------
const SKIP_STATES = /:disabled|\[disabled\]|\.disabled|::placeholder|::selection/;
const reported = new Set();

for (const theme of themes) {
  const pageBg = pageBackground(theme.vars);
  if (!pageBg) {
    warnings.push(`Contraste (${theme.label}): no se encontró el fondo de la página (background de body/:root o --bg); se omitió la medición.`);
    continue;
  }

  for (const r of rules) {
    if (/^(:root|html)$/.test(r.selector) || /\[data-theme/.test(r.selector) && !decl(r.body, 'color')) continue;
    if (SKIP_STATES.test(r.selector)) continue;

    const fgRaw = decl(r.body, 'color');
    if (fgRaw && !/^(inherit|currentcolor|transparent|initial|unset)$/i.test(fgRaw)) {
      const bgRaw = decl(r.body, 'background-color') || decl(r.body, 'background');
      const own = bgRaw ? colorOf(theme.vars, bgRaw, pageBg) : null;
      const bg = own || pageBg;
      const fg = colorOf(theme.vars, fgRaw, bg);
      if (fg && bg) {
        const ratio = contrastRatio(fg, bg);
        const key = `${theme.label}|${r.selector}|${hex(fg)}|${hex(bg)}`;
        if (ratio < 4.5 && !reported.has(key)) {
          reported.add(key);
          const msg = `Contraste (${theme.label}): "${r.selector.replace(/\s+/g, ' ')}" usa texto ${hex(fg)} sobre ${hex(bg)}${own ? '' : ' (fondo de la página)'} = ${ratio.toFixed(2)}:1`;
          if (ratio < 3) errors.push(`${msg} (mínimo 4.5:1; incluso el texto grande exige 3:1). Define un token de texto más oscuro/claro para este tema.`);
          else warnings.push(`${msg} (4.5:1 para texto normal; solo válido si es texto grande).`);
        }
      }
    }

    // Anillo de foco: componente de interfaz, mínimo 3:1 contra el fondo (WCAG 1.4.11)
    if (/:focus(-visible|-within)?(?![\w-])/.test(r.selector)) {
      const ringRaw = decl(r.body, 'box-shadow') || decl(r.body, 'outline') || decl(r.body, 'outline-color');
      const ring = ringRaw && !/^(none|0)$/i.test(ringRaw) ? colorOf(theme.vars, ringRaw, pageBg) : null;
      if (ring) {
        const ratio = contrastRatio(ring, pageBg);
        const key = `focus|${theme.label}|${hex(ring)}|${hex(pageBg)}`;
        if (ratio < 3 && !reported.has(key)) {
          reported.add(key);
          errors.push(`Anillo de foco (${theme.label}): "${r.selector.replace(/\s+/g, ' ')}" pinta ${hex(ring)} sobre ${hex(pageBg)} = ${ratio.toFixed(2)}:1 (mínimo 3:1 para componentes de interfaz). Usa un tono más claro/oscuro de la paleta.`);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 2. Foco visible en enlaces y botones
// ---------------------------------------------------------------------------
const focusSelectors = rules.filter(r => /:focus(-visible)?(?![\w-])/.test(r.selector) && !/:focus-within/.test(r.selector)).map(r => r.selector);
const genericFocus = focusSelectors.some(s => s.split(',').some(p => /^\s*(\*|:focus(-visible)?)\s*(:focus(-visible)?)?\s*$/.test(p) || /^\s*:where\(.*\):focus-visible\s*$/.test(p)));
const coversLinks = genericFocus || focusSelectors.some(s => /(^|[\s,])a(\.|:|\s|,|$)/.test(s));
const coversButtons = genericFocus || focusSelectors.some(s => /button|\.btn|\[role=["']?button/.test(s));
if (!coversLinks) warnings.push('Ningún estilo de foco visible para enlaces (a:focus-visible o :focus-visible global): la navegación por teclado no muestra dónde está el foco.');
if (!coversButtons) warnings.push('Ningún estilo de foco visible para botones (button:focus-visible o :focus-visible global).');
for (const r of rules) {
  if (/:focus/.test(r.selector)) continue;
  if (/outline\s*:\s*(none|0)\b/i.test(r.body) && !/box-shadow|border/i.test(r.body) && /^(a|button|input|select|textarea|\*)\b|\.btn/.test(r.selector.trim())) {
    errors.push(`Se elimina el contorno de foco en "${r.selector.replace(/\s+/g, ' ')}" sin reemplazo (outline: none sin box-shadow/borde).`);
  }
}

// ---------------------------------------------------------------------------
// 2b. Tamaño de los objetivos táctiles (WCAG 2.5.8: mínimo 24x24 px)
// Estimación estática y optimista: usa height/min-height si existen; si no, font-size x line-height (+ padding vertical
// cuando la regla fija un display de bloque). Si aun así queda < 24px, el objetivo real seguro es más pequeño.
// ---------------------------------------------------------------------------
function px(value, fontSize = 16) {
  const m = String(value || '').trim().match(/^(-?\d*\.?\d+)(px|rem|em)?$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (m[2] === 'rem') return n * 16;
  if (m[2] === 'em') return n * fontSize;
  return n;
}

const bodyRule = rules.find(r => /^(html\s*,\s*)?body$/.test(r.selector));
const bodyLineHeight = (() => {
  const lh = bodyRule && decl(bodyRule.body, 'line-height');
  const n = lh && parseFloat(lh);
  return n && /^\d*\.?\d+$/.test(lh.trim()) ? n : 1.5;
})();

const TARGET_SELECTOR = /(^|[\s>+~,])(a|button)(?![\w-])|link|\.btn|\.icon-btn|-btn\b/i;
const reportedTargets = new Set();
for (const r of rules) {
  if (!TARGET_SELECTOR.test(r.selector) || /:(hover|focus|focus-visible|active|disabled|before|after)|::/.test(r.selector)) continue;
  if (/^(:root|html|body)$/.test(r.selector.trim())) continue;

  const fs = px(decl(r.body, 'font-size')) || 16;
  const explicit = px(decl(r.body, 'height'), fs) || px(decl(r.body, 'min-height'), fs);
  let estimate = explicit;
  if (!estimate) {
    const lhRaw = decl(r.body, 'line-height');
    const lh = lhRaw ? (/^\d*\.?\d+$/.test(lhRaw.trim()) ? parseFloat(lhRaw) * fs : px(lhRaw, fs)) : bodyLineHeight * fs;
    estimate = lh;
    if (/display\s*:\s*(block|inline-block|flex|inline-flex|grid|inline-grid)/i.test(r.body)) {
      const pad = (decl(r.body, 'padding') || '').split(/\s+/).map(v => px(v, fs));
      const top = px(decl(r.body, 'padding-top'), fs) ?? (pad.length ? pad[0] : 0);
      const bottom = px(decl(r.body, 'padding-bottom'), fs) ?? (pad.length ? (pad.length >= 3 ? pad[2] : pad[0]) : 0);
      estimate += (top || 0) + (bottom || 0);
    }
  }
  const key = r.selector.replace(/\s+/g, ' ');
  if (estimate && estimate < 24 && !reportedTargets.has(key)) {
    reportedTargets.add(key);
    warnings.push(`Objetivo táctil pequeño: "${key}" mide ~${Math.round(estimate)}px de alto (WCAG 2.5.8 pide al menos 24px; la guía móvil pide 44-48px). Añade min-height o padding vertical con display: inline-flex/block.`);
  }
}

// ---------------------------------------------------------------------------
// 3. Menú móvil fuera de pantalla
// ---------------------------------------------------------------------------
const offscreen = /(?:left|right)\s*:\s*-\s*\d+(?:\.\d+)?(?:%|vw|px|rem)|translate[XxY]?\(\s*-?\d+(?:\.\d+)?%/;
for (const r of rules) {
  if (!/drawer|offcanvas|off-canvas|sidebar-mobile|mobile-menu(?!-btn)/i.test(r.selector) || /\.(is-open|open|active|is-active)\b|:target/.test(r.selector)) continue;
  if (!offscreen.test(r.body)) continue;
  const hidden = /visibility\s*:\s*hidden|display\s*:\s*none/i.test(r.body);
  const cls = (r.selector.match(/\.([\w-]*(?:drawer|offcanvas|off-canvas|mobile-menu)[\w-]*)/i) || [])[1];
  const inertInHtml = cls && pages.every(p => {
    const tag = (p.html.match(new RegExp(`<[a-z]+[^>]*class="[^"]*\\b${cls}\\b[^"]*"[^>]*>`, 'i')) || [''])[0];
    return !tag || /\binert\b|\bhidden\b|aria-hidden="true"/.test(tag);
  });
  if (!hidden && !inertInHtml) {
    errors.push(`El menú móvil "${r.selector.replace(/\s+/g, ' ')}" se oculta solo moviéndolo fuera de pantalla: sus enlaces siguen siendo tabulables (y lo leen los lectores de pantalla). Añade visibility: hidden en su estado cerrado (con transición) o el atributo inert.`);
  }
}

// ---------------------------------------------------------------------------
// 4. Estructura y accesibilidad de cada pantalla
// ---------------------------------------------------------------------------
let sawActiveClassWithoutCurrent = false;
for (const { name, html } of pages) {
  const at = `${name}:`;
  const structure = findStructureProblems(html);
  if (structure.length) {
    errors.push(`${at} HTML mal anidado (el navegador reordena el DOM): ${structure.slice(0, 3).map(p => `línea ${p.line}: ${p.message}`).join(' · ')}`);
  }
  if (!/<html[^>]*\blang="[a-z]{2}/i.test(html)) errors.push(`${at} <html> sin atributo lang.`);
  if (!/<title>[^<]+<\/title>/i.test(html)) errors.push(`${at} falta <title>.`);
  if (!/<meta[^>]*name="viewport"/i.test(html)) errors.push(`${at} falta <meta name="viewport">.`);
  if (!/<main[\s>]/i.test(html)) errors.push(`${at} falta el landmark <main>.`);
  const h1 = (html.match(/<h1[\s>]/gi) || []).length;
  if (h1 === 0) errors.push(`${at} no tiene <h1>.`);
  else if (h1 > 1) warnings.push(`${at} tiene ${h1} <h1>.`);

  const noAlt = (html.match(/<img\b[^>]*>/gi) || []).filter(t => !/\balt=/i.test(t)).length;
  if (noAlt > 0) errors.push(`${at} ${noAlt} imagen(es) sin atributo alt.`);

  // Controles de formulario con etiqueta asociada
  const forIds = new Set([...html.matchAll(/<label[^>]*\bfor="([^"]+)"/gi)].map(m => m[1]));
  const wrapped = (tag) => new RegExp(`<label\\b(?:(?!</label>)[\\s\\S])*?${tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(html);
  const unlabeled = (html.match(/<(input|select|textarea)\b[^>]*>/gi) || []).filter(tag => {
    if (/type="(hidden|submit|button|reset|image)"/i.test(tag)) return false;
    const id = (tag.match(/\bid="([^"]+)"/) || [])[1];
    return !(/aria-label(ledby)?=/i.test(tag) || (id && forIds.has(id)) || wrapped(tag));
  }).length;
  if (unlabeled > 0) errors.push(`${at} ${unlabeled} control(es) de formulario sin <label> asociado ni aria-label.`);

  // Botón de menú: debe anunciar su estado
  const menuBtn = (html.match(/<button\b[^>]*>/gi) || []).find(t => /(menu|menú|hamburg|nav)/i.test(t) && !/theme|tema/i.test(t));
  if (menuBtn && !/aria-expanded=/i.test(menuBtn)) {
    errors.push(`${at} el botón del menú no declara aria-expanded (ni aria-controls): los lectores de pantalla no saben si está abierto.`);
  }

  const navs = html.match(/<nav\b[^>]*>/gi) || [];
  if (navs.length > 1 && navs.some(t => !/aria-label(ledby)?=/i.test(t))) {
    warnings.push(`${at} hay ${navs.length} <nav> y alguno no tiene aria-label distintivo.`);
  }
  if (/<nav[\s\S]*?class="[^"]*\bactive\b/i.test(html) && !/aria-current=/i.test(html)) sawActiveClassWithoutCurrent = true;

  const bodyStart = html.slice(html.search(/<body/i), html.search(/<body/i) + 900);
  if (!/<a[^>]*href="#[^"]*"[^>]*>[^<]*(saltar|skip|ir al contenido)/i.test(bodyStart)) {
    warnings.push(`${at} no hay enlace "Saltar al contenido" al inicio del <body>.`);
  }
  if (!/<link[^>]*rel="(shortcut )?icon"/i.test(html)) warnings.push(`${at} sin favicon (<link rel="icon">).`);

  const inline = (html.match(/\sstyle="/g) || []).length;
  if (inline > 15) warnings.push(`${at} ${inline} estilos en línea: muévelos a clases del CSS con los tokens del sistema.`);
}
if (sawActiveClassWithoutCurrent) warnings.push('La navegación marca la página con la clase "active" pero no usa aria-current="page".');

// ---------------------------------------------------------------------------
// 5. Dependencias externas, fuentes y sistema de iconos
// ---------------------------------------------------------------------------
const external = new Set();
const unpinned = new Set();
// Solo recursos que se cargan (link/script/img/…, @import, url()); un <a href> a una red social es navegación, no dependencia
const LOADED_RESOURCE = /<(?:link|script|img|source|video|audio|iframe|embed)\b[^>]*?\s(?:src|href)="(?:https?:)?\/\/([^/"]+)([^"]*)|@import\s+(?:url\()?['"]?(?:https?:)?\/\/([^/'")]+)([^'")]*)|url\(\s*['"]?(?:https?:)?\/\/([^/'")]+)([^'")]*)/gi;
for (const src of [css, ...pages.map(p => p.html)]) {
  for (const m of src.matchAll(LOADED_RESOURCE)) {
    const host = m[1] || m[3] || m[5];
    external.add(host);
    if (/@latest\b/.test(m[2] || m[4] || m[6] || '')) unpinned.add(host);
  }
}
for (const host of unpinned) {
  warnings.push(`La dependencia de ${host} usa @latest: fija una versión (p. ej. @1.3.4) para que el prototipo no cambie ni se rompa cuando salga una versión nueva.`);
}
for (const host of [...external].filter(h => !/^(www\.)?w3\.org$/.test(h))) {
  warnings.push(`Dependencia externa (${host}): el prototipo no funciona sin conexión y su contenido no está bajo control del proyecto.`);
}

if (state && state.typography) {
  // Las fuentes se guardan como pilas ("Bagoss, sans-serif"): cada familia cuenta por separado, junto con las de
  // respaldo (font_*_fallback) y las autoalojadas que midió la referencia
  const approved = new Set();
  const addFamilies = (v) => String(v).split(',').forEach(p => {
    const n = p.trim().replace(/^['"]|['"]$/g, '').toLowerCase();
    if (n) approved.add(n);
  });
  for (const [k, v] of Object.entries(state.typography)) if (/^font_/.test(k) && typeof v === 'string') addFamilies(v);
  for (const f of Array.isArray(state.typography.self_hosted_fonts) ? state.typography.self_hosted_fonts : []) {
    if (f && f.family) addFamilies(f.family);
  }
  const SYSTEM = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-[\w-]+|-apple-system|blinkmacsystemfont|inherit|initial|georgia|arial|helvetica( neue)?|times( new roman)?|segoe ui|roboto|courier( new)?|consolas|menlo|monaco|sf mono|tahoma|verdana|var\(.*\))$/;
  const used = new Set();
  for (const m of css.matchAll(/font-family\s*:\s*([^;}]+)|--font[\w-]*\s*:\s*([^;}]+)/gi)) {
    for (const part of (m[1] || m[2]).split(',')) {
      const n = part.trim().replace(/^['"]|['"]$/g, '').toLowerCase();
      if (n && !SYSTEM.test(n)) used.add(n);
    }
  }
  for (const m of css.matchAll(/family=([^&:;'")]+)/g)) used.add(decodeURIComponent(m[1].replace(/\+/g, ' ')).toLowerCase());
  const unapproved = [...used].filter(n => !approved.has(n));
  if (approved.size > 0 && unapproved.length > 0) {
    warnings.push(`Fuente(s) que no están en el estado del proyecto (state.typography): ${unapproved.join(', ')}. Solo se usan las fuentes que el usuario eligió.`);
  }

  const icons = String(state.typography.icons || '');
  if (icons && !/(ning|none|emoji|sin )/i.test(icons)) {
    const svgs = pages.reduce((n, p) => n + (p.html.match(/<svg[\s>]/gi) || []).length, 0);
    const imgs = pages.reduce((n, p) => n + (p.html.match(/<img\b[^>]*\.(svg|png|webp)/gi) || []).length, 0);
    if (svgs + imgs === 0 && !/<i\s+class="[^"]*(icon|lucide|fa-)/i.test(pages.map(p => p.html).join(''))) {
      warnings.push(`El sistema de iconos elegido (${icons}) no se usa: el prototipo no contiene ningún <svg> ni icono.`);
    }
  }
}

// ---------------------------------------------------------------------------
// 6. JavaScript
// ---------------------------------------------------------------------------
if (js) {
  if (/requestAnimationFrame/.test(js) && !/visibilitychange|IntersectionObserver|cancelAnimationFrame/.test(js)) {
    warnings.push('Animación continua (requestAnimationFrame) que nunca se pausa: consume CPU/batería con la pestaña oculta o fuera de pantalla (usa visibilitychange o IntersectionObserver).');
  }
  if (/getContext\(\s*['"]2d['"]/.test(js) && !/devicePixelRatio/.test(js)) {
    warnings.push('El canvas 2D no usa devicePixelRatio: se ve borroso en pantallas de alta densidad.');
  }
  if (/['"]Escape['"]/.test(js) && !/\.focus\s*\(/.test(js)) {
    warnings.push('El menú se cierra con Escape pero no hay gestión de foco (.focus()): al abrir/cerrar el foco debe entrar al menú y volver al botón.');
  }
}

// ---------------------------------------------------------------------------
// Reporte
// ---------------------------------------------------------------------------
console.log('========================================');
console.log(`AUDITORÍA DEL PROTOTIPO: ${path.basename(protoDir)}/ (${htmlFiles.length} pantalla(s))`);
console.log('========================================');

if (errors.length === 0 && warnings.length === 0) {
  console.log('✅ ESTADO: 100% PASS — Prototipo sin hallazgos.');
  process.exit(0);
}
if (warnings.length > 0) {
  console.log(`⚠️  ADVERTENCIAS (${warnings.length}):`);
  warnings.forEach(w => console.log(`   - ${w}`));
}
if (errors.length > 0) {
  console.log(`❌ ERRORES CRÍTICOS (${errors.length}):`);
  errors.forEach(e => console.log(`   - ${e}`));
  console.log('\nEl prototipo no cumple con la compuerta de aprobación de la Fase 5.');
  process.exit(1);
}
console.log('\n✅ Aprobado con advertencias menores.');
process.exit(0);
