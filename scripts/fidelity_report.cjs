/**
 * Informe de limitaciones de fidelidad
 * Lista lo que el prototipo NO replica de la referencia y por qué: fuentes sustituidas, animaciones o
 * efectos no transmitidos, el elemento del hero que falta, cobertura de la extracción, páginas sin
 * verificación 1:1 y el resultado de la última comparación visual. Se muestra en la tarjeta del gate 2.
 *
 * Es un análisis estático (sin navegador, corre dentro del tiempo máximo del gate) y es informativo:
 * siempre sale con código 0. Lo que no se puede deducir del disco lo aporta el agente en
 * state.fidelity_notes ([{ topic, reason, substitute }]) y se añade tal cual.
 *
 * Usage: node fidelity_report.cjs [--dir prototype] [--state design-system-state.json]
 * Salida (stdout): JSON { mode, items: [{ kind, title, reason, instead? }], coverage, verify, generated_at }
 *   kind: sustituido | no_replicado | parcial | no_capturado | nota_agente
 */

'use strict';

const fs = require('fs');
const path = require('path');

function flag(name, fallback) {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const protoDir = path.resolve(process.cwd(), flag('--dir', 'prototype'));
const statePath = path.resolve(process.cwd(), flag('--state', 'design-system-state.json'));
const verifyPath = path.resolve(process.cwd(), 'scratch', 'fidelity_verify.json');

const GENERIC_FAMILIES = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-sans-serif', 'ui-serif', 'ui-monospace', 'ui-rounded', 'inherit', 'initial', 'unset']);

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')); } catch (e) { return null; }
}

function str(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max || 400) : '';
}

// 'Bagoss', "ABC Diatype", sans-serif  ->  ['Bagoss', 'ABC Diatype', 'sans-serif']
function parseStack(value) {
  if (typeof value !== 'string') return [];
  return value.split(',').map(f => f.trim().replace(/^['"]|['"]$/g, '').trim()).filter(Boolean);
}

function firstFamily(value) {
  return parseStack(value).find(f => !GENERIC_FAMILIES.has(f.toLowerCase())) || null;
}

function listFiles(dir, re) {
  try { return fs.readdirSync(dir).filter(f => re.test(f)).sort(); } catch (e) { return []; }
}

function readAll(dir, files) {
  return files.map(f => { try { return fs.readFileSync(path.join(dir, f), 'utf8'); } catch (e) { return ''; } }).join('\n');
}

function latestMtime(dir) {
  let latest = 0;
  const walk = (d, depth) => {
    let entries = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) { if (depth < 3) walk(full, depth + 1); continue; }
      try { latest = Math.max(latest, fs.statSync(full).mtimeMs); } catch (e2) { /* se ignora */ }
    }
  };
  walk(dir, 0);
  return latest;
}

/** Familias que el prototipo realmente carga: @font-face, Google Fonts / otros CDN de fuentes y archivos locales. */
function loadedFamilies(css, html) {
  const loaded = new Set();
  const add = (name) => { if (name) loaded.add(String(name).trim().replace(/^['"]|['"]$/g, '').toLowerCase()); };
  for (const m of css.matchAll(/@font-face\s*\{[^}]*?font-family\s*:\s*([^;}]+)/gi)) add(m[1]);
  const text = css + '\n' + html;
  for (const m of text.matchAll(/[?&]family=([^&"')\s]+)/gi)) {
    let name;
    try { name = decodeURIComponent(m[1].replace(/\+/g, ' ')); } catch (e) { name = m[1].replace(/\+/g, ' '); }
    add(name.split(':')[0]);
  }
  for (const m of text.matchAll(/[?&]f\[\]=([^&"')\s]+)/gi)) add(decodeURIComponent(m[1]).split('@')[0].replace(/-/g, ' '));
  return loaded;
}

function substituteFor(family, roleFallback, css, loaded) {
  const fb = firstFamily(roleFallback);
  if (fb && fb.toLowerCase() !== family.toLowerCase()) return fb;
  // Siguiente familia no genérica tras la original en alguna pila del CSS
  for (const m of css.matchAll(/font-family\s*:\s*([^;}]+)|--font[\w-]*\s*:\s*([^;}]+)/gi)) {
    const stack = parseStack(m[1] || m[2]).filter(f => !GENERIC_FAMILIES.has(f.toLowerCase()));
    const i = stack.findIndex(f => f.toLowerCase() === family.toLowerCase());
    if (i !== -1 && stack[i + 1]) return stack[i + 1];
  }
  const any = [...loaded][0];
  return any ? any.replace(/\b\w/g, c => c.toUpperCase()) : null;
}

const items = [];
const push = (kind, title, reason, instead) => {
  const item = { kind, title, reason };
  if (instead) item.instead = instead;
  items.push(item);
};

const state = readJson(statePath);
if (!state) {
  console.log(JSON.stringify({ mode: null, items: [], coverage: { available: false }, verify: null, generated_at: new Date().toISOString(), error: 'estado no legible' }));
  process.exit(0);
}

const vd = state.visual_dna || {};
const blueprint = vd.structural_blueprint || state.structural_blueprint || {};
const decisions = state.decisions || {};
const mode = vd.fidelity_mode
  || (state.brand && state.brand.fidelity_mode)
  || (decisions['1.5.2'] && decisions['1.5.2'].fidelity_mode)
  || null;
const isTotal = mode === 'TOTAL_ARCHITECTURAL_FIDELITY';

const protoExists = fs.existsSync(protoDir);
const htmlFiles = listFiles(protoDir, /\.html?$/i);
const cssFiles = listFiles(protoDir, /\.css$/i);
const jsFiles = listFiles(protoDir, /\.m?js$/i);
const html = readAll(protoDir, htmlFiles);
const css = readAll(protoDir, cssFiles) + '\n' + (html.match(/<style[\s\S]*?<\/style>/gi) || []).join('\n');
const js = readAll(protoDir, jsFiles) + '\n' + (html.match(/<script(?![^>]*\bsrc\b)[\s\S]*?<\/script>/gi) || []).join('\n');
const code = html + '\n' + js;

// ---------------------------------------------------------------------------
// Fuentes
// ---------------------------------------------------------------------------
if (protoExists) {
  const typo = { ...(vd.typography || {}), ...(state.typography || {}) };
  const loaded = loadedFamilies(css, html);
  const selfHosted = Array.isArray(typo.self_hosted_fonts) ? typo.self_hosted_fonts : [];
  const selfHostedByName = new Map(selfHosted.filter(f => f && f.family).map(f => [String(f.family).toLowerCase(), f]));

  const roles = [
    { label: 'titulares', value: typo.font_display || typo.display || typo.computed_h1_font, fallback: typo.font_display_fallback || typo.display_fallback },
    { label: 'interfaz y texto', value: typo.font_ui || typo.ui || typo.computed_body_font, fallback: typo.font_ui_fallback || typo.ui_fallback },
    { label: 'acento', value: typo.font_accent_italic, fallback: null },
    { label: 'monoespaciada', value: typo.font_mono, fallback: null }
  ];
  const seen = new Set();
  const consider = (family, label, fallback) => {
    if (!family) return;
    const key = family.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    if (loaded.has(key)) return;
    const sh = selfHostedByName.get(key);
    const sub = substituteFor(family, fallback, css, loaded);
    const reason = sh
      ? `Es una fuente autoalojada por la referencia${sh.woff2_src ? ` (${str(sh.woff2_src, 120)})` : ''}, propietaria o sin licencia de uso, y no hay archivo disponible para incluirla.`
      : 'No se carga en el prototipo (sin @font-face ni enlace de fuentes), por lo que el navegador usa la siguiente de la pila.';
    push('sustituido', `No se usó la fuente ${family}${label ? ` (${label})` : ''}`, reason, sub || undefined);
  };
  roles.forEach(r => consider(firstFamily(r.value), r.label, r.fallback));
  // Autoalojadas secundarias: solo si el prototipo las nombra en alguna pila sin cargarlas
  selfHosted.forEach(f => {
    const family = f && f.family ? String(f.family) : null;
    if (!family || seen.has(family.toLowerCase())) return;
    const named = new RegExp(`font-family\\s*:[^;}]*['"]?${family.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]?`, 'i').test(css)
      || new RegExp(`--font[\\w-]*\\s*:[^;}]*${family.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(css);
    if (named) consider(family, 'secundaria', null);
  });
}

// ---------------------------------------------------------------------------
// Movimiento, hero y cobertura (solo en fidelidad total: sin referencia que replicar no hay nada que comparar)
// ---------------------------------------------------------------------------
const coverage = { available: false };

if (isTotal && protoExists) {
  const motion = blueprint.motion_dna || {};
  const hero = blueprint.hero || {};
  const sections = Array.isArray(blueprint.section_sequence) ? blueprint.section_sequence : [];

  const hasLenis = /lenis/i.test(code);
  const hasGsap = /gsap/i.test(code);
  const hasCanvas = /<canvas\b|getContext\(\s*['"](?:2d|webgl2?)['"]|three(?:\.min)?\.js|\bTHREE\./i.test(code);
  const hasVideoEl = /<video\b|<iframe\b/i.test(html);
  const used = [hasLenis && 'Lenis (scroll suave)', hasGsap && 'GSAP', /IntersectionObserver/.test(js) && 'IntersectionObserver', /@keyframes|transition\s*:/i.test(css) && 'transiciones CSS'].filter(Boolean);

  if (motion.has_smooth_scroll && !hasLenis) {
    push('no_replicado', 'Scroll suave de la referencia', 'La referencia usa desplazamiento suave por librería y el prototipo no carga ninguna.', 'Scroll nativo del navegador');
  }
  if (motion.has_custom_cursor && !/cursor/i.test(js) && !/\.cursor|custom-cursor|cursor-follow/i.test(css)) {
    push('no_replicado', 'Cursor personalizado de la referencia', 'La referencia reemplaza el cursor y el prototipo no incluye ese comportamiento.', 'Cursor estándar del sistema');
  }

  const pageCanvases = Number(hero.page_canvas_count) || (hero.has_canvas ? 1 : 0);
  if (pageCanvases > 0 && !hasCanvas) {
    push('no_replicado', `Efecto de canvas/WebGL de la referencia (${pageCanvases} ${pageCanvases === 1 ? 'capa' : 'capas'})`,
      'Los efectos de canvas o shaders (grano, partículas, fondos generativos) dependen del código de la referencia y no se pueden copiar desde el DOM; el prototipo no incluye ningún canvas.',
      'Fondos y texturas estáticos con CSS');
  }

  // Medios embebidos del hero: video de terceros (Vimeo/YouTube) que no se puede incluir
  const slots = [].concat(...sections.slice(0, 2).map(s => (s && Array.isArray(s.media_slots)) ? s.media_slots : []));
  const embeds = slots.filter(s => s && (s.is_embedded_iframe || s.is_video));
  if (embeds.length > 0 && !hasVideoEl) {
    const providers = [...new Set(embeds.map(s => s.embed_provider).filter(Boolean))];
    push('sustituido', `Video ${providers.length ? `embebido (${providers.join(', ')})` : 'de la referencia'} del hero`,
      'El video pertenece a un tercero, no hay archivo ni permiso para reutilizarlo; el prototipo no incluye ningún video ni iframe.',
      'Imágenes fijas de ejemplo');
  }
  const runs = Array.isArray(hero.heading_color_runs) ? hero.heading_color_runs : [];
  if (runs.length > 1) {
    const colors = [...new Set(runs.map(r => String(r.color_hex || '').toLowerCase()))].filter(Boolean);
    const painted = colors.filter(c => c && code.toLowerCase().includes(c) || css.toLowerCase().includes(c));
    if (painted.length < colors.length) {
      push('parcial', 'Color por palabra del titular', 'El titular de la referencia combina varios colores y el prototipo no usa todos en el titular.', undefined);
    }
  }

  // Animaciones de entrada: el extractor no las captura (solo scroll suave, cursor y canvas)
  push('parcial', 'Animaciones de entrada y scroll de la referencia',
    'El extractor lee el DOM y los estilos medidos, no la secuencia de las animaciones (reveal, stagger, parallax, transiciones de página); esas animaciones no se transmiten.',
    used.length ? `Lo que usa el prototipo: ${used.join(', ')}` : 'El prototipo no incluye animaciones');

  // Header y footer: lo que da personalidad a la página. Si la extracción no pudo leerlos, no hay nada contra
  // lo que verificar y el prototipo se construyó sin referencia; se dice en lugar de dejarlo pasar.
  const nbp = blueprint.navbar || {};
  const navEmpty = nbp.capture_failed === true || (nbp.capture_failed === undefined && !nbp.height_px
    && !(nbp.nav_links || []).length && !(nbp.link_items || []).length && !(nbp.icon_links || []).length && !nbp.menu_overlay);
  if (navEmpty) {
    push('no_capturado', 'Header de la referencia no capturado',
      'La extracción no pudo leer el header (altura, enlaces, controles y forma vacíos), así que el prototipo no se pudo comparar con él ni se verificó su contenido; revisa ref_header.webp.', undefined);
  }
  const fbp = blueprint.footer || {};
  if (fbp.found === false || fbp.capture_failed === true) {
    push('no_capturado', 'Footer de la referencia no encontrado',
      'La extracción no encontró el footer: no se sabe si la referencia no tiene o si no se pudo leer; revisa ref_footer.webp antes de dar por bueno el footer del prototipo.', undefined);
  }

  // Cobertura de la extracción
  const g = blueprint.global || {};
  if (typeof g.coverage_pct === 'number') {
    coverage.available = true;
    coverage.pct = g.coverage_pct;
    coverage.sections = sections.length;
    coverage.captured_height_px = g.captured_height_px;
    coverage.document_height_px = g.document_height_px;
    if (g.coverage_pct < 70) {
      push('no_capturado', `Solo se capturó el ${g.coverage_pct} % de la página de referencia`,
        `La extracción obtuvo ${sections.length} ${sections.length === 1 ? 'sección' : 'secciones'}; el resto de los bloques no se detectó y no se replicó 1:1.`, undefined);
    } else if (g.coverage_pct < 90) {
      push('parcial', `Se capturó el ${g.coverage_pct} % de la página de referencia`,
        'El resto (huecos entre secciones, bloques no reconocidos o el footer) no está en el blueprint y no se replicó 1:1.', undefined);
    }
  } else {
    push('no_capturado', 'Cobertura de la referencia no disponible',
      'Este proyecto se extrajo antes de que se midiera qué parte de la página se capturó, así que no se puede saber si faltan secciones.', undefined);
  }

  // Secciones del blueprint frente a las construidas en el home
  const indexHtml = (() => { try { return fs.readFileSync(path.join(protoDir, 'index.html'), 'utf8'); } catch (e) { return ''; } })();
  const built = (indexHtml.match(/<section\b/gi) || []).length;
  const expected = sections.filter(s => s && s.index !== undefined).length;
  if (expected > 0 && indexHtml && built + 1 < expected) {
    push('parcial', 'Secciones del home sin construir',
      `El blueprint define ${expected} secciones y index.html tiene ${built} <section>; puede que parte del diseño de la referencia no esté en el prototipo.`, undefined);
  }

  // Páginas secundarias sin blueprint propio
  const secondaryCount = Array.isArray(vd.secondary_pages) ? vd.secondary_pages.length : 0;
  const others = htmlFiles.filter(f => !/^index\.html?$/i.test(f)).filter(f => {
    try { return !/data-section\s*=\s*["']\d+["']/.test(fs.readFileSync(path.join(protoDir, f), 'utf8')); } catch (e) { return true; }
  });
  const unverified = others.slice(secondaryCount);
  if (unverified.length > 0) {
    push('parcial', `${unverified.length === 1 ? 'Página sin' : 'Páginas sin'} verificación 1:1: ${unverified.join(', ')}`,
      'No tienen blueprint propio de la referencia: se construyeron como extensión de la marca y no se comparan contra un original.', undefined);
  }
}

// ---------------------------------------------------------------------------
// Última verificación visual
// ---------------------------------------------------------------------------
let verify = null;
if (isTotal && protoExists) {
  const v = readJson(verifyPath);
  const pct = (n) => (typeof n === 'number' ? `${Math.round(n * 100)} %` : 'sin dato');
  // Formato anterior: solo existía con --visual y su fecha era "at"
  const visualAt = v ? (v.visual_at !== undefined ? v.visual_at : (v.hero !== undefined || v.full_page !== undefined ? v.at : null)) : null;
  const latest = latestMtime(protoDir);
  const runAt = v && v.at ? Date.parse(v.at) : NaN;
  const runStale = Number.isFinite(runAt) && latest > runAt + 1000;
  if (v && visualAt) {
    const at = Date.parse(visualAt);
    const stale = Number.isFinite(at) && latest > at + 1000;
    verify = { at: visualAt, hero: v.hero, full_page: v.full_page, stale };
    const low = (typeof v.hero === 'number' && v.hero < 0.85) || (typeof v.full_page === 'number' && v.full_page < 0.80);
    if (stale) {
      push('parcial', 'La comparación visual está desactualizada',
        `La última comparación con la referencia (${visualAt.slice(0, 10)}: hero ${pct(v.hero)}, página completa ${pct(v.full_page)}) es anterior a los últimos cambios del prototipo.`, undefined);
    } else {
      if (low) {
        push('parcial', 'Similitud visual baja frente a la referencia',
          `Última comparación (${visualAt.slice(0, 10)}): hero ${pct(v.hero)}, página completa ${pct(v.full_page)}. Es una medida de distribución cromática, no de layout.`, undefined);
      }
      (Array.isArray(v.sections) ? v.sections : []).forEach(sec => {
        if (sec && typeof sec.similarity === 'number' && sec.similarity < 0.80) {
          push('parcial', `Sección ${sec.section}: similitud visual ${pct(sec.similarity)}`,
            sec.similarity < 0.60
              ? 'Por debajo del mínimo de la verificación (60 %): la sección no se parece a la referencia.'
              : 'Por debajo del 80 % recomendado: la distribución de color de la sección difiere de la referencia.', undefined);
        }
      });
    }
  } else {
    push('no_capturado', 'Sin comparación visual contra la referencia',
      'No se ejecutó verify_fidelity con --visual, así que no hay medida de similitud del hero, de la página completa ni de cada sección.', undefined);
  }

  // Header y footer según el último verify_fidelity (renuevan aunque no se haya corrido --visual)
  const describeCheck = (label, check) => {
    if (!check || !Array.isArray(check.issues) || check.issues.length === 0) return;
    const messages = check.issues.map(i => i.message).filter(Boolean);
    const critical = check.issues.filter(i => i.severity === 'critical').length;
    push('parcial', `${label}: ${critical ? `${critical} diferencia(s) críticas con la referencia` : 'diferencias con la referencia'}`,
      (runStale ? '(Verificación anterior a los últimos cambios del prototipo.) ' : '') + messages.slice(0, 6).join(' · '), undefined);
  };
  if (v) {
    describeCheck('Header', v.navbar);
    describeCheck('Footer', v.footer);
  }
}

// ---------------------------------------------------------------------------
// Notas del agente (híbrido: lo que no se puede deducir del disco)
// ---------------------------------------------------------------------------
const notes = Array.isArray(state.fidelity_notes) ? state.fidelity_notes
  : (Array.isArray(vd.fidelity_notes) ? vd.fidelity_notes : []);
notes.slice(0, 30).forEach(n => {
  if (!n || typeof n !== 'object') return;
  const topic = str(n.topic, 120);
  const reason = str(n.reason, 500);
  if (!topic && !reason) return;
  push('nota_agente', topic || 'Nota del agente', reason || 'Sin motivo indicado.', str(n.substitute, 300) || undefined);
});

console.log(JSON.stringify({ mode, items, coverage, verify, generated_at: new Date().toISOString() }, null, 2));
process.exit(0);
