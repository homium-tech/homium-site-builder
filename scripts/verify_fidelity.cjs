/**
 * Fidelity Verifier — Mechanical gate for Homium Site Builder
 *
 * Cross-checks generated prototype deliverables against design-system-state.json:
 *   [A] Chromatic allowlist — every hex/rgb/hsl token in prototype files must come
 *       verbatim (or within --tolerance) from state.palette.allowed_hexes.
 *   [B] Structural parity — data-section="N" attributes must match
 *       state.visual_dna.structural_blueprint.section_sequence order.
 *   [C] Visual verification (--visual) — Playwright screenshots of the prototype
 *       compared against reference screenshots via dominant chromatic distribution
 *       and section silhouette banding.
 *   [F] Component signals — mechanical presence checks per data-section: marquee
 *       track count, Blossom carousel slides, FAQ/accordion items, countUp stat
 *       targets, plus whole-prototype footer copy and motion DNA (Lenis/cursor)
 *       script presence.
 *   [G] Hover parity — spot-checks the primary button cluster's :hover state
 *       against component_dna.buttons[].hover measured by the extractor.
 *   [H] Mobile fidelity (--visual, 375x812) — zero horizontal overflow, touch
 *       targets ≥44x44px, and visual similarity of hero/sections against the
 *       extractor's ref_*_mobile.webp screenshots (skipped if absent).
 *
 * Behavior is mode-aware, read from state.visual_dna.fidelity_mode:
 *   TOTAL_ARCHITECTURAL_FIDELITY → A + B required; C required when --visual passed.
 *   INSPIRATION                  → only A (B and C are skipped by design).
 *   SURGICAL                     → B only if replicated_dimensions intersects [1,2,3];
 *                                  C advisory unless dims include {1,2,3} and 5.
 *
 * Usage:
 *   node verify_fidelity.cjs [--state design-system-state.json] [--dir prototype]
 *                            [--visual] [--ref-dir scratch/screenshots] [--tolerance 0]
 *
 * Exit codes: 0 = pass, 1 = critical violations found.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
function argValue(flag) {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] !== undefined && !args[i + 1].startsWith('--') ? args[i + 1] : null;
}
const hasFlag = (flag) => args.includes(flag);

const STATE_PATH = path.resolve(process.cwd(), argValue('--state') || 'design-system-state.json');
const PROTO_DIR  = path.resolve(process.cwd(), argValue('--dir') || 'prototype');
const REF_DIR    = path.resolve(process.cwd(), argValue('--ref-dir') || 'scratch/screenshots');
const TOLERANCE  = Math.max(0, parseInt(argValue('--tolerance') || '0', 10) || 0);
const VISUAL     = hasFlag('--visual');
const _onlySec   = argValue('--only-section');
const ONLY_SECTION = _onlySec ? parseInt(_onlySec, 10) : null;

const report = {
  tool: 'verify_fidelity',
  executed_at: new Date().toISOString(),
  state_file: STATE_PATH,
  prototype_dir: PROTO_DIR,
  mode: null,
  only_section: ONLY_SECTION,
  checks: { colors: null, structure: null, geometry: null, media: null, visual: null, components: null, hover_parity: null, mobile: null, navbar: null, blueprint_completeness: null, cookie_banner: null },
  // Cada entrada: { role: 'content'|'conversion', file, checks: {...} } — mismo shape que `checks`,
  // una por página secundaria con blueprint propio en visual_dna.secondary_pages. Vacío si la
  // referencia no tenía páginas equivalentes o el crawl de Fase 1 no las encontró.
  secondary_pages: [],
  summary: { critical: 0, warnings: 0 },
};

function fail(msg) {
  console.error(`[Verify Error]: ${msg}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Load state & resolve fidelity mode
// ---------------------------------------------------------------------------
if (!fs.existsSync(STATE_PATH)) fail(`Estado no encontrado: ${STATE_PATH}`);
let state;
try {
  state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
} catch (e) {
  fail(`JSON de estado inválido: ${e.message}`);
}

const vd = state.visual_dna || {};
const dims = Array.isArray(vd.replicated_dimensions) ? vd.replicated_dimensions : [];

let mode = vd.fidelity_mode || null;
if (!mode) {
  if (vd.structural_blueprint && (vd.primary_reference || vd.fidelity_mode === 'TOTAL_ARCHITECTURAL_FIDELITY')) mode = 'TOTAL_ARCHITECTURAL_FIDELITY';
  else if (dims.length > 0) mode = 'SURGICAL';
  else mode = 'INSPIRATION';
}
report.mode = mode;

const structureRequired =
  mode === 'TOTAL_ARCHITECTURAL_FIDELITY' ||
  (mode === 'SURGICAL' && dims.some(d => [1, 2, 3].includes(d)));

const visualRequiredStrictly =
  mode === 'TOTAL_ARCHITECTURAL_FIDELITY' ||
  (mode === 'SURGICAL' && [1, 2, 3].every(d => dims.includes(d)) && dims.includes(5));

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------
const clamp255 = (n) => Math.max(0, Math.min(255, Math.round(n)));

function normalizeHexToken(raw) {
  let h = String(raw).trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(h)) h = h.split('').map(c => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) {
    if (/^[0-9a-f]{8}$/i.test(h)) h = h.slice(0, 6); // strip alpha channel for comparison
    else return null;
  }
  return '#' + h.toUpperCase();
}

function hexChannels(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function parseRgbFunc(inner) {
  const parts = inner.split(/[,\s/]+/).filter(Boolean).map(s => s.trim());
  if (parts.length < 3) return null;
  const nums = parts.slice(0, 3).map(p => parseFloat(p.endsWith('%') ? (parseFloat(p) / 100) * 255 : p));
  if (nums.some(n => Number.isNaN(n))) return null;
  return nums.map(clamp255);
}

function hslToRgb(hDeg, sPct, lPct) {
  const s = Math.max(0, Math.min(100, sPct)) / 100;
  const l = Math.max(0, Math.min(100, lPct)) / 100;
  const h = ((hDeg % 360) + 360) % 360 / 360;
  const k = (n) => (n + h * 12) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(Math.min(k(n) - 3, 9 - k(n)), 1));
  return [clamp255(f(0) * 255), clamp255(f(8) * 255), clamp255(f(4) * 255)];
}

function parseHslFunc(inner) {
  const parts = inner.split(/[,\s/]+/).filter(Boolean).map(s => s.trim());
  if (parts.length < 3) return null;
  const h = parseFloat(parts[0]);
  const s = parseFloat(parts[1]);
  const l = parseFloat(parts[2]);
  if ([h, s, l].some(n => Number.isNaN(n))) return null;
  return hslToRgb(h, s, l);
}

function channelsToHex(ch) {
  return '#' + ch.map(c => c.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function withinTolerance(hexA, hexB) {
  if (TOLERANCE === 0) return hexA === hexB;
  const a = hexChannels(hexA), b = hexChannels(hexB);
  return a.every((v, i) => Math.abs(v - b[i]) <= TOLERANCE);
}

// ---------------------------------------------------------------------------
// [A] Build allowlist from state
// ---------------------------------------------------------------------------
const allowed = new Map(); // normalizedHex -> origin label
function allow(rawHex, origin) {
  const n = normalizeHexToken(String(rawHex));
  if (n && !allowed.has(n)) allowed.set(n, origin);
}

const pal = state.palette || {};
if (Array.isArray(pal.allowed_hexes)) {
  pal.allowed_hexes.forEach((entry, i) => {
    if (typeof entry === 'string') allow(entry, `allowed_hexes[${i}]`);
    else if (entry && entry.hex) allow(entry.hex, entry.origin || `allowed_hexes[${i}]`);
  });
}
['primary_hex', 'secondary_hex', 'accent_hex', 'bg_base', 'surface_card', 'text_primary'].forEach(k => {
  if (pal[k]) allow(pal[k], `palette.${k}`);
});
const cbp = vd.structural_blueprint || {};
if (cbp.card_morphology) {
  const raw = cbp.card_morphology.bg_hex || cbp.card_morphology.bg_color;
  if (raw) {
    const n = normalizeHexToken(String(raw));
    const ch = !n ? parseRgbFunc(String(raw).replace(/^rgba?\(|\)$/gi, '')) : null;
    const hex = n || (ch ? channelsToHex(ch) : null);
    if (hex) allow(hex, 'blueprint.card_morphology.bg');
  }
}

if (allowed.size === 0) {
  console.error('[Verify Warning]: El estado no define palette.allowed_hexes ni tokens de paleta; el chequeo cromático se ejecuta en modo informativo (0 permitidos).');
}

// ---------------------------------------------------------------------------
// [A] Scan prototype files for color tokens
// ---------------------------------------------------------------------------
const HEX_RE   = /#([0-9a-fA-F]{3,8})\b/g;
const RGB_RE   = /rgba?\(([^()]*)\)/gi;
const HSL_RE   = /hsla?\(([^()]*)\)/gi;

function scanFileForColors(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const findings = [];
  lines.forEach((line, li) => {
    let m;
    HEX_RE.lastIndex = 0;
    while ((m = HEX_RE.exec(line)) !== null) {
      const norm = normalizeHexToken(m[1]);
      if (norm) findings.push({ line: li + 1, raw: m[0], hex: norm });
    }
    RGB_RE.lastIndex = 0;
    while ((m = RGB_RE.exec(line)) !== null) {
      const ch = parseRgbFunc(m[1]);
      if (ch) findings.push({ line: li + 1, raw: m[0], hex: channelsToHex(ch) });
    }
    HSL_RE.lastIndex = 0;
    while ((m = HSL_RE.exec(line)) !== null) {
      const ch = parseHslFunc(m[1]);
      if (ch) findings.push({ line: li + 1, raw: m[0], hex: channelsToHex(ch) });
    }
  });
  return findings;
}

function runColorCheck() {
  const exts = ['.html', '.css', '.js'];
  let files = [];
  (function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      if (name === 'node_modules' || name.startsWith('.')) continue;
      const full = path.join(dir, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) walk(full);
      else if (exts.includes(path.extname(name).toLowerCase())) files.push(full);
    }
  })(PROTO_DIR);

  const violations = [];
  const totalTokens = { count: 0 };
  for (const file of files) {
    const rel = path.relative(PROTO_DIR, file);
    for (const f of scanFileForColors(file)) {
      totalTokens.count++;
      const ok = [...allowed.keys()].some(a => withinTolerance(f.hex, a));
      if (!ok) violations.push({ file: rel, line: f.line, token: f.raw, resolved_hex: f.hex });
    }
  }

  // Deduplicate identical violations (same file+hex)
  const seen = new Set();
  const uniqueViolations = violations.filter(v => {
    const key = `${v.file}|${v.resolved_hex}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    check: 'chromatic_allowlist',
    status: uniqueViolations.length === 0 ? 'PASS' : 'FAIL',
    allowed_count: allowed.size,
    scanned_files: files.length,
    color_tokens_found: totalTokens.count,
    violations: uniqueViolations.slice(0, 50),
    violation_count: uniqueViolations.length,
  };
}

// ---------------------------------------------------------------------------
// [B] Structural parity via data-section attributes
// ---------------------------------------------------------------------------
function runStructureCheck(htmlFile, blueprint) {
  if (!structureRequired) {
    return { check: 'structural_parity', status: 'SKIPPED', reason: `modo ${mode} no exige paridad estructural` };
  }
  const seqAvailable = !!(blueprint && Array.isArray(blueprint.section_sequence) && blueprint.section_sequence.length > 0);
  if (!seqAvailable) {
    return { check: 'structural_parity', status: 'WARN', reason: `sin structural_blueprint.section_sequence para ${htmlFile}` };
  }

  const filePath = path.join(PROTO_DIR, htmlFile);
  if (!fs.existsSync(filePath)) {
    return { check: 'structural_parity', status: 'FAIL', reason: `prototype/${htmlFile} no existe` };
  }

  const html = fs.readFileSync(filePath, 'utf8');
  const found = [];
  const re = /data-section\s*=\s*["'](\d+)["']/g;
  let m;
  while ((m = re.exec(html)) !== null) found.push(parseInt(m[1], 10));

  const expected = blueprint.section_sequence.map(s => s.index);

  const missing  = expected.filter(i => !found.includes(i));
  const extra    = found.filter(i => !expected.includes(i));
  const inOrder  = found.filter(i => expected.includes(i));
  const ordered  = inOrder.every((v, i, arr) => i === 0 || arr[i - 1] < v);

  const issues = [];
  if (missing.length) issues.push(`secciones faltantes en ${htmlFile}: [${missing.join(', ')}]`);
  if (extra.length)   issues.push(`data-section fuera del blueprint: [${extra.join(', ')}]`);
  if (!ordered && inOrder.length > 1) issues.push('orden alterado respecto a section_sequence');

  return {
    check: 'structural_parity',
    status: issues.length === 0 ? 'PASS' : 'FAIL',
    expected_sections: expected,
    found_data_sections: found,
    issues,
  };
}

// ---------------------------------------------------------------------------
// [C] Visual verification (Playwright)
// ---------------------------------------------------------------------------
function requireChromium() {
  try {
    return require('@playwright/test').chromium;
  } catch {
    try {
      return require('playwright').chromium;
    } catch {
      return null;
    }
  }
}

async function analyzeImage(pageContext, filePath, allowKeys) {
  const b64 = fs.readFileSync(filePath).toString('base64');
  const ext = path.extname(filePath).slice(1).toLowerCase();
  return pageContext.evaluate(async ({ dataUrl, allowKeys }) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataUrl; });
    const W = 200;
    const H = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * W));
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, W, H);
    const data = ctx.getImageData(0, 0, W, H).data;

    const dist = {};
    let other = 0;
    const allowedRGB = allowKeys.map(h => {
      const n = parseInt(h.slice(1), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    });
    const rowLum = [];
    for (let y = 0; y < H; y++) {
      let lumSum = 0;
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        lumSum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
        let best = -1, bestD = Infinity;
        for (let a = 0; a < allowedRGB.length; a++) {
          const ar = allowedRGB[a][0] - r, ag = allowedRGB[a][1] - g, ab = allowedRGB[a][2] - b;
          const d = ar * ar + ag * ag + ab * ab;
          if (d < bestD) { bestD = d; best = a; }
        }
        if (bestD <= 80 * 80) {
          const key = allowKeys[best];
          dist[key] = (dist[key] || 0) + 1;
        } else {
          other++;
        }
      }
      rowLum.push(lumSum / W);
    }

    const total = W * H;
    for (const k of Object.keys(dist)) dist[k] = +(dist[k] / total * 100).toFixed(2);
    dist['__other__'] = +(other / total * 100).toFixed(2);

    // Silhouette: count significant luminance transitions between averaged rows
    let bands = 1;
    for (let y = 1; y < rowLum.length; y++) {
      if (Math.abs(rowLum[y] - rowLum[y - 1]) > 18) bands++;
    }
    return { distribution: dist, silhouette_bands: bands, width_px: img.naturalWidth, height_px: img.naturalHeight };
  }, { dataUrl: `data:image/${ext};base64,${b64}`, allowKeys });
}

function distributionSimilarity(d1, d2) {
  const keys = new Set([...Object.keys(d1), ...Object.keys(d2)]);
  let tv = 0;
  keys.forEach(k => { tv += Math.abs((d1[k] || 0) - (d2[k] || 0)); });
  return +(1 - (tv / 200)).toFixed(4); // total variation distance → similarity 0..1
}

async function runVisualAndSectionCheck(htmlFile, blueprint, refPrefix, protoPrefix) {
  const chromium = requireChromium();
  if (!chromium) {
    return { chromium_missing: true };
  }
  const indexPath = path.join(PROTO_DIR, htmlFile);
  if (!fs.existsSync(indexPath)) {
    fail(`prototype/${htmlFile} no existe`);
  }

  fs.mkdirSync(REF_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto('file:///' + indexPath.replace(/\\/g, '/'), { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    await page.evaluate(() => document.fonts ? document.fonts.ready : null).catch(() => {});
    await page.waitForTimeout(1200);

    // --- Measurement: geometry & media per data-section ---
    const measured = await page.evaluate(() => {
      const cs = (el, p) => getComputedStyle(el).getPropertyValue(p).trim();
      const px = (v) => { const n = v ? parseFloat(v) : NaN; return Number.isNaN(n) ? null : Math.round(n); };
      const buttonLike = (el) => {
        const st = getComputedStyle(el);
        const hasBg = st.backgroundColor !== 'rgba(0, 0, 0, 0)' && st.backgroundColor !== 'transparent';
        const hasBorder = parseFloat(st.borderTopWidth) > 0;
        const hasPad = parseFloat(st.paddingTop) >= 8;
        return hasBg || hasBorder || hasPad;
      };
      // Cascade: section → direct child → grandchild (mirrors extractor fix for inner container grids)
      const FGRID = ['grid', 'flex', 'inline-grid', 'inline-flex'];
      const findLayoutEl = (sec) => {
        if (FGRID.includes(cs(sec, 'display'))) return sec;
        const lvl1 = [...sec.children].find(el => FGRID.includes(cs(el, 'display')));
        if (lvl1) return lvl1;
        for (const child of sec.children) {
          const lvl2 = [...child.children].find(el => FGRID.includes(cs(el, 'display')));
          if (lvl2) return lvl2;
        }
        return sec;
      };
      const parseRatios = (raw) => {
        if (!raw || raw === 'none') return null;
        const parts = raw.trim().split(/\s+/).filter(Boolean);
        if (parts.length < 2) return null;
        const nums = parts.map(parseFloat);
        if (!nums.every(n => !isNaN(n) && n > 0)) return null;
        const t = nums.reduce((a, b) => a + b, 0);
        return nums.map(n => +(n / t * 100).toFixed(1));
      };
      const normalizeAlign = (v) => (!v || v === 'start') ? 'left' : v === 'end' ? 'right' : v;
      const out = [];
      document.querySelectorAll('[data-section]').forEach(sec => {
        const i = parseInt(sec.getAttribute('data-section'), 10);
        const layoutEl = findLayoutEl(sec);
        const ratios = parseRatios(cs(layoutEl, 'grid-template-columns'));
        const h = sec.querySelector('h1,h2,h3');
        const cards = [...sec.querySelectorAll('[class*="card"],article,[class*="tile"],[class*="feature"],[class*="item"]')].slice(0, 3).map(c => px(cs(c, 'border-radius')));
        const btns = [...sec.querySelectorAll('a[href],button')].filter(buttonLike).slice(0, 6)
          .map(b => ({ r: px(cs(b, 'border-radius')) ?? 0, t: b.textContent.trim().replace(/\s+/g, ' ').substring(0, 30) }));
        const imgs = [...sec.querySelectorAll('img, picture > img, video')]
          .map(el => {
            const r = el.getBoundingClientRect();
            const ownRadius = px(cs(el, 'border-radius'));
            const wrapperEl = el.parentElement;
            const wrapperRadius = wrapperEl && cs(wrapperEl, 'overflow') === 'hidden' ? px(cs(wrapperEl, 'border-radius')) : null;
            const radius = (ownRadius && ownRadius > 0) ? ownRadius : (wrapperRadius || 0);
            return { src: (el.currentSrc || el.getAttribute('src') || ''), w: Math.round(r.width), h: Math.round(r.height), radius };
          })
          .filter(o => o.w >= 60 && o.h >= 60);
        const secRect = sec.getBoundingClientRect();
        out.push({
          index: i,
          grid_ratios: ratios,
          heading_align: h ? normalizeAlign(cs(h, 'text-align')) : null,
          card_radii: cards,
          button_radii: btns,
          images: imgs,
          section_height_px:  Math.round(secRect.height),
          padding_top_px:     px(cs(sec, 'padding-top')),
          padding_bottom_px:  px(cs(sec, 'padding-bottom')),
        });
      });
      return out;
    });

    // --- [F] Component signal checks: marquee/slider/faq/stats presence per section ---
    const seq = (blueprint && blueprint.section_sequence) || [];
    const bpForSignals = seq.map(s => ({
      index: s.index, has_marquee: s.has_marquee, marquee_rows: s.marquee_rows,
      has_slider: s.has_slider, has_faq: s.has_faq, faq_items_count: s.faq_items_count,
      is_stats_row: s.is_stats_row,
    }));
    const signalIssues = await page.evaluate((blueprints) => {
      const out = [];
      blueprints.forEach(bp => {
        const sec = document.querySelector(`[data-section="${bp.index}"]`);
        if (!sec) return;
        if (bp.has_marquee) {
          const tracks = [...sec.querySelectorAll('[class*="marquee"],[class*="ticker"],[class*="track"],[class*="scroller"]')]
            .filter(t => getComputedStyle(t).animationName !== 'none');
          const expected = bp.marquee_rows || 1;
          if (tracks.length < expected) {
            out.push({ severity: 'critical', section: bp.index, message: `marquee: ${tracks.length} pista(s) animada(s) detectada(s), blueprint exige ${expected}` });
          }
        }
        if (bp.has_slider) {
          const slides = sec.querySelectorAll('[data-blossom-slide]');
          if (slides.length === 0) {
            out.push({ severity: 'critical', section: bp.index, message: 'has_slider:true pero no hay [data-blossom-slide] en la sección' });
          }
        }
        if (bp.has_faq) {
          const items = sec.querySelectorAll('details, .faq-item, .faq-trigger, [class*="accordion"]');
          if (items.length === 0) {
            out.push({ severity: 'critical', section: bp.index, message: 'has_faq:true pero no hay <details>/.faq-item en la sección' });
          } else if (bp.faq_items_count && items.length < bp.faq_items_count) {
            out.push({ severity: 'warning', section: bp.index, message: `faq: ${items.length} ítem(s) renderizado(s), blueprint reporta ${bp.faq_items_count}` });
          }
        }
        if (bp.is_stats_row) {
          const stats = sec.querySelectorAll('[data-target]');
          if (stats.length === 0) {
            out.push({ severity: 'critical', section: bp.index, message: 'is_stats_row:true pero no hay [data-target] (countUp) en la sección' });
          }
        }
      });
      return out;
    }, bpForSignals);

    // --- [F] Footer + Motion DNA presence (whole-prototype; skipped during --only-section runs) ---
    let globalSignalIssues = [];
    let hoverParity = { check: 'hover_parity', status: 'SKIPPED', reason: 'omitido en --only-section' };
    if (!ONLY_SECTION) {
      const footerBp = blueprint && blueprint.footer;
      const motionBp = blueprint && blueprint.motion_dna;
      globalSignalIssues = await page.evaluate(({ footerBp, motionBp }) => {
        const out = [];
        if (footerBp && footerBp.found !== false) {
          const el = document.querySelector('footer');
          if (!el) {
            out.push({ severity: 'critical', section: 'footer', message: 'no existe <footer> en el prototipo pese a que el blueprint lo define' });
          } else if (footerBp.copyright_text) {
            const txt = el.textContent.replace(/\s+/g, ' ').trim();
            const needle = footerBp.copyright_text.replace(/\s+/g, ' ').trim().slice(0, 20);
            if (needle && !txt.includes(needle)) {
              out.push({ severity: 'warning', section: 'footer', message: 'footer.copyright_text del blueprint no aparece verbatim en el <footer> del prototipo' });
            }
          }
        }
        if (motionBp && motionBp.has_smooth_scroll) {
          const hasLenis = [...document.scripts].some(s => /lenis/i.test(s.src)) || typeof window.Lenis !== 'undefined';
          if (!hasLenis) out.push({ severity: 'warning', section: 'motion', message: 'motion_dna.has_smooth_scroll:true pero no se detecta Lenis cargado' });
        }
        if (motionBp && motionBp.has_custom_cursor) {
          const el = [...document.querySelectorAll('body *')].find(e => {
            const cls = typeof e.className === 'string' ? e.className : '';
            return /cursor/i.test((e.id || '') + cls);
          });
          if (!el) out.push({ severity: 'warning', section: 'motion', message: 'motion_dna.has_custom_cursor:true pero no se detecta elemento de cursor custom' });
        }
        return out;
      }, { footerBp, motionBp });

      // --- [G] Hover parity — spot-check the primary button cluster against component_dna.buttons[].hover ---
      hoverParity = await runHoverParityCheck(page, (blueprint && blueprint.component_dna) || (vd.structural_blueprint && vd.structural_blueprint.component_dna));
    }

    const allSignalIssues = [...signalIssues, ...globalSignalIssues];
    const signalCriticals = allSignalIssues.filter(i => i.severity === 'critical').length;
    const componentsCheck = {
      check: 'component_signals',
      status: signalCriticals ? 'FAIL' : (allSignalIssues.length ? 'WARN' : 'PASS'),
      issues: allSignalIssues.slice(0, 50),
      issue_count: allSignalIssues.length,
    };

    // --- Global shots (skipped in --only-section mode for speed) ---
    const allowKeys = [...allowed.keys()];
    let globalVisual = null;
    if (!ONLY_SECTION && VISUAL) {
      const protoHero = path.join(REF_DIR, `${protoPrefix}_hero.webp`);
      const protoFull = path.join(REF_DIR, `${protoPrefix}_full.webp`);
      await page.screenshot({ path: protoHero, type: 'webp', quality: 85 });
      await page.screenshot({ path: protoFull, type: 'webp', quality: 80, fullPage: true });

      const analysisPage = await context.newPage();
      const protoHeroAn = await analyzeImage(analysisPage, protoHero, allowKeys);
      const protoFullAn = await analyzeImage(analysisPage, protoFull, allowKeys);

      const refHeroPath = path.join(REF_DIR, `${refPrefix}_hero.webp`);
      const refFullPath = path.join(REF_DIR, `${refPrefix}_full.webp`);

      let heroSimilarity = null, fullSimilarity = null, refBands = null;
      if (fs.existsSync(refHeroPath)) {
        const refHeroAn = await analyzeImage(analysisPage, refHeroPath, allowKeys);
        heroSimilarity = distributionSimilarity(protoHeroAn.distribution, refHeroAn.distribution);
        refBands = refHeroAn.silhouette_bands;
      }
      if (fs.existsSync(refFullPath)) {
        const refFullAn = await analyzeImage(analysisPage, refFullPath, allowKeys);
        fullSimilarity = distributionSimilarity(protoFullAn.distribution, refFullAn.distribution);
        if (refBands === null) refBands = refFullAn.silhouette_bands;
      }

      globalVisual = {
        screenshots: { proto_hero: protoHero, proto_full: protoFull },
        chromatic_distribution: { proto_hero: protoHeroAn.distribution, proto_full: protoFullAn.distribution },
        similarity_vs_reference: { hero: heroSimilarity, full_page: fullSimilarity, method: 'dominant_chromatic_distribution_tv' },
        silhouette: { reference_bands: refBands, prototype_hero_bands: protoHeroAn.silhouette_bands, prototype_full_bands: protoFullAn.silhouette_bands },
      };
    }

    // --- Per-section pairing ---
    let section_scores = [];
    if (VISUAL || ONLY_SECTION) {
      const analysisPage2 = await context.newPage();
      const targets = ONLY_SECTION ? [ONLY_SECTION] : measured.map(m => m.index);
      for (const i of targets) {
        const loc = page.locator(`[data-section="${i}"]`).first();
        if ((await loc.count()) === 0) { section_scores.push({ section: i, status: 'MISSING' }); continue; }
        try {
          await loc.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
          await page.waitForTimeout(250);
          const protoPath = path.join(REF_DIR, `${protoPrefix}_section_${i}.webp`);
          await loc.screenshot({ path: protoPath, type: 'webp', quality: 80 });
          const refPath = path.join(REF_DIR, `${refPrefix}_section_${i}.webp`);
          let sim = null, aspectDelta = null;
          if (fs.existsSync(refPath)) {
            const pa = await analyzeImage(analysisPage2, protoPath, allowKeys);
            const ra = await analyzeImage(analysisPage2, refPath, allowKeys);
            sim = distributionSimilarity(pa.distribution, ra.distribution);
            const prRatio = pa.height_px > 0 ? pa.width_px / pa.height_px : 1;
            const rrRatio = ra.height_px > 0 ? ra.width_px / ra.height_px : 1;
            aspectDelta = +(Math.abs(prRatio - rrRatio) / rrRatio * 100).toFixed(1);
          }
          section_scores.push({ section: i, similarity: sim, aspect_delta_pct: aspectDelta, proto_shot: protoPath });
        } catch (e) {
          section_scores.push({ section: i, status: 'ERROR', message: e.message.substring(0, 80) });
        }
      }
      section_scores.sort((a, b) => (a.similarity ?? 9) - (b.similarity ?? 9));
    }

    // --- [H] Mobile fidelity (375px): overflow, touch targets, visual vs mobile reference shots ---
    let mobileCheck = { check: 'mobile_fidelity', status: 'NOT_REQUESTED' };
    if (VISUAL && !ONLY_SECTION) {
      try {
        const mobileContext = await browser.newContext({ viewport: { width: 375, height: 812 } });
        const mobilePage = await mobileContext.newPage();
        await mobilePage.goto('file:///' + indexPath.replace(/\\/g, '/'), { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
        await mobilePage.waitForTimeout(1000);

        const overflow = await mobilePage.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        const overflowIssues = [];
        if (overflow.scrollWidth > overflow.clientWidth + 2) {
          overflowIssues.push({ severity: 'critical', message: `scroll horizontal detectado: scrollWidth ${overflow.scrollWidth}px > viewport ${overflow.clientWidth}px` });
        }

        const touchIssues = await mobilePage.evaluate(() => {
          const out = [];
          document.querySelectorAll('a[href], button, input, select, textarea').forEach(el => {
            const r = el.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) return; // hidden / off-canvas (e.g. behind a closed drawer)
            const style = getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') return;
            if (r.width < 44 || r.height < 44) {
              out.push({ tag: el.tagName.toLowerCase(), text: (el.textContent || '').trim().slice(0, 30), width: Math.round(r.width), height: Math.round(r.height) });
            }
          });
          return out;
        });
        const touchTargetIssues = touchIssues.slice(0, 20).map(t => ({
          severity: 'warning',
          message: `área táctil ${t.width}×${t.height}px por debajo de 48×48 (mínimo aceptado 44×44): <${t.tag}> "${t.text}"`,
        }));

        // Visual comparison against mobile reference screenshots (skipped if the extractor never took them)
        const analysisPageM = await mobileContext.newPage();
        let heroSimMobile = null;
        const refHeroMobilePath = path.join(REF_DIR, `${refPrefix}_hero_mobile.webp`);
        if (fs.existsSync(refHeroMobilePath)) {
          const protoHeroMobilePath = path.join(REF_DIR, `${protoPrefix}_hero_mobile.webp`);
          await mobilePage.evaluate(() => window.scrollTo(0, 0));
          await mobilePage.screenshot({ path: protoHeroMobilePath, type: 'webp', quality: 85 });
          const pa = await analyzeImage(analysisPageM, protoHeroMobilePath, allowKeys);
          const ra = await analyzeImage(analysisPageM, refHeroMobilePath, allowKeys);
          heroSimMobile = distributionSimilarity(pa.distribution, ra.distribution);
        }

        const sectionScoresMobile = [];
        for (const m of measured) {
          const i = m.index;
          const refPathM = path.join(REF_DIR, `${refPrefix}_section_${i}_mobile.webp`);
          if (!fs.existsSync(refPathM)) continue;
          const locM = mobilePage.locator(`[data-section="${i}"]`).first();
          if ((await locM.count()) === 0) { sectionScoresMobile.push({ section: i, status: 'MISSING' }); continue; }
          try {
            await locM.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
            await mobilePage.waitForTimeout(200);
            const protoPathM = path.join(REF_DIR, `${protoPrefix}_section_${i}_mobile.webp`);
            await locM.screenshot({ path: protoPathM, type: 'webp', quality: 80 });
            const pa = await analyzeImage(analysisPageM, protoPathM, allowKeys);
            const ra = await analyzeImage(analysisPageM, refPathM, allowKeys);
            sectionScoresMobile.push({ section: i, similarity: distributionSimilarity(pa.distribution, ra.distribution) });
          } catch (e) {
            sectionScoresMobile.push({ section: i, status: 'ERROR', message: e.message.substring(0, 80) });
          }
        }
        sectionScoresMobile.sort((a, b) => (a.similarity ?? 9) - (b.similarity ?? 9));

        await mobileContext.close();

        const allMobileIssues = [...overflowIssues, ...touchTargetIssues];
        const mobileCriticals = allMobileIssues.filter(i => i.severity === 'critical').length;
        mobileCheck = {
          check: 'mobile_fidelity',
          status: mobileCriticals ? 'FAIL' : (allMobileIssues.length ? 'WARN' : 'PASS'),
          viewport: '375x812',
          overflow: { scroll_width_px: overflow.scrollWidth, viewport_width_px: overflow.clientWidth, ok: overflowIssues.length === 0 },
          touch_target_issue_count: touchIssues.length,
          hero_similarity_mobile: heroSimMobile,
          section_scores_mobile: sectionScoresMobile,
          issues: allMobileIssues.slice(0, 30),
        };
      } catch (e) {
        mobileCheck = { check: 'mobile_fidelity', status: 'WARN', reason: `error verificando mobile: ${e.message}` };
      }
    }

    return {
      measured,
      components: componentsCheck,
      hoverParity,
      mobile: mobileCheck,
      visual: { check: 'visual_verification', status: (globalVisual || section_scores.length) ? 'MEASURED' : 'NOT_REQUESTED', enforcement: visualRequiredStrictly ? 'REQUIRED' : 'ADVISORY', ...(globalVisual || {}), section_scores },
    };
  } finally {
    await browser.close();
  }
}

// ---------------------------------------------------------------------------
// [G] Hover parity — spot-check the primary button cluster's :hover state
// ---------------------------------------------------------------------------
async function runHoverParityCheck(page, compDna) {
  const buttons = (compDna && compDna.buttons) || [];
  const primary = buttons.find(b => b.hover && b.hover.has_visual_change) || buttons.find(b => b.hover) || null;
  if (!primary || primary.border_radius_px == null || !primary.hover) {
    return { check: 'hover_parity', status: 'SKIPPED', reason: 'sin component_dna.buttons con hover medido' };
  }
  try {
    const candidates = page.locator('a[href], button');
    const count = await candidates.count();
    let target = null;
    for (let i = 0; i < Math.min(count, 60); i++) {
      const el = candidates.nth(i);
      const r = await el.evaluate(node => {
        const n = parseFloat(getComputedStyle(node).borderRadius);
        return Number.isNaN(n) ? null : Math.round(n);
      }).catch(() => null);
      if (r !== null && Math.abs(r - primary.border_radius_px) <= 2) { target = el; break; }
    }
    if (!target) {
      return { check: 'hover_parity', status: 'WARN', reason: 'no se encontró un botón con el radio del blueprint para probar hover' };
    }

    const before = await target.evaluate(node => {
      const s = getComputedStyle(node);
      return { bg: s.backgroundColor, color: s.color };
    });
    await target.hover({ force: true, timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(250);
    const after = await target.evaluate(node => {
      const s = getComputedStyle(node);
      return { bg: s.backgroundColor, color: s.color };
    });
    await page.mouse.move(0, 0).catch(() => {});

    const changed = before.bg !== after.bg || before.color !== after.color;
    if (primary.hover.has_visual_change && !changed) {
      return { check: 'hover_parity', status: 'WARN', reason: 'el blueprint define un hover con cambio visual (bg/color) pero el botón probado no cambió al pasar el cursor' };
    }
    return { check: 'hover_parity', status: 'PASS' };
  } catch (e) {
    return { check: 'hover_parity', status: 'WARN', reason: `error probando hover: ${String(e.message || e).substring(0, 80)}` };
  }
}

// ---------------------------------------------------------------------------
// [D] Geometry assertions vs structural_blueprint (+ component_dna)
// ---------------------------------------------------------------------------
function compareGeometry(measured, blueprint) {
  const seq = (blueprint && blueprint.section_sequence) || [];
  const compDna = (blueprint && blueprint.component_dna) || (vd.structural_blueprint && vd.structural_blueprint.component_dna) || {};
  const issues = [];
  measured.forEach(m => {
    const bp = seq.find(s => s.index === m.index);
    if (!bp) { issues.push({ severity: 'critical', section: m.index, message: 'data-section sin correspondencia en el blueprint' }); return; }

    if (bp.columns_ratios_pct && m.grid_ratios) {
      if (bp.columns_ratios_pct.length !== m.grid_ratios.length) {
        issues.push({ severity: 'critical', section: m.index, message: `columnas de grilla ${m.grid_ratios.length} ≠ blueprint ${bp.columns_ratios_pct.length}` });
      } else {
        bp.columns_ratios_pct.forEach((p, k) => {
          if (Math.abs(p - m.grid_ratios[k]) > 5) issues.push({ severity: 'critical', section: m.index, message: `ratio columna ${k + 1}: ${m.grid_ratios[k]}% ≠ ${p}%±5` });
        });
      }
    }

    const bpRadius = (bp.cards_detail && bp.cards_detail[0] && bp.cards_detail[0].border_radius_px != null)
      ? bp.cards_detail[0].border_radius_px
      : (bp.card_border_radius_px != null ? bp.card_border_radius_px : null);
    if (bpRadius != null && m.card_radii.length) {
      m.card_radii.forEach((r, k) => {
        if (r != null && Math.abs(r - bpRadius) > 2) issues.push({ severity: 'critical', section: m.index, message: `radio card ${k + 1}: ${r}px ≠ ${bpRadius}px±2` });
      });
    }

    const allowedR = (compDna.buttons || []).map(b => b.border_radius_px).filter(v => v !== null && v !== undefined);
    if (allowedR.length) {
      m.button_radii.forEach(b => {
        if (!allowedR.some(a => Math.abs(a - b.r) <= 2)) {
          issues.push({ severity: 'critical', section: m.index, message: `botón "${b.t}" radio ${b.r}px fuera de component_dna [${allowedR.join(', ')}]±2` });
        }
      });
    }

    if (bp.heading && bp.heading.text_align && m.heading_align) {
      const normBp = (!bp.heading.text_align || bp.heading.text_align === 'start') ? 'left' : bp.heading.text_align === 'end' ? 'right' : bp.heading.text_align;
      const normM  = (!m.heading_align || m.heading_align === 'start') ? 'left' : m.heading_align === 'end' ? 'right' : m.heading_align;
      if (normBp !== normM) {
        issues.push({ severity: 'warning', section: m.index, message: `alineación heading "${m.heading_align}" ≠ blueprint "${bp.heading.text_align}"` });
      }
    }

    // --- Spacing / height check ---
    // Un prototipo con padding inventado produce secciones 2-3× más altas que la referencia.
    // Se compara la altura renderizada del prototipo contra min_height_px del blueprint,
    // con tolerancia del 40% o 150px (lo que sea mayor) para absorber variaciones tipográficas.
    if (bp.min_height_px && m.section_height_px != null) {
      const refH = bp.min_height_px;
      const protoH = m.section_height_px;
      const overflowPct = (protoH - refH) / refH * 100;
      const overflowAbs = protoH - refH;
      if (overflowAbs > 150 && overflowPct > 40) {
        issues.push({
          severity: 'critical',
          section: m.index,
          message: `sección demasiado alta: prototipo ${protoH}px vs referencia ${refH}px (+${Math.round(overflowPct)}%) — espaciado inventado o min-height excesivo`,
        });
      }
    }

    // Padding bottom check: si el blueprint capturó padding_bottom_px y el prototipo
    // usa un valor >2× mayor, es una señal directa de espacio en blanco excesivo.
    if (bp.padding_bottom_px != null && m.padding_bottom_px != null) {
      const bpPb = bp.padding_bottom_px;
      const prPb = m.padding_bottom_px;
      if (bpPb > 0 && prPb > bpPb * 2 && prPb - bpPb > 40) {
        issues.push({
          severity: 'critical',
          section: m.index,
          message: `padding-bottom excesivo: prototipo ${prPb}px vs referencia ${bpPb}px — usar padding_bottom_px del blueprint`,
        });
      }
    }
  });

  const criticals = issues.filter(i => i.severity === 'critical').length;
  return {
    check: 'geometry_assertions',
    status: criticals ? 'FAIL' : (issues.length ? 'WARN' : 'PASS'),
    tolerance: { radius_px: 2, ratio_pct: 5 },
    issues: issues.slice(0, 50),
    issue_count: issues.length,
  };
}

// ---------------------------------------------------------------------------
// [E] Media slots populated from assets/
// ---------------------------------------------------------------------------
function compareMedia(measured, blueprint) {
  const seq = (blueprint && blueprint.section_sequence) || [];
  const issues = [];
  measured.forEach(m => {
    const bp = seq.find(s => s.index === m.index);
    const expected = (bp && Array.isArray(bp.media_slots)) ? bp.media_slots.length : 0;
    if (expected === 0) return;
    if (m.images.length < expected) {
      issues.push({ severity: 'critical', section: m.index, message: `media slots sin poblar: faltan ${expected - m.images.length} de ${expected}` });
    }
    m.images.forEach((img, k) => {
      if (/^https?:\/\//i.test(img.src)) {
        issues.push({ severity: 'warning', section: m.index, message: `imagen externa (hotlink) en lugar de assets/: ${img.src.substring(0, 70)}` });
      } else if (img.src && !/assets\//i.test(img.src)) {
        issues.push({ severity: 'warning', section: m.index, message: `imagen fuera de assets/: ${img.src.substring(0, 70)}` });
      }

      // Radio de borde por imagen: cada media_slot puede traer su propio border_radius_px
      // (una sección puede mezclar imágenes con esquinas rectas y redondeadas) — no se
      // promedia contra el radio de card general de la sección.
      const slotBp = bp && Array.isArray(bp.media_slots) ? bp.media_slots[k] : null;
      if (slotBp && slotBp.border_radius_px != null && img.radius != null) {
        if (Math.abs(img.radius - slotBp.border_radius_px) > 2) {
          issues.push({ severity: 'critical', section: m.index, message: `radio de imagen ${k + 1}: ${img.radius}px ≠ blueprint ${slotBp.border_radius_px}px±2` });
        }
      }
    });
  });
  const criticals = issues.filter(i => i.severity === 'critical').length;
  return { check: 'media_slots', status: criticals ? 'FAIL' : (issues.length ? 'WARN' : 'PASS'), issues: issues.slice(0, 50), issue_count: issues.length };
}

// ---------------------------------------------------------------------------
// Multi-page resolution — matches visual_dna.secondary_pages (P2/P3 blueprints
// captured by extract_reference_dna.cjs) to the actual .html files Fase 8
// generated for them. Filenames are chosen freely in Etapa 8.1, so there is no
// fixed mapping — resolved by nav href order in index.html, falling back to
// filesystem order when that heuristic comes up short.
// ---------------------------------------------------------------------------
function findSecondaryPrototypeFiles(secondaryCount) {
  if (secondaryCount === 0) return [];
  const indexPath = path.join(PROTO_DIR, 'index.html');
  let hrefs = [];
  if (fs.existsSync(indexPath)) {
    const html = fs.readFileSync(indexPath, 'utf8');
    const navMatch = html.match(/<nav[\s\S]*?<\/nav>/i);
    const scope = navMatch ? navMatch[0] : html;
    hrefs = [...new Set([...scope.matchAll(/href\s*=\s*["']([^"'#]+\.html)["']/gi)].map(m => m[1]))]
      .filter(h => !/(^|\/)index\.html$/i.test(h));
  }
  if (hrefs.length >= secondaryCount) return hrefs.slice(0, secondaryCount);
  if (!fs.existsSync(PROTO_DIR)) return [];
  const allHtml = fs.readdirSync(PROTO_DIR).filter(f => /\.html$/i.test(f) && f !== 'index.html').sort();
  return allHtml.slice(0, secondaryCount);
}

// ---------------------------------------------------------------------------
// [F] Navbar fidelity — sticky, backdrop, pill vs full-width, height, radius
// ---------------------------------------------------------------------------
async function checkNavbar(htmlFile, blueprint) {
  const nb = blueprint && blueprint.navbar;
  if (!nb) return { check: 'navbar_fidelity', status: 'SKIPPED', reason: 'sin blueprint de navbar' };

  const chromium = requireChromium();
  if (!chromium) return { check: 'navbar_fidelity', status: 'SKIPPED', reason: 'Playwright no disponible' };

  const htmlPath = path.join(PROTO_DIR, htmlFile);
  if (!fs.existsSync(htmlPath)) return { check: 'navbar_fidelity', status: 'SKIPPED', reason: `${htmlFile} no encontrado` };

  let browser;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`file:///${htmlPath.replace(/\\/g, '/')}`);
    await page.waitForTimeout(400);

    const measured = await page.evaluate(() => {
      const cs2 = (el, p) => window.getComputedStyle(el).getPropertyValue(p);
      const px2 = v => Math.round(parseFloat(v) || 0);
      // Buscar el elemento fixed/sticky más alto — es el chrome visual real del navbar
      let navEl = null;
      const candidates = [
        ...document.querySelectorAll('header, nav, [class*="header"], [class*="navbar"], [class*="nav-"]'),
      ];
      for (const el of candidates) {
        const pos = cs2(el, 'position');
        if (pos === 'fixed' || pos === 'sticky') { navEl = el; break; }
        let cur = el.parentElement;
        for (let d = 0; d < 5 && cur && cur !== document.body; d++, cur = cur.parentElement) {
          if (['fixed', 'sticky'].includes(cs2(cur, 'position'))) { navEl = cur; break; }
        }
        if (navEl) break;
      }
      if (!navEl) return { found: false };
      const rect = navEl.getBoundingClientRect();
      const bd = cs2(navEl, 'backdrop-filter') || cs2(navEl, '-webkit-backdrop-filter') || '';
      const bgc = cs2(navEl, 'background-color') || '';
      // Controles de icono (theme toggle, buscador, etc.) — misma heurística que el extractor:
      // botones/links pequeños, cuadrados, con SVG o sin texto, dentro del chrome del navbar.
      const isVis = (el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        const st = getComputedStyle(el);
        return st.display !== 'none' && st.visibility !== 'hidden' && parseFloat(st.opacity) !== 0;
      };
      const utilityControlsCount = [...navEl.querySelectorAll('a, button')].filter(el => {
        if (!isVis(el)) return false;
        const r = el.getBoundingClientRect();
        const t = el.textContent.trim();
        const hasSvg = !!el.querySelector('svg, img[class*="icon"]');
        const isIconSized = r.width > 0 && r.width <= 60 && r.height <= 60 && r.width / r.height >= 0.4 && r.width / r.height <= 2.5;
        return isIconSized && (hasSvg || t.length <= 2);
      }).length;
      return {
        found: true,
        height_px:        Math.round(rect.height),
        position:         cs2(navEl, 'position'),
        is_sticky:        ['fixed', 'sticky'].includes(cs2(navEl, 'position')),
        has_backdrop:     bd !== '' && bd !== 'none',
        border_radius_px: px2(cs2(navEl, 'border-radius')),
        width_px:         Math.round(rect.width),
        is_full_width:    rect.width >= window.innerWidth * 0.95,
        bg_transparent:   bgc === 'rgba(0, 0, 0, 0)' || bgc === 'transparent' || (() => {
          const m = bgc.match(/rgba?\([^)]+,\s*([\d.]+)\)/);
          return m ? parseFloat(m[1]) < 0.1 : false;
        })(),
        utility_controls_count: utilityControlsCount,
      };
    });

    const issues = [];
    if (!measured.found) {
      issues.push({ severity: 'critical', message: 'No se encontró ningún elemento header fixed/sticky en el prototipo' });
    } else {
      if (nb.is_sticky && !measured.is_sticky) {
        issues.push({ severity: 'critical', message: `navbar debe ser fixed/sticky (is_sticky:true) pero position:${measured.position}` });
      }
      if (nb.has_backdrop && !measured.has_backdrop) {
        issues.push({ severity: 'critical', message: 'navbar debe tener backdrop-filter (has_backdrop:true) pero no se detectó' });
      }
      if (nb.border_radius_px != null) {
        const bpPill = nb.border_radius_px > 20;
        const prPill = measured.border_radius_px > 20;
        if (bpPill !== prPill) {
          const bpLabel = bpPill ? `pill (${nb.border_radius_px}px)` : `rectangular (${nb.border_radius_px}px)`;
          const prLabel = prPill ? `pill (${measured.border_radius_px}px)` : `rectangular (${measured.border_radius_px}px)`;
          issues.push({ severity: 'critical', message: `morfología navbar: blueprint=${bpLabel}, prototipo=${prLabel}` });
        } else if (Math.abs(measured.border_radius_px - nb.border_radius_px) > 4) {
          issues.push({ severity: 'warning', message: `border-radius navbar: ${measured.border_radius_px}px ≠ blueprint ${nb.border_radius_px}px±4` });
        }
      }
      if (nb.is_full_width !== undefined && nb.is_full_width !== measured.is_full_width) {
        const bpLabel = nb.is_full_width ? 'full-width' : 'flotante/pill';
        const prLabel = measured.is_full_width ? 'full-width' : 'flotante/pill';
        issues.push({ severity: 'critical', message: `tipo navbar: blueprint=${bpLabel}, prototipo=${prLabel}` });
      }
      if (nb.height_px != null && Math.abs(measured.height_px - nb.height_px) > 10) {
        issues.push({ severity: 'warning', message: `altura navbar: ${measured.height_px}px ≠ blueprint ${nb.height_px}px±10` });
      }
      // Controles de icono (theme toggle, buscador, etc.) — la causa más común de que un
      // header de 3 zonas termine maquetado con solo 2 (brand + links, sin la 3ª zona).
      const expectedControls = Array.isArray(nb.utility_controls) ? nb.utility_controls.length : 0;
      if (expectedControls > 0 && measured.utility_controls_count < expectedControls) {
        issues.push({
          severity: 'critical',
          message: `controles de icono del navbar: ${measured.utility_controls_count} encontrado(s) en el prototipo, blueprint exige ${expectedControls} (navbar.utility_controls)`,
        });
      }
    }

    const criticals = issues.filter(i => i.severity === 'critical').length;
    return {
      check: 'navbar_fidelity',
      status: criticals ? 'FAIL' : (issues.length ? 'WARN' : 'PASS'),
      measured: measured.found ? measured : null,
      blueprint: { is_sticky: nb.is_sticky, has_backdrop: nb.has_backdrop, border_radius_px: nb.border_radius_px, is_full_width: nb.is_full_width, height_px: nb.height_px },
      issues,
      issue_count: issues.length,
    };
  } catch (e) {
    return { check: 'navbar_fidelity', status: 'ERROR', error: e.message };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Cookie banner fidelity — el extractor captura el diseño real del gestor de
// cookies antes de cerrarlo (ver captureCookieBannerDesign en el extractor).
// Sin este check, la Compuerta Mecánica no detecta que Fase 8 lo omitió pese
// a la regla NON-BYPASSABLE de phase-8-prototype.md — dependía 100% de que el
// LLM la recordara entre docenas de reglas.
// ---------------------------------------------------------------------------
async function checkCookieBanner(htmlFile, blueprint) {
  const cb = blueprint && blueprint.cookie_banner;
  if (!cb) return { check: 'cookie_banner_fidelity', status: 'SKIPPED', reason: 'sin blueprint de cookie_banner' };
  if (!cb.found) return { check: 'cookie_banner_fidelity', status: 'SKIPPED', reason: 'la referencia no mostró banner de cookies durante la extracción' };

  const chromium = requireChromium();
  if (!chromium) return { check: 'cookie_banner_fidelity', status: 'SKIPPED', reason: 'Playwright no disponible' };

  const htmlPath = path.join(PROTO_DIR, htmlFile);
  if (!fs.existsSync(htmlPath)) return { check: 'cookie_banner_fidelity', status: 'SKIPPED', reason: `${htmlFile} no encontrado` };

  let browser;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`file:///${htmlPath.replace(/\\/g, '/')}`);
    await page.waitForTimeout(400);

    const found = await page.evaluate(() => {
      const isVis = (el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        const st = getComputedStyle(el);
        return st.display !== 'none' && st.visibility !== 'hidden' && parseFloat(st.opacity) !== 0;
      };
      const selector = [
        '[id*="cookie" i]', '[class*="cookie" i]', '[id*="consent" i]', '[class*="consent" i]',
        '[class*="gdpr" i]', '[id*="gdpr" i]',
      ].join(', ');
      return [...document.querySelectorAll(selector)]
        .some(el => isVis(el) && el.getBoundingClientRect().width >= 200 && el.getBoundingClientRect().height >= 40);
    });

    const issues = found ? [] : [{
      severity: 'critical',
      message: 'blueprint.cookie_banner.found:true pero no se encontró ningún banner de cookies visible en el prototipo (selector [class*="cookie"]/[class*="consent"]/[class*="gdpr"])',
    }];

    return {
      check: 'cookie_banner_fidelity',
      status: issues.length ? 'FAIL' : 'PASS',
      measured: { found },
      blueprint: { found: cb.found, position: cb.position },
      issues,
      issue_count: issues.length,
    };
  } catch (e) {
    return { check: 'cookie_banner_fidelity', status: 'ERROR', error: e.message };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// [G] Blueprint completeness for secondary pages — catches a synthesis bug
// where visual_dna.secondary_pages[].structural_blueprint gets persisted as a
// truncated subset (only global/navbar/hero/component_dna) instead of the
// full depth the extractor actually returned. Without section_sequence, Fase
// 8 has zero column/grid data for that page and silently invents a generic
// layout — this must surface as a loud FAIL, not a quiet SKIPPED elsewhere.
// ---------------------------------------------------------------------------
function checkBlueprintCompleteness(pageInfo) {
  const { role, blueprint } = pageInfo;
  if (role === 'home') return { check: 'blueprint_completeness', status: 'SKIPPED', reason: 'solo aplica a páginas secundarias' };
  if (!blueprint) return { check: 'blueprint_completeness', status: 'SKIPPED', reason: 'sin blueprint para esta página' };

  const hasSeq = Array.isArray(blueprint.section_sequence) && blueprint.section_sequence.length > 0;
  if (hasSeq) return { check: 'blueprint_completeness', status: 'PASS' };

  return {
    check: 'blueprint_completeness',
    status: 'FAIL',
    issues: [{
      severity: 'critical',
      message: `visual_dna.secondary_pages (role: ${role}) no tiene section_sequence — el blueprint de esta página quedó truncado durante la persistencia en Fase 1 (ver regla NON-BYPASSABLE "Profundidad idéntica en secondary_pages"). Re-ejecutar la extracción para esta página y volver a persistir el structural_blueprint completo antes de continuar con Fase 8.`,
    }],
    issue_count: 1,
  };
}

// Páginas "huérfanas": archivos .html en prototype/ que NO tienen entrada propia en
// visual_dna.secondary_pages (ej. sitios de una sola página donde "Pricing"/"Contact"
// son secciones ancladas por nav — no rutas reales que Fase 1 pueda crawlear como
// página distinta) pero SÍ usan `data-section="N"` reclamando reproducir una sección
// real del Home. Sin este pase, esas páginas nunca se verifican mecánicamente —
// confirmado en un caso real: una página así aplicó padding inventado (64px/32px) en
// vez del padding_top_px/padding_bottom_px real (0/0) de la sección del Home que
// decía estar reproduciendo, y ningún check lo detectó porque la página era invisible
// para resolvePages().
function findOrphanPrototypePages(knownFiles) {
  if (!fs.existsSync(PROTO_DIR)) return [];
  const known = new Set(['index.html', ...knownFiles]);
  return fs.readdirSync(PROTO_DIR)
    .filter(f => /\.html$/i.test(f) && !known.has(f))
    .filter(f => {
      try { return /data-section\s*=\s*["']\d+["']/.test(fs.readFileSync(path.join(PROTO_DIR, f), 'utf8')); }
      catch { return false; }
    })
    .sort();
}

function resolvePages() {
  const pages = [{ role: 'home', file: 'index.html', blueprint: vd.structural_blueprint, refPrefix: 'ref', protoPrefix: 'proto' }];
  const secondary = Array.isArray(vd.secondary_pages) ? vd.secondary_pages : [];
  const files = findSecondaryPrototypeFiles(secondary.length);
  const rolePrefix = { content: 'p2', conversion: 'p3' };
  secondary.forEach((sp, i) => {
    const file = files[i];
    if (!file) return; // no se encontró un .html correspondiente — se omite, no se inventa
    const px = rolePrefix[sp.role] || `p${i + 2}`;
    pages.push({ role: sp.role, file, blueprint: sp.structural_blueprint, refPrefix: `ref_${px}`, protoPrefix: `proto_${px}` });
  });

  const homeSeq = (vd.structural_blueprint && Array.isArray(vd.structural_blueprint.section_sequence))
    ? vd.structural_blueprint.section_sequence : [];
  if (homeSeq.length) {
    const knownFiles = files.filter(Boolean);
    const orphanFiles = findOrphanPrototypePages(knownFiles);
    orphanFiles.forEach((file, i) => {
      let html;
      try { html = fs.readFileSync(path.join(PROTO_DIR, file), 'utf8'); } catch { return; }
      const usedIndices = new Set(
        [...html.matchAll(/data-section\s*=\s*["'](\d+)["']/g)].map(m => parseInt(m[1], 10))
      );
      // Solo se verifican las secciones del Home que esta página realmente reclama
      // reproducir — nunca se exige la secuencia completa (esta página no pretende
      // ser el Home, solo reutiliza N secciones puntuales de él).
      const filteredSeq = homeSeq.filter(s => usedIndices.has(s.index));
      if (!filteredSeq.length) return; // data-section presente pero ningún índice coincide con el Home
      const orphanBlueprint = { ...vd.structural_blueprint, section_sequence: filteredSeq };
      pages.push({
        role: 'reused_home_sections',
        file,
        blueprint: orphanBlueprint,
        refPrefix: 'ref',
        protoPrefix: `proto_reuse_${i + 1}`,
      });
    });
  }

  return pages;
}

async function runPageChecks(pageInfo) {
  const { file, blueprint } = pageInfo;
  const seqAvailable = !!(blueprint && Array.isArray(blueprint.section_sequence) && blueprint.section_sequence.length > 0);
  const checks = { structure: null, geometry: null, media: null, visual: null, components: null, hover_parity: null, mobile: null, navbar: null, blueprint_completeness: null, cookie_banner: null };

  checks.blueprint_completeness = checkBlueprintCompleteness(pageInfo);
  checks.structure = runStructureCheck(file, blueprint);

  let audit = null;
  if (structureRequired && seqAvailable) {
    audit = await runVisualAndSectionCheck(file, blueprint, pageInfo.refPrefix, pageInfo.protoPrefix).catch(e => ({ error: e.message }));
    if (audit && audit.chromium_missing) {
      const reason = 'Playwright no disponible para medir el prototipo';
      checks.geometry = { check: 'geometry_assertions', status: 'WARN', reason };
      checks.media    = { check: 'media_slots', status: 'WARN', reason };
      checks.components   = { check: 'component_signals', status: 'WARN', reason };
      checks.hover_parity = { check: 'hover_parity', status: 'WARN', reason };
      checks.mobile       = { check: 'mobile_fidelity', status: 'WARN', reason };
    } else if (audit && audit.error) {
      const reason = `error midiendo ${file}: ${audit.error}`;
      checks.geometry = { check: 'geometry_assertions', status: 'WARN', reason };
      checks.media    = { check: 'media_slots', status: 'WARN', reason };
      checks.components   = { check: 'component_signals', status: 'WARN', reason };
      checks.hover_parity = { check: 'hover_parity', status: 'WARN', reason };
      checks.mobile       = { check: 'mobile_fidelity', status: 'WARN', reason };
    } else {
      checks.geometry = compareGeometry(audit.measured, blueprint);
      checks.media    = compareMedia(audit.measured, blueprint);
      checks.components   = audit.components;
      checks.hover_parity = audit.hoverParity;
      checks.mobile       = audit.mobile;
    }
  } else {
    const reason = structureRequired ? `sin structural_blueprint.section_sequence para ${file}` : `modo ${mode} no exige paridad geométrica`;
    checks.geometry = { check: 'geometry_assertions', status: 'SKIPPED', reason };
    checks.media    = { check: 'media_slots', status: 'SKIPPED', reason };
    checks.components   = { check: 'component_signals', status: 'SKIPPED', reason };
    checks.hover_parity = { check: 'hover_parity', status: 'SKIPPED', reason };
    checks.mobile       = { check: 'mobile_fidelity', status: 'SKIPPED', reason };
  }

  if (audit && audit.visual && audit.visual.status === 'MEASURED') {
    checks.visual = audit.visual;
  } else if (VISUAL) {
    checks.visual = (audit && audit.chromium_missing)
      ? { check: 'visual_verification', status: 'WARN', reason: 'Playwright no disponible' }
      : { check: 'visual_verification', status: 'NOT_REQUESTED', note: 'requiere --visual y blueprint disponible' };
  } else {
    checks.visual = { check: 'visual_verification', status: 'NOT_REQUESTED' };
  }

  // Navbar check: runs independently of the section geometry/visual checks so
  // that it fires even in modes that skip section-level assertions. Only runs
  // for index.html (the home page) where the nav chrome is meaningful.
  if (pageInfo.role === 'home') {
    checks.navbar = await checkNavbar(file, blueprint).catch(e => ({ check: 'navbar_fidelity', status: 'ERROR', error: e.message }));
    checks.cookie_banner = await checkCookieBanner(file, blueprint).catch(e => ({ check: 'cookie_banner_fidelity', status: 'ERROR', error: e.message }));
  } else {
    checks.navbar = { check: 'navbar_fidelity', status: 'SKIPPED', reason: 'solo se verifica en home' };
    checks.cookie_banner = { check: 'cookie_banner_fidelity', status: 'SKIPPED', reason: 'solo se verifica en home' };
  }

  return checks;
}

function aggregateSeverity(checks) {
  for (const key of ['structure', 'geometry', 'media', 'components', 'mobile', 'navbar', 'blueprint_completeness', 'cookie_banner']) {
    const chk = checks[key];
    if (!chk) continue;
    if (chk.status === 'FAIL') report.summary.critical += 1;
    if (chk.status === 'WARN') report.summary.warnings += 1;
  }
  if (checks.hover_parity && checks.hover_parity.status === 'WARN') report.summary.warnings += 1;
  const mobileSim = checks.mobile && checks.mobile.hero_similarity_mobile;
  if (mobileSim !== null && mobileSim !== undefined && mobileSim < 0.70) report.summary.warnings += 1;

  const v = checks.visual;
  if (v && v.status === 'MEASURED') {
    const simGlobal = v.similarity_vs_reference ? v.similarity_vs_reference.hero : null;
    if (simGlobal !== null && simGlobal !== undefined) {
      if (visualRequiredStrictly && !ONLY_SECTION && simGlobal < 0.70) report.summary.critical += 1;
      else if (simGlobal < 0.85) report.summary.warnings += 1;
    }
    (v.section_scores || []).forEach(sc => {
      if (sc.status === 'MISSING') { report.summary.warnings += 1; return; }
      if (sc.similarity !== null && sc.similarity !== undefined) {
        if (visualRequiredStrictly && sc.similarity < 0.60) report.summary.critical += 1;
        else if (sc.similarity < 0.80) report.summary.warnings += 1;
      }
      if (sc.aspect_delta_pct !== null && sc.aspect_delta_pct > 25) report.summary.warnings += 1;
    });
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
(async function main() {
  console.error(`[Verify] Modo de fidelidad: ${mode}`);
  console.error(`[Verify] Prototipo: ${PROTO_DIR}`);
  console.error(`[Verify] Tolerancia cromática: ±${TOLERANCE} por canal${ONLY_SECTION ? ` | Solo sección ${ONLY_SECTION}` : ''}`);

  report.checks.colors = runColorCheck();

  if (report.mode === 'INSPIRATION') {
    report.checks.structure = { check: 'structural_parity', status: 'SKIPPED', reason: 'modo INSPIRATION no replica estructura de referencia' };
    report.checks.geometry  = { check: 'geometry_assertions', status: 'SKIPPED', reason: 'modo INSPIRATION no replica geometría de referencia' };
    report.checks.media     = { check: 'media_slots', status: 'SKIPPED', reason: 'sin blueprint estructural en modo INSPIRATION' };
    report.checks.components   = { check: 'component_signals', status: 'SKIPPED', reason: 'modo INSPIRATION no exige señales de componentes' };
    report.checks.hover_parity = { check: 'hover_parity', status: 'SKIPPED', reason: 'modo INSPIRATION no exige paridad de hover' };
    report.checks.mobile       = { check: 'mobile_fidelity', status: 'SKIPPED', reason: 'modo INSPIRATION no exige fidelidad mobile' };
    report.checks.visual    = VISUAL
      ? { check: 'visual_verification', status: 'SKIPPED', reason: 'modo INSPIRATION no compara contra la referencia' }
      : { check: 'visual_verification', status: 'NOT_REQUESTED' };
  } else {
    const pages = resolvePages();
    const [homePage, ...secondaryPages] = pages;

    const homeChecks = await runPageChecks(homePage);
    report.checks.structure    = homeChecks.structure;
    report.checks.geometry     = homeChecks.geometry;
    report.checks.media        = homeChecks.media;
    report.checks.components   = homeChecks.components;
    report.checks.hover_parity = homeChecks.hover_parity;
    report.checks.mobile       = homeChecks.mobile;
    report.checks.visual       = homeChecks.visual;
    report.checks.navbar       = homeChecks.navbar;
    report.checks.blueprint_completeness = homeChecks.blueprint_completeness;
    report.checks.cookie_banner = homeChecks.cookie_banner;

    // Páginas secundarias con blueprint propio (visual_dna.secondary_pages) — mismo rigor
    // que el home, ver Etapa 8.2 punto 3 de phase-8-prototype.md. Se omiten en --only-section
    // (flag de depuración puntual de una sección del home).
    if (!ONLY_SECTION) {
      for (const sp of secondaryPages) {
        const spChecks = await runPageChecks(sp);
        report.secondary_pages.push({ role: sp.role, file: sp.file, checks: spChecks });
      }
    }
  }

  // Severity aggregation
  const c = report.checks.colors;
  if (c.status === 'FAIL') report.summary.critical += 1;

  aggregateSeverity(report.checks);
  for (const sp of report.secondary_pages) aggregateSeverity(sp.checks);

  const exitCode = report.summary.critical > 0 ? 1 : 0;

  // Pure JSON on stdout (machine-readable); human summary on stderr
  console.log(JSON.stringify(report, null, 2));
  const st = (k) => (report.checks[k] || {}).status || 'N/A';
  console.error(`[Verify] Colores: ${st('colors')} | Estructura: ${st('structure')} | Geometría: ${st('geometry')} | Media: ${st('media')} | Componentes: ${st('components')} | Hover: ${st('hover_parity')} | Mobile: ${st('mobile')} | Navbar: ${st('navbar')} | Cookies: ${st('cookie_banner')} | Visual: ${st('visual')}`);
  for (const sp of report.secondary_pages) {
    const stp = (k) => (sp.checks[k] || {}).status || 'N/A';
    console.error(`[Verify] [${sp.role}:${sp.file}] Estructura: ${stp('structure')} | Geometría: ${stp('geometry')} | Media: ${stp('media')} | Componentes: ${stp('components')} | Hover: ${stp('hover_parity')} | Mobile: ${stp('mobile')} | Visual: ${stp('visual')}`);
  }
  console.error(`[Verify] Resultado: ${exitCode === 0 ? 'APROBADO' : 'RECHAZADO'} (críticos: ${report.summary.critical}, advertencias: ${report.summary.warnings})`);

  process.exit(exitCode);
})().catch(err => {
  fail(err.message);
});
