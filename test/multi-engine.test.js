const assert = require('assert');
const { PhaseRegistry } = require('../core/pipeline/phase-registry');
const { PhaseDescriptors } = require('../core/prompts/phase-descriptors');
const { buildActivationPrompt, SYSTEM_DIRECTIVES } = require('../core/prompts/system-rules');
const { AgentEngine } = require('../lib/agent-engine');
const CodexAdapter = require('../lib/agent-engine/adapters/codex-adapter');
const OpenCodeAdapter = require('../lib/agent-engine/adapters/opencode-adapter');
const LlamaCppAdapter = require('../lib/agent-engine/adapters/llamacpp-adapter');
const OllamaAdapter = require('../lib/agent-engine/adapters/ollama-adapter');

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
  console.log('\n--- Test Suite: Multi-Engine & Autonomous Core Subsystem ---\n');

  // 1. PhaseRegistry Tests
  console.log('[1] PhaseRegistry (Pipeline Extensible de 5 a 11 fases):');
  it('should initialize with canonical 5 phases by default', () => {
    const registry = new PhaseRegistry();
    const active = registry.getActivePhases();
    assert.strictEqual(active.length, 5);
    assert.strictEqual(active[0].slug, 'discovery');
    assert.strictEqual(active[4].slug, 'prototype');
    assert.strictEqual(active[3].approvalGate, true); // Phase 4 has gate
  });

  it('should strictly maintain 5 canonical phases and refuse external phase 6 expansion', () => {
    const registry = new PhaseRegistry();
    const phases = registry.enableAdvancedPhases(true);
    assert.strictEqual(phases.length, 5);
    assert.strictEqual(registry.getActivePhases().length, 5);
    assert.strictEqual(registry.getPhaseById(6), null);
    assert.strictEqual(registry.getPhaseBySlug('stack-scaffolding'), null);

    // Volver a 5 fases canónicas
    const collapsed = registry.enableAdvancedPhases(false);
    assert.strictEqual(collapsed.length, 5);
  });

  // 2. PhaseDescriptors Pattern Matching Tests
  console.log('\n[2] PhaseDescriptors (Acciones Interactivas y Compuertas):');
  it('should detect Step 1.3 on business model queries', () => {
    const prompt = '¿Cuál es el modelo de negocio de tu marca o empresa?';
    const action = PhaseDescriptors.detectAction(prompt);
    assert(action !== null, 'Should detect Step 1.3');
    assert.strictEqual(action.stepId, '1.3');
    assert.strictEqual(action.type, 'chips');
    assert.strictEqual(action.options.length, 6, 'Should include 5 presets + 1 custom option');
  });

  it('should detect Step 1.4 on logo questions', () => {
    const prompt = '¿Cuentas con un logo existente o deseas generar un isotipo?';
    const action = PhaseDescriptors.detectAction(prompt);
    assert(action !== null);
    assert.strictEqual(action.stepId, '1.4');
  });

  it('should detect Step 1.5.b on fidelity mode questions', () => {
    const prompt = 'Paso 1.5.b de 3: ¿Qué nivel de fidelidad deseas aplicar? [Fidelidad Arquitectónica Total] o Inspiración?';
    const action = PhaseDescriptors.detectAction(prompt);
    assert(action !== null);
    assert.strictEqual(action.stepId, '1.5.b');
    assert.strictEqual(action.type, 'cards');
  });

  it('should detect Approval Gate 1 on validation sign-off prompts', () => {
    const prompt = 'El Showcase está listo. ¿Apruebas el Design System para proceder con la Fase 5?';
    const action = PhaseDescriptors.detectAction(prompt);
    assert(action !== null);
    assert.strictEqual(action.stepId, 'gate-1');
    assert.strictEqual(action.type, 'gate');
  });

  // 3. SystemRules & Canonical Prompts
  console.log('\n[3] SystemRules (Autonomía de Directivas):');
  it('should build canonical activation prompt with Single-Question Rule and Fast-Track', () => {
    const prompt = buildActivationPrompt('Hola quiero empezar');
    assert(prompt.includes('Single-Question Rule'));
    assert(prompt.includes('Fast-Track'));
    assert(prompt.includes('WCAG 2.2 AAA'));
    assert(prompt.includes('Hola quiero empezar'));
  });

  // 4. Multi-Engine Adapters
  console.log('\n[4] Adaptadores Multi-Motor (Codex, OpenCode, Llama.cpp, Ollama):');
  it('CodexAdapter should generate proper codex exec command', () => {
    const adapter = new CodexAdapter();
    const cmd = adapter.buildCommandAndArgs({ prompt: 'Test codex prompt' });
    assert.strictEqual(cmd.command, 'codex');
    assert.deepStrictEqual(cmd.args, ['exec', 'Test codex prompt']);
  });

  it('OpenCodeAdapter should generate proper opencode run --auto command', () => {
    const adapter = new OpenCodeAdapter();
    const cmd = adapter.buildCommandAndArgs({ prompt: 'Test opencode prompt' });
    assert.strictEqual(cmd.command, 'opencode');
    assert.deepStrictEqual(cmd.args, ['run', '--auto', '--format', 'json', 'Test opencode prompt']);
  });

  it('LlamaCppAdapter should configure HTTP URL and parameters', () => {
    const adapter = new LlamaCppAdapter({ host: 'http://127.0.0.1:8080', model: 'qwen' });
    const cmd = adapter.buildCommandAndArgs({ prompt: 'Test llama.cpp prompt' });
    assert.strictEqual(cmd.command, 'http-post');
    assert(cmd.args[0].includes(':8080/v1/chat/completions'));
  });

  it('OllamaAdapter should configure HTTP URL and parameters', () => {
    const adapter = new OllamaAdapter({ host: 'http://127.0.0.1:11434', model: 'llama3' });
    const cmd = adapter.buildCommandAndArgs({ prompt: 'Test ollama prompt' });
    assert.strictEqual(cmd.command, 'http-post');
    assert(cmd.args[0].includes(':11434/api/chat'));
  });

  it('AgentEngine should have all 7 adapters registered and available', () => {
    const engine = new AgentEngine();
    assert(engine.getAdapter('claude') !== undefined, 'claude');
    assert(engine.getAdapter('agy') !== undefined, 'agy');
    assert(engine.getAdapter('codex') !== undefined, 'codex');
    assert(engine.getAdapter('opencode') !== undefined, 'opencode');
    assert(engine.getAdapter('llamacpp') !== undefined, 'llamacpp');
    assert(engine.getAdapter('ollama') !== undefined, 'ollama');
    assert(engine.getAdapter('mock') !== undefined, 'mock');
  });

  console.log(`\n========================================`);
  console.log(`Summary: ${passedTests}/${totalTests} tests passed.`);
  console.log(`========================================\n`);

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runSuite();
