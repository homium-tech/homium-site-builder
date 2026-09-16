const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec, execFile } = require('child_process');
const { EventEmitter } = require('events');

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
      .replace(/^-+|-+$/g, '');        // recortar guiones en extremos
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
      if (!commandWords.has(candidate)) {
        return Workspace.slugify(patternMatch[1]);
      }
    }

    // 3. Chips comunes como "SaaS Lumina" -> "lumina", "URL Linear" -> "linear"
    const chipMatch = clean.match(/^(?:saas|url|app|sitio)\s+([a-zA-Z0-9_\-]+)/i);
    if (chipMatch && chipMatch[1]) {
      return Workspace.slugify(chipMatch[1]);
    }

    // 4. Respuestas concisas (1 a 3 palabras, ej: "Lumina", "Acme Corp", "Studio Alpha")
    const words = clean.split(/\s+/).filter(Boolean);
    const nonCommandWords = words.filter(w => !commandWords.has(w.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')));
    if (nonCommandWords.length === 0) {
      return null;
    }

    if (words.length <= 3 && nonCommandWords.length > 0) {
      return Workspace.slugify(nonCommandWords.join('-'));
    }

    // 5. Filtrar palabras vacías para encontrar el nombre sustantivo
    const stopWords = new Set(['quiero', 'crear', 'un', 'una', 'el', 'la', 'los', 'las', 'de', 'para', 'hola', 'buenas', 'sistema', 'diseno', 'web', ...commandWords]);
    const meaningful = words.find(w => !stopWords.has(w.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')));
    if (meaningful) {
      return Workspace.slugify(meaningful);
    }

    return null;
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

  setProject(rawName) {
    const slug = Workspace.slugify(rawName);
    if (!slug) return this.dir;

    this.projectName = slug;
    this.dir = path.join(this.baseDir, slug);
    this.ensureExists();

    try {
      fs.writeFileSync(path.join(this.baseDir, '.active_project'), this.projectName, 'utf-8');
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

  openInOS() {
    this.ensureExists();
    return new Promise((resolve) => {
      if (process.platform === 'win32') {
        // En Windows, explorer.exe puede retornar código 1 tras abrir correctamente la ventana;
        // invocar execFile con argumentos separados neutraliza la inyección de comandos en shell.
        execFile('explorer.exe', [this.dir], () => {
          resolve(true);
        });
      } else if (process.platform === 'darwin') {
        execFile('open', [this.dir], (err) => {
          resolve(!err);
        });
      } else {
        execFile('xdg-open', [this.dir], (err) => {
          resolve(!err);
        });
      }
    });
  }

  backupState() {
    const statePath = path.join(this.dir, 'design-system-state.json');
    if (fs.existsSync(statePath)) {
      const backupPath = path.join(this.dir, `design-system-state.backup-${Date.now()}.json`);
      fs.renameSync(statePath, backupPath);
      return backupPath;
    }
    return null;
  }

  exists(subpath = '') {
    return fs.existsSync(path.join(this.dir, subpath));
  }
}

module.exports = Workspace;
