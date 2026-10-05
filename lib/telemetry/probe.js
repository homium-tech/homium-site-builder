const http = require('http');
const https = require('https');

/**
 * Consultas al servidor local (Ollama, llama.cpp) para saber con qué ventana de contexto corre el modelo.
 * Son de mejor esfuerzo: ante cualquier fallo o demora devuelven null y la telemetría sigue sin máximo.
 */

const TIMEOUT_MS = 1000;

function requestJson(url, { method = 'GET', body = null, timeoutMs = TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    try {
      const client = url.protocol === 'https:' ? https : http;
      const payload = body ? JSON.stringify(body) : null;
      const req = client.request(url, {
        method,
        timeout: timeoutMs,
        headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}
      }, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          done(null);
          return;
        }
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          try { done(JSON.parse(raw)); } catch (e) { done(null); }
        });
        res.on('error', () => done(null));
      });
      req.on('timeout', () => { req.destroy(); done(null); });
      req.on('error', () => done(null));
      if (payload) req.write(payload);
      req.end();
    } catch (e) {
      done(null);
    }
  });
}

const positive = (value) => (Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null);

/** Contexto con el que Ollama cargó el modelo (/api/ps); si no está cargado, el máximo que soporta (/api/show). */
async function probeOllamaContext(host, model) {
  let base;
  try { base = new URL(host); } catch (e) { return null; }

  const ps = await requestJson(new URL('/api/ps', base));
  const running = Array.isArray(ps?.models) ? ps.models.find(m => m.name === model || m.model === model) : null;
  const loaded = positive(running?.context_length);
  if (loaded) return loaded;

  const show = await requestJson(new URL('/api/show', base), { method: 'POST', body: { model } });
  const info = show?.model_info || {};
  const key = Object.keys(info).find(k => k.endsWith('.context_length'));
  return key ? positive(info[key]) : null;
}

/** Contexto del llama-server (/props) y el modelo que sirve. */
async function probeLlamaCppProps(host) {
  let base;
  try { base = new URL(host); } catch (e) { return { contextWindow: null, model: null }; }

  const props = await requestJson(new URL('/props', base));
  const contextWindow = positive(props?.default_generation_settings?.n_ctx) || positive(props?.n_ctx);
  const path = typeof props?.model_path === 'string' ? props.model_path : '';
  const model = props?.model_alias || (path ? path.split(/[\\/]/).pop() : null) || null;
  return { contextWindow, model };
}

module.exports = { probeOllamaContext, probeLlamaCppProps };
