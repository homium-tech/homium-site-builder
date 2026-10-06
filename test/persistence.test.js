const assert = require('assert');
const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');

const Workspace = require('../lib/workspace');
const { Pipeline } = require('../core/pipeline');
const { DeliverableStore } = require('../lib/deliverable-store');

const TEST_DIR = path.join(__dirname, 'scratch_test_persistence');

function cleanup() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

async function runTests() {
  cleanup();
  fs.mkdirSync(TEST_DIR, { recursive: true });

  console.log('\n--- Test Suite: Chat & State Persistence Across Reloads ---');

  try {
    const workspace = new Workspace({ baseDir: TEST_DIR });
    const pipeline = new Pipeline();

    // 1. Initial empty state: no project
    console.log('\n[1] Initial State (Sin Proyecto):');
    assert.strictEqual(workspace.hasProject(), false);
    assert.strictEqual(workspace.getProjectName(), null);
    console.log('  ✓ No active project initially');

    // 2. Project creation and chat messages persistence
    console.log('\n[2] Project Creation and Message History Persistence:');
    workspace.setProject('acmecorp');
    assert.strictEqual(workspace.hasProject(), true);
    assert.strictEqual(workspace.getProjectName(), 'acmecorp');

    const projectDir = workspace.getDir();
    assert.strictEqual(fs.existsSync(projectDir), true);

    // Save user message
    workspace.addChatMessage({
      role: 'user',
      content: 'Hola, mi marca es AcmeCorp y vendo herramientas espaciales',
      timestamp: 1000
    });

    let history = workspace.getChatHistory();
    assert.strictEqual(history.messages.length, 1);
    assert.strictEqual(history.messages[0].role, 'user');
    assert.strictEqual(history.messages[0].content, 'Hola, mi marca es AcmeCorp y vendo herramientas espaciales');

    // Save assistant message with action
    const gate1 = pipeline.getGate('gate-1');
    workspace.addChatMessage({
      role: 'assistant',
      content: 'Design System generado con éxito. ¿Aprobamos para pasar a la Fase 5?',
      action: gate1,
      timestamp: 2000
    });

    history = workspace.getChatHistory();
    assert.strictEqual(history.messages.length, 2);
    assert.strictEqual(history.lastAssistantMessage.content, 'Design System generado con éxito. ¿Aprobamos para pasar a la Fase 5?');
    assert.deepStrictEqual(history.lastAction.stepId, 'gate-1');
    console.log('  ✓ User and assistant messages with actions persist to chat_history.json');

    // Verify disk file
    const historyFile = workspace.getChatHistoryPath();
    assert.strictEqual(fs.existsSync(historyFile), true);
    const diskContent = JSON.parse(fs.readFileSync(historyFile, 'utf-8'));
    assert.strictEqual(diskContent.messages.length, 2);
    console.log('  ✓ chat_history.json is valid JSON on disk');

    // 3. New Workspace instance reloads project from .active_project
    console.log('\n[3] Reload / Reconnection from Disk (.active_project):');
    const reloadedWorkspace = new Workspace({ baseDir: TEST_DIR });
    assert.strictEqual(reloadedWorkspace.hasProject(), true);
    assert.strictEqual(reloadedWorkspace.getProjectName(), 'acmecorp');

    const reloadedHistory = reloadedWorkspace.getChatHistory();
    assert.strictEqual(reloadedHistory.messages.length, 2);
    assert.strictEqual(reloadedHistory.lastAction.stepId, 'gate-1');
    console.log('  ✓ Reloaded workspace recovers active project and chat history seamlessly');

    // 4. Synthetic history generation when state exists without chat_history.json
    console.log('\n[4] Synthetic History from design-system-state.json:');
    // Remove chat_history.json
    fs.unlinkSync(historyFile);
    assert.strictEqual(fs.existsSync(historyFile), false);

    // Create design-system-state.json for phase 4
    const stateFile = path.join(projectDir, 'design-system-state.json');
    fs.writeFileSync(stateFile, JSON.stringify({
      brand: { name: 'AcmeCorp' },
      current_phase: 4,
      current_stage: 'gate_1',
      allowed_hexes: ['#00FFFF', '#FF0055']
    }, null, 2), 'utf-8');

    const synthHistory = workspace.getChatHistory();
    assert.strictEqual(synthHistory.currentPhase, 4);
    assert.strictEqual(synthHistory.messages.length, 1);
    assert.strictEqual(synthHistory.messages[0].role, 'assistant');
    assert.match(synthHistory.messages[0].content, /\*\*Design System\*\*/);
    console.log('  ✓ Automatically synthesized Phase 4 history and Gate 1 context');

    // 5. Reset project clears active project and state
    console.log('\n[5] Clean Reset on Demand:');
    workspace.resetProject();
    assert.strictEqual(workspace.hasProject(), false);
    assert.strictEqual(workspace.getProjectName(), null);
    assert.strictEqual(fs.existsSync(path.join(TEST_DIR, '.active_project')), false);
    console.log('  ✓ Reset cleans active project state');

    console.log('\n========================================');
    console.log('Summary: All 5 persistence test suites passed.');
    console.log('========================================\n');
  } finally {
    cleanup();
  }
}

runTests().catch(err => {
  console.error('\nTest failed with error:', err);
  cleanup();
  process.exit(1);
});
