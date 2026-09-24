const express = require('express');
const cors = require('cors');
const session = require('express-session');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const archiver = require('archiver');
const { AgentEngine } = require('./lib/agent-engine');
const DeliverableStore = require('./lib/deliverable-store');
const Workspace = require('./lib/workspace');

// Load .env if present (no dotenv dependency needed)
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) return;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (key && !process.env[key]) process.env[key] = val;
  });
}

const app = express();
const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || '0.0.0.0';

const AUTH_USER = process.env.AUTH_USER || 'admin';
const AUTH_PASS = process.env.AUTH_PASS;
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

if (!AUTH_PASS) {
  console.warn('[Auth] ADVERTENCIA: AUTH_PASS no configurada. Define AUTH_PASS en .env para proteger el acceso.');
}
if (!process.env.SESSION_SECRET) {
  console.warn('[Auth] ADVERTENCIA: SESSION_SECRET no configurada. Las sesiones se invalidan al reiniciar. Define SESSION_SECRET en .env');
}
if (!process.env.AUTH_USER) {
  console.warn('[Auth] ADVERTENCIA: AUTH_USER usa el valor por defecto "admin". Define AUTH_USER en .env');
}

// Comparación en tiempo constante para evitar timing attacks
function safeCompare(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  const maxLen = Math.max(ba.length, bb.length, 1);
  const pa = Buffer.alloc(maxLen, 0);
  const pb = Buffer.alloc(maxLen, 0);
  ba.copy(pa);
  bb.copy(pb);
  return crypto.timingSafeEqual(pa, pb) && ba.length === bb.length;
}

// Rate limiting: máx 10 intentos por IP en ventana de 15 min
const loginAttempts = new Map();
const LOGIN_MAX = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

function checkRateLimit(ip) {
  const now = Date.now();
  const rec = loginAttempts.get(ip);
  if (rec && now < rec.resetAt && rec.count >= LOGIN_MAX) return false;
  if (rec && now >= rec.resetAt) loginAttempts.delete(ip);
  return true;
}

function recordFailedAttempt(ip) {
  const now = Date.now();
  const rec = loginAttempts.get(ip) || { count: 0, resetAt: now + LOGIN_WINDOW_MS };
  if (now >= rec.resetAt) { rec.count = 0; rec.resetAt = now + LOGIN_WINDOW_MS; }
  rec.count++;
  loginAttempts.set(ip, rec);
}

// Limpieza periódica del mapa de intentos para evitar memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [ip, rec] of loginAttempts) {
    if (now >= rec.resetAt) loginAttempts.delete(ip);
  }
}, LOGIN_WINDOW_MS);

// Enriquecer PATH en Windows con directorios locales estándar (ej. Antigravity CLI)
if (process.platform === 'win32') {
  const localAppData = process.env.LOCALAPPDATA || path.join(require('os').homedir(), 'AppData', 'Local');
  const agyBin = path.join(localAppData, 'agy', 'bin');
  if (fs.existsSync(agyBin) && !(process.env.PATH || '').includes(agyBin)) {
    process.env.PATH = `${agyBin};${process.env.PATH || ''}`;
  }
}

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

const allowedOrigins = new Set([
  `http://localhost:${PORT}`,
  `http://127.0.0.1:${PORT}`,
  `http://[::1]:${PORT}`
]);

// Orígenes públicos adicionales (ej. dominios/proxies detrás de los que se expone la app)
// ALLOWED_ORIGINS admite una lista separada por comas, ej: "http://apps.homium.tech:8080,https://apps.homium.tech"
if (process.env.ALLOWED_ORIGINS) {
  process.env.ALLOWED_ORIGINS.split(',')
    .map(o => o.trim())
    .filter(Boolean)
    .forEach(o => allowedOrigins.add(o));
}

// CORS restringido: únicamente permite localhost, 127.0.0.1 o peticiones same-origin (sin encabezado Origin)
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.has(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Acceso bloqueado por política de seguridad CORS'));
  },
  credentials: true
}));

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 8 * 60 * 60 * 1000 // 8 hours
  }
}));

app.use(express.json());

// Middleware de protección contra Cross-Origin Hijacking / CSRF en endpoints de API
function requireSameOrigin(req, res, next) {
  const origin = req.headers.origin;
  if (origin && !allowedOrigins.has(origin)) {
    return res.status(403).json({ error: 'Acceso no autorizado: origen no permitido' });
  }
  next();
}

// --- Rutas públicas (sin autenticación) ---

app.get('/login', (req, res) => {
  if (req.session && req.session.authenticated) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/api/auth/login', (req, res) => {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';

  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Demasiados intentos. Espera 15 minutos e inténtalo de nuevo.' });
  }

  const { email, password } = req.body || {};
  if (!AUTH_PASS) {
    return res.status(503).json({ error: 'Autenticación no configurada. Define AUTH_PASS en .env' });
  }

  if (safeCompare(email, AUTH_USER) && safeCompare(password, AUTH_PASS)) {
    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: 'Error interno de sesión' });
      req.session.authenticated = true;
      req.session.user = email;
      res.json({ ok: true });
    });
  } else {
    recordFailedAttempt(ip);
    res.status(401).json({ error: 'Credenciales incorrectas' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// Recursos del Design System accesibles públicamente (necesarios para la página de login)
app.use('/homium', express.static(HOMIUM_DIR));

// --- Middleware de autenticación — protege todo lo que sigue ---
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  res.redirect('/login');
}

app.use(requireAuth);

app.use('/api', requireSameOrigin);

// 1. Archivos estáticos de la UI de Homium Site Builder
app.use(express.static(path.join(__dirname, 'public')));

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

// Función para escapar caracteres especiales HTML
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Aislamiento CSP Sandbox para todas las vistas previas de entregables
// allow-scripts + allow-same-origin combinados permiten que el contenido sandboxeado
// se libere del sandbox (via window.frameElement, al ser mismo origen que el padre).
// Los prototipos/showcase generados son HTML/CSS/JS autocontenidos que no usan
// fetch/localStorage/cookies, así que se puede omitir allow-same-origin sin romperlos.
app.use('/preview', (req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self' 'unsafe-inline' data:; frame-ancestors 'self'; sandbox allow-scripts allow-forms;"
  );
  next();
});

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

// 4b. Servir el Blueprint dinámico standalone (/preview/blueprint)
app.get('/preview/blueprint', (req, res) => {
  try {
    const state = deliverableStore.getState() || {};
    const brandName = typeof state.brand === 'string' ? state.brand : (state.brand?.name || '');

    if (!brandName) {
      return res.send(renderWaitingPage({
        phase: 'Fase 1 Pendiente',
        title: 'Blueprint',
        highlight: 'en espera.',
        description: 'El Blueprint arquitectónico de la marca se compilará automáticamente en disco al avanzar en la <strong>Fase 1 (Discovery)</strong> en el chat.',
        statusText: 'Esperando confirmación en el chat…'
      }));
    }

    res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Blueprint · ${escapeHtml(brandName)} · Homium Site Builder</title>
  <link rel="stylesheet" href="/styles.css">
  <link rel="stylesheet" href="/homium/colors_and_type.css">
  <link href="https://fonts.googleapis.com/css2?family=Rubik:ital,wght@0,300..900;1,300..900&family=Fira+Code:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    body { background: #09010e; color: #fff; margin: 0; padding: 2rem 1.5rem; font-family: 'Rubik', sans-serif; min-height: 100vh; box-sizing: border-box; }
    .blueprint-standalone-wrapper { max-width: 1200px; margin: 0 auto; }
    .standalone-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 1rem; }
    .standalone-title { display: flex; align-items: center; gap: 0.6rem; font-size: 15px; font-weight: 600; color: var(--homium-cyan, #00ffff); }
  </style>
</head>
<body>
  <div class="blueprint-standalone-wrapper">
    <div class="standalone-header">
      <div class="standalone-title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
        <span>HOMIUM SITE BUILDER · BLUEPRINT ARCHITECTURAL SPEC</span>
      </div>
      <span style="font-family: 'Fira Code', monospace; font-size: 12px; color: rgba(255,255,255,0.6);">${brandName}</span>
    </div>
    <div class="blueprint-view" id="blueprintView"></div>
  </div>
  <script src="/app.js"></script>
</body>
</html>`);
  } catch (err) {
    res.status(500).send('Error al generar vista de Blueprint: ' + err.message);
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

function requireActiveProject(req, res, next) {
  if (!workspace.hasProject()) {
    return res.status(409).json({ error: 'Definí primero el nombre de tu marca o proyecto para poder continuar.' });
  }
  next();
}

// Descarga el proyecto activo completo como .zip — reemplaza el intento anterior de abrir
// el explorador de archivos nativo, que abría una ventana en el propio servidor y nunca
// era visible para quien accede a la app por túnel remoto.
app.get('/api/workspace/download', requireActiveProject, (req, res) => {
  const projectName = workspace.getProjectName();
  res.attachment(`${projectName}.zip`);

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', (err) => {
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.end();
    }
  });

  archive.pipe(res);
  archive.directory(workspace.getDir(), false);
  archive.finalize();
});

const ALLOWED_UPLOAD_EXTENSIONS = new Set([
  '.pdf', '.txt', '.md', '.docx',
  '.ttf', '.otf', '.woff', '.woff2',
  '.csv', '.json', '.xlsx'
]);

const uploadStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadsDir = path.join(workspace.getDir(), 'uploads');
    fs.mkdirSync(uploadsDir, { recursive: true });
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const base = path.basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .slice(0, 80) || 'archivo';
    const uniqueSuffix = crypto.randomBytes(3).toString('hex');
    cb(null, `${base}-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage: uploadStorage,
  limits: { fileSize: 15 * 1024 * 1024, files: 6 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_UPLOAD_EXTENSIONS.has(ext)) {
      return cb(new Error(`Tipo de archivo no permitido: ${ext || '(sin extensión)'}`));
    }
    cb(null, true);
  }
});

// Adjuntos de referencia (fuentes, documentos de marca, hojas de datos) para que el motor
// de IA los lea desde uploads/ dentro del workspace activo.
app.post('/api/upload', requireActiveProject, upload.array('files', 6), (req, res) => {
  const files = (req.files || []).map((f) => ({ name: f.filename, size: f.size }));
  res.json({ ok: true, files });
});

app.use('/api/upload', (err, req, res, next) => {
  if (err instanceof multer.MulterError || err) {
    return res.status(400).json({ error: err.message });
  }
  next();
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
    const statusCode = err.message && err.message.includes('en ejecución') ? 409 : 500;
    res.status(statusCode).json({ error: err.message });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`\n========================================================`);
  console.log(`🚀 HOMIUM SITE BUILDER activo en: http://localhost:${PORT}`);
  console.log(`Tokens Homium cargados desde: ${HOMIUM_DIR}`);
  console.log(`========================================================\n`);
});
