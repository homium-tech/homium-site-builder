const http = require('http');
const https = require('https');
const EngineAdapter = require('./engine-adapter');

class OllamaAdapter extends EngineAdapter {
  constructor({ host = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434', model = process.env.OLLAMA_MODEL || 'qwen2.5-coder:latest' } = {}) {
    super('ollama');
    this.host = host;
    this.model = model;
  }

  buildCommandAndArgs({ prompt }) {
    return {
      command: 'http-post',
      args: [`${this.host}/api/chat`, prompt.slice(0, 40) + '...']
    };
  }

  spawnTurn({ prompt, session, onStdout, onStderr, onExit, onError, onMetrics }) {
    let url;
    let finished = false;
    const finish = (code) => {
      if (finished) return;
      finished = true;
      if (onExit) onExit(code);
    };
    const fail = (err) => {
      if (finished) return;
      finished = true;
      if (onError) onError(err);
    };
    try {
      url = new URL('/api/chat', this.host);
    } catch (e) {
      fail(new Error(`URL de Ollama inválida: ${this.host}`));
      return { kill: () => {} };
    }

    const payload = JSON.stringify({
      model: this.model,
      messages: [
        { role: 'user', content: prompt }
      ],
      stream: true
    });

    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;

    let aborted = false;
    const req = client.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          fail(new Error(`Ollama respondió con código HTTP ${res.statusCode}`));
          return;
        }

        res.setEncoding('utf8');
        let buffer = '';
        res.on('data', (chunk) => {
          if (aborted) return;
          buffer += chunk.toString('utf-8');
          const lines = buffer.split('\n');
          buffer = lines.pop();

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            try {
              const data = JSON.parse(trimmed);
              if (data.error) {
                fail(new Error(`Ollama: ${data.error}`));
                return;
              }
              const text = data.message?.content;
              if (text && onStdout) {
                // Token a token: se conservan espacios y saltos de línea tal cual
                onStdout(text, 'text_delta');
              }

              if (data.done) {
                if (onMetrics) {
                  onMetrics({
                    engine: 'ollama',
                    model: this.model,
                    duration_seconds: data.total_duration ? +(data.total_duration / 1e9).toFixed(3) : null,
                    usage: {
                      input_tokens: data.prompt_eval_count || 0,
                      output_tokens: data.eval_count || 0,
                      thinking_tokens: 0,
                      cache_read_tokens: 0,
                      total_tokens: (data.prompt_eval_count || 0) + (data.eval_count || 0)
                    }
                  });
                }
                finish(0);
                return;
              }
            } catch (e) {}
          }
        });

        res.on('end', () => {
          if (!aborted) finish(0);
        });
      }
    );

    req.on('error', (err) => {
      if (!aborted) {
        const helpfulMsg = err.code === 'ECONNREFUSED'
          ? `Ollama no está en ejecución en ${this.host}. Si no lo tienes instalado, no te preocupes (es opcional): selecciona Claude, AGY u OpenCode en el selector de motor.`
          : err.message;
        fail(new Error(helpfulMsg));
      }
    });

    req.write(payload);
    req.end();

    return {
      kill: () => {
        aborted = true;
        try {
          req.destroy();
        } catch (e) {}
      }
    };
  }
}

module.exports = OllamaAdapter;
