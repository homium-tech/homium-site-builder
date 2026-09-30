const http = require('http');
const https = require('https');
const EngineAdapter = require('./engine-adapter');

class LlamaCppAdapter extends EngineAdapter {
  constructor({ host = process.env.LLAMACPP_HOST || 'http://127.0.0.1:8080', model = 'local' } = {}) {
    super('llamacpp');
    this.host = host;
    this.model = model;
  }

  buildCommandAndArgs({ prompt }) {
    return {
      command: 'http-post',
      args: [`${this.host}/v1/chat/completions`, prompt.slice(0, 40) + '...']
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
      url = new URL('/v1/chat/completions', this.host);
    } catch (e) {
      fail(new Error(`URL de llama.cpp inválida: ${this.host}`));
      return { kill: () => {} };
    }

    const payload = JSON.stringify({
      model: this.model,
      messages: [
        { role: 'user', content: prompt }
      ],
      stream: true,
      stream_options: { include_usage: true },
      temperature: 0.2
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
          fail(new Error(`llama.cpp respondió con código HTTP ${res.statusCode}`));
          return;
        }

        res.setEncoding('utf8');
        let buffer = '';
        res.on('data', (chunk) => {
          if (aborted) return;
          buffer += chunk.toString('utf-8');
          const lines = buffer.split('\n');
          buffer = lines.pop(); // guardar fragmento incompleto

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(':')) continue;

            if (trimmed === 'data: [DONE]') {
              finish(0);
              return;
            }

            if (trimmed.startsWith('data: ')) {
              try {
                const data = JSON.parse(trimmed.slice(6));
                const content = data.choices?.[0]?.delta?.content;
                if (content && onStdout) {
                  // Token a token: se conservan espacios y saltos de línea tal cual
                  onStdout(content, 'text_delta');
                }

                if (data.usage && onMetrics) {
                  onMetrics({
                    engine: 'llamacpp',
                    model: this.model,
                    usage: {
                      input_tokens: data.usage.prompt_tokens || 0,
                      output_tokens: data.usage.completion_tokens || 0,
                      total_tokens: data.usage.total_tokens || 0
                    }
                  });
                }
              } catch (e) {}
            }
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
          ? `llama-server local no está activo en ${this.host}. Si no lo estás ejecutando, no te preocupes (es opcional): selecciona Claude, AGY u OpenCode en el selector de motor.`
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

module.exports = LlamaCppAdapter;
