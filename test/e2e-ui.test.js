const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { startServer, sleep, waitFor } = require('./helpers/server-harness');

// Prueba de humo de la interfaz en un navegador real (Playwright + Chromium) con el servidor real y el motor mock.
// Si no hay Chromium instalado se omite (instálalo con `pnpm run install:playwright`).

let playwright = null;
try {
  playwright = require('@playwright/test');
} catch (e) {
  console.log('\n--- Test Suite: Interfaz en navegador real ---\n  (omitido: @playwright/test no está instalado)\n');
  process.exit(0);
}

function findChromium() {
  const candidates = [];
  try { candidates.push(playwright.chromium.executablePath()); } catch (e) {}
  const roots = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'ms-playwright'),
    process.env.HOME && path.join(process.env.HOME, '.cache', 'ms-playwright'),
    process.env.HOME && path.join(process.env.HOME, 'Library', 'Caches', 'ms-playwright')
  ].filter(Boolean);
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const dir of fs.readdirSync(root).filter(d => d.startsWith('chromium-')).sort().reverse()) {
      for (const rel of ['chrome-win64/chrome.exe', 'chrome-linux/chrome', 'chrome-linux64/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
        candidates.push(path.join(root, dir, rel));
      }
    }
  }
  return candidates.find(p => p && fs.existsSync(p)) || null;
}

const executablePath = findChromium();
if (!executablePath) {
  console.log('\n--- Test Suite: Interfaz en navegador real ---\n  (omitido: no hay Chromium de Playwright instalado; usa `pnpm run install:playwright`)\n');
  process.exit(0);
}

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

async function runSuite() {
  console.log('\n--- Test Suite: Interfaz en navegador real (Chromium + servidor real + motor mock) ---\n');

  const srv = await startServer({ login: false, env: { MOCK_DELAY_MS: '250' } });
  const browser = await playwright.chromium.launch({ executablePath, headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  // La interfaz arranca con el motor real (claude): los tests siempre usan el simulador
  await context.addInitScript(() => { try { localStorage.setItem('homium_preferred_engine', 'mock'); } catch (e) {} });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);

  const pageErrors = [];
  const externalRequests = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('request', (req) => {
    const url = req.url();
    if (!url.startsWith(srv.base) && !url.startsWith('data:') && !url.startsWith('blob:')) externalRequests.push(url);
  });

  const userBubbles = () => page.locator('.user-message').count();
  const send = async (text) => {
    await page.fill('#userInput', text);
    await page.press('#userInput', 'Enter');
  };
  const waitIdle = async () => {
    await page.waitForFunction(() => !document.getElementById('btnSend').classList.contains('is-stop'));
  };
  const historyOf = () => page.evaluate(async () => (await fetch('/api/chat/history')).json());

  try {
    await it('should log in through the page and load the app without page errors or third-party requests', async () => {
      await page.goto(`${srv.base}/login`);
      await page.fill('#email', 'tester');
      await page.fill('#password', 'secret-pass');
      await page.click('#submitBtn');
      await page.waitForURL(`${srv.base}/`);
      await page.waitForSelector('#chatForm');
      assert.strictEqual(await page.inputValue('#engineSelect'), 'mock', 'los tests nunca deben usar un motor real');
      await page.waitForFunction(() => document.getElementById('metaVersionValue').textContent.startsWith('v'));
      assert(!externalRequests.some(u => /tailwind/i.test(u)), `no debe cargar Tailwind desde un CDN: ${externalRequests.join(', ')}`);
      const srOnly = await page.evaluate(() => {
        const r = document.querySelector('h1.sr-only').getBoundingClientRect();
        return { w: r.width, h: r.height };
      });
      assert(srOnly.w <= 1 && srOnly.h <= 1, 'el encabezado sr-only sigue oculto sin el CDN');
      assert.deepStrictEqual(pageErrors, []);
    });

    await it('should show a real reply and turn the numbered options into buttons (once, not duplicated as text)', async () => {
      await send('Acme');
      await waitIdle();
      await send('dime el modelo de negocio');
      await page.waitForSelector('.inline-option');
      assert.strictEqual(await page.locator('.inline-option').count(), 6);

      const lastBody = page.locator('.agent-message').last().locator('.message-body');
      const plainText = await lastBody.evaluate(el => {
        const clone = el.cloneNode(true);
        clone.querySelectorAll('.inline-options').forEach(n => n.remove());
        return clone.textContent;
      });
      assert(!/B2C — Venta directa/.test(plainText), 'las opciones no deben repetirse como texto junto a los botones');
      assert(/modelo de negocio/i.test(plainText));
      assert.strictEqual(await page.locator('#dynamicActionTray').count(), 0, 'la bandeja de chips ya no existe');
    });

    await it('should keep the custom option for typing instead of sending it', async () => {
      const before = await userBubbles();
      await page.locator('.inline-option.is-custom').click();
      assert.strictEqual(await page.inputValue('#userInput'), '6. ');
      assert.strictEqual(await userBubbles(), before, 'no se envía hasta que el usuario escribe');
      await page.fill('#userInput', '');
    });

    await it('should send the chosen option, lock the group and highlight the choice', async () => {
      const before = await userBubbles();
      await page.locator('.inline-option[data-number="2"]').click();
      await page.waitForFunction((n) => document.querySelectorAll('.user-message').length === n + 1, before);
      const text = await page.locator('.user-message').last().locator('.message-body').textContent();
      assert(/^\s*2\. B2B — Venta a empresas/.test(text), text);
      assert(await page.locator('.inline-options.is-locked').count() >= 1);
      assert(await page.locator('.inline-option.is-chosen').count() >= 1);
      await waitIdle();
    });

    await it('should ignore Enter while a turn is running (no phantom message) and keep the draft', async () => {
      const before = await userBubbles();
      await send('primero');
      await page.waitForSelector('#btnSend.is-stop');
      await page.fill('#userInput', 'segundo');
      await page.press('#userInput', 'Enter');
      await sleep(150);
      assert.strictEqual(await userBubbles(), before + 1, 'solo el primer mensaje se envía');
      assert.strictEqual(await page.inputValue('#userInput'), 'segundo', 'el borrador no se pierde');
      await waitIdle();
      await page.fill('#userInput', '');
      const history = await historyOf();
      assert(!history.messages.some(m => m.content === 'segundo'), 'no queda un mensaje fantasma en el historial');
    });

    await it('should stop a running turn: bubbles removed, text back in the box, nothing persisted', async () => {
      const before = await userBubbles();
      await send('mensaje a detener');
      await page.waitForSelector('#btnSend.is-stop');
      assert.strictEqual(await page.getAttribute('#btnSend', 'aria-label'), 'Detener respuesta');
      await page.click('#btnSend');
      await waitIdle();
      assert.strictEqual(await userBubbles(), before, 'el mensaje cancelado se retira de la conversación');
      assert.strictEqual(await page.inputValue('#userInput'), 'mensaje a detener');
      assert(/Respuesta detenida/.test(await page.locator('.system-event').last().textContent()));
      const history = await historyOf();
      assert(!history.messages.some(m => m.content === 'mensaje a detener'));
      assert.strictEqual(history.busy, false);
      await page.fill('#userInput', '');
    });

    await it('should recover the full reply from the history when the stream is cut mid-turn', async () => {
      await page.route('**/api/chat', async (route) => {
        const response = await route.fetch();
        const body = await response.text();
        // Solo el primer evento: el cliente ve un corte de conexión sin evento terminal
        await route.fulfill({ response, body: body.split('\n\n').slice(0, 2).join('\n\n') + '\n\n' });
      });
      await send('turno con corte de conexion');
      await page.waitForFunction(() => /Extracción visual completada/.test(document.querySelector('.agent-message:last-child .message-body')?.textContent || ''), null, { timeout: 30000 });
      await waitIdle();
      await page.unroute('**/api/chat');
      assert.strictEqual(await page.inputValue('#userInput'), '', 'la respuesta se recuperó: no hay nada que reenviar');
    });

    await it('should resume a turn that is still running after reloading the page', async () => {
      await send('turno que sobrevive a F5');
      await page.waitForSelector('#btnSend.is-stop');
      await page.reload();
      await page.waitForSelector('.turn-recovering', { timeout: 10000 });
      assert(await page.locator('#btnSend.is-stop').count() === 1, 'Detener disponible tras recargar');
      await page.waitForFunction(() => !document.querySelector('.turn-recovering') && !document.getElementById('btnSend').classList.contains('is-stop'), null, { timeout: 30000 });
      const bodyText = await page.locator('.agent-message').last().locator('.message-body').textContent();
      assert(/Extracción visual completada/.test(bodyText), bodyText);
    });

    await it('should resolve an approval gate once and not offer it again after a reload', async () => {
      const projectDir = path.join(srv.workspaceDir, 'acme');
      fs.writeFileSync(path.join(projectDir, 'design-system-state.json'), JSON.stringify({ brand: { name: 'Acme' }, current_phase: 4 }));
      fs.writeFileSync(path.join(projectDir, 'Acme_Design_System.html'), '<html><body>showcase</body></html>');
      await waitFor(async () => (await page.evaluate(async () => (await fetch('/api/deliverables')).json())).status.showcaseExists, { timeoutMs: 8000 });

      await send('muestra el showcase');
      await page.waitForSelector('.btn-gate-approve');
      await page.click('.btn-gate-approve');
      await waitIdle();
      await page.waitForFunction(() => !document.querySelector('.approval-gate-banner'));

      await page.reload();
      await page.waitForSelector('.resume-banner');
      await sleep(500);
      assert.strictEqual(await page.locator('.approval-gate-banner').count(), 0, 'la compuerta aprobada no reaparece tras F5');
      assert.strictEqual((await historyOf()).gates['gate-1'].status, 'approved');
    });

    await it('should open the reset dialog accessibly: focus inside, Escape closes and returns focus', async () => {
      await page.click('#btnReset');
      assert.strictEqual(await page.getAttribute('#resetModal .homium-modal-card', 'role'), 'dialog');
      assert.strictEqual(await page.evaluate(() => document.activeElement.id), 'btnCancelReset');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      assert(await page.evaluate(() => !!document.activeElement.closest('#resetModal')), 'Tab no sale del diálogo');
      await page.keyboard.press('Escape');
      assert.strictEqual(await page.evaluate(() => getComputedStyle(document.getElementById('resetModal')).display), 'none');
      assert.strictEqual(await page.evaluate(() => document.activeElement.id), 'btnReset');
    });

    await it('should expose tabs with ARIA roles that follow the selection', async () => {
      assert.strictEqual(await page.getAttribute('.tabs-list', 'role'), 'tablist');
      await page.click('#tab-logs-button');
      assert.strictEqual(await page.getAttribute('#tab-logs-button', 'aria-selected'), 'true');
      assert.strictEqual(await page.getAttribute('#tab-blueprint-button', 'aria-selected'), 'false');
      assert.strictEqual(await page.getAttribute('#tab-logs', 'role'), 'tabpanel');
    });

    await it('should start a new project keeping the old one on disk', async () => {
      await page.click('#btnReset');
      await page.click('#btnNewProject');
      await page.waitForFunction(() => /Proyecto anterior conservado/.test(document.getElementById('chatMessages').textContent));
      assert(fs.existsSync(path.join(srv.workspaceDir, 'acme', 'design-system-state.json')), 'el proyecto anterior sigue en disco');
      assert.strictEqual((await historyOf()).hasProject, false);
      assert.strictEqual(await page.locator('.quick-chip').count(), 2, 'vuelve la bienvenida con sus sugerencias');
    });

    await it('should stay usable when localStorage throws', async () => {
      const blocked = await browser.newContext({ viewport: { width: 1400, height: 900 } });
      await blocked.addInitScript(() => {
        const thrower = () => { throw new Error('storage bloqueado'); };
        Object.defineProperty(window, 'localStorage', { get: () => ({ getItem: thrower, setItem: thrower, removeItem: thrower }) });
      });
      const p2 = await blocked.newPage();
      const errors = [];
      p2.on('pageerror', (err) => errors.push(err.message));
      await p2.goto(`${srv.base}/login`);
      await p2.fill('#email', 'tester');
      await p2.fill('#password', 'secret-pass');
      await p2.click('#submitBtn');
      await p2.waitForURL(`${srv.base}/`);
      await p2.waitForSelector('#chatForm');
      await p2.selectOption('#engineSelect', 'mock');
      await p2.fill('#userInput', 'Zeta');
      await p2.press('#userInput', 'Enter');
      await p2.waitForFunction(() => document.querySelectorAll('.agent-message').length >= 2);
      assert.deepStrictEqual(errors, []);
      await blocked.close();
    });

    await it('should reach the preview panel from the chat on a narrow screen', async () => {
      const mobile = await browser.newContext({ viewport: { width: 390, height: 800 } });
      const p3 = await mobile.newPage();
      await p3.goto(`${srv.base}/login`);
      await p3.fill('#email', 'tester');
      await p3.fill('#password', 'secret-pass');
      await p3.click('#submitBtn');
      await p3.waitForURL(`${srv.base}/`);
      await p3.waitForSelector('#chatForm');

      assert(await p3.locator('#btnMobileToggleChat').isVisible(), 'el botón para ver la vista previa está en el chat');
      assert(await p3.locator('#chatForm').isVisible());
      await p3.click('#btnMobileToggleChat');
      assert(await p3.locator('#panelPreview').isVisible());
      assert(await p3.locator('#btnMobileToggle').isVisible(), 'y el de vuelta al chat en la cabecera del preview');
      assert(await p3.locator('.engine-selector-box').isVisible(), 'el selector de motor sigue disponible en móvil');
      await p3.click('#btnMobileToggle');
      assert(await p3.locator('#chatForm').isVisible());
      await mobile.close();
    });

    await it('should finish without page errors', async () => {
      assert.deepStrictEqual(pageErrors, []);
    });
  } finally {
    await browser.close();
    await srv.stop();
  }

  console.log(`\n========================================`);
  console.log(`Summary: ${passedTests}/${totalTests} tests passed.`);
  console.log(`========================================\n`);

  if (passedTests !== totalTests) process.exit(1);
}

runSuite().catch((err) => {
  console.error(err);
  process.exit(1);
});
