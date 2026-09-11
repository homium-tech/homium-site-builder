const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const DeliverableStore = require('../lib/deliverable-store');

let passedTests = 0;
let totalTests = 0;

function it(desc, fn) {
  totalTests++;
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result.then(() => {
        passedTests++;
        console.log(`  ✓ ${desc}`);
      }).catch((err) => {
        console.error(`  ✗ ${desc}`);
        console.error(err);
        process.exitCode = 1;
      });
    }
    passedTests++;
    console.log(`  ✓ ${desc}`);
  } catch (err) {
    console.error(`  ✗ ${desc}`);
    console.error(err);
    process.exitCode = 1;
  }
}

async function runSuite() {
  console.log('\n--- Test Suite: DeliverableStore Reactive Subsystem ---\n');

  // Crear directorio temporal aislado para pruebas
  const testTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deliverable-store-test-'));
  const testProtoDir = path.join(testTmpDir, 'prototype');

  console.log('[1] Estado Inicial y Métodos O(1):');
  it('should initialize with empty state when files do not exist', () => {
    const store = new DeliverableStore({
      rootDir: testTmpDir,
      prototypeDir: testProtoDir,
      autoStartWatcher: false
    });

    const snapshot = store.getSnapshot();
    assert.strictEqual(snapshot.status.stateExists, false);
    assert.strictEqual(snapshot.status.showcaseExists, false);
    assert.strictEqual(snapshot.status.prototypeExists, false);
    assert.strictEqual(snapshot.state, null);

    // Compatibilidad retroactiva
    const status = store.getStatus();
    assert.strictEqual(status.stateExists, false);

    const state = store.getState();
    assert.strictEqual(state.exists, false);
    assert.strictEqual(state.state, null);

    store.close();
  });

  console.log('\n[2] Detección Reactiva de Archivos:');
  await it('should emit change event when design-system-state.json is created', async () => {
    const store = new DeliverableStore({
      rootDir: testTmpDir,
      prototypeDir: testProtoDir,
      debounceMs: 50,
      autoStartWatcher: true
    });

    const testState = {
      brand: { name: 'Acme Corp', purpose: 'Hardware' },
      palette: { allowed_hexes: ['#111111', '#00ffff'] }
    };

    const changePromise = new Promise((resolve) => {
      store.on('change', (snapshot) => {
        if (snapshot.status.stateExists && snapshot.state && snapshot.state.brand) {
          resolve(snapshot);
        }
      });
    });

    const stateFilePath = path.join(testTmpDir, 'design-system-state.json');
    fs.writeFileSync(stateFilePath, JSON.stringify(testState, null, 2));

    const snapshot = await changePromise;
    assert.strictEqual(snapshot.status.stateExists, true);
    assert.strictEqual(snapshot.state.brand.name, 'Acme Corp');
    assert.deepStrictEqual(snapshot.state.palette.allowed_hexes, ['#111111', '#00ffff']);

    store.close();
  });

  console.log('\n[3] Debounce ante Ráfagas de Escrituras:');
  await it('should debounce multiple rapid file writes into a single update', async () => {
    const store = new DeliverableStore({
      rootDir: testTmpDir,
      prototypeDir: testProtoDir,
      debounceMs: 80,
      autoStartWatcher: true
    });

    let eventCount = 0;
    store.on('change', () => {
      eventCount++;
    });

    const stateFilePath = path.join(testTmpDir, 'design-system-state.json');

    // Realizar 4 escrituras rápidas
    for (let i = 1; i <= 4; i++) {
      fs.writeFileSync(stateFilePath, JSON.stringify({ count: i }));
      await new Promise(r => setTimeout(r, 10));
    }

    // Esperar a que pase el tiempo de debounce
    await new Promise(r => setTimeout(r, 150));

    // Debounce debe consolidar las ráfagas
    assert(eventCount <= 2, `Expected at most 2 debounced events, got ${eventCount}`);
    const latest = store.getSnapshot();
    assert.strictEqual(latest.state.count, 4);

    store.close();
  });

  console.log('\n[4] Tolerancia y Reintento ante JSON Transitorio:');
  await it('should handle partially written or malformed JSON without crashing', async () => {
    const store = new DeliverableStore({
      rootDir: testTmpDir,
      prototypeDir: testProtoDir,
      debounceMs: 30,
      retryDelayMs: 40,
      autoStartWatcher: true
    });

    const stateFilePath = path.join(testTmpDir, 'design-system-state.json');

    // Escribir JSON corrupto / a medio escribir
    fs.writeFileSync(stateFilePath, '{"brand": {"name": "Incompleto');
    store.refresh({ emitChange: false });

    const errorSnap = store.getSnapshot();
    assert(errorSnap.stateError !== null, 'Should capture syntax error gracefully');

    // Corregir a JSON válido
    fs.writeFileSync(stateFilePath, JSON.stringify({ brand: { name: 'Recuperado' } }));

    await new Promise((resolve) => {
      store.on('change', (snap) => {
        if (snap.state && snap.state.brand && snap.state.brand.name === 'Recuperado') {
          resolve();
        }
      });
    });

    const recovered = store.getSnapshot();
    assert.strictEqual(recovered.state.brand.name, 'Recuperado');
    assert.strictEqual(recovered.stateError, null);

    // Test tolerancia a UTF-8 BOM
    const bomBuffer = Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from(JSON.stringify({ brand: { name: 'BOM Tolerant' } }))]);
    fs.writeFileSync(stateFilePath, bomBuffer);
    store.refresh({ emitChange: false });

    const bomSnap = store.getSnapshot();
    assert.strictEqual(bomSnap.stateError, null, 'Should not throw SyntaxError on UTF-8 BOM');
    assert.strictEqual(bomSnap.state.brand.name, 'BOM Tolerant');

    store.close();
  });

  console.log('\n[5] Detección de Showcase y Prototipo HTML:');
  await it('should detect showcase and prototype file additions', async () => {
    const store = new DeliverableStore({
      rootDir: testTmpDir,
      prototypeDir: testProtoDir,
      debounceMs: 50,
      autoStartWatcher: true
    });

    // 1. Crear Showcase
    const showcasePath = path.join(testTmpDir, 'Acme_Design_System.html');
    fs.writeFileSync(showcasePath, '<html>Showcase</html>');

    // 2. Crear Prototype
    fs.mkdirSync(testProtoDir, { recursive: true });
    const protoPath = path.join(testProtoDir, 'index.html');
    fs.writeFileSync(protoPath, '<html>Prototype</html>');

    await new Promise(r => setTimeout(r, 120));

    const status = store.getStatus();
    assert.strictEqual(status.showcaseExists, true);
    assert.strictEqual(status.showcaseFile, 'Acme_Design_System.html');
    assert.strictEqual(status.prototypeExists, true);

    store.close();
  });

  console.log('\n[6] Cierre Limpio de Watchers:');
  it('should cleanly close watchers and stop listening', () => {
    const store = new DeliverableStore({
      rootDir: testTmpDir,
      prototypeDir: testProtoDir,
      autoStartWatcher: true
    });

    store.close();
    assert.strictEqual(store.watchers.length, 0);
    assert.strictEqual(store.listenerCount('change'), 0);
  });

  console.log('\n[7] Canal SSE pipeToSSE y Snapshot Consolidado:');
  it('should pipe snapshot to SSE response with headers and handle disconnects', () => {
    const store = new DeliverableStore({
      rootDir: testTmpDir,
      prototypeDir: testProtoDir,
      autoStartWatcher: false
    });

    const headers = {};
    const written = [];
    let closeCb = null;

    const mockRes = {
      headersSent: false,
      writableEnded: false,
      setHeader: (k, v) => { headers[k] = v; },
      flushHeaders: () => {},
      write: (data) => { written.push(data); },
      on: (evt, cb) => {
        if (evt === 'close') closeCb = cb;
      }
    };

    store.pipeToSSE(mockRes);

    assert.strictEqual(headers['Content-Type'], 'text/event-stream');
    assert.strictEqual(headers['Cache-Control'], 'no-cache');
    assert.strictEqual(headers['Connection'], 'keep-alive');
    assert(written.length > 0);
    assert(written[0].startsWith('event: snapshot\ndata: '));

    const initialSnapshot = JSON.parse(written[0].replace('event: snapshot\ndata: ', '').trim());
    assert(initialSnapshot.status !== undefined);
    assert(initialSnapshot.version !== undefined);
    assert(initialSnapshot.timestamp !== undefined);

    // Verificar que el listener se limpia al cerrar
    assert.strictEqual(store.listenerCount('change'), 1);
    assert(typeof closeCb === 'function');
    closeCb();
    assert.strictEqual(store.listenerCount('change'), 0);

    store.close();
  });

  // Limpieza de fixture temporal
  try {
    fs.rmSync(testTmpDir, { recursive: true, force: true });
  } catch (e) {}

  console.log(`\n========================================`);
  console.log(`Summary: ${passedTests}/${totalTests} tests passed.`);
  console.log(`========================================\n`);

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runSuite();
