// =============================================================
// HOMIUM SITE BUILDER — CLIENT LOGIC
// =============================================================

// crypto.randomUUID() only exists in secure contexts (HTTPS/localhost); this app is
// also served over plain HTTP on LAN hostnames, so fall back to getRandomValues (which
// has no such restriction) and finally to Math.random if crypto is unavailable at all.
function generateUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// localStorage puede faltar o lanzar (ventana privada, datos de sitio bloqueados, cuota): nunca debe romper la app
const store = {
  get(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  },
  set(key, value) {
    try { localStorage.setItem(key, value); } catch (e) {}
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch (e) {}
  }
};

const SESSION_KEY = 'homium_site_builder_session_id';
const RESUME_CACHE_KEY = 'homium_resumed_project_cache';

let sessionId = store.get(SESSION_KEY) || generateUUID();
store.set(SESSION_KEY, sessionId);

const chatMessages = document.getElementById('chatMessages');
const chatForm = document.getElementById('chatForm');
const userInput = document.getElementById('userInput');
const btnSend = document.getElementById('btnSend');
const engineSelect = document.getElementById('engineSelect');
const btnReset = document.getElementById('btnReset');
const btnClearChat = document.getElementById('btnClearChat');
const prototypeFrame = document.getElementById('prototypeFrame');
const showcaseFrame = document.getElementById('showcaseFrame');
const blueprintView = document.getElementById('blueprintView');
const consoleOutput = document.getElementById('consoleOutput');
const btnRefreshPreview = document.getElementById('btnRefreshPreview');
const btnExternalPreview = document.getElementById('btnExternalPreview');
const btnAttach = document.getElementById('btnAttach');
const fileAttachInput = document.getElementById('fileAttachInput');
const attachmentsTray = document.getElementById('attachmentsTray');
let pendingAttachments = [];

// Workspace Chip y Telemetría Elements
const workspaceChip = document.getElementById('workspaceChip');
const workspacePathDisplay = document.getElementById('workspacePathDisplay');
const btnCopyWorkspace = document.getElementById('btnCopyWorkspace');
let activeWorkspaceDir = '';

const telemetryEngineBadge = document.getElementById('telemetryEngineBadge');
const telemetryModelBadge = document.getElementById('telemetryModelBadge');
const statInputTokens = document.getElementById('statInputTokens');
const statOutputTokens = document.getElementById('statOutputTokens');
const statThinkingTokens = document.getElementById('statThinkingTokens');
const statCacheTokens = document.getElementById('statCacheTokens');
const statDuration = document.getElementById('statDuration');

// Formato y actualización dinámica de la fecha del proyecto ('14 sep 2026')
function formatProjectDate(dateVal = null) {
  const d = dateVal ? new Date(dateVal) : new Date();
  if (isNaN(d.getTime())) return formatProjectDate();
  const day = d.getDate();
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

function updateProjectDate(dateVal = null) {
  const metaDate = document.getElementById('metaDateValue');
  if (metaDate) {
    metaDate.textContent = formatProjectDate(dateVal);
  }
}
updateProjectDate();

// 1. Auto-resize textarea
if (userInput) {
  userInput.addEventListener('input', () => {
    userInput.style.height = 'auto';
    userInput.style.height = Math.min(userInput.scrollHeight, 140) + 'px';
  });

  // Enviar con Enter (sin Shift). isComposing: Enter también confirma una composición IME (japonés, chino...)
  // y entonces no debe enviar el mensaje.
  userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      sendMessage();
    }
  });
}

// 2. Viewport Manager & Sizing Engine (Desktop, Tablet, Mobile)
let currentViewportWidth = '100%';

function applyViewportWidth(width) {
  currentViewportWidth = width;
  const isDesktop = width === '100%';

  // 1. Prototipo iframe
  if (prototypeFrame) {
    prototypeFrame.style.maxWidth = width;
    if (isDesktop) {
      prototypeFrame.style.boxShadow = 'none';
      prototypeFrame.style.borderRadius = '0';
    } else {
      prototypeFrame.style.boxShadow = '0 0 40px rgba(0, 255, 255, 0.2)';
      prototypeFrame.style.borderRadius = '24px';
    }
  }

  // 2. Showcase iframe
  if (showcaseFrame) {
    showcaseFrame.style.maxWidth = width;
    if (isDesktop) {
      showcaseFrame.style.boxShadow = 'none';
      showcaseFrame.style.borderRadius = '0';
    } else {
      showcaseFrame.style.boxShadow = '0 0 40px rgba(0, 255, 255, 0.2)';
      showcaseFrame.style.borderRadius = '24px';
    }
  }

  // 3. Blueprint Inspector
  if (blueprintView) {
    blueprintView.style.maxWidth = width;
    blueprintView.style.margin = '0 auto';
    if (isDesktop) {
      blueprintView.style.boxShadow = 'none';
      blueprintView.style.borderRadius = '0';
      blueprintView.style.border = 'none';
    } else {
      blueprintView.style.boxShadow = '0 0 40px rgba(0, 255, 255, 0.15)';
      blueprintView.style.borderRadius = '16px';
      blueprintView.style.border = '1px solid rgba(0, 255, 255, 0.2)';
    }
  }
}

function updateExternalPreviewLink(tabId) {
  if (!btnExternalPreview) return;
  if (tabId === 'tab-prototype') {
    btnExternalPreview.href = '/preview/prototype/index.html';
    btnExternalPreview.title = 'Abrir Prototipo en pestaña nueva';
  } else if (tabId === 'tab-showcase') {
    btnExternalPreview.href = '/preview/showcase';
    btnExternalPreview.title = 'Abrir Showcase en pestaña nueva';
  } else if (tabId === 'tab-blueprint') {
    btnExternalPreview.href = '/preview/blueprint';
    btnExternalPreview.title = 'Abrir Blueprint en pestaña nueva';
  }
}

// 3. Tab switching y seguimiento en vivo
// Modo "En vivo": la vista sigue la fase del flujo (1-3 Blueprint, 4 Showcase, 5 Prototipo).
// Un clic manual en una pestaña lo pausa hasta que cambie la fase o se pulse el interruptor.
const FOLLOW_LIVE_KEY = 'homium_follow_live';
const FOLLOW_TABS = ['tab-blueprint', 'tab-showcase', 'tab-prototype'];
const FOLLOW_LABELS = { 'tab-blueprint': 'Blueprint', 'tab-showcase': 'Showcase', 'tab-prototype': 'Prototipo' };
let followLive = true;
followLive = store.get(FOLLOW_LIVE_KEY) !== 'off';
let followPaused = false;
let lastFollowTarget = null;

function activateTab(tabId) {
  const btn = document.querySelector('.tab-btn[data-tab="' + tabId + '"]');
  if (btn && !btn.classList.contains('active')) btn.click();
}

function renderFollowButton() {
  const btn = document.getElementById('btnFollowLive');
  if (!btn) return;
  const label = document.getElementById('followLiveLabel');
  const mode = !followLive ? 'off' : (followPaused ? 'paused' : 'live');
  btn.classList.toggle('is-paused', mode === 'paused');
  btn.classList.toggle('is-off', mode === 'off');
  btn.setAttribute('aria-pressed', String(mode === 'live'));
  if (label) label.textContent = { live: 'En vivo', paused: 'Pausado', off: 'Manual' }[mode];
  btn.title = {
    live: 'Siguiendo el avance: la vista cambia sola según la fase. Clic para desactivar.',
    paused: 'Seguimiento pausado por tu selección. Clic para retomar el avance.',
    off: 'Seguimiento manual. Clic para que la vista siga el avance del flujo.'
  }[mode];
}

function resolveFollowTarget({ phase, showcaseExists, prototypeExists }) {
  const phaseRank = phase >= 5 ? 2 : (phase >= 4 ? 1 : 0);
  const fileRank = prototypeExists ? 2 : (showcaseExists ? 1 : 0);
  return FOLLOW_TABS[Math.max(phaseRank, fileRank)];
}

function followLiveTab(ctx) {
  const target = resolveFollowTarget(ctx);
  const changed = target !== lastFollowTarget;
  const firstRun = lastFollowTarget === null;
  lastFollowTarget = target;
  if (changed) followPaused = false;
  renderFollowButton();
  if (!followLive || followPaused) return;
  activateTab(target);
  if (changed && !firstRun) appendLog('[En vivo] Mostrando ' + FOLLOW_LABELS[target] + ' según el avance del flujo.');
}

const btnFollowLive = document.getElementById('btnFollowLive');
if (btnFollowLive) {
  btnFollowLive.addEventListener('click', () => {
    if (followLive && followPaused) {
      followPaused = false;
    } else {
      followLive = !followLive;
      followPaused = false;
      store.set(FOLLOW_LIVE_KEY, followLive ? 'on' : 'off');
    }
    renderFollowButton();
    if (followLive && lastFollowTarget) activateTab(lastFollowTarget);
  });
}
renderFollowButton();

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    if (e && e.isTrusted && followLive && !followPaused) {
      followPaused = true;
      renderFollowButton();
    }
    document.querySelectorAll('.tab-btn').forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-selected', 'false');
    });
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
    const tabId = btn.getAttribute('data-tab');
    const targetPane = document.getElementById(tabId);
    if (targetPane) targetPane.classList.add('active');

    // Controles viewport: Visibles en TODAS las vistas (Blueprint, Prototipo, Showcase) MENOS en Consola
    const viewportControls = document.getElementById('viewportControls');
    if (tabId === 'tab-logs') {
      if (viewportControls) viewportControls.style.display = 'none';
    } else {
      if (viewportControls) viewportControls.style.display = 'flex';
      updateExternalPreviewLink(tabId);
      applyViewportWidth(currentViewportWidth);
    }
  });
});

// 4. Viewport controls (Desktop, Tablet, Mobile)
document.querySelectorAll('.vp-btn[data-vp]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.vp-btn[data-vp]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const width = btn.getAttribute('data-vp');
    applyViewportWidth(width);
  });
});

if (btnRefreshPreview) {
  btnRefreshPreview.addEventListener('click', () => {
    const activeTab = document.querySelector('.tab-btn.active')?.getAttribute('data-tab');
    if (activeTab === 'tab-blueprint') {
      checkStatus();
      loadWorkspaceInfo();
      appendLog('[System] Blueprint refrescado manualmente.');
    } else if (activeTab === 'tab-showcase') {
      if (showcaseFrame) showcaseFrame.src = showcaseFrame.src;
      appendLog('[System] Showcase refrescado manualmente.');
    } else {
      if (prototypeFrame) prototypeFrame.src = prototypeFrame.src;
      appendLog('[System] Prototipo refrescado manualmente.');
    }
  });
}

// Inicializar estado inicial de viewport y link según la pestaña activa
const initialActiveTab = document.querySelector('.tab-btn.active')?.getAttribute('data-tab') || 'tab-blueprint';
const initialVpControls = document.getElementById('viewportControls');
if (initialVpControls) {
  initialVpControls.style.display = (initialActiveTab === 'tab-logs') ? 'none' : 'flex';
}
updateExternalPreviewLink(initialActiveTab);
applyViewportWidth(currentViewportWidth);

// 4. Quick prompts (Delegación de eventos para sugerencias contextuales)
document.addEventListener('click', (e) => {
  const chip = e.target.closest('.quick-chip');
  if (chip && userInput) {
    userInput.value = chip.getAttribute('data-prompt') || '';
    userInput.focus();
  }
});

// 5. Reinicio de sesión y proyecto nuevo (modal accesible)
const resetModal = document.getElementById('resetModal');
const btnCancelReset = document.getElementById('btnCancelReset');
const btnConfirmReset = document.getElementById('btnConfirmReset');
const btnNewProject = document.getElementById('btnNewProject');
const btnLogout = document.getElementById('btnLogout');

// Mensaje de bienvenida: el mismo al iniciar, al limpiar la pantalla y tras un reinicio
const WELCOME_MESSAGE_HTML = `
    <div class="message agent-message">
      <div class="message-meta">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <circle cx="12" cy="12" r="10"></circle>
          <path d="M12 16v-4"></path>
          <path d="M12 8h.01"></path>
        </svg>
        <span class="sender-name">Lead Engineer</span>
        <span class="message-time">Ahora</span>
      </div>
      <div class="message-body">
        <p>Hola, soy tu <strong>Lead Design Systems Engineer</strong>. Vamos a construir tu sistema de diseño paso a paso.</p>
        <p>Para comenzar: <em>¿cuál es el nombre de tu marca o empresa, o tienes una URL de referencia para extraer su DNA visual forense?</em></p>
        <div class="welcome-suggestions">
          <button type="button" class="quick-chip" data-prompt="Quiero crear el sistema de diseño para una marca llamada Lumina, un SaaS de finanzas">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
            </svg>
            <span>SaaS Lumina</span>
          </button>
          <button type="button" class="quick-chip" data-prompt="Tengo esta referencia de diseño: https://linear.app">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="2" y1="12" x2="22" y2="12"></line>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
            </svg>
            <span>URL Linear</span>
          </button>
        </div>
      </div>
    </div>
  `;

const BLUEPRINT_EMPTY_HTML = `
    <div class="blueprint-empty">
      <div class="waiting-card">
        <span class="category-eyebrow">Fase 1 Pendiente</span>
        <h2>Blueprint <em>en espera.</em></h2>
        <p>La paleta de colores, tipografía y blueprint estructural se compilarán en disco automáticamente a medida que el Lead Engineer avance en el chat.</p>
        <div class="status-pill">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          Esperando confirmación en el chat…
        </div>
      </div>
    </div>
  `;

let modalReturnFocus = null;

function openResetModal() {
  if (!resetModal) return;
  modalReturnFocus = document.activeElement;
  resetModal.style.display = 'flex';
  if (btnCancelReset) btnCancelReset.focus();
}

function closeResetModal() {
  if (!resetModal) return;
  resetModal.style.display = 'none';
  if (modalReturnFocus && typeof modalReturnFocus.focus === 'function') modalReturnFocus.focus();
  modalReturnFocus = null;
}

// Escape cierra el modal y Tab se queda dentro de él
document.addEventListener('keydown', (e) => {
  if (!resetModal || resetModal.style.display === 'none') return;
  if (e.key === 'Escape') {
    e.preventDefault();
    closeResetModal();
    return;
  }
  if (e.key === 'Tab') {
    const focusables = Array.from(resetModal.querySelectorAll('button:not([disabled])'));
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
});

if (btnLogout) {
  btnLogout.addEventListener('click', async () => {
    // La caché del chat pertenece a quien inició sesión: no debe verla la siguiente persona de este navegador
    store.remove(RESUME_CACHE_KEY);
    abortTurnSilently();
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {}
    window.location.href = '/login';
  });
}

if (btnReset) {
  btnReset.addEventListener('click', (e) => {
    e.preventDefault();
    openResetModal();
  });
}

if (btnCancelReset) btnCancelReset.addEventListener('click', closeResetModal);

// Cerrar modal al hacer clic en el backdrop
if (resetModal) {
  resetModal.addEventListener('click', (e) => {
    if (e.target === resetModal) closeResetModal();
  });
}

// Deja la interfaz como en una sesión recién abierta (sin tocar el servidor)
function resetClientView(systemText) {
  pendingAttachments = [];
  renderAttachmentsTray();

  chatMessages.innerHTML = `
      <div class="message system-event">
        <span>[ ${escapeHtml(systemText)} ]</span>
      </div>
    ` + WELCOME_MESSAGE_HTML;

  // Limpiar iframes y vista de blueprint
  dynamicBlueprintState = {};
  followPaused = false;
  lastFollowTarget = null;
  lastPendingAction = null;
  renderFollowButton();
  prevPrototypeVersion = null;
  prevShowcaseVersion = null;
  prototypeFrame.src = '/preview/prototype/index.html';
  showcaseFrame.src = '/preview/showcase';
  blueprintView.innerHTML = BLUEPRINT_EMPTY_HTML;

  // Resetear pills del pipeline de fases
  document.querySelectorAll('.phase-pill').forEach(p => p.classList.remove('completed', 'active'));
  const phase1 = document.getElementById('phase-1');
  if (phase1) phase1.classList.add('active');

  const gateContainer = document.getElementById('approvalGateContainer');
  if (gateContainer) { gateContainer.style.display = 'none'; gateContainer.innerHTML = ''; }

  // Telemetría y seguimiento de entregables del proyecto anterior
  [statInputTokens, statOutputTokens, statThinkingTokens, statCacheTokens, statDuration].forEach(el => {
    if (el) el.textContent = '—';
  });
  if (telemetryModelBadge) telemetryModelBadge.textContent = 'Modelo: —';
  const trackerBar = document.getElementById('deliverablesTrackerBar');
  if (trackerBar) trackerBar.style.display = 'none';

  const metaBrand = document.getElementById('metaBrandValue');
  if (metaBrand) metaBrand.textContent = 'Sin iniciar';
  updateProjectDate();
}

/**
 * Reinicia la sesión en el servidor y en la interfaz.
 * @param {Object} options
 * @param {string} options.endpoint '/api/reset' (archiva estado e historial) o '/api/project/new' (conserva el proyecto)
 */
async function performSessionReset({ endpoint, systemText, logText }) {
  closeResetModal();
  if (btnReset) btnReset.disabled = true;
  // Un turno en curso escribiría en el proyecto que se descarta: se corta antes y sin mostrar su final
  abortTurnSilently();

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId })
    });
    if (res.status === 401) {
      window.location.href = '/login';
      return;
    }
    if (!res.ok) throw new Error(`El servidor respondió con el código ${res.status}`);
    await res.json();

    sessionId = generateUUID();
    store.set(SESSION_KEY, sessionId);
    store.remove(RESUME_CACHE_KEY);
    lastRenderedResumeHash = '';

    resetClientView(systemText);
    checkStatus();
    loadWorkspaceInfo();
    appendLog(logText);
  } catch (err) {
    appendLog('[Error] Error al reiniciar: ' + err.message, 'error');
    appendSystemEvent('No se pudo reiniciar la sesión: ' + err.message);
  } finally {
    if (btnReset) btnReset.disabled = false;
  }
}

if (btnConfirmReset) {
  btnConfirmReset.addEventListener('click', () => performSessionReset({
    endpoint: '/api/reset',
    systemText: 'Nueva sesión iniciada. Estado limpio',
    logText: '[System] Sesión reseteada exitosamente. Estado listo para nueva marca.'
  }));
}

if (btnNewProject) {
  btnNewProject.addEventListener('click', () => performSessionReset({
    endpoint: '/api/project/new',
    systemText: 'Proyecto anterior conservado en disco. Nueva sesión iniciada',
    logText: '[System] Proyecto nuevo: el anterior se conserva en disco. Escribe el nombre de una marca para empezar (o el de una existente para retomarla).'
  }));
}

// Otra pestaña reinició la sesión: esta comparte el mismo almacenamiento, así que se adopta el nuevo id
window.addEventListener('storage', (e) => {
  if (e.key === SESSION_KEY && e.newValue && e.newValue !== sessionId) {
    sessionId = e.newValue;
    appendSystemEvent('La sesión cambió en otra pestaña. Recarga esta página para ver la conversación actualizada.');
  }
});

if (btnClearChat) {
  btnClearChat.addEventListener('click', () => {
    if (!chatMessages) return;
    chatMessages.innerHTML = WELCOME_MESSAGE_HTML;
  });
}

// 6. Formateo limpio de Markdown / Texto (Sin Corchetes)
// Escapa comillas y ángulos (no &) en valores que ya pasaron por el escape inicial y luego se decodificaron
// Colores CSS aceptados en atributos style: #hex, nombres simples y rgb()/hsl(). Cualquier otra cosa se descarta
// (los valores vienen del estado, escrito por un LLM que ingiere URLs y archivos de terceros).
function safeCssColor(value) {
  if (typeof value !== 'string') return '';
  const v = value.trim();
  return /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]{3,25}|(?:rgb|hsl)a?\(\s*[0-9.,%\s\/deg]+\))$/.test(v) ? v : '';
}

// Nombres de fuente: solo letras, números, espacios, guiones y puntos (van dentro de font-family)
function safeFontName(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[^\w\s\-.]/g, '').trim();
}

// Copia profunda con todas las cadenas escapadas para interpolarlas en innerHTML
function escapeDeep(value, depth = 0) {
  if (typeof value === 'string') return escapeHtml(value);
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(v => escapeDeep(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = escapeDeep(v, depth + 1);
  return out;
}

function escapeAttrValue(value) {
  return String(value)
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatText(text) {
  // Las comillas también se escapan: el texto del modelo termina dentro de atributos (href, data-*, title)
  let safe = String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  // Swatches visuales automáticos para códigos HEX (#RRGGBB, #RGB, o bare RRGGBB en contexto de paleta).
  // Los destinos de enlaces Markdown "](...)" se dejan intactos: un "#123456" dentro de una URL es un fragmento, no un color.
  const swatch = (fullHex) => `<span class="hex-swatch-pill"><span class="hex-dot" style="background-color:${fullHex};"></span>${fullHex}</span>`;
  safe = safe.split(/(\]\([^)]*\))/).map((segment, i) => {
    if (i % 2 === 1) return segment;
    return segment
      .replace(/`?#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b`?/g, (match, hex) => swatch('#' + hex))
      // Bare hex sin # — solo cuando va precedido de espacio/bullet y seguido de espacio/puntuación, y mezcla
      // dígitos y letras: así no convierte palabras ("decade", "facade") ni números ("100000", "202601") en colores
      .replace(/(?<=[\s•·\-])([0-9A-F]{6}|[0-9a-f]{6})\b(?=[\s,·•<])/g, (match, hex) => (
        /\d/.test(hex) && /[a-f]/i.test(hex) ? swatch('#' + hex) : match
      ));
  }).join('');

  // 1. Enlaces a archivos en disco [text](file:///...) -> chips interactivos con icono
  safe = safe.replace(/\[([^\]]*)\]\(file:\/\/\/(.*?)\)/g, (match, label, filePath) => {
    let decodedPath;
    try {
      decodedPath = decodeURIComponent(filePath);
    } catch (err) {
      decodedPath = filePath; // % mal formado: se conserva tal cual en vez de romper el render del chat
    }
    // Tras decodificar pueden reaparecer comillas o ángulos (%22, %3C): se escapan antes de entrar a atributos
    const cleanPath = escapeAttrValue(decodedPath);
    const fileName = cleanPath.split('/').pop();
    const cleanLabel = label.replace(/[\[\]]/g, '').trim();
    return `<button type="button" class="inline-file-chip" data-file="${fileName}" data-path="/${cleanPath}" title="Archivo persistido en disco: /${cleanPath}\n(Clic para ver en Blueprint o copiar ruta)">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:2px;" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
      <span>${cleanLabel}</span>
    </button>`;
  });

  // 2. Enlaces web normales [text](http...) -> links limpios
  safe = safe.replace(/\[([^\]]*)\]\(([^)]*)\)/g, (match, label, url) => {
    const target = url.trim();
    // Solo http(s) o rutas absolutas del propio sitio: bloquea javascript:, data:, vbscript: y URLs //host.
    // "/\host" también se rechaza: los navegadores tratan la barra invertida como "/" y lo leen como //host
    if (!/^(?:https?:\/\/|\/(?![\/\\]))/i.test(target)) return label;
    return `<a href="${target}" target="_blank" rel="noopener noreferrer" style="color:var(--homium-cyan);text-decoration:none;border-bottom:1px dotted var(--homium-cyan);font-weight:500;">${label}</a>`;
  });

  // 3. Separadores horizontales Markdown ---
  safe = safe.replace(/^---+$/gm, '<hr style="border:none;border-top:1px solid rgba(0,255,255,0.15);margin:0.85rem 0;">');

  // 4. Encabezados Markdown ####, ###, ##
  safe = safe.replace(/^#### (.*?)$/gm, '<h5 style="margin:0.65rem 0 0.25rem;color:var(--homium-cyan);font-size:14px;font-weight:600;">$1</h5>');
  safe = safe.replace(/^### (.*?)$/gm, '<h4 style="margin:0.75rem 0 0.35rem;color:var(--homium-cyan);font-size:16px;font-weight:600;">$1</h4>');
  safe = safe.replace(/^## (.*?)$/gm, '<h3 style="margin:0.85rem 0 0.4rem;color:#fff;font-size:18px;font-weight:600;">$1</h3>');

  // 5. Negrita, cursiva y código
  safe = safe.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  safe = safe.replace(/\*(.*?)\*/g, '<em>$1</em>');
  safe = safe.replace(/`([^`]+)`/g, '<code>$1</code>');

  // 6. Eliminar corchetes sobrantes tipo [Fase 1]
  safe = safe.replace(/\[(.*?)\]/g, '<span style="color:var(--homium-cyan);">$1</span>');
  safe = safe.replace(/[\[\]]/g, '');

  // 7. Saltos de línea
  safe = safe.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>');

  return `<p>${safe}</p>`;
}

function appendLog(line, type = 'info') {
  const div = document.createElement('div');
  div.className = `log-line ${type}`;
  div.textContent = line;
  consoleOutput.appendChild(div);
  consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

// 6b. Opciones numeradas dentro de la burbuja
// El agente escribe sus propias opciones ("1. B2C", "2. B2B"...). En vez de repetirlas en una bandeja aparte,
// la última pregunta del flujo las muestra como botones en lugar del listado de texto: una sola fuente de verdad.
const OPTION_LINE = /^\s*(\d{1,2})[.)]\s+(\S.*)$/;
const CUSTOM_OPTION = /personalizad|escribir mi propia|otra opci[oó]n/i;

function stripInlineMarkdown(text) {
  return String(text).replace(/[*_`]/g, '').trim();
}

/**
 * Detecta al final del mensaje un bloque de opciones numeradas (1., 2., 3...) que responde a una pregunta.
 * @returns {{ before: string, options: Array<{ number: number, label: string, isCustom: boolean }>, after: string } | null}
 */
function parseOptionBlock(text) {
  const lines = String(text || '').split('\n');

  let end = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (OPTION_LINE.test(lines[i])) { end = i; break; }
  }
  if (end === -1) return null;

  let start = end;
  while (start - 1 >= 0 && OPTION_LINE.test(lines[start - 1])) start--;

  const options = [];
  for (let i = start; i <= end; i++) {
    const match = lines[i].match(OPTION_LINE);
    options.push({ number: Number(match[1]), label: match[2].trim() });
  }

  // Una lista de opciones numera desde 1 y no tiene más de 10 entradas breves
  if (options.length < 2 || options.length > 10) return null;
  if (!options.every((opt, idx) => opt.number === idx + 1 && opt.label.length <= 220)) return null;

  const before = lines.slice(0, start).join('\n');
  const after = lines.slice(end + 1).join('\n');
  if (after.trim().length > 300) return null;

  // Debe responder a una pregunta (o traer la opción personalizada): una enumeración cualquiera no es una pregunta
  const hasQuestion = /[?¿]/.test(before.slice(-600));
  const hasCustom = options.some(opt => CUSTOM_OPTION.test(opt.label));
  if (!hasQuestion && !hasCustom) return null;

  return {
    before,
    options: options.map(opt => ({ ...opt, isCustom: CUSTOM_OPTION.test(opt.label) })),
    after
  };
}

// formatText envuelve todo en <p>; para etiquetas dentro de un botón se usa sin ese envoltorio
function formatInline(text) {
  return formatText(text).replace(/^<p>/, '').replace(/<\/p>$/, '');
}

/**
 * HTML de un mensaje del agente. Con `interactive` las opciones numeradas finales pasan a ser botones.
 */
function renderAgentMessage(text, { interactive = true, gateActive = false } = {}) {
  const parsed = (interactive || gateActive) ? parseOptionBlock(text) : null;
  if (!parsed) return formatText(text);

  // La compuerta de aprobación ya ofrece esas mismas respuestas (aprobar / ajustar): no se repiten en el mensaje
  if (gateActive) {
    return [parsed.before, parsed.after].filter(part => part.trim()).map(formatText).join('');
  }

  const buttons = parsed.options.map(opt => {
    const plain = stripInlineMarkdown(opt.label);
    return `<button type="button" class="inline-option${opt.isCustom ? ' is-custom' : ''}" data-number="${opt.number}" data-custom="${opt.isCustom ? '1' : '0'}" data-label="${escapeHtml(plain)}">` +
      `<span class="inline-option-num" aria-hidden="true">${opt.number}</span>` +
      `<span class="inline-option-text">${formatInline(opt.label)}</span>` +
      `</button>`;
  }).join('');

  const beforeHtml = parsed.before.trim() ? formatText(parsed.before) : '';
  const afterHtml = parsed.after.trim() ? formatText(parsed.after) : '';
  return `${beforeHtml}<div class="inline-options" role="group" aria-label="Opciones de respuesta">${buttons}</div>${afterHtml}`;
}

// Las opciones de mensajes anteriores dejan de ser interactivas (se conserva la elegida resaltada)
function lockInlineOptions() {
  if (!chatMessages) return;
  chatMessages.querySelectorAll('.inline-options').forEach(group => {
    group.classList.add('is-locked');
    group.querySelectorAll('button').forEach(btn => {
      btn.setAttribute('aria-disabled', 'true');
      btn.setAttribute('tabindex', '-1');
    });
  });
}

if (chatMessages) {
  chatMessages.addEventListener('click', (e) => {
    const btn = e.target.closest('.inline-option');
    if (!btn) return;
    const group = btn.closest('.inline-options');
    if (!group || group.classList.contains('is-locked') || turnInFlight) return;

    const number = btn.getAttribute('data-number');
    if (btn.getAttribute('data-custom') === '1') {
      // "Escribir mi propia opción": se deja el número puesto para que el usuario complete su respuesta
      userInput.value = `${number}. `;
      userInput.dispatchEvent(new Event('input'));
      userInput.focus();
      return;
    }
    btn.classList.add('is-chosen');
    sendMessage(`${number}. ${btn.getAttribute('data-label')}`);
  });
}

// 7. Manejo del Chat y Streaming SSE
// Un único turno a la vez: Enter, las opciones y las compuertas pasan por sendMessage(), que ignora cualquier
// envío mientras hay un turno en curso (antes el servidor respondía 409 y el mensaje se perdía).
let turnInFlight = false;
let currentTurn = null; // { controller, sessionId, cancelled, silent }

const SEND_ICON_HTML = btnSend ? btnSend.innerHTML : '';
const STOP_ICON_HTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"></rect></svg>';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// El botón de enviar pasa a ser "Detener" mientras hay un turno en curso
function setTurnUi(inFlight) {
  turnInFlight = inFlight;
  if (chatMessages) chatMessages.setAttribute('aria-busy', String(inFlight));
  if (!btnSend) return;
  btnSend.disabled = false;
  btnSend.classList.toggle('is-stop', inFlight);
  btnSend.setAttribute('aria-label', inFlight ? 'Detener respuesta' : 'Enviar mensaje');
  btnSend.title = inFlight ? 'Detener respuesta' : 'Enviar mensaje';
  btnSend.innerHTML = inFlight ? STOP_ICON_HTML : SEND_ICON_HTML;
}

/** Bloque SSE ("event: x\ndata: {...}") -> { name, data }; null para comentarios (": ping") y bloques vacíos */
function parseSseBlock(block) {
  const eventMatch = block.match(/^event: (\w+)/m);
  if (!eventMatch) return null;
  const dataMatch = block.match(/^data: (.*)$/m);
  let data = {};
  if (dataMatch) {
    try { data = JSON.parse(dataMatch[1]); } catch (e) { data = {}; }
  }
  return { name: eventMatch[1], data };
}

function isNearBottom(el, slack = 80) {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= slack;
}

// Re-renderiza la respuesta en streaming como mucho una vez por frame, y solo sigue el final si el usuario ya estaba ahí
function queueAgentRender(ctx) {
  if (ctx.renderQueued) return;
  ctx.renderQueued = true;
  const schedule = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (fn) => setTimeout(fn, 16);
  schedule(() => {
    ctx.renderQueued = false;
    if (ctx.finished) return;
    const stick = isNearBottom(chatMessages);
    ctx.agentBody.innerHTML = formatText(ctx.fullResponse);
    if (stick) chatMessages.scrollTop = chatMessages.scrollHeight;
  });
}

function hideTurnPill(ctx) {
  const pill = ctx.agentDiv.querySelector('.agent-activity-pill');
  if (pill) pill.style.display = 'none';
}

function clearGateInProgress() {
  const gateContainer = document.getElementById('approvalGateContainer');
  if (gateContainer && gateContainer.querySelector('.gate-in-progress')) {
    gateContainer.style.display = 'none';
    gateContainer.innerHTML = '';
  }
}

function showTurnError(ctx, html) {
  ctx.finished = true;
  hideTurnPill(ctx);
  clearGateInProgress();
  ctx.agentBody.innerHTML = html;
  const timeSpan = ctx.agentDiv.querySelector('.message-time');
  if (timeSpan) timeSpan.textContent = 'Ahora';
}

// Cierre correcto de un turno: render final (con opciones como botones), compuerta y cachés
function finishTurnRender(ctx, doneData) {
  ctx.finished = true;
  hideTurnPill(ctx);
  clearGateInProgress();

  // Acción pendiente: si la respuesta fue un desvío (sin título de Etapa/Fase) la pregunta del flujo
  // sigue vigente, así que se restauran sus controles en vez de dejar la compuerta vacía
  let nextAction = doneData.action || null;
  if (nextAction) {
    lastPendingAction = nextAction;
  } else if (!MessageHeuristics.isFlowMessage(ctx.fullResponse) && lastPendingAction) {
    nextAction = lastPendingAction;
  } else {
    lastPendingAction = null;
  }

  if (!ctx.fullResponse.trim()) {
    if (doneData.code && doneData.code !== 0) {
      ctx.agentBody.innerHTML = `<p style="color:#ffb86c;display:flex;align-items:center;gap:6px;"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg><span>El motor <strong>${escapeHtml(ctx.engineLabel)}</strong> finalizó con código de error ${escapeHtml(doneData.code)} sin emitir texto. Revisa la pestaña Consola para verificar el registro técnico o cambia de motor en el menú superior.</span></p>`;
    } else {
      ctx.agentBody.innerHTML = formatText('Respuesta completada.');
    }
  } else {
    const stick = isNearBottom(chatMessages);
    ctx.agentBody.innerHTML = renderAgentMessage(ctx.fullResponse, { gateActive: nextAction?.type === 'gate' });
    if (stick) chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  const timeSpan = ctx.agentDiv.querySelector('.message-time');
  if (timeSpan) timeSpan.textContent = 'Ahora';

  evaluateInteractiveActions(ctx.fullResponse, nextAction);
  loadWorkspaceInfo();
  syncSessionCache();
}

/** Procesa un evento SSE del turno. Devuelve 'done' | 'error' | 'cancelled' si fue terminal, o null. */
function handleChatEvent(event, ctx) {
  const { name, data } = event;

  if (name === 'chunk') {
    if (data.type === 'text_delta') {
      ctx.fullResponse += data.text || '';
      queueAgentRender(ctx);
    } else if (data.type === 'tool_activity') {
      const text = (data.text || '').trim();
      const pill = ctx.agentDiv.querySelector('.agent-activity-pill');
      if (pill && text) {
        pill.style.display = 'inline-flex';
        const label = pill.querySelector('.activity-label');
        if (label) label.textContent = text;
      }
      const gateDetail = document.getElementById('gateProgressActivity');
      if (gateDetail && text) gateDetail.textContent = text;
      if (text) {
        notifyTrackerBuilding(text);
        appendLog(text, 'info');
      }
    } else if (data.text && data.text.trim()) {
      // Actividad de herramientas, scripts o stderr: a la consola técnica
      appendLog(data.text.trim(), data.type === 'log' ? 'warn' : 'info');
    }
    return null;
  }

  if (name === 'metrics') {
    updateTelemetry(data);
    return null;
  }

  if (name === 'done') {
    appendLog(`[AgentBridge] Turno completado (código: ${data.code ?? 0}).`);
    finishTurnRender(ctx, data);
    return 'done';
  }

  if (name === 'error') {
    const reason = data.error || 'Error desconocido';
    appendLog('[Error] ' + reason, 'error');
    showTurnError(ctx, `<p style="color:#ff5555;display:flex;align-items:flex-start;gap:6px;"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:3px;"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg><span>Error en ${escapeHtml(ctx.engineLabel)}: ${escapeHtml(reason)}. Verifica que el servicio esté disponible o selecciona otro motor.</span></p>`);
    return 'error';
  }

  if (name === 'cancelled') return 'cancelled';
  return null;
}

async function readChatStream(res, ctx) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let outcome = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop(); // guardar fragmento incompleto

    for (const block of blocks) {
      const event = parseSseBlock(block);
      if (!event) continue;
      const result = handleChatEvent(event, ctx);
      if (result) outcome = result;
    }
  }
  // El stream terminó sin evento terminal: se cortó la conexión (p. ej. un túnel por inactividad)
  return outcome || 'dropped';
}

/**
 * La conexión se cortó a mitad de turno. El servidor deja terminar al agente y guarda la respuesta, así que se
 * consulta el historial hasta que termine y se muestra esa respuesta.
 * @returns {'recovered' | 'cancelled' | 'lost'}
 */
async function recoverTurn(ctx, turn) {
  if (!ctx.fullResponse.trim()) {
    ctx.agentBody.innerHTML = '<p class="turn-recovering">Conexión interrumpida. El agente sigue trabajando: recuperando la respuesta…</p>';
  }
  appendLog('[Chat] Conexión interrumpida durante el turno; recuperando la respuesta desde el historial.', 'warn');

  const deadline = Date.now() + 15 * 60 * 1000;
  while (Date.now() < deadline) {
    await sleep(2000);
    if (turn.cancelled) return 'cancelled';

    let data;
    try {
      const res = await fetch('/api/chat/history');
      if (res.status === 401) { window.location.href = '/login'; return 'lost'; }
      if (!res.ok) continue;
      data = await res.json();
    } catch (e) {
      continue; // sin red todavía: reintentar
    }
    if (data.busy) continue;

    const messages = Array.isArray(data.messages) ? data.messages : [];
    const last = messages[messages.length - 1];
    if (last && last.role === 'assistant' && (last.content || last.text)) {
      ctx.fullResponse = last.content || last.text;
      finishTurnRender(ctx, { code: 0, action: data.pendingAction || null });
      return 'recovered';
    }
    return 'lost';
  }
  return 'lost';
}

// Botón Detener: el servidor termina el proceso del agente y descarta la respuesta parcial
async function stopTurn() {
  // Se captura el turno: mientras se espera la cancelación el servidor puede cerrar el flujo y vaciar currentTurn
  const turn = currentTurn;
  if (!turn || turn.cancelled) return;
  turn.cancelled = true;
  try {
    await fetch('/api/chat/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: turn.sessionId })
    });
  } catch (e) {}
  turn.controller.abort();
}

// Cancela el turno en curso sin tocar la interfaz (reinicios de sesión)
function abortTurnSilently() {
  if (!currentTurn) return;
  currentTurn.cancelled = true;
  currentTurn.silent = true;
  currentTurn.controller.abort();
}

async function sendMessage(text = null) {
  if (turnInFlight) return;
  const fromInput = text === null;
  const typedMessage = (fromInput ? userInput.value : String(text)).trim();
  if (!typedMessage && pendingAttachments.length === 0) return;

  const message = typedMessage || 'He adjuntado archivos de referencia para el proyecto.';

  // Si hay adjuntos pendientes de enviar, se le avisa al motor en el propio mensaje del
  // turno (única forma de que lo vea, ya que solo el primer turno recibe el prompt completo)
  const sentAttachments = pendingAttachments;
  let outgoingMessage = message;
  if (sentAttachments.length > 0) {
    outgoingMessage += `\n\n[Archivos adjuntos en uploads/: ${sentAttachments.map((f) => f.name).join(', ')}]`;
  }

  // Una respuesta al flujo resuelve la compuerta pendiente; una pregunta o pedido ajeno la deja vigente
  const gateSnapshot = lastPendingAction;
  if (!MessageHeuristics.isRequestOrQuestion(message)) lastPendingAction = null;

  pendingAttachments = [];
  renderAttachmentsTray();

  // Inspeccionar respuesta del usuario para enriquecer reactivamente el Blueprint en vivo
  inspectUserMessageForState(message);

  userInput.value = '';
  userInput.style.height = 'auto';
  lockInlineOptions();

  // Ocultar compuerta al enviar respuesta (salvo si está en progreso)
  const approvalGateContainer = document.getElementById('approvalGateContainer');
  if (approvalGateContainer && !approvalGateContainer.querySelector('.gate-in-progress')) {
    approvalGateContainer.style.display = 'none';
  }

  // El motor se captura al enviar: cambiar el selector a mitad de turno no debe renombrar un error
  const engineValue = engineSelect.value;
  const engineLabel = engineSelect.options[engineSelect.selectedIndex]?.text || engineValue;

  const controller = new AbortController();
  const turn = { controller, sessionId, cancelled: false, silent: false };
  currentTurn = turn;
  setTurnUi(true);

  // Renderizar mensaje del usuario
  const userDiv = document.createElement('div');
  userDiv.className = 'message user-message';
  userDiv.innerHTML = `
    <div class="message-meta">
      <span class="message-time">Ahora</span>
      <span class="sender-name">Tú</span>
    </div>
    <div class="message-body">${formatText(message)}</div>
  `;
  chatMessages.appendChild(userDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  // Placeholder para la respuesta del agente
  const agentDiv = document.createElement('div');
  agentDiv.className = 'message agent-message';
  agentDiv.innerHTML = `
    <div class="message-meta">
      <span class="sender-name">Lead Engineer</span>
      <span class="message-time">Generando…</span>
    </div>
    <div class="agent-activity-pill" style="display: none;">
      <span class="activity-pulse-dot"></span>
      <span class="activity-label"></span>
    </div>
    <div class="message-body"><span class="typing-cursor"></span></div>
  `;
  chatMessages.appendChild(agentDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  const ctx = {
    agentDiv,
    agentBody: agentDiv.querySelector('.message-body'),
    fullResponse: '',
    engineLabel,
    renderQueued: false,
    finished: false
  };

  appendLog(`[Chat] Enviando mensaje con motor: ${engineValue}`);

  let status;
  let reason = '';
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: outgoingMessage, sessionId, engine: engineValue }),
      signal: controller.signal
    });

    if (res.status === 401) {
      window.location.href = '/login';
      return;
    }
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      status = 'rejected';
      reason = errBody.error || `El servidor respondió con el código ${res.status}.`;
    } else {
      status = await readChatStream(res, ctx);
    }
  } catch (err) {
    status = (turn.cancelled || err.name === 'AbortError') ? 'cancelled' : 'dropped';
  }

  if (status === 'dropped') {
    status = await recoverTurn(ctx, turn);
  }
  ctx.finished = true;

  if (!turn.silent) {
    // El servidor descarta el mensaje de un turno rechazado, cancelado o fallido: se devuelve al cuadro de texto
    const giveBack = () => {
      if (fromInput && !userInput.value.trim()) {
        userInput.value = typedMessage;
        userInput.dispatchEvent(new Event('input'));
      }
      pendingAttachments = sentAttachments;
      renderAttachmentsTray();
      if (gateSnapshot) {
        lastPendingAction = gateSnapshot;
        evaluateInteractiveActions('', gateSnapshot);
      }
    };
    const discardBubbles = () => {
      userDiv.remove();
      agentDiv.remove();
    };

    if (status === 'rejected') {
      discardBubbles();
      giveBack();
      appendLog('[Error] ' + reason, 'error');
      appendSystemEvent(reason);
    } else if (status === 'cancelled') {
      discardBubbles();
      giveBack();
      appendSystemEvent('Respuesta detenida.');
    } else if (status === 'lost') {
      discardBubbles();
      giveBack();
      appendSystemEvent('No se pudo recuperar la respuesta del agente. Tu mensaje está en el cuadro de texto para reenviarlo.');
    } else if (status === 'error') {
      giveBack();
    }
  }

  if (currentTurn === turn) currentTurn = null;
  setTurnUi(false);
  if (!turn.silent) userInput.focus();
  checkStatus();
}

if (chatForm) {
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    sendMessage();
  });
}

// El botón de enviar es "Detener" mientras hay un turno en curso
if (btnSend) {
  btnSend.addEventListener('click', (e) => {
    if (turnInFlight) {
      e.preventDefault();
      stopTurn();
    }
  });
}

// 7b. Mobile Toggle (Chat <-> Preview)
// En pantallas estrechas solo se ve un panel. Hay un botón en cada uno (el de la cabecera del preview y el de la
// barra del chat): antes solo existía el primero, que no es visible mientras se está en el chat.
const btnMobileToggle = document.getElementById('btnMobileToggle');
const btnMobileToggleChat = document.getElementById('btnMobileToggleChat');
const mobileToggleText = document.getElementById('mobileToggleText');
const panelChat = document.getElementById('panelChat');
const panelPreview = document.getElementById('panelPreview');

function toggleMobilePanel() {
  const isShowingChat = panelChat.classList.contains('active-panel');
  panelChat.classList.toggle('active-panel', !isShowingChat);
  panelPreview.classList.toggle('active-panel', isShowingChat);
  if (mobileToggleText) mobileToggleText.textContent = isShowingChat ? 'Ver Chat' : 'Ver Preview';
}

[btnMobileToggle, btnMobileToggleChat].forEach(btn => {
  if (btn) btn.addEventListener('click', toggleMobilePanel);
});

// 8. Chequeo y actualización de Entregables
// 8. Gestión Reactiva de Entregables vía DeliverableStore (SSE)
// Última versión (mtime+tamaño) cargada en cada iframe; al cambiar, la vista previa se recarga sola
let prevPrototypeVersion = null;
let prevShowcaseVersion = null;

// Carga dinámica de fuentes de Google Fonts bajo demanda para renderizado fiel
const loadedFonts = new Set();
function loadGoogleFont(fontName) {
  if (!fontName || typeof fontName !== 'string') return;
  const clean = fontName.replace(/['"]/g, '').trim();
  if (!clean || ['system-ui', 'sans-serif', 'serif', 'monospace', 'n/a', 'no definido', 'inter', 'roboto'].includes(clean.toLowerCase())) return;
  if (loadedFonts.has(clean.toLowerCase())) return;
  loadedFonts.add(clean.toLowerCase());

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(clean)}:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400;1,600&display=swap`;
  document.head.appendChild(link);
}

// =========================================================
// GESTIÓN DEL ESTADO DINÁMICO Y REACTIVO DEL BLUEPRINT
// =========================================================

let dynamicBlueprintState = {};

function deepMergeState(target = {}, source = {}) {
  const output = { ...(target || {}) };
  if (!source || typeof source !== 'object') return output;
  for (const [key, val] of Object.entries(source)) {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      output[key] = deepMergeState(target[key] || {}, val);
    } else if (val !== undefined && val !== null && val !== '') {
      output[key] = val;
    }
  }
  return output;
}

function updateDynamicBlueprintState(partial) {
  if (!partial || typeof partial !== 'object') return;
  dynamicBlueprintState = deepMergeState(dynamicBlueprintState, partial);
  const badgeState = document.getElementById('badgeState');
  if (badgeState && (dynamicBlueprintState.brand_name || dynamicBlueprintState.brand?.name || dynamicBlueprintState.brand)) {
    badgeState.style.background = 'rgba(0, 255, 255, 0.15)';
    badgeState.style.borderColor = 'rgba(0, 255, 255, 0.35)';
    badgeState.style.color = 'var(--homium-cyan)';
    badgeState.textContent = 'Activo';
  }
  renderBlueprint(dynamicBlueprintState);
}

function isColorLight(hex) {
  if (!hex || typeof hex !== 'string') return false;
  const clean = hex.replace('#', '');
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return (r * 0.299 + g * 0.587 + b * 0.114) > 175;
  } else if (clean.length === 6) {
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    return (r * 0.299 + g * 0.587 + b * 0.114) > 175;
  }
  return false;
}

function resolveFidelityLabel(s) {
  const rawMode = s.visual_dna?.fidelity_mode || s.fidelity_mode || '';
  if (rawMode === 'TOTAL_ARCHITECTURAL_FIDELITY') return 'Fidelidad Arquitectónica Total (Fast-Track)';
  if (rawMode === 'INSPIRATION') return 'Inspiración Conceptual (Vibe)';
  if (rawMode === 'SURGICAL') return 'Personalizada / Quirúrgica';
  if (rawMode && !['INSPIRATION', 'TOTAL_ARCHITECTURAL_FIDELITY', 'SURGICAL'].includes(rawMode)) {
    return rawMode;
  }

  const refText = `${s.visual_references || ''} ${s.route || ''} ${s.completed_steps?.['1.5'] || ''}`.toLowerCase();
  if (refText.includes('sin referencia') || refText.includes('desde cero') || refText.includes('secuencial') || refText.includes('original')) {
    return 'Diseño Original (Desde Cero)';
  }
  if (refText.includes('fast-track') || refText.includes('total')) {
    return 'Fidelidad Arquitectónica Total (Fast-Track)';
  }
  if (refText.includes('inspiraci')) {
    return 'Inspiración Conceptual (Vibe)';
  }
  if (refText.includes('quirúrg') || refText.includes('quirurg')) {
    return 'Personalizada / Quirúrgica';
  }
  if (s.visual_references) {
    return s.visual_references;
  }
  if (s.route) {
    return s.route;
  }
  if (s.brand_name || s.brand?.name || (typeof s.brand === 'string' && s.brand)) {
    return 'Pendiente de Selección';
  }
  return 'No definido';
}

function inspectUserMessageForState(msg) {
  if (!msg || typeof msg !== 'string') return;
  const clean = msg.trim();

  // Preguntas, pedidos, saludos o mensajes sin relación con el flujo no deben alterar el Blueprint
  // (heurística compartida con el servidor: core/text/message-heuristics.js)
  if (MessageHeuristics.isRequestOrQuestion(clean) || clean.length > 160) return;

  if (!dynamicBlueprintState.brand_name && !dynamicBlueprintState.brand?.name) {
    // isPlausibleBrandAnswer ya descarta comandos ("sí", "no sé", "continuar") y pedidos (misma lógica que el servidor)
    if (!MessageHeuristics.isCommandAnswer(clean) && MessageHeuristics.isPlausibleBrandAnswer(clean)) {
      updateDynamicBlueprintState({ brand_name: clean, brand: { name: clean } });
    }
  }

  // Las decisiones del Blueprint solo se infieren de respuestas breves que eligen una opción ("2", "B2B",
  // "Generar isotipo"): una frase larga que menciona "SaaS" o "logo" describe el negocio, no responde a la pregunta.
  if (clean.split(/\s+/).length > 8) return;
  const optionText = clean.replace(/^[0-9]+[.)]\s*/, '');

  const businessModels = [
    [/\bb2c\b/i, 'B2C — Venta directa al consumidor'],
    [/\bb2b\b/i, 'B2B — Venta a empresas / corporativo'],
    [/marketplace/i, 'Marketplace — Plataforma multivendedor'],
    [/freemium|\bsaas\b/i, 'Freemium / SaaS — Servicio base gratuito con opción Pro'],
    [/servicios profesionales|agencia|consultor/i, 'Servicios Profesionales / Agencia / Consultoría']
  ];
  // Una negación ("no quiero una agencia") descarta la opción en lugar de elegirla
  const model = /^(no|ni)\s/i.test(optionText) ? null : businessModels.find(([pattern]) => pattern.test(optionText));
  if (model) {
    updateDynamicBlueprintState({ business_model: model[1] });
  }

  if (/isotipo|logo existente|svg|logotipo/i.test(clean)) {
    updateDynamicBlueprintState({ logo: optionText, logo_type: optionText });
  }

  if (/sin referencia|desde cero|diseño original/i.test(clean)) {
    updateDynamicBlueprintState({
      visual_references: 'Sin referencias previas (diseño desde cero)',
      route: 'Secuencial'
    });
  } else if (/fidelidad total|fast-track/i.test(clean)) {
    updateDynamicBlueprintState({
      fidelity_mode: 'TOTAL_ARCHITECTURAL_FIDELITY',
      visual_dna: { ...(dynamicBlueprintState.visual_dna || {}), fidelity_mode: 'TOTAL_ARCHITECTURAL_FIDELITY' }
    });
  } else if (/inspiraci/i.test(clean)) {
    updateDynamicBlueprintState({
      fidelity_mode: 'INSPIRATION',
      visual_dna: { ...(dynamicBlueprintState.visual_dna || {}), fidelity_mode: 'INSPIRATION' }
    });
  }
}

// Resalta en el Blueprint lo que cambió entre dos renders consecutivos
const BP_LEAF_SELECTOR = '.brand-meta-item, [data-copy-hex]';

function blueprintCardKeys() {
  const seen = new Map();
  return Array.from(blueprintView.querySelectorAll('.blueprint-card')).map((card, i) => {
    const base = card.querySelector('.category-eyebrow')?.textContent.trim() || ('card-' + i);
    const n = seen.get(base) || 0;
    seen.set(base, n + 1);
    return { card, key: n ? (base + '#' + n) : base };
  });
}

function renderBlueprint(s) {
  if (!s) return;
  const before = new Map(blueprintCardKeys().map(({ card, key }) => [key, card.innerHTML]));
  renderBlueprintRaw(s);
  if (before.size === 0) return; // primer render o restauración: nada que resaltar

  let firstChanged = null;
  for (const { card, key } of blueprintCardKeys()) {
    const prevHtml = before.get(key);
    if (prevHtml === card.innerHTML) continue;

    let flashTargets = [];
    if (prevHtml !== undefined) {
      const tpl = document.createElement('template');
      tpl.innerHTML = prevHtml;
      const prevLeaves = new Set(Array.from(tpl.content.querySelectorAll(BP_LEAF_SELECTOR)).map(el => el.outerHTML));
      flashTargets = Array.from(card.querySelectorAll(BP_LEAF_SELECTOR)).filter(el => !prevLeaves.has(el.outerHTML));
    }
    if (flashTargets.length === 0) flashTargets = [card];

    flashTargets.forEach(el => {
      el.classList.add('bp-changed');
      el.addEventListener('animationend', () => el.classList.remove('bp-changed'), { once: true });
    });
    if (!firstChanged) firstChanged = flashTargets[0];
  }

  if (firstChanged && blueprintView.offsetParent !== null) {
    firstChanged.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

// El agente puede guardar un campo de texto como objeto ({ type, source }); lo reduce a una etiqueta legible
function stateValueToLabel(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.map(stateValueToLabel).filter(Boolean).join(', ');
  if (typeof v !== 'object') return '';
  const humanize = (t) => t.replace(/_/g, ' ');
  const main = ['type', 'tipo', 'name', 'nombre', 'label', 'status', 'estado', 'value', 'description', 'descripcion']
    .map(k => (typeof v[k] === 'string' ? v[k].trim() : ''))
    .find(Boolean);
  const source = typeof v.source === 'string' ? v.source.trim() : '';
  if (main) return humanize(source ? `${main} (${source})` : main);
  return humanize(Object.values(v).filter(x => typeof x === 'string' && x.trim()).join(' · '));
}

function renderBlueprintRaw(s) {
  if (!s) return;
  // Helper: lee s.confirmed con keys en español (schema de OpenCode/Muse Spark)
  const c = s.confirmed || {};
  const _cKey = (keys) => { for (const k of keys) { const v = c[k]; if (v && typeof v === 'string') return v; } return ''; };

  const brandName = typeof s.brand === 'string' ? s.brand :
    (s.brand?.name || s.brand_name || _cKey(['Marca', 'marca', 'Brand', 'brand']) ||
     s.completed_steps?.['1.1']?.name || '');

  const brandPurpose = s.mission || s.purpose || s.brand?.purpose || s.brand?.mission ||
    s.brand?.descripcion || s.brand?.description || s.brand?.mision ||
    s.visual_dna?.purpose ||
    _cKey(['Propósito', 'Proposito', 'PropÃ³sito', 'proposito', 'purpose', 'Purpose', 'Misión', 'Mision', 'mission']) ||
    s.completed_steps?.['1.2']?.mission || s.completed_steps?.['1.2']?.purpose || '';

  const _rawBizModel = s.business_model || s.brand?.business_model || s.brand?.modelo_negocio ||
    _cKey(['Modelo', 'modelo', 'Model', 'model', 'ModeloNegocio', 'business_model']) ||
    s.completed_steps?.['1.3']?.business_model || '';
  const brandBusinessModel = (typeof _rawBizModel === 'string' && _rawBizModel.length < 120 &&
    !_rawBizModel.trimStart().startsWith('{') && !_rawBizModel.trimStart().startsWith('[')) ? _rawBizModel : '';

  const brandLogo = stateValueToLabel(s.logo || s.logo_type || s.brand?.logo_type || s.brand?.logo ||
    s.brand?.logo_url || s.brand?.isotipo ||
    _cKey(['Logo', 'logo', 'Isotipo', 'isotipo', 'logo_type']) ||
    s.completed_steps?.['1.4']?.logo || '');

  const brandFidelity = resolveFidelityLabel(s) ||
    _cKey(['Fidelidad', 'fidelidad', 'fidelity', 'Fidelity']) || '';

  let brand = {
    name: brandName,
    purpose: brandPurpose,
    business_model: brandBusinessModel,
    logo_type: brandLogo,
    fidelity_mode: brandFidelity
  };

  const f = s.foundations || {};
  const palette = s.palette || f.palette || {};
  const step21 = s.completed_steps?.['2.1'] || {};
  const step22 = s.completed_steps?.['2.2'] || {};
  const typoRaw = s.typography || f.typography || {};
  let typo = {
    font_display: typoRaw.font_display || typoRaw.display || step22.typography_display || step22.display || '',
    font_ui: typoRaw.font_ui || typoRaw.body || typoRaw.font_body || step22.typography_ui || step22.ui || step22.body || '',
    font_body: typoRaw.font_body || typoRaw.body || typoRaw.font_ui || step22.typography_ui || step22.body || '',
    font_mono: typoRaw.font_mono || typoRaw.mono || '',
    character: typoRaw.character || '',
    h1_size_px: typoRaw.h1_size_px || 64
  };
  let sitemap = s.sitemap || f.sitemap || {};
  let modularScale = s.modular_scale || f.modular_scale || {};
  let densityMode = s.density_mode || f.density_mode || {};
  let personality = s.personality || f.personality || {};
  let geometry = s.geometry_tokens || f.geometry_elevations || {};
  let components = s.components || {};

  // Extraer allowedHexes (soporta array plano, rampas de objetos, campos individuales o completed_steps)
  let allowedHexes = palette.allowed_hexes || [];
  if (!Array.isArray(allowedHexes) || allowedHexes.length === 0) {
    const hexSet = new Set();
    const scanObject = (obj) => {
      if (!obj || typeof obj !== 'object') return;
      Object.values(obj).forEach(val => {
        if (typeof val === 'string' && /^#[0-9a-fA-F]{3,6}$/.test(val)) {
          hexSet.add(val.toUpperCase());
        } else if (typeof val === 'object' && val !== null) {
          scanObject(val);
        }
      });
    };
    scanObject(palette);
    scanObject(step21);
    allowedHexes = Array.from(hexSet);
  }

  // Resolver roles cromáticos semánticos con soporte para completed_steps
  const mapping = f.semantic_color_mapping || {};
  let primaryHex = palette.primary_hex || palette.primary || step21.primary || '';
  let secondaryHex = palette.secondary_hex || palette.secondary || step21.secondary || '';
  let accentHex = palette.accent_hex || palette.accent || step21.accent || '';
  let bgBase = palette.bg_base || palette.background || step21.background || '';
  let surfaceCard = palette.surface_card || palette.surface || step21.surface || '';
  let surfaceCardHover = palette.surface_card_hover || step21.surface_hover || '';
  let textPrimary = palette.text_primary || palette.text_base || palette.text || step21.text || '';
  let textSecondary = palette.text_secondary || step21.text_secondary || '';

  if (!primaryHex && mapping.primary && palette[mapping.primary]) {
    primaryHex = palette[mapping.primary]['500'] || palette[mapping.primary]['600'] || '';
  }
  if (!accentHex && mapping.accent && palette[mapping.accent]) {
    accentHex = palette[mapping.accent]['500'] || palette[mapping.accent]['400'] || '';
  }
  if (!bgBase && mapping.neutral_surface && palette[mapping.neutral_surface]) {
    bgBase = palette[mapping.neutral_surface]['950'] || palette[mapping.neutral_surface]['900'] || '';
    surfaceCard = palette[mapping.neutral_surface]['900'] || palette[mapping.neutral_surface]['800'] || '';
    surfaceCardHover = palette[mapping.neutral_surface]['800'] || '#2f3637';
    textPrimary = palette[mapping.neutral_surface]['50'] || '#f1f3f3';
    textSecondary = palette[mapping.neutral_surface]['300'] || '#acb7b9';
  }
  if (!secondaryHex && mapping.neutral_warm && palette[mapping.neutral_warm]) {
    secondaryHex = palette[mapping.neutral_warm]['500'] || '#8f8270';
  }

  if (!primaryHex && allowedHexes.length > 0) primaryHex = allowedHexes[0];
  if (!secondaryHex && allowedHexes.length > 1) secondaryHex = allowedHexes[1];
  if (!accentHex && allowedHexes.length > 2) accentHex = allowedHexes[2];

  // Detección adaptativa de Modo Claro vs Modo Oscuro para contraste óptico
  const isLightScheme = Boolean(
    (f.color_scheme && f.color_scheme.toLowerCase().includes('claro')) ||
    (surfaceCard && isColorLight(surfaceCard)) ||
    (bgBase && isColorLight(bgBase))
  );

  if (isLightScheme) {
    if (!bgBase) bgBase = '#FFFFFF';
    if (!surfaceCard) surfaceCard = '#F8FAFC';
    if (!textPrimary) textPrimary = '#0F172A';
    if (!textSecondary) textSecondary = '#475569';
  } else {
    if (!bgBase) bgBase = '#101313';
    if (!surfaceCard) surfaceCard = '#171b1c';
    if (!textPrimary) textPrimary = '#f1f3f3';
    if (!textSecondary) textSecondary = '#acb7b9';
  }

  const metaBrand = document.getElementById('metaBrandValue');
  if (metaBrand && brand.name) {
    metaBrand.textContent = brand.name;
  }
  updateProjectDate(s?.updated_at || s?.timestamp);

  // Cargar fuentes dinámicamente si están presentes
  if (typo.font_display) loadGoogleFont(typo.font_display);
  if (typo.font_ui) loadGoogleFont(typo.font_ui);
  if (typo.font_body) loadGoogleFont(typo.font_body);
  if (typo.font_mono) loadGoogleFont(typo.font_mono);

  // Saneamiento de salida: a partir de aquí los valores del estado solo se usan para construir HTML.
  // Las cadenas se escapan, los colores y nombres de fuente se validan antes de llegar a atributos style/data-*.
  primaryHex = safeCssColor(primaryHex);
  secondaryHex = safeCssColor(secondaryHex);
  accentHex = safeCssColor(accentHex);
  bgBase = safeCssColor(bgBase);
  surfaceCard = safeCssColor(surfaceCard);
  surfaceCardHover = safeCssColor(surfaceCardHover);
  textPrimary = safeCssColor(textPrimary);
  textSecondary = safeCssColor(textSecondary);
  allowedHexes = (Array.isArray(allowedHexes) ? allowedHexes : []).filter(h => typeof h === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(h));

  const fontDisplay = safeFontName(typo.font_display);
  const fontBody = safeFontName(typo.font_ui || typo.font_body);
  const fontMono = safeFontName(typo.font_mono);
  typo = {
    font_display: fontDisplay,
    font_ui: safeFontName(typo.font_ui),
    font_body: safeFontName(typo.font_body),
    font_mono: fontMono,
    character: escapeHtml(typo.character),
    h1_size_px: Number(typo.h1_size_px) || 64
  };
  brand = {
    name: escapeHtml(brand.name),
    purpose: escapeHtml(brand.purpose),
    business_model: escapeHtml(brand.business_model),
    logo_type: escapeHtml(brand.logo_type),
    fidelity_mode: escapeHtml(brand.fidelity_mode)
  };
  sitemap = escapeDeep(sitemap);
  modularScale = escapeDeep(modularScale);
  densityMode = escapeDeep(densityMode);
  personality = escapeDeep(personality);
  geometry = escapeDeep(geometry);
  components = escapeDeep(components);

  const displayFontFamily = fontDisplay ? `'${fontDisplay}', sans-serif` : 'inherit';
  const bodyFontFamily = fontBody ? `'${fontBody}', sans-serif` : 'inherit';

  // 1. Swatches de allowlist
  let hexCards = '';
  allowedHexes.forEach(hex => {
    hexCards += `
      <div class="swatch-item" data-copy-hex="${hex}" title="Clic para copiar ${hex}">
        <div class="swatch-box" style="background-color: ${hex};"></div>
        <span class="swatch-label">${hex}</span>
      </div>
    `;
  });

  // 2. Roles cromáticos semánticos
  const roles = [
    { label: 'Primario', val: primaryHex },
    { label: 'Secundario', val: secondaryHex },
    { label: 'Acento', val: accentHex },
    { label: 'Fondo Base', val: bgBase },
    { label: 'Superficie', val: surfaceCard },
    { label: 'Hover Tarjeta', val: surfaceCardHover },
    { label: 'Texto Primario', val: textPrimary },
    { label: 'Texto Secundario', val: textSecondary }
  ].filter(r => Boolean(r.val));

  let rolesHtml = '';
  if (roles.length > 0) {
    roles.forEach(r => {
      rolesHtml += `
        <div class="palette-role-card" data-copy-hex="${r.val}" title="Clic para copiar ${r.val}">
          <div class="palette-role-swatch" style="background-color: ${r.val};"></div>
          <span class="palette-role-name">${r.label}</span>
          <span class="palette-role-hex">${r.val}</span>
        </div>
      `;
    });
  }

  // 3. Mini Canvas de UI en Vivo (Visual Preview de la identidad)
  const borderSubtle = isLightScheme ? 'rgba(0, 0, 0, 0.08)' : (safeCssColor(palette.border_subtle) || 'rgba(255, 255, 255, 0.12)');

  const liveSpecimenHtml = (primaryHex || allowedHexes.length > 0) ? `
    <div class="blueprint-card">
      <span class="category-eyebrow">Demostración en Vivo · Tokens Aplicados</span>
      <h4>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
        Canvas de Identidad Visual en Tiempo Real
      </h4>
      <div class="live-specimen-canvas" style="background-color: ${bgBase}; border-color: ${borderSubtle};">
        <span class="live-specimen-badge" style="background-color: ${accentHex}25; color: ${accentHex}; border: 1px solid ${accentHex}50;">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
          ${brand.name || 'Marca'} · UI Specimen
        </span>
        <div class="live-specimen-card" style="background-color: ${surfaceCard}; border: 1px solid ${borderSubtle};">
          <h3 style="font-family: ${displayFontFamily}; color: ${textPrimary}; font-size: 1.45rem; font-weight: 700; margin: 0 0 0.5rem; line-height: 1.25;">
            ${brand.purpose || 'Arquitectura web y diseño digital de alta fidelidad'}
          </h3>
          <p style="font-family: ${bodyFontFamily}; color: ${textSecondary}; font-size: 13.5px; line-height: 1.6; margin: 0 0 1rem;">
            Tokens semánticos vinculados en disco con escala modular ${modularScale.name || 'Golden Ratio'} (${modularScale.ratio || '1.618'}) y contraste verificado WCAG 2.2 AAA.
          </p>
          <div class="live-specimen-actions">
            <button class="live-btn-primary" style="background-color: ${primaryHex}; color: #ffffff;">
              <span>Iniciar Proyecto</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
            </button>
            <button class="live-btn-secondary" style="border-color: ${secondaryHex}; color: ${secondaryHex};">
              <span>Explorar Catálogo</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  ` : '';

  // 4. Tipografía Specimen
  const hasTypo = Boolean(typo.font_display || typo.font_ui || typo.font_body);
  const typographyHtml = `
    <div class="blueprint-card">
      <span class="category-eyebrow">Tipografía Maestra</span>
      <h4>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="4 7 4 4 20 4 20 7"></polyline><line x1="9" y1="20" x2="15" y2="20"></line><line x1="12" y1="4" x2="12" y2="20"></line></svg>
        Sistema Tipográfico & Specimen de Glifos
      </h4>
      ${hasTypo ? `
        <div class="typography-specimen-container">
          ${typo.font_display ? `
            <div class="type-family-box">
              <div class="type-family-header">
                <span class="type-role-tag">Display · Encabezados & Eyebrows</span>
                <span style="font-weight: 600; font-size: 13px; color: #fff;">${typo.font_display} (H1: ${typo.h1_size_px || 64}px)</span>
              </div>
              <div class="type-sample-display" style="font-family: ${displayFontFamily};">
                ${brand.name || 'Agencia Digital'} — Arquitectura & Diseño
              </div>
              <div class="glyph-strip" style="font-family: ${displayFontFamily};">
                Aa Bb Cc Dd Ee Ff Gg Hh Ii Jj Kk Ll Mm Nn Oo Pp Qq Rr Ss Tt Uu Vv Ww Xx Yy Zz 0123456789 & @ # %
              </div>
            </div>
          ` : ''}

          ${(typo.font_ui || typo.font_body) ? `
            <div class="type-family-box">
              <div class="type-family-header">
                <span class="type-role-tag" style="color: var(--homium-green);">UI & Body · Lectura y Componentes</span>
                <span style="font-weight: 600; font-size: 13px; color: #fff;">${typo.font_ui || typo.font_body}</span>
              </div>
              <div class="type-sample-body" style="font-family: ${bodyFontFamily};">
                Tipografía de cuerpo calibrada para interfaces interactivas, menús de navegación, tarjetas y micro-copys de alta legibilidad.
              </div>
              ${typo.character ? `
                <p style="font-size: 12px; color: rgba(255,255,255,0.7); margin-top: 0.5rem; margin-bottom: 0;">
                  <strong>Carácter:</strong> ${typo.character}
                </p>
              ` : ''}
              <div style="font-family: ${bodyFontFamily}; font-size: 11.5px; color: rgba(255,255,255,0.6); display: flex; gap: 1rem; flex-wrap: wrap; margin-top: 0.5rem;">
                <span>H1: 56px</span><span>H2: 28px</span><span>H3: 20px</span><span>Body: 15px</span><span>Caption: 12px</span>
              </div>
            </div>
          ` : ''}

          ${typo.font_mono ? `
            <div class="type-family-box">
              <div class="type-family-header">
                <span class="type-role-tag" style="color: var(--homium-cyan);">Monospace · Código & Métricas</span>
                <span style="font-weight: 600; font-size: 13px; color: #fff;">${typo.font_mono}</span>
              </div>
              <div class="type-sample-body" style="font-family: '${typo.font_mono}', monospace; font-size: 13px;">
                const token = { brand: "${brand.name || 'Brand'}", ratio: ${modularScale.ratio || '1.618'} };
              </div>
            </div>
          ` : ''}
        </div>
      ` : `
        <div style="background: rgba(255,255,255,0.03); border: 1px dashed rgba(255,255,255,0.15); border-radius: 10px; padding: 1.25rem; text-align: center; color: rgba(255,255,255,0.6); font-size: 13.5px;">
          <p style="margin: 0;">Las fuentes Display y UI se renderizarán aquí en vivo con sus glifos en cuanto las selecciones en el chat (Fase 2: Foundations Visuales).</p>
        </div>
      `}
    </div>
  `;

  // 5. Estructura y Sitemap de Páginas
  const hasSitemap = Boolean(sitemap.p1_home || sitemap.site_type);
  const sitemapHtml = hasSitemap ? `
    <div class="blueprint-card">
      <span class="category-eyebrow">Arquitectura de Navegación</span>
      <h4>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>
        Sitemap & Páginas Clave (${sitemap.mode || 'MPA'})
      </h4>
      <p style="font-size: 13.5px; color: rgba(255,255,255,0.7); margin-bottom: 0.75rem;">
        Tipo de sitio: <strong>${sitemap.site_type || 'General'}</strong>
      </p>
      <div class="sitemap-flow-grid">
        ${sitemap.p1_home ? `
          <div class="sitemap-page-card">
            <div class="sitemap-page-header">
              <span class="sitemap-page-title">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
                Página 1: Principal (Home)
              </span>
              <span class="sitemap-route-pill">/</span>
            </div>
            <p class="sitemap-page-desc">${sitemap.p1_description || 'Hero, propuesta de valor y catálogo principal.'}</p>
          </div>
        ` : ''}

        ${sitemap.p2_key ? `
          <div class="sitemap-page-card">
            <div class="sitemap-page-header">
              <span class="sitemap-page-title">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                Página 2: Acción Clave (Key Content)
              </span>
              <span class="sitemap-route-pill">/proyectos</span>
            </div>
            <p class="sitemap-page-desc">${sitemap.p2_description || 'Catálogo filtrable o showcase detallado.'}</p>
          </div>
        ` : ''}

        ${sitemap.p3_conversion ? `
          <div class="sitemap-page-card">
            <div class="sitemap-page-header">
              <span class="sitemap-page-title">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                Página 3: Conversión & Cierre
              </span>
              <span class="sitemap-route-pill">/contacto</span>
            </div>
            <p class="sitemap-page-desc">${sitemap.p3_description || 'Formulario de briefing, agenda y canales directos.'}</p>
          </div>
        ` : ''}
      </div>
    </div>
  ` : '';

  // 6. Personalidad & Arquetipo
  const hasPersonality = Boolean(personality.archetype || personality.tone);
  const personalityHtml = hasPersonality ? `
    <div class="blueprint-card">
      <span class="category-eyebrow">Fase 1 · Personalidad & Arquetipo</span>
      <h4>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
        Arquetipo de Marca & Tono de Voz
      </h4>
      <div class="brand-meta-grid">
        <div class="brand-meta-item">
          <span class="meta-label">Arquetipo</span>
          <span class="meta-value">${personality.archetype || 'No definido'}</span>
        </div>
        <div class="brand-meta-item">
          <span class="meta-label">Tono de Voz</span>
          <span class="meta-value">${personality.tone || 'No definido'}</span>
        </div>
      </div>
    </div>
  ` : '';

  // 7. Componentes Atómicos
  const hasComponents = Boolean(components.buttons || components.cards);
  const componentsHtml = hasComponents ? `
    <div class="blueprint-card">
      <span class="category-eyebrow">Fase 3 · Componentes Atómicos</span>
      <h4>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>
        Morfología de Componentes
      </h4>
      <div class="brand-meta-grid">
        ${components.buttons ? `
          <div class="brand-meta-item">
            <span class="meta-label">Botones</span>
            <span class="meta-value">${components.buttons.style || 'Estándar'}</span>
          </div>
        ` : ''}
        ${components.cards ? `
          <div class="brand-meta-item">
            <span class="meta-label">Tarjetas</span>
            <span class="meta-value">${components.cards.style || 'Estándar'} ${components.cards.border ? `(${components.cards.border} / ${components.cards.radius || ''})` : ''}</span>
          </div>
        ` : ''}
      </div>
    </div>
  ` : '';

  // 8. Geometría & Elevaciones
  const hasGeometry = Boolean(geometry.style || geometry.radius_controls || geometry.radius_surfaces || geometry.shadows || modularScale.name);
  const geometryHtml = hasGeometry ? `
    <div class="blueprint-card">
      <span class="category-eyebrow">Geometría, Elevaciones & Escalas</span>
      <h4>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
        Geometría Táctil & Escalas
      </h4>
      <div class="brand-meta-grid">
        ${geometry.style ? `
          <div class="brand-meta-item">
            <span class="meta-label">Estilo Morfológico</span>
            <span class="meta-value">${geometry.style}</span>
          </div>
        ` : ''}
        ${geometry.radius_controls ? `
          <div class="brand-meta-item">
            <span class="meta-label">Radio Controles</span>
            <span class="meta-value">${geometry.radius_controls}</span>
          </div>
        ` : ''}
        ${geometry.radius_surfaces ? `
          <div class="brand-meta-item">
            <span class="meta-label">Radio Superficies</span>
            <span class="meta-value">${geometry.radius_surfaces}</span>
          </div>
        ` : ''}
        ${geometry.shadows ? `
          <div class="brand-meta-item">
            <span class="meta-label">Elevación / Sombras</span>
            <span class="meta-value">${geometry.shadows}</span>
          </div>
        ` : ''}
        ${modularScale.name ? `
          <div class="brand-meta-item">
            <span class="meta-label">Escala Modular</span>
            <span class="meta-value">${modularScale.name} (${modularScale.ratio || 1.618})</span>
          </div>
        ` : ''}
        ${densityMode.mode ? `
          <div class="brand-meta-item">
            <span class="meta-label">Densidad</span>
            <span class="meta-value">${densityMode.mode} (${densityMode.base_px || 8}px)</span>
          </div>
        ` : ''}
      </div>
    </div>
  ` : '';

  // Inyectar HTML consolidado en el inspector de Blueprint
  blueprintView.innerHTML = `
    <!-- 1. IDENTIDAD DE MARCA -->
    <div class="blueprint-card">
      <span class="category-eyebrow">Fase 1 · Identidad & Estrategia</span>
      <h4>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>
        ${brand.name || 'Marca en Configuración'}
      </h4>
      <div class="brand-meta-grid">
        <div class="brand-meta-item">
          <span class="meta-label">Propósito / Misión</span>
          <span class="meta-value">${(typeof brand.purpose === 'string' && brand.purpose.length > 0 && brand.purpose.length < 200) ? brand.purpose : 'Pendiente de Definir'}</span>
        </div>
        <div class="brand-meta-item">
          <span class="meta-label">Modelo de Negocio</span>
          <span class="meta-value">${(typeof brand.business_model === 'string' && brand.business_model.length > 0 && brand.business_model.length < 120 && !brand.business_model.startsWith('{')) ? brand.business_model : 'Pendiente de Selección'}</span>
        </div>
        <div class="brand-meta-item">
          <span class="meta-label">Disponibilidad de Logo</span>
          <span class="meta-value">${(typeof brand.logo_type === 'string' && brand.logo_type.length > 0 && brand.logo_type.length < 200) ? brand.logo_type : 'Pendiente de Definir'}</span>
        </div>
        <div class="brand-meta-item">
          <span class="meta-label">Ruta de Fidelidad</span>
          <span class="meta-value">${(typeof brand.fidelity_mode === 'string' && brand.fidelity_mode.length > 0) ? brand.fidelity_mode : 'Pendiente de Selección'}</span>
        </div>
      </div>
    </div>

    <!-- 2. MINI CANVAS EN VIVO -->
    ${liveSpecimenHtml}

    <!-- 3. SISTEMA CROMÁTICO & ROLES -->
    <div class="blueprint-card">
      <span class="category-eyebrow">Fase 2 · Foundations Cromáticos (WCAG 2.2 AAA)</span>
      <h4>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="13.5" cy="6.5" r=".5"></circle><circle cx="17.5" cy="10.5" r=".5"></circle><circle cx="8.5" cy="7.5" r=".5"></circle><circle cx="6.5" cy="12.5" r=".5"></circle><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"></path></svg>
        Paleta de Colores & Roles Semánticos
      </h4>
      ${rolesHtml ? `
        <p style="font-size: 13px; color: rgba(255,255,255,0.7); margin-bottom: 0.5rem;">Roles Funcionales de Interfaz:</p>
        <div class="palette-roles-grid">${rolesHtml}</div>
      ` : ''}

      <p style="font-size: 13px; color: rgba(255,255,255,0.7); margin-top: 1.25rem; margin-bottom: 0.5rem;">
        Allowlist Cromática Inmutable (${allowedHexes.length} colores permitidos):
      </p>
      <div class="palette-swatches">${hexCards || '<p style="color: rgba(255,255,255,0.6);">No hay colores registrados aún.</p>'}</div>
    </div>

    <!-- 4. TIPOGRAFÍA & SPECIMEN -->
    ${typographyHtml}

    <!-- 5. ARQUITECTURA SITEMAP -->
    ${sitemapHtml}

    <!-- 6. PERSONALIDAD & ARQUETIPO -->
    ${personalityHtml}

    <!-- 7. COMPONENTES ATÓMICOS -->
    ${componentsHtml}

    <!-- 8. GEOMETRÍA, ELEVACIONES & ESCALAS -->
    ${geometryHtml}
  `;

  // Copiar hex al hacer clic en swatches o tarjetas de rol
  blueprintView.querySelectorAll('[data-copy-hex]').forEach(elem => {
    elem.addEventListener('click', async () => {
      const hex = elem.getAttribute('data-copy-hex');
      if (hex) {
        try {
          await navigator.clipboard.writeText(hex);
          appendLog(`[Paleta] Hex copiado al portapapeles: ${hex}`, 'info');
        } catch (err) {}
      }
    });
  });

  // Actualizar pipeline de fases según completitud de datos reales
  const badgeProto = document.getElementById('badgePrototype');
  const badgeShowcase = document.getElementById('badgeShowcase');

  const isPhase1Done = Boolean(
    (brand.name && (brand.purpose || brand.business_model || (brand.fidelity_mode && !brand.fidelity_mode.includes('Pendiente')))) ||
    s.visual_dna ||
    s.visual_references ||
    s.current_phase > 1
  );
  const isPhase2Done = Boolean(
    ((primaryHex || allowedHexes.length > 0) && (typo.font_display || typo.font_ui)) ||
    (s.palette && s.palette.allowed_hexes) ||
    s.foundations?.palette ||
    s.phase_2_complete ||
    s.current_phase > 2
  );
  const isPhase3Done = Boolean(
    (s.components && Object.keys(s.components).length > 0) ||
    s.current_phase > 3
  );
  const isPhase4Done = Boolean(
    (badgeShowcase && badgeShowcase.textContent.includes('Listo')) ||
    s.artifacts?.showcase_html ||
    s.current_phase > 4
  );
  const isPhase5Done = Boolean(
    (badgeProto && badgeProto.textContent.includes('Listo')) ||
    s.artifacts?.prototype_screen_1 ||
    (s.current_phase >= 5 && (s.status?.includes('Completado') || s.status?.includes('Aprobado')))
  );

  if (isPhase1Done) document.getElementById('phase-1')?.classList.add('completed');
  if (isPhase2Done) document.getElementById('phase-2')?.classList.add('completed');
  if (isPhase3Done) document.getElementById('phase-3')?.classList.add('completed');
  if (isPhase4Done) document.getElementById('phase-4')?.classList.add('completed');
  if (isPhase5Done) document.getElementById('phase-5')?.classList.add('completed');

  // Asegurar que la primera fase incompleta mantenga el estado 'active'
  let foundActive = false;
  for (let i = 1; i <= 5; i++) {
    const pill = document.getElementById(`phase-${i}`);
    if (!pill) continue;
    if (!pill.classList.contains('completed') && !foundActive) {
      pill.classList.add('active');
      foundActive = true;
    } else if (pill.classList.contains('completed')) {
      pill.classList.remove('active');
    }
  }
  if (!foundActive) {
    const p5 = document.getElementById('phase-5');
    if (p5) p5.classList.add('active');
  }
}

function updateDeliverablesTracker(snapshot) {
  const trackerBar = document.getElementById('deliverablesTrackerBar');
  const trackerCount = document.getElementById('trackerCount');
  const trackerPills = document.getElementById('trackerPills');
  if (!trackerBar || !trackerCount || !trackerPills) return;

  const data = (snapshot && snapshot.status) || {};

  const items = [
    {
      id: 'token',
      label: 'Tokens JSON',
      ready: !!data.stateExists,
      hint: 'design-system-state.json'
    },
    {
      id: 'spec',
      label: data.specFile || 'Espec. Markdown',
      ready: !!data.specExists,
      hint: data.specFile || '*_Design_System.md'
    },
    {
      id: 'showcase',
      label: data.showcaseFile || 'Showcase HTML',
      ready: !!data.showcaseExists,
      hint: data.showcaseFile || '*_Design_System.html'
    },
    {
      id: 'proto',
      label: data.prototypeExists
        ? `Prototipo (${(data.prototypeFiles && data.prototypeFiles.length) ? data.prototypeFiles.length + 'p' : '3p'})`
        : 'Prototipo (3p)',
      ready: !!data.prototypeExists,
      hint: 'prototype/*.html'
    }
  ];

  const readyCount = items.filter(i => i.ready).length;
  trackerCount.textContent = `${readyCount}/4`;

  if (data.stateExists || data.specExists || data.showcaseExists || data.prototypeExists) {
    trackerBar.style.display = 'flex';
  }

  trackerPills.innerHTML = items.map(item => {
    if (item.ready) {
      return `
        <span class="tracker-pill pill-ready" data-deliverable-id="${item.id}" title="${escapeHtml(item.hint)}: Creado en disco">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span>${escapeHtml(item.label)}</span>
        </span>
      `;
    } else {
      return `
        <span class="tracker-pill pill-pending" data-deliverable-id="${item.id}" title="${escapeHtml(item.hint)}: Pendiente de creación">
          <span class="tracker-pending-dot"></span>
          <span>${escapeHtml(item.label)}</span>
        </span>
      `;
    }
  }).join('');
}

function notifyTrackerBuilding(activityText) {
  const trackerBar = document.getElementById('deliverablesTrackerBar');
  if (!trackerBar) return;

  const lower = activityText.toLowerCase();
  let targetId = null;
  if (lower.includes('state.json') || lower.includes('token')) targetId = 'token';
  else if (lower.includes('_design_system.md') || lower.includes('espec')) targetId = 'spec';
  else if (lower.includes('_design_system.html') || lower.includes('showcase')) targetId = 'showcase';
  else if (lower.includes('prototype') || lower.includes('index.html') || lower.includes('prototipo')) targetId = 'proto';

  if (targetId) {
    trackerBar.style.display = 'flex';
    const pill = trackerBar.querySelector(`[data-deliverable-id="${targetId}"]`);
    if (pill && !pill.classList.contains('pill-ready')) {
      pill.className = 'tracker-pill pill-building';
      const labelText = pill.querySelector('span:last-child')?.textContent || targetId;
      pill.innerHTML = `
        <span class="tracker-building-dot"></span>
        <span>${escapeHtml(labelText)}</span>
      `;
      pill.title = `${labelText}: Generando en este momento...`;
    }
  }
}

function updatePhasePipeline(snapshot) {
  const state = snapshot?.state || {};
  let currentPhase = Number(state.current_phase || state.phase) || 1;
  const isFinalized = state.status === 'PROYECTO_FINALIZADO';

  for (let i = 1; i <= 5; i++) {
    const pill = document.getElementById(`phase-${i}`);
    if (!pill) continue;

    pill.classList.remove('active', 'completed');

    if (isFinalized) {
      pill.classList.add('completed');
    } else if (i < currentPhase) {
      pill.classList.add('completed');
    } else if (i === currentPhase) {
      pill.classList.add('active');
    }
  }
}

function applyDeliverableSnapshot(snapshot) {
  if (!snapshot || !snapshot.status) return;

  updateDeliverablesTracker(snapshot);
  updatePhasePipeline(snapshot);
  updateProjectDate(snapshot.state?.updated_at || snapshot.state?.timestamp || snapshot.timestamp);

  const data = snapshot.status;
  const badgeProto = document.getElementById('badgePrototype');
  const badgeShowcase = document.getElementById('badgeShowcase');
  const badgeState = document.getElementById('badgeState');

  // 1. Prototipo
  if (data.prototypeExists) {
    badgeProto.style.background = 'rgba(90, 234, 162, 0.15)';
    badgeProto.style.borderColor = 'rgba(90, 234, 162, 0.35)';
    badgeProto.style.color = 'var(--homium-green)';
    badgeProto.textContent = 'Listo';
    const protoVersion = data.prototypeVersion || '1';
    if (protoVersion !== prevPrototypeVersion) {
      prototypeFrame.src = '/preview/prototype/index.html?v=' + encodeURIComponent(protoVersion);
      if (prevPrototypeVersion !== null) appendLog('[En vivo] Prototipo actualizado en disco, recargando vista.');
      prevPrototypeVersion = protoVersion;
    }
  } else {
    badgeProto.style.background = 'rgba(255, 255, 255, 0.08)';
    badgeProto.style.borderColor = 'rgba(255, 255, 255, 0.15)';
    badgeProto.style.color = 'rgba(255, 255, 255, 0.7)';
    badgeProto.textContent = '3 Pantallas';
    prevPrototypeVersion = null;
  }

  // 2. Showcase
  if (data.showcaseExists) {
    badgeShowcase.style.background = 'rgba(90, 234, 162, 0.15)';
    badgeShowcase.style.borderColor = 'rgba(90, 234, 162, 0.35)';
    badgeShowcase.style.color = 'var(--homium-green)';
    badgeShowcase.textContent = 'Listo';
    const showcaseVersion = data.showcaseVersion || '1';
    if (showcaseVersion !== prevShowcaseVersion) {
      showcaseFrame.src = '/preview/showcase?v=' + encodeURIComponent(showcaseVersion);
      if (prevShowcaseVersion !== null) appendLog('[En vivo] Showcase actualizado en disco, recargando vista.');
      prevShowcaseVersion = showcaseVersion;
    }
  } else {
    badgeShowcase.style.background = 'rgba(255, 255, 255, 0.08)';
    badgeShowcase.style.borderColor = 'rgba(255, 255, 255, 0.15)';
    badgeShowcase.style.color = 'rgba(255, 255, 255, 0.7)';
    badgeShowcase.textContent = 'HTML';
    prevShowcaseVersion = null;
  }

  // 3. Blueprint State reactivo y unificado
  if (data.stateExists && snapshot.state) {
    dynamicBlueprintState = deepMergeState(dynamicBlueprintState, snapshot.state);
  }

  const hasBlueprintData = Boolean(
    dynamicBlueprintState && (
      dynamicBlueprintState.brand_name ||
      dynamicBlueprintState.brand ||
      dynamicBlueprintState.mission ||
      dynamicBlueprintState.purpose ||
      dynamicBlueprintState.business_model ||
      dynamicBlueprintState.palette ||
      dynamicBlueprintState.foundations
    )
  );

  if (hasBlueprintData) {
    badgeState.style.background = 'rgba(0, 255, 255, 0.15)';
    badgeState.style.borderColor = 'rgba(0, 255, 255, 0.35)';
    badgeState.style.color = 'var(--homium-cyan)';
    badgeState.textContent = 'Activo';
    renderBlueprint(dynamicBlueprintState);
  } else if (!data.stateExists) {
    badgeState.style.background = 'rgba(255, 255, 255, 0.08)';
    badgeState.style.borderColor = 'rgba(255, 255, 255, 0.15)';
    badgeState.style.color = 'rgba(255, 255, 255, 0.7)';
    badgeState.textContent = 'JSON';
  }

  // Seguir el avance del flujo (fase + entregables) salvo que el usuario lo haya pausado
  followLiveTab({
    phase: Number(snapshot.state?.current_phase || snapshot.state?.phase) || 1,
    showcaseExists: data.showcaseExists,
    prototypeExists: data.prototypeExists
  });
}

// Canal reactivo SSE para entrega instantánea de cambios en disco
function initDeliverablesStream() {
  try {
    const es = new EventSource('/api/deliverables/stream');

    es.addEventListener('snapshot', (e) => {
      try {
        const snapshot = JSON.parse(e.data);
        applyDeliverableSnapshot(snapshot);
      } catch (err) {}
    });

    es.addEventListener('update', (e) => {
      try {
        const snapshot = JSON.parse(e.data);
        applyDeliverableSnapshot(snapshot);
        appendLog('[Deliverables] Actualización reactiva detectada en disco.');
      } catch (err) {}
    });

    es.onopen = () => setConnectionStatus(true);

    es.onerror = () => {
      setConnectionStatus(false);
      // Ante un corte de red EventSource reconecta solo. Pero si el servidor responde con un error HTTP (sesión
      // vencida, reinicio con otro SESSION_SECRET, origen no permitido) la conexión queda CERRADA para siempre:
      // se comprueba la sesión y se vuelve a abrir el canal (o se va a /login si ya no hay sesión).
      if (es.readyState === 2) {
        es.close();
        fetch('/api/workspace')
          .then((res) => {
            if (res.status === 401) window.location.href = '/login';
            else setTimeout(initDeliverablesStream, 5000);
          })
          .catch(() => setTimeout(initDeliverablesStream, 5000));
      }
    };
  } catch (err) {
    console.warn('[DeliverableStore] Error al inicializar stream SSE:', err);
  }
}

// Indicador de conexión de la cabecera: refleja el estado real del canal de entregables
function setConnectionStatus(online) {
  const indicator = document.querySelector('.status-indicator');
  if (!indicator) return;
  const text = indicator.querySelector('.status-text');
  if (text) text.textContent = online ? 'Listo' : 'Reconectando…';
  indicator.title = online ? 'Conexión activa' : 'Sin conexión con el servidor';
  indicator.classList.toggle('is-offline', !online);
}

// Función fallback de consulta manual para soporte y tests
async function checkStatus() {
  try {
    const res = await fetch('/api/deliverables');
    const snapshot = await res.json();
    applyDeliverableSnapshot(snapshot);
  } catch (err) {
    console.error('Error al chequear entregables:', err);
  }
}

// Inicializar el canal reactivo SSE (cero latencia)
initDeliverablesStream();

// =============================================================
// 9. COMPUERTAS DE APROBACIÓN
// =============================================================

// Última compuerta pendiente de respuesta en el flujo
let lastPendingAction = null;

// serverAction: descriptor ya resuelto por el servidor (null = sin acción). Solo si no se conoce (undefined)
// se pide una evaluación del texto; repetirla tras un null reintroduciría los falsos positivos de los desvíos.
async function evaluateInteractiveActions(text, serverAction) {
  const approvalGateContainer = document.getElementById('approvalGateContainer');
  if (approvalGateContainer) {
    approvalGateContainer.style.display = 'none';
    approvalGateContainer.innerHTML = '';
  }

  let action = serverAction;
  if (!action && text && serverAction === undefined) {
    try {
      const res = await fetch('/api/pipeline/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      if (res.ok) {
        const data = await res.json();
        action = data.action;
      }
    } catch (e) {}
  }

  if (action && action.type === 'gate') {
    renderApprovalGate(action);
  }
}

// Iconos de los botones de la compuerta
function getIconSvg(iconName) {
  switch (iconName) {
    case 'check':
      return '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    case 'edit':
      return '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';
    default:
      return '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 14 14"></polyline></svg>';
  }
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderApprovalGate(gate) {
  const approvalGateContainer = document.getElementById('approvalGateContainer');
  if (!approvalGateContainer) return;

  approvalGateContainer.innerHTML = `
    <div class="approval-gate-banner">
      <div class="gate-header">
        <span class="gate-title">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
          ${escapeHtml(gate.title)}
        </span>
      </div>
      <p class="gate-description">${escapeHtml(gate.description)}</p>
      <div class="gate-actions">
        ${gate.options.map(opt => `
          <button type="button" class="${opt.variant === 'primary' ? 'btn-gate-approve' : 'btn-gate-adjust'}" data-val="${encodeURIComponent(opt.value)}">
            ${opt.icon ? getIconSvg(opt.icon) : (opt.variant === 'primary' ? getIconSvg('check') : getIconSvg('edit'))}
            <span>${escapeHtml(opt.label)}</span>
          </button>
        `).join('')}
      </div>
    </div>
  `;
  approvalGateContainer.style.display = 'block';

  approvalGateContainer.querySelectorAll('button[data-val]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (turnInFlight) return;
      const val = decodeURIComponent(btn.getAttribute('data-val'));
      const actionLabel = btn.querySelector('span')?.textContent || val;

      // Transicionar la compuerta a estado de progreso en lugar de desaparecer
      approvalGateContainer.innerHTML = `
        <div class="approval-gate-banner gate-in-progress">
          <div class="gate-header">
            <span class="gate-title">
              <span class="activity-pulse-dot"></span>
              <span>Ejecutando: ${escapeHtml(actionLabel)}</span>
            </span>
          </div>
          <p class="gate-description">Generando los entregables correspondientes. Por favor espera un momento...</p>
          <div class="gate-progress-detail">
            <span class="activity-pulse-dot" style="width:5px;height:5px;"></span>
            <span id="gateProgressActivity">Iniciando motor agéntico...</span>
          </div>
        </div>
      `;
      sendMessage(val);
    });
  });
}

// =============================================================
// 8. GESTIÓN DEL WORKSPACE UNIVERSAL Y TELEMETRÍA DE INFERENCIA
// =============================================================

async function loadWorkspaceInfo() {
  try {
    const res = await fetch('/api/workspace');
    if (res.ok) {
      const data = await res.json();
      if (data.workspaceDir) {
        activeWorkspaceDir = data.workspaceDir;
        const displayName = data.projectName
          ? `homium_projects/${data.projectName}`
          : 'homium_projects';
        if (workspacePathDisplay) workspacePathDisplay.textContent = displayName;
        if (workspaceChip) {
          workspaceChip.title = `Carpeta de trabajo: ${data.workspaceDir}\n(Clic para copiar ruta completa)`;
        }
      }
      const versionEl = document.getElementById('metaVersionValue');
      if (versionEl && data.version) versionEl.textContent = `v${data.version}`;
      if (btnAttach) {
        btnAttach.disabled = !data.hasProject;
        btnAttach.title = data.hasProject
          ? 'Adjuntar archivo'
          : 'Definí primero el nombre de tu marca o proyecto para poder adjuntar archivos';
      }
    }
  } catch (err) {}
}

if (workspaceChip) {
  workspaceChip.addEventListener('click', async (e) => {
    // Si el clic fue en el botón de descargar el proyecto, dejar que actúe su propio listener
    if (e.target.closest('#btnDownloadWorkspace')) return;

    if (activeWorkspaceDir) {
      try {
        await navigator.clipboard.writeText(activeWorkspaceDir);
        const prev = workspacePathDisplay.textContent;
        workspacePathDisplay.textContent = '¡Copiado!';
        setTimeout(() => {
          workspacePathDisplay.textContent = prev;
        }, 1800);
        appendLog(`[Workspace] Ruta copiada al portapapeles: ${activeWorkspaceDir}`);
      } catch (err) {
        appendLog(`[Workspace] Ruta activa: ${activeWorkspaceDir}`);
      }
    }
  });
}

const btnDownloadWorkspace = document.getElementById('btnDownloadWorkspace');
if (btnDownloadWorkspace) {
  btnDownloadWorkspace.addEventListener('click', (e) => {
    e.stopPropagation();
    window.location.href = '/api/workspace/download';
    appendLog(`[Workspace] Descargando proyecto: ${activeWorkspaceDir}`, 'info');
  });
}

// =============================================================
// 8b. ADJUNTOS DE REFERENCIA (fuentes, documentos, hojas de datos)
// =============================================================

function appendSystemEvent(text) {
  const div = document.createElement('div');
  div.className = 'message system-event';
  div.innerHTML = `<span>[ ${escapeHtml(text)} ]</span>`;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function renderAttachmentsTray() {
  if (!attachmentsTray) return;
  if (pendingAttachments.length === 0) {
    attachmentsTray.hidden = true;
    attachmentsTray.innerHTML = '';
    return;
  }
  attachmentsTray.hidden = false;
  attachmentsTray.innerHTML = pendingAttachments.map((file, index) => `
    <span class="attachment-chip">
      ${escapeHtml(file.name)}
      <button type="button" class="attachment-chip-remove" data-index="${index}" title="Quitar adjunto" aria-label="Quitar adjunto">&times;</button>
    </span>
  `).join('');
}

if (attachmentsTray) {
  attachmentsTray.addEventListener('click', (e) => {
    const btn = e.target.closest('.attachment-chip-remove');
    if (!btn) return;
    const index = Number(btn.getAttribute('data-index'));
    pendingAttachments.splice(index, 1);
    renderAttachmentsTray();
  });
}

if (btnAttach && fileAttachInput) {
  btnAttach.addEventListener('click', () => fileAttachInput.click());

  fileAttachInput.addEventListener('change', async () => {
    const selected = Array.from(fileAttachInput.files || []);
    fileAttachInput.value = '';
    if (selected.length === 0) return;

    const formData = new FormData();
    selected.forEach((file) => formData.append('files', file));

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) {
        appendSystemEvent(data.error || 'No se pudo adjuntar el archivo.');
        return;
      }
      pendingAttachments.push(...data.files);
      renderAttachmentsTray();
      appendLog(`[Adjuntos] ${data.files.map(f => f.name).join(', ')}`, 'info');
    } catch (err) {
      appendSystemEvent('No se pudo adjuntar el archivo. Verificá tu conexión.');
    }
  });
}

// Delegación de clics para chips de archivo generados en los mensajes
if (chatMessages) {
  chatMessages.addEventListener('click', async (e) => {
  const chip = e.target.closest('.inline-file-chip');
  if (chip) {
    const fileName = chip.getAttribute('data-file') || '';
    const fullPath = chip.getAttribute('data-path') || '';

    // Si es el archivo de estado, cambiar automáticamente a la pestaña Blueprint
    if (fileName.includes('design-system-state.json')) {
      const blueprintTab = document.querySelector('.tab-btn[data-tab="tab-blueprint"]');
      if (blueprintTab) {
        blueprintTab.click();
        appendLog(`[Navegación] Mostrando contenido de ${fileName} en la pestaña Blueprint`, 'info');
      }
    }

    if (fullPath) {
      try {
        await navigator.clipboard.writeText(fullPath);
        appendLog(`[Archivo] Ruta en disco copiada al portapapeles: ${fullPath}`, 'info');
      } catch (err) {
        appendLog(`[Archivo] Ruta en disco: ${fullPath}`, 'info');
      }
    }
  }
});
}

function updateTelemetry(metrics) {
  if (!metrics) return;

  if (telemetryEngineBadge && metrics.engine) {
    telemetryEngineBadge.textContent = `Motor: ${metrics.engine}`;
  }
  if (telemetryModelBadge && metrics.model) {
    telemetryModelBadge.textContent = `Modelo: ${metrics.model}`;
  }

  if (metrics.usage) {
    const u = metrics.usage;
    if (statInputTokens && u.input_tokens != null) {
      statInputTokens.textContent = Number(u.input_tokens).toLocaleString();
    }
    if (statOutputTokens && u.output_tokens != null) {
      statOutputTokens.textContent = Number(u.output_tokens).toLocaleString();
    }
    if (statThinkingTokens && u.thinking_tokens != null) {
      statThinkingTokens.textContent = Number(u.thinking_tokens).toLocaleString();
    }
    if (statCacheTokens && u.cache_read_tokens != null) {
      statCacheTokens.textContent = Number(u.cache_read_tokens).toLocaleString();
    }
  }

  if (statDuration && metrics.duration_seconds != null) {
    statDuration.textContent = Number(metrics.duration_seconds).toFixed(2);
  }

  // Resumen visual estructurado en la consola de logs
  if (metrics.usage) {
    const u = metrics.usage;
    const dur = metrics.duration_seconds ? ` (${Number(metrics.duration_seconds).toFixed(2)}s)` : '';
    appendLog(
      `[Telemetría ${metrics.engine || 'Inferencia'}] Tokens: In=${u.input_tokens ?? 0} | Out=${u.output_tokens ?? 0} | Thinking=${u.thinking_tokens ?? 0} | Cache=${u.cache_read_tokens ?? 0}${dur}`,
      'info'
    );
  }
}

const PREFERRED_ENGINE_KEY = 'homium_preferred_engine';
if (engineSelect) {
  // Restaurar el último motor seleccionado por el usuario
  const savedEngine = store.get(PREFERRED_ENGINE_KEY);
  if (savedEngine && engineSelect.querySelector(`option[value="${savedEngine}"]`)) {
    engineSelect.value = savedEngine;
    if (telemetryEngineBadge) {
      telemetryEngineBadge.textContent = `Motor: ${engineSelect.value}`;
    }
  }

  engineSelect.addEventListener('change', () => {
    store.set(PREFERRED_ENGINE_KEY, engineSelect.value);
    if (telemetryEngineBadge) {
      telemetryEngineBadge.textContent = `Motor: ${engineSelect.value}`;
    }
    appendLog(`[Motor] Cambiado y guardado como predeterminado: ${engineSelect.options[engineSelect.selectedIndex]?.text || engineSelect.value}`);
  });
}

// =============================================================
// 10. REANUDACIÓN DE PROYECTO Y PERSISTENCIA DE ESTADO (F5 / RELOAD)
// =============================================================

let lastRenderedResumeHash = '';

function renderResumedChatState(data, fromCache = false) {
  if (!data || !data.hasProject) return;

  const messages = Array.isArray(data.messages) ? data.messages : [];
  const hash = `${data.projectName}_${data.currentPhase}_${data.currentStage}_${messages.length}_${Boolean(data.pendingAction)}`;
  if (fromCache) {
    lastRenderedResumeHash = hash;
  } else if (lastRenderedResumeHash === hash && document.querySelector('.resume-banner')) {
    return;
  }
  lastRenderedResumeHash = hash;

  // 1. Identificar mensajes anteriores y mensaje del asistente activo
  let priorMessages = [];
  let activeAssistantMessage = typeof data.lastAssistantMessage === 'string'
    ? data.lastAssistantMessage
    : (data.lastAssistantMessage?.content || data.lastAssistantMessage?.text || '');

  if (messages.length > 0) {
    let lastAsstIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') {
        lastAsstIdx = i;
        break;
      }
    }

    if (lastAsstIdx !== -1) {
      priorMessages = messages.slice(0, lastAsstIdx);
      if (!activeAssistantMessage) {
        activeAssistantMessage = messages[lastAsstIdx].content || messages[lastAsstIdx].text || '';
      }
    } else {
      priorMessages = messages.slice(0, -1);
      if (!activeAssistantMessage) {
        activeAssistantMessage = messages[messages.length - 1].content || messages[messages.length - 1].text || '';
      }
    }
  }

  const brandDisplay = data.brandName || data.projectName || 'Proyecto Activo';
  if (!activeAssistantMessage) {
    activeAssistantMessage = `He reanudado el proyecto **${brandDisplay}** desde el almacenamiento local persistido.`;
  }

  // Las opciones numeradas solo se pueden pulsar si el último mensaje del historial es del asistente y no hay un turno en curso
  const lastMessage = messages[messages.length - 1];
  const canAnswerOptions = !data.busy && (!lastMessage || lastMessage.role === 'assistant');
  // Mensajes del usuario enviados después de la última respuesta (un turno que sigue en ejecución)
  let lastAssistantIndex = -1;
  messages.forEach((m, i) => { if (m.role === 'assistant') lastAssistantIndex = i; });
  const trailingUserMessages = data.busy ? messages.slice(lastAssistantIndex + 1).filter(m => m.role === 'user') : [];

  // 2. Construir HTML con el banner de reanudación y mensaje activo
  let chatHtml = '';

  chatHtml += `
    <div class="resume-banner">
      <div class="resume-banner-header">
        <div class="resume-banner-title">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
          <span>Proyecto Activo: <strong>${escapeHtml(brandDisplay)}</strong></span>
        </div>
        <span class="card-opt-badge badge-recommended">Fase ${data.currentPhase || 1} / 5</span>
      </div>
      <p class="resume-banner-meta">Sesión restaurada desde disco. Tu progreso y entregables están sincronizados.</p>
    </div>
  `;

  // Historial colapsable de turnos previos (si hay mensajes anteriores)
  if (priorMessages.length > 0) {
    chatHtml += `
      <button type="button" class="btn-toggle-history" id="btnToggleHistory" aria-expanded="false">
        <svg class="chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>
        <span id="btnToggleHistoryLabel">Ver historial anterior (${priorMessages.length} mensaje${priorMessages.length > 1 ? 's' : ''})</span>
      </button>
      <div class="collapsible-history" id="collapsibleHistory" style="display: none;">
    `;

    priorMessages.forEach(msg => {
      const isUser = msg.role === 'user';
      const senderName = isUser ? 'Tú' : 'Lead Engineer';
      const msgText = msg.content || msg.text || '';
      const timeStr = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
      chatHtml += `
        <div class="message ${isUser ? 'user-message' : 'agent-message'}">
          <div class="message-meta">
            ${isUser ? '' : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>`}
            <span class="sender-name">${senderName}</span>
            ${timeStr ? `<span class="message-time">${timeStr}</span>` : ''}
          </div>
          <div class="message-body">${formatText(msgText)}</div>
        </div>
      `;
    });

    chatHtml += `</div>`;
  }

  // Mensaje activo del asistente
  chatHtml += `
    <div class="message agent-message">
      <div class="message-meta">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <circle cx="12" cy="12" r="10"></circle>
          <path d="M12 16v-4"></path>
          <path d="M12 8h.01"></path>
        </svg>
        <span class="sender-name">Lead Engineer</span>
        <span class="message-time">Estado restaurado</span>
      </div>
      <div class="message-body">
        ${renderAgentMessage(activeAssistantMessage, { interactive: canAnswerOptions, gateActive: data.pendingAction?.type === 'gate' })}
      </div>
    </div>
  `;

  chatMessages.innerHTML = chatHtml;
  chatMessages.scrollTop = chatMessages.scrollHeight;

  // Manejar despliegue de historial colapsable
  const btnToggle = document.getElementById('btnToggleHistory');
  const collHistory = document.getElementById('collapsibleHistory');
  const btnLabel = document.getElementById('btnToggleHistoryLabel');
  if (btnToggle && collHistory) {
    btnToggle.addEventListener('click', () => {
      const isHidden = collHistory.style.display === 'none';
      collHistory.style.display = isHidden ? 'flex' : 'none';
      btnToggle.classList.toggle('is-open', isHidden);
      btnToggle.setAttribute('aria-expanded', String(isHidden));
      if (btnLabel) {
        btnLabel.textContent = isHidden
          ? 'Ocultar historial anterior'
          : `Ver historial anterior (${priorMessages.length} mensaje${priorMessages.length > 1 ? 's' : ''})`;
      }
    });
  }

  // 3. Renderizar compuerta de aprobación pendiente
  if (data.pendingAction) {
    lastPendingAction = data.pendingAction;
    evaluateInteractiveActions('', data.pendingAction);
  }

  // Un turno de esta sesión sigue en ejecución (se recargó la página o se cortó la conexión): se espera su final
  if (data.busy && !turnInFlight) {
    resumeRunningTurn(trailingUserMessages);
  }

  // 4. Sincronizar metadatos de cabecera
  const metaBrand = document.getElementById('metaBrandValue');
  if (metaBrand && brandDisplay) {
    metaBrand.textContent = brandDisplay;
  }

  // 5. Conmutar a la pestaña visual relevante
  followLiveTab({
    phase: Number(data.currentPhase) || 1,
    showcaseExists: data.deliverables?.showcaseExists,
    prototypeExists: data.deliverables?.prototypeExists
  });
}

// Historial del servidor para esta sesión (incluye si su turno sigue en ejecución)
function fetchChatHistory() {
  return fetch(`/api/chat/history?sessionId=${encodeURIComponent(sessionId)}`);
}

// La caché guarda solo lo necesario para repintar: el historial completo puede pesar mucho y superar la cuota
const RESUME_CACHE_MAX_MESSAGES = 60;

function saveResumeCache(data) {
  const slim = { ...data, messages: (data.messages || []).slice(-RESUME_CACHE_MAX_MESSAGES) };
  store.set(RESUME_CACHE_KEY, JSON.stringify(slim));
}

async function syncSessionCache() {
  try {
    const res = await fetchChatHistory();
    if (res.ok) {
      const data = await res.json();
      if (data.ok && data.hasProject) saveResumeCache(data);
    }
  } catch (e) {}
}

// Un turno de esta sesión sigue en ejecución en el servidor: se muestra como en curso, con Detener, y al
// terminar se vuelve a pintar el estado completo desde el historial.
function resumeRunningTurn(trailingUserMessages) {
  trailingUserMessages.forEach(msg => {
    const userDiv = document.createElement('div');
    userDiv.className = 'message user-message';
    userDiv.innerHTML = `
      <div class="message-meta"><span class="message-time">Enviado</span><span class="sender-name">Tú</span></div>
      <div class="message-body">${formatText(msg.content || msg.text || '')}</div>
    `;
    chatMessages.appendChild(userDiv);
  });

  const agentDiv = document.createElement('div');
  agentDiv.className = 'message agent-message';
  agentDiv.innerHTML = `
    <div class="message-meta"><span class="sender-name">Lead Engineer</span><span class="message-time">Generando…</span></div>
    <div class="message-body"><p class="turn-recovering">El agente sigue trabajando en tu mensaje anterior. Cuando termine verás aquí su respuesta.</p></div>
  `;
  chatMessages.appendChild(agentDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  const turn = { controller: new AbortController(), sessionId, cancelled: false, silent: false };
  currentTurn = turn;
  setTurnUi(true);

  (async () => {
    const deadline = Date.now() + 15 * 60 * 1000;
    while (Date.now() < deadline && !turn.cancelled) {
      await sleep(2000);
      try {
        const res = await fetchChatHistory();
        if (res.status === 401) { window.location.href = '/login'; return; }
        if (!res.ok) continue;
        const data = await res.json();
        if (data.busy) continue;
        break;
      } catch (e) {}
    }
    if (currentTurn === turn) currentTurn = null;
    setTurnUi(false);
    lastRenderedResumeHash = '';
    restoreSessionState();
  })();
}

async function restoreSessionState() {
  let renderedFromCache = false;
  try {
    const cached = store.get(RESUME_CACHE_KEY);
    if (cached) {
      try {
        const cachedData = JSON.parse(cached);
        if (cachedData && cachedData.hasProject) {
          // Un turno en curso de la copia guardada ya no lo está: solo el servidor sabe si sigue vigente
          renderResumedChatState({ ...cachedData, busy: false }, true);
          renderedFromCache = true;
        }
      } catch (e) {}
    }

    const res = await fetchChatHistory();
    if (res.status === 401) {
      window.location.href = '/login';
      return;
    }
    if (!res.ok) return;
    const data = await res.json();
    if (data.ok && data.hasProject) {
      saveResumeCache(data);
      renderResumedChatState(data, false);
    } else {
      store.remove(RESUME_CACHE_KEY);
      // La copia guardada mostraba un proyecto que el servidor ya no tiene (reinicio desde otro equipo o pestaña)
      if (renderedFromCache) resetClientView('La sesión anterior ya no existe en el servidor');
    }
  } catch (err) {
    console.warn('[Session] Error restaurando sesión:', err);
    if (renderedFromCache) {
      appendSystemEvent('No se pudo contactar al servidor: se muestra la última copia guardada de la conversación.');
    }
  }
}

loadWorkspaceInfo();
restoreSessionState();

