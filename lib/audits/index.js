const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Auditorías mecánicas de las compuertas.
 *
 * Al abrir una compuerta el servidor ejecuta él mismo los scripts de verificación sobre lo que hay en disco
 * y adjunta el resultado real a la compuerta, en lugar de fiarse del resumen que escribió el agente.
 * Los scripts se lanzan sin shell, desde la carpeta del proyecto y con un tiempo máximo.
 */

const SCRIPTS_DIR = path.join(__dirname, '..', '..', 'scripts');
const STATE_FILE = 'design-system-state.json';
const SCRIPT_TIMEOUT_MS = 15000;

function runScript(script, args, cwd) {
  return spawnSync(process.execPath, [path.join(SCRIPTS_DIR, script), ...args], {
    cwd,
    encoding: 'utf-8',
    timeout: SCRIPT_TIMEOUT_MS,
    windowsHide: true
  });
}

function statusOf(errors, warnings) {
  if (errors.length > 0) return 'fail';
  return warnings.length > 0 ? 'warn' : 'pass';
}

// El script no llegó a auditar (no arrancó, excedió el tiempo o salió con un código inesperado)
function executionError(id, label, result) {
  const detail = result.error
    ? result.error.message
    : `terminó con código ${result.status}${result.stderr ? `: ${String(result.stderr).trim().slice(0, 200)}` : ''}`;
  return { id, label, status: 'error', errors: [`No se pudo ejecutar la auditoría (${detail}).`], warnings: [] };
}

/**
 * audit_design_system.cjs / audit_spec.cjs imprimen "⚠️ ADVERTENCIAS (n)" y "❌ ERRORES CRÍTICOS (n)"
 * seguidos de líneas "   - texto".
 */
function parseTextAudit(stdout) {
  const errors = [];
  const warnings = [];
  let bucket = null;
  for (const line of String(stdout).split('\n')) {
    if (/^\s*⚠/.test(line)) bucket = warnings;
    else if (/^\s*❌/.test(line)) bucket = errors;
    else if (/^\s+-\s+/.test(line) && bucket) bucket.push(line.replace(/^\s+-\s+/, '').trim());
    else if (line.trim() !== '') bucket = null;
  }
  return { errors, warnings };
}

function textAudit(id, label, script, args, cwd) {
  const result = runScript(script, args, cwd);
  if (result.error || (result.status !== 0 && result.status !== 1)) return executionError(id, label, result);
  const { errors, warnings } = parseTextAudit(result.stdout);
  // Código 1 sin errores legibles: se conserva como error para no marcar "aprobado" un fallo
  if (result.status === 1 && errors.length === 0) errors.push('La auditoría falló sin detallar el motivo.');
  return { id, label, status: statusOf(errors, warnings), errors, warnings };
}

/** verify_fidelity.cjs imprime banners "[Verify]" y un JSON; sale con 1 si hay violaciones críticas. */
function fidelityAudit(id, label, args, cwd) {
  const result = runScript('verify_fidelity.cjs', args, cwd);
  if (result.error || (result.status !== 0 && result.status !== 1)) return executionError(id, label, result);

  const out = String(result.stdout);
  let report = null;
  try {
    report = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1));
  } catch (e) {
    return executionError(id, label, { status: result.status, stderr: 'salida no interpretable' });
  }

  const errors = [];
  for (const check of Object.values(report.checks || {})) {
    if (!check || !Array.isArray(check.violations)) continue;
    for (const v of check.violations) {
      errors.push(typeof v === 'string' ? v : `${v.file || ''}${v.line ? `:${v.line}` : ''} ${v.token || ''}${v.resolved_hex ? ` (${v.resolved_hex})` : ''}`.trim());
    }
  }
  if (result.status === 1 && errors.length === 0) errors.push('La verificación de fidelidad falló sin detallar el motivo.');
  return { id, label, status: statusOf(errors, []), errors, warnings: [] };
}

/**
 * fidelity_report.cjs imprime un JSON { mode, items, coverage, verify }. Es solo informativo: si no se puede
 * ejecutar o interpretar devuelve null y el gate se muestra igual, sin informe.
 */
function fidelityReport(cwd) {
  const result = runScript('fidelity_report.cjs', ['--dir', 'prototype', '--state', STATE_FILE], cwd);
  if (result.error || result.status !== 0) return null;
  try {
    const report = JSON.parse(String(result.stdout));
    if (!report || !Array.isArray(report.items)) return null;
    return { mode: report.mode || null, items: report.items, coverage: report.coverage || { available: false }, verify: report.verify || null };
  } catch (e) {
    return null;
  }
}

/**
 * @param {string} gateId 'gate-1' (Design System + especificación) | 'gate-2' (prototipo)
 * @param {string} dir Carpeta del proyecto
 * @returns {{ checks: Array<{id, label, status, errors: string[], warnings: string[]}>, summary: { fail: number, warn: number }, ranAt: number, fidelity?: { mode, items: Array<{kind, title, reason, instead?}>, coverage, verify } } | null}
 */
function runGateAudits(gateId, dir) {
  if (!dir || !fs.existsSync(dir)) return null;

  let files = [];
  try { files = fs.readdirSync(dir); } catch (e) { return null; }
  const hasState = files.includes(STATE_FILE);
  const stateArgs = hasState ? ['--state', STATE_FILE] : [];
  const checks = [];
  let fidelity = null;

  if (gateId === 'gate-1') {
    const designSystem = files.find(f => f.endsWith('_Design_System.html'));
    const spec = files.find(f => f.endsWith('_Design_System.md'));
    if (designSystem) {
      checks.push(textAudit('design-system', 'Design System HTML', 'audit_design_system.cjs', [designSystem], dir));
    }
    if (spec) {
      checks.push(textAudit('spec', 'Especificación (.md)', 'audit_spec.cjs', [spec, ...stateArgs], dir));
    } else {
      checks.push({ id: 'spec', label: 'Especificación (.md)', status: 'fail', errors: ['No se encontró [Marca]_Design_System.md en el proyecto.'], warnings: [] });
    }
    if (designSystem && hasState) {
      checks.push(fidelityAudit('palette', 'Paleta permitida (Design System)', ['--state', STATE_FILE, '--check', 'A', '--file', designSystem], dir));
    }
  } else if (gateId === 'gate-2') {
    if (hasState && fs.existsSync(path.join(dir, 'prototype'))) {
      checks.push(fidelityAudit('palette', 'Paleta permitida (prototipo)', ['--state', STATE_FILE, '--dir', 'prototype'], dir));
    }
    if (fs.existsSync(path.join(dir, 'prototype'))) {
      checks.push(textAudit('a11y', 'Accesibilidad y estructura (prototipo)', 'audit_prototype.cjs', ['--dir', 'prototype', ...stateArgs], dir));
      if (hasState) fidelity = fidelityReport(dir);
    }
  }

  if (checks.length === 0) return null;

  const summary = {
    fail: checks.filter(c => c.status === 'fail' || c.status === 'error').length,
    warn: checks.filter(c => c.status === 'warn').length
  };
  const audit = { checks, summary, ranAt: Date.now() };
  if (fidelity) audit.fidelity = fidelity;
  return audit;
}

module.exports = { runGateAudits, parseTextAudit };
