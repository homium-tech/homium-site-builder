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
const { runGateAudits } = require('./lib/audits');
const { appendTurnLog, readTurnLog } = require('./lib/turn-log');
const { summarizeTurns } = require('./lib/telemetry');
const { escapeHtml, renderBlueprintPage } = require('./lib/preview-pages');

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
const APP_VERSION = require('./package.json').version;

// Detrás de un túnel o proxy inverso (opt-in): permite que req.ip y la cookie `secure` usen X-Forwarded-*.
// Sin esto todos los usuarios remotos comparten la IP del túnel y el límite de intentos de login es global.
// TRUST_PROXY admite "true", un número de saltos (ej. 1) o una lista de IPs/subredes.
if (process.env.TRUST_PROXY) {
  const raw = process.env.TRUST_PROXY.trim();
  const value = raw === 'true' ? true : raw === 'false' ? false : (/^\d+$/.test(raw) ? parseInt(raw, 10) : raw);
  app.set('trust proxy', value);
}

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
// Valores de ejemplo de .env.example copiados tal cual: cualquiera que conozca el repositorio los conoce
const EXAMPLE_SECRET_PATTERNS = [/^tu_contraseña/i, /^cambia_esto/i];
if (AUTH_PASS && EXAMPLE_SECRET_PATTERNS.some(re => re.test(AUTH_PASS))) {
  console.warn('[Auth] ADVERTENCIA: AUTH_PASS sigue con el valor de ejemplo de .env.example. Cámbiala por una contraseña propia.');
}
if (process.env.SESSION_SECRET && EXAMPLE_SECRET_PATTERNS.some(re => re.test(process.env.SESSION_SECRET))) {
  console.warn('[Auth] ADVERTENCIA: SESSION_SECRET sigue con el valor de ejemplo de .env.example. Genera uno aleatorio.');
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

function clearFailedAttempts(ip) {
  loginAttempts.delete(ip);
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
const agentEngine = new AgentEngine({
  cwd: workspace.getDir(),
  turnLogger: (record, dir) => appendTurnLog(dir, record)
});

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

// CORS restringido: únicamente permite localhost, 127.0.0.1, ALLOWED_ORIGINS o peticiones same-origin (sin encabezado Origin).
// Un origen no listado simplemente no recibe cabeceras CORS (en vez de un 500 que además rompe los estáticos);
// las rutas /api/* lo rechazan con un 403 explícito en requireSameOrigin.
app.use(cors({
  origin: (origin, callback) => {
    callback(null, !origin || allowedOrigins.has(origin));
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

  // Las previews (/preview/*) muestran HTML generado por el agente en el mismo origen que la app.
  // Sus scripts no deben poder invocar la API con la sesión del usuario (p. ej. /api/chat o /api/reset).
  // /preview/blueprint es una página propia de la app y sí la usa.
  const referer = req.headers.referer;
  if (referer) {
    try {
      const refPath = new URL(referer).pathname;
      if (refPath.startsWith('/preview/') && refPath !== '/preview/blueprint') {
        return res.status(403).json({ error: 'Acceso no autorizado: las vistas previas no pueden invocar la API' });
      }
    } catch (e) {
      // Referer ilegible: se trata como ausente
    }
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
      clearFailedAttempts(ip);
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

// Heurística de mensajes compartida con el navegador (misma fuente que usa Workspace.extractProjectName)
app.get('/message-heuristics.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'core', 'text', 'message-heuristics.js'));
});

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

// Aislamiento CSP Sandbox para todas las vistas previas de entregables.
// Se mantiene allow-same-origin: la cookie de sesión es SameSite=Strict, y sin ese permiso el iframe tendría
// un origen opaco y sus subrecursos (CSS, JS, imágenes) llegarían sin cookie y serían rechazados por requireAuth.
// allow-modals: el botón "Descargar PDF" del Design System es window.print(); sin ese permiso Chromium lo ignora en silencio
// ("Ignored call to 'print()'. The document is sandboxed"). Solo habilita print/alert/confirm, no navegación ni popups.
// El riesgo de que el HTML generado invoque la API con la sesión se mitiga en requireSameOrigin (Referer /preview/*).
app.use('/preview', (req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self' 'unsafe-inline' data: https://fonts.googleapis.com https://fonts.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; frame-ancestors 'self'; sandbox allow-scripts allow-forms allow-same-origin allow-modals;"
  );
  next();
});

// 3. Servir el Prototipo navegable (Fase 5) con fallback de espera
app.get(['/preview/prototype', '/preview/prototype/', '/preview/prototype/index.html'], (req, res) => {
  const indexPath = path.join(workspace.getPrototypeDir(), 'index.html');
  if (fs.existsSync(indexPath)) {
    // Con `root`, una carpeta con punto en la ruta del workspace (ej. ~/.homium) no provoca un 404
    return res.sendFile('index.html', { root: workspace.getPrototypeDir() });
  }
  res.send(renderWaitingPage({
    phase: 'Fase 5 Pendiente',
    title: 'Prototipo',
    highlight: 'en espera.',
    description: 'Las 3 pantallas interactivas en HTML/CSS/JS se compilarán en disco automáticamente al completar la <strong>Fase 5 (Prototipo Interactivo)</strong> en el chat.',
    statusText: 'Esperando confirmación en el chat…'
  }));
});
// Los enlaces simbólicos creados dentro de prototype/ no pueden exponer archivos fuera de esa carpeta
function withinDir(rootDir, requestedPath) {
  try {
    const realRoot = fs.realpathSync(rootDir);
    const realTarget = fs.realpathSync(path.join(rootDir, requestedPath));
    return realTarget === realRoot || realTarget.startsWith(realRoot + path.sep);
  } catch (e) {
    return true; // no existe: que express.static responda 404
  }
}

app.use('/preview/prototype', (req, res, next) => {
  let requested;
  try {
    requested = decodeURIComponent(req.path);
  } catch (e) {
    return res.status(400).send('Ruta inválida');
  }
  if (!withinDir(workspace.getPrototypeDir(), requested)) {
    return res.status(403).send('Acceso denegado');
  }
  express.static(workspace.getPrototypeDir())(req, res, next);
});

// El Design System vive en la raíz del proyecto y referencia sus recursos con rutas relativas (assets/fonts/*.otf,
// assets/logo.svg): servido en /preview/design-system se resuelven a /preview/assets/..., así que se sirve esa carpeta.
app.use('/preview/assets', (req, res, next) => {
  const assetsDir = path.join(workspace.getDir(), 'assets');
  let requested;
  try {
    requested = decodeURIComponent(req.path);
  } catch (e) {
    return res.status(400).send('Ruta inválida');
  }
  if (!withinDir(assetsDir, requested)) {
    return res.status(403).send('Acceso denegado');
  }
  express.static(assetsDir)(req, res, next);
});

// Ruta anterior (se llamaba "showcase"): se conserva para enlaces guardados en chats ya escritos
app.get('/preview/showcase', (req, res) => {
  const query = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
  res.redirect(301, '/preview/design-system' + query);
});

// 4. Servir el Design System dinámico ([Brand]_Design_System.html)
app.get('/preview/design-system', (req, res) => {
  try {
    const currentDir = workspace.getDir();
    const files = fs.existsSync(currentDir) ? fs.readdirSync(currentDir) : [];
    const designSystemFile = files.find(f => f.endsWith('_Design_System.html'));

    if (designSystemFile) {
      return res.sendFile(designSystemFile, { root: currentDir });
    }

    // Si aún no existe, mostramos la pantalla de espera estandarizada
    res.send(renderWaitingPage({
      phase: 'Fase 4 Pendiente',
      title: 'Design System',
      highlight: 'en espera.',
      description: 'El Design System interactivo se compilará en disco automáticamente al completar la <strong>Fase 4 (Validación Visual)</strong> en el chat.',
      statusText: 'Esperando confirmación en el chat…'
    }));
  } catch (err) {
    res.status(500).send('Error al buscar el Design System: ' + escapeHtml(err.message));
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

    res.send(renderBlueprintPage(brandName));
  } catch (err) {
    res.status(500).send('Error al generar vista de Blueprint: ' + escapeHtml(err.message));
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

// Descriptores de las compuertas (las opciones de cada pregunta las escribe el agente en su respuesta)
app.get('/api/pipeline/gates', (req, res) => {
  res.json({ steps: pipeline.getAllSteps() });
});

app.post('/api/pipeline/evaluate', (req, res) => {
  const { text } = req.body || {};
  const action = pipeline.detectAction(text);
  res.json({ ok: true, action });
});

// 6d. Información y Operaciones del Espacio de Trabajo (Workspace) activo
app.get('/api/workspace', (req, res) => {
  res.json({ ...workspace.getInfo(), version: APP_VERSION });
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
  '.csv', '.json', '.xlsx',
  '.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif', '.avif'
]);

// Un manual de marca puede adjuntarse en el primer mensaje, cuando aún no existe el proyecto (se pide su nombre).
// Hasta entonces los archivos esperan en .pending_uploads/ y pasan a uploads/ del proyecto en cuanto se crea.
const PENDING_UPLOADS_DIR = '.pending_uploads';
const ATTACHMENT_NOTE_PATTERN = /\n*\[Archivos adjuntos en uploads\/: ([^\]]*)\]\s*$/;

function pendingUploadsPath() {
  return path.join(workspace.getBaseDir(), PENDING_UPLOADS_DIR);
}

function clearPendingUploads() {
  try { fs.rmSync(pendingUploadsPath(), { recursive: true, force: true }); } catch (e) { /* se ignora */ }
}

/** Mueve los archivos en espera a uploads/ del proyecto activo; devuelve sus nombres. */
function adoptPendingUploads() {
  const pendingDir = pendingUploadsPath();
  let names = [];
  try { names = fs.readdirSync(pendingDir); } catch (e) { return []; }
  if (names.length === 0) return [];
  const uploadsDir = path.join(workspace.getDir(), 'uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });
  const moved = [];
  for (const name of names) {
    try {
      fs.renameSync(path.join(pendingDir, name), path.join(uploadsDir, name));
      moved.push(name);
    } catch (e) { /* un archivo que no se pudo mover no bloquea el turno */ }
  }
  clearPendingUploads();
  return moved;
}

const uploadStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadsDir = workspace.hasProject() ? path.join(workspace.getDir(), 'uploads') : pendingUploadsPath();
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
      return cb(new Error(`Tipo de archivo no permitido: ${ext || '(sin extensión)'}. Formatos aceptados: ${[...ALLOWED_UPLOAD_EXTENSIONS].join(', ')} (las fuentes deben ser TTF, OTF, WOFF o WOFF2).`));
    }
    cb(null, true);
  }
});

// Adjuntos de referencia (fuentes, documentos de marca, hojas de datos) para que el motor
// de IA los lea desde uploads/ dentro del workspace activo.
app.post('/api/upload', upload.array('files', 6), (req, res) => {
  const files = (req.files || []).map((f) => ({ name: f.filename, size: f.size }));
  res.json({ ok: true, files, staged: !workspace.hasProject() });
});

app.use('/api/upload', (err, req, res, next) => {
  if (err instanceof multer.MulterError || err) {
    return res.status(400).json({ error: err.message });
  }
  next();
});

// 7. Resetear sesión y pruebas
app.post('/api/reset', (req, res) => {
  const { sessionId } = req.body || {};

  // Un turno en curso seguiría escribiendo en el proyecto que se está descartando: se cancela primero
  agentEngine.cancelAll();
  activeTurns.clear();

  if (sessionId) {
    agentEngine.resetSession(sessionId);
  }

  // Respaldo atómico de estado gestionado por el módulo Workspace
  workspace.backupState();

  // Resetear el proyecto activo para volver a la raíz base homium_projects
  workspace.resetProject();
  clearPendingUploads();

  // Refrescar inmediatamente el store para notificar a los suscriptores SSE
  deliverableStore.refresh();

  res.json({ ok: true, message: 'Sesión, proyecto y estado reseteados' });
});

// 7a. Empezar otro proyecto conservando el actual intacto en disco (a diferencia de /api/reset, que archiva su
// estado e historial). Al escribir después el nombre de una marca existente se retoma su carpeta.
app.post('/api/project/new', (req, res) => {
  const { sessionId } = req.body || {};
  const previousProject = workspace.getProjectName();

  agentEngine.cancelAll();
  activeTurns.clear();
  if (typeof sessionId === 'string') {
    agentEngine.resetSession(sessionId);
  }

  workspace.resetProject();
  clearPendingUploads();
  deliverableStore.refresh();

  res.json({
    ok: true,
    previousProject,
    message: previousProject
      ? `El proyecto "${previousProject}" se conserva en disco. Escribe el nombre de la nueva marca para empezar otro proyecto.`
      : 'No había un proyecto activo.'
  });
});

// Una compuerta solo es válida si ya existe en disco el entregable que pide revisar (Design System / prototipo).
// Evita que una pregunta de cierre de fase redactada como aprobación abra la compuerta 1 antes de construir el Design System.
// `dir`: carpeta del proyecto al que pertenece la acción; si ya no es el activo no hay con qué comprobarla.
function gateHasDeliverable(action, dir = null) {
  if (!action || action.type !== 'gate') return true;
  if (dir && dir !== workspace.dir) return true;
  return pipeline.isGateReady(action, deliverableStore.refresh().status);
}

// Adjunta a la compuerta el resultado de las auditorías mecánicas. Un fallo al auditar nunca impide mostrar la compuerta.
function withGateAudit(action, dir) {
  try {
    const audit = runGateAudits(action.stepId, dir);
    return audit ? { ...action, audit } : action;
  } catch (err) {
    console.warn('[Audits] No se pudieron ejecutar las auditorías de la compuerta:', err.message);
    return action;
  }
}

// sessionId opcional de ?sessionId=: permite saber si el turno en curso es de esta sesión y no de otra persona
function requestedSessionId(req) {
  const value = req.query && req.query.sessionId;
  return typeof value === 'string' && SESSION_ID_PATTERN.test(value) ? value : null;
}

// 7b. Historial y estado conversacional persistido para reanudación inmediata (F5 / reconexión)
app.get('/api/chat/history', (req, res) => {
  if (!workspace.hasProject()) {
    return res.json({ ok: true, hasProject: false, messages: [], busy: agentEngine.isBusy(requestedSessionId(req)) });
  }

  // Sin ningún turno en curso, un mensaje del usuario sin respuesta es de un turno que se cortó (p. ej. reinicio del servidor)
  const interrupted = agentEngine.isBusy() ? [] : workspace.dropUnansweredUserMessages();

  const history = workspace.getChatHistory();
  const stateObj = deliverableStore.getState();
  const snapshot = deliverableStore.getSnapshot();

  const currentPhase = stateObj.state?.current_phase || 1;
  const currentStage = stateObj.state?.current_stage || '';
  const brandName = stateObj.state?.brand?.name || stateObj.state?.brand || workspace.getProjectName();

  const gates = history.gates || {};
  let pendingAction = history.lastAction || null;

  // Una compuerta que el usuario ya resolvió (aprobada, o con ajustes en curso) no vuelve a ofrecerse
  if (pendingAction && pendingAction.type === 'gate' && gates[pendingAction.stepId]) {
    pendingAction = null;
  }
  // Una compuerta guardada sin su entregable en disco (falso positivo previo) no se ofrece
  if (pendingAction && !gateHasDeliverable(pendingAction)) {
    pendingAction = null;
  }

  // Si no hay acción pendiente registrada explícita pero los entregables indican compuerta sin resolver:
  if (!pendingAction) {
    if (snapshot.status?.designSystemExists && currentPhase >= 4 && !snapshot.status?.prototypeExists && !gates['gate-1']) {
      pendingAction = pipeline.getGate('gate-1');
    } else if (snapshot.status?.prototypeExists && currentPhase >= 5 && !gates['gate-2']) {
      pendingAction = pipeline.getGate('gate-2');
    }
  }

  // Tras recargar, la compuerta vuelve con el resultado de las auditorías (se recalcula: los archivos pudieron cambiar)
  if (pendingAction && pendingAction.type === 'gate') {
    // El texto de la tarjeta se toma del código actual, no de la copia guardada (que puede traer redacciones anteriores)
    const canonical = pipeline.getGate(pendingAction.stepId);
    if (canonical) pendingAction = { ...pendingAction, title: canonical.title, description: canonical.description };
    pendingAction = withGateAudit(pendingAction, workspace.dir);
  }

  res.json({
    ok: true,
    hasProject: true,
    projectName: workspace.getProjectName(),
    brandName,
    currentPhase,
    currentStage,
    messages: history.messages || [],
    interrupted,
    lastAssistantMessage: history.lastAssistantMessage || null,
    pendingAction,
    gates,
    deliverables: snapshot.status,
    // Hay un turno en curso: la respuesta aún no está en el historial (p. ej. el cliente se reconectó a mitad de turno)
    busy: agentEngine.isBusy(requestedSessionId(req))
  });
});

// 8. Streaming de chat mediante SSE (Server-Sent Events) delegando en TurnStream.pipeToSSE
const MAX_MESSAGE_CHARS = 20000;
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

// Turnos en curso por sesión: permiten cancelar explícitamente (botón Detener / reset)
const activeTurns = new Map();

app.post('/api/chat', (req, res) => {
  const { sessionId, engine: requestedEngine } = req.body || {};
  let message = (req.body || {}).message;

  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Mensaje requerido' });
  }
  if (message.length > MAX_MESSAGE_CHARS) {
    return res.status(413).json({ error: `El mensaje supera el máximo de ${MAX_MESSAGE_CHARS} caracteres.` });
  }
  if (sessionId != null && (typeof sessionId !== 'string' || !SESSION_ID_PATTERN.test(sessionId))) {
    return res.status(400).json({ error: 'sessionId inválido' });
  }
  const engineType = requestedEngine || 'claude';
  if (typeof engineType !== 'string' || !agentEngine.hasAdapter(engineType)) {
    return res.status(400).json({ error: `Motor no soportado: "${String(engineType).slice(0, 40)}"` });
  }

  // Si aún no se ha establecido la subcarpeta de proyecto (primer turno):
  if (!workspace.hasProject()) {
    // La nota de adjuntos que añade el cliente no es parte del nombre de la marca
    const detectedName = Workspace.extractProjectName(message.replace(ATTACHMENT_NOTE_PATTERN, '').trim());
    if (detectedName) {
      try {
        workspace.setProject(detectedName);
      } catch (err) {
        return res.status(500).json({ error: `No se pudo crear el proyecto "${detectedName}": ${err.message}` });
      }
    }
  }

  // Adjuntos subidos antes de que existiera el proyecto (p. ej. el manual de marca junto al nombre): ya están en
  // uploads/ del proyecto y el motor debe saberlo. Si aún no hay proyecto, se le dice por qué no puede leerlos todavía.
  let attachmentNote = '';
  if (workspace.hasProject()) {
    const adopted = adoptPendingUploads();
    if (adopted.length > 0 && !ATTACHMENT_NOTE_PATTERN.test(message)) {
      attachmentNote = `\n\n[Archivos adjuntos en uploads/: ${adopted.join(', ')}]`;
    }
  } else if (ATTACHMENT_NOTE_PATTERN.test(message)) {
    message = message.replace(ATTACHMENT_NOTE_PATTERN, '').trim() +
      '\n\n[El usuario adjuntó archivos, pero aún no existe el proyecto: se guardarán en uploads/ en cuanto indique el nombre de la marca. Pídeselo y léelos en el turno siguiente.]';
  }
  if (attachmentNote) message += attachmentNote;

  // Proyecto al que pertenece este turno: la respuesta se guarda ahí aunque mientras tanto cambie el activo
  const target = workspace.hasProject() ? workspace.snapshot() : null;

  let stream;
  try {
    stream = agentEngine.executeTurn({
      sessionId,
      message,
      engine: engineType,
      pendingStep: workspace.getPendingStep()
    });
  } catch (err) {
    const statusCode = err.code === 'BUSY' ? 409 : (err.code === 'UNKNOWN_ENGINE' ? 400 : 500);
    return res.status(statusCode).json({ error: err.message });
  }

  // El mensaje del usuario solo se registra una vez que el turno arrancó: un 409 o un fallo
  // de arranque no deja un mensaje sin respuesta en el historial.
  const userMessage = { role: 'user', content: message, timestamp: Date.now() };
  if (target) workspace.addChatMessage(userMessage, target);

  // ¿El mensaje resuelve una compuerta abierta? (botón Aprobar / Solicitar ajustes, o un "Aprobado" escrito a mano).
  // Se recuerda para que, tras recargar, la compuerta no se vuelva a inferir de los entregables en disco.
  let gateBefore = null;
  if (target) {
    const lastAction = workspace.getLastAction(target);
    const gateResponse = pipeline.matchGateResponse(message, {
      pendingGateId: lastAction && lastAction.type === 'gate' && gateHasDeliverable(lastAction, target.dir) ? lastAction.stepId : null
    });
    if (gateResponse) {
      gateBefore = { gates: workspace.getGateStatuses(target), lastAction };
      workspace.setGateStatus(gateResponse.gateId, gateResponse.approved ? 'approved' : 'adjusting', target);
    }
  }

  // Un turno fallido o cancelado no dejó rastro: se retira el mensaje (para poder reenviarlo) y se restaura la compuerta
  const undoTurn = () => {
    if (!target) return;
    workspace.removeChatMessage(userMessage, target);
    if (gateBefore) workspace.restoreGateState(gateBefore, target);
  };

  const turnKey = stream.sessionId;
  activeTurns.set(turnKey, { stream, undoTurn });
  const releaseTurn = () => {
    if (activeTurns.get(turnKey)?.stream === stream) activeTurns.delete(turnKey);
  };

  stream.on('error', () => {
    releaseTurn();
    undoTurn();
  });
  stream.on('cancelled', releaseTurn);

  stream.pipeToSSE(res, {
    transformDone: (doneData, fullText) => {
      releaseTurn();
      let action = pipeline.detectAction(fullText, { userMessage: message });
      if (action && !gateHasDeliverable(action, target && target.dir)) action = null;
      // La compuerta lleva el resultado real de las auditorías sobre lo que hay en disco (informativo: no bloquea)
      if (action && action.type === 'gate' && target) action = withGateAudit(action, target.dir);
      if (target && action && action.type === 'gate') {
        // El agente (re)abrió la compuerta: deja de estar resuelta
        workspace.setGateStatus(action.stepId, null, target);
      }
      if (target && fullText.trim()) {
        workspace.addChatMessage({
          role: 'assistant',
          content: fullText,
          action,
          timestamp: Date.now()
        }, target);
      }
      // El estado del proyecto sigue a la compuerta 2 (finalizado solo con ella aprobada), diga lo que diga el agente
      if (target) workspace.reconcileProjectStatus(target);
      return {
        ...doneData,
        action
      };
    }
  });
});

// 8a. Registro de turnos del proyecto activo (métricas, sin contenido de la conversación)
app.get('/api/turns', requireActiveProject, (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 500);
  res.json({ ok: true, turns: readTurnLog(workspace.getDir(), limit) });
});

// 8a-bis. Gasto acumulado del proyecto: tokens, costo y último contexto, sumados desde el registro de turnos
app.get('/api/telemetry', requireActiveProject, (req, res) => {
  const dir = workspace.getDir();
  const turns = readTurnLog(dir, Number.MAX_SAFE_INTEGER);
  res.json({ ok: true, summary: summarizeTurns(turns), recent: turns.slice(-15).reverse() });
});

// 8b. Cancelación explícita del turno en curso (botón Detener): no se guarda respuesta parcial
app.post('/api/chat/cancel', (req, res) => {
  const { sessionId } = req.body || {};
  const active = typeof sessionId === 'string' ? activeTurns.get(sessionId) : null;
  if (!active) {
    return res.json({ ok: true, cancelled: false });
  }
  activeTurns.delete(sessionId);
  active.stream.kill();
  active.undoTurn();
  res.json({ ok: true, cancelled: true });
});

const server = app.listen(PORT, HOST, () => {
  console.log(`\n========================================================`);
  console.log(`🚀 HOMIUM SITE BUILDER activo en: http://localhost:${PORT}`);
  console.log(`Tokens Homium cargados desde: ${HOMIUM_DIR}`);
  console.log(`========================================================\n`);
});

// Apagado ordenado: termina los agentes en curso (y sus procesos hijos) en lugar de dejarlos huérfanos
function shutdown(signal) {
  console.log(`[Server] ${signal} recibido: cancelando turnos activos y cerrando.`);
  try { agentEngine.cancelAll(); } catch (e) {}
  try { deliverableStore.close(); } catch (e) {}
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
