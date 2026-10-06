/**
 * compile_design_system.cjs — Compilador canónico del Living Design System
 *
 * Lee 'design-system-state.json' y compila 'templates/design-system.html'
 * inyectando la totalidad de tokens cromáticos, tipográficos, componentes vivos,
 * estados canónicos y auditoría WCAG para la marca activa.
 *
 * Uso: node scripts/compile_design_system.cjs <ruta-al-state.json> [ruta-al-design-system.html]
 *      (sin la segunda ruta escribe <Marca>_Design_System.html junto al state.json)
 *
 * Nota: parte del contenido de muestra (ecualizador de ejes, auditoría WCAG de ejemplo) sigue siendo fijo y no se
 * calcula desde el state. Por eso el prompt de los agentes construye el Design System sobre templates/design-system.html
 * en lugar de invocar este compilador.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { pickReadable, parseColor, contrastRatio } = require('./contrast.cjs');

function hexToRgb(hex) {
  if (!hex || typeof hex !== 'string') return '0, 0, 0';
  let c = hex.replace('#', '').trim();
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  const num = parseInt(c, 16);
  if (isNaN(num)) return '0, 0, 0';
  return `${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}`;
}

function compileDesignSystem(statePath, outputPath) {
  // Sin ruta explícita no se adivina ningún proyecto (antes caía en uno concreto de ejemplo y compilaba su marca)
  if (!statePath) {
    throw new Error('Uso: node compile_design_system.cjs <ruta-al-state.json> [ruta-de-salida.html]');
  }
  statePath = path.resolve(process.cwd(), statePath);

  if (!fs.existsSync(statePath)) {
    throw new Error(`Archivo state no encontrado en ${statePath}`);
  }

  let stateRaw = fs.readFileSync(statePath, 'utf8').replace(/^\uFEFF/, '');
  const state = JSON.parse(stateRaw);

  function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  const templatePath = path.resolve(__dirname, '..', 'templates', 'design-system.html');
  let html = fs.readFileSync(templatePath, 'utf8');

  // 1. Extraer datos de marca sanitizados para prevenir inyecciones HTML/XSS
  const rawBrandName = typeof state.brand === 'string' ? state.brand : (state.brand?.name || 'Brand');
  const brandName = escapeHtml(rawBrandName);
  const rawBrandPurpose = state.mission || state.brand?.purpose || 'Arquitectura web y sistemas de diseño digital de alta precisión.';
  const brandPurpose = escapeHtml(rawBrandPurpose);
  const rawBusinessModel = state.business_model || 'Servicios Profesionales / Consultoría Web y Plataformas Digitales';
  const businessModel = escapeHtml(rawBusinessModel);

  // 2. Extraer foundations
  const f = state.foundations || {};
  const palette = state.palette || f.palette || {};
  const typoRaw = state.typography || f.typography || {};
  const fontDisplay = escapeHtml(typoRaw.font_display || typoRaw.display || 'Cabinet Grotesk');
  const fontUi = escapeHtml(typoRaw.font_ui || typoRaw.body || typoRaw.font_body || 'Satoshi');
  const fontMono = escapeHtml(typoRaw.font_mono || 'Fira Code');

  const fontDisplayUrl = fontDisplay.replace(/\s+/g, '+') + ':wght@500;600;700;800';
  const fontUiUrl = fontUi.replace(/\s+/g, '+') + ':wght@400;500;600;700';
  const fontMonoUrl = fontMono.replace(/\s+/g, '+') + ':wght@400;500;600';

  // Colores principales
  const chestnut = palette.chestnut || {};
  const lightCyan = palette['light-cyan'] || {};
  const alabaster = palette['alabaster-grey'] || {};
  const khaki = palette['khaki-beige'] || {};
  const dust = palette['dust-grey'] || {};

  // El esquema documentado de la paleta (primary/secondary/accent/bg_base/surface_card/text_primary) tiene prioridad;
  // las rampas con nombre de la marca de ejemplo solo quedan como último recurso.
  const isHex = (v) => typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v.trim());
  const pick = (...candidates) => candidates.find(isHex);

  const primaryHex = pick(palette.primary_hex, palette.primary, chestnut['500']) || '#d23a2d';
  const primaryDarkHex = pick(palette.primary_dark, chestnut['600']) || '#a82f24';
  const primaryLighterHex = pick(palette.primary_light, chestnut['400']) || '#db6257';

  const secondaryHex = pick(palette.secondary_hex, palette.secondary, khaki['500']) || '#8f8270';
  const secondaryDarkHex = pick(palette.secondary_dark, khaki['600']) || '#72685a';

  const accentHex = pick(palette.accent_hex, palette.accent, lightCyan['500']) || '#1dd1e2';
  const accentLighterHex = pick(palette.accent_light, lightCyan['400']) || '#4adae8';

  const bgPrimaryHex = pick(palette.bg_base, palette.background, alabaster['950']) || '#101313';
  const bgElevatedHex = pick(palette.surface_card, palette.surface, alabaster['900']) || '#171b1c';
  // El rail izquierdo es siempre oscuro (--rail-bg). --bg-sunken pinta además código, tablas y muestras con texto --fg,
  // así que en una página clara debe ser un tono claro (el fondo ligeramente oscurecido), no el del rail.
  const railBgHex = '#0c0f0f';
  const bgSunkenHex = (() => {
    const bg = parseColor(bgPrimaryHex);
    const ink = parseColor(pick(palette.text_primary, palette.text) || '#101313');
    const bgLum = bg ? (0.2126 * bg.r + 0.7152 * bg.g + 0.0722 * bg.b) / 255 : 0;
    if (!bg || !ink || bgLum < 0.5) return railBgHex;
    const mix = (a, b) => Math.round(a * 0.94 + b * 0.06).toString(16).padStart(2, '0');
    return `#${mix(bg.r, ink.r)}${mix(bg.g, ink.g)}${mix(bg.b, ink.b)}`;
  })();

  const textPrimaryHex = pick(palette.text_primary, palette.text, alabaster['50']) || '#f1f3f3';
  const textDarkHex = '#101313';

  // Contraste del chrome: el rail va sobre --bg-sunken, no sobre --bg, así que su texto/acento se eligen contra ese fondo
  const onSunkenHex = pickReadable(railBgHex, [textPrimaryHex, '#FFFFFF', '#000000'], 7);
  const railAccentHex = pickReadable(railBgHex, [primaryHex, primaryLighterHex, accentHex, accentLighterHex, onSunkenHex], 4.5);
  const railOnAccentHex = pickReadable(railAccentHex, ['#FFFFFF', '#000000'], 4.5);
  const chromeAccentHex = pickReadable(bgPrimaryHex, [primaryHex, primaryLighterHex, accentHex, accentLighterHex, textPrimaryHex], 4.5);
  const onPrimaryHex = pickReadable(chromeAccentHex, ['#FFFFFF', '#000000'], 4.5);
  const onPrimaryDarkHex = pickReadable(primaryDarkHex, ['#FFFFFF', '#000000'], 4.5);

  // Escala modular y densidad: se derivan en la Etapa 1.6 y viven en el estado (antes estaban fijas en Major Third / 4px)
  const modularRaw = state.modular_scale || f.modular_scale || {};
  const modularRatio = Number(modularRaw.ratio) > 1 && Number(modularRaw.ratio) < 3 ? Number(modularRaw.ratio) : 1.25;
  const modularName = escapeHtml(typeof modularRaw.name === 'string' && modularRaw.name.trim() ? modularRaw.name.trim() : 'Major Third');
  const densityRaw = state.density_mode || f.density_mode || {};
  const densityId = typeof densityRaw === 'string' ? densityRaw : (densityRaw.mode || '');
  const spacingBasePx = /compact|compacto|denso|4/i.test(String(densityId)) ? 4 : (Number(densityRaw.base_px) === 4 ? 4 : 8);

  // Radios
  const radii = f.radius || state.radii || {};
  const radiusSm = radii.sm || '8px';
  const radiusMd = radii.md || '12px';
  const radiusLg = radii.lg || '16px';
  const radiusFull = radii.full || '9999px';

  // Inyectar variables documentadas del cliente recomendadas en :root
  const clientVarsBlock = `
      /* ========== CLIENT DOCUMENTED TOKENS (AUTOGENERATED) ========== */
      --client-primary: ${primaryHex};
      --client-secondary: ${secondaryHex};
      --client-accent: ${accentHex};
      --client-bg: ${bgPrimaryHex};
      --client-surface: ${bgElevatedHex};
      --client-text: ${textPrimaryHex};
      --client-font-display: '${fontDisplay}', sans-serif;
      --client-font-ui: '${fontUi}', sans-serif;
      --client-radius-sm: ${radiusSm};
      --client-radius-md: ${radiusMd};
      --client-radius-lg: ${radiusLg};
      --client-radius-full: ${radiusFull};
      --sample-accent: ${accentHex};
  `;

  html = html.replace(':root {', `:root {\n${clientVarsBlock}`);

  // Generar filas de ecualizador de 14 ejes
  const equalizerRows = [
    { eje: '1. Minimalismo vs Densidad', val: '4/5', token: 'Densidad equilibrada, padding 1rem a 1.5rem' },
    { eje: '2. Audacia Cromática', val: '4/5', token: 'Chestnut #d23a2d con acento tecnológico Light-Cyan #1dd1e2' },
    { eje: '3. Rigor Geométrico', val: '3/5', token: 'Radios suaves Soft & Balanced (8px, 12px, 16px)' },
    { eje: '4. Elevación y Profundidad', val: '4/5', token: 'Glassmorphism sutil, backdrop-filter blur(12px) y cyber border' },
    { eje: '5. Calidez Neutra', val: '3/5', token: 'Alabaster-Grey (#101313) con toques Khaki-Beige y Dust-Grey' },
    { eje: '6. Expresividad Tipográfica', val: '4/5', token: 'Cabinet Grotesk en Display + Satoshi en UI/Body' },
    { eje: '7. Feedback de Interacción', val: '5/5', token: '6 estados canónicos interactivos por componente con anillo accesible' },
    { eje: '8. Dinamismo de Movimiento', val: '3/5', token: 'Transiciones fluidas 200ms-350ms cubic-bezier' },
    { eje: '9. Contraste de Accesibilidad', val: '5/5', token: 'WCAG 2.2 AAA estricto (DeltaTone >= 60 HCT)' },
    { eje: '10. Escala Modular', val: '4/5', token: `${modularName} (${modularRatio.toFixed(3)}) escalonada para web moderna` },
    { eje: '11. Identidad de Superficies', val: '4/5', token: 'Fondo oscuro nativo con soporte dinámico dual a Light Mode' },
    { eje: '12. Señalética de Navegación', val: '4/5', token: 'Island Navbar flotante con micro-estados' },
    { eje: '13. Precisión de Formularios', val: '5/5', token: 'High-Tech Inset con foco activo en Light-Cyan #1dd1e2' },
    { eje: '14. Claridad en Tarjetas', val: '4/5', token: 'Borde de vidrio translúcido con glow de hover calibrado' }
  ].map(r => `<tr><td><strong>${r.eje}</strong></td><td><span class="chip chip-cyan">${r.val}</span></td><td><code>${r.token}</code></td></tr>`).join('\n');

  // Generar bloques vivos de componentes atómicos (.ds-block)
  const atomBlocks = `
    <!-- ATOMO 1: BOTONES Y ACCIONES CANÓNICAS -->
    <div class="ds-block" id="block-buttons">
      <div class="ds-stage">
        <h4 style="margin: 0 0 1rem; color: #fff;">1. Botones de Acción — 6 Estados Canónicos</h4>
        <div style="display: flex; gap: 1rem; flex-wrap: wrap; align-items: center;">
          <button type="button" class="dsc-btn" style="background:${primaryHex}; color:#fff; padding:10px 20px; border-radius:${radiusSm}; border:none; font-weight:600; cursor:pointer;">
            Default · ${brandName} Primary
          </button>
          <button type="button" class="dsc-btn is-hover" style="background:${primaryDarkHex}; color:#fff; padding:10px 20px; border-radius:${radiusSm}; border:none; font-weight:600; box-shadow:0 0 12px ${accentHex}40;">
            Hover State
          </button>
          <button type="button" class="dsc-btn is-focus" style="background:${primaryHex}; color:#fff; padding:10px 20px; border-radius:${radiusSm}; border:none; font-weight:600; outline:2px solid ${accentHex}; outline-offset:2px;">
            Focus-Visible Ring
          </button>
          <button type="button" class="dsc-btn is-active" style="background:${primaryDarkHex}; color:#fff; padding:10px 20px; border-radius:${radiusSm}; border:none; font-weight:600; transform:scale(0.97);">
            Active Pressed
          </button>
          <button type="button" class="dsc-btn" disabled style="background:rgba(255,255,255,0.08); color:rgba(255,255,255,0.3); padding:10px 20px; border-radius:${radiusSm}; border:none; font-weight:600; cursor:not-allowed;">
            Disabled
          </button>
          <button type="button" class="dsc-btn is-loading" style="background:${primaryHex}; color:#fff; padding:10px 20px; border-radius:${radiusSm}; border:none; font-weight:600; display:inline-flex; align-items:center; gap:8px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin-icon"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>
            Procesando...
          </button>
        </div>
      </div>
      <div class="ds-tokens">
        <code>.dsc-btn { background: var(--client-primary); border-radius: ${radiusSm}; }</code>
      </div>
    </div>

    <!-- ATOMO 2: BADGES Y PÍLDORAS SEMÁNTICAS -->
    <div class="ds-block" id="block-badges">
      <div class="ds-stage">
        <h4 style="margin: 0 0 1rem; color: #fff;">2. Píldoras de Estado & Badges de Estatus</h4>
        <div style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
          <span style="background:${accentHex}20; color:${accentHex}; border:1px solid ${accentHex}50; padding:3px 10px; border-radius:${radiusFull}; font-size:12px; font-weight:600;">
            <span class="color-dot" style="background-color:${accentHex}; width:6px; height:6px; border-radius:50%; display:inline-block; margin-right:4px;"></span>
            Tecnología Activa
          </span>
          <span style="background:${primaryHex}20; color:${primaryHex}; border:1px solid ${primaryHex}50; padding:3px 10px; border-radius:${radiusFull}; font-size:12px; font-weight:600;">
            Primario Destacado
          </span>
          <span style="background:#2bb07720; color:#2bb077; border:1px solid #2bb07750; padding:3px 10px; border-radius:${radiusFull}; font-size:12px; font-weight:600;">
            WCAG 2.2 AAA Aprobado
          </span>
        </div>
      </div>
      <div class="ds-tokens">
        <code>.badge-pill { border-radius: var(--client-radius-full); font-size: 12px; }</code>
      </div>
    </div>
  `;

  // Moléculas: Inputs y controles
  const moleculeBlocks = `
    <!-- MOLECULA 1: INPUTS Y FORMULARIOS -->
    <div class="ds-block" id="block-inputs">
      <div class="ds-stage">
        <h4 style="margin: 0 0 1rem; color: #fff;">3. Campos de Entrada (High-Tech Inset con Anillo Cyan)</h4>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:1rem;">
          <div>
            <label style="display:block; font-size:12px; color:${accentHex}; margin-bottom:4px; font-weight:600;">Estado Default</label>
            <input type="text" value="viewdev@empresa.com" style="width:100%; background:${bgElevatedHex}; border:1px solid rgba(255,255,255,0.15); color:#fff; padding:9px 14px; border-radius:${radiusSm}; outline:none;">
          </div>
          <div>
            <label style="display:block; font-size:12px; color:${accentHex}; margin-bottom:4px; font-weight:600;">Estado Foco Activo</label>
            <input type="text" value="Arquitectura de Software" style="width:100%; background:${bgElevatedHex}; border:1px solid ${accentHex}; color:#fff; padding:9px 14px; border-radius:${radiusSm}; box-shadow:0 0 10px ${accentHex}40; outline:none;">
          </div>
          <div>
            <label style="display:block; font-size:12px; color:#e02547; margin-bottom:4px; font-weight:600;">Estado Error</label>
            <input type="text" value="campo_invalido" style="width:100%; background:${bgElevatedHex}; border:1px solid #e02547; color:#fff; padding:9px 14px; border-radius:${radiusSm}; outline:none;">
          </div>
        </div>
      </div>
      <div class="ds-tokens">
        <code>input:focus-visible { border-color: var(--client-accent); box-shadow: 0 0 10px ${accentHex}40; }</code>
      </div>
    </div>

    <!-- MOLECULA 2: TARJETAS CON GLASSMORPHISM Y CYBER BORDER -->
    <div class="ds-block" id="block-cards">
      <div class="ds-stage">
        <h4 style="margin: 0 0 1rem; color: #fff;">4. Tarjetas de Contenido (Glassmorphism & Cyber Border)</h4>
        <div style="background:${bgElevatedHex}cc; backdrop-filter:blur(12px); border:1px solid rgba(255,255,255,0.12); border-radius:${radiusMd}; padding:1.5rem; position:relative; overflow:hidden;">
          <div style="position:absolute; top:0; left:0; right:0; height:2px; background:linear-gradient(90deg, ${primaryHex}, ${accentHex});"></div>
          <span style="font-size:11px; color:${accentHex}; font-weight:600; text-transform:uppercase;">Ficha de Proyecto</span>
          <h3 style="font-family:'${fontDisplay}', sans-serif; color:#fff; margin:0.35rem 0 0.5rem; font-size:1.35rem;">Ficha de ${brandName}</h3>
          <p style="color:rgba(255,255,255,0.7); font-size:13.5px; margin:0 0 1rem;">Construcción modular de interfaces reactivas con tokens semánticos verificados.</p>
          <button type="button" style="background:transparent; border:1px solid ${accentHex}; color:${accentHex}; padding:6px 14px; border-radius:${radiusSm}; font-size:12.5px; font-weight:600; cursor:pointer;">
            Inspeccionar Tokens →
          </button>
        </div>
      </div>
      <div class="ds-tokens">
        <code>.cyber-card { backdrop-filter: blur(12px); border-radius: var(--client-radius-md); }</code>
      </div>
    </div>
  `;

  // Organismos: Hero y Navbar
  const organismBlocks = `
    <!-- ORGANISMO 1: FLOATING ISLAND NAVBAR -->
    <div class="ds-block" id="block-navbar">
      <div class="ds-stage">
        <h4 style="margin: 0 0 1rem; color: #fff;">5. Navegación Flotante (Floating Island Navbar)</h4>
        <div style="background:${bgElevatedHex}e6; backdrop-filter:blur(16px); border:1px solid rgba(255,255,255,0.14); border-radius:${radiusFull}; padding:8px 20px; display:flex; align-items:center; justify-content:space-between; max-width:650px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <div style="width:24px; height:24px; background:${primaryHex}; border-radius:6px; display:flex; align-items:center; justify-content:center; font-weight:bold; color:#fff; font-size:12px;">V</div>
            <strong style="color:#fff; font-size:14px;">${brandName}</strong>
          </div>
          <div style="display:flex; gap:1.25rem; font-size:13px;">
            <span style="color:${accentHex}; font-weight:600; cursor:pointer;">Inicio</span>
            <span style="color:rgba(255,255,255,0.7); cursor:pointer;">Proyectos</span>
            <span style="color:rgba(255,255,255,0.7); cursor:pointer;">Servicios</span>
          </div>
          <button type="button" style="background:${primaryHex}; color:#fff; border:none; padding:6px 14px; border-radius:${radiusFull}; font-size:12px; font-weight:600; cursor:pointer;">
            Contacto
          </button>
        </div>
      </div>
      <div class="ds-tokens">
        <code>.island-nav { border-radius: var(--client-radius-full); backdrop-filter: blur(16px); }</code>
      </div>
    </div>

    <!-- ORGANISMO 2: HERO SHOWCASE -->
    <div class="ds-block" id="block-hero">
      <div class="ds-stage">
        <h4 style="margin: 0 0 1rem; color: #fff;">6. Hero de Presentación de Marca</h4>
        <div style="background:radial-gradient(circle at top right, ${primaryHex}20 0%, ${bgElevatedHex} 60%); border:1px solid rgba(255,255,255,0.1); border-radius:${radiusLg}; padding:2rem; text-align:left;">
          <span style="background:${accentHex}15; color:${accentHex}; border:1px solid ${accentHex}40; padding:4px 12px; border-radius:${radiusFull}; font-size:11.5px; font-weight:600; display:inline-block; margin-bottom:0.75rem;">
            Diseño de Sistemas 1:1
          </span>
          <h2 style="font-family:'${fontDisplay}', sans-serif; color:#fff; font-size:2rem; margin:0 0 0.75rem; font-weight:700;">
            ${brandName} — Alta Precisión en Interfaces
          </h2>
          <p style="color:rgba(255,255,255,0.75); font-size:14px; max-width:550px; line-height:1.6; margin:0 0 1.25rem;">
            ${brandPurpose}
          </p>
          <div style="display:flex; gap:0.75rem;">
            <button style="background:${primaryHex}; color:#fff; border:none; padding:10px 22px; border-radius:${radiusSm}; font-weight:600; cursor:pointer;">Comenzar Ahora</button>
            <button style="background:transparent; border:1px solid rgba(255,255,255,0.2); color:#fff; padding:10px 22px; border-radius:${radiusSm}; font-weight:600; cursor:pointer;">Ver Métricas</button>
          </div>
        </div>
      </div>
      <div class="ds-tokens">
        <code>.hero-block { border-radius: var(--client-radius-lg); }</code>
      </div>
    </div>
  `;

  // Tabla WCAG 2.2 AAA: ratios calculados con los colores reales del estado (antes eran valores fijos de muestra)
  const wcagPairs = [
    ['Texto Primario', textPrimaryHex, 'Fondo Base', bgPrimaryHex, 7, 'Texto regular sobre el fondo'],
    ['Texto Primario', textPrimaryHex, 'Superficie', bgElevatedHex, 7, 'Texto regular sobre tarjetas y paneles'],
    ['Acento', chromeAccentHex, 'Fondo Base', bgPrimaryHex, 4.5, 'Señalética interactiva y enlaces'],
    ['Texto sobre acento', onPrimaryHex, 'Acento', chromeAccentHex, 4.5, 'Texto del botón primario'],
    ['Anillo de Foco', chromeAccentHex, 'Fondo Base', bgPrimaryHex, 3, 'Anillo de foco visible (componente de interfaz)']
  ];
  const wcagRows = wcagPairs.map(([fgLabel, fgHex, bgLabel, bgHex, min, note]) => {
    const fg = parseColor(fgHex);
    const bg = parseColor(bgHex);
    const ratio = fg && bg ? contrastRatio(fg, bg) : 0;
    const level = ratio >= 7 ? 'PASA AAA' : (ratio >= min ? (min <= 4.5 ? 'PASA' : 'PASA AA') : 'NO PASA');
    const chip = ratio >= min ? 'chip-cyan' : 'chip-neutral';
    return `<tr><td><code>${fgLabel} (${fgHex})</code> sobre <code>${bgLabel} (${bgHex})</code></td><td>${ratio.toFixed(1)}:1</td><td><span class="chip ${chip}">${level}</span></td><td>${note} (mínimo ${min}:1)</td></tr>`;
  }).join('\n    ');

  const contrastPairsVisual = '<div style="display:flex;gap:1rem;flex-wrap:wrap;">' + [
    [textPrimaryHex, bgPrimaryHex],
    [onPrimaryHex, chromeAccentHex],
    [chromeAccentHex, bgPrimaryHex]
  ].map(([fgHex, bgHex]) => {
    const fg = parseColor(fgHex);
    const bg = parseColor(bgHex);
    const ratio = fg && bg ? contrastRatio(fg, bg) : 0;
    const label = ratio >= 7 ? 'AAA' : (ratio >= 4.5 ? 'AA' : 'FALLA');
    return `<div style="background:${bgHex};color:${fgHex};padding:8px 12px;border-radius:6px;border:1px solid ${fgHex};">${label} ${ratio.toFixed(1)}:1</div>`;
  }).join('') + '</div>';

  // Diccionario de reemplazos
  const replacements = {
    'BRAND_NAME': brandName,
    'BRAND_PURPOSE': brandPurpose,
    'BUSINESS_MODEL': businessModel,
    'CURRENT_DATE': new Date().toISOString().split('T')[0],
    'REFERENCE_URL': 'Fast-Track / Especificación Forense Canónica',
    'PRIMARY_REFERENCE_NAME': escapeHtml(state.visual_dna?.primary_reference?.name || state.visual_dna?.primary_reference || 'Referencia de la marca'),
    'FIDELITY_MODE_LABEL': 'Fidelidad Arquitectónica Total',
    'FONT_DISPLAY': fontDisplay,
    'FONT_DISPLAY_URL': fontDisplayUrl,
    'FONT_DISPLAY_META': `${fontDisplay} (Display / H1-H3)`,
    'FONT_UI': fontUi,
    'FONT_UI_URL': fontUiUrl,
    'FONT_UI_META': `${fontUi} (UI / Body / Controles)`,
    'FONT_MONO': fontMono,
    'FONT_MONO_URL': fontMonoUrl,
    'FONT_MONO_META': `${fontMono} (Code / Tokens / CSS)`,
    'PRIMARY_COLOR': primaryHex,
    'PRIMARY_HEX': primaryHex,
    'PRIMARY_RGB': hexToRgb(primaryHex),
    'PRIMARY_DARK_HEX': primaryDarkHex,
    'PRIMARY_LIGHTER_HEX': primaryLighterHex,
    'SECONDARY_COLOR': secondaryHex,
    'SECONDARY_HEX': secondaryHex,
    'SECONDARY_RGB': hexToRgb(secondaryHex),
    'SECONDARY_DARK_HEX': secondaryDarkHex,
    'ACCENT_COLOR': accentHex,
    'ACCENT_HEX': accentHex,
    'BG_PRIMARY_HEX': bgPrimaryHex,
    'BG_BASE': bgPrimaryHex,
    'BG_ELEVATED_HEX': bgElevatedHex,
    'BG_ELEVATED_RGB': hexToRgb(bgElevatedHex),
    'BG_SUNKEN_HEX': bgSunkenHex,
    'RAIL_BG_HEX': railBgHex,
    'SURFACE_CARD': bgElevatedHex,
    'TEXT_PRIMARY_HEX': textPrimaryHex,
    'TEXT_PRIMARY': textPrimaryHex,
    'TEXT_PRIMARY_RGB': hexToRgb(textPrimaryHex),
    'CHROME_ACCENT_HEX': chromeAccentHex,
    'ON_PRIMARY_HEX': onPrimaryHex,
    'ON_PRIMARY_DARK_HEX': onPrimaryDarkHex,
    'ON_SUNKEN_HEX': onSunkenHex,
    'ON_SUNKEN_RGB': hexToRgb(onSunkenHex),
    'RAIL_ACCENT_HEX': railAccentHex,
    'RAIL_ON_ACCENT_HEX': railOnAccentHex,
    'SHADOW_RGB': '0, 0, 0',
    'SHADOW_LIGHT_RGB': '0, 0, 0',
    'BG_LIGHT_HEX': '#f8fafc',
    'BG_LIGHT_ELEVATED_HEX': '#ffffff',
    'BG_LIGHT_SUNKEN_HEX': '#f1f5f9',
    'SURFACE_LIGHT_HEX': '#ffffff',
    'TEXT_DARK_HEX': textDarkHex,
    'TEXT_DARK_RGB': hexToRgb(textDarkHex),
    'RADIUS_SM': radiusSm,
    'RADIUS_MD': radiusMd,
    'RADIUS_LG': radiusLg,
    'RADIUS_FULL': radiusFull,
    'BORDER_WIDTH_EMPHASIS': '1px solid rgba(255,255,255,0.12)',
    'MODULAR_SCALE_NAME': `${modularName} (${modularRatio.toFixed(3)})`,
    'MODULAR_SCALE_RATIO': modularRatio.toFixed(3),
    'SITE_TYPE': 'Plataforma Web MPA de 3 Páginas',
    'EQUALIZER_TABLE_ROWS': equalizerRows,
    'ATOM_BLOCKS': atomBlocks,
    'ATOM_STATE_TABLES': '<!-- 6 Estados verificados en código CSS -->',
    'MOLECULE_BLOCKS': moleculeBlocks,
    'ORGANISM_BLOCKS': organismBlocks,
    'WCAG_TABLE_ROWS': wcagRows,
    'NAVBAR_BLUEPRINT_SUMMARY': 'Floating Island Navbar con píldora de navegación, logo y botón de conversión.',
    'HERO_BLUEPRINT_SUMMARY': 'Hero tipográfico con acento Chestnut y Light-Cyan en modo oscuro nativo.',
    'SECTION_SEQUENCE_SUMMARY': 'Hero → Propuesta de Valor → Proyectos Filtrables → Métricas → Cierre.',
    'CARD_MORPHOLOGY_SUMMARY': 'Superficies Glassmorphism con backdrop-filter blur(12px) y cyber border.',
    'FOOTER_BLUEPRINT_SUMMARY': 'Footer multi-columna con sitemap, créditos de marca y estado de tokens.',
    'COOKIE_BANNER_SUMMARY': 'Banner modal de privacidad con toggle discreto y botones accesibles.',
    'COMPONENT_DNA_TABLE_ROWS': '<tr><td>Botones</td><td>Primario, Secundario, Enlace</td><td>6 estados verificados</td></tr>',
    'MEDIA_SLOTS_SUMMARY': 'Contenedores adaptables con ratio 16:9 y soporte responsive.',
    'SPACING_BASE': String(spacingBasePx),
    'SPACING_SCALE_BARS': '<div style="display:flex;gap:4px;"><span class="chip chip-cyan">4px</span><span class="chip chip-cyan">8px</span><span class="chip chip-cyan">16px</span><span class="chip chip-cyan">24px</span><span class="chip chip-cyan">32px</span><span class="chip chip-cyan">48px</span><span class="chip chip-cyan">64px</span></div>',
    'BREAKPOINTS_TABLE': '<tr><td>Mobile</td><td>&lt; 768px</td><td>1 columna fluida</td></tr><tr><td>Tablet</td><td>768px - 1024px</td><td>2 columnas</td></tr><tr><td>Desktop</td><td>&gt; 1024px</td><td>12 columnas de 1280px max</td></tr>',
    'GRID_COLUMNS_LG': '12',
    'GRID_GUTTER_LG': '24px',
    'GRID_OVERLAY_COLS': '12',
    'GRID_OVERLAY_CAPTION': '12 Columnas Desktop con margen de 24px',
    'DENSITY_MODES': 'Dual Density (Default + Compact)',
    'TYPOGRAPHY_DISPLAY_SAMPLE': `${brandName} — Ingeniería de Sistemas Web`,
    'TYPOGRAPHY_HEADLINE_CHIP': `${fontDisplay} Bold 64px`,
    'TYPOGRAPHY_ITALIC_SAMPLE_BLOCK': `<p style="font-family:'${fontDisplay}', sans-serif; font-style:italic; color:rgba(255,255,255,0.8);">Arquitectura visual optimizada para experiencias digitales fluidas.</p>`,
    'TYPE_SCALE_ROWS': `<tr><td>H1</td><td>${fontDisplay}</td><td>56px / 3.5rem</td><td>Encabezado Principal</td></tr><tr><td>H2</td><td>${fontDisplay}</td><td>36px / 2.25rem</td><td>Títulos de Sección</td></tr><tr><td>H3</td><td>${fontDisplay}</td><td>24px / 1.5rem</td><td>Subtítulos y Tarjetas</td></tr><tr><td>Body</td><td>${fontUi}</td><td>15px / 0.95rem</td><td>Texto de Lectura</td></tr>`,
    'TYPE_WEIGHT_PILLS': '<span class="chip chip-cyan">Regular (400)</span><span class="chip chip-cyan">Medium (500)</span><span class="chip chip-cyan">SemiBold (600)</span><span class="chip chip-cyan">Bold (700)</span>',
    'TYPE_WEIGHT_OPTIONS': '400, 500, 600, 700',
    'EDITORIAL_COMPOSITION': 'Jerarquía estructurada con alto contraste entre Display y Body.',
    'ELEVATION_SAMPLES': '<div style="display:flex;gap:1rem;"><div style="padding:1rem;background:#171b1c;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.3);">Elevación 1</div><div style="padding:1rem;background:#171b1c;border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,0.4);">Elevación 2</div></div>',
    'ICON_STYLE_SUMMARY': 'Iconos lineales vectoriales limpios con stroke 2px y caja 24x24.',
    'ICON_SET': '<div class="ds-icon-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(60px,1fr));gap:1rem;"><div class="ds-icon-cell" style="text-align:center;"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path></svg><div style="font-size:10px;margin-top:4px;">Home</div></div><div class="ds-icon-cell" style="text-align:center;"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg><div style="font-size:10px;margin-top:4px;">Buscar</div></div><div class="ds-icon-cell" style="text-align:center;"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg><div style="font-size:10px;margin-top:4px;">Usuario</div></div><div class="ds-icon-cell" style="text-align:center;"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg><div style="font-size:10px;margin-top:4px;">Métricas</div></div></div>',
    'MOTION_TOKENS_TABLE': '<tr><td>--motion-fast</td><td>150ms</td><td>Micro-interacciones y botones</td></tr><tr><td>--motion-normal</td><td>250ms</td><td>Transición de tarjetas y menús</td></tr><tr><td>--motion-slow</td><td>400ms</td><td>Apertura de modales y cajones</td></tr>',
    'CAROUSEL_ENGINE_INFO': 'Desplazamiento horizontal snap con aceleración por hardware (transform translate3d).',
    'MODAL_DEMO_TITLE': `Diálogo de Confirmación · ${brandName}`,
    'MODAL_DEMO_BODY': 'Muestra interactiva de overlay modal con backdrop-filter y foco atrapado accesible.',
    'CONTRAST_PAIRS_VISUAL': contrastPairsVisual,
    'TOKENS_CSS_EXPORT': `:root {\n  --color-primary: ${primaryHex};\n  --color-secondary: ${secondaryHex};\n  --color-accent: ${accentHex};\n  --color-bg: ${bgPrimaryHex};\n  --color-surface: ${bgElevatedHex};\n  --color-text: ${textPrimaryHex};\n  --font-display: '${fontDisplay}', sans-serif;\n  --font-ui: '${fontUi}', sans-serif;\n  --radius-sm: ${radiusSm};\n  --radius-md: ${radiusMd};\n  --radius-lg: ${radiusLg};\n}`,
    'MEDIA_PLAN_SUMMARY': 'Imágenes optimizadas en WebP y SVG vectorial para logotipos e isotipos.',
    'KNOWN_GAPS': '<li><span>Requisitos legales de accesibilidad y alcance multilingüe/RTL: no especificados por el cliente; no se asumieron. Indicar si aplican para ampliar el sistema.</span></li>',
    'BRAND_LOGO_BLOCK': `<div style="display:flex;align-items:center;gap:10px;"><div style="width:32px;height:32px;background:${primaryHex};border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:bold;font-size:16px;">V</div><span style="font-weight:700;font-size:18px;color:#fff;letter-spacing:-0.02em;">${brandName}</span></div>`
  };

  for (const [key, val] of Object.entries(replacements)) {
    const reg = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    html = html.replace(reg, val);
  }

  // Limpiar cualquier {{PLACEHOLDER}} no emparejado que quede
  html = html.replace(/\{\{[A-Z0-9_-]+\}\}/g, '');

  if (!outputPath) {
    // Convención del flujo: <Marca>_Design_System.html junto al state.json
    const fileBrand = String(rawBrandName).replace(/[^A-Za-z0-9]+/g, '') || 'Brand';
    outputPath = path.join(path.dirname(statePath), `${fileBrand}_Design_System.html`);
  }
  outputPath = path.resolve(process.cwd(), outputPath);

  fs.writeFileSync(outputPath, html, 'utf8');
  console.log(`✓ Design System compilado exitosamente en: ${outputPath}`);
  return outputPath;
}

if (require.main === module) {
  const stateArg = process.argv[2];
  const outArg = process.argv[3];
  try {
    const res = compileDesignSystem(stateArg, outArg);
    console.log('Compilación finalizada:', res);
  } catch (err) {
    console.error('Error al compilar el Design System:', err.message);
    process.exit(1);
  }
}

module.exports = { compileDesignSystem };
