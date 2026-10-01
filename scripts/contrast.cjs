/**
 * Utilidades de contraste WCAG compartidas por compile_showcase.cjs y audit_showcase.cjs.
 * Solo funciones puras: sin lectura de archivos ni efectos secundarios.
 */

'use strict';

/** '#abc' | '#aabbcc' | '#aabbccdd' | 'rgb(...)' | 'rgba(...)' -> { r, g, b, a } o null */
function parseColor(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim();

  const hex = v.match(/^#([0-9a-f]{3,8})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) h = h.split('').map(x => x + x).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1
    };
  }

  const fn = v.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+%?)\s*)?\)$/i);
  if (fn) {
    let a = 1;
    if (fn[4] !== undefined) a = fn[4].endsWith('%') ? parseFloat(fn[4]) / 100 : parseFloat(fn[4]);
    return { r: Number(fn[1]), g: Number(fn[2]), b: Number(fn[3]), a };
  }
  return null;
}

/** Mezcla `fg` (con su alfa) sobre `bg` opaco */
function flatten(fg, bg) {
  const a = fg.a === undefined ? 1 : fg.a;
  return {
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
    a: 1
  };
}

function relativeLuminance({ r, g, b }) {
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Ratio WCAG entre un texto (puede ser translúcido) y un fondo opaco */
function contrastRatio(fg, bg) {
  const solid = flatten(fg, bg);
  const l1 = relativeLuminance(solid);
  const l2 = relativeLuminance(bg);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

function toHex({ r, g, b }) {
  const h = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

/**
 * Entre los candidatos (hex), el primero que alcanza `min` contra `bgHex`; si ninguno,
 * el de mayor contraste. Los candidatos van por orden de preferencia (los de la paleta primero).
 */
function pickReadable(bgHex, candidates, min = 7) {
  const bg = parseColor(bgHex);
  const valid = candidates.map(c => ({ hex: c, color: parseColor(c) })).filter(c => c.color);
  if (!bg || valid.length === 0) return candidates[0];
  const scored = valid.map(c => ({ hex: c.hex, ratio: contrastRatio(c.color, bg) }));
  const ok = scored.find(c => c.ratio >= min);
  if (ok) return ok.hex;
  return scored.sort((a, b) => b.ratio - a.ratio)[0].hex;
}

module.exports = { parseColor, flatten, relativeLuminance, contrastRatio, toHex, pickReadable };
