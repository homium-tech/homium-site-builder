/**
 * Revisión estructural de HTML sin navegador: detecta los errores de anidación que el parser del navegador
 * "repara" moviendo contenido de sitio (p. ej. una <table> o un <div> dentro de <tbody>, o un </div> de más que
 * cierra <main>), lo que saca secciones enteras de su contenedor y las deja bajo el rail lateral.
 *
 * Uso como módulo: findStructureProblems(html) -> [{ line, message }]
 */

'use strict';

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
// Etiquetas cuyo cierre es opcional: no se reportan si quedan abiertas al cerrar su contenedor
const OPTIONAL_END = new Set(['p', 'li', 'tr', 'td', 'th', 'thead', 'tbody', 'tfoot', 'option', 'dt', 'dd', 'colgroup', 'caption']);
// Hijos válidos directos de un contenedor de tabla; cualquier otra cosa se mueve fuera por el navegador
const TABLE_PARTS = new Set(['table', 'thead', 'tbody', 'tfoot', 'tr']);
const TABLE_CHILDREN = new Set(['tr', 'td', 'th', 'thead', 'tbody', 'tfoot', 'caption', 'colgroup', 'col', 'script', 'template', 'style']);
const RAW_TEXT = new Set(['script', 'style', 'textarea']);

function findStructureProblems(html) {
  const source = String(html || '');
  const problems = [];
  const stack = [];
  const lineStarts = [0];
  for (let i = 0; i < source.length; i++) if (source[i] === '\n') lineStarts.push(i + 1);
  const lineOf = (index) => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= index) lo = mid; else hi = mid - 1;
    }
    return lo + 1;
  };

  const top = () => stack[stack.length - 1];
  const popWhile = (tags) => { while (stack.length && tags.has(top().tag)) stack.pop(); };

  const tokenRe = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/g;
  let m;
  while ((m = tokenRe.exec(source)) !== null) {
    if (m[0].startsWith('<!--')) continue;
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    const line = lineOf(m.index);

    if (!closing && RAW_TEXT.has(tag) && !m[3].trim().endsWith('/')) {
      const end = source.toLowerCase().indexOf('</' + tag, tokenRe.lastIndex);
      if (end === -1) break;
      // Salta el contenido y la etiqueta de cierre: no son marcado de la página
      const endTag = source.indexOf('>', end);
      tokenRe.lastIndex = endTag === -1 ? source.length : endTag + 1;
      continue;
    }
    if (VOID.has(tag) || (!closing && m[3].trim().endsWith('/'))) continue;

    if (!closing) {
      // Cierres implícitos del HTML
      if (tag === 'li') popWhile(new Set(['li']));
      else if (tag === 'tr') popWhile(new Set(['td', 'th', 'tr']));
      else if (tag === 'td' || tag === 'th') popWhile(new Set(['td', 'th']));
      else if (tag === 'thead' || tag === 'tbody' || tag === 'tfoot') popWhile(new Set(['tr', 'td', 'th', 'thead', 'tbody', 'tfoot']));
      else if (tag === 'option') popWhile(new Set(['option']));
      else if (tag === 'p') popWhile(new Set(['p']));

      const parent = top();
      if (parent && TABLE_PARTS.has(parent.tag) && !TABLE_CHILDREN.has(tag)) {
        problems.push({ line, message: `<${tag}> dentro de <${parent.tag}> (abierto en la línea ${parent.line}): el navegador lo saca de la tabla y desordena el resto del DOM. En una tabla solo van <tr>/<td>/<th>.` });
      }
      stack.push({ tag, line });
      continue;
    }

    const at = stack.map(e => e.tag).lastIndexOf(tag);
    if (at === -1) {
      problems.push({ line, message: `</${tag}> sin etiqueta de apertura: cierra el contenedor equivocado.` });
      continue;
    }
    while (stack.length - 1 > at) {
      const open = stack.pop();
      if (!OPTIONAL_END.has(open.tag)) {
        problems.push({ line: open.line, message: `<${open.tag}> abierto en la línea ${open.line} nunca se cierra (el </${tag}> de la línea ${line} lo atraviesa).` });
      }
    }
    stack.pop();
  }

  for (const open of stack) {
    if (!OPTIONAL_END.has(open.tag) && open.tag !== 'html' && open.tag !== 'body') {
      problems.push({ line: open.line, message: `<${open.tag}> abierto en la línea ${open.line} no se cierra antes del final del documento.` });
    }
  }
  return problems;
}

module.exports = { findStructureProblems };
