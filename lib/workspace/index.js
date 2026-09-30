const fs = require('fs');
const path = require('path');
const os = require('os');
const { EventEmitter } = require('events');
const MessageHeuristics = require('../../core/text/message-heuristics');

// Tope de mensajes conservados en chat_history.json (evita que el archivo crezca sin límite)
const MAX_HISTORY_MESSAGES = 500;
// Longitud máxima del slug de proyecto (nombre de carpeta)
const MAX_SLUG_LENGTH = 60;

/**
 * Escritura atómica: escribe en un temporal y renombra, de modo que una caída a mitad de escritura
 * nunca deja el archivo destino truncado o a medias.
 */
function writeFileAtomic(filePath, content) {
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(tmpPath, content, 'utf-8');
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    try { fs.unlinkSync(tmpPath); } catch (e) {}
    throw err;
  }
}

/**
 * Lee un JSON del historial. Si está corrupto lo aparta como `<nombre>.corrupt-<ts>.json`
 * (en vez de sobrescribirlo) y devuelve null.
 */
function readJsonOrQuarantine(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch (e) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    const quarantined = filePath.replace(/\.json$/, `.corrupt-${Date.now()}.json`);
    try {
      fs.renameSync(filePath, quarantined);
      console.warn(`[Workspace] ${path.basename(filePath)} corrupto; se conservó una copia en ${path.basename(quarantined)}`);
    } catch (e) {
      console.warn(`[Workspace] ${path.basename(filePath)} corrupto y no se pudo respaldar: ${err.message}`);
    }
    return null;
  }
}

/**
 * Workspace — Módulo profundo de confinamiento y gestión del espacio de trabajo
 *
 * Centraliza la resolución de rutas en disco, la creación del sandbox físico,
 * la creación de subcarpetas aisladas por proyecto tras la primera respuesta del usuario,
 * el listado seguro de archivos, la apertura nativa en el explorador del SO
 * y el respaldo atómico de estados.
 */
class Workspace extends EventEmitter {
  /**
   * Resuelve el directorio base canónico respetando WORKSPACE_ROOT_DIR o WORKSPACE_DIR
   * @returns {string}
   */
  static resolveDefaultBaseDir() {
    if (process.env.WORKSPACE_ROOT_DIR) {
      return path.resolve(process.env.WORKSPACE_ROOT_DIR);
    }
    if (process.env.WORKSPACE_DIR) {
      return path.resolve(process.env.WORKSPACE_DIR);
    }
    return path.join(os.homedir(), 'Downloads', 'homium_projects');
  }

  static resolveDefaultDir() {
    return Workspace.resolveDefaultBaseDir();
  }

  /**
   * Normaliza un nombre en un slug seguro para sistema de archivos
   * @param {string} name
   * @returns {string}
   */
  static slugify(name) {
    if (!name || typeof name !== 'string') return '';
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // eliminar acentos y diacríticos
      .replace(/[^a-z0-9]+/g, '-')     // caracteres especiales y espacios a guiones
      .replace(/^-+|-+$/g, '')         // recortar guiones en extremos
      .slice(0, MAX_SLUG_LENGTH)
      .replace(/-+$/, '');
  }

  /**
   * Extrae inteligentemente el nombre del proyecto o marca desde la respuesta del usuario
   * @param {string} text
   * @returns {string|null}
   */
  static extractProjectName(text) {
    if (!text || typeof text !== 'string') return null;
    const clean = text.trim();
    if (!clean) return null;

    // Palabras de comando, afirmación o conversación que JAMÁS deben tratarse como nombres de marca
    const commandWords = new Set([
      'si', 'no', 'continua', 'continuar', 'adelante', 'siguiente', 'seguir', 'dale',
      'ok', 'listo', 'avanza', 'avanzar', 'reanudar', 'hola', 'buenas', 'gracias',
      'perfecto', 'proceder', 'ya', 'vale', 'bien', 'bueno', 'correcto', 'entendido',
      'reiniciar', 'cancelar', 'ayuda', 'help', 'start', 'next', 'continue', 'yes'
    ]);

    const normalizedSingle = clean.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (commandWords.has(normalizedSingle)) {
      return null;
    }

    // 1. Si es una URL (ej: https://linear.app o linear.app)
    const urlMatch = clean.match(/(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9\-]+)\.(?:com|app|io|ai|co|org|net|dev|site)/i);
    if (urlMatch && urlMatch[1]) {
      return Workspace.slugify(urlMatch[1]);
    }

    // 2. Patrones conversacionales en español (ordenados por especificidad):
    const patternMatch =
      clean.match(/(?:marca llamada|empresa se llama|marca se llama|se llama|nombre es)\s+([a-zA-Z0-9_\-]+)/i) ||
      clean.match(/(?:marca|empresa|proyecto)\s+([a-zA-Z0-9_\-]+)/i);
    if (patternMatch && patternMatch[1]) {
      const candidate = patternMatch[1].toLowerCase();
      if (!commandWords.has(candidate) && !MessageHeuristics.FUNCTION_WORDS.has(candidate)) {
        return Workspace.slugify(patternMatch[1]);
      }
    }

    // 3. Chips comunes como "SaaS Lumina" -> "lumina", "URL Linear" -> "linear"
    const chipMatch = clean.match(/^(?:saas|url|app|sitio)\s+([a-zA-Z0-9_\-]+)/i);
    if (chipMatch && chipMatch[1]) {
      return Workspace.slugify(chipMatch[1]);
    }

    // 4. Respuestas concisas (1 a 3 palabras, ej: "Lumina", "Acme Corp", "Studio Alpha").
    // Las preguntas, pedidos y saludos no son nombres de marca: si el mensaje no trae un nombre
    // explícito (reglas 1-3), no se crea proyecto y el agente pregunta el nombre en la Etapa 1.1.
    if (!MessageHeuristics.isPlausibleBrandAnswer(clean)) {
      return null;
    }

    const words = clean.split(/\s+/).filter(Boolean);
    const nonCommandWords = words.filter(w => !commandWords.has(w.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')));
    if (nonCommandWords.length === 0 || words.length > 3) {
      return null;
    }

    return Workspace.slugify(nonCommandWords.join('-')) || null;
  }

  /**
   * @param {Object} [options]
   * @param {string} [options.baseDir] Directorio raíz de proyectos (ej: ~/Downloads/homium_projects)
   * @param {string} [options.dir] Directorio de trabajo opcional para compatibilidad
   * @param {string} [options.projectName] Nombre de proyecto inicial opcional
   */
  constructor({ baseDir = null, dir = null, projectName = null } = {}) {
    super();
    this.baseDir = baseDir ? path.resolve(baseDir) : (dir ? path.resolve(dir) : Workspace.resolveDefaultBaseDir());

    let initialProject = projectName;

    // Si no se proporcionó projectName, intentar restaurar desde el marcador .active_project
    if (!initialProject) {
      const markerPath = path.join(this.baseDir, '.active_project');
      if (fs.existsSync(markerPath)) {
        try {
          const saved = fs.readFileSync(markerPath, 'utf-8').trim();
          if (saved && fs.existsSync(path.join(this.baseDir, saved))) {
            initialProject = saved;
          }
        } catch (e) {}
      }
    }

    // Si aún no hay proyecto, verificar si existe en baseDir una subcarpeta con design-system-state.json
    if (!initialProject && fs.existsSync(this.baseDir)) {
      try {
        const entries = fs.readdirSync(this.baseDir, { withFileTypes: true });
        const validDirs = entries.filter(e => e.isDirectory() && fs.existsSync(path.join(this.baseDir, e.name, 'design-system-state.json')));
        if (validDirs.length === 1) {
          initialProject = validDirs[0].name;
        }
      } catch (e) {}
    }

    this.projectName = initialProject ? Workspace.slugify(initialProject) : null;
    this.dir = this.projectName ? path.join(this.baseDir, this.projectName) : this.baseDir;
    this.ensureExists();
  }

  /**
   * Garantiza la existencia del directorio base y del subdirectorio de proyecto en disco
   */
  ensureExists() {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
    if (!fs.existsSync(this.dir)) {
      fs.mkdirSync(this.dir, { recursive: true });
    } else if (!fs.statSync(this.dir).isDirectory()) {
      throw new Error(`La ruta del proyecto existe pero no es una carpeta: ${path.basename(this.dir)}`);
    }
    return this;
  }

  hasProject() {
    return Boolean(this.projectName);
  }

  getProjectName() {
    return this.projectName;
  }

  getBaseDir() {
    return this.baseDir;
  }

  getDir() {
    return this.dir;
  }

  getPrototypeDir() {
    return path.join(this.dir, 'prototype');
  }

  /**
   * Foto del proyecto activo. Un turno largo la captura al iniciar para persistir su respuesta
   * en ese proyecto aunque mientras tanto cambie el activo.
   * @returns {{ projectName: string|null, dir: string }}
   */
  snapshot() {
    return { projectName: this.projectName, dir: this.dir };
  }

  setProject(rawName) {
    const slug = Workspace.slugify(rawName);
    if (!slug) return this.dir;

    const previous = { projectName: this.projectName, dir: this.dir };
    this.projectName = slug;
    this.dir = path.join(this.baseDir, slug);
    try {
      this.ensureExists();
    } catch (err) {
      // No dejar el workspace apuntando a una carpeta que no se pudo crear
      this.projectName = previous.projectName;
      this.dir = previous.dir;
      throw err;
    }

    try {
      writeFileAtomic(path.join(this.baseDir, '.active_project'), this.projectName);
    } catch (e) {}

    this.emit('projectChanged', {
      projectName: this.projectName,
      workspaceDir: this.dir,
      baseDir: this.baseDir
    });

    return this.dir;
  }

  resetProject() {
    this.projectName = null;
    this.dir = this.baseDir;
    this.ensureExists();

    try {
      const markerPath = path.join(this.baseDir, '.active_project');
      if (fs.existsSync(markerPath)) {
        fs.unlinkSync(markerPath);
      }
    } catch (e) {}

    this.emit('projectChanged', {
      projectName: null,
      workspaceDir: this.dir,
      baseDir: this.baseDir
    });

    return this.dir;
  }

  getInfo() {
    return {
      baseDir: this.baseDir,
      projectName: this.projectName,
      workspaceDir: this.dir,
      hasProject: Boolean(this.projectName),
      exists: fs.existsSync(this.dir),
      isDefault: !process.env.WORKSPACE_ROOT_DIR && !process.env.WORKSPACE_DIR
    };
  }

  listFiles() {
    try {
      if (!fs.existsSync(this.dir)) {
        return { ok: true, workspaceDir: this.dir, projectName: this.projectName, files: [] };
      }
      const entries = fs.readdirSync(this.dir, { withFileTypes: true });
      const files = entries.map((ent) => {
        const fullPath = path.join(this.dir, ent.name);
        try {
          const stat = fs.statSync(fullPath);
          return {
            name: ent.name,
            isDirectory: ent.isDirectory(),
            size: stat.size,
            updatedAt: stat.mtime
          };
        } catch {
          return {
            name: ent.name,
            isDirectory: ent.isDirectory(),
            size: 0,
            updatedAt: null
          };
        }
      });
      return { ok: true, workspaceDir: this.dir, projectName: this.projectName, files };
    } catch (err) {
      return { ok: false, workspaceDir: this.dir, projectName: this.projectName, error: err.message, files: [] };
    }
  }

  backupState() {
    const timestamp = Date.now();
    const statePath = path.join(this.dir, 'design-system-state.json');
    let backupPath = null;
    if (fs.existsSync(statePath)) {
      backupPath = path.join(this.dir, `design-system-state.backup-${timestamp}.json`);
      fs.renameSync(statePath, backupPath);
    }
    const historyPath = this.getChatHistoryPath();
    if (fs.existsSync(historyPath)) {
      try {
        fs.renameSync(historyPath, path.join(this.dir, `chat_history.backup-${timestamp}.json`));
      } catch (e) {}
    }
    return backupPath;
  }

  getChatHistoryPath(dir = this.dir) {
    return path.join(dir, 'chat_history.json');
  }

  /**
   * @param {Object} message
   * @param {Object} [target] Proyecto destino capturado con snapshot(); por defecto el activo
   */
  addChatMessage({ role, content, action = null, timestamp = Date.now() }, target = null) {
    if (!target && !this.hasProject()) return null;
    const dir = target ? target.dir : this.dir;
    const projectName = target ? target.projectName : this.projectName;
    if (!projectName) return null;

    fs.mkdirSync(dir, { recursive: true });
    const historyPath = this.getChatHistoryPath(dir);
    let history = {
      projectName,
      messages: [],
      lastAssistantMessage: null,
      lastAction: null,
      updatedAt: timestamp
    };

    if (fs.existsSync(historyPath)) {
      const existing = readJsonOrQuarantine(historyPath);
      if (existing && typeof existing === 'object') history = existing;
    }

    if (!Array.isArray(history.messages)) {
      history.messages = [];
    }

    const msgObj = { role, content, timestamp };
    if (action) msgObj.action = action;

    history.messages.push(msgObj);
    if (history.messages.length > MAX_HISTORY_MESSAGES) {
      history.messages = history.messages.slice(-MAX_HISTORY_MESSAGES);
    }
    history.updatedAt = timestamp;

    if (role === 'assistant') {
      history.lastAssistantMessage = msgObj;
      if (action) {
        history.lastAction = action;
      } else if (MessageHeuristics.isFlowMessage(content)) {
        // El flujo avanzó a un paso sin controles: la acción anterior ya no está vigente.
        // Un desvío sin título de Etapa/Fase conserva la acción pendiente.
        history.lastAction = null;
      }
    }

    try {
      writeFileAtomic(historyPath, JSON.stringify(history, null, 2));
    } catch (err) {
      console.warn('[Workspace] Error writing chat_history.json:', err.message);
    }

    return history;
  }

  /**
   * Retira un mensaje del historial (por rol y timestamp). Se usa cuando un turno falla o se cancela
   * para no dejar un mensaje del usuario sin respuesta.
   * @returns {boolean} true si se eliminó
   */
  removeChatMessage({ role, timestamp }, target = null) {
    const dir = target ? target.dir : this.dir;
    const historyPath = this.getChatHistoryPath(dir);
    if (!fs.existsSync(historyPath)) return false;

    const history = readJsonOrQuarantine(historyPath);
    if (!history || !Array.isArray(history.messages)) return false;

    const index = history.messages.findLastIndex
      ? history.messages.findLastIndex(m => m && m.role === role && m.timestamp === timestamp)
      : history.messages.map(m => m && m.role === role && m.timestamp === timestamp).lastIndexOf(true);
    if (index === -1) return false;

    history.messages.splice(index, 1);
    try {
      writeFileAtomic(historyPath, JSON.stringify(history, null, 2));
    } catch (err) {
      console.warn('[Workspace] Error writing chat_history.json:', err.message);
      return false;
    }
    return true;
  }

  getChatHistory() {
    const historyPath = this.getChatHistoryPath();
    if (fs.existsSync(historyPath)) {
      const parsed = readJsonOrQuarantine(historyPath);
      if (parsed && Array.isArray(parsed.messages) && parsed.messages.length > 0) {
        return parsed;
      }
    }

    // Reanudación sintética si existe design-system-state.json
    const statePath = path.join(this.dir, 'design-system-state.json');
    if (fs.existsSync(statePath)) {
      try {
        const raw = fs.readFileSync(statePath, 'utf-8');
        const state = JSON.parse(raw);
        const brandName = state.brand?.name || state.brand || this.projectName || 'Tu marca';
        const phase = state.current_phase || 1;

        let lastMessage = '';
        if (phase >= 4) {
          lastMessage = `He completado y validado el **Showcase del Design System** para **${brandName}**. Las especificaciones de tokens cromáticos, tipografía modular y catálogo vivo de componentes están listas.\n\nPuedes revisarlo en la pestaña **Showcase**. Cuando estés listo, continuemos con la **Fase 5 (Construcción del Prototipo interactivo de 3 pantallas)**.`;
        } else if (phase === 3) {
          lastMessage = `Hemos definido los cimientos visuales y avanzado en el catálogo de componentes para **${brandName}**. Las decisiones están registradas en el estado del sistema.`;
        } else if (phase === 2) {
          lastMessage = `Completamos la fase de Discovery y estamos definiendo la paleta y cimientos visuales para **${brandName}**.`;
        } else {
          lastMessage = `El proyecto **${brandName}** está activo en Fase 1.`;
        }

        const synthetic = {
          projectName: this.projectName,
          brandName,
          currentPhase: phase,
          updatedAt: Date.now(),
          messages: [
            {
              role: 'assistant',
              content: lastMessage,
              synthetic: true,
              timestamp: Date.now()
            }
          ],
          lastAssistantMessage: {
            role: 'assistant',
            content: lastMessage,
            synthetic: true,
            timestamp: Date.now()
          },
          lastAction: null
        };

        try {
          writeFileAtomic(historyPath, JSON.stringify(synthetic, null, 2));
        } catch (e) {}

        return synthetic;
      } catch (e) {}
    }

    return {
      projectName: this.projectName,
      messages: [],
      lastAssistantMessage: null,
      lastAction: null
    };
  }

  /**
   * Última respuesta del agente que fue un paso del flujo (la pregunta pendiente), ignorando
   * desvíos y mensajes sintéticos de reanudación. Sobrevive a reinicios del servidor.
   * @returns {string|null}
   */
  getPendingStep() {
    if (!this.hasProject()) return null;
    try {
      const history = JSON.parse(fs.readFileSync(this.getChatHistoryPath(), 'utf-8'));
      const messages = Array.isArray(history.messages) ? history.messages : [];
      for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i];
        if (m && m.role === 'assistant' && !m.synthetic && MessageHeuristics.isFlowMessage(m.content)) {
          return m.content;
        }
      }
    } catch (e) {}
    return null;
  }

  exists(subpath = '') {
    return fs.existsSync(path.join(this.dir, subpath));
  }
}

module.exports = Workspace;
