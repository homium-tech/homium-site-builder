const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Workspace = require('../lib/workspace');
const SessionStore = require('../lib/agent-engine/session-store');

let passedTests = 0;
let totalTests = 0;

async function it(desc, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✓ ${desc}`);
  } catch (err) {
    console.error(`  ✗ ${desc}`);
    console.error(err);
    process.exitCode = 1;
  }
}

function newWorkspace(tmp, name = 'acme') {
  const ws = new Workspace({ baseDir: tmp });
  ws.setProject(name);
  return ws;
}

async function runSuite() {
  console.log('\n--- Test Suite: Durabilidad del historial y sesiones ---\n');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'history-durability-'));
  let counter = 0;
  const freshBase = () => fs.mkdtempSync(path.join(tmp, `case-${counter++}-`));

  console.log('[1] chat_history.json:');
  await it('should write atomically without leaving temp files behind', () => {
    const ws = newWorkspace(freshBase());
    ws.addChatMessage({ role: 'user', content: 'hola' });
    ws.addChatMessage({ role: 'assistant', content: 'respuesta' });
    const leftovers = fs.readdirSync(ws.getDir()).filter(f => f.endsWith('.tmp'));
    assert.deepStrictEqual(leftovers, []);
    const history = JSON.parse(fs.readFileSync(ws.getChatHistoryPath(), 'utf-8'));
    assert.strictEqual(history.messages.length, 2);
  });

  await it('should quarantine a corrupt history instead of silently overwriting it', () => {
    const ws = newWorkspace(freshBase());
    fs.writeFileSync(ws.getChatHistoryPath(), '{"messages": [ {"role": "user", "con', 'utf-8');
    ws.addChatMessage({ role: 'user', content: 'nuevo' });

    const files = fs.readdirSync(ws.getDir());
    const quarantined = files.filter(f => /^chat_history\.corrupt-\d+\.json$/.test(f));
    assert.strictEqual(quarantined.length, 1, 'the corrupt file must be kept for recovery');
    assert(fs.readFileSync(path.join(ws.getDir(), quarantined[0]), 'utf-8').includes('"con'));
    const history = JSON.parse(fs.readFileSync(ws.getChatHistoryPath(), 'utf-8'));
    assert.strictEqual(history.messages.length, 1);
  });

  await it('should quarantine a corrupt history when reading it too', () => {
    const ws = newWorkspace(freshBase());
    fs.writeFileSync(ws.getChatHistoryPath(), 'no es json', 'utf-8');
    const history = ws.getChatHistory();
    assert.deepStrictEqual(history.messages, []);
    assert(fs.readdirSync(ws.getDir()).some(f => f.startsWith('chat_history.corrupt-')));
  });

  await it('should cap the stored history to the most recent 500 messages', () => {
    const ws = newWorkspace(freshBase());
    for (let i = 0; i < 510; i++) {
      ws.addChatMessage({ role: i % 2 ? 'assistant' : 'user', content: `mensaje ${i}` });
    }
    const history = JSON.parse(fs.readFileSync(ws.getChatHistoryPath(), 'utf-8'));
    assert.strictEqual(history.messages.length, 500);
    assert.strictEqual(history.messages[499].content, 'mensaje 509');
    assert.strictEqual(history.messages[0].content, 'mensaje 10');
  });

  await it('should persist a reply into the project captured at turn start, not the current one', () => {
    const base = freshBase();
    const ws = newWorkspace(base, 'acme');
    const target = ws.snapshot();
    ws.setProject('otra-marca');

    ws.addChatMessage({ role: 'assistant', content: 'respuesta tardía' }, target);

    const acme = JSON.parse(fs.readFileSync(path.join(base, 'acme', 'chat_history.json'), 'utf-8'));
    assert.strictEqual(acme.messages[0].content, 'respuesta tardía');
    assert(!fs.existsSync(path.join(base, 'otra-marca', 'chat_history.json')), 'must not leak into the new project');
  });

  console.log('\n[2] Proyecto activo:');
  await it('should cap project slugs to 60 characters', () => {
    const slug = Workspace.slugify('a'.repeat(200));
    assert.strictEqual(slug.length, 60);
    assert(!slug.endsWith('-'));
    assert.strictEqual(Workspace.slugify('Acme Corp'), 'acme-corp');
  });

  await it('should roll back the active project if its folder cannot be created', () => {
    const base = freshBase();
    const ws = newWorkspace(base, 'acme');
    // Un archivo con el nombre del proyecto nuevo impide crear la carpeta
    fs.writeFileSync(path.join(base, 'bloqueado'), 'x', 'utf-8');
    assert.throws(() => ws.setProject('bloqueado'));
    assert.strictEqual(ws.getProjectName(), 'acme');
    assert.strictEqual(ws.getDir(), path.join(base, 'acme'));
  });

  console.log('\n[3] SessionStore:');
  await it('should evict idle sessions but keep active and executing ones', () => {
    const store = new SessionStore({ idleTtlMs: 1000 });
    const idle = store.getOrCreate('idle', 'claude');
    const busy = store.getOrCreate('busy', 'claude');
    const fresh = store.getOrCreate('fresh', 'claude');
    idle.lastActiveAt = Date.now() - 5000;
    busy.lastActiveAt = Date.now() - 5000;
    busy.isExecuting = true;
    fresh.lastActiveAt = Date.now();

    assert.strictEqual(store.evictIdle(), 1);
    assert.strictEqual(store.has('idle'), false);
    assert.strictEqual(store.has('busy'), true);
    assert.strictEqual(store.has('fresh'), true);
  });

  fs.rmSync(tmp, { recursive: true, force: true });

  console.log(`\n========================================`);
  console.log(`Summary: ${passedTests}/${totalTests} tests passed.`);
  console.log(`========================================\n`);

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runSuite();
