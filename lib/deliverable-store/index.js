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

    let showcaseFile = null;
    let specFile = null;
    try {
      const files = fs.readdirSync(this.rootDir);
      showcaseFile = files.find(f => f.endsWith('_Design_System.html')) || null;
      specFile = files.find(f => f.endsWith('_Design_System.md')) || null;
    } catch (e) {}

    let prototypeFiles = [];
    try {
      if (fs.existsSync(this.prototypeDir)) {
        prototypeFiles = fs.readdirSync(this.prototypeDir).filter(f => f.endsWith('.html'));
      }
    } catch (e) {}

    const prototypeExists = fs.existsSync(prototypePath);
    const showcaseExists = !!showcaseFile;
    const specExists = !!specFile;

    const newSnapshot = {
      status: {
        stateExists,
        showcaseExists,
        showcaseFile,
        specExists,
        specFile,
        prototypeExists,
        prototypeFiles
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
   * Compara si hubo cambios significativos entre el snapshot anterior y el nuevo
   */
  _hasSnapshotChanged(oldSnap, newSnap) {
    if (!oldSnap) return true;

    // Cambio en estatus de archivos
    const sOld = oldSnap.status;
    const sNew = newSnap.status;
    if (
      sOld.stateExists !== sNew.stateExists ||
      sOld.showcaseExists !== sNew.showcaseExists ||
      sOld.showcaseFile !== sNew.showcaseFile ||
      sOld.specExists !== sNew.specExists ||
      sOld.specFile !== sNew.specFile ||
      sOld.prototypeExists !== sNew.prototypeExists ||
      (sOld.prototypeFiles || []).length !== (sNew.prototypeFiles || []).length
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
        this.emit('error', err);
      });

      this.watchers.push(rootWatcher);
    } catch (err) {
      console.warn('[DeliverableStore] Aviso al iniciar watcher de raíz:', err.message);
    }

    // Si la carpeta prototype ya existe, observarla directamente
    this._ensurePrototypeWatcher();
  }

  _ensurePrototypeWatcher() {
    if (fs.existsSync(this.prototypeDir)) {
      try {
        const protoWatcher = fs.watch(this.prototypeDir, (eventType, filename) => {
          if (!filename || filename === 'index.html' || filename.endsWith('.html') || filename.endsWith('.css')) {
            this._scheduleDebouncedRefresh();
          }
        });
        protoWatcher.on('error', () => {});
        this.watchers.push(protoWatcher);
      } catch (e) {}
    }
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
      if (typeof res.flushHeaders === 'function') {
        res.flushHeaders();
      }
    }

    const sendEvent = (event, data) => {
      if (!res.writableEnded) {
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

    res.on('close', () => {
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

    for (const watcher of this.watchers) {
      try {
        watcher.close();
      } catch (e) {}
    }
    this.watchers = [];
    this.removeAllListeners();
  }
}

module.exports = DeliverableStore;
