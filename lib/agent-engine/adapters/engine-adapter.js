/**
 * EngineAdapter — Base Interface / Seam
 * Define el contrato estándar para cualquier adaptador de ejecución de agentes.
 */
class EngineAdapter {
  constructor(name) {
    if (this.constructor === EngineAdapter) {
      throw new Error('EngineAdapter es una clase abstracta y no puede instanciarse directamente.');
    }
    this.name = name;
  }

  /**
   * Genera el comando y argumentos correspondientes al turno.
   * @param {Object} params
   * @param {string} params.prompt
   * @param {Object} params.session
   * @param {boolean} params.isFirstTurn
   * @returns {{ command: string, args: string[] }}
   */
  buildCommandAndArgs({ prompt, session, isFirstTurn }) {
    throw new Error('El método buildCommandAndArgs debe ser implementado por la subclase.');
  }

  /**
   * Ejecuta el turno y retorna un manejador con capacidad de terminación (kill).
   * @param {Object} params
   * @param {string} params.prompt
   * @param {Object} params.session
   * @param {boolean} params.isFirstTurn
   * @param {string} params.cwd
   * @param {Function} params.onStdout
   * @param {Function} params.onStderr
   * @param {Function} params.onExit
   * @param {Function} params.onError
   * @returns {{ kill: Function }}
   */
  spawnTurn(params) {
    throw new Error('El método spawnTurn debe ser implementado por la subclase.');
  }
}

module.exports = EngineAdapter;
