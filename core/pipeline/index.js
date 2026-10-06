/**
 * Pipeline — Módulo profundo del Pipeline de Construcción y Compuertas Interactivas
 *
 * Unifica el catálogo de las 5 fases canónicas, las compuertas de aprobación y su detección en el servidor,
 * eliminando la fuga de expresiones regulares crudas y lógica de dominio hacia el cliente.
 *
 * Solo las compuertas se detectan en el servidor. Las opciones numeradas de cada pregunta las escribe el propio
 * agente en su respuesta y el cliente las muestra tal cual, por lo que no hay descriptores fijos que puedan
 * desincronizarse del texto.
 */

const MessageHeuristics = require('../text/message-heuristics');

const CANONICAL_PHASES = [
  {
    id: 1,
    slug: 'discovery',
    name: 'Discovery & Marca',
    description: 'Nombre, propósito, modelo de negocio, referencias y extracción forense con Fast-Track.',
    hasFastTrack: true,
    approvalGate: false,
    deliverables: ['design-system-state.json']
  },
  {
    id: 2,
    slug: 'foundations',
    name: 'Foundations Visuales',
    description: 'Paleta cromática WCAG 2.2 AAA (HCT), tipografía display/UI, personalidad y modo oscuro.',
    hasFastTrack: false,
    approvalGate: false,
    deliverables: ['palette', 'typography', 'border_radius']
  },
  {
    id: 3,
    slug: 'components',
    name: 'Componentes Atómicos',
    description: 'Catálogo de botones, tarjetas, inputs, navegación y estados interactivos.',
    hasFastTrack: false,
    approvalGate: false,
    deliverables: ['components']
  },
  {
    id: 4,
    slug: 'validation',
    name: 'Validación Visual',
    description: 'Generación del Spec MD ([Brand]_Design_System.md) y Design System interactivo HTML.',
    hasFastTrack: false,
    approvalGate: true,
    gateTitle: 'Compuerta 1: Validación del Design System',
    gatePrompt: '¿Apruebas el Design System y los tokens cromáticos para proceder a la construcción del Prototipo interactivo en HTML/CSS/JS?',
    deliverables: ['[Brand]_Design_System.md', '[Brand]_Design_System.html']
  },
  {
    id: 5,
    slug: 'prototype',
    name: 'Prototipo Interactivo',
    description: 'Construcción dinámica de 3 pantallas en HTML/CSS/JS guiadas por el structural_blueprint.',
    hasFastTrack: false,
    approvalGate: true,
    gateTitle: 'Compuerta 2: Aprobación del Prototipo Final',
    gatePrompt: '¿Apruebas el Prototipo interactivo de 3 pantallas generado en prototype/?',
    deliverables: ['prototype/index.html']
  }
];

// Homium Site Builder opera estrictamente sobre las 5 fases canónicas
const ADVANCED_EXPANSION_PHASES = [];

const STEP_ACTIONS = [
  // Compuerta de Aprobación 1 (Fase 4 - Design System Validado para avanzar a Fase 5)
  {
    stepId: 'gate-1',
    name: 'Compuerta 1: Validación de Design System',
    type: 'gate',
    title: 'Compuerta 1: Aprobación del Design System',
    description: 'El Design System HTML está listo para revisión en la pestaña "Design System".',
    options: [
      { label: 'Aprobar y Construir Prototipo (Fase 5)', value: 'Aprobado. La paleta, tipografía y tokens son correctos. Procede con la Fase 5 para construir el prototipo de 3 pantallas.', variant: 'primary', icon: 'check' },
      { label: 'Solicitar Ajustes de Tokens', value: 'Deseo realizar ajustes en los tokens antes de proceder.', variant: 'ghost', icon: 'edit' }
    ]
  },

  // Compuerta de Aprobación 2 (Fase 5 - Prototipo Final)
  {
    stepId: 'gate-2',
    name: 'Compuerta 2: Aprobación del Prototipo',
    type: 'gate',
    title: 'Compuerta 2: Aprobación del Prototipo Final',
    description: 'Las 3 pantallas interactivas han sido compiladas en prototype/ y verificadas.',
    options: [
      { label: 'Aprobar Prototipo Definitivo', value: 'Prototipo aprobado con éxito. Proceder con el cierre del proyecto.', variant: 'primary', icon: 'check' },
      { label: 'Solicitar Refinamiento', value: 'Deseo solicitar un refinamiento en las pantallas.', variant: 'ghost', icon: 'edit' }
    ]
  }
];

/**
 * Sanitiza un descriptor de acción para eliminar expresiones regulares u objetos no serializables
 * antes de enviarlo por JSON o SSE hacia los clientes.
 */
function sanitizeStep(step) {
  if (!step) return null;
  const { triggerPattern, ...safeProps } = step;
  return {
    ...safeProps,
    options: (step.options || []).map(opt => ({ ...opt }))
  };
}

/**
 * Tramo vigente de una respuesta: lo que sigue al último separador horizontal (---).
 * Por formato canónico, el feedback de cierre y cualquier explicación ajena van antes del separador.
 */
function scopeToCurrentStep(agentText) {
  const parts = agentText.split(/^\s*-{3,}\s*$/m);
  const tail = parts[parts.length - 1];
  return tail.trim() ? tail : agentText;
}

/**
 * Texto en minúsculas, sin acentos ni marcas de énfasis Markdown, y sin las partes del mensaje que repiten
 * decisiones previas: el bloque Blueprint acumulativo (citas ">") y las filas de tablas de resumen.
 */
function prepareForDetection(text) {
  return MessageHeuristics.normalize(
    String(text)
      .replace(/^\s*>.*$/gm, '')
      .replace(/^\s*\|.*\|.*$/gm, '')
      .replace(/[*_`]+/g, '')
  );
}

/**
 * Última pregunta del texto (de "¿" a "?"); sin signo de apertura, desde el salto de línea anterior.
 */
function lastQuestion(normalizedText) {
  const closeIdx = normalizedText.lastIndexOf('?');
  if (closeIdx === -1) return null;
  const before = normalizedText.slice(0, closeIdx);
  const openIdx = before.lastIndexOf('¿');
  const lineIdx = before.lastIndexOf('\n');
  const startIdx = openIdx !== -1 && openIdx > lineIdx - 400 ? openIdx : lineIdx + 1;
  return normalizedText.slice(Math.max(startIdx, 0), closeIdx + 1);
}

// Verbos de aprobación explícita. "confirmas" (cierres de fase) no cuenta: no son compuertas.
const STRONG_APPROVAL = /\b(apruebas|apruebes|aprueba|aprobar|apruebe|aprobacion)\b/;
const SOFT_APPROVAL = /\b(conforme|de acuerdo|visto bueno)\b/;
const FORWARD_TO_PROTOTYPE = /(proceder|avanzar|pasar|construir|construccion|iniciar|generar|continuar|seguir).{0,60}(fase 5|prototipo)/;
// Cierre de la Fase 3 hacia la Fase 4: nombra el Design System como lo que se construirá, no como algo listo para revisar
const FORWARD_TO_VALIDATION = /(proceder|avanzar|pasar|iniciar|continuar|seguir).{0,60}(fase 4|validacion visual)/;

/**
 * Clasifica la pregunta de aprobación en compuerta 1 (Design System -> construir prototipo) o compuerta 2
 * (prototipo terminado). Solo una pregunta cuenta: nombrar el Design System o el prototipo en
 * prosa, o una compuerta ya aprobada, no abre ninguna.
 */
function classifyGateQuestion(question, tail) {
  const isApproval = STRONG_APPROVAL.test(question) || SOFT_APPROVAL.test(question);
  if (!isApproval) return null;

  if (/compuerta\s*(?:n\S*\s*)?2\b/.test(question)) return 'gate-2';
  if (/compuerta\s*(?:n\S*\s*)?1\b/.test(question)) return 'gate-1';

  const strong = STRONG_APPROVAL.test(question);
  const forward = FORWARD_TO_PROTOTYPE.test(question);
  // "¿Apruebas el catálogo para avanzar a la Fase 4 ... Design System?" es la confirmación de la Fase 3, no la compuerta 1
  if (!forward && FORWARD_TO_VALIDATION.test(question)) return null;
  if (strong && /(prototipo|prototype|pantallas)/.test(question) && !forward) return 'gate-2';
  if (forward || (strong && /(design system|sistema de diseno)/.test(question))) return 'gate-1';

  // Sin pistas en la pregunta: el encabezado "Compuerta N" inmediatamente anterior decide
  const heading = tail.match(/compuerta\s*(?:n\S*\s*)?([12])\b[^?]*$/);
  if (heading) return heading[1] === '2' ? 'gate-2' : 'gate-1';
  return null;
}

/**
 * Detecta si el tramo vigente de la respuesta abre una compuerta de aprobación.
 */
function detectGate(agentText) {
  const tail = prepareForDetection(scopeToCurrentStep(agentText));
  const question = lastQuestion(tail);
  if (!question) return null;
  const gateId = classifyGateQuestion(question, tail);
  if (!gateId) return null;
  const step = STEP_ACTIONS.find(candidate => candidate.stepId === gateId);
  return step ? sanitizeStep(step) : null;
}

class Pipeline {
  constructor({ enableExpansion = false } = {}) {
    this.enableExpansion = enableExpansion;
    this._phases = [...CANONICAL_PHASES];

    if (enableExpansion) {
      this._phases.push(...ADVANCED_EXPANSION_PHASES);
    }
  }

  get isExpanded() {
    return this.enableExpansion;
  }

  /**
   * Retorna las fases activas del pipeline
   * @returns {Array<Object>}
   */
  getPhases() {
    return this._phases.map(p => ({ ...p }));
  }

  /**
   * Alias de compatibilidad para PhaseRegistry.getActivePhases()
   */
  getActivePhases() {
    return this.getPhases();
  }

  /**
   * Busca una fase por su ID numérico
   * @param {number|string} id
   * @returns {Object|null}
   */
  getPhaseById(id) {
    const numId = Number(id);
    const phase = this._phases.find(p => p.id === numId);
    return phase ? { ...phase } : null;
  }

  /**
   * Busca una fase por su slug canónico
   * @param {string} slug
   * @returns {Object|null}
   */
  getPhaseBySlug(slug) {
    const phase = this._phases.find(p => p.slug === slug);
    return phase ? { ...phase } : null;
  }

  /**
   * Mantiene el pipeline estrictamente confinado a las 5 fases canónicas
   * @param {boolean} [enable]
   * @returns {Array<Object>}
   */
  enableAdvancedPhases(enable = false) {
    this.enableExpansion = false;
    this._phases = [...CANONICAL_PHASES];
    return this.getPhases();
  }

  /**
   * Evalúa un texto (usualmente la respuesta del agente) contra los patrones de pasos y compuertas.
   * La evaluación ocurre completamente en el servidor, retornando un descriptor sanitizado y serializable.
   *
   * @param {string} agentText
   * @returns {Object|null}
   */
  detectAction(agentText, { userMessage = '' } = {}) {
    if (!agentText || typeof agentText !== 'string') return null;

    // Turno desviado (pregunta, pedido o charla del usuario): la respuesta suele traer una explicación ajena
    // que nombra términos del flujo (design system, prototipo...). Solo cuenta el tramo final tras el último
    // separador, y únicamente si es un paso del flujo (título de Etapa/Fase) que repite la pregunta pendiente.
    if (userMessage && MessageHeuristics.isRequestOrQuestion(userMessage)) {
      if (!MessageHeuristics.isFlowMessage(scopeToCurrentStep(agentText))) return null;
    }

    return detectGate(agentText);
  }

  /**
   * ¿Existe en disco el entregable que la compuerta pide revisar? La compuerta 1 revisa el Design System y la 2 el
   * prototipo: sin ellos la compuerta sería un falso positivo (p. ej. una confirmación de fase redactada como
   * aprobación) y aprobarla saltaría la fase que construye ese entregable. Lo que no es compuerta pasa tal cual.
   *
   * @param {Object|null} action Descriptor devuelto por detectAction / guardado en el historial
   * @param {{ designSystemExists?: boolean, prototypeExists?: boolean }} status Estado de entregables en disco
   * @returns {boolean}
   */
  isGateReady(action, status) {
    if (!action || action.type !== 'gate') return true;
    const s = status || {};
    if (action.stepId === 'gate-1') return Boolean(s.designSystemExists);
    if (action.stepId === 'gate-2') return Boolean(s.prototypeExists);
    return true;
  }

  /**
   * ¿El mensaje del usuario responde a una compuerta? Reconoce el valor exacto de los botones del gate
   * (aprobar / solicitar ajustes) y, si hay una compuerta pendiente, un "Aprobado" escrito a mano.
   *
   * @param {string} message
   * @param {Object} [options]
   * @param {string|null} [options.pendingGateId] Compuerta abierta en el último mensaje del agente
   * @returns {{ gateId: string, approved: boolean } | null}
   */
  matchGateResponse(message, { pendingGateId = null } = {}) {
    if (!message || typeof message !== 'string') return null;
    const normalized = MessageHeuristics.normalize(message);
    for (const gate of STEP_ACTIONS) {
      const [approve, adjust] = gate.options;
      if (approve && MessageHeuristics.normalize(approve.value) === normalized) return { gateId: gate.stepId, approved: true };
      if (adjust && MessageHeuristics.normalize(adjust.value) === normalized) return { gateId: gate.stepId, approved: false };
    }
    if (pendingGateId && /^(aprobado|apruebo|aprobar)\b/.test(normalized)) {
      return { gateId: pendingGateId, approved: true };
    }
    return null;
  }

  /**
   * Retorna todos los descriptores de pasos sanitizados para consumo por API
   * @returns {Array<Object>}
   */
  getAllSteps() {
    return STEP_ACTIONS.map(sanitizeStep);
  }

  /**
   * Retorna la información sanitizada de una compuerta específica
   * @param {string} gateId e.g. 'gate-1' | 'gate-2'
   * @returns {Object|null}
   */
  getGate(gateId) {
    const step = STEP_ACTIONS.find(s => s.stepId === gateId);
    return step ? sanitizeStep(step) : null;
  }
}

/**
 * Adaptador de retrocompatibilidad para PhaseRegistry
 */
class PhaseRegistry extends Pipeline {}

/**
 * Adaptador de retrocompatibilidad para PhaseDescriptors
 */
class PhaseDescriptors {
  static detectAction(agentText, options = {}) {
    return new Pipeline().detectAction(agentText, options);
  }

  static getAllSteps() {
    return STEP_ACTIONS.map(sanitizeStep);
  }
}

module.exports = {
  CANONICAL_PHASES,
  ADVANCED_EXPANSION_PHASES,
  STEP_ACTIONS,
  Pipeline,
  PhaseRegistry,
  PhaseDescriptors
};
