/**
 * Pipeline — Módulo profundo del Pipeline de Construcción y Compuertas Interactivas
 *
 * Unifica el catálogo de fases (5 canónicas expansibles a 11), compuertas de aprobación,
 * descriptores de pasos interactivos y la detección semántica de acciones en el servidor,
 * eliminando la fuga de expresiones regulares crudas y lógica de dominio hacia el cliente.
 */

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
    deliverables: ['palette', 'typography', 'radii']
  },
  {
    id: 3,
    slug: 'components',
    name: 'Componentes Atómicos',
    description: 'Catálogo de botones, tarjetas, inputs, navegación y estados interactivos.',
    hasFastTrack: false,
    approvalGate: false,
    deliverables: ['component_dna']
  },
  {
    id: 4,
    slug: 'validation',
    name: 'Validación Visual',
    description: 'Generación del Spec MD ([Brand]_Design_System.md) y Showcase interactivo HTML.',
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
    deliverables: ['prototype/index.html', 'prototype/page-2.html', 'prototype/page-3.html']
  }
];

// Homium Site Builder opera estrictamente sobre las 5 fases canónicas
const ADVANCED_EXPANSION_PHASES = [];

const STEP_ACTIONS = [
  // Cierre de Fase 1 — Confirmación para avanzar a Fase 2
  {
    stepId: '1.summary',
    name: 'Confirmación de Fase 1',
    triggerPattern: /(avanzar a la fase 2|avanzar a la fase.*tipo de sitio|información de la fase 1.*correcta|deseas volver a ajustar algún paso anterior|confirmas.*pasar a la fase 2)/i,
    type: 'chips',
    title: '¿Confirmar Fase 1 y avanzar a la Fase 2?',
    options: [
      { label: 'Sí, avanzar a la Fase 2', value: 'La información de la Fase 1 es correcta. Proceder a la Fase 2 (Tipo de Sitio & Arquitectura de Páginas).', icon: 'check' },
      { label: 'Ajustar un paso anterior', value: 'Deseo ajustar un parámetro de la Fase 1 antes de avanzar.', icon: 'edit' }
    ]
  },

  // Cierre de Fase 2 — Confirmación para avanzar a Fase 3
  {
    stepId: '2.summary',
    name: 'Confirmación de Fase 2',
    triggerPattern: /(avanzar a la fase 3|información de la fase 2.*correcta|confirmar.*pasar a la fase 3|proceder.*fase 3)/i,
    type: 'chips',
    title: '¿Confirmar Fase 2 y avanzar a la Fase 3?',
    options: [
      { label: 'Sí, avanzar a la Fase 3', value: 'La información de la Fase 2 es correcta. Proceder a la Fase 3 (Diseño de Componentes).', icon: 'check' },
      { label: 'Ajustar arquitectura de páginas', value: 'Deseo ajustar la estructura de páginas antes de continuar.', icon: 'edit' }
    ]
  },

  // Cierre de Fase 3 — Confirmación para avanzar a Fase 4
  {
    stepId: '3.summary',
    name: 'Confirmación de Fase 3',
    triggerPattern: /(avanzar a la fase 4|información de la fase 3.*correcta|pasar a la fase 4.*validación|compilar.*showcase.*design system|cimientos visuales.*avanzar a la fase 4)/i,
    type: 'chips',
    title: '¿Confirmar y avanzar a la Fase 4 (Validación)?',
    options: [
      { label: 'Sí, generar Showcase (Fase 4)', value: 'Confirmado. Proceder a la Fase 4 para compilar el Showcase HTML y la especificación del Design System.', icon: 'check' },
      { label: 'Ajustar detalles', value: 'Deseo revisar los tokens o detalles antes de avanzar.', icon: 'edit' }
    ]
  },

  // Paso 1.3 — Modelo de Negocio
  {
    stepId: '1.3',
    name: 'Modelo de Negocio',
    triggerPattern: /(cuál es.*modelo (de negocio|comercial)|propuesta de monetización|tipo de negocio|audiencia objetivo y modelo|perfil de clientes.*modelo|selecciona.*modelo (de negocio|comercial)|\?.*(modelo de negocio|modelo comercial|b2c|b2b)|modelo (de negocio|comercial).*marca)/i,
    type: 'chips',
    title: 'Selecciona tu Modelo de Negocio:',
    options: [
      { label: 'B2C (Consumidor)', value: '1. B2C — Venta directa al consumidor', icon: 'shopping-bag' },
      { label: 'B2B (Empresas)', value: '2. B2B — Venta a empresas / corporativo', icon: 'briefcase' },
      { label: 'Marketplace', value: '3. Marketplace — Plataforma multivendedor', icon: 'grid' },
      { label: 'Freemium / SaaS', value: '4. Freemium — Servicio base gratuito con opción Pro', icon: 'zap' },
      { label: 'Servicios / Agencia', value: '5. Servicios Profesionales / Agencia / Consultoría', icon: 'award' },
      { label: 'Personalizado', value: '6. Opción personalizada: ', icon: 'edit' }
    ]
  },

  // Paso 1.4 — Logo / Isotipo
  {
    stepId: '1.4',
    name: 'Logo de la Marca',
    triggerPattern: /(logo existente|isotipo|identidad gráfica del logo|logo tipográfico)/i,
    type: 'chips',
    title: 'Disponibilidad de Logo:',
    options: [
      { label: 'Tengo Logo Existente', value: '1. Tengo un logo existente (proporcionaré el archivo o SVG)', icon: 'image' },
      { label: 'Generar Isotipo SVG Limpio', value: '2. Generar un Isotipo SVG / Logo Tipográfico limpio utilizando las fuentes y colores de la marca', icon: 'sparkles' },
      { label: 'Personalizado', value: '3. Opción personalizada: ', icon: 'edit' }
    ]
  },

  // Paso 1.5.a — Referencias Visuales
  {
    stepId: '1.5.a',
    name: 'Referencias Visuales',
    triggerPattern: /(referencias visuales|sitios web de referencia|enlaces.*referencia|tienes referencias)/i,
    type: 'chips',
    title: 'Referencias Visuales:',
    options: [
      { label: 'Tengo URLs de Referencia', value: '1. Tengo enlaces/URLs de sitios web de referencia', icon: 'link' },
      { label: 'Tengo Imágenes / Moodboard', value: '2. Tengo imágenes / capturas de pantalla / moodboards', icon: 'file-text' },
      { label: 'Sin Referencias (Diseño Original)', value: '3. Sin referencias específicas (diseño original basado en el tipo de negocio)', icon: 'compass' },
      { label: 'Personalizado', value: '4. Opción personalizada: ', icon: 'edit' }
    ]
  },

  // Paso 1.5.b — Nivel de Fidelidad (Bifurcación Fast-Track)
  {
    stepId: '1.5.b',
    name: 'Nivel de Fidelidad',
    triggerPattern: /(nivel de fidelidad|fidelidad arquitectónica total|inspiración conceptual|fast-track)/i,
    type: 'cards',
    title: 'Nivel de Fidelidad respecto a la Referencia:',
    options: [
      {
        label: 'Fidelidad Total (Fast-Track)',
        value: '1. Fidelidad Arquitectónica Total: Replicación Fiel de Estructura y Estética (Recomendado — Modo Fast-Track)',
        description: 'Bloqueo inmutable de arquitectura, paleta real y grilla. Salta Fases 2 y 3 directamente a Validación.',
        badge: 'Recomendado',
        icon: 'zap'
      },
      {
        label: 'Inspiración Conceptual',
        value: '2. Inspiración Conceptual / Vibe',
        description: 'Extrae atmósfera y tipografía pero avanza por el flujo completo de Fases 2 a 5.',
        badge: 'Ruta B',
        icon: 'palette'
      },
      {
        label: 'Quirúrgica / Personalizada',
        value: '3. Personalizada / Quirúrgica',
        description: 'Especificar manualmente qué dimensiones calcar y cuáles diseñar a medida.',
        badge: 'Avanzado',
        icon: 'tool'
      }
    ]
  },

  // Compuerta de Aprobación 1 (Fase 4 - Showcase Validado para avanzar a Fase 5)
  {
    stepId: 'gate-1',
    name: 'Compuerta 1: Validación de Design System',
    triggerPattern: /(compuerta.*1|showcase.*listo.*apruebas|apruebas.*(?:el\s+)?design system.*(?:para|y)?.*(?:proceder|avanzar|construir).*(?:fase 5|prototipo)|proceder.*(?:a la\s+)?fase 5|avanzar.*(?:a la\s+)?fase 5|construir.*prototipo.*fase 5)/i,
    type: 'gate',
    title: 'Compuerta 1: Aprobación del Design System',
    description: 'El Showcase HTML del Design System está listo para revisión en la pestaña "Showcase".',
    options: [
      { label: 'Aprobar y Construir Prototipo (Fase 5)', value: 'Aprobado. La paleta, tipografía y tokens son correctos. Procede con la Fase 5 para construir el prototipo de 3 pantallas.', variant: 'primary', icon: 'check' },
      { label: 'Solicitar Ajustes de Tokens', value: 'Deseo realizar ajustes en los tokens antes de proceder.', variant: 'ghost', icon: 'edit' }
    ]
  },

  // Compuerta de Aprobación 2 (Fase 5 - Prototipo Final)
  {
    stepId: 'gate-2',
    name: 'Compuerta 2: Aprobación del Prototipo',
    triggerPattern: /(compuerta.*2|apruebas el prototipo|entregable final|prototipo interactivo de 3 pantallas)/i,
    type: 'gate',
    title: 'Compuerta 2: Aprobación del Prototipo Final',
    description: 'Las 3 pantallas interactivas han sido compiladas en prototype/ y verificadas.',
    options: [
      { label: 'Aprobar Prototipo Definitivo', value: 'Prototipo aprobado con éxito. Excelente trabajo arquitectónico.', variant: 'primary', icon: 'check' },
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
  detectAction(agentText) {
    if (!agentText || typeof agentText !== 'string') return null;

    // Eliminar filas de tablas markdown (e.g. | Parámetro | Valor |) para no provocar falsos positivos
    // al resumir selecciones de pasos previos
    const nonTableText = agentText.replace(/^\s*\|.*\|.*$/gm, '');

    // 1. Primero evaluamos contra el texto limpio sin tablas (prioridad para preguntas activas y transiciones)
    for (const step of STEP_ACTIONS) {
      if (step.triggerPattern && step.triggerPattern.test(nonTableText)) {
        return sanitizeStep(step);
      }
    }

    // 2. Fallback al texto completo si no hubo match en el texto sin tablas
    for (const step of STEP_ACTIONS) {
      if (step.triggerPattern && step.triggerPattern.test(agentText)) {
        return sanitizeStep(step);
      }
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
  static detectAction(agentText) {
    if (!agentText || typeof agentText !== 'string') return null;
    const nonTableText = agentText.replace(/^\s*\|.*\|.*$/gm, '');
    for (const step of STEP_ACTIONS) {
      if (step.triggerPattern && step.triggerPattern.test(nonTableText)) {
        return sanitizeStep(step);
      }
    }
    for (const step of STEP_ACTIONS) {
      if (step.triggerPattern && step.triggerPattern.test(agentText)) {
        return sanitizeStep(step);
      }
    }
    return null;
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
