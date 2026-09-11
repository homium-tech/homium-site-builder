const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const Workspace = require('../lib/workspace');

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
  console.log('\n--- Test Suite: Workspace Deep Module ---\n');

  const testTempDir = path.join(os.tmpdir(), `homium-workspace-test-${Date.now()}`);

  console.log('[1] Creación y Confinamiento Base:');
  it('should initialize and guarantee base directory existence', () => {
    const ws = new Workspace({ baseDir: testTempDir });
    assert.strictEqual(ws.getBaseDir(), path.resolve(testTempDir));
    assert(fs.existsSync(testTempDir), 'Base directory should exist on disk');
    assert.strictEqual(ws.hasProject(), false);
  });

  it('should return correct info payload', () => {
    const ws = new Workspace({ baseDir: testTempDir });
    const info = ws.getInfo();
    assert.strictEqual(info.baseDir, path.resolve(testTempDir));
    assert.strictEqual(info.hasProject, false);
    assert.strictEqual(info.exists, true);
  });

  console.log('\n[2] Extracción Inteligente y Creación de Subcarpetas de Proyecto:');
  it('should extract project names from various conversational patterns', () => {
    assert.strictEqual(Workspace.extractProjectName('Lumina'), 'lumina');
    assert.strictEqual(Workspace.extractProjectName('Acme Corp'), 'acme-corp');
    assert.strictEqual(Workspace.extractProjectName('SaaS Lumina'), 'lumina');
    assert.strictEqual(Workspace.extractProjectName('URL Linear'), 'linear');
    assert.strictEqual(Workspace.extractProjectName('https://linear.app/features'), 'linear');
    assert.strictEqual(Workspace.extractProjectName('Quiero crear una marca llamada CyberTech para finanzas'), 'cybertech');
    assert.strictEqual(Workspace.extractProjectName('Mi empresa se llama BioHealth'), 'biohealth');
  });

  it('should create project subfolder on setProject and emit projectChanged', () => {
    const ws = new Workspace({ baseDir: testTempDir });
    let emitted = null;
    ws.on('projectChanged', (data) => {
      emitted = data;
    });

    const projectDir = ws.setProject('Lumina');
    const expectedDir = path.join(path.resolve(testTempDir), 'lumina');

    assert.strictEqual(projectDir, expectedDir);
    assert.strictEqual(ws.getDir(), expectedDir);
    assert.strictEqual(ws.hasProject(), true);
    assert.strictEqual(ws.getProjectName(), 'lumina');
    assert(fs.existsSync(expectedDir), 'Project subfolder must exist on disk');
    assert.strictEqual(ws.getPrototypeDir(), path.join(expectedDir, 'prototype'));
    assert(emitted !== null, 'Should emit projectChanged event');
    assert.strictEqual(emitted.projectName, 'lumina');
  });

  it('should reset project subfolder cleanly on resetProject', () => {
    const ws = new Workspace({ baseDir: testTempDir, projectName: 'alpha' });
    assert.strictEqual(ws.hasProject(), true);

    ws.resetProject();
    assert.strictEqual(ws.hasProject(), false);
    assert.strictEqual(ws.getDir(), path.resolve(testTempDir));
    assert.strictEqual(ws.getProjectName(), null);
  });

  console.log('\n[3] Operaciones de Archivos y Metadatos en Subcarpeta:');
  it('should list files within active project subfolder', () => {
    const ws = new Workspace({ baseDir: testTempDir, projectName: 'lumina' });
    const sampleFile = path.join(ws.getDir(), 'test-file.txt');
    fs.writeFileSync(sampleFile, 'Hello Homium Workspace', 'utf-8');

    const result = ws.listFiles();
    assert.strictEqual(result.ok, true);
    assert(Array.isArray(result.files), 'Files should be an array');
    const found = result.files.find(f => f.name === 'test-file.txt');
    assert(found, 'Should find test-file.txt in list');
    assert.strictEqual(found.isDirectory, false);
    assert(found.size > 0, 'Size should be > 0');
  });

  it('should check file existence correctly in project directory', () => {
    const ws = new Workspace({ baseDir: testTempDir, projectName: 'lumina' });
    assert.strictEqual(ws.exists('test-file.txt'), true);
    assert.strictEqual(ws.exists('non-existent.txt'), false);
  });

  console.log('\n[4] Respaldo Atómico de Estado:');
  it('should backup design-system-state.json and return backup path', () => {
    const ws = new Workspace({ baseDir: testTempDir, projectName: 'lumina' });
    const stateFile = path.join(ws.getDir(), 'design-system-state.json');
    fs.writeFileSync(stateFile, JSON.stringify({ brand: 'TestBrand' }), 'utf-8');

    assert.strictEqual(ws.exists('design-system-state.json'), true);
    const backupPath = ws.backupState();
    assert(backupPath, 'Backup path should be returned');
    assert(fs.existsSync(backupPath), 'Backup file should exist');
    assert.strictEqual(ws.exists('design-system-state.json'), false);
  });

  it('should return null when backupState is called without existing state file', () => {
    const ws = new Workspace({ baseDir: testTempDir });
    const backupPath = ws.backupState();
    assert.strictEqual(backupPath, null);
  });

  // Limpieza de directorio temporal
  try {
    fs.rmSync(testTempDir, { recursive: true, force: true });
  } catch {}

  console.log(`\n========================================`);
  console.log(`Summary: ${passedTests}/${totalTests} tests passed.`);
  console.log(`========================================\n`);
}

runSuite();
