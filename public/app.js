// =============================================================
// HOMIUM SITE BUILDER — CLIENT LOGIC
// =============================================================

let sessionId = localStorage.getItem('homium_site_builder_session_id') || crypto.randomUUID();
localStorage.setItem('homium_site_builder_session_id', sessionId);

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

// 1. Auto-resize textarea
userInput.addEventListener('input', () => {
  userInput.style.height = 'auto';
  userInput.style.height = Math.min(userInput.scrollHeight, 140) + 'px';
});

// Enviar con Enter (sin Shift)
userInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    chatForm.dispatchEvent(new Event('submit'));
  }
});

// 2. Tab switching
let userExplicitTab = false;
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    if (e && e.isTrusted) {
      userExplicitTab = true;
    }
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

    btn.classList.add('active');
    const tabId = btn.getAttribute('data-tab');
    const targetPane = document.getElementById(tabId);
    if (targetPane) targetPane.classList.add('active');

    // Actualizar link de previsualización externa
    if (tabId === 'tab-prototype') {
      btnExternalPreview.href = '/preview/prototype/index.html';
      document.getElementById('viewportControls').style.display = 'flex';
    } else if (tabId === 'tab-showcase') {
      btnExternalPreview.href = '/preview/showcase';
      document.getElementById('viewportControls').style.display = 'none';
    } else {
      document.getElementById('viewportControls').style.display = 'none';
    }
  });
});

// 3. Viewport controls (Desktop, Tablet, Mobile)
document.querySelectorAll('.vp-btn[data-vp]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.vp-btn[data-vp]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const width = btn.getAttribute('data-vp');
    prototypeFrame.style.maxWidth = width;
    if (width === '100%') {
      prototypeFrame.style.boxShadow = 'none';
      prototypeFrame.style.borderRadius = '0';
    } else {
      prototypeFrame.style.boxShadow = '0 0 40px rgba(0, 255, 255, 0.2)';
      prototypeFrame.style.borderRadius = '24px';
    }
  });
});

btnRefreshPreview.addEventListener('click', () => {
  prototypeFrame.src = prototypeFrame.src;
  showcaseFrame.src = showcaseFrame.src;
  appendLog('[System] Previsualizadores refrescados manualmente.');
});

// 4. Quick prompts (Delegación de eventos para sugerencias contextuales)
document.addEventListener('click', (e) => {
  const chip = e.target.closest('.quick-chip');
  if (chip && userInput) {
    userInput.value = chip.getAttribute('data-prompt') || '';
    userInput.focus();
  }
});

// 5. Botón Reset con Modal Homium
const resetModal = document.getElementById('resetModal');
const btnCancelReset = document.getElementById('btnCancelReset');
const btnConfirmReset = document.getElementById('btnConfirmReset');

btnReset.addEventListener('click', (e) => {
  e.preventDefault();
  resetModal.style.display = 'flex';
});

btnCancelReset.addEventListener('click', () => {
  resetModal.style.display = 'none';
});

// Cerrar modal al hacer clic en el backdrop
resetModal.addEventListener('click', (e) => {
  if (e.target === resetModal) {
    resetModal.style.display = 'none';
  }
});

btnConfirmReset.addEventListener('click', async () => {
  resetModal.style.display = 'none';
  btnReset.disabled = true;

  try {
    const res = await fetch('/api/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId })
    });
    const data = await res.json();
    sessionId = crypto.randomUUID();
    localStorage.setItem('homium_site_builder_session_id', sessionId);

    chatMessages.innerHTML = `
      <div class="message system-event">
        <span>[ Nueva sesión iniciada. Estado limpio ]</span>
      </div>
      <div class="message agent-message">
        <div class="message-meta"><span class="sender-name">Lead Engineer</span></div>
        <div class="message-body">
          <p>Hola, soy tu <strong>Lead Design Systems Engineer</strong>. Vamos a construir tu sistema de diseño paso a paso.</p>
          <p>Para comenzar: <em>¿cuál es el nombre de tu marca o empresa, o tienes una URL de referencia para extraer su DNA visual forense?</em></p>
        </div>
      </div>
    `;

    // Limpiar iframes y vista de blueprint
    prototypeFrame.src = '/preview/prototype/index.html';
    showcaseFrame.src = '/preview/showcase';
    blueprintView.innerHTML = `
      <div class="blueprint-empty">
        <span class="bracket-tag">[ ESTADO EN DISCO ]</span>
        <h4>Esperando datos de la Fase 1</h4>
        <p>Cuando el agente ejecute el análisis o avance de fase, aquí se visualizará en tiempo real la paleta <code>allowed_hexes</code>, la tipografía y el <code>structural_blueprint</code>.</p>
      </div>
    `;

    // Resetear pills del pipeline de fases
    document.querySelectorAll('.phase-pill').forEach(p => p.classList.remove('completed', 'active'));
    document.getElementById('phase-1').classList.add('active');

    // Ocultar compuertas y bandejas de acción
    const actionTray = document.getElementById('dynamicActionTray');
    if (actionTray) { actionTray.style.display = 'none'; actionTray.innerHTML = ''; }
    const gateContainer = document.getElementById('approvalGateContainer');
    if (gateContainer) { gateContainer.style.display = 'none'; gateContainer.innerHTML = ''; }

    const metaBrand = document.getElementById('metaBrandValue');
    if (metaBrand) metaBrand.textContent = 'Sin iniciar';

    checkStatus();
    loadWorkspaceInfo();
    appendLog('[System] Sesión reseteada exitosamente. Estado listo para nueva marca.');
  } catch (err) {
    appendLog('[Error] Error al resetear: ' + err.message, 'error');
  } finally {
    btnReset.disabled = false;
  }
});

btnClearChat.addEventListener('click', () => {
  chatMessages.innerHTML = `
    <div class="message agent-message">
      <div class="message-meta">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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
});

// 6. Formateo limpio de Markdown / Texto (Sin Corchetes)
function formatText(text) {
  let safe = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Swatches visuales automáticos para códigos HEX (#RRGGBB o #RGB)
  safe = safe.replace(/`?#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b`?/g, (match, hex) => {
    const fullHex = '#' + hex;
    return `<span class="hex-swatch-pill"><span class="hex-dot" style="background-color:${fullHex};"></span>${fullHex}</span>`;
  });

  // 1. Enlaces a archivos en disco [text](file:///...) -> chips interactivos con icono
  safe = safe.replace(/\[(.*?)\]\(file:\/\/\/(.*?)\)/g, (match, label, filePath) => {
    const cleanPath = decodeURIComponent(filePath);
    const fileName = cleanPath.split('/').pop();
    const cleanLabel = label.replace(/[\[\]]/g, '').trim();
    return `<button type="button" class="inline-file-chip" data-file="${fileName}" data-path="/${cleanPath}" title="Archivo persistido en disco: /${cleanPath}\n(Clic para ver en Blueprint o copiar ruta)">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:2px;" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
      <span>${cleanLabel}</span>
    </button>`;
  });

  // 2. Enlaces web normales [text](http...) -> links limpios
  safe = safe.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color:var(--homium-cyan);text-decoration:none;border-bottom:1px dotted var(--homium-cyan);font-weight:500;">$1</a>');

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

// 7. Manejo del Chat y Streaming SSE
chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const message = userInput.value.trim();
  if (!message) return;

  userInput.value = '';
  userInput.style.height = 'auto';
  btnSend.disabled = true;

  // Ocultar bandeja y compuerta al enviar respuesta
  const dynamicActionTray = document.getElementById('dynamicActionTray');
  if (dynamicActionTray) dynamicActionTray.style.display = 'none';
  const approvalGateContainer = document.getElementById('approvalGateContainer');
  if (approvalGateContainer) approvalGateContainer.style.display = 'none';

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
    <div class="message-body"><span class="typing-cursor"></span></div>
  `;
  chatMessages.appendChild(agentDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  const agentBody = agentDiv.querySelector('.message-body');
  let fullResponse = '';

  appendLog(`[Chat] Enviando mensaje con motor: ${engineSelect.value}`);

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        sessionId,
        engine: engineSelect.value
      })
    });

    if (!res.ok) throw new Error('Error en la respuesta del servidor');

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop(); // guardar fragmento incompleto

      for (const line of lines) {
        if (line.startsWith('event: chunk')) {
          const match = line.match(/data: (.*)/);
          if (match) {
            try {
              const payload = JSON.parse(match[1]);

              if (payload.type === 'text_delta') {
                fullResponse += payload.text;
                agentBody.innerHTML = formatText(fullResponse);
                chatMessages.scrollTop = chatMessages.scrollHeight;
              } else if (payload.text && payload.text.trim()) {
                // Enviar a consola de logs la actividad de herramientas, scripts o stderr
                appendLog(payload.text.trim(), payload.type === 'log' ? 'warn' : 'info');
              }
            } catch (err) {}
          }
        } else if (line.startsWith('event: metrics')) {
          const match = line.match(/data: (.*)/);
          if (match) {
            try {
              const metricsPayload = JSON.parse(match[1]);
              updateTelemetry(metricsPayload);
            } catch (err) {}
          }
        } else if (line.startsWith('event: done')) {
          const match = line.match(/data: (.*)/);
          let doneData = {};
          if (match) {
            try { doneData = JSON.parse(match[1]); } catch (e) {}
          }
          appendLog(`[AgentBridge] Turno completado (código: ${doneData.code ?? 0}).`);
          if (!fullResponse.trim()) {
            const engineLabel = engineSelect.options[engineSelect.selectedIndex]?.text || engineSelect.value;
            if (doneData.code && doneData.code !== 0) {
              agentBody.innerHTML = `<p style="color:#ffb86c;display:flex;align-items:center;gap:6px;"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg><span>El motor <strong>${engineLabel}</strong> finalizó con código de error ${doneData.code} sin emitir texto. Revisa la pestaña Consola para verificar el registro técnico o cambia de motor en el menú superior.</span></p>`;
            } else {
              agentBody.innerHTML = formatText('Respuesta completada.');
            }
          }
          const timeSpan = agentDiv.querySelector('.message-time');
          if (timeSpan) timeSpan.textContent = 'Ahora';
          evaluateInteractiveActions(fullResponse, doneData.action);
          loadWorkspaceInfo();
        } else if (line.startsWith('event: error')) {
          const match = line.match(/data: (.*)/);
          if (match) {
            const payload = JSON.parse(match[1]);
            appendLog('[Error] ' + payload.error, 'error');
            const engineLabel = engineSelect.options[engineSelect.selectedIndex]?.text || engineSelect.value;
            agentBody.innerHTML = `<p style="color:#ff5555;display:flex;align-items:center;gap:6px;"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg><span>Error en ${engineLabel}: ${payload.error}. Verifica que el servicio esté disponible o selecciona otro motor.</span></p>`;
          }
        }
      }
    }
  } catch (err) {
    agentBody.innerHTML = `<p style="color:#ff5555;">Error de conexión: ${err.message}</p>`;
    appendLog('[Error] ' + err.message, 'error');
  } finally {
    btnSend.disabled = false;
    userInput.focus();
    checkStatus();
  }
});

// 7b. Mobile Toggle (Chat <-> Preview)
const btnMobileToggle = document.getElementById('btnMobileToggle');
const mobileToggleText = document.getElementById('mobileToggleText');
const panelChat = document.getElementById('panelChat');
const panelPreview = document.getElementById('panelPreview');

if (btnMobileToggle) {
  btnMobileToggle.addEventListener('click', () => {
    const isShowingChat = panelChat.classList.contains('active-panel');
    if (isShowingChat) {
      panelChat.classList.remove('active-panel');
      panelPreview.classList.add('active-panel');
      mobileToggleText.textContent = 'Ver Chat';
    } else {
      panelPreview.classList.remove('active-panel');
      panelChat.classList.add('active-panel');
      mobileToggleText.textContent = 'Ver Preview';
    }
  });
}

// 8. Chequeo y actualización de Entregables
// 8. Gestión Reactiva de Entregables vía DeliverableStore (SSE)
let prevPrototypeExists = false;
let prevShowcaseExists = false;

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

function renderBlueprint(s) {
  if (!s) return;
  const brandName = typeof s.brand === 'string' ? s.brand : (s.brand?.name || s.brand_name || s.completed_steps?.['1.1']?.name || '');
  const brandPurpose = s.mission || s.purpose || s.completed_steps?.['1.2']?.mission || s.completed_steps?.['1.2']?.purpose || (typeof s.brand === 'object' ? s.brand?.purpose : '') || '';
  const brand = { name: brandName, purpose: brandPurpose };
  const f = s.foundations || {};
  const palette = s.palette || f.palette || {};
  const step21 = s.completed_steps?.['2.1'] || {};
  const step22 = s.completed_steps?.['2.2'] || {};
  const typoRaw = s.typography || f.typography || {};
  const typo = {
    font_display: typoRaw.font_display || typoRaw.display || step22.typography_display || step22.display || '',
    font_ui: typoRaw.font_ui || typoRaw.body || typoRaw.font_body || step22.typography_ui || step22.ui || step22.body || '',
    font_body: typoRaw.font_body || typoRaw.body || typoRaw.font_ui || step22.typography_ui || step22.body || '',
    h1_size_px: typoRaw.h1_size_px || 64
  };
  const sitemap = s.sitemap || {};
  const modularScale = s.modular_scale || {};
  const densityMode = s.density_mode || {};

  // Extraer allowedHexes (soporta array plano, rampas de objetos o completed_steps)
  let allowedHexes = palette.allowed_hexes || [];
  if (allowedHexes.length === 0) {
    const hexSet = new Set();
    Object.entries(palette).forEach(([k, val]) => {
      if (typeof val === 'object' && val !== null) {
        Object.values(val).forEach(h => {
          if (typeof h === 'string' && /^#[0-9a-fA-F]{3,6}$/.test(h)) hexSet.add(h);
        });
      } else if (typeof val === 'string' && /^#[0-9a-fA-F]{3,6}$/.test(val)) {
        hexSet.add(val);
      }
    });
    if (step21) {
      Object.values(step21).forEach(val => {
        if (typeof val === 'string' && /^#[0-9a-fA-F]{3,6}$/.test(val)) hexSet.add(val);
      });
    }
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
  let textPrimary = palette.text_primary || palette.text || step21.text || '';
  let textSecondary = palette.text_secondary || step21.text_secondary || '';

  if (!primaryHex && mapping.primary && palette[mapping.primary]) {
    primaryHex = palette[mapping.primary]['500'] || palette[mapping.primary]['600'] || '';
  }
  if (!accentHex && mapping.accent && palette[mapping.accent]) {
    accentHex = palette[mapping.accent]['500'] || palette[mapping.accent]['400'] || '';
  }
  if (!bgBase && mapping.neutral_surface && palette[mapping.neutral_surface]) {
    bgBase = palette[mapping.neutral_surface]['950'] || palette[mapping.neutral_surface]['900'] || '#101313';
    surfaceCard = palette[mapping.neutral_surface]['900'] || palette[mapping.neutral_surface]['800'] || '#171b1c';
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
  if (!bgBase) bgBase = '#101313';
  if (!surfaceCard) surfaceCard = '#171b1c';
  if (!textPrimary) textPrimary = '#f1f3f3';
  if (!textSecondary) textSecondary = '#acb7b9';

  const metaBrand = document.getElementById('metaBrandValue');
  if (metaBrand && brand.name) {
    metaBrand.textContent = brand.name;
  }

  // Cargar fuentes dinámicamente si están presentes
  if (typo.font_display) loadGoogleFont(typo.font_display);
  if (typo.font_ui) loadGoogleFont(typo.font_ui);
  if (typo.font_body) loadGoogleFont(typo.font_body);

  const displayFontFamily = typo.font_display ? `'${typo.font_display}', sans-serif` : 'inherit';
  const bodyFontFamily = (typo.font_ui || typo.font_body) ? `'${typo.font_ui || typo.font_body}', sans-serif` : 'inherit';

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
  const borderSubtle = palette.border_subtle || 'rgba(255, 255, 255, 0.12)';

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
                Tipografía de cuerpo calibrada para interfaces interactivas, menús de navegación, tarjetas y micro-copys de alta legibilidad en modo oscuro.
              </div>
              <div style="font-family: ${bodyFontFamily}; font-size: 11.5px; color: rgba(255,255,255,0.6); display: flex; gap: 1rem; flex-wrap: wrap; margin-top: 0.5rem;">
                <span>H1: 56px</span><span>H2: 28px</span><span>H3: 20px</span><span>Body: 15px</span><span>Caption: 12px</span>
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
          <span class="meta-value">${brand.purpose || 'No definido'}</span>
        </div>
        <div class="brand-meta-item">
          <span class="meta-label">Modelo de Negocio</span>
          <span class="meta-value">${brand.business_model || 'N/A'}</span>
        </div>
        <div class="brand-meta-item">
          <span class="meta-label">Disponibilidad de Logo</span>
          <span class="meta-value">${brand.logo_type || 'Generar Isotipo SVG'}</span>
        </div>
        <div class="brand-meta-item">
          <span class="meta-label">Ruta de Fidelidad</span>
          <span class="meta-value">${s.visual_dna?.fidelity_mode || 'INSPIRATION'}</span>
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

    <!-- 6. GEOMETRÍA Y ESCALA MODULAR -->
    ${modularScale.name ? `
      <div class="blueprint-card">
        <span class="category-eyebrow">Geometría & Escalas</span>
        <h4>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
          Escala Modular & Densidad de Espaciado
        </h4>
        <div class="brand-meta-grid">
          <div class="brand-meta-item">
            <span class="meta-label">Escala Modular</span>
            <span class="meta-value">${modularScale.name} (${modularScale.ratio || 1.618})</span>
          </div>
          <div class="brand-meta-item">
            <span class="meta-label">Modo de Densidad</span>
            <span class="meta-value">${densityMode.mode || 'Comfortable'} (${densityMode.base_px || 8}px Base)</span>
          </div>
        </div>
      </div>
    ` : ''}
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

  // Actualizar pipeline de fases según datos
  const badgeProto = document.getElementById('badgePrototype');
  const badgeShowcase = document.getElementById('badgeShowcase');
  if (s.visual_dna) document.getElementById('phase-1').classList.add('completed');
  if (s.palette && s.palette.allowed_hexes) document.getElementById('phase-2').classList.add('completed');
  if (s.components) document.getElementById('phase-3').classList.add('completed');
  if (badgeShowcase && badgeShowcase.textContent.includes('Listo')) document.getElementById('phase-4').classList.add('completed');
  if (badgeProto && badgeProto.textContent.includes('Listo')) document.getElementById('phase-5').classList.add('completed');

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
        <span class="tracker-pill pill-ready" title="${item.hint}: Creado en disco">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span>${item.label}</span>
        </span>
      `;
    } else {
      return `
        <span class="tracker-pill pill-pending" title="${item.hint}: Pendiente de creación">
          <span class="tracker-pending-dot"></span>
          <span>${item.label}</span>
        </span>
      `;
    }
  }).join('');
}

function updatePhasePipeline(snapshot) {
  const state = snapshot?.state || {};
  let currentPhase = Number(state.phase) || 1;
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
    if (!prevPrototypeExists) {
      prototypeFrame.src = '/preview/prototype/index.html';
      prevPrototypeExists = true;
    }
  } else {
    badgeProto.style.background = 'rgba(255, 255, 255, 0.08)';
    badgeProto.style.borderColor = 'rgba(255, 255, 255, 0.15)';
    badgeProto.style.color = 'rgba(255, 255, 255, 0.7)';
    badgeProto.textContent = '3 Pantallas';
    prevPrototypeExists = false;
  }

  // 2. Showcase
  if (data.showcaseExists) {
    badgeShowcase.style.background = 'rgba(90, 234, 162, 0.15)';
    badgeShowcase.style.borderColor = 'rgba(90, 234, 162, 0.35)';
    badgeShowcase.color = 'var(--homium-green)';
    badgeShowcase.textContent = 'Listo';
    if (!prevShowcaseExists) {
      showcaseFrame.src = '/preview/showcase';
      prevShowcaseExists = true;
    }
  } else {
    badgeShowcase.style.background = 'rgba(255, 255, 255, 0.08)';
    badgeShowcase.style.borderColor = 'rgba(255, 255, 255, 0.15)';
    badgeShowcase.style.color = 'rgba(255, 255, 255, 0.7)';
    badgeShowcase.textContent = 'HTML';
    prevShowcaseExists = false;
  }

  // 3. Blueprint State
  if (data.stateExists && snapshot.state) {
    badgeState.style.background = 'rgba(0, 255, 255, 0.15)';
    badgeState.style.borderColor = 'rgba(0, 255, 255, 0.35)';
    badgeState.style.color = 'var(--homium-cyan)';
    badgeState.textContent = 'Activo';
    renderBlueprint(snapshot.state);
  } else if (!data.stateExists) {
    badgeState.style.background = 'rgba(255, 255, 255, 0.08)';
    badgeState.style.borderColor = 'rgba(255, 255, 255, 0.15)';
    badgeState.style.color = 'rgba(255, 255, 255, 0.7)';
    badgeState.textContent = 'JSON';
  }

  // Mantener la pestaña Blueprint como la pantalla predeterminada activa mientras dura el flujo
  if (!data.prototypeExists && !userExplicitTab) {
    const blueprintBtn = document.querySelector('.tab-btn[data-tab="tab-blueprint"]');
    const blueprintPane = document.getElementById('tab-blueprint');
    if (blueprintBtn && !blueprintBtn.classList.contains('active')) {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      blueprintBtn.classList.add('active');
      if (blueprintPane) blueprintPane.classList.add('active');
      const vp = document.getElementById('viewportControls');
      if (vp) vp.style.display = 'none';
    }
  }
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

    es.onerror = () => {
      // EventSource reconecta automáticamente en navegadores
    };
  } catch (err) {
    console.warn('[DeliverableStore] Error al inicializar stream SSE:', err);
  }
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
// 9. BANDEJA DINÁMICA DE ACCIONES Y COMPUERTAS DE APROBACIÓN
// =============================================================
let registeredStepActions = [];

async function loadStepDescriptors() {
  try {
    const res = await fetch('/api/pipeline/descriptors');
    const data = await res.json();
    registeredStepActions = data.steps || [];
  } catch (e) {
    console.warn('[Pipeline] Error al cargar descriptores de pasos:', e);
  }
}

async function evaluateInteractiveActions(text, serverAction = null) {
  const dynamicActionTray = document.getElementById('dynamicActionTray');
  const approvalGateContainer = document.getElementById('approvalGateContainer');
  if (dynamicActionTray) {
    dynamicActionTray.style.display = 'none';
    dynamicActionTray.innerHTML = '';
  }
  if (approvalGateContainer) {
    approvalGateContainer.style.display = 'none';
    approvalGateContainer.innerHTML = '';
  }

  let action = serverAction;
  if (!action && text) {
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

  if (!action) return;

  if (action.type === 'gate') {
    renderApprovalGate(action);
  } else if (action.type === 'cards') {
    renderActionCards(action);
  } else if (action.type === 'chips') {
    renderActionChips(action);
  }
}

function getIconSvg(iconName) {
  switch (iconName) {
    case 'shopping-bag':
      return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>`;
    case 'briefcase':
      return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>`;
    case 'grid':
      return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>`;
    case 'zap':
      return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`;
    case 'award':
      return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="8" r="7"></circle><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"></polyline></svg>`;
    case 'image':
      return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`;
    case 'sparkles':
      return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3z"></path></svg>`;
    case 'link':
      return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`;
    case 'file-text':
      return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>`;
    case 'compass':
      return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon></svg>`;
    case 'palette':
      return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="13.5" cy="6.5" r=".5"></circle><circle cx="17.5" cy="10.5" r=".5"></circle><circle cx="8.5" cy="7.5" r=".5"></circle><circle cx="6.5" cy="12.5" r=".5"></circle><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"></path></svg>`;
    case 'tool':
      return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>`;
    case 'check':
      return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    case 'edit':
      return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;
    default:
      return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 14 14"></polyline></svg>`;
  }
}

function renderActionChips(step) {
  const dynamicActionTray = document.getElementById('dynamicActionTray');
  if (!dynamicActionTray) return;

  let chipsHtml = '';
  step.options.forEach((opt) => {
    const iconSvg = opt.icon ? getIconSvg(opt.icon) : getIconSvg('default');
    chipsHtml += `
      <button type="button" class="action-btn-chip" data-val="${encodeURIComponent(opt.value)}">
        ${iconSvg}
        <span>${opt.label}</span>
      </button>
    `;
  });

  dynamicActionTray.innerHTML = `
    <span class="action-tray-title">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path></svg>
      ${step.title}
    </span>
    <div class="action-chips-wrapper">${chipsHtml}</div>
  `;
  dynamicActionTray.style.display = 'flex';

  dynamicActionTray.querySelectorAll('.action-btn-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = decodeURIComponent(btn.getAttribute('data-val'));
      userInput.value = val;
      dynamicActionTray.style.display = 'none';
      chatForm.dispatchEvent(new Event('submit'));
    });
  });
}

function renderActionCards(step) {
  const dynamicActionTray = document.getElementById('dynamicActionTray');
  if (!dynamicActionTray) return;

  let cardsHtml = '';
  step.options.forEach((opt) => {
    const iconSvg = opt.icon ? getIconSvg(opt.icon) : getIconSvg('zap');
    const badgeClass = opt.badge === 'Recomendado'
      ? 'badge-recommended'
      : (opt.badge === 'Ruta B' ? 'badge-route' : 'badge-advanced');

    cardsHtml += `
      <button type="button" class="action-card-btn" data-val="${encodeURIComponent(opt.value)}">
        <div class="card-opt-icon" aria-hidden="true">${iconSvg}</div>
        <div class="card-opt-content">
          <div class="card-opt-header">
            <span class="card-opt-label">${opt.label}</span>
            ${opt.badge ? `<span class="card-opt-badge ${badgeClass}">${opt.badge}</span>` : ''}
          </div>
          ${opt.description ? `<div class="card-opt-desc">${opt.description}</div>` : ''}
        </div>
      </button>
    `;
  });

  dynamicActionTray.innerHTML = `
    <span class="action-tray-title">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
      ${step.title}
    </span>
    <div class="action-cards-grid">${cardsHtml}</div>
  `;
  dynamicActionTray.style.display = 'flex';

  dynamicActionTray.querySelectorAll('.action-card-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = decodeURIComponent(btn.getAttribute('data-val'));
      userInput.value = val;
      dynamicActionTray.style.display = 'none';
      chatForm.dispatchEvent(new Event('submit'));
    });
  });
}

function renderApprovalGate(gate) {
  const approvalGateContainer = document.getElementById('approvalGateContainer');
  if (!approvalGateContainer) return;

  approvalGateContainer.innerHTML = `
    <div class="approval-gate-banner">
      <div class="gate-header">
        <span class="gate-title">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
          ${gate.title}
        </span>
      </div>
      <p class="gate-description">${gate.description}</p>
      <div class="gate-actions">
        ${gate.options.map(opt => `
          <button type="button" class="${opt.variant === 'primary' ? 'btn-gate-approve' : 'btn-gate-adjust'}" data-val="${encodeURIComponent(opt.value)}">
            ${opt.icon ? getIconSvg(opt.icon) : (opt.variant === 'primary' ? getIconSvg('check') : getIconSvg('edit'))}
            <span>${opt.label}</span>
          </button>
        `).join('')}
      </div>
    </div>
  `;
  approvalGateContainer.style.display = 'block';

  approvalGateContainer.querySelectorAll('button[data-val]').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = decodeURIComponent(btn.getAttribute('data-val'));
      userInput.value = val;
      approvalGateContainer.style.display = 'none';
      chatForm.dispatchEvent(new Event('submit'));
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
    }
  } catch (err) {}
}

if (workspaceChip) {
  workspaceChip.addEventListener('click', async (e) => {
    // Si el clic fue en el botón de abrir carpeta, dejar que actúe su propio listener
    if (e.target.closest('#btnOpenWorkspace')) return;

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

const btnOpenWorkspace = document.getElementById('btnOpenWorkspace');
if (btnOpenWorkspace) {
  btnOpenWorkspace.addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      const res = await fetch('/api/workspace/open', { method: 'POST' });
      if (res.ok) {
        appendLog(`[Workspace] Carpeta abierta en tu explorador de archivos: ${activeWorkspaceDir}`, 'info');
      } else {
        appendLog(`[Workspace] Ruta en disco: ${activeWorkspaceDir}`, 'warn');
      }
    } catch (err) {
      appendLog(`[Workspace] Ruta: ${activeWorkspaceDir}`);
    }
  });
}

// Delegación de clics para chips de archivo generados en los mensajes
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
  const savedEngine = localStorage.getItem(PREFERRED_ENGINE_KEY);
  if (savedEngine && engineSelect.querySelector(`option[value="${savedEngine}"]`)) {
    engineSelect.value = savedEngine;
    if (telemetryEngineBadge) {
      telemetryEngineBadge.textContent = `Motor: ${engineSelect.value}`;
    }
  }

  engineSelect.addEventListener('change', () => {
    localStorage.setItem(PREFERRED_ENGINE_KEY, engineSelect.value);
    if (telemetryEngineBadge) {
      telemetryEngineBadge.textContent = `Motor: ${engineSelect.value}`;
    }
    appendLog(`[Motor] Cambiado y guardado como predeterminado: ${engineSelect.options[engineSelect.selectedIndex]?.text || engineSelect.value}`);
  });
}

loadStepDescriptors();
loadWorkspaceInfo();

