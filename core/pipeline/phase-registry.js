/**
 * PhaseRegistry — Facade de compatibilidad hacia el módulo profundo Pipeline (core/pipeline/index.js)
 */
const {
  CANONICAL_PHASES,
  ADVANCED_EXPANSION_PHASES,
  Pipeline,
  PhaseRegistry
} = require('./index');

module.exports = {
  CANONICAL_PHASES,
  ADVANCED_EXPANSION_PHASES,
  Pipeline,
  PhaseRegistry
};
