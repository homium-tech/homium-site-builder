/**
 * Telemetría de uso de los motores: normaliza los tokens que reporta cada motor, calcula el contexto
 * en uso y la ventana del modelo, y suma los turnos de un proyecto.
 *
 * Un evento `metrics` de un adaptador puede traer:
 *   usage           tokens (input_tokens, output_tokens, thinking_tokens, cache_read_tokens, cache_write_tokens, total_tokens)
 *   scope           'call' (una llamada al modelo, por defecto) | 'turn' (acumulado de todo el turno)
 *   call_id         identifica la llamada: si llega otra vez con el mismo id reemplaza a la anterior
 *   model, context_window, cost_usd, duration_seconds
 */

const n = (value) => {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : 0;
};

/** Tokens con nombres fijos; `total_tokens` es el del motor o, si no lo da, entrada + salida + caché. */
function normalizeUsage(raw) {
  const u = raw || {};
  const input = n(u.input_tokens);
  const output = n(u.output_tokens);
  const cacheRead = n(u.cache_read_tokens);
  const cacheWrite = n(u.cache_write_tokens);
  // El total del motor puede venir en 0 o sin la caché: nunca menos que la suma de sus partes
  const total = Math.max(n(u.total_tokens), input + output + cacheRead + cacheWrite);
  return {
    input_tokens: input,
    output_tokens: output,
    thinking_tokens: n(u.thinking_tokens),
    cache_read_tokens: cacheRead,
    cache_write_tokens: cacheWrite,
    total_tokens: total
  };
}

function addUsage(a, b) {
  const out = {};
  for (const key of Object.keys(a)) out[key] = a[key] + b[key];
  return out;
}

const emptyUsage = () => normalizeUsage({});

/** Tokens que ocupan el contexto en una llamada: lo que se envió al modelo (la caché también cuenta) */
function contextOf(usage) {
  const u = normalizeUsage(usage);
  return u.input_tokens + u.cache_read_tokens + u.cache_write_tokens;
}

// Ventanas conocidas cuando el motor no las reporta. Solo patrones fiables: sin dato es mejor no mostrar un máximo.
const WINDOW_FALLBACKS = [
  { pattern: /haiku/i, tokens: 200000 },
  { pattern: /gemini/i, tokens: 1000000 }
];

/**
 * Ventana de contexto del modelo cuando el motor no la informa.
 * CONTEXT_WINDOW_<MOTOR> (p. ej. CONTEXT_WINDOW_AGY=1000000) manda sobre todo lo demás.
 * @returns {{ tokens: number, estimated: boolean } | null}
 */
function contextWindowFor(engine, model) {
  const override = parseInt(process.env[`CONTEXT_WINDOW_${String(engine || '').toUpperCase()}`], 10);
  if (override > 0) return { tokens: override, estimated: false };
  const hit = WINDOW_FALLBACKS.find(f => f.pattern.test(String(model || '')));
  return hit ? { tokens: hit.tokens, estimated: true } : null;
}

/** Junta los eventos `metrics` de un turno en una sola lectura: tokens gastados, contexto en uso y ventana. */
class TurnUsage {
  constructor(engine) {
    this.engine = engine;
    this.calls = new Map();
    this.seq = 0;
    this.turn = null;
    this.model = null;
    this.window = null;
    this.contextTokens = null;
    this.durationSeconds = null;
  }

  add(metrics) {
    if (!metrics) return;
    if (metrics.model) this.model = metrics.model;
    if (n(metrics.context_window)) this.window = n(metrics.context_window);
    if (metrics.duration_seconds != null && Number.isFinite(Number(metrics.duration_seconds))) {
      this.durationSeconds = Number(metrics.duration_seconds);
    }
    if (!metrics.usage) return;

    const entry = {
      usage: normalizeUsage(metrics.usage),
      cost: metrics.cost_usd != null && Number.isFinite(Number(metrics.cost_usd)) ? Number(metrics.cost_usd) : null
    };
    if (metrics.scope === 'turn') {
      this.turn = entry;
    } else {
      this.calls.set(metrics.call_id != null ? String(metrics.call_id) : `anon-${this.seq++}`, entry);
      this.contextTokens = contextOf(entry.usage);
    }
  }

  /** @returns {{ usage, cost_usd, model, context_tokens, context_window, context_window_estimated, duration_seconds } | null} */
  snapshot() {
    const hasUsage = this.calls.size > 0 || this.turn !== null;
    if (!hasUsage && !this.model) return null;

    let usage = null;
    let cost = null;
    if (hasUsage) {
      usage = emptyUsage();
      for (const entry of this.calls.values()) {
        usage = addUsage(usage, entry.usage);
        if (entry.cost != null) cost = (cost || 0) + entry.cost;
      }
      // El acumulado que informa el motor manda si no es menor que la suma de las llamadas
      if (this.turn && this.turn.usage.total_tokens >= usage.total_tokens) {
        usage = this.turn.usage;
        cost = this.turn.cost != null ? this.turn.cost : cost;
      }
    }
    const win = this.windowInfo();
    return {
      usage,
      cost_usd: cost,
      model: this.model,
      context_tokens: this.contextTokens,
      context_window: win.tokens,
      context_window_estimated: win.estimated,
      duration_seconds: this.durationSeconds
    };
  }

  windowInfo() {
    if (this.window) return { tokens: this.window, estimated: false };
    const fallback = contextWindowFor(this.engine, this.model);
    return fallback ? { tokens: fallback.tokens, estimated: fallback.estimated } : { tokens: null, estimated: false };
  }
}

/** Suma los registros de turnos (`turns.jsonl`) de un proyecto. Cuentan también los turnos fallidos: gastaron tokens. */
function summarizeTurns(turns) {
  const list = Array.isArray(turns) ? turns : [];
  let usage = emptyUsage();
  let cost = 0;
  let hasCost = false;
  let durationMs = 0;
  let withUsage = 0;
  const groups = new Map();

  for (const t of list) {
    durationMs += n(t.durationMs);
    if (!t.usage) continue;
    withUsage++;
    const u = normalizeUsage(t.usage);
    usage = addUsage(usage, u);
    const turnCost = t.costUsd != null && Number.isFinite(Number(t.costUsd)) ? Number(t.costUsd) : null;
    if (turnCost != null) { cost += turnCost; hasCost = true; }

    const key = `${t.engine || '?'}|${t.model || ''}`;
    const g = groups.get(key) || { engine: t.engine || '?', model: t.model || null, turns: 0, usage: emptyUsage(), cost_usd: null };
    g.turns++;
    g.usage = addUsage(g.usage, u);
    if (turnCost != null) g.cost_usd = (g.cost_usd || 0) + turnCost;
    groups.set(key, g);
  }

  const last = [...list].reverse().find(t => t.contextTokens != null) || null;
  return {
    turns: list.length,
    turns_with_usage: withUsage,
    duration_ms: durationMs,
    usage,
    cost_usd: hasCost ? cost : null,
    by_model: [...groups.values()].sort((a, b) => b.usage.total_tokens - a.usage.total_tokens),
    last_context: last
      ? { tokens: last.contextTokens, window: last.contextWindow ?? null, engine: last.engine, model: last.model || null, at: last.at }
      : null
  };
}

module.exports = { normalizeUsage, contextOf, contextWindowFor, TurnUsage, summarizeTurns };
