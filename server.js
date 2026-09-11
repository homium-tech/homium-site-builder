const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { AgentEngine } = require('./lib/agent-engine');
const DeliverableStore = require('./lib/deliverable-store');
const Workspace = require('./lib/workspace');

const app = express();
const PORT = process.env.PORT || 3000;

// Módulo profundo de gestión del espacio de trabajo físico (Workspace Sandbox)
const workspace = new Workspace();

const LOCAL_HOMIUM_DIR = path.join(__dirname, 'public', 'homium');
const EXTERNAL_HOMIUM_DIR = path.join(workspace.getBaseDir(), 'Homium Design System');
const HOMIUM_DIR = fs.existsSync(LOCAL_HOMIUM_DIR) ? LOCAL_HOMIUM_DIR : EXTERNAL_HOMIUM_DIR;

// Instancia central de AgentEngine para supervisar turnos y sesiones
const agentEngine = new AgentEngine({ cwd: workspace.getDir() });

// Instancia reactiva de DeliverableStore para supervisar entregables en disco
const deliverableStore = new DeliverableStore({
  rootDir: workspace.getDir(),
  prototypeDir: workspace.getPrototypeDir()
});

// Sincronización reactiva cuando se crea o conmuta el proyecto activo
workspace.on('projectChanged', ({ workspaceDir }) => {
  agentEngine.setCwd(workspaceDir);
  deliverableStore.setRootDir(workspaceDir, workspace.getPrototypeDir());
  console.log(`[Workspace] Proyecto activo cambiado a: ${workspaceDir}`);
});

// Pipeline modular unificado de fases (5 a 11) y detección de compuertas/acciones
const { Pipeline } = require('./core/pipeline');
const pipeline = new Pipeline();

app.use(cors());
app.use(express.json());

// 1. Archivos estáticos de la UI de Homium Site Builder
app.use(express.static(path.join(__dirname, 'public')));

// 2. Recursos de Homium Design System (fuentes, logos, tokens css)
app.use('/homium', express.static(HOMIUM_DIR));

// Función unificada para estandarizar las pantallas de espera con el diseño auténtico Homium
function renderWaitingPage({ phase, title, highlight, description, statusText }) {
  return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link rel="stylesheet" href="/homium/colors_and_type.css">
      <style>
        body {
          background: radial-gradient(circle at top right, rgba(0, 255, 255, 0.08), transparent 50%), var(--homium-purple, #290640);
          color: var(--fg, #ffffff);
          font-family: 'Rubik', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100vh;
          margin: 0;
          text-align: center;
          padding: 1.5rem;
          box-sizing: border-box;
          -webkit-font-smoothing: antialiased;
        }
        .card {
          background: rgba(56, 10, 85, 0.7);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 20px;
          padding: 2.5rem;
          max-width: 480px;
          width: 100%;
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .category-eyebrow {
          color: var(--homium-cyan, #00ffff);
          font-weight: 600;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          margin-bottom: 0.75rem;
          display: block;
        }
        h2 {
          margin: 0.5rem 0 1rem;
          font-size: 20px;
          font-weight: 600;
          color: #ffffff;
        }
        h2 em {
          font-style: italic;
          color: var(--homium-cyan, #00ffff);
          font-weight: 300;
        }
        p {
          color: rgba(255, 255, 255, 0.72);
          line-height: 1.625;
          font-size: 15px;
          margin-bottom: 1.2rem;
        }
        p strong {
          color: #ffffff;
          font-weight: 600;
        }
        .status-pill {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          background: rgba(0, 255, 255, 0.1);
          border: 1px solid rgba(0, 255, 255, 0.3);
          color: var(--homium-cyan, #00ffff);
          padding: 0.4rem 0.9rem;
          border-radius: 9999px;
          font-size: 12px;
          font-weight: 500;
        }
      </style>
    </head>
    <body>
      <div class="card">
        <span class="category-eyebrow">${phase}</span>
        <h2>${title} <em>${highlight}</em></h2>
        <p>${description}</p>
        <div class="status-pill">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          ${statusText}
        </div>
      </div>
    </body>
    </html>
  `;
}

// 3. Servir el Prototipo navegable (Fase 5) con fallback de espera
app.get(['/preview/prototype', '/preview/prototype/', '/preview/prototype/index.html'], (req, res) => {
  const indexPath = path.join(workspace.getPrototypeDir(), 'index.html');
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  res.send(renderWaitingPage({
    phase: 'Fase 5 Pendiente',
    title: 'Prototipo',
    highlight: 'en espera.',
    description: 'Las 3 pantallas interactivas en HTML/CSS/JS se compilarán en disco automáticamente al completar la <strong>Fase 5 (Prototipo Interactivo)</strong> en el chat.',
    statusText: 'Esperando confirmación en el chat…'
  }));
});
app.use('/preview/prototype', (req, res, next) => {
  express.static(workspace.getPrototypeDir())(req, res, next);
});

// 4. Servir el Showcase dinámico ([Brand]_Design_System.html)
app.get('/preview/showcase', (req, res) => {
  try {
    const currentDir = workspace.getDir();
    const files = fs.existsSync(currentDir) ? fs.readdirSync(currentDir) : [];
    const showcaseFile = files.find(f => f.endsWith('_Design_System.html'));

    if (showcaseFile) {
      return res.sendFile(path.join(currentDir, showcaseFile));
    }

    // Si aún no existe, mostramos la pantalla de espera estandarizada
    res.send(renderWaitingPage({
      phase: 'Fase 4 Pendiente',
      title: 'Showcase',
      highlight: 'en espera.',
      description: 'El Showcase interactivo del sistema de diseño se compilará en disco automáticamente al completar la <strong>Fase 4 (Validación Visual)</strong> en el chat.',
      statusText: 'Esperando confirmación en el chat…'
    }));
  } catch (err) {
    res.status(500).send('Error al buscar el showcase: ' + err.message);
  }
});

// 5. Snapshot unificado de entregables (status + state en O(1))
app.get('/api/deliverables', (req, res) => {
  res.json(deliverableStore.getSnapshot());
});

// 5b. Endpoints de compatibilidad histórica
app.get('/api/state', (req, res) => {
  res.json(deliverableStore.getState());
});

app.get('/api/status', (req, res) => {
  res.json(deliverableStore.getStatus());
});

// 6. Canal reactivo SSE de entregables encapsulado en DeliverableStore.pipeToSSE
app.get('/api/deliverables/stream', (req, res) => {
  deliverableStore.pipeToSSE(res);
});

// 6c. Catálogo del Pipeline de Fases y Descriptores Sanitizados
app.get('/api/pipeline', (req, res) => {
  res.json({
    phases: pipeline.getPhases(),
    isExpanded: pipeline.isExpanded
  });
});

app.post('/api/pipeline/expand', (req, res) => {
  const { enable } = req.body;
  const updated = pipeline.enableAdvancedPhases(enable !== false);
  res.json({ ok: true, phases: updated, isExpanded: pipeline.isExpanded });
});

app.get('/api/pipeline/descriptors', (req, res) => {
  res.json({ steps: pipeline.getAllSteps() });
});

app.post('/api/pipeline/evaluate', (req, res) => {
  const { text } = req.body;
  const action = pipeline.detectAction(text);
  res.json({ ok: true, action });
});

// 6d. Información y Operaciones del Espacio de Trabajo (Workspace) activo
app.get('/api/workspace', (req, res) => {
  res.json(workspace.getInfo());
});

app.get('/api/workspace/files', (req, res) => {
  res.json(workspace.listFiles());
});

app.post('/api/workspace/open', async (req, res) => {
  await workspace.openInOS();
  res.json({ ok: true, workspaceDir: workspace.getDir() });
});

// 7. Resetear sesión y pruebas
app.post('/api/reset', (req, res) => {
  const { sessionId } = req.body;
  if (sessionId) {
    agentEngine.resetSession(sessionId);
  }

  // Respaldo atómico de estado gestionado por el módulo Workspace
  workspace.backupState();

  // Resetear el proyecto activo para volver a la raíz base homium_projects
  workspace.resetProject();

  // Refrescar inmediatamente el store para notificar a los suscriptores SSE
  deliverableStore.refresh();

  res.json({ ok: true, message: 'Sesión, proyecto y estado reseteados' });
});

// 8. Streaming de chat mediante SSE (Server-Sent Events) delegando en TurnStream.pipeToSSE
app.post('/api/chat', (req, res) => {
  const { message, sessionId, engine: engineType } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Mensaje requerido' });
  }

  // Si aún no se ha establecido la subcarpeta de proyecto (primer turno):
  if (!workspace.hasProject()) {
    const detectedName = Workspace.extractProjectName(message);
    if (detectedName) {
      workspace.setProject(detectedName);
    }
  }

  try {
    const stream = agentEngine.executeTurn({
      sessionId,
      message,
      engine: engineType || 'claude'
    });

    stream.pipeToSSE(res, {
      transformDone: (doneData, fullText) => ({
        ...doneData,
        action: pipeline.detectAction(fullText)
      })
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n========================================================`);
  console.log(`🚀 HOMIUM SITE BUILDER activo en: http://localhost:${PORT}`);
  console.log(`Tokens Homium cargados desde: ${HOMIUM_DIR}`);
  console.log(`========================================================\n`);
});
