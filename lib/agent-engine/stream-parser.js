/**
 * StreamParser — Sanitización y clasificación tipada de flujos de salida CLI
 */

// Regex para eliminar secuencias de control y color ANSI
const ANSI_REGEX = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;

// Palabras clave que denotan actividad de herramientas / scripts / entorno
const TOOL_PATTERNS = [
  /\bnode\s+[\w\-./]+\.cjs\b/i,
  /\bextract_reference_dna\b/i,
  /\bPlaywright\s+browser\b/i,
  /\bWriting\s+state\s+to\b/i,
  /\bGenerated\s+prototype\b/i,
  /\bmise\s+.*tools:/i,
  /^>\s*build\s*·/i
];

class StreamParser {
  /**
   * Elimina códigos de escape ANSI de una cadena
   * @param {string} text
   * @returns {string}
   */
  static stripAnsi(text) {
    if (!text) return '';
    return text.replace(ANSI_REGEX, '');
  }

  /**
   * Elimina mensajes de inicialización de herramientas del sistema (ej. mise)
   * @param {string} text
   * @returns {string}
   */
  static stripPreamble(text) {
    if (!text) return '';
    return text.replace(/^mise\s+.*?tools:.*?$/gmi, '').trimStart();
  }

  /**
   * Clasifica si un fragmento de texto representa la ejecución de una herramienta o diálogo conversacional
   * @param {string} cleanText
   * @returns {'tool_activity' | 'text_delta'}
   */
  static classifyChunk(cleanText) {
    if (!cleanText) return 'text_delta';
    const isTool = TOOL_PATTERNS.some(regex => regex.test(cleanText));
    return isTool ? 'tool_activity' : 'text_delta';
  }

  /**
   * Parsea un fragmento crudo y produce un evento tipado estructurado
   * @param {string} rawText
   * @param {'stdout' | 'stderr'} streamType
   * @returns {{ type: 'text_delta' | 'tool_activity' | 'log', text: string, raw: string }}
   */
  static parse(rawText, streamType = 'stdout') {
    let cleanText = StreamParser.stripAnsi(rawText);
    let eventType = streamType === 'stderr'
      ? 'log'
      : StreamParser.classifyChunk(cleanText);

    if (eventType === 'text_delta') {
      cleanText = StreamParser.stripPreamble(cleanText);
      if (!cleanText.trim() && rawText.trim()) {
        eventType = 'tool_activity';
      }
    }

    return {
      type: eventType,
      text: cleanText,
      raw: rawText
    };
  }
}

module.exports = StreamParser;
