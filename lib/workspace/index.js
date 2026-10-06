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
   * Extrae el nombre de marca/proyecto de la respuesta del usuario, o null si el mensaje no trae uno.
   *
   * Orden (de más a menos explícito):
   *   1. Patrones conversacionales: "mi marca se llama X", "marca X", "empresa X", "proyecto X".
   *   2. El mensaje ES una URL (o "URL x.com"): el nombre del dominio. Una URL dentro de una frase es una
   *      referencia de diseño, no el nombre de la marca.
   *   3. Chips comunes: "SaaS Lumina", "URL Linear".
   *   4. Respuestas concisas de 1 a 3 palabras ("Lumina", "Acme Corp").
   * @param {string} text
   * @returns {string|null}
   */
  static extractProjectName(text) {
    if (!text || typeof text !== 'string') return null;
    const clean = text.trim();
    if (!clean) return null;

    const commandWords = MessageHeuristics.COMMAND_WORDS;
    const norm = (w) => MessageHeuristics.normalize(w).replace(/[^a-z0-9]/g, '');
    // Candidato que no puede ser un nombre: comando, palabra funcional o sustantivo genérico ("web", "nuevo")
    const isNonBrandWord = (w) => {
      const n = norm(w);
      return !n || commandWords.has(n) || MessageHeuristics.FUNCTION_WORDS.has(n) || MessageHeuristics.GENERIC_NOUNS.has(n);
    };

    if (MessageHeuristics.isCommandAnswer(clean) && clean.split(/\s+/).length <= 3) {
      return null;
    }

    // 1. Patrones conversacionales en español (ordenados por especificidad)
    const patternMatch =
      clean.match(/(?:marca llamada|empresa se llama|marca se llama|se llama|nombre es)\s+([\p{L}0-9_\-]+)/iu) ||
      clean.match(/(?:marca|empresa|proyecto)\s+([\p{L}0-9_\-]+)/iu);
    if (patternMatch && patternMatch[1] && !isNonBrandWord(patternMatch[1])) {
      const slug = Workspace.slugify(patternMatch[1]);
      if (slug) return slug;
    }

    // 2. El mensaje completo es una URL: sitio propio de la marca (ej: https://lumina.io o "URL linear.app")
    const urlOnly = clean.match(/^(?:url\s+)?(?:https?:\/\/)?((?:[a-z0-9-]+\.)+[a-z]{2,})(?::\d+)?(?:[\/?#]\S*)?$/i);
    if (urlOnly) {
      const labels = urlOnly[1].toLowerCase().split('.').filter(l => l && l !== 'www');
      const secondLevel = new Set(['co', 'com', 'org', 'net', 'gob', 'gov', 'edu', 'ac']);
      let brandLabel = null;
      if (labels.length >= 3 && labels[labels.length - 1].length === 2 && secondLevel.has(labels[labels.length - 2])) {
        brandLabel = labels[labels.length - 3];
      } else if (labels.length >= 2) {
        brandLabel = labels[labels.length - 2];
      }
      if (brandLabel) return Workspace.slugify(brandLabel) || null;
    }

    // 3. Chips comunes como "SaaS Lumina" -> "lumina", "URL Linear" -> "linear"
    const chipMatch = clean.match(/^(?:saas|url|app|sitio)\s+([\p{L}0-9_\-]+)/iu);
    if (chipMatch && chipMatch[1] && !isNonBrandWord(chipMatch[1])) {
      return Workspace.slugify(chipMatch[1]) || null;
    }

    // 4. Respuestas concisas (1 a 3 palabras, ej: "Lumina", "Acme Corp", "Studio Alpha").
    // Las preguntas, pedidos y saludos no son nombres de marca: si el mensaje no trae un nombre
    // explícito (reglas 1-3), no se crea proyecto y el agente pregunta el nombre en la Etapa 1.1.
    if (!MessageHeuristics.isPlausibleBrandAnswer(clean)) {
      return null;
    }

    const words = clean.split(/\s+/).filter(Boolean);
    if (words.length === 0 || words.length > 3) {
      return null;
    }
    // "sitio para Acme.mx", "mi proyecto web": describen lo que se quiere, no cómo se llama
    const descriptiveNouns = new Set(['web', 'website', 'sitio', 'pagina', 'proyecto', 'marca', 'empresa']);
    if (words.length >= 2 && words.some(w => descriptiveNouns.has(norm(w)))) {
      return null;
    }

    return Workspace.slugify(words.join('-')) || null;
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

  _readHistoryFor(dir) {
    const historyPath = this.getChatHistoryPath(dir);
    if (!fs.existsSync(historyPath)) return null;
    const history = readJsonOrQuarantine(historyPath);
    return history && typeof history === 'object' ? history : null;
  }

  /**
   * Estado de cada compuerta de aprobación ({ 'gate-1': { status: 'approved' | 'adjusting', at } }), guardado
   * junto al historial. Sin este dato, tras recargar la página la compuerta se inferiría de nuevo de los
   * entregables en disco aunque el usuario ya la hubiera resuelto.
   */
  getGateStatuses(target = null) {
    const history = this._readHistoryFor(target ? target.dir : this.dir);
    const gates = history && history.gates;
    return gates && typeof gates === 'object' ? { ...gates } : {};
  }

  setGateStatuses(gates, target = null) {
    const dir = target ? target.dir : this.dir;
    const history = this._readHistoryFor(dir);
    if (!history) return false;
    history.gates = gates;
    try {
      writeFileAtomic(this.getChatHistoryPath(dir), JSON.stringify(history, null, 2));
      return true;
    } catch (err) {
      console.warn('[Workspace] Error writing chat_history.json:', err.message);
      return false;
    }
  }

  /**
   * Fija el estado de una compuerta: 'approved', 'adjusting' (el usuario pidió ajustes; el agente la reabrirá)
   * o null (la compuerta volvió a abrirse). Al resolverla también se retira la acción pendiente del historial.
   */
  setGateStatus(gateId, status, target = null) {
    const gates = this.getGateStatuses(target);
    if (status) gates[gateId] = { status, at: Date.now() };
    else delete gates[gateId];

    const dir = target ? target.dir : this.dir;
    const history = this._readHistoryFor(dir);
    if (!history) return false;
    history.gates = gates;
    if (status && history.lastAction && history.lastAction.stepId === gateId) history.lastAction = null;
    try {
      writeFileAtomic(this.getChatHistoryPath(dir), JSON.stringify(history, null, 2));
      return true;
    } catch (err) {
      console.warn('[Workspace] Error writing chat_history.json:', err.message);
      return false;
    }
  }

  /**
   * Alinea `status` de design-system-state.json con la compuerta 2, que es quien decide si el proyecto terminó:
   * "PROYECTO_FINALIZADO" solo con la compuerta 2 aprobada y "EN_CURSO" mientras no lo esté (STATE_CONTRACT).
   * Los motores no siempre lo cumplen (un agente escribió "COMPLETADO" y phase_5_complete en true con la compuerta
   * aún abierta, y la tarjeta de proyecto finalizado nunca aparecía), así que lo fija el servidor al cerrar el turno.
   * Un estado ausente o ilegible no se toca; un proyecto sin `status` solo recibe uno al finalizar.
   * @returns {{ status: string, changed: boolean } | null}
   */
  reconcileProjectStatus(target = null) {
    const dir = target ? target.dir : this.dir;
    if (!dir) return null;
    const statePath = path.join(dir, 'design-system-state.json');
    let state;
    try {
      state = JSON.parse(fs.readFileSync(statePath, 'utf-8').replace(/^﻿/, ''));
    } catch (err) {
      return null;
    }
    if (!state || typeof state !== 'object' || Array.isArray(state)) return null;

    const finished = (this.getGateStatuses(target)['gate-2'] || {}).status === 'approved';
    const wanted = finished ? 'PROYECTO_FINALIZADO' : 'EN_CURSO';
    const changes = {};
    if (state.status !== wanted && (finished || state.status !== undefined)) changes.status = wanted;
    if (finished && state.phase_5_complete !== true) changes.phase_5_complete = true;
    if (!finished && state.phase_5_complete === true) changes.phase_5_complete = false;
    if (!Object.keys(changes).length) return { status: state.status, changed: false };

    try {
      writeFileAtomic(statePath, JSON.stringify({ ...state, ...changes, updated_at: new Date().toISOString() }, null, 2));
      return { status: wanted, changed: true };
    } catch (err) {
      console.warn('[Workspace] No se pudo actualizar el status de design-system-state.json:', err.message);
      return null;
    }
  }

  /** Restaura el estado de compuertas y la acción pendiente (un turno que resolvía una compuerta falló o se canceló) */
  restoreGateState({ gates, lastAction }, target = null) {
    const dir = target ? target.dir : this.dir;
    const history = this._readHistoryFor(dir);
    if (!history) return false;
    history.gates = gates || {};
    history.lastAction = lastAction || null;
    try {
      writeFileAtomic(this.getChatHistoryPath(dir), JSON.stringify(history, null, 2));
      return true;
    } catch (err) {
      console.warn('[Workspace] Error writing chat_history.json:', err.message);
      return false;
    }
  }

  /** Última acción (compuerta) que el agente dejó pendiente de respuesta */
  getLastAction(target = null) {
    const history = this._readHistoryFor(target ? target.dir : this.dir);
    return (history && history.lastAction) || null;
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

  /**
   * Retira del final del historial los mensajes del usuario que se quedaron sin respuesta: un turno que el
   * servidor no llegó a cerrar (reinicio, caída) los deja huérfanos y bloquean las opciones de la última pregunta.
   * Solo debe llamarse cuando no hay ningún turno en curso.
   * @returns {string[]} contenido de los mensajes retirados (el más antiguo primero)
   */
  dropUnansweredUserMessages(target = null) {
    const dir = target ? target.dir : this.dir;
    const historyPath = this.getChatHistoryPath(dir);
    if (!fs.existsSync(historyPath)) return [];

    const history = readJsonOrQuarantine(historyPath);
    if (!history || !Array.isArray(history.messages)) return [];

    const dropped = [];
    while (history.messages.length > 0 && history.messages[history.messages.length - 1] && history.messages[history.messages.length - 1].role === 'user') {
      dropped.unshift(String(history.messages.pop().content || ''));
    }
    if (dropped.length === 0) return [];

    try {
      writeFileAtomic(historyPath, JSON.stringify(history, null, 2));
    } catch (err) {
      console.warn('[Workspace] Error writing chat_history.json:', err.message);
      return [];
    }
    return dropped;
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
          lastMessage = `He completado y validado el **Design System** para **${brandName}**. Las especificaciones de tokens cromáticos, tipografía modular y catálogo vivo de componentes están listas.\n\nPuedes revisarlo en la pestaña **Design System**. Cuando estés listo, continuemos con la **Fase 5 (Construcción del Prototipo interactivo de 3 pantallas)**.`;
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
