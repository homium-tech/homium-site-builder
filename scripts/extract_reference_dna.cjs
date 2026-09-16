/**
 * Forensic Reference DNA Extractor v3 — Playwright Headless Engine
 *
 * Renders the target URL in a real Chromium browser to extract:
 *  - Effective background colors (walks up the DOM; resolves gradients via stops)
 *  - Area-weighted chromatic census (backgrounds vs text counted separately, black included)
 *  - Semantic token candidates with evidence (bg_base / surfaces / accents / text)
 *  - Dual rgb() + normalized HEX output for every measured color
 *  - Real font families applied to body, headings and nav
 *  - Measured layout dimensions (nav height, container width, section gaps, footer)
 *  - Sequential DOM section structure with card anatomy + effective bg per section
 *  - Full-page and hero-viewport screenshots for visual validation
 *
 * Usage:  node extract_reference_dna.cjs <URL>
 * Requires: @playwright/test or playwright
 */

'use strict';

const path = require('path');
const fs   = require('fs');

let chromium;
try {
  ({ chromium } = require('@playwright/test'));
} catch {
  try {
    ({ chromium } = require('playwright'));
  } catch {
    console.error('[DNA v4 Error] Could not find @playwright/test or playwright.');
    console.error('  Run: pnpm add -D @playwright/test && pnpm exec playwright install chromium');
    process.exit(1);
  }
}

const SCREENSHOT_DIR = path.join(process.cwd(), 'scratch', 'screenshots');

// Dismisses common intercepting overlays (cookie banners, signup/newsletter modals,
// language-switch popups) before any measurement or screenshot is taken. Without this,
// both the forensic DOM read and the reference screenshots capture the overlay instead
// of the real design — corrupting the blueprint and the visual fidelity baseline alike.
async function dismissOverlays(page) {
  const dismissSelectors = [
    'button[aria-label*="close" i]',
    'button[aria-label*="dismiss" i]',
    '[aria-label*="close" i] button',
    '[class*="modal"] button[class*="close" i]',
    '[class*="popup"] button[class*="close" i]',
    '[class*="dialog"] button[class*="close" i]',
    '[class*="overlay"] button[class*="close" i]',
    'button[class*="cookie" i][class*="accept" i]',
    '[class*="cookie" i] button[class*="accept" i]',
    '[id*="cookie" i] button[class*="accept" i]',
    'button[id*="onetrust-accept" i]',
  ];
  for (const sel of dismissSelectors) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 600 }).catch(() => false)) {
        await el.click({ timeout: 1000 }).catch(() => {});
        await page.waitForTimeout(200);
      }
    } catch { /* selector not present — safe to ignore */ }
  }
  // Fallback for modals with no matched close button: Escape closes most native
  // <dialog>/aria-modal patterns without side effects on pages that have none open.
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(150);
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(150);
}

// Captura el diseño real del banner/gestor de cookies ANTES de que dismissOverlays()
// lo cierre — es la única oportunidad de registrarlo, porque el resto de la extracción
// necesita que esté fuera del camino para no corromper la medición de paleta/layout.
// Se usa para que Fase 8 pueda replicar un banner de cookies fiel a la referencia en
// vez de inventar uno genérico (o no incluir ninguno).
async function captureCookieBannerDesign(page) {
  return page.evaluate(() => {
    const isVis = (el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      const st = window.getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) === 0) return false;
      return true;
    };
    const px = (v) => { const n = parseFloat(v); return isNaN(n) ? null : Math.round(n); };
    const cs = (el, p) => el ? window.getComputedStyle(el).getPropertyValue(p).trim() : null;
    const rgbToHex = (str) => {
      if (!str) return null;
      const m = str.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/);
      if (!m) return null;
      const [r, g, b] = [m[1], m[2], m[3]].map(n => Math.round(parseFloat(n)));
      return '#' + [r, g, b].map(n => n.toString(16).padStart(2, '0')).join('').toUpperCase();
    };

    const selector = [
      '[id*="cookie" i]', '[class*="cookie" i]', '[id*="consent" i]', '[class*="consent" i]',
      '[class*="gdpr" i]', '[id*="gdpr" i]', '#onetrust-banner-sdk', '.cc-window', '.cc-banner',
      '[aria-label*="cookie" i]', '[data-testid*="cookie" i]',
    ].join(', ');

    const candidates = [...document.querySelectorAll(selector)]
      .filter(isVis)
      .filter(el => {
        const r = el.getBoundingClientRect();
        return r.width >= 200 && r.height >= 40; // descarta íconos/toggles sueltos, no el banner en sí
      });
    if (candidates.length === 0) return { found: false };

    // Un selector amplio como este suele matchear también botones/textos internos del
    // banner por separado — el contenedor real es el candidato de mayor área.
    const el = candidates.sort((a, b) => {
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      return (rb.width * rb.height) - (ra.width * ra.height);
    })[0];

    const r = el.getBoundingClientRect();
    let position = 'corner_card';
    if (r.width >= window.innerWidth * 0.9) {
      position = r.top < window.innerHeight * 0.3 ? 'top_bar' : 'bottom_bar';
    } else if (r.top > window.innerHeight * 0.15 && r.bottom < window.innerHeight * 0.85) {
      position = 'center_modal';
    }

    const buttons = [...el.querySelectorAll('a, button')]
      .filter(isVis)
      .map(b => {
        const t = b.textContent.trim().replace(/\s+/g, ' ');
        return {
          text:             t.slice(0, 40),
          bg_hex:           rgbToHex(cs(b, 'background-color')),
          color_hex:        rgbToHex(cs(b, 'color')),
          border_radius_px: px(cs(b, 'border-radius')),
        };
      })
      .filter(b => b.text);

    const textEl = [...el.querySelectorAll('p, span, div')]
      .find(n => n.textContent.trim().length > 30 && n.children.length === 0);

    // ¿Backdrop oscurecedor de pantalla completa detrás? (patrón center_modal) — búsqueda
    // acotada a candidatos con naming de overlay, no un escaneo de todo el DOM.
    const backdropCandidates = [...document.querySelectorAll(
      '[class*="overlay" i], [class*="backdrop" i], [class*="scrim" i]'
    )];
    const hasBackdrop = backdropCandidates.some(n => {
      if (n === el || n.contains(el) || el.contains(n)) return false;
      const st = window.getComputedStyle(n);
      const nr = n.getBoundingClientRect();
      return ['fixed', 'absolute'].includes(st.position)
        && nr.width >= window.innerWidth * 0.9 && nr.height >= window.innerHeight * 0.9
        && parseFloat(st.opacity) > 0
        && st.backgroundColor !== 'rgba(0, 0, 0, 0)' && st.backgroundColor !== 'transparent';
    });

    return {
      found:             true,
      position,
      width_px:          Math.round(r.width),
      height_px:         Math.round(r.height),
      bg_hex:            rgbToHex(cs(el, 'background-color')),
      border_radius_px:  px(cs(el, 'border-radius')),
      box_shadow:        cs(el, 'box-shadow'),
      has_backdrop:      hasBackdrop,
      text_sample:       textEl ? textEl.textContent.trim().replace(/\s+/g, ' ').slice(0, 200) : null,
      buttons:           buttons.slice(0, 4),
    };
  });
}

// Node.js color helper — converts rgb()/rgba() strings returned by getComputedStyle to #HEX
const rgbToHexNode = (str) => {
  if (!str || str === 'none' || str === 'transparent') return null;
  if (/^#[0-9a-f]{3,8}$/i.test(str)) return str.toUpperCase();
  const m = str.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
  if (!m) return null;
  return '#' + [m[1], m[2], m[3]].map(n => Math.round(parseFloat(n)).toString(16).padStart(2, '0')).join('').toUpperCase();
};

const parseTransitionDurationMs = (t) => {
  if (!t || t === 'none' || t === 'all 0s ease 0s') return null;
  const m = t.match(/([\d.]+)(ms|s)/);
  if (!m) return null;
  const ms = m[2] === 'ms' ? parseFloat(m[1]) : Math.round(parseFloat(m[1]) * 1000);
  return ms > 0 ? ms : null;
};

// Real-hover measurement — moves the mouse onto `selector`, reads computed styles
// before/after via getComputedStyle, and reports back only what actually changed.
// Reused for buttons, nav CTA, a representative card, and a representative footer
// link so hover data is never asserted for an element that was never measured.
async function measureHover(page, selector, baselineBgHex, baselineColorHex, baselineBorderHex, transitionStr) {
  try {
    const loc = page.locator(selector).first();
    await loc.scrollIntoViewIfNeeded({ timeout: 3000 });
    await page.waitForTimeout(80);
    await loc.hover({ force: true, timeout: 3000 });
    await page.waitForTimeout(300); // let CSS transitions settle

    const hoverData = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const cs = (prop) => window.getComputedStyle(el).getPropertyValue(prop).trim();
      return {
        bg:        cs('background-color'),
        color:     cs('color'),
        border:    cs('border-color'),
        shadow:    cs('box-shadow'),
        transform: cs('transform'),
        opacity:   cs('opacity'),
      };
    }, selector);

    await page.mouse.move(0, 0);
    await page.waitForTimeout(80);

    if (!hoverData) return null;
    const hBg = rgbToHexNode(hoverData.bg);
    const hColor = rgbToHexNode(hoverData.color);
    const hBorder = rgbToHexNode(hoverData.border);
    const isIdentityMatrix = /^matrix\(1,\s*0,\s*0,\s*1,\s*0,\s*0\)$/.test(hoverData.transform);
    return {
      bg_hex: hBg,
      color_hex: hColor,
      border_color_hex: hBorder,
      box_shadow: hoverData.shadow !== 'none' ? hoverData.shadow : null,
      transform: !isIdentityMatrix && hoverData.transform !== 'none' ? hoverData.transform : null,
      opacity: hoverData.opacity !== '1' ? parseFloat(hoverData.opacity) : null,
      has_visual_change: hBg !== baselineBgHex || hColor !== baselineColorHex || hBorder !== baselineBorderHex,
      transition_duration_ms: parseTransitionDurationMs(transitionStr),
    };
  } catch (e) {
    console.error(`[DNA v4] Hover measure failed for ${selector}: ${e.message}`);
    return null;
  }
}

async function extractDNA(targetUrl, screenshotPrefix = 'ref') {
  console.error(`[DNA v4] Launching Playwright Chromium → ${targetUrl}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport:  { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    // Playwright's default colorScheme es 'light'. Muchos sitios modernos leen
    // prefers-color-scheme (o una cookie fijada en el primer request a partir de
    // ese media query) y sirven un tema completamente distinto según ese valor —
    // confirmado en vivo: un sitio con tema dual capturado sin esto entrega
    // bg_base claro aunque el sitio real es oscuro para la inmensa mayoría de
    // visitantes (dark es el default de facto en OS/navegadores modernos).
    // Se fija 'dark' explícitamente para que la extracción refleje lo que la
    // mayoría de usuarios — y el propio usuario al revisar la referencia — ven.
    colorScheme: 'dark',
  });
  const page = await context.newPage();

  try {
    await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });
  } catch {
    console.error('[DNA v4] networkidle timeout — falling back to domcontentloaded + 3s wait');
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(3000);
  }

  // ---------- Bot-block / challenge-page guard ----------
  // Si el sitio tiene protección anti-bot activa (Cloudflare, etc.), Playwright puede
  // recibir la pantalla de verificación en vez del contenido real — y sin este check el
  // extractor mediría silenciosamente la paleta/tipografía/estructura de ESA pantalla,
  // no del sitio. Solo se detecta y se avisa; jamás se intenta evadir la protección.
  const blockCheck = await page.evaluate(() => {
    const title = (document.title || '').toLowerCase();
    const bodyText = (document.body ? document.body.innerText : '').trim();
    const challengePatterns = /just a moment|checking your browser|attention required|verify you are human|please wait while we verify/i;
    return {
      looksBlocked: challengePatterns.test(title) || (bodyText.length < 200 && challengePatterns.test(bodyText)),
      title: document.title,
      bodyTextLength: bodyText.length,
    };
  });
  if (blockCheck.looksBlocked) {
    console.error(`[DNA v4 WARNING] La página cargada parece una pantalla de verificación anti-bot (title: "${blockCheck.title}", ${blockCheck.bodyTextLength} chars de texto) — la extracción probablemente NO refleja el sitio real. Considera proveer cookies de sesión, capturar manualmente, o reintentar más tarde.`);
  }

  // ---------- Captura del diseño del banner de cookies (ANTES de dismissOverlays) ----------
  // dismissOverlays() cierra/acepta el banner para no corromper el resto de la medición —
  // esta es la única oportunidad de registrar su diseño real antes de que desaparezca.
  await page.waitForTimeout(400); // algunos gestores de consentimiento montan el banner con un pequeño delay tras networkidle
  const cookieBannerDesign = await captureCookieBannerDesign(page).catch(() => ({ found: false }));
  console.error(`[DNA v4] Captura de banner de cookies: ${cookieBannerDesign.found ? 'encontrado' : 'no detectado'}`);

  await dismissOverlays(page);
  console.error('[DNA v4] Overlay dismissal pass complete (cookie/signup/language popups)');

  // ---------- Pre-scroll settle pass ----------
  // La medición estructural (el gran page.evaluate() de abajo) es una foto fija tomada en
  // el momento — sin este pase, cualquier sección bajo el pliegue con animación de
  // revelado por scroll (GSAP ScrollTrigger, AOS.js, IntersectionObserver a mano) se mide
  // en su estado inicial (opacity:0/transform), e `isVisible()` la descarta como si no
  // existiera — mismo síntoma que los bugs de mobile-hidden ya corregidos, pero por scroll
  // en vez de CSS responsive. También da tiempo a que imágenes lazy-load (nativas o por
  // data-src) resuelvan su `src` real antes de leerlo. Genérico a cualquier sitio con
  // scroll-reveal — no depende de ninguna librería de animación específica.
  {
    const stepPx = 900;
    let lastHeight = 0;
    for (let step = 0; step < 30; step++) {
      const height = await page.evaluate(() => document.body.scrollHeight);
      const y = step * stepPx;
      if (y >= height) break;
      await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y);
      await page.waitForTimeout(250);
      lastHeight = height;
    }
    void lastHeight;
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    await dismissOverlays(page); // popups de exit-intent o de profundidad de scroll pueden aparecer recién aquí
  }
  console.error('[DNA v4] Pre-scroll settle pass complete (lazy-load + scroll-reveal disparados)');

  // Esperar a que las fuentes reales terminen de cargar — sin esto, un sitio con carga
  // tardía de webfont (Adobe Fonts/Typekit con swap, font-display:optional) puede medir
  // las métricas de la fuente de fallback en vez de la real.
  await page.evaluate(() => {
    if (!document.fonts || !document.fonts.ready) return true;
    // Race contra un timeout duro — un sitio con fuentes rotas/nunca resueltas no debe
    // colgar la extracción indefinidamente.
    return Promise.race([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 2000))]);
  }).catch(() => {});

  const extracted = await page.evaluate(() => {
    const cs = (el, prop) => el ? window.getComputedStyle(el).getPropertyValue(prop).trim() : null;

    const isVisible = (el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return false;
      const st = window.getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) === 0) return false;
      // Drawers/menús mobile suelen ocultarse con `transform` (translateX/Y) en vez
      // de display:none — el elemento conserva tamaño pero cae fuera del viewport.
      // Se usa el CENTRO del elemento con tolerancia (no los bordes estrictos):
      // ajustes de posicionamiento legítimos y pequeños (ej. `position:relative;
      // top:-Npx` para alinear texto dentro de un contenedor más alto) pueden
      // dejar el rect ligeramente fuera de [0, viewport] sin que el elemento esté
      // realmente oculto — verificado en vivo contra lorolabs.ai (nav real con
      // `top:-57px` por ese motivo, visualmente en pantalla).
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const tol = 50;
      if (cx < -tol || cx > window.innerWidth + tol || cy < -tol || cy > window.innerHeight + tol) return false;
      return true;
    };
    // Reemplazo de querySelector ciego: recorre TODOS los matches en orden del
    // DOM y devuelve el primero realmente renderizado en el viewport de captura
    // actual — evita capturar variantes mobile-hidden/desktop-hidden (patrón
    // Tailwind md:hidden / hidden md:flex, muy común en sitios responsive) como
    // si fueran el elemento real cuando el bloque oculto aparece antes en el DOM.
    const qsVisible = (selector, root = document) => {
      const nodes = root.querySelectorAll(selector);
      for (const el of nodes) { if (isVisible(el)) return el; }
      return null;
    };

    // ---------- Color utilities ----------
    const gammaEncode = (c) => {
      const v = c <= 0 ? 0 : c >= 1 ? 1 : c;
      return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
    };

    const oklabToLinearSrgb = (L, a, b) => {
      const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
      const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
      const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
      const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
      return [
        +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
      ];
    };

    const labToLinearSrgb = (L, a, b) => {
      // D65 white reference
      const Xn = 0.95047, Yn = 1.00000, Zn = 1.08883;
      const fy = (L + 16) / 116;
      const fx = fy + a / 500;
      const fz = fy - b / 200;
      const inv = (t) => (t * t * t > 0.008856 ? t * t * t : (116 * t - 16) / 903.3);
      const yr = L > 8 ? Math.pow(fy, 3) : L / 903.3;
      const xr = inv(fx) * Xn;
      const zr = inv(fz) * Zn;
      return [
        +3.2404542 * xr - 1.5371385 * yr - 0.4985314 * zr,
        -0.9692660 * xr + 1.8760108 * yr + 0.0415560 * zr,
        +0.0556434 * xr - 0.2040259 * yr + 1.0572252 * zr,
      ];
    };

    const numsFrom = (str) =>
      str.replace(/\//g, ' ').match(/-?\d*\.?\d+(?:e[-+]?\d+)?%?/gi) || [];

    const pctOrNum = (v, scaleForPct) => {
      if (!v) return NaN;
      return v.endsWith('%') ? parseFloat(v) / 100 * scaleForPct : parseFloat(v);
    };

    // Converts any CSS color string (hex, rgb, rgba, hsl, hsla, oklab, oklch, lab, lch) to HEX
    const cssColorToHex = (v) => {
      if (!v) return null;
      const s = String(v).trim();

      // #rgb / #rrggbb / #rrggbbaa
      const hm = s.match(/^#([0-9a-f]{3,8})$/i);
      if (hm) {
        let h = hm[1];
        if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split('').map(c => c + c).join('');
        if (h.length === 8) h = h.slice(0, 6);
        if (h.length !== 6) return null;
        return '#' + h.toUpperCase();
      }

      const fn = s.match(/^(rgba?|hsla?|oklab|oklch|lab|lch)\(([^)]*)\)$/i);
      if (!fn) return null;
      const kind = fn[1].toLowerCase();
      const parts = numsFrom(fn[2]);
      if (parts.length < 3) return null;

      // Fully transparent colors resolve to null (no visual information)
      if (parts.length >= 4) {
        const a = pctOrNum(parts[3], 1);
        if (!Number.isNaN(a) && a === 0) return null;
      }

      let lin;

      if (kind === 'rgb' || kind === 'rgba') {
        const r = pctOrNum(parts[0], 255), g = pctOrNum(parts[1], 255), b = pctOrNum(parts[2], 255);
        if ([r, g, b].some(Number.isNaN)) return null;
        return '#' + [r, g, b].map(c => clampByte(c).toString(16).padStart(2, '0')).join('').toUpperCase();
      }

      if (kind === 'hsl' || kind === 'hsla') {
        const h = parseFloat(parts[0]) || 0;
        const sat = pctOrNum(parts[1], 100) / 100;
        const lig = pctOrNum(parts[2], 100) / 100;
        if ([sat, lig].some(Number.isNaN)) return null;
        const k = (n) => (n + h / 30) % 12;
        const a2 = sat * Math.min(lig, 1 - lig);
        const f = (n) => lig - a2 * Math.max(-1, Math.min(Math.min(k(n) - 3, 9 - k(n)), 1));
        return '#' + [f(0), f(8), f(4)].map(c => clampByte(c * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
      }

      if (kind === 'oklab') {
        const L = pctOrNum(parts[0], 1), a = parseFloat(parts[1]), b = parseFloat(parts[2]);
        if ([L, a, b].some(Number.isNaN)) return null;
        lin = oklabToLinearSrgb(L, a, b);
      } else if (kind === 'oklch') {
        const L = pctOrNum(parts[0], 1);
        const C = parseFloat(parts[1]);
        const Hdeg = parseFloat(parts[2]);
        if ([L, C, Hdeg].some(Number.isNaN)) return null;
        const rad = Hdeg * Math.PI / 180;
        lin = oklabToLinearSrgb(L, C * Math.cos(rad), C * Math.sin(rad));
      } else if (kind === 'lab') {
        const L = parseFloat(parts[0]), a = parseFloat(parts[1]), b = parseFloat(parts[2]);
        if ([L, a, b].some(Number.isNaN)) return null;
        lin = labToLinearSrgb(L, a, b);
      } else { // lch
        const L = parseFloat(parts[0]), C = parseFloat(parts[1]), Hdeg = parseFloat(parts[2]);
        if ([L, C, Hdeg].some(Number.isNaN)) return null;
        const rad = Hdeg * Math.PI / 180;
        lin = labToLinearSrgb(L, C * Math.cos(rad), C * Math.sin(rad));
      }

      return '#' + lin.map(c => clampByte(Math.round(gammaEncode(c) * 255)).toString(16).padStart(2, '0')).join('').toUpperCase();
    };

    const clampByte = (n) => Math.max(0, Math.min(255, Math.round(n)));

    const rgbToHex = (v) => cssColorToHex(v);

    const isTransparent = (v) => {
      if (!v || v === 'transparent' || /^none$/i.test(String(v))) return true;
      // Only functions with an explicit 4th alpha component can be transparent
      const inner = String(v).match(/^[a-z]+\(([^)]*)\)$/i);
      if (!inner) return false;
      const parts = inner[1].split(/[,\s/]+/).filter(Boolean);
      if (parts.length < 4) return false;
      const a = parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
      return !Number.isNaN(a) && a < 0.5;
    };

    const hexToRgbChannels = (hex) => {
      if (!hex) return null;
      let h = hex.replace('#', '');
      if (h.length === 3) h = h.split('').map(c => c + c).join('');
      if (h.length === 8) h = h.slice(0, 6);
      if (h.length !== 6) return null;
      const n = parseInt(h, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    };

    const rgbChannelsToHsl = (r, g, b) => {
      r /= 255; g /= 255; b /= 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const l = (max + min) / 2;
      if (max === min) return { h: 0, s: 0, l };
      const d = max - min;
      const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      let h;
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
      else if (max === g) h = ((b - r) / d + 2);
      else h = ((r - g) / d + 4);
      return { h: h / 6, s, l };
    };

    const describeEl = (el) => {
      if (!el) return null;
      const tag = el.tagName.toLowerCase();
      const id  = el.id ? `#${el.id}` : '';
      let cls = '';
      if (typeof el.className === 'string' && el.className.trim()) {
        cls = '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.');
      }
      return `${tag}${id}${cls}`.substring(0, 90);
    };

    // Word-boundary-safe class matcher for marquee/track detection. A naive
    // `[class*="track"]` substring selector also matches Tailwind's ubiquitous
    // `tracking-tight`/`tracking-wide` letter-spacing utilities (any heading has
    // one), producing false-positive has_marquee on sections that never had a
    // ticker — confirmed on a real site where the section's own `<h2>` tripped it.
    const TRACKY_CLASS_RE = /(^|[-_])(marquee|ticker|scroller|track)($|[-_])/i;
    const hasTrackyClass = (el) => {
      const cls = typeof el.className === 'string' ? el.className : '';
      return cls.split(/\s+/).some(tok => TRACKY_CLASS_RE.test(tok));
    };
    const findTrackyEl = (root) => [...root.querySelectorAll('[class]')].find(hasTrackyClass) || null;
    const findAllTrackyEls = (root) => [...root.querySelectorAll('[class]')].filter(hasTrackyClass);

    // Utility-class frameworks (Tailwind's `[52px]` arbitrary values, `hover:` variant
    // prefixes) produce class names that are not valid CSS selectors on their own —
    // describeEl()'s output can break querySelector/Playwright locators for those.
    // Tag any element we'll need to re-locate later (for the real-hover pass, run
    // from Node after this evaluate() returns) with a guaranteed-valid attribute
    // selector instead of relying on the class-based description for that purpose.
    let dnaHoverIdCounter = 0;
    const tagForHover = (el) => {
      if (!el) return null;
      let id = el.getAttribute('data-dna-hover-id');
      if (!id) {
        id = String(dnaHoverIdCounter++);
        el.setAttribute('data-dna-hover-id', id);
      }
      return `[data-dna-hover-id="${id}"]`;
    };

    // ---------- Effective background resolution ----------
    const getGradientStops = (el) => {
      const bi = cs(el, 'background-image');
      if (!bi || bi === 'none' || !/gradient/i.test(bi)) return null;
      const raw = bi.match(/#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)/g);
      if (!raw || raw.length === 0) return null;
      return raw.slice(0, 5);
    };

    const resolveEffectiveBg = (el) => {
      let node = el;
      while (node) {
        const bg   = cs(node, 'background-color');
        const grad = getGradientStops(node);
        if (!isTransparent(bg) || grad) {
          const stopsHex = grad ? grad.map(rgbToHex).filter(Boolean) : null;
          return {
            rgb:                 isTransparent(bg) ? null : bg,
            hex:                 rgbToHex(bg),
            gradient_stops:      grad || null,
            gradient_stops_hex:  stopsHex && stopsHex.length ? stopsHex : null,
            resolved_from:       describeEl(node),
          };
        }
        node = node.parentElement;
      }
      return { rgb: null, hex: null, gradient_stops: null, gradient_stops_hex: null, resolved_from: null };
    };

    // ---------- Section background type classifier ----------
    const classifySectionBg = (sec) => {
      // 1. Video background (highest priority)
      const videoBg = sec.querySelector('video');
      if (videoBg) {
        const src = videoBg.querySelector('source')?.getAttribute('src') || videoBg.getAttribute('src') || null;
        return { bg_type: 'video', bg_video_src: src, bg_css: null, bg_hex: null };
      }
      // 2. Canvas background (WebGL / canvas not inside a slot but covering the section)
      const canvasBg = [...sec.querySelectorAll('canvas')].find(c => {
        const r = c.getBoundingClientRect();
        const sr = sec.getBoundingClientRect();
        return r.width >= sr.width * 0.7 && r.height >= sr.height * 0.7;
      });
      if (canvasBg) return { bg_type: 'canvas_animated', bg_video_src: null, bg_css: null, bg_hex: null };
      // 3. Animated CSS background (keyframe animation on section or direct child)
      const animEls = [sec, ...sec.children].filter(el => {
        const anim = cs(el, 'animation-name');
        return anim && anim !== 'none' && !/(marquee|ticker|spin|pulse)/i.test(anim);
      });
      if (animEls.length) {
        const bi = cs(animEls[0], 'background-image') || cs(sec, 'background-image');
        return { bg_type: 'animated', bg_video_src: null, bg_css: bi !== 'none' ? bi : null, bg_hex: rgbToHex(cs(sec, 'background-color')) };
      }
      // 4. CSS background-image (static)
      const bi = cs(sec, 'background-image');
      if (bi && bi !== 'none' && /url\(/.test(bi)) {
        const urlMatch = bi.match(/url\(["']?([^"')]+)["']?\)/);
        return { bg_type: 'image', bg_video_src: null, bg_css: urlMatch ? urlMatch[1] : bi, bg_hex: null };
      }
      // 5. Gradient
      const grad = getGradientStops(sec);
      if (grad) {
        const stops = grad.map(rgbToHex).filter(Boolean);
        return { bg_type: 'gradient', bg_video_src: null, bg_css: bi, bg_gradient_stops: stops, bg_hex: stops[0] || null };
      }
      // 6. Solid color
      const solidBg = resolveEffectiveBg(sec);
      return { bg_type: 'solid', bg_video_src: null, bg_css: null, bg_hex: solidBg.hex };
    };

    // ---------- Basic typography ----------
    const body = document.body;
    const h1 = qsVisible('h1, [class*="hero"] [class*="headline"], [class*="hero"] [class*="title"]');
    const h2 = qsVisible('h2, main [class*="section-title"], main [class*="section-heading"]');
    const navLink = qsVisible('nav a, header nav a, header a');

    const px = (val) => val ? Math.round(parseFloat(val)) : null;

    const typography = {
      body_font_family:   cs(body, 'font-family'),
      body_font_size_px:  px(cs(body, 'font-size')),
      body_line_height:   cs(body, 'line-height'),
      h1_font_family:      cs(h1, 'font-family'),
      h1_font_size_px:     px(cs(h1, 'font-size')),
      h1_font_weight:      cs(h1, 'font-weight'),
      h1_line_height:      cs(h1, 'line-height'),
      h1_letter_spacing:   cs(h1, 'letter-spacing'),
      h1_text_sample:      h1 ? h1.textContent.trim().replace(/\s+/g, ' ').substring(0, 120) : null,
      h2_font_family:      h2 ? cs(h2, 'font-family') : null,
      h2_font_size_px:     h2 ? px(cs(h2, 'font-size')) : null,
      h2_font_weight:      h2 ? cs(h2, 'font-weight') : null,
      h2_line_height:      h2 ? cs(h2, 'line-height') : null,
      h2_letter_spacing:   h2 ? cs(h2, 'letter-spacing') : null,
      nav_font_size_px:    navLink ? px(cs(navLink, 'font-size')) : null,
      nav_font_weight:     navLink ? cs(navLink, 'font-weight') : null,
      nav_letter_spacing:  navLink ? cs(navLink, 'letter-spacing') : null,
      // Populated later in this evaluate block after @font-face scan
      self_hosted_fonts:   [],
      external_font_links: [],
    };

    const googleFonts = [];
    document.querySelectorAll('link[href*="fonts.googleapis.com"]').forEach(el => {
      googleFonts.push(el.href);
    });

    // Self-hosted @font-face detection (e.g. Silka, Söhne, custom typefaces)
    const selfHostedFonts = [];
    try {
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            if (rule.type === 5) { // CSSFontFaceRule
              const family = rule.style.fontFamily.replace(/['"]/g, '').trim();
              const src = rule.style.src || '';
              const woff2 = src.match(/url\(["']?([^"')]+\.woff2)["']?\)/)?.[1] || null;
              if (family && !selfHostedFonts.some(f => f.family === family)) {
                selfHostedFonts.push({ family, woff2_src: woff2 });
              }
            }
          }
        } catch(_) {}
      }
    } catch(_) {}

    // Other external font service link tags (Typekit, Bunny Fonts, Adobe, Fontshare, etc.)
    const externalFontLinks = [];
    document.querySelectorAll('link[rel="stylesheet"]').forEach(l => {
      const h = l.href || '';
      if (/typekit|bunny\.net|fontshare|adobe\.fonts|cloud\.typography/.test(h)) {
        externalFontLinks.push(h);
      }
    });

    // Backfill into typography
    typography.self_hosted_fonts   = selfHostedFonts;
    typography.external_font_links = externalFontLinks;

    // Raw CSS custom properties from :root / html rules
    const cssVarsRaw = {};
    try {
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            if (rule.selectorText === ':root' || rule.selectorText === 'html') {
              const varRegex = /--([\w-]+)\s*:\s*([^;]+);/g;
              let m;
              while ((m = varRegex.exec(rule.cssText)) !== null) {
                cssVarsRaw[`--${m[1]}`] = m[2].trim();
              }
            }
          }
        } catch {}
      }
    } catch {}

    // ---------- Area-weighted chromatic census (bg vs text, black included) ----------
    const bgWeights   = new Map(); // color -> { weight, sample }
    const textWeights = new Map();
    const surfaceWeights = new Map();
    const accentPool  = new Map(); // color -> { weight, sat, light, sample }
    let totalBgWeight = 0;

    const recordBg = (map, color, weight, el) => {
      if (!color || isTransparent(color)) return;
      const w = Math.min(weight, 20000000); // clamp pathological wrappers
      const prev = map.get(color) || { weight: 0, sample: describeEl(el) };
      prev.weight += w;
      map.set(color, prev);
      if (map === bgWeights) totalBgWeight += w;
    };

    document.querySelectorAll('body, body *').forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const area = rect.width * rect.height;

      const bg = cs(el, 'background-color');
      recordBg(bgWeights, bg, area, el);

      // Card-like elements feed the surface census
      if (/card|tile|panel|item|box/i.test(typeof el.className === 'string' ? el.className : '') ||
          ['ARTICLE', 'LI'].includes(el.tagName)) {
        recordBg(surfaceWeights, bg, area, el);
      }

      // Accent pool: saturated mid-area backgrounds
      const hx = rgbToHex(bg);
      const ch = hexToRgbChannels(hx);
      if (ch) {
        const { s, l } = rgbChannelsToHsl(ch[0], ch[1], ch[2]);
        if (s >= 0.25 && l > 0.08 && l < 0.95) {
          const prev = accentPool.get(bg) || { weight: 0, sat: s, light: l, sample: describeEl(el) };
          accentPool.set(bg, { ...prev, weight: prev.weight + area, sat: Math.max(prev.sat, s) });
        }
      }

      // Text census: weighted by characters of direct text
      let chars = 0;
      el.childNodes.forEach(n => { if (n.nodeType === 3) chars += (n.textContent || '').trim().length; });
      if (chars > 0) {
        const co = cs(el, 'color');
        if (co && !isTransparent(co)) {
          const prev = textWeights.get(co) || { weight: 0, sample: describeEl(el) };
          textWeights.set(co, { weight: prev.weight + chars, sample: prev.sample });
        }
      }
    });

    const pct = (w, total) => total > 0 ? +(w / total * 100).toFixed(2) : 0;

    const rankBgMap = (map, total, topN) =>
      [...map.entries()]
        .sort((a, b) => b[1].weight - a[1].weight)
        .slice(0, topN)
        .map(([color, info]) => ({
          hex: rgbToHex(color),
          rgb: color,
          coverage_pct: pct(info.weight, total),
          sample_selector: info.sample,
        }));

    const bgBaseCandidates = rankBgMap(bgWeights, totalBgWeight, 5);
    const surfaceCandidates = rankBgMap(surfaceWeights, totalBgWeight, 5);

    const accentCandidates = [...accentPool.entries()]
      .map(([color, i]) => ({ color, score: i.sat * Math.log10(10 + i.weight), info: i }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map(({ color, info }) => ({
        hex: rgbToHex(color),
        rgb: color,
        saturation: +info.sat.toFixed(2),
        coverage_pct: pct(info.weight, totalBgWeight),
        sample_selector: info.sample,
      }));

    const textCandidates = [...textWeights.entries()]
      .sort((a, b) => b[1].weight - a[1].weight)
      .slice(0, 4)
      .map(([color, info]) => ({
        hex: rgbToHex(color),
        rgb: color,
        char_weight: info.weight,
        sample_selector: info.sample,
      }));

    const palette = {
      body_bg:    cs(body, 'background-color'),
      body_color: cs(body, 'color'),
    };

    // Legacy top colors list (kept for backward compatibility, black now included)
    const colorMap = new Map();
    document.querySelectorAll('*').forEach(el => {
      const bg = cs(el, 'background-color');
      const co = cs(el, 'color');
      [bg, co].forEach(v => {
        if (v && v !== 'rgba(0, 0, 0, 0)' && v !== 'transparent') {
          colorMap.set(v, (colorMap.get(v) || 0) + 1);
        }
      });
    });
    const topColors = [...colorMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([color, freq]) => ({ color, frequency: freq, hex: rgbToHex(color) }));

    // ---------- Navbar ----------
    const nav = qsVisible('nav, header[class], [role="navigation"], [class*="navbar"], [class*="header"]');
    // El <nav> semántico suele ser solo la fila de links, sin el look visual real
    // (fondo, sticky/fixed, backdrop) — eso suele vivir en 1-2 ancestros distintos
    // (ej. un div con el "pill" de fondo/blur, y OTRO ancestro con position:fixed
    // que lo ancla a la pantalla). Verificado en vivo contra lorolabs.ai: <nav>
    // mide 20px sin fondo; el pill visual (backdrop-blur, 54px) y el wrapper
    // sticky/fixed son dos divs DISTINTOS en la cadena de ancestros — no asumir
    // que es el mismo elemento.
    const navChrome = (() => {
      if (!nav) return { visual: null, sticky: null };
      // Ningún navbar real mide más de ~300px de alto (ni con mega-menú cerrado) —
      // sin este límite, un ancestro con bg/backdrop que en realidad es un wrapper de
      // página completa (ej. <main>, <body>) puede aceptarse como "el navbar visual",
      // devolviendo alturas absurdas (confirmado en vivo: 13019px en un caso real).
      const NAV_MAX_HEIGHT = 300;
      let visual = null, sticky = null, cur = nav, depth = 0;
      while (cur && depth < 6 && !(visual && sticky)) {
        const cs2 = window.getComputedStyle(cur);
        const h = cur.getBoundingClientRect().height;
        if (!visual && h <= NAV_MAX_HEIGHT && cs2.backdropFilter && cs2.backdropFilter !== 'none') visual = cur;
        if (!visual && h <= NAV_MAX_HEIGHT && cs2.backgroundColor && cs2.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs2.backgroundColor !== 'transparent') visual = cur;
        if (!sticky && ['fixed', 'sticky'].includes(cs2.position)) sticky = cur;
        cur = cur.parentElement; depth++;
      }
      return { visual: visual || nav, sticky: sticky || nav };
    })();
    const navRect = navChrome.visual ? navChrome.visual.getBoundingClientRect() : null;
    const navLinks = [];
    const seenNavHrefs = new Set();
    if (nav) {
      nav.querySelectorAll('a').forEach(a => {
        const text = a.textContent.trim().replace(/\s+/g, ' ');
        if (text && text.length > 1 && text.length < 40 && a.href && !seenNavHrefs.has(a.href)) {
          seenNavHrefs.add(a.href);
          navLinks.push({ text, href: a.href });
        }
      });
    }
    // initial_transparent: el nav puede empezar con fondo transparente y activar
    // backdrop/bg al hacer scroll — patrón scroll-activated header. Se detecta
    // leyendo el bg computado en el estado inicial (top of page, sin scroll).
    const navBgColor = navChrome.visual ? cs(navChrome.visual, 'background-color') : null;
    const navInitialTransparent = (() => {
      if (!navBgColor) return false;
      if (navBgColor === 'rgba(0, 0, 0, 0)' || navBgColor === 'transparent') return true;
      const m = navBgColor.match(/rgba?\([^)]+,\s*([\d.]+)\)/);
      return m ? parseFloat(m[1]) < 0.1 : false;
    })();
    const navVisualRadius = navChrome.visual ? px(cs(navChrome.visual, 'border-radius')) : 0;
    const navVisualWidth  = navRect ? Math.round(navRect.width) : null;
    // Pill interno de nav_links: algunos headers agrupan los links de navegación en su
    // propio sub-contenedor con fondo/radio propios (ej. una píldora oscura), distinto
    // del navbar general (que puede ser transparente/full-width). Sin esto, ese pill
    // visual se pierde por completo — el navbar general se captura bien, pero los
    // links terminan como texto plano sin envoltorio.
    const navLinksPill = (() => {
      if (!nav) return null;
      const bg = cs(nav, 'background-color');
      const radius = px(cs(nav, 'border-radius'));
      const hasOwnBg = bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
      const outerBg = navChrome.visual ? cs(navChrome.visual, 'background-color') : null;
      if (nav !== navChrome.visual && ((hasOwnBg && bg !== outerBg) || (radius && radius > 0))) {
        const r = nav.getBoundingClientRect();
        return {
          bg_hex: hasOwnBg ? rgbToHex(bg) : null,
          border_radius_px: radius || 0,
          width_px: Math.round(r.width),
          height_px: Math.round(r.height),
        };
      }
      return null;
    })();
    const navbar = {
      height_px:           navRect ? Math.round(navRect.height) : null,
      position:            navChrome.sticky ? cs(navChrome.sticky, 'position') : null,
      is_sticky:           navChrome.sticky ? ['sticky', 'fixed'].includes(cs(navChrome.sticky, 'position')) : false,
      has_backdrop:        navChrome.visual ? (cs(navChrome.visual, 'backdrop-filter') !== 'none' && cs(navChrome.visual, 'backdrop-filter') !== '') : false,
      bg_color:            navBgColor,
      border_radius_px:    navVisualRadius,
      // full-width: el nav visual ocupa ≥95% del viewport — distingue pill flotante
      // (is_full_width:false, border_radius_px alto) de header clásico de borde a borde.
      is_full_width:       navVisualWidth !== null ? navVisualWidth >= window.innerWidth * 0.95 : true,
      initial_transparent: navInitialTransparent,
      nav_links:           navLinks.slice(0, 10),
      nav_links_pill:      navLinksPill,
    };

    // ---------- Hero ----------
    // El hero real no siempre tiene naming "hero" ni es hijo directo de <main>
    // (frameworks con componentes "isla" — Astro Islands, etc. — insertan un
    // wrapper display:contents entre main y el contenido real, rompiendo los
    // selectores estructurales de abajo). Derivarlo desde el <h1> visible es
    // más robusto: casi todo hero envuelve su propio <h1> en un <section>.
    const heroFromHeadline = (() => {
      if (!h1) return null;
      const sec = h1.closest('section');
      if (sec) return sec;
      let cur = h1.parentElement, depth = 0;
      while (cur && cur !== document.body && depth < 10) {
        if (cur.getBoundingClientRect().height >= window.innerHeight * 0.8) return cur;
        cur = cur.parentElement; depth++;
      }
      return null;
    })();
    const heroEl = heroFromHeadline || qsVisible(
      '[class*="hero"], [id*="hero"], main > section:first-of-type, header + section, main > div:first-of-type'
    );
    const ctaButtons = [];
    if (heroEl) {
      heroEl.querySelectorAll('a[href], button').forEach(btn => {
        if (!isVisible(btn)) return;
        const text = btn.textContent.trim().replace(/\s+/g, ' ');
        if (text && text.length > 1 && text.length < 50) {
          ctaButtons.push({
            text,
            border_radius_px: px(cs(btn, 'border-radius')),
            bg_color:         cs(btn, 'background-color'),
            bg_hex:           rgbToHex(cs(btn, 'background-color')),
            color:            cs(btn, 'color'),
            color_hex:        rgbToHex(cs(btn, 'color')),
            box_shadow:       (() => { const s = cs(btn, 'box-shadow'); return s && s !== 'none' ? s : null; })(),
          });
        }
      });
    }

    let signatureAssetType = 'F'; // default: text_only_editorial (no media detected)
    let assetPattern = null;   // specific pattern within type A
    let assetLibrary = null;   // JS library driving the asset, if detectable
    let assetDimsPx = null;    // {width, height} of the primary canvas/media element

    if (heroEl) {
      const heroCanvas = heroEl.querySelector('canvas');
      if (heroCanvas) {
        signatureAssetType = 'A';
        assetDimsPx = { width: heroCanvas.offsetWidth || heroCanvas.width || null,
                        height: heroCanvas.offsetHeight || heroCanvas.height || null };
        // Detect asset pattern from canvas id/class and known library globals
        const canvasId  = (heroCanvas.id || '').toLowerCase();
        const canvasCls = (heroCanvas.className || '').toLowerCase();
        const bodyText  = document.body.innerHTML.toLowerCase();
        if (/globe|earth|world|sphere/.test(canvasId + canvasCls) ||
            /globe\.gl|globejs|three.*sphere|orb/.test(bodyText))
          assetPattern = 'globe', assetLibrary = /globe\.gl/.test(bodyText) ? 'globe.gl' : 'three.js';
        else if (/particle|confetti|snow/.test(canvasId + canvasCls) ||
            /tsparticles|particles\.js|particlesjs/.test(bodyText))
          assetPattern = 'particles', assetLibrary = /tsparticles/.test(bodyText) ? 'tsparticles' : 'particles.js';
        else if (/network|neural|connect|graph|node/.test(canvasId + canvasCls))
          assetPattern = 'network', assetLibrary = 'canvas_api';
        else if (/fluid|wave|morph|blob/.test(canvasId + canvasCls) ||
            /vanta|shadertoy/.test(bodyText))
          assetPattern = 'fluid', assetLibrary = /vanta/.test(bodyText) ? 'vanta' : 'shader';
        else
          assetPattern = 'unknown', assetLibrary = 'unknown';
      } else if (heroEl.querySelector('[class*="mockup"], [class*="screenshot"], [class*="app-window"], [class*="window"]'))
        signatureAssetType = 'B';
      else if (heroEl.querySelector('svg[viewBox]') && !heroEl.querySelector('canvas'))
        signatureAssetType = 'C';
      else if (heroEl.querySelector('[class*="bento"], [class*="grid-showcase"]'))
        signatureAssetType = 'D';
      else if (heroEl.querySelector('video, [style*="background-image"]'))
        signatureAssetType = 'E';
      else if (heroEl.querySelector('img, picture'))
        signatureAssetType = 'E'; // photo hero also E
    }

    // Detect hero layout type (centered / split_media_left / split_media_right / asymmetric / full_bleed_media)
    let heroLayoutType = 'centered';
    if (heroEl) {
      const HFGRID = ['grid', 'flex', 'inline-grid', 'inline-flex'];
      let heroLayoutEl = heroEl;
      if (!HFGRID.includes(cs(heroEl, 'display'))) {
        const lvl1 = [...heroEl.children].find(el => HFGRID.includes(cs(el, 'display')));
        if (lvl1) heroLayoutEl = lvl1;
      }
      if (HFGRID.includes(cs(heroLayoutEl, 'display'))) {
        const cols = [...heroLayoutEl.children].filter(el => {
          const r = el.getBoundingClientRect();
          return r.width > 80 && r.height > 80;
        });
        if (cols.length >= 2) {
          const r0 = cols[0].getBoundingClientRect();
          const r1 = cols[1].getBoundingClientRect();
          // Side-by-side: vertical overlap means they're in the same row
          if (Math.abs(r0.top - r1.top) < r0.height * 0.3) {
            const tw = r0.width + r1.width;
            const p0 = r0.width / tw;
            const hasMedia0 = !!cols[0].querySelector('img, video, canvas, svg[viewBox]');
            if (Math.abs(p0 - 0.5) < 0.08) {
              heroLayoutType = hasMedia0 ? 'split_media_left' : 'split_media_right';
            } else {
              heroLayoutType = hasMedia0 ? 'asymmetric_media_left' : 'asymmetric_media_right';
            }
          }
        }
      }
      // Override: centered h1 wins over split detection
      const h1el = heroEl.querySelector('h1, [class*="headline"], [class*="hero-title"]');
      if (h1el && ['center', 'middle'].includes(cs(h1el, 'text-align'))) heroLayoutType = 'centered';
      // Video background = full bleed
      if (heroEl.querySelector('video, [class*="bg-video"], [class*="video-bg"]')) heroLayoutType = 'full_bleed_media';
    }

    const hero = {
      headline_text:           typography.h1_text_sample,
      headline_font_size_px:   typography.h1_font_size_px,
      has_canvas:              heroEl ? !!heroEl.querySelector('canvas') : false,
      has_video:               heroEl ? !!heroEl.querySelector('video') : false,
      has_svg_animation:       heroEl ? !!heroEl.querySelector('svg[class*="anim"]') : false,
      signature_asset_type:    signatureAssetType,
      asset_pattern:           assetPattern,
      asset_library:           assetLibrary,
      asset_dims_px:           assetDimsPx,
      layout_type:             heroLayoutType,
      effective_bg:            resolveEffectiveBg(heroEl || document.body),
      cta_buttons:             ctaButtons.slice(0, 3),
      layout_classes:          heroEl ? heroEl.className : null,
    };

    // ---------- Global layout ----------
    const container = qsVisible(
      'main [class*="container"], main [class*="wrapper"], [class*="max-w"], main, [id="main"]'
    );
    const globalLayout = {
      max_width_px:     container ? px(cs(container, 'max-width')) : null,
      padding_left_px:  container ? px(cs(container, 'padding-left')) : null,
    };

    // ---------- Section sequence (with rhythm + effective bg) ----------
    // Three-tier selection:
    //  1. Granular <section> matches inside main landmarks.
    //  2. Direct children wrappers of main / [role="main"] (div-based sites).
    //  3. No landmark at all → descend into the tallest visible body child.
    const innerSel = 'main section, [role="main"] section, body > section:not(header):not(footer)';
    const tall = (el, min) => el.getBoundingClientRect().height >= min;
    const inners = [...document.querySelectorAll(innerSel)].filter(el => tall(el, 120));

    let outers;
    const skipTags = ['SCRIPT', 'NAV', 'HEADER', 'FOOTER', 'STYLE', 'LINK'];
    const pickBlocks = (parent) =>
      [...parent.children].filter(el => {
        if (skipTags.includes(el.tagName.toUpperCase())) return false;
        const r = el.getBoundingClientRect();
        if (r.height < 180) return false;
        if (r.width < window.innerWidth * 0.5) return false; // section-level blocks are full-width
        if (cs(el, 'position') === 'fixed') return false;     // overlays / floating UI
        if (el.hasAttribute('aria-hidden')) return false;      // decorative layers
        return true;
      });

    let blocks = [];
    {
      let cursor = qsVisible('main, [role="main"]');
      if (!cursor) {
        cursor = [...document.body.children]
          .filter(el => /^(DIV|SECTION|ASIDE)$/i.test(el.tagName) && tall(el, 400))
          .sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height)[0] || null;
      }
      let guard = 0;
      while (cursor && guard < 8) {   // descend through nested wrappers
        guard++;
        blocks = pickBlocks(cursor);
        if (blocks.length >= 2) {
          // If one block dominates the page height, expand it into its children
          const hs = blocks.map(el => el.getBoundingClientRect().height);
          const total = hs.reduce((a, b) => a + b, 0);
          const maxI = hs.indexOf(Math.max(...hs));
          if (hs[maxI] / total > 0.72 && blocks.length <= 3) {
            const inner = pickBlocks(blocks[maxI]);
            if (inner.length >= 2) { blocks = [...blocks.slice(0, maxI), ...inner, ...blocks.slice(maxI + 1)]; }
            break;
          }
          break;
        }
        cursor = blocks.length === 1 ? blocks[0] : null;
      }
    }
    outers = blocks;

    let chosen;
    const meaningfulInners = inners.filter(el => !inners.some(o => o !== el && o.contains(el)));
    if (meaningfulInners.length >= 2) chosen = meaningfulInners;
    else                              chosen = outers;
    chosen = chosen.filter((el, i) =>
      !chosen.some((o, j) => i !== j && (o.contains(el))) // drop elements nested inside another chosen
    );

    const sectionSequence = [];
    let idx = 1;
    let prevBottom = null;

    // ---------- Geometry helpers ----------
    const parseColRatios = (raw) => {
      if (!raw || raw === 'none') return null;
      const parts = raw.split(' ').filter(Boolean);
      if (parts.length < 2) return null;
      const nums = parts.map(p => parseFloat(p));
      if (nums.some(n => Number.isNaN(n) || n <= 0)) return null;
      const total = nums.reduce((a, b) => a + b, 0);
      return nums.map(n => +(n / total * 100).toFixed(1));
    };

    const collectMediaSlots = (scopeEl, sectionTitle, isHeroSection) => {
      const slots = [];
      const seenKeys = new Set();
      const addSlot = (mEl, forceRole, forceImageSrc) => {
        if (slots.length >= 5) return;
        const r = mEl.getBoundingClientRect();
        if (r.width < 60 || r.height < 60) return;
        const key = `${Math.round(r.left)}:${Math.round(r.top)}`;
        if (seenKeys.has(key)) return;
        seenKeys.add(key);
        let role = forceRole || 'inline_media';
        if (isHeroSection) role = forceRole || 'hero_media';
        else if (!forceRole && mEl.closest('[class*="card"], article')) role = 'card_thumbnail';
        else if (!forceRole && r.width > window.innerWidth * 0.6) role = 'full_bleed';
        // Un <iframe> (YouTube/Vimeo/Google Maps embebido) es invisible a los selectores
        // de img/video/background-image — sin esto, una sección cuyo único contenido
        // visual es un embed reporta media_slots vacío y Fase 8 no tiene ninguna señal
        // de que ahí había algo que reproducir.
        const embedIframeEl = mEl.tagName === 'IFRAME' ? mEl : mEl.querySelector('iframe');
        const embed_src = embedIframeEl ? (embedIframeEl.getAttribute('src') || null) : null;
        const embed_provider = !embed_src ? null
          : /youtube\.com|youtu\.be/i.test(embed_src) ? 'youtube'
          : /vimeo\.com/i.test(embed_src) ? 'vimeo'
          : /google\.[a-z.]+\/maps/i.test(embed_src) ? 'google_maps'
          : 'unknown';
        if (embedIframeEl && !forceRole) role = 'embedded_iframe';
        const mask = cs(mEl, 'mask-image') || cs(mEl, '-webkit-mask-image');
        const treatment = mask && mask !== 'none' ? 'masked'
          : cs(mEl, 'filter') && cs(mEl, 'filter') !== 'none' ? 'filtered'
          : 'cover';
        const videoEl = mEl.tagName === 'VIDEO' ? mEl : mEl.querySelector('video');
        const is_video = !!videoEl;
        const video_src = videoEl ? (videoEl.currentSrc || (videoEl.querySelector('source') || {}).src || null) : null;
        const video_poster = videoEl ? (videoEl.getAttribute('poster') || null) : null;
        const image_src = forceImageSrc || (
          mEl.tagName === 'IMG' ? (mEl.currentSrc || mEl.src || null)
          : mEl.tagName === 'PICTURE' ? ((mEl.querySelector('img') || {}).currentSrc || (mEl.querySelector('img') || {}).src || null)
          : null
        );
        // El radius puede estar en el propio elemento o en un wrapper que lo
        // recorta (patrón común: <div style="overflow:hidden;border-radius:Xpx"><img/></div>) —
        // sin esto, imágenes visualmente redondeadas por su contenedor se
        // reportarían como radius 0.
        const ownRadius = px(cs(mEl, 'border-radius'));
        const wrapperEl = mEl.parentElement;
        const wrapperRadius = wrapperEl && cs(wrapperEl, 'overflow') === 'hidden' ? px(cs(wrapperEl, 'border-radius')) : null;
        const border_radius_px = (ownRadius && ownRadius > 0) ? ownRadius : (wrapperRadius || 0);
        slots.push({
          role,
          width_px: Math.round(r.width),
          height_px: Math.round(r.height),
          aspect_ratio: +(r.width / r.height).toFixed(2),
          treatment,
          suggested_theme: sectionTitle,
          is_video,
          video_src,
          video_poster,
          image_src,
          border_radius_px,
          is_embedded_iframe: !!embedIframeEl,
          embed_provider,
          embed_src,
        });
      };
      // Pass 1: explicit media elements and inline style backgrounds
      scopeEl.querySelectorAll('img, picture, video, iframe, [style*="background-image"]').forEach(el => addSlot(el, null));
      // Pass 2: CSS class background-images (missed by querySelectorAll)
      if (slots.length < 5) {
        scopeEl.querySelectorAll('div, section, figure, span, header').forEach(el => {
          if (slots.length >= 5) return;
          const bg = cs(el, 'background-image');
          if (bg && bg !== 'none' && /url\(/.test(bg)) {
            const urlMatch = bg.match(/url\((['"]?)(.*?)\1\)/);
            addSlot(el, isHeroSection ? 'hero_media' : 'full_bleed', urlMatch ? urlMatch[2] : null);
          }
        });
      }
      return slots;
    };

    chosen.forEach(sec => {
      if (idx > 12) return;
      sec.setAttribute('data-dna-section', String(idx));
      const secRect = sec.getBoundingClientRect();
      const gapAbove = prevBottom !== null ? Math.round(secRect.top - prevBottom) : null;
      prevBottom = secRect.bottom;

      const secH = sec.querySelector('h1, h2, h3');
      const title = secH
        ? secH.textContent.trim().replace(/\s+/g, ' ').substring(0, 80)
        : `Section ${idx}`;

      // --- Layout cascade: section → direct child → grandchild (container > grid pattern) ---
      // Most modern sites wrap grid/flex in a div inside the section, not on the section itself.
      const FLEX_GRID = ['grid', 'flex', 'inline-grid', 'inline-flex'];
      let layoutEl = sec;

      if (!FLEX_GRID.includes(cs(sec, 'display'))) {
        const lvl1 = [...sec.children].find(el => FLEX_GRID.includes(cs(el, 'display')));
        if (lvl1) {
          layoutEl = lvl1;
        } else {
          for (const child of sec.children) {
            const lvl2 = [...child.children].find(el => FLEX_GRID.includes(cs(el, 'display')));
            if (lvl2) { layoutEl = lvl2; break; }
          }
        }
      }

      const layoutDisplay = cs(layoutEl, 'display');
      const gridCols      = cs(layoutEl, 'grid-template-columns');
      const hasGrid       = ['grid', 'inline-grid'].includes(layoutDisplay);
      const hasFlex       = ['flex', 'inline-flex'].includes(layoutDisplay);
      const layout_source = layoutEl === sec ? 'section_self' : 'inner_container';

      // Flex-row column count: cuando el layout es flex en fila, el grid-template-columns
      // no aplica pero los hijos visibles SÍ representan columnas. Se miden sus anchos
      // reales para derivar `colCount` y `columns_ratios_pct` — misma semántica que
      // en un grid CSS pero derivados del DOM en lugar de del computed style de grid.
      let flexColCount = null;
      let flexColRatiosPct = null;
      if (hasFlex && !hasGrid) {
        const flexDir = cs(layoutEl, 'flex-direction');
        if (!flexDir.includes('column')) {
          // Solo fila (row / row-reverse): contar hijos con ancho sustancial
          const flexKids = [...layoutEl.children].filter(ch => {
            const r = ch.getBoundingClientRect();
            return r.width > 40 && r.height > 20 && isVisible(ch);
          });
          if (flexKids.length >= 2) {
            flexColCount = flexKids.length;
            const totalW = flexKids.reduce((s, ch) => s + ch.getBoundingClientRect().width, 0);
            if (totalW > 0) {
              flexColRatiosPct = flexKids.map(ch =>
                Math.round(ch.getBoundingClientRect().width / totalW * 100)
              );
            }
          }
        }
      }

      const colCount           = hasGrid && gridCols !== 'none'
        ? gridCols.split(' ').filter(Boolean).length
        : (flexColCount || null);
      const colRatiosPctFinal  = hasGrid ? parseColRatios(gridCols) : (flexColRatiosPct || null);

      // Card detection: named selectors first; if grid found with no named cards,
      // infer cards from direct children of the layout element.
      const namedCardsRaw = [...sec.querySelectorAll(
        '[class*="card"], article, [class*="item"], [class*="tile"], ' +
        '[class*="feature"], [class*="benefit"], [class*="service"], ' +
        '[class*="project"], [class*="post"], [class*="entry"]'
      )];
      // Filtrar por tamaño mínimo (evita badges/dots/pills) y eliminar matches
      // anidados (si un candidato contiene a otro, solo el contenedor externo cuenta) —
      // sin esto, selectores amplios como [class*="item"] pueden atrapar decenas de
      // elementos internos de un carrusel/slider y corromper cardsDetail[0].
      const namedCards = namedCardsRaw.filter(el => {
        const r = el.getBoundingClientRect();
        if (r.width <= 80 || r.height <= 80) return false;
        if (el.tagName === 'STYLE' || el.tagName === 'SCRIPT') return false;
        return !namedCardsRaw.some(other => other !== el && other.contains(el));
      });
      const inferredCards = (hasGrid && namedCards.length === 0)
        ? [...layoutEl.children].filter(el => {
            const r = el.getBoundingClientRect();
            return r.width > 80 && r.height > 80
              && el.tagName !== 'STYLE' && el.tagName !== 'SCRIPT';
          })
        : [];
      const cardsArr  = namedCards.length > 0 ? [...namedCards] : inferredCards;
      const firstCard = cardsArr[0] || null;
      const cardCount = cardsArr.length;

      // Marquee: animación CSS de scroll continuo — detectar por clase o por
      // animation computada en el contenedor o en sus hijos directos.
      const isMarquee = !!sec.querySelector('[class*="marquee"], [class*="ticker"], [class*="scroller"]')
        || (() => {
          const anim = cs(layoutEl, 'animation-name') || cs(layoutEl, 'animation') || '';
          if (anim && anim !== 'none' && anim !== '') return true;
          const firstKid = layoutEl.firstElementChild;
          if (!firstKid) return false;
          const ka = cs(firstKid, 'animation-name') || cs(firstKid, 'animation') || '';
          return ka && ka !== 'none' && ka !== '';
        })();

      // Overflow-x scroll/auto sin carousel class explícita → flow horizontal
      const isHorizFlow = !isMarquee && (
        cs(layoutEl, 'overflow-x') === 'auto' || cs(layoutEl, 'overflow-x') === 'scroll'
        || cs(sec, 'overflow-x') === 'auto' || cs(sec, 'overflow-x') === 'scroll'
      );

      let layoutType = 'standard_flow';
      if (hasGrid && cardCount >= 3)       layoutType = 'grid_cards';
      else if (hasGrid && cardCount === 2) layoutType = 'split_2col';
      else if (isMarquee)                  layoutType = 'marquee_continuous';
      else if (isHorizFlow)                layoutType = 'flow_horizontal_scroll';
      else if (sec.querySelector('[class*="carousel"], [class*="slider"], [class*="swiper"]')) layoutType = 'carousel_horizontal';
      else if (sec.querySelector('form'))                                                      layoutType = 'form_cta';
      else if (sec.querySelector('[role="tablist"], [class*="tab"]'))                          layoutType = 'tabs_interactive';
      else if (sec.querySelector('details, [class*="accordion"]'))                             layoutType = 'accordion';
      else if (sec.querySelector('[class*="timeline"]'))                                       layoutType = 'timeline';
      else if (hasFlex && cardCount > 2)                                                       layoutType = 'flex_row';

      // Geometry: container, rhythm, heading
      const innerContainer = sec.querySelector('[class*="container"], [class*="wrapper"]');
      const headingInfo = secH ? {
        text_sample: title,
        font_size_px: px(cs(secH, 'font-size')),
        font_weight: cs(secH, 'font-weight'),
        text_align: cs(secH, 'text-align'),
      } : null;

      // Cards detail (up to 3 per section)
      const cardsDetail = cardsArr.slice(0, 3).map(card => {
        const imgEl = card.querySelector('img, picture');
        const imgRect = imgEl ? imgEl.getBoundingClientRect() : null;
        const firstContent = card.querySelector('h2, h3, h4, p, img, picture, [style*="background-image"]');
        const cardRect = card.getBoundingClientRect();
        return {
          border_radius_px: px(cs(card, 'border-radius')),
          border:           cs(card, 'border'),
          box_shadow:       cs(card, 'box-shadow'),
          padding_x_px:     px(cs(card, 'padding-left')),
          padding_y_px:     px(cs(card, 'padding-top')),
          has_tag_pill:     !!card.querySelector('[class*="tag"], [class*="chip"], [class*="badge"], [class*="pill"]'),
          image_aspect_ratio: imgRect && imgRect.height > 0 ? +(imgRect.width / imgRect.height).toFixed(2) : null,
          content_order:    firstContent && /^(img|picture)$/i.test(firstContent.tagName) ? 'media_first' : 'text_first',
          width_px:         Math.round(cardRect.width),
          height_px:        Math.round(cardRect.height),
        };
      });

      // --- Slider / carousel detection ---
      const hasSliderClass = !![...sec.querySelectorAll(
        '[class*="carousel"],[class*="slider"],[class*="swiper"],[class*="embla"],[class*="splide"],[class*="glide"]'
      )].length;
      const hasPrevNext = !![...sec.querySelectorAll(
        '[aria-label*="prev" i],[aria-label*="next" i],[aria-label*="anterior" i],[aria-label*="siguiente" i],[class*="prev"],[class*="next"]'
      )].length;
      const hasDots = !![...sec.querySelectorAll(
        '[role="group"][aria-label],[class*="dot"],[class*="pag"],[class*="indicator"]'
      )].length;
      const hasHorizScroll = (() => {
        const trackEl = findTrackyEl(sec) || sec.querySelector('[class*="list"],[class*="wrapper"]') || sec;
        const ov = cs(trackEl, 'overflow-x');
        const snap = cs(trackEl, 'scroll-snap-type');
        return ov === 'auto' || ov === 'scroll' || (!!snap && snap !== 'none');
      })();
      const has_slider = hasSliderClass || hasPrevNext || hasDots || hasHorizScroll;
      const slider_type = has_slider
        ? (hasDots && hasPrevNext ? 'dot_pagination_with_controls' : hasDots ? 'dot_pagination' : hasPrevNext ? 'prev_next_only' : 'scroll_snap')
        : null;

      // --- Marquee / ticker detection ---
      // Guard: if this is already a slider, duplicate DOM content comes from slide cloning — not a marquee.
      const marqueeEl = findTrackyEl(sec);
      const hasMarqueeClass = !!marqueeEl;
      const logoImgs = [...sec.querySelectorAll('img')];
      const imgSrcs = logoImgs.map(i => i.getAttribute('src') || i.getAttribute('alt') || '');
      const hasDuplicateContent = !has_slider && imgSrcs.length > 2 && new Set(imgSrcs).size < imgSrcs.length;
      const hasScrollAnimation = marqueeEl
        ? !!(cs(marqueeEl, 'animation-name') || '').replace('none', '').trim()
        : false;
      const has_marquee = hasMarqueeClass || hasDuplicateContent || hasScrollAnimation;

      // --- Marquee row count & directions ---
      let marquee_rows = 0;
      let marquee_directions = [];
      if (has_marquee) {
        const animatedTracks = findAllTrackyEls(sec)
          .filter(el => { const an = cs(el, 'animation-name'); return an && an !== 'none'; });
        marquee_rows = animatedTracks.length || 1;
        marquee_directions = animatedTracks.map(track => {
          const animDir = cs(track, 'animation-direction') || '';
          return /reverse|alternate-reverse/i.test(animDir) ? 'right_to_left_reversed' : 'left_to_right';
        });
        if (marquee_directions.length === 0) marquee_directions = ['left_to_right'];
      }

      // --- Marquee item type (text vs image) ---
      let marquee_item_type = null;
      let marquee_text_items = [];
      if (has_marquee) {
        const trackEl2 = findTrackyEl(sec) || sec;
        const mImgs = [...trackEl2.querySelectorAll('img,svg')];
        const mTexts = [...trackEl2.querySelectorAll('span,p,a,li,[class*="item"],[class*="logo"],[class*="brand"]')]
          .filter(el => !el.querySelector('img,svg'))
          .map(el => el.textContent.trim().replace(/\s+/g,' '))
          .filter(t => t.length > 0 && t.length < 60);
        if (mImgs.length >= mTexts.length) {
          marquee_item_type = 'image';
        } else {
          marquee_item_type = 'text';
          // Deduplicate (loop clones content)
          const seen = new Set();
          for (const t of mTexts) { if (!seen.has(t)) { seen.add(t); marquee_text_items.push(t); } if (seen.size >= 8) break; }
        }
      }

      // --- Stats row detection ---
      // A stats section has groups of (large number + small label) pairs but no large body copy
      const statEls = [...sec.querySelectorAll('*')].filter(el => {
        const txt = el.textContent.trim();
        const fsize = px(cs(el, 'font-size')) || 0;
        return fsize >= 36 && /^\+?[\d,.]+[kKmM%+]?$/.test(txt) && !el.querySelector('*:not(span):not(strong):not(em)');
      });
      const is_stats_row = !has_slider && !has_marquee && statEls.length >= 2;

      // --- FAQ / Accordion detection ---
      const faqEls = [...sec.querySelectorAll(
        'details, [class*="faq"], [class*="accordion"], [class*="collapse"], [class*="expand"], [class*="disclosure"]'
      )];
      const has_faq = faqEls.length > 0;
      let faq_style = null;
      let faq_items_count = 0;
      if (has_faq) {
        const hasDetails = sec.querySelectorAll('details').length > 0;
        const hasAccClass = sec.querySelectorAll('[class*="accordion"]').length > 0;
        faq_style = hasDetails ? 'native_details' : hasAccClass ? 'accordion_class' : 'custom';
        faq_items_count = faqEls.filter(el => {
          const tag = el.tagName.toLowerCase();
          return tag === 'details' || el.classList.toString().match(/item|entry|row/i);
        }).length || faqEls.length;
      }

      // --- Editorial long-text block detection (candidate for scroll-scrub word reveal) ---
      const wordCount = (sec.textContent || '').trim().split(/\s+/).filter(Boolean).length;
      const hasMediaInSection = sec.querySelectorAll('img,picture,video,canvas,svg').length > 0;
      const is_editorial_text_block = !has_slider && !has_marquee && !is_stats_row && !has_faq
        && cardCount === 0 && !hasMediaInSection && wordCount > 40;

      sectionSequence.push({
        index:                 idx++,
        name:                  title,
        layout_type:           layoutType,
        columns:               colCount,
        columns_ratios_pct:    colRatiosPctFinal,
        gap_px:                (() => { const g = cs(layoutEl, 'gap') || cs(layoutEl, 'column-gap') || cs(sec, 'gap') || cs(sec, 'column-gap'); return g && g !== 'normal' ? px(g) : null; })(),
        flex_direction:        hasFlex ? cs(layoutEl, 'flex-direction') : null,
        estimated_cards:       cardCount,
        layout_source,
        has_slider,
        slider_type,
        has_marquee,
        marquee_rows,
        marquee_directions,
        marquee_item_type,
        marquee_text_items:    marquee_text_items.length ? marquee_text_items : undefined,
        is_stats_row,
        has_faq,
        faq_style,
        faq_items_count,
        is_editorial_text_block,
        ...classifySectionBg(sec),
        container:             innerContainer ? {
          max_width_px: px(cs(innerContainer, 'max-width')),
          padding_left_px: px(cs(innerContainer, 'padding-left')),
        } : null,
        padding_top_px:        px(cs(sec, 'padding-top')),
        padding_bottom_px:     px(cs(sec, 'padding-bottom')),
        // Alias histórico — padding_y_px era solo el top; se mantiene para
        // blueprints generados antes de esta versión pero no se usa en nuevas reglas.
        padding_y_px:          px(cs(sec, 'padding-top')),
        min_height_px:         Math.round(secRect.height),
        align_items:           (hasFlex || hasGrid) ? cs(layoutEl, 'align-items') : null,
        justify_content:       (hasFlex || hasGrid) ? cs(layoutEl, 'justify-content') : null,
        heading:               headingInfo,
        cards_detail:          cardsDetail,
        media_slots:           collectMediaSlots(sec, title, false),
        gap_above_px:          gapAbove,
        effective_bg:          resolveEffectiveBg(sec),
        card_border_radius_px: firstCard ? px(cs(firstCard, 'border-radius')) : null,
        card_border:           firstCard ? cs(firstCard, 'border') : null,
        card_bg:               firstCard ? cs(firstCard, 'background-color') : null,
        card_bg_hex:           firstCard ? rgbToHex(cs(firstCard, 'background-color')) : null,
        has_tag_pill:          !!(firstCard && firstCard.querySelector('[class*="tag"], [class*="chip"], [class*="badge"], [class*="pill"]')),
        has_image:             !!(firstCard && firstCard.querySelector('img, picture, [style*="background-image"]')),
      });
    });

    // Hero media slots (hero may not be part of chosen sections)
    if (!sectionSequence.some(s => s.media_slots.some(m => m.role === 'hero_media'))) {
      const heroSlots = heroEl ? collectMediaSlots(heroEl, 'Hero', true) : [];
      if (heroSlots.length && sectionSequence.length) sectionSequence[0].media_slots = [...heroSlots, ...sectionSequence[0].media_slots];
    }

    const firstPageCard = qsVisible(
      'main section:not(:first-of-type) [class*="card"], main section:not(:first-of-type) article'
    );
    const cardMorphology = {
      border_radius_px: firstPageCard ? px(cs(firstPageCard, 'border-radius')) : null,
      border:           firstPageCard ? cs(firstPageCard, 'border') : null,
      bg_color:         firstPageCard ? cs(firstPageCard, 'background-color') : null,
      bg_hex:           firstPageCard ? rgbToHex(cs(firstPageCard, 'background-color')) : null,
      box_shadow:       firstPageCard ? cs(firstPageCard, 'box-shadow') : null,
      padding_px:       firstPageCard ? px(cs(firstPageCard, 'padding-top')) : null,
      sample_selector:  firstPageCard ? describeEl(firstPageCard) : null,
      hover_test_selector: firstPageCard ? tagForHover(firstPageCard) : null,
    };

    // ---------- Footer ----------
    const footerEl = qsVisible('footer, [role="contentinfo"]');
    const footerLinks = [];
    let footerLinkSampleSelector = null;
    let footerLinkHoverTestSelector = null;
    if (footerEl) {
      footerEl.querySelectorAll('a').forEach(a => {
        const t = a.textContent.trim().replace(/\s+/g, ' ');
        if (t && t.length > 1 && t.length < 40) {
          footerLinks.push(t);
          if (!footerLinkSampleSelector) {
            footerLinkSampleSelector = describeEl(a);
            footerLinkHoverTestSelector = tagForHover(a);
          }
        }
      });
    }
    // Detect footer column structure
    let footerColumns = 1;
    let footerHasSocial = false;
    let footerHasNewsletter = false;
    let footerCopyrightText = null;
    let footerColumnItems = [];
    if (footerEl) {
      // Detect column count from grid/flex children
      const FLEX_GRID = ['grid', 'flex', 'inline-grid', 'inline-flex'];
      const ftLayout = FLEX_GRID.includes(cs(footerEl, 'display'))
        ? footerEl
        : [...footerEl.children].find(c => FLEX_GRID.includes(cs(c, 'display'))) || footerEl;
      const ftCols = cs(ftLayout, 'grid-template-columns');
      footerColumns = ftCols && ftCols !== 'none'
        ? ftCols.trim().split(/\s+(?=\S)/).filter(Boolean).length
        : Math.max(1, [...ftLayout.children].filter(c => c.getBoundingClientRect().width > 60).length);
      // Social links
      footerHasSocial = !![...footerEl.querySelectorAll('a[href*="twitter"],a[href*="linkedin"],a[href*="instagram"],a[href*="github"],a[href*="facebook"],a[href*="x.com"],a[aria-label*="social"]')].length;
      // Newsletter input
      footerHasNewsletter = !![...footerEl.querySelectorAll('input[type="email"],input[type="text"][placeholder*="mail"],[class*="newsletter"],[class*="subscribe"]')].length;
      // Copyright text
      const cpEl = [...footerEl.querySelectorAll('p,span,div')].find(el => /©|copyright|\d{4}/i.test(el.textContent));
      footerCopyrightText = cpEl ? cpEl.textContent.trim().replace(/\s+/g,' ').slice(0, 120) : null;
      // Per-column content summary (heading, mono label, or first link text per column) —
      // el label mono-espaciado se prueba antes que el link para no perder columnas cuyo
      // encabezado real es un <span class="label">/[class*="mono"] sin heading semántico
      // (patrón frecuente en footers de agencia: "NAVIGATE", "ELSEWHERE", etc.).
      const ftChildren = [...ftLayout.children].filter(c => c.getBoundingClientRect().width > 60).slice(0, 5);
      footerColumnItems = ftChildren.map(col => {
        const hd = col.querySelector('h1,h2,h3,h4,h5,h6,strong,[class*="brand"],[class*="logo"]');
        const label = col.querySelector('[class*="label"], [class*="mono"], [class*="heading"]');
        const lk = col.querySelector('a');
        return (hd ? hd.textContent.trim().slice(0, 40) : null)
          || (label ? label.textContent.trim().slice(0, 40) : null)
          || (lk ? lk.textContent.trim().slice(0, 40) : null)
          || '';
      }).filter(Boolean);
    }
    // Señales de contenido dinámico/estructurado que las heurísticas de "primer
    // heading/link" no capturan — frecuentes en footers de estudio/agencia: reloj
    // en vivo (<time>) y bloques de oficina con coordenadas geográficas. Sin esto,
    // Fase 8 no tiene forma de saber que debe reproducir ese contenido en vez de
    // un footer genérico de copyright + links.
    const footerHasLiveClock = footerEl ? !!footerEl.querySelector('time[datetime]') : false;
    const footerGeoRe = /-?\d{1,3}\.\d+\s*°?\s*[NS]\s*,?\s*-?\d{1,3}\.\d+\s*°?\s*[EW]/;
    const footerLocationSamples = footerEl
      ? [...footerEl.querySelectorAll('*')]
          .map(el => el.textContent.trim())
          .filter(t => t.length < 60 && footerGeoRe.test(t))
          .slice(0, 5)
      : [];
    const footer = {
      found:           !!footerEl,
      height_px:       footerEl ? Math.round(footerEl.getBoundingClientRect().height) : null,
      bg:              resolveEffectiveBg(footerEl),
      bg_hex:          footerEl ? rgbToHex(cs(footerEl, 'background-color')) : null,
      columns:         footerColumns,
      column_items:    footerColumnItems,
      has_social:      footerHasSocial,
      has_newsletter:  footerHasNewsletter,
      has_live_clock:  footerHasLiveClock,
      location_samples: footerLocationSamples,
      copyright_text:  footerCopyrightText,
      link_count:      footerEl ? footerEl.querySelectorAll('a').length : 0,
      top_links:       [...new Set(footerLinks)].slice(0, 12),
      link_sample_selector: footerLinkSampleSelector,
      link_hover_test_selector: footerLinkHoverTestSelector,
    };

    // ---------- Component DNA: global button & input morphology census ----------
    const buttonFingerprints = new Map();
    document.querySelectorAll('a[href], button, input[type="submit"], input[type="button"]').forEach(btn => {
      if (!isVisible(btn)) return;
      const t = btn.textContent.trim().replace(/\s+/g, ' ');
      if (!t || t.length > 40) return;
      const r = btn.getBoundingClientRect();
      if (r.width < 30 || r.height < 20) return;
      // Button-like only: visible background or an actual drawn border (>0 width)
      const rawBg = cs(btn, 'background-color');
      const hasBg = rawBg && !isTransparent(rawBg);
      const borderWidth = px(cs(btn, 'border-top-width')) || 0;
      if (!hasBg && borderWidth === 0) return;
      const fp = JSON.stringify([
        cssColorToHex(cs(btn, 'background-color')),
        cssColorToHex(cs(btn, 'color')),
        px(cs(btn, 'border-radius')),
        px(cs(btn, 'padding-left')),
        px(cs(btn, 'padding-top')),
        px(cs(btn, 'font-size')),
        cssColorToHex(cs(btn, 'border-color')),
        cs(btn, 'font-weight'),
      ]);
      const entry = buttonFingerprints.get(fp) || {
        count: 0, sample_text: t, sample_selector: describeEl(btn), hover_test_selector: tagForHover(btn),
        transition: cs(btn, 'transition') || null,
        letter_spacing: cs(btn, 'letter-spacing') || null,
        text_transform: cs(btn, 'text-transform') || null,
        // Sombra en estado normal (no hover) — no forma parte de la fingerprint-key para
        // no fragmentar el clustering por pequeñas diferencias de render; se toma del
        // primer botón visto de cada cluster, igual que transition/letter-spacing.
        box_shadow: (() => { const s = cs(btn, 'box-shadow'); return s && s !== 'none' ? s : null; })(),
      };
      entry.count++;
      buttonFingerprints.set(fp, entry);
    });
    const buttonsDna = [...buttonFingerprints.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 4)
      .map(([fp, e]) => {
        const [bg, color, radius, padX, padY, fontSize, borderColor, weight] = JSON.parse(fp);
        return {
          count: e.count,
          bg_hex: bg,
          color_hex: color,
          border_radius_px: radius,
          padding_x_px: padX,
          padding_y_px: padY,
          font_size_px: fontSize,
          font_weight: weight,
          border_color_hex: borderColor,
          transition: e.transition,
          letter_spacing: e.letter_spacing,
          text_transform: e.text_transform,
          box_shadow: e.box_shadow,
          sample_text: e.sample_text,
          sample_selector: e.sample_selector,
          hover_test_selector: e.hover_test_selector,
        };
      })
      .filter(b => b.bg_hex || b.border_color_hex);

    const inputFingerprints = new Map();
    document.querySelectorAll('input:not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]):not([type="hidden"]), textarea, select').forEach(inp => {
      const r = inp.getBoundingClientRect();
      if (r.width < 60 || r.height < 16) return;
      const fp = JSON.stringify([
        Math.round(r.height),
        px(cs(inp, 'border-radius')),
        cs(inp, 'border'),
        cssColorToHex(cs(inp, 'background-color')),
      ]);
      const entry = inputFingerprints.get(fp) || { count: 0, sample_selector: describeEl(inp) };
      entry.count++;
      inputFingerprints.set(fp, entry);
    });
    const inputsDna = [...inputFingerprints.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 3)
      .map(([fp, e]) => {
        const [h, radius, border, bg] = JSON.parse(fp);
        return { count: e.count, height_px: h, border_radius_px: radius, border, bg_hex: bg, sample_selector: e.sample_selector };
      });

    let navCta = null;
    const navCtaScope = navChrome.sticky || navChrome.visual || nav;
    if (navCtaScope) {
      // Buscar en el wrapper más amplio del header, no solo en <nav> — el CTA
      // suele ser hermano de <nav> dentro del mismo pill/header, no un
      // descendiente del <nav> semántico (que a menudo solo contiene los links).
      [...navCtaScope.querySelectorAll('a, button')].reverse().some(el => {
        if (!isVisible(el)) return false;
        const bgc = cssColorToHex(cs(el, 'background-color'));
        const t = el.textContent.trim().replace(/\s+/g, ' ');
        if (bgc && t && t.length <= 40) {
          navCta = { text: t, bg_hex: bgc, color_hex: cssColorToHex(cs(el, 'color')), border_radius_px: px(cs(el, 'border-radius')), box_shadow: (() => { const s = cs(el, 'box-shadow'); return s && s !== 'none' ? s : null; })(), sample_selector: describeEl(el), hover_test_selector: tagForHover(el) };
          return true;
        }
        return false;
      });
    }

    // ---------- Navbar utility controls (icon-only: theme toggle, search, lang, etc.) ----------
    // Header moderno de 3 zonas: brand | nav_links | controles de icono. El filtro de
    // navCta exige fondo con color Y texto no vacío — un botón de icono puro (SVG, casi
    // siempre background:transparent, sin texto) falla ambas condiciones y no se captura
    // en ningún campo. Se capturan aparte para que Fase 8 no ignore esa zona del header.
    const utilityControls = [];
    if (navCtaScope) {
      const seenControls = new Set();
      [...navCtaScope.querySelectorAll('a, button')].forEach(el => {
        if (!isVisible(el)) return;
        if (nav && nav.contains(el)) return; // ya cubierto por nav_links
        const t = el.textContent.trim().replace(/\s+/g, ' ');
        const r = el.getBoundingClientRect();
        const hasSvg = !!el.querySelector('svg, img[class*="icon"]');
        const isIconSized = r.width > 0 && r.width <= 60 && r.height <= 60
          && r.width / r.height >= 0.4 && r.width / r.height <= 2.5;
        if (!isIconSized || !(hasSvg || t.length <= 2)) return;
        const key = describeEl(el);
        if (seenControls.has(key)) return;
        seenControls.add(key);
        utilityControls.push({
          sample_selector:  key,
          has_icon_svg:     hasSvg,
          width_px:         Math.round(r.width),
          height_px:        Math.round(r.height),
          bg_hex:           cssColorToHex(cs(el, 'background-color')),
          border_radius_px: px(cs(el, 'border-radius')),
          text_sample:      t || null,
        });
      });
    }
    navbar.utility_controls = utilityControls.slice(0, 4);

    const componentDna = {
      buttons: buttonsDna,
      inputs: inputsDna,
      nav_cta: navCta,
    };

    // ---------- Motion DNA: universal animation signature detection ----------
    // Cheap, generic heuristics — not tied to any specific library or reference site.
    const scriptSrcs = [...document.querySelectorAll('script[src]')].map(s => s.src).join(' ');
    const htmlCls = document.documentElement.className || '';
    const has_smooth_scroll = /lenis|locomotive-scroll|smooth-scrollbar/i.test(scriptSrcs)
      || /lenis|smooth-scroll|locomotive/i.test(htmlCls)
      || typeof window.Lenis !== 'undefined'
      || typeof window.LocomotiveScroll !== 'undefined';

    // A custom cursor is a small fixed/absolute element, ignored by pointer events, whose
    // id/class hints at "cursor" — this pattern is library-agnostic (GSAP, Framer, vanilla).
    const cursorCandidate = [...document.querySelectorAll('body *')].find(el => {
      const id = (el.id || '').toLowerCase();
      const clsStr = typeof el.className === 'string' ? el.className.toLowerCase() : '';
      if (!/cursor/.test(id + clsStr)) return false;
      const pos = cs(el, 'position');
      const r = el.getBoundingClientRect();
      return (pos === 'fixed' || pos === 'absolute') && r.width > 0 && r.width < 120 && cs(el, 'pointer-events') === 'none';
    });
    const has_custom_cursor = !!cursorCandidate;

    const motionDna = {
      has_smooth_scroll,
      has_custom_cursor,
      cursor_selector: cursorCandidate ? describeEl(cursorCandidate) : null,
    };

    return {
      typography,
      googleFonts,
      palette,
      paletteHexes: {
        body_bg_hex:   cssColorToHex(palette.body_bg),
        body_text_hex: cssColorToHex(palette.body_color),
        nav_bg_hex:    navbar.bg_color ? cssColorToHex(navbar.bg_color) : null,
      },
      bodyEffectiveBg: resolveEffectiveBg(document.body),
      semantic_candidates: {
        bg_base:      bgBaseCandidates,
        surfaces:     surfaceCandidates,
        accents:      accentCandidates,
        text_colors:  textCandidates,
      },
      topColors,
      cssVarsRaw,
      globalLayout,
      navbar,
      hero,
      sectionSequence,
      cardMorphology,
      componentDna,
      footer,
      motionDna,
    };
  });

  // ---------- Button hover state detection ----------
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);

  const buttons = extracted.componentDna?.buttons || [];
  for (let bi = 0; bi < buttons.length; bi++) {
    const btn = buttons[bi];
    if (!btn.hover_test_selector) { btn.hover = null; continue; }
    btn.hover = await measureHover(page, btn.hover_test_selector, btn.bg_hex, btn.color_hex, btn.border_color_hex, btn.transition);
    console.error(`[DNA v4] Button hover [${bi}] (${btn.sample_selector}) → ${btn.hover ? `bg: ${btn.hover.bg_hex}, color: ${btn.hover.color_hex}` : 'failed'}`);
  }

  // Nav CTA, a representative card, and a representative footer link get the same
  // real-hover treatment as buttons — never asserted from an unmeasured guess.
  const navCta = extracted.componentDna?.nav_cta;
  if (navCta && navCta.hover_test_selector) {
    navCta.hover = await measureHover(page, navCta.hover_test_selector, navCta.bg_hex, navCta.color_hex, null, null);
    console.error(`[DNA v4] Nav CTA hover → ${navCta.hover ? `bg: ${navCta.hover.bg_hex}` : 'failed'}`);
  }

  const cardMorph = extracted.cardMorphology;
  if (cardMorph && cardMorph.hover_test_selector) {
    cardMorph.hover = await measureHover(page, cardMorph.hover_test_selector, cardMorph.bg_hex, null, null, null);
    console.error(`[DNA v4] Card hover → ${cardMorph.hover ? `border: ${cardMorph.hover.border_color_hex}` : 'failed'}`);
  }

  const footerRef = extracted.footer;
  if (footerRef && footerRef.link_hover_test_selector) {
    footerRef.link_hover = await measureHover(page, footerRef.link_hover_test_selector, null, null, null, null);
    console.error(`[DNA v4] Footer link hover → ${footerRef.link_hover ? `color: ${footerRef.link_hover.color_hex}` : 'failed'}`);
  }

  // ---------- Screenshots ----------
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const screenshotPaths = { sections: [] };

  try {
    const fullPath = path.join(SCREENSHOT_DIR, `${screenshotPrefix}_full.webp`);
    await page.screenshot({ path: fullPath, fullPage: true, type: 'webp', quality: 80 });
    screenshotPaths.full_page = fullPath;
    console.error(`[DNA v4] Full-page screenshot → ${fullPath}`);

    await page.evaluate(() => window.scrollTo(0, 0));
    const heroPath = path.join(SCREENSHOT_DIR, `${screenshotPrefix}_hero.webp`);
    await page.screenshot({ path: heroPath, type: 'webp', quality: 85 });
    screenshotPaths.hero_viewport = heroPath;
    console.error(`[DNA v4] Hero screenshot       → ${heroPath}`);
  } catch (e) {
    console.error(`[DNA v4] Screenshot error: ${e.message}`);
  }

  // ---------- Per-section crops ----------
  const sectionCount = extracted.sectionSequence.length;
  for (let i = 1; i <= sectionCount; i++) {
    try {
      const loc = page.locator(`[data-dna-section="${i}"]`).first();
      await loc.scrollIntoViewIfNeeded({ timeout: 5000 });
      await page.waitForTimeout(400);
      await dismissOverlays(page); // scroll-triggered / exit-intent popups can appear mid-page
      const secPath = path.join(SCREENSHOT_DIR, `${screenshotPrefix}_section_${i}.webp`);
      await loc.screenshot({ path: secPath, type: 'webp', quality: 80 });
      screenshotPaths.sections.push(secPath);
      console.error(`[DNA v4] Section ${i} crop       → ${secPath}`);
    } catch (e) {
      console.error(`[DNA v4] Section ${i} crop failed: ${e.message}`);
    }
  }

  // ---------- Mobile viewport screenshots (375px — iPhone-class width) ----------
  screenshotPaths.sections_mobile = [];
  try {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(400);
    await dismissOverlays(page); // responsive layout can surface a different overlay/menu state

    await page.evaluate(() => window.scrollTo(0, 0));
    const heroMobilePath = path.join(SCREENSHOT_DIR, `${screenshotPrefix}_hero_mobile.webp`);
    await page.screenshot({ path: heroMobilePath, type: 'webp', quality: 85 });
    screenshotPaths.hero_viewport_mobile = heroMobilePath;
    console.error(`[DNA v4] Hero screenshot (mobile) → ${heroMobilePath}`);

    for (let i = 1; i <= sectionCount; i++) {
      try {
        const loc = page.locator(`[data-dna-section="${i}"]`).first();
        await loc.scrollIntoViewIfNeeded({ timeout: 5000 });
        await page.waitForTimeout(300);
        const secMobilePath = path.join(SCREENSHOT_DIR, `${screenshotPrefix}_section_${i}_mobile.webp`);
        await loc.screenshot({ path: secMobilePath, type: 'webp', quality: 80 });
        screenshotPaths.sections_mobile.push(secMobilePath);
        console.error(`[DNA v4] Section ${i} crop (mobile) → ${secMobilePath}`);
      } catch (e) {
        console.error(`[DNA v4] Section ${i} mobile crop failed: ${e.message}`);
      }
    }
  } catch (e) {
    console.error(`[DNA v4] Mobile screenshot pass error: ${e.message}`);
  }

  await browser.close();

  const p = extracted.palette;
  const dnaBlueprint = {
    url:            targetUrl,
    extracted_at:   new Date().toISOString(),
    render_method:  'playwright_headless_chromium_v4',

    typography: {
      google_fonts_urls:   extracted.googleFonts,
      computed_body_font:  extracted.typography.body_font_family,
      body_font_size_px:   extracted.typography.body_font_size_px,
      body_line_height:    extracted.typography.body_line_height,
      computed_h1_font:    extracted.typography.h1_font_family,
      h1_size_px:          extracted.typography.h1_font_size_px,
      h1_weight:           extracted.typography.h1_font_weight,
      h1_line_height:      extracted.typography.h1_line_height,
      h1_letter_spacing:   extracted.typography.h1_letter_spacing,
      headline_sample:     extracted.typography.h1_text_sample,
      computed_h2_font:    extracted.typography.h2_font_family,
      h2_size_px:          extracted.typography.h2_font_size_px,
      h2_weight:           extracted.typography.h2_font_weight,
      h2_line_height:      extracted.typography.h2_line_height,
      h2_letter_spacing:   extracted.typography.h2_letter_spacing,
      nav_font_size_px:    extracted.typography.nav_font_size_px,
      nav_font_weight:     extracted.typography.nav_font_weight,
      nav_letter_spacing:  extracted.typography.nav_letter_spacing,
      self_hosted_fonts:   extracted.typography.self_hosted_fonts,
      external_font_links: extracted.typography.external_font_links,
    },

    palette_computed: {
      body_bg:     p.body_bg,
      body_bg_hex: extracted.paletteHexes.body_bg_hex,
      body_text:   p.body_color,
      body_text_hex: extracted.paletteHexes.body_text_hex,
      body_effective_bg: extracted.bodyEffectiveBg,
      nav_bg:      extracted.navbar.bg_color,
      nav_bg_hex:  extracted.paletteHexes.nav_bg_hex,
    },

    semantic_candidates: extracted.semantic_candidates,

    top_colors_by_frequency: extracted.topColors,
    css_variables_root:      extracted.cssVarsRaw,

    structural_blueprint: {
      global:           extracted.globalLayout,
      navbar:           extracted.navbar,
      hero:             extracted.hero,
      section_sequence: extracted.sectionSequence,
      card_morphology:  extracted.cardMorphology,
      component_dna:    extracted.componentDna,
      footer:           extracted.footer,
      motion_dna:       extracted.motionDna,
      cookie_banner:    cookieBannerDesign,
    },

    screenshots: screenshotPaths,
  };

  return dnaBlueprint;
}

// Clasifica los nav_links del home (capturados con {text, href} real) en candidatos de
// página secundaria de tipo "content" (servicios/about) y "conversion" (contacto/CTA).
// Solo considera enlaces del mismo origen que el home — nunca inventa una URL.
const SECONDARY_PAGE_KEYWORDS = {
  content: [
    'servicios', 'soluciones', 'productos', 'trabajo', 'portfolio', 'proyectos',
    'nosotros', 'sobre', 'about', 'services', 'solutions', 'work', 'about us', 'portafolio',
  ],
  conversion: [
    'contacto', 'contáctanos', 'contactanos', 'cotizar', 'agenda', 'empezar',
    'contact', 'get in touch', 'book a call', 'get started', 'quote', 'iniciar proyecto',
  ],
};

function findSecondaryPageUrls(navLinks, homeUrl) {
  const result = { content: null, conversion: null };
  if (!Array.isArray(navLinks) || !navLinks.length) return result;

  let homeOrigin, homePath;
  try {
    const homeParsed = new URL(homeUrl);
    homeOrigin = homeParsed.origin;
    homePath = homeParsed.pathname.replace(/\/$/, '');
  } catch { return result; }

  for (const link of navLinks) {
    if (!link || !link.href || !link.text) continue;
    let linkUrl;
    try { linkUrl = new URL(link.href); } catch { continue; }
    if (linkUrl.origin !== homeOrigin) continue;
    // Comparar SOLO origin+pathname, ignorando el #fragmento — un link como
    // "https://site.com/#pricing" es un ancla dentro de la MISMA página del home
    // (patrón muy común en sitios de una sola página / landing pages), no una página
    // distinta. Sin este filtro, se re-crawlea el home entero bajo la etiqueta "P2"
    // (confirmado en vivo: screenshots byte-idénticos entre home y "P2"), perdiendo
    // tiempo y produciendo un blueprint secundario redundante que termina descartado.
    if (linkUrl.pathname.replace(/\/$/, '') === homePath) continue;

    const textLower = link.text.toLowerCase();
    for (const role of ['content', 'conversion']) {
      if (result[role]) continue; // ya asignado, máximo 1 URL por rol
      if (SECONDARY_PAGE_KEYWORDS[role].some(kw => textLower.includes(kw))) {
        result[role] = linkUrl.href;
      }
    }
  }
  return result;
}

function validatePublicUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch (e) {
    throw new Error(`URL inválida proporcionada: "${rawUrl}"`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Protocolo no permitido: "${parsed.protocol}". Únicamente se admiten http: y https:`);
  }

  const hostname = parsed.hostname.toLowerCase();

  // Bloqueo de loopback y nombres locales
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]' ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    throw new Error(`Acceso a host local o de loopback bloqueado por seguridad: "${hostname}"`);
  }

  // Bloqueo de rangos IPv4 privados y metadatos de nube
  if (
    /^127\./.test(hostname) ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname) ||
    /^169\.254\./.test(hostname) ||
    /^0\./.test(hostname)
  ) {
    throw new Error(`Acceso a dirección IP privada o de infraestructura bloqueado por seguridad: "${hostname}"`);
  }

  return parsed.toString();
}

async function run(targetUrl) {
  const validatedTarget = validatePublicUrl(targetUrl);
  const home = await extractDNA(validatedTarget, 'ref');

  const navLinks = (home.structural_blueprint.navbar && home.structural_blueprint.navbar.nav_links) || [];
  const secondaryUrls = findSecondaryPageUrls(navLinks, validatedTarget);
  const rolePrefix = { content: 'ref_p2', conversion: 'ref_p3' };

  // Las páginas secundarias no dependen entre sí (solo de los nav_links ya
  // resueltos del home) — extraerlas en paralelo evita que el tiempo total
  // escale linealmente con la cantidad de páginas (antes: home + content +
  // conversion secuencial ≈ 3× el tiempo de una sola extracción).
  const roles = ['content', 'conversion'].filter(role => {
    if (!secondaryUrls[role]) return false;
    try {
      validatePublicUrl(secondaryUrls[role]);
      return true;
    } catch {
      return false;
    }
  });
  const results = await Promise.allSettled(roles.map(async role => {
    const url = secondaryUrls[role];
    console.error(`[DNA v4] Extrayendo página secundaria (${role}) → ${url}`);
    const secondaryDna = await extractDNA(url, rolePrefix[role]);
    return { role, url, structural_blueprint: secondaryDna.structural_blueprint, screenshots: secondaryDna.screenshots };
  }));

  const secondary_pages = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') secondary_pages.push(r.value);
    else console.error(`[DNA v4] Fallo extrayendo página secundaria (${roles[i]}): ${r.reason && r.reason.message}`);
  });

  home.secondary_pages = secondary_pages;
  console.log(JSON.stringify(home, null, 2));
}

const targetUrl = process.argv[2];
if (!targetUrl) {
  console.error('[DNA Extractor Error]: Por favor proporciona una URL válida como argumento.');
  console.error('Uso: node extract_reference_dna.cjs <URL>');
  process.exit(1);
}

try {
  const safeUrl = validatePublicUrl(targetUrl);
  run(safeUrl).catch(err => {
    console.error('[DNA Extractor Error]:', err.message);
    process.exit(1);
  });
} catch (err) {
  console.error('[DNA Extractor Error]:', err.message);
  process.exit(1);
}

