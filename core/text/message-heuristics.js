/**
 * MessageHeuristics — Clasificación barata de mensajes del usuario (servidor y navegador).
 *
 * Módulo UMD: lo consumen `Workspace.extractProjectName` (Node) y `inspectUserMessageForState`
 * (navegador, servido en /message-heuristics.js). Sirve para no inferir marca, proyecto ni
 * decisiones del Blueprint a partir de preguntas, pedidos o mensajes sin relación con el flujo.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MessageHeuristics = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  function normalize(text) {
    return String(text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .trim();
  }

  // Primera palabra que delata una pregunta, un pedido o conversación, nunca un nombre de marca
  const LEADING_NON_BRAND = new Set([
    // interrogativos
    'que', 'como', 'cual', 'cuales', 'cuanto', 'cuanta', 'cuantos', 'cuantas', 'donde', 'cuando', 'quien', 'quienes', 'por',
    // pedidos e imperativos
    'dame', 'dime', 'escribe', 'escribeme', 'cuentame', 'explicame', 'hazme', 'haz', 'genera', 'generame', 'redacta',
    'traduce', 'calcula', 'resume', 'resumeme', 'ayudame', 'muestrame', 'recomiendame', 'busca', 'pon', 'ignora', 'olvida',
    'necesito', 'quiero', 'puedes', 'podrias', 'podria', 'me',
    'crear', 'crea', 'creame', 'cambia', 'cambiar', 'modifica', 'ajusta', 'vuelve', 'volver', 'regresa', 'reinicia',
    'disena', 'construye', 'hacer', 'armar', 'arma',
    // intenciones y descripciones en primera persona
    'quisiera', 'tengo', 'busco', 'queremos', 'necesitamos', 'tenemos', 'somos', 'soy',
    // saludos y cortesía
    'hola', 'buenas', 'buenos', 'buen', 'gracias', 'saludos',
    // inglés
    'what', 'how', 'why', 'who', 'when', 'where', 'tell', 'write', 'give', 'explain', 'ignore', 'show', 'please', 'hello',
    'hi', 'hey', 'can', 'could', 'i', 'we', 'my', 'create', 'build', 'make', 'need', 'want', 'help', 'let', 'lets', 'start'
  ]);

  // Respuestas de comando, afirmación o conversación que JAMÁS son un nombre de marca
  const COMMAND_WORDS = new Set([
    'si', 'no', 'nop', 'nada', 'claro', 'exacto', 'continua', 'continuar', 'continuemos', 'adelante', 'siguiente', 'seguir',
    'dale', 'ok', 'okay', 'listo', 'avanza', 'avanzar', 'avancemos', 'reanudar', 'hola', 'buenas', 'gracias', 'perfecto',
    'proceder', 'procede', 'ya', 'vale', 'bien', 'bueno', 'correcto', 'entendido', 'aprobado', 'apruebo', 'confirmo',
    'confirmado', 'reiniciar', 'cancelar', 'ayuda', 'help', 'start', 'next', 'continue', 'yes', 'empezar', 'empecemos',
    'empieza', 'comenzar', 'comencemos', 'comienza', 'inicia', 'iniciar'
  ]);

  // Palabras funcionales que jamás son un nombre de marca
  const FUNCTION_WORDS = new Set([
    'a', 'al', 'con', 'de', 'del', 'el', 'en', 'es', 'la', 'las', 'lo', 'los', 'mi', 'o', 'para', 'por', 'que', 'se',
    'si', 'su', 'sus', 'tu', 'un', 'una', 'y', 'the', 'of', 'and', 'to'
  ]);

  // Sustantivos genéricos que acompañan a "marca/empresa/proyecto/sitio" pero no son el nombre
  const GENERIC_NOUNS = new Set([
    'web', 'website', 'sitio', 'pagina', 'proyecto', 'nuevo', 'nueva', 'propia', 'propio', 'digital', 'online', 'app',
    'http', 'https', 'www', 'llamada', 'llamado'
  ]);

  const INJECTION_PATTERN = /ignor[ae]\s+(?:todas?\s+)?(?:tus|las|mis|sus)\s+instrucciones|ignore\s+(?:all\s+)?(?:previous|prior|your)\s+instructions|olvida\s+(?:todo|tus\s+instrucciones)/i;

  /**
   * ¿Es una pregunta, un pedido, un saludo o un intento de desviar/inyectar al agente?
   */
  function isRequestOrQuestion(text) {
    const clean = String(text || '').trim();
    if (!clean) return false;
    if (/[?¿]/.test(clean)) return true;
    if (INJECTION_PATTERN.test(clean)) return true;
    const firstWord = normalize(clean).split(/\s+/)[0].replace(/[^a-z0-9]/g, '');
    return LEADING_NON_BRAND.has(firstWord);
  }

  /**
   * ¿El mensaje es solo una palabra de comando o confirmación ("sí", "continuar", "no sé"...)?
   * Todas sus palabras deben ser de comando o funcionales.
   */
  function isCommandAnswer(text) {
    const words = normalize(text).split(/[\s,;.!]+/).map(w => w.replace(/[^a-z0-9]/g, '')).filter(Boolean);
    if (words.length === 0) return false;
    return words.every(w => COMMAND_WORDS.has(w) || FUNCTION_WORDS.has(w) || w === 'se' || w === 'lo');
  }

  /**
   * ¿Parece la respuesta a "¿cómo se llama tu marca?": corta, una línea, con letras y sin forma de pedido?
   */
  function isPlausibleBrandAnswer(text) {
    const clean = String(text || '').trim();
    if (clean.length < 2 || clean.length > 50) return false;
    if (/[\r\n]/.test(clean)) return false;
    if (!/\p{L}/u.test(clean)) return false;
    const words = clean.split(/\s+/);
    if (words.length > 4) return false;
    if (isRequestOrQuestion(clean)) return false;
    // Ninguna palabra puede ser un comando ("no sé", "sí avancemos") ni un genérico de conversación
    return !words.some(w => COMMAND_WORDS.has(normalize(w).replace(/[^a-z0-9]/g, '')));
  }

  /**
   * ¿La respuesta del agente es un paso del flujo?  Lo es si trae un título de Etapa o Fase (1 a 5) al inicio
   * de una línea (encabezado Markdown o negrita), no una mención dentro de una frase ("estamos en la Fase 2")
   * ni una Fase inexistente ("no puedo abrir una Fase 6").
   */
  function isFlowMessage(text) {
    return /^[ \t]{0,3}(?:#{1,6}[ \t]*|\*{2}[ \t]*)?(?:Etapa|Fase)[ \t]+[1-5](?![0-9])/im.test(String(text || ''));
  }

  return {
    isRequestOrQuestion,
    isCommandAnswer,
    isPlausibleBrandAnswer,
    isFlowMessage,
    normalize,
    FUNCTION_WORDS,
    COMMAND_WORDS,
    GENERIC_NOUNS,
    LEADING_NON_BRAND
  };
});
