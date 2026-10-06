/**
 * Utilidades de contraste WCAG compartidas por compile_design_system.cjs y audit_design_system.cjs.
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

/**
 * Razones de contraste que un documento declara ("#222617 ... #F8F7D6 ... 14.19:1") frente a las medidas.
 * Una línea cuenta como par cuando tiene exactamente dos colores HEX distintos seguidos de "N:1" (fila de tabla
 * markdown o <tr> en una sola línea): el primero es el texto/elemento y el segundo el fondo. Los agentes escriben
 * estas cifras de memoria y suelen errar, así que se comprueban contra el cálculo real.
 * @returns {Array<{ line: number, fg: string, bg: string, claimed: number, measured: number }>} diferencias > tolerance
 */
function findRatioMismatches(text, tolerance = 0.15) {
  const out = [];
  String(text).split('\n').forEach((line, i) => {
    const hexes = line.match(/#[0-9a-fA-F]{6}\b/g) || [];
    const distinct = [...new Set(hexes.map(h => h.toUpperCase()))];
    if (distinct.length !== 2) return;
    const ratioMatch = line.match(/(\d{1,2}(?:\.\d{1,2})?):1(?![0-9])/);
    if (!ratioMatch) return;
    const lastHexEnd = line.lastIndexOf(hexes[hexes.length - 1]) + 7;
    if (ratioMatch.index < lastHexEnd) return; // el ratio debe venir después de ambos colores
    const fg = parseColor(hexes[0]);
    const bg = parseColor(hexes[hexes.length - 1]);
    if (!fg || !bg) return;
    const measured = contrastRatio(fg, bg);
    const claimed = parseFloat(ratioMatch[1]);
    if (Math.abs(measured - claimed) > tolerance) {
      out.push({ line: i + 1, fg: hexes[0].toUpperCase(), bg: hexes[hexes.length - 1].toUpperCase(), claimed, measured: Math.round(measured * 100) / 100 });
    }
  });
  return out;
}

module.exports = { parseColor, flatten, relativeLuminance, contrastRatio, toHex, pickReadable, findRatioMismatches };

// CLI: node contrast.cjs "#222617" "#F8F7D6" [...pares] -> imprime la razón medida de cada par (texto, fondo)
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length < 2 || args.length % 2 !== 0) {
    console.error('Uso: node contrast.cjs <color-texto> <color-fondo> [<color-texto> <color-fondo> ...]');
    process.exit(1);
  }
  for (let i = 0; i < args.length; i += 2) {
    const fg = parseColor(args[i]);
    const bg = parseColor(args[i + 1]);
    if (!fg || !bg) { console.error(`Color no válido: ${args[i]} / ${args[i + 1]}`); process.exit(1); }
    console.log(`${args[i]} sobre ${args[i + 1]} = ${contrastRatio(flatten(fg, bg), bg).toFixed(2)}:1`);
  }
}
