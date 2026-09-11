const EngineAdapter = require('./engine-adapter');

class MockAdapter extends EngineAdapter {
  constructor(cannedResponses = null) {
    super('mock');
    this.cannedResponses = cannedResponses || [
      'Entendido. Comenzando el análisis forense de la marca.',
      'Ejecutando: node scripts/extract_reference_dna.cjs --url https://ejemplo.com',
      'Extracción visual completada. La paleta identificada cumple WCAG 2.2 AAA.'
    ];
    this.delayMs = 15;
  }

  setResponses(responses) {
    this.cannedResponses = responses;
  }

  buildCommandAndArgs({ prompt }) {
    return {
      command: 'mock-agent',
      args: ['--test-mode', prompt]
    };
  }

  spawnTurn({ prompt, onStdout, onExit, onMetrics }) {
    let cancelled = false;
    let timerIndex = 0;

    let responses = this.cannedResponses;
    if (prompt) {
      const lower = prompt.toLowerCase();
      if (lower.includes('modelo') || lower.includes('negocio')) {
        responses = [
          'Entendido. Para adaptar la arquitectura de conversión y los wireflows:',
          'Ejecutando: node scripts/verify_fidelity.cjs --check-models',
          '¿Cuál es el modelo de negocio de tu marca o empresa?'
        ];
      } else if (lower.includes('fidelidad') || lower.includes('referencia')) {
        responses = [
          'Referencias recibidas. Analizando con Playwright:',
          'Ejecutando: node scripts/extract_reference_dna.cjs --url https://ejemplo.com',
          'Paso 1.5.b de 3: ¿Qué nivel de fidelidad deseas aplicar respecto a la referencia proporcionada? [Fidelidad Arquitectónica Total] o Inspiración?'
        ];
      } else if (lower.includes('showcase') || lower.includes('compuerta 1')) {
        responses = [
          'Showcase compilado exitosamente en disco.',
          'Ejecutando: node scripts/verify_fidelity.cjs --state design-system-state.json',
          'Compuerta 1: ¿Apruebas el Design System y los tokens cromáticos para proceder a la construcción del Prototipo interactivo en HTML/CSS/JS?'
        ];
      }
    }

    const interval = setInterval(() => {
      if (cancelled) {
        clearInterval(interval);
        return;
      }

      if (timerIndex < responses.length) {
        const text = responses[timerIndex] + '\n';
        if (onStdout) onStdout(text);
        timerIndex++;
      } else {
        clearInterval(interval);
        if (onMetrics) {
          onMetrics({
            engine: 'mock',
            duration_seconds: 0.045,
            usage: {
              input_tokens: 420,
              output_tokens: 85,
              thinking_tokens: 0,
              cache_read_tokens: 0,
              total_tokens: 505
            }
          });
        }
        if (onExit) onExit(0);
      }
    }, this.delayMs);

    return {
      kill: () => {
        cancelled = true;
        clearInterval(interval);
      }
    };
  }
}

module.exports = MockAdapter;
