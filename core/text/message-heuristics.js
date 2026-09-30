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
    // saludos y cortesía
    'hola', 'buenas', 'gracias',
    // inglés
    'what', 'how', 'why', 'who', 'when', 'where', 'tell', 'write', 'give', 'explain', 'ignore', 'show', 'please', 'hello'
  ]);

  // Palabras funcionales que jamás son un nombre de marca
  const FUNCTION_WORDS = new Set([
    'a', 'al', 'con', 'de', 'del', 'el', 'en', 'es', 'la', 'las', 'lo', 'los', 'mi', 'o', 'para', 'por', 'que', 'se',
    'si', 'su', 'sus', 'tu', 'un', 'una', 'y', 'the', 'of', 'and', 'to'
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
   * ¿Parece la respuesta a "¿cómo se llama tu marca?": corta, una línea, con letras y sin forma de pedido?
   */
  function isPlausibleBrandAnswer(text) {
    const clean = String(text || '').trim();
    if (clean.length < 2 || clean.length > 50) return false;
    if (/[\r\n]/.test(clean)) return false;
    if (!/\p{L}/u.test(clean)) return false;
    if (clean.split(/\s+/).length > 4) return false;
    return !isRequestOrQuestion(clean);
  }

  /**
   * ¿La respuesta del agente es un paso del flujo (trae un título de Etapa o Fase) y no un simple desvío?
   */
  function isFlowMessage(text) {
    return /(?:Etapa|Fase)\s+\d/i.test(String(text || ''));
  }

  return { isRequestOrQuestion, isPlausibleBrandAnswer, isFlowMessage, normalize, FUNCTION_WORDS };
});
