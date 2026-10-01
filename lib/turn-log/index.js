const fs = require('fs');
const path = require('path');

/**
 * Registro de turnos del agente: una línea JSON por turno en <proyecto>/turns.jsonl.
 * Guarda métricas (motor, duración, desenlace, reintentos, tamaños, error), nunca el contenido de la conversación.
 * Sirve para diagnosticar turnos lentos o fallidos sin reproducir el comando a mano.
 */

const LOG_FILE = 'turns.jsonl';
const MAX_BYTES = 1024 * 1024; // al superar 1 MB se conserva solo la mitad más reciente

function logPath(dir) {
  return path.join(dir, LOG_FILE);
}

function appendTurnLog(dir, record) {
  if (!dir) return;
  try {
    fs.mkdirSync(dir, { recursive: true });
    const file = logPath(dir);
    fs.appendFileSync(file, JSON.stringify(record) + '\n');
    if (fs.statSync(file).size > MAX_BYTES) {
      const lines = fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean);
      fs.writeFileSync(file, lines.slice(Math.floor(lines.length / 2)).join('\n') + '\n');
    }
  } catch (err) {
    console.warn('[TurnLog] No se pudo escribir turns.jsonl:', err.message);
  }
}

/** Últimos `limit` turnos (más recientes al final); las líneas ilegibles se ignoran. */
function readTurnLog(dir, limit = 100) {
  try {
    const turns = [];
    for (const line of fs.readFileSync(logPath(dir), 'utf-8').split('\n')) {
      if (!line) continue;
      try { turns.push(JSON.parse(line)); } catch (e) { /* línea cortada por una escritura interrumpida */ }
    }
    return turns.slice(-Math.max(1, limit));
  } catch (err) {
    return [];
  }
}

module.exports = { appendTurnLog, readTurnLog, LOG_FILE };
