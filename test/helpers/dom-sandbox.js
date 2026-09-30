const fs = require('fs');
const path = require('path');
const vm = require('vm');

/**
 * Ejecuta public/app.js completo en un contexto `vm` con un DOM mínimo simulado.
 * No es un navegador: sirve para probar la lógica de render (qué HTML produce) sin dependencias extra.
 *
 * @param {Object} [options]
 * @param {Object} [options.storage] Contenido inicial de localStorage
 * @param {Function} [options.fetch] Implementación de fetch
 * @returns {{ context: Object, el: (id: string) => Object, run: (code: string) => any }}
 */
function loadApp({ storage = {}, fetch = null } = {}) {
  const registry = new Map();

  function makeElement(id = '') {
    const listeners = {};
    const el = {
      __id: id,
      __html: '',
      style: {},
      dataset: {},
      children: [],
      hidden: false,
      value: '',
      textContent: '',
      title: '',
      className: '',
      disabled: false,
      options: [],
      selectedIndex: 0,
      offsetParent: null,
      scrollTop: 0,
      scrollHeight: 0,
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
      addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
      removeEventListener() {},
      dispatchEvent(event) { (listeners[event.type] || []).forEach(fn => fn(event)); return true; },
      setAttribute() {},
      getAttribute() { return null; },
      appendChild(child) { this.children.push(child); return child; },
      remove() {},
      focus() {},
      click() {},
      scrollIntoView() {},
      querySelector() { return null; },
      querySelectorAll() { return []; },
      closest() { return null; }
    };
    Object.defineProperty(el, 'innerHTML', {
      get() { return this.__html; },
      set(value) { this.__html = String(value); }
    });
    return el;
  }

  const document = {
    getElementById(id) {
      if (!registry.has(id)) registry.set(id, makeElement(id));
      return registry.get(id);
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement() { return makeElement(); },
    addEventListener() {},
    head: makeElement('head'),
    body: makeElement('body')
  };

  const store = { ...storage };
  const context = {
    document,
    window: { addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }) },
    localStorage: {
      getItem: (key) => (key in store ? store[key] : null),
      setItem: (key, value) => { store[key] = String(value); },
      removeItem: (key) => { delete store[key]; }
    },
    navigator: { clipboard: { writeText: async () => {} } },
    fetch: fetch || (async () => ({ ok: false, status: 500, json: async () => ({}) })),
    EventSource: class { addEventListener() {} close() {} },
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    URL,
    Promise,
    Date,
    Math,
    JSON,
    Set,
    Map,
    MessageHeuristics: require('../../core/text/message-heuristics.js')
  };
  context.window.document = document;
  vm.createContext(context);

  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'app.js'), 'utf-8');
  vm.runInContext(source, context, { filename: 'public/app.js' });

  return {
    context,
    el: (id) => document.getElementById(id),
    run: (code) => vm.runInContext(code, context)
  };
}

module.exports = { loadApp };
