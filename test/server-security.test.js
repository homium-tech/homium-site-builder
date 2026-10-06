const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { startServer } = require('./helpers/server-harness');
const { escapeHtml, renderBlueprintPage } = require('../lib/preview-pages');

// Prueba de integración de la postura de seguridad del servidor real.

let passedTests = 0;
let totalTests = 0;

async function it(desc, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✓ ${desc}`);
  } catch (err) {
    console.error(`  ✗ ${desc}`);
    console.error(err);
    process.exitCode = 1;
  }
}

const EVIL_BRAND = '<img src=x onerror=alert(1)>';

async function runSuite() {
  console.log('\n--- Test Suite: Seguridad del servidor ---\n');

  console.log('[1] Previews y API:');
  let srv = await startServer({
    beforeStart: (dir) => {
      fs.writeFileSync(path.join(dir, 'design-system-state.json'), JSON.stringify({ brand: { name: EVIL_BRAND }, current_phase: 1 }));
      fs.mkdirSync(path.join(dir, 'prototype'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'prototype', 'index.html'), '<html><body>proto</body></html>');
      fs.writeFileSync(path.join(dir, 'prototype', 'style.css'), 'body{color:red}');
      fs.writeFileSync(path.join(dir, '..', 'homium-secret.txt'), 'top secret');
      try {
        fs.symlinkSync(path.join(dir, '..', 'homium-secret.txt'), path.join(dir, 'prototype', 'leak.txt'));
      } catch (e) {
        // Sin permisos de symlink (Windows sin modo desarrollador): la prueba correspondiente se omite
      }
    }
  });
  try {
    await it('should escape the brand name in the standalone blueprint page', () => {
      const html = renderBlueprintPage(EVIL_BRAND);
      assert(!html.includes(EVIL_BRAND), 'raw brand markup must not appear');
      assert(!/<img\b/i.test(html));
      assert(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
      assert.strictEqual(escapeHtml('"><script>'), '&quot;&gt;&lt;script&gt;');
      assert.strictEqual(escapeHtml(undefined), '');
    });

    await it('should serve /preview/blueprint without reflecting raw brand markup', async () => {
      const res = await srv.api('/preview/blueprint');
      const html = await res.text();
      assert.strictEqual(res.status, 200);
      assert(!html.includes(EVIL_BRAND));
    });

    await it('should reject API calls whose Referer is a generated preview, but not the app or the blueprint page', async () => {
      const fromPrototype = await srv.api('/api/deliverables', { headers: { Referer: `${srv.base}/preview/prototype/index.html` } });
      assert.strictEqual(fromPrototype.status, 403);
      const fromDesignSystem = await srv.api('/api/reset', { method: 'POST', body: {}, headers: { Referer: `${srv.base}/preview/design-system` } });
      assert.strictEqual(fromDesignSystem.status, 403);

      const fromApp = await srv.api('/api/deliverables', { headers: { Referer: `${srv.base}/` } });
      assert.strictEqual(fromApp.status, 200);
      const fromBlueprint = await srv.api('/api/deliverables', { headers: { Referer: `${srv.base}/preview/blueprint` } });
      assert.strictEqual(fromBlueprint.status, 200);
      const noReferer = await srv.api('/api/deliverables');
      assert.strictEqual(noReferer.status, 200);
    });

    await it('should serve prototype files and keep the CSP on previews', async () => {
      const index = await srv.api('/preview/prototype/');
      assert.strictEqual(index.status, 200);
      assert((await index.text()).includes('proto'));
      assert((index.headers.get('content-security-policy') || '').includes('sandbox'));
      assert((index.headers.get('content-security-policy') || '').includes('allow-modals'), 'window.print() del botón Descargar PDF necesita allow-modals')
      const css = await srv.api('/preview/prototype/style.css');
      assert.strictEqual(css.status, 200);
    });

    await it('should serve the project assets/ (fonts, logo) to the Design System preview and nothing outside it', async () => {
      const fontsDir = path.join(srv.workspaceDir, 'assets', 'fonts');
      fs.mkdirSync(fontsDir, { recursive: true });
      fs.writeFileSync(path.join(fontsDir, 'Brand-Regular.otf'), 'OTTO-fake');
      fs.writeFileSync(path.join(srv.workspaceDir, 'secret.txt'), 'no debe salir');

      const font = await srv.api('/preview/assets/fonts/Brand-Regular.otf');
      assert.strictEqual(font.status, 200);
      assert.strictEqual(await font.text(), 'OTTO-fake');
      assert((font.headers.get('content-security-policy') || '').includes("font-src 'self'"), 'la CSP de las previews permite fuentes propias');

      for (const escape of ['/preview/assets/../secret.txt', '/preview/assets/%2e%2e/secret.txt', '/preview/assets/..%2fsecret.txt']) {
        const res = await srv.api(escape);
        assert(res.status !== 200 || (await res.text()) !== 'no debe salir', `no debe salir de assets/: ${escape}`);
      }
    });

    await it('should redirect the old /preview/showcase route to /preview/design-system keeping the query', async () => {
      const res = await srv.api('/preview/showcase?v=3');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.redirected, true);
      assert.strictEqual(new URL(res.url).pathname + new URL(res.url).search, '/preview/design-system?v=3');
    });

    await it('should not expose files outside prototype/ through symlinks', async () => {
      const link = path.join(srv.workspaceDir, 'prototype', 'leak.txt');
      if (!fs.existsSync(link)) return; // symlinks no disponibles en este entorno
      const res = await srv.api('/preview/prototype/leak.txt');
      assert.strictEqual(res.status, 403);
    });
  } finally {
    await srv.stop();
  }

  console.log('\n[2] CORS y orígenes:');
  srv = await startServer();
  try {
    await it('should not turn an unlisted Origin into a 500 for static pages, and should answer 403 on the API', async () => {
      const page = await srv.api('/login', { headers: { Origin: 'http://evil.example' } });
      assert.strictEqual(page.status, 200);
      assert.strictEqual(page.headers.get('access-control-allow-origin'), null);

      const nullOrigin = await srv.api('/homium/colors_and_type.css', { headers: { Origin: 'null' } });
      assert.strictEqual(nullOrigin.status, 200);

      const apiCall = await srv.api('/api/deliverables', { headers: { Origin: 'http://evil.example' } });
      assert.strictEqual(apiCall.status, 403);
      assert(/origen no permitido/.test((await apiCall.json()).error));
    });

    await it('should keep accepting origins listed in ALLOWED_ORIGINS', async () => {
      await srv.stop();
      srv = await startServer({ env: { ALLOWED_ORIGINS: 'https://apps.homium.tech' } });
      const res = await srv.api('/api/deliverables', { headers: { Origin: 'https://apps.homium.tech' } });
      assert.strictEqual(res.status, 200);
    });
  } finally {
    await srv.stop();
  }

  console.log('\n[3] Login:');
  srv = await startServer({ login: false });
  try {
    await it('should reset the failed-attempt counter after a successful login', async () => {
      for (let i = 0; i < 9; i++) {
        assert.strictEqual((await srv.doLogin('tester', 'mala')).status, 401);
      }
      assert.strictEqual((await srv.doLogin()).status, 200);
      for (let i = 0; i < 9; i++) {
        assert.strictEqual((await srv.doLogin('tester', 'mala')).status, 401, `attempt ${i + 1} after success`);
      }
    });

    await it('should lock out after 10 failures', async () => {
      assert.strictEqual((await srv.doLogin('tester', 'mala')).status, 401);
      assert.strictEqual((await srv.doLogin('tester', 'mala')).status, 429);
    });
  } finally {
    await srv.stop();
  }

  srv = await startServer({ login: false });
  try {
    await it('should ignore X-Forwarded-For by default (one shared bucket)', async () => {
      for (let i = 0; i < 10; i++) {
        await srv.doLogin('tester', 'mala', { 'X-Forwarded-For': `10.0.0.${i + 1}` });
      }
      const res = await srv.doLogin('tester', 'mala', { 'X-Forwarded-For': '10.9.9.9' });
      assert.strictEqual(res.status, 429);
    });
  } finally {
    await srv.stop();
  }

  srv = await startServer({ login: false, env: { TRUST_PROXY: '1' } });
  try {
    await it('should rate-limit per client IP behind a proxy when TRUST_PROXY is set', async () => {
      for (let i = 0; i < 10; i++) {
        await srv.doLogin('tester', 'mala', { 'X-Forwarded-For': '10.1.1.1' });
      }
      const blocked = await srv.doLogin('tester', 'mala', { 'X-Forwarded-For': '10.1.1.1' });
      assert.strictEqual(blocked.status, 429);
      const otherUser = await srv.doLogin('tester', 'secret-pass', { 'X-Forwarded-For': '10.2.2.2' });
      assert.strictEqual(otherUser.status, 200, 'a different client must not be locked out');
    });
  } finally {
    await srv.stop();
  }

  srv = await startServer({ login: false, env: { AUTH_PASS: 'tu_contraseña_segura' } });
  try {
    await it('should warn (not refuse) when AUTH_PASS is the .env.example placeholder', async () => {
      assert(/AUTH_PASS sigue con el valor de ejemplo/.test(srv.logs()));
      assert.strictEqual((await srv.doLogin('tester', 'tu_contraseña_segura')).status, 200);
    });
  } finally {
    await srv.stop();
  }

  fs.rmSync(path.join(require('os').tmpdir(), 'homium-secret.txt'), { force: true });

  console.log(`\n========================================`);
  console.log(`Summary: ${passedTests}/${totalTests} tests passed.`);
  console.log(`========================================\n`);

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error(err);
  process.exit(1);
});
