const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');

/**
 * DeliverableStore — Módulo profundo reactivo para la supervisión de entregables
 *
 * Centraliza la observación de archivos en disco, valida y parsea el JSON del sistema de diseño,
 * mantiene un snapshot atómico en memoria y emite eventos en tiempo real eliminando el sondeo ciego.
 */
class DeliverableStore extends EventEmitter {
  constructor({
    rootDir,
    prototypeDir = null,
    debounceMs = 150,
    retryDelayMs = 100,
    autoStartWatcher = true
  } = {}) {
    super();

    if (!rootDir) {
      throw new Error('DeliverableStore requiere el parámetro "rootDir"');
    }

    this.rootDir = rootDir;
    this.prototypeDir = prototypeDir || path.join(rootDir, 'prototype');
    this.debounceMs = debounceMs;
    this.retryDelayMs = retryDelayMs;

    this.version = 0;
    this.cachedSnapshot = null;
    this.watchers = [];
    this._protoWatcher = null;
    this._debounceTimer = null;
    this._retryTimer = null;
    this._isClosed = false;

    // Escaneo inicial para poblar la memoria
    this.refresh({ emitChange: false });

    if (autoStartWatcher) {
      this._startWatchers();
    }
  }

  /**
   * Retorna el snapshot atómico más reciente desde la memoria (O(1))
   * @returns {{ status: Object, state: Object|null, timestamp: number, version: number }}
   */
  getSnapshot() {
    if (!this.cachedSnapshot) {
      this.refresh({ emitChange: false });
    }
    return this.cachedSnapshot;
  }

  /**
   * Retorna el estado resumido de entregables (100% retrocompatible con /api/status)
   */
  getStatus() {
    return this.getSnapshot().status;
  }

  /**
   * Retorna el estado detallado del sistema de diseño (100% retrocompatible con /api/state)
   */
  getState() {
    const snapshot = this.getSnapshot();
    return {
      exists: snapshot.status.stateExists,
      state: snapshot.state,
      error: snapshot.stateError || null
    };
  }

  /**
   * Realiza un escaneo directo de disco y actualiza el snapshot
   */
  refresh({ emitChange = true } = {}) {
    if (this._isClosed) return this.cachedSnapshot;

    const statePath = path.join(this.rootDir, 'design-system-state.json');
    const prototypePath = path.join(this.prototypeDir, 'index.html');

    let stateExists = fs.existsSync(statePath);
    let parsedState = null;
    let stateError = null;

    if (stateExists) {
      try {
        const raw = fs.readFileSync(statePath, 'utf-8');
        const cleanRaw = raw.replace(/^\uFEFF/, '');
        parsedState = JSON.parse(cleanRaw);
      } catch (err) {
        stateError = err.message;
        // Si el archivo está siendo escrito en este instante, programar reintento rápido
        if (!this._retryTimer) {
          this._retryTimer = setTimeout(() => {
            this._retryTimer = null;
            this.refresh({ emitChange: true });
          }, this.retryDelayMs);
        }
      }
    }

    let designSystemFile = null;
    let specFile = null;
    try {
      const files = fs.readdirSync(this.rootDir);
      designSystemFile = files.find(f => f.endsWith('_Design_System.html')) || null;
      specFile = files.find(f => f.endsWith('_Design_System.md')) || null;
    } catch (e) {}

    let prototypeFiles = [];
    try {
      if (fs.existsSync(this.prototypeDir)) {
        prototypeFiles = fs.readdirSync(this.prototypeDir).filter(f => f.endsWith('.html'));
      }
    } catch (e) {}

    const prototypeExists = fs.existsSync(prototypePath);
    const designSystemExists = !!designSystemFile;
    const specExists = !!specFile;

    // Firmas de contenido: permiten a la UI recargar la vista previa cuando el agente reescribe el HTML
    const designSystemVersion = designSystemFile
      ? this._fileSignature(path.join(this.rootDir, designSystemFile))
      : null;
    const prototypeVersion = prototypeExists ? this._prototypeSignature() : null;

    const newSnapshot = {
      status: {
        stateExists,
        designSystemExists,
        designSystemFile,
        designSystemVersion,
        specExists,
        specFile,
        prototypeExists,
        prototypeFiles,
        prototypeVersion
      },
      state: parsedState,
      stateError,
      timestamp: Date.now(),
      version: this.version + 1
    };

    const hasChanged = this._hasSnapshotChanged(this.cachedSnapshot, newSnapshot);

    if (hasChanged || !this.cachedSnapshot) {
      this.version++;
      newSnapshot.version = this.version;
      this.cachedSnapshot = newSnapshot;

      if (emitChange) {
        this.emit('change', this.cachedSnapshot);
      }
    }

    return this.cachedSnapshot;
  }

  /**
   * Firma barata de un archivo (mtime + tamaño); null si no se puede leer
   */
  _fileSignature(filePath) {
    try {
      const st = fs.statSync(filePath);
      return `${Math.round(st.mtimeMs)}-${st.size}`;
    } catch (e) {
      return null;
    }
  }

  /**
   * Firma combinada de los archivos del prototipo (html/css/js)
   */
  _prototypeSignature() {
    try {
      return fs.readdirSync(this.prototypeDir)
        .filter(f => /\.(html|css|js)$/i.test(f))
        .sort()
        .map(f => `${f}:${this._fileSignature(path.join(this.prototypeDir, f))}`)
        .join('|');
    } catch (e) {
      return null;
    }
  }

  /**
   * Compara si hubo cambios significativos entre el snapshot anterior y el nuevo
   */
  _hasSnapshotChanged(oldSnap, newSnap) {
    if (!oldSnap) return true;

    // Cambio en estatus de archivos
    const sOld = oldSnap.status;
    const sNew = newSnap.status;
    if (
      sOld.stateExists !== sNew.stateExists ||
      sOld.designSystemExists !== sNew.designSystemExists ||
      sOld.designSystemFile !== sNew.designSystemFile ||
      sOld.specExists !== sNew.specExists ||
      sOld.specFile !== sNew.specFile ||
      sOld.prototypeExists !== sNew.prototypeExists ||
      (sOld.prototypeFiles || []).length !== (sNew.prototypeFiles || []).length ||
      sOld.designSystemVersion !== sNew.designSystemVersion ||
      sOld.prototypeVersion !== sNew.prototypeVersion
    ) {
      return true;
    }

    // Cambio en el contenido de state JSON (marca, fase, paleta)
    const oldStateStr = oldSnap.state ? JSON.stringify(oldSnap.state) : null;
    const newStateStr = newSnap.state ? JSON.stringify(newSnap.state) : null;
    if (oldStateStr !== newStateStr) {
      return true;
    }

    return false;
  }

  /**
   * Inicia los observadores reactivos en disco con debounce
   */
  _startWatchers() {
    try {
      const rootWatcher = fs.watch(this.rootDir, (eventType, filename) => {
        if (!filename) {
          this._scheduleDebouncedRefresh();
          return;
        }

        const isRelevant =
          filename === 'design-system-state.json' ||
          filename.endsWith('_Design_System.html') ||
          filename.endsWith('_Design_System.md') ||
          filename === 'prototype' ||
          filename.startsWith('design-system-state');

        if (isRelevant) {
          this._scheduleDebouncedRefresh();
        }
      });

      rootWatcher.on('error', (err) => {
        // Un 'error' de EventEmitter sin oyente mataría el proceso (p. ej. EPERM/EBUSY en Windows al
        // borrar o renombrar la carpeta observada): se registra y se vuelve a armar el observador.
        console.warn('[DeliverableStore] Error del watcher de raíz:', err.message);
        try { rootWatcher.close(); } catch (e) {}
        this.watchers = this.watchers.filter(w => w !== rootWatcher);
        this._scheduleWatcherRestart();
      });

      this.watchers.push(rootWatcher);
    } catch (err) {
      console.warn('[DeliverableStore] Aviso al iniciar watcher de raíz:', err.message);
    }

    // Si la carpeta prototype ya existe, observarla directamente
    this._ensurePrototypeWatcher();
  }

  _scheduleWatcherRestart() {
    if (this._isClosed || this._watcherRestartTimer) return;
    this._watcherRestartTimer = setTimeout(() => {
      this._watcherRestartTimer = null;
      if (this._isClosed) return;
      for (const watcher of this.watchers) {
        try { watcher.close(); } catch (e) {}
      }
      this.watchers = [];
      this._protoWatcher = null;
      this._startWatchers();
      this.refresh({ emitChange: true });
    }, 2000);
    if (typeof this._watcherRestartTimer.unref === 'function') this._watcherRestartTimer.unref();
  }

  _ensurePrototypeWatcher() {
    if (this._protoWatcher || !fs.existsSync(this.prototypeDir)) return;
    try {
      const protoWatcher = fs.watch(this.prototypeDir, (eventType, filename) => {
        if (!filename || /\.(html|css|js)$/i.test(filename)) {
          this._scheduleDebouncedRefresh();
        }
      });
      protoWatcher.on('error', () => {});
      this._protoWatcher = protoWatcher;
      this.watchers.push(protoWatcher);
    } catch (e) {}
  }

  _scheduleDebouncedRefresh() {
    if (this._isClosed) return;
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
    }

    this._debounceTimer = setTimeout(() => {
      this._debounceTimer = null;
      // Verificar si prototypeDir se creó recientemente para adjuntar watcher si faltaba
      this._ensurePrototypeWatcher();
      this.refresh({ emitChange: true });
    }, this.debounceMs);
  }

  /**
   * Canaliza reactivamente el flujo de snapshots y actualizaciones hacia un cliente SSE.
   * Emite el snapshot inicial de inmediato y envía actualizaciones subsiguientes ante cambios en disco.
   * Limpia la suscripción cuando el cliente cierra la conexión.
   *
   * @param {import('http').ServerResponse} res - Objeto ServerResponse de Node / Express
   * @returns {DeliverableStore} this
   */
  pipeToSSE(res) {
    if (!res || typeof res.write !== 'function') {
      throw new Error('DeliverableStore.pipeToSSE requiere un objeto ServerResponse válido');
    }

    if (!res.headersSent) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      if (typeof res.flushHeaders === 'function') {
        res.flushHeaders();
      }
    }

    const sendEvent = (event, data) => {
      if (!res.writableEnded && !res.destroyed) {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      }
    };

    // Enviar snapshot inicial inmediatamente
    sendEvent('snapshot', this.getSnapshot());

    // Suscribirse a cambios reactivos
    const onChange = (snapshot) => {
      sendEvent('update', snapshot);
    };
    this.on('change', onChange);

    // Latido: evita que proxies/túneles cierren por inactividad un canal que puede pasar minutos sin eventos
    const heartbeat = setInterval(() => {
      if (!res.writableEnded && !res.destroyed) res.write(': ping\n\n');
    }, 15000);
    if (typeof heartbeat.unref === 'function') heartbeat.unref();

    res.on('close', () => {
      clearInterval(heartbeat);
      this.removeListener('change', onChange);
    });

    return this;
  }

  /**
   * Cambia dinámicamente el directorio raíz y de prototipo observado,
   * reiniciando observadores y emitiendo un snapshot fresco.
   *
   * @param {string} newRootDir
   * @param {string} [newProtoDir]
   * @returns {Object} Snapshot actualizado
   */
  setRootDir(newRootDir, newProtoDir = null) {
    for (const watcher of this.watchers) {
      try { watcher.close(); } catch (e) {}
    }
    this.watchers = [];
    this._protoWatcher = null;

    // Un refresco o reintento pendiente pertenece al directorio anterior
    for (const timer of ['_debounceTimer', '_retryTimer', '_watcherRestartTimer']) {
      if (this[timer]) {
        clearTimeout(this[timer]);
        this[timer] = null;
      }
    }

    this.rootDir = path.resolve(newRootDir);
    this.prototypeDir = newProtoDir ? path.resolve(newProtoDir) : path.join(this.rootDir, 'prototype');

    if (!this._isClosed) {
      this._startWatchers();
    }

    return this.refresh({ emitChange: true });
  }

  /**
   * Cierra limpiamente todos los observadores y temporizadores
   */
  close() {
    this._isClosed = true;

    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
    if (this._retryTimer) {
      clearTimeout(this._retryTimer);
      this._retryTimer = null;
    }
    if (this._watcherRestartTimer) {
      clearTimeout(this._watcherRestartTimer);
      this._watcherRestartTimer = null;
    }

    for (const watcher of this.watchers) {
      try {
        watcher.close();
      } catch (e) {}
    }
    this.watchers = [];
    this._protoWatcher = null;
    this.removeAllListeners();
  }
}

module.exports = DeliverableStore;
