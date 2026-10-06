/**
 * Carga real de fuentes: qué familias llegan al navegador y cuáles solo quedan nombradas en el CSS.
 *
 * Una familia está cargada si hay un enlace/@import de Google Fonts (u otro CDN) que la pide, o un @font-face con un
 * `src: url(...)` que apunta a un archivo existente (relativo a la página) o remoto. Un @font-face que solo usa
 * `local('Nombre')` NO cuenta: depende de que la fuente esté instalada en el equipo de quien abre la página.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'inherit', 'initial']);
const WEB_FONT_FILE = /\.(woff2?|ttf|otf)(?:[?#].*)?$/i;

function clean(name) {
  return String(name || '').trim().replace(/^['"]|['"]$/g, '').trim();
}

/** Primera familia de una pila ("ES Face, sans-serif" -> "ES Face"); null si es genérica o vacía. */
function firstFamily(stack) {
  const first = clean(String(stack || '').split(',')[0]);
  return first && !GENERIC.has(first.toLowerCase()) && !/^var\(/i.test(first) ? first : null;
}

/** Bloques @font-face del CSS: [{ family, srcs: [{ kind: 'url'|'local', value }] }]. */
function parseFontFaces(css) {
  const faces = [];
  for (const m of String(css || '').matchAll(/@font-face\s*\{([^}]*)\}/gi)) {
    const body = m[1];
    const family = clean((body.match(/font-family\s*:\s*([^;]+)/i) || [])[1]);
    const srcDecl = (body.match(/src\s*:\s*([^;]+)/i) || [])[1] || '';
    const srcs = [];
    for (const u of srcDecl.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi)) srcs.push({ kind: 'url', value: u[2].trim() });
    for (const l of srcDecl.matchAll(/local\(\s*(['"]?)([^'")]+)\1\s*\)/gi)) srcs.push({ kind: 'local', value: l[2].trim() });
    if (family) faces.push({ family, srcs });
  }
  return faces;
}

/** Familias pedidas a Google Fonts / Fontshare por enlace, @import o url(). */
function remoteFamilies(text) {
  const names = new Set();
  const add = (n) => { if (n) names.add(clean(n).toLowerCase()); };
  for (const m of String(text || '').matchAll(/[?&]family=([^&"')\s]+)/gi)) {
    let name;
    try { name = decodeURIComponent(m[1].replace(/\+/g, ' ')); } catch (e) { name = m[1].replace(/\+/g, ' '); }
    add(name.split(':')[0]);
  }
  for (const m of String(text || '').matchAll(/[?&]f\[\]=([^&"')\s]+)/gi)) {
    try { add(decodeURIComponent(m[1]).split('@')[0].replace(/-/g, ' ')); } catch (e) { /* se ignora */ }
  }
  return names;
}

/**
 * @param {string} css CSS (con los <style> ya incluidos)
 * @param {string} html HTML de la página (para los <link> de fuentes)
 * @param {string} baseDir carpeta de la página, contra la que se resuelven las rutas relativas de url()
 * @returns {{ has: (family: string) => boolean, why: (family: string) => string }}
 */
function fontLoader(css, html, baseDir) {
  const remote = remoteFamilies(`${css}\n${html}`);
  const faces = parseFontFaces(css);

  const urlWorks = (value) => {
    if (/^(?:https?:)?\/\//i.test(value) || /^data:/i.test(value)) return true;
    if (!WEB_FONT_FILE.test(value)) return false; // .cff, .eot, sin extensión: ningún navegador actual lo carga como fuente
    const file = path.resolve(baseDir, decodeURIComponent(value.replace(/[?#].*$/, '')).replace(/^\/+/, ''));
    return fs.existsSync(file);
  };

  const facesOf = (family) => faces.filter(f => f.family.toLowerCase() === family.toLowerCase());

  return {
    has(family) {
      const key = clean(family).toLowerCase();
      if (remote.has(key)) return true;
      return facesOf(family).some(f => f.srcs.some(s => s.kind === 'url' && urlWorks(s.value)));
    },
    why(family) {
      const key = clean(family).toLowerCase();
      if (remote.has(key)) return '';
      const own = facesOf(family);
      if (own.length === 0) return 'no hay @font-face ni enlace de Google Fonts que la cargue';
      const urls = own.flatMap(f => f.srcs.filter(s => s.kind === 'url').map(s => s.value));
      if (urls.length === 0) return 'su @font-face solo usa local(): depende de que esté instalada en el equipo de quien abre la página';
      const bad = urls.filter(u => !urlWorks(u));
      return `su @font-face apunta a un archivo que no existe o que el navegador no puede cargar (${bad.slice(0, 2).join(', ')}); se necesita TTF, OTF, WOFF o WOFF2`;
    }
  };
}

module.exports = { firstFamily, parseFontFaces, remoteFamilies, fontLoader, GENERIC };
