const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { resolveInvocation, unwrapCmdShim } = require('../lib/agent-engine/adapters/cli-spawn');

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

function runChild(invocation, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(invocation.file, invocation.args, { cwd, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', d => (out += d));
    child.stderr.on('data', d => (err += d));
    child.on('error', reject);
    child.on('close', code => resolve({ code, out, err }));
  });
}

async function runSuite() {
  console.log('\n--- Test Suite: cli-spawn (lanzamiento de CLIs sin shell) ---\n');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-spawn-test-'));
  const savedEnv = { ...process.env };

  console.log('[1] Los argumentos llegan intactos al proceso hijo:');
  await it('should preserve spaces, quotes, newlines, & | > and %VAR% exactly', async () => {
    process.env.CLI_SPAWN_TEST_BIN = process.execPath;
    const nasty = [
      'dame una receta de arepas con queso',
      'hola & echo INJECTED_COMMAND_RAN',
      'contraste >= 7:1 | texto',
      'di "hola" por favor',
      'linea uno\nlinea dos',
      'cuanto es %USERNAME% hoy'
    ];
    const inv = resolveInvocation('node-not-used', ['-e', 'console.log(JSON.stringify(process.argv.slice(1)))', ...nasty], {
      envVar: 'CLI_SPAWN_TEST_BIN'
    });
    const result = await runChild(inv, tmp);
    assert.strictEqual(result.code, 0, result.err);
    assert.deepStrictEqual(JSON.parse(result.out), nasty);
    assert.deepStrictEqual(fs.readdirSync(tmp), [], 'no debe crearse ningún archivo por redirecciones');
  });

  console.log('\n[2] Resolución de ejecutables:');
  await it('should prefer the env override when it points to an existing file', () => {
    process.env.CLI_SPAWN_TEST_BIN = process.execPath;
    const inv = resolveInvocation('whatever', ['a'], { envVar: 'CLI_SPAWN_TEST_BIN' });
    assert.strictEqual(inv.file, process.execPath);
    assert.deepStrictEqual(inv.args, ['a']);
  });

  await it('should use extraPaths before PATH', () => {
    delete process.env.CLI_SPAWN_TEST_BIN;
    const fake = path.join(tmp, 'mytool' + (process.platform === 'win32' ? '.exe' : ''));
    fs.writeFileSync(fake, '');
    const inv = resolveInvocation('mytool', ['x'], { extraPaths: [path.join(tmp, 'nope'), fake] });
    assert.strictEqual(inv.file, fake);
  });

  await it('should find an executable through PATH', () => {
    const dir = path.join(tmp, 'pathdir');
    fs.mkdirSync(dir);
    const fake = path.join(dir, 'pathtool' + (process.platform === 'win32' ? '.exe' : ''));
    fs.writeFileSync(fake, '');
    process.env.PATH = dir + path.delimiter + savedEnv.PATH;
    const inv = resolveInvocation('pathtool', []);
    assert.strictEqual(inv.file, fake);
    process.env.PATH = savedEnv.PATH;
  });

  await it('should return the bare name when nothing is found (spawn will report ENOENT)', () => {
    const inv = resolveInvocation('definitely-not-installed-xyz', ['a', 'b']);
    assert.deepStrictEqual(inv, { file: 'definitely-not-installed-xyz', args: ['a', 'b'] });
  });

  console.log('\n[3] Shims .cmd de npm:');
  await it('should unwrap a shim that launches a native .exe', () => {
    const base = path.join(tmp, 'npm1');
    fs.mkdirSync(path.join(base, 'node_modules', 'pkg', 'bin'), { recursive: true });
    const exe = path.join(base, 'node_modules', 'pkg', 'bin', 'tool.exe');
    fs.writeFileSync(exe, '');
    const shim = path.join(base, 'tool.cmd');
    fs.writeFileSync(shim, '@ECHO off\r\nGOTO start\r\n:start\r\nSETLOCAL\r\nCALL :find_dp0\r\n"%dp0%\\node_modules\\pkg\\bin\\tool.exe"   %*\r\n');
    assert.deepStrictEqual(unwrapCmdShim(shim), { file: exe, prefixArgs: [] });
  });

  await it('should unwrap a shim that launches a JS entry through node', () => {
    const base = path.join(tmp, 'npm2');
    fs.mkdirSync(path.join(base, 'node_modules', 'pkg', 'bin'), { recursive: true });
    const js = path.join(base, 'node_modules', 'pkg', 'bin', 'cli.js');
    fs.writeFileSync(js, '');
    const shim = path.join(base, 'tool.cmd');
    fs.writeFileSync(shim, '@ECHO off\r\nendLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\node_modules\\pkg\\bin\\cli.js" %*\r\n');
    assert.deepStrictEqual(unwrapCmdShim(shim), { file: process.execPath, prefixArgs: [js] });
  });

  await it('should return null when the shim target cannot be determined', () => {
    const shim = path.join(tmp, 'weird.cmd');
    fs.writeFileSync(shim, '@echo off\r\nsome-other-launcher %*\r\n');
    assert.strictEqual(unwrapCmdShim(shim), null);
  });

  if (process.platform === 'win32') {
    await it('should refuse (not fall back to shell) a .cmd that cannot be unwrapped', () => {
      const shim = path.join(tmp, 'opaque.cmd');
      fs.writeFileSync(shim, '@echo off\r\nsome-other-launcher %*\r\n');
      process.env.CLI_SPAWN_TEST_BIN = shim;
      assert.throws(() => resolveInvocation('opaque', ['x'], { envVar: 'CLI_SPAWN_TEST_BIN' }), /forma segura sin shell/);
    });
  }

  process.env = savedEnv;
  fs.rmSync(tmp, { recursive: true, force: true });

  console.log(`\nSummary: ${passedTests}/${totalTests} tests passed.`);
}

runSuite();
