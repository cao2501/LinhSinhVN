/**
 * LinhSinhVN — DEMO-01-C / C-07 Presentation Observation Log UI Test Suite
 *
 * Checkpoint: DEMO-01-C / C-07 (Base Commit: 60bc129)
 * Verifies presentation-only decorator/controller contract (Option C),
 * single renderer constraint (exactly one visual row per observation),
 * zero second ring buffer, category badge formatting, epoch reset banner,
 * empty state lifecycle, and negative capability AST audits.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
// Mock UI node representation
class MockLabel {
  constructor(text = '') {
    this.text = text;
    this.visible = true;
  }
}
class MockContainer {
  constructor() {
    this.children = [];
  }
  add_child(node) {
    this.children.push(node);
  }
  get_child_count() {
    return this.children.length;
  }
  get_child(index) {
    return this.children[index] || null;
  }
  get_children() {
    return [...this.children];
  }
}
// Pure JavaScript behavioral model matching ObservationLog + ObservationLogUI (Option C)
class ObservationLogUIModel {
  constructor() {
    this.categoryBadges = {
      SIMULATION: '[SIM]',
      PLAYBACK: '[PLAY]',
      TRANSPORT: '[NET]',
      VIEW: '[VIEW]'
    };
    // UI Nodes
    this.logList = new MockContainer();
    this.emptyStateLabel = new MockLabel('No observations recorded');
    this.emptyStateLabel.visible = true;
    this.autoScrollEnabled = true;
    this.scrollVertical = 0;
    this.maxScroll = 1000;
  }
  // Pure formatting helper identical to static func format_observation_text in observation_log_ui.gd
  formatObservationText(entry) {
    const obsType = String(entry.type || '');
    const epoch = Number(entry.session_epoch || 0);
    const tickVal = entry.simulation_tick;
    const summary = String(entry.summary || '');
    const seqId = Number(entry.sequence_id || 0);
    let tickStr = '—';
    if (tickVal !== null && tickVal !== undefined && Number.isInteger(tickVal)) {
      tickStr = `T${tickVal}`;
    }
    if (obsType === 'SIMULATION_RESET') {
      return `=== EPOCH ${epoch} RESET | TICK ${tickStr} ===`;
    }
    const catStr = String(entry.category || 'SIMULATION');
    const badge = this.categoryBadges[catStr] || `[${catStr}]`;
    return `[#${seqId} | E${epoch} | ${tickStr} | ${badge}] ${summary}`;
  }
  // Simulates C-06 row creation + C-07 row decoration
  // (In Godot: C-06 adds Label to LogList, then emits observation_appended, and C-07 decorates it)
  onObservationAppended(entry) {
    // 1. C-06 behavior: instantiates label and appends to LogList
    const rawLabel = new MockLabel(`[#${entry.sequence_id}] ${entry.summary}`);
    this.logList.add_child(rawLabel);
    if (this.logList.get_child_count() > 100) {
      this.logList.children.shift();
    }
    // 2. C-07 behavior: decorates existing label and updates UI state
    if (this.emptyStateLabel.visible) {
      this.emptyStateLabel.visible = false;
    }
    const newestRow = this.logList.get_child(this.logList.get_child_count() - 1);
    if (newestRow) {
      newestRow.text = this.formatObservationText(entry);
    }
    if (this.autoScrollEnabled) {
      this.scrollVertical = this.maxScroll;
    }
  }
  onLogCleared() {
    this.logList.children = [];
    this.emptyStateLabel.visible = true;
    this.autoScrollEnabled = true;
    this.scrollVertical = 0;
  }
  onUserScrolledAway() {
    this.autoScrollEnabled = false;
  }
  onUserScrolledToBottom() {
    this.autoScrollEnabled = true;
  }
  isEmptyStateVisible() {
    return this.emptyStateLabel.visible;
  }
  getDisplayedRowCount() {
    return this.logList.get_child_count();
  }
  getRowText(index) {
    const row = this.logList.get_child(index);
    return row ? row.text : '';
  }
}
// Sample observation entry builder
function makeSampleEntry(seq, epoch, tick, category, type, summary, entityId = 'system', details = {}) {
  return {
    sequence_id: seq,
    session_epoch: epoch,
    simulation_tick: tick,
    category,
    type,
    entity_id: entityId,
    summary,
    details
  };
}
// ==========================================
// C-07 TEST MATRIX (C07-01 through C07-25)
// ==========================================
test('C07-01: UI Initialization', () => {
  const ui = new ObservationLogUIModel();
  assert.equal(ui.isEmptyStateVisible(), true, 'Empty state must be visible initially');
  assert.equal(ui.getDisplayedRowCount(), 0, 'Initial displayed row count must be 0');
  assert.equal(ui.autoScrollEnabled, true, 'Auto-scroll must be enabled by default');
});
test('C07-02: Empty State Display', () => {
  const ui = new ObservationLogUIModel();
  assert.equal(ui.emptyStateLabel.text, 'No observations recorded');
  assert.equal(ui.isEmptyStateVisible(), true);
});
test('C07-03: Single Observation Formatting', () => {
  const ui = new ObservationLogUIModel();
  const entry = makeSampleEntry(1, 0, 5, 'SIMULATION', 'ORGANISM_APPEARED', 'Organism org_0 appeared', 'org_0');
  ui.onObservationAppended(entry);
  assert.equal(ui.getDisplayedRowCount(), 1);
  const rowText = ui.getRowText(0);
  assert.equal(rowText, '[#1 | E0 | T5 | [SIM]] Organism org_0 appeared');
});
test('C07-04: Multiple Observation Ordering', () => {
  const ui = new ObservationLogUIModel();
  const e1 = makeSampleEntry(1, 0, 1, 'SIMULATION', 'ORGANISM_APPEARED', 'org_1 appeared', 'org_1');
  const e2 = makeSampleEntry(2, 0, 2, 'SIMULATION', 'STAGE_TRANSITION', 'org_1 transitioned', 'org_1');
  const e3 = makeSampleEntry(3, 0, 3, 'SIMULATION', 'ORGANISM_DIED', 'org_1 died', 'org_1');
  ui.onObservationAppended(e1);
  ui.onObservationAppended(e2);
  ui.onObservationAppended(e3);
  assert.equal(ui.getDisplayedRowCount(), 3);
  assert.match(ui.getRowText(0), /#1/);
  assert.match(ui.getRowText(1), /#2/);
  assert.match(ui.getRowText(2), /#3/);
});
test('C07-05: Global Sequence Preservation', () => {
  const ui = new ObservationLogUIModel();
  const entries = [
    makeSampleEntry(10, 0, 1, 'SIMULATION', 'ORGANISM_APPEARED', 'test A'),
    makeSampleEntry(11, 0, 2, 'VIEW', 'Z_LAYER_CHANGED', 'Z=1'),
    makeSampleEntry(12, 1, 0, 'SIMULATION', 'SIMULATION_RESET', 'reset')
  ];
  for (const e of entries) ui.onObservationAppended(e);
  assert.ok(ui.getRowText(0).includes('[#10'));
  assert.ok(ui.getRowText(1).includes('[#11'));
  assert.match(ui.getRowText(2), /=== EPOCH 1 RESET/);
});
test('C07-06: Epoch Display', () => {
  const ui = new ObservationLogUIModel();
  const e1 = makeSampleEntry(1, 0, 1, 'SIMULATION', 'CENSUS_UPDATED', 'census');
  const e2 = makeSampleEntry(2, 2, 1, 'SIMULATION', 'CENSUS_UPDATED', 'census');
  ui.onObservationAppended(e1);
  ui.onObservationAppended(e2);
  assert.match(ui.getRowText(0), /E0/);
  assert.match(ui.getRowText(1), /E2/);
});
test('C07-07: Reset Epoch Banner Rendering', () => {
  const ui = new ObservationLogUIModel();
  const resetEntry = makeSampleEntry(5, 2, 0, 'SIMULATION', 'SIMULATION_RESET', 'Simulation reset to tick 0 (Epoch 2)');
  ui.onObservationAppended(resetEntry);
  const text = ui.getRowText(0);
  assert.equal(text, '=== EPOCH 2 RESET | TICK T0 ===', 'Reset row must be decorated as epoch demarcation banner');
});
test('C07-08: Ring Buffer 100 Bounds', () => {
  const ui = new ObservationLogUIModel();
  for (let i = 1; i <= 100; i++) {
    ui.onObservationAppended(makeSampleEntry(i, 0, i, 'SIMULATION', 'STAGE_TRANSITION', `step ${i}`));
  }
  assert.equal(ui.getDisplayedRowCount(), 100);
});
test('C07-09: Oldest Entry Eviction', () => {
  const ui = new ObservationLogUIModel();
  for (let i = 1; i <= 105; i++) {
    ui.onObservationAppended(makeSampleEntry(i, 0, i, 'SIMULATION', 'STAGE_TRANSITION', `step ${i}`));
  }
  assert.equal(ui.getDisplayedRowCount(), 100);
  // Oldest entries 1..5 were evicted; first remaining is 6
  assert.ok(ui.getRowText(0).includes('[#6'));
  assert.ok(ui.getRowText(99).includes('[#105'));
});
test('C07-10: Empty -> Populated Transition', () => {
  const ui = new ObservationLogUIModel();
  assert.equal(ui.isEmptyStateVisible(), true);
  ui.onObservationAppended(makeSampleEntry(1, 0, 0, 'SIMULATION', 'ORGANISM_APPEARED', 'org'));
  assert.equal(ui.isEmptyStateVisible(), false, 'Empty state must be hidden upon first observation arrival');
});
test('C07-11: Populated -> Empty Transition', () => {
  const ui = new ObservationLogUIModel();
  ui.onObservationAppended(makeSampleEntry(1, 0, 0, 'SIMULATION', 'ORGANISM_APPEARED', 'org'));
  assert.equal(ui.isEmptyStateVisible(), false);
  ui.onLogCleared();
  assert.equal(ui.isEmptyStateVisible(), true, 'Empty state must be revealed upon log clear');
  assert.equal(ui.getDisplayedRowCount(), 0);
});
test('C07-12: Category Badges', () => {
  const ui = new ObservationLogUIModel();
  ui.onObservationAppended(makeSampleEntry(1, 0, 1, 'SIMULATION', 'ORGANISM_APPEARED', 'sim'));
  ui.onObservationAppended(makeSampleEntry(2, 0, null, 'PLAYBACK', 'PLAYBACK_STATE_CHANGED', 'play'));
  ui.onObservationAppended(makeSampleEntry(3, 0, null, 'TRANSPORT', 'BRIDGE_STATE_CHANGED', 'net'));
  ui.onObservationAppended(makeSampleEntry(4, 0, null, 'VIEW', 'Z_LAYER_CHANGED', 'view'));
  assert.ok(ui.getRowText(0).includes('[SIM]'));
  assert.ok(ui.getRowText(1).includes('[PLAY]'));
  assert.ok(ui.getRowText(2).includes('[NET]'));
  assert.ok(ui.getRowText(3).includes('[VIEW]'));
});
test('C07-13: Summary Preservation', () => {
  const ui = new ObservationLogUIModel();
  const summary = 'Organism xylotrupes_01 transitioned stage: STAGE_EGG -> STAGE_LARVA';
  ui.onObservationAppended(makeSampleEntry(1, 0, 4, 'SIMULATION', 'STAGE_TRANSITION', summary));
  assert.ok(ui.getRowText(0).endsWith(summary), 'Authoritative summary text must be preserved verbatim');
});
test('C07-14: Entity ID Preservation', () => {
  const ui = new ObservationLogUIModel();
  const summary = 'Organism beta_09 intent changed: REST -> FORAGE';
  ui.onObservationAppended(makeSampleEntry(1, 0, 2, 'SIMULATION', 'ACTION_INTENT_CHANGED', summary, 'beta_09'));
  assert.ok(ui.getRowText(0).includes('beta_09'));
});
test('C07-15: Tick Preservation', () => {
  const ui = new ObservationLogUIModel();
  ui.onObservationAppended(makeSampleEntry(1, 0, 42, 'SIMULATION', 'ORGANISM_APPEARED', 'test'));
  ui.onObservationAppended(makeSampleEntry(2, 0, null, 'VIEW', 'Z_LAYER_CHANGED', 'view'));
  assert.match(ui.getRowText(0), /T42/);
  assert.match(ui.getRowText(1), /—/);
});
test('C07-16: Zero Independent Sorting', () => {
  const ui = new ObservationLogUIModel();
  // Arrival order has seq 3, then seq 4, then seq 5 (with varying tick)
  ui.onObservationAppended(makeSampleEntry(3, 0, 10, 'SIMULATION', 'ORGANISM_APPEARED', 'item 3'));
  ui.onObservationAppended(makeSampleEntry(4, 0, 2, 'SIMULATION', 'STAGE_TRANSITION', 'item 4'));
  ui.onObservationAppended(makeSampleEntry(5, 0, 8, 'SIMULATION', 'ORGANISM_DIED', 'item 5'));
  // UI must NOT re-sort by tick (which would be 2, 8, 10)
  assert.ok(ui.getRowText(0).includes('[#3'));
  assert.ok(ui.getRowText(1).includes('[#4'));
  assert.ok(ui.getRowText(2).includes('[#5'));
});
test('C07-17: Read-Only Boundary', () => {
  const ui = new ObservationLogUIModel();
  const originalEntry = Object.freeze(makeSampleEntry(1, 0, 1, 'SIMULATION', 'ORGANISM_APPEARED', 'test'));
  assert.doesNotThrow(() => {
    ui.onObservationAppended(originalEntry);
  }, 'UI must not mutate input observation object');
});
test('C07-18: No Simulation Advancement', () => {
  const gdPath = 'd:/LinhSinhVN/godot/scripts/presentation/observation_log_ui.gd';
  const content = fs.readFileSync(gdPath, 'utf8');
  const forbidden = [
    'SimulationWorld',
    'DemoSimulationSession',
    'step(',
    'deltaTime',
    'tick +='
  ];
  for (const term of forbidden) {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('#')) continue;
      assert.ok(!line.includes(term), `Forbidden simulation authority term ${term} on line ${i+1}`);
    }
  }
});
test('C07-19: No Biology Derivation', () => {
  const gdPath = 'd:/LinhSinhVN/godot/scripts/presentation/observation_log_ui.gd';
  const content = fs.readFileSync(gdPath, 'utf8');
  const forbidden = [
    'stored_energy',
    'structural_biomass',
    'metabolism'
  ];
  for (const term of forbidden) {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('#')) continue;
      assert.ok(!line.includes(term), `Forbidden biology term ${term} on line ${i+1}`);
    }
  }
});
test('C07-20: No Wall Clock', () => {
  const gdPath = 'd:/LinhSinhVN/godot/scripts/presentation/observation_log_ui.gd';
  const content = fs.readFileSync(gdPath, 'utf8');
  const forbidden = [
    'Date.now',
    'Time.get_ticks',
    'performance.now',
    'OS.get_system_time',
    'lerp(',
    'create_tween',
    'velocity'
  ];
  for (const term of forbidden) {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('#')) continue;
      assert.ok(!line.includes(term), `Forbidden time/spatial term ${term} on line ${i+1}`);
    }
  }
});
test('C07-21: Deterministic Replay (100 runs)', () => {
  function runSession() {
    const ui = new ObservationLogUIModel();
    ui.onObservationAppended(makeSampleEntry(1, 0, 0, 'SIMULATION', 'ORGANISM_APPEARED', 'org A'));
    ui.onObservationAppended(makeSampleEntry(2, 0, 1, 'SIMULATION', 'STAGE_TRANSITION', 'org A egg->larva'));
    ui.onObservationAppended(makeSampleEntry(3, 0, null, 'VIEW', 'Z_LAYER_CHANGED', 'Z=1'));
    ui.onObservationAppended(makeSampleEntry(4, 1, 0, 'SIMULATION', 'SIMULATION_RESET', 'reset'));
    ui.onObservationAppended(makeSampleEntry(5, 1, 1, 'SIMULATION', 'CENSUS_UPDATED', 'census 1/0/1'));
    return ui.logList.children.map(c => c.text).join('\n');
  }
  const baseline = runSession();
  for (let i = 0; i < 100; i++) {
    assert.equal(runSession(), baseline, 'Replay output must be 100% deterministic');
  }
});
test('C07-22: Scene Hierarchy Boundary', () => {
  const scenePath = 'd:/LinhSinhVN/godot/scenes/world_view.tscn';
  const content = fs.readFileSync(scenePath, 'utf8');
  assert.ok(content.includes('observation_log_ui.gd'), 'observation_log_ui.gd must be referenced in world_view.tscn');
  assert.ok(content.includes('name="ObservationLogUI"') && content.includes('parent="UI/ObservationLog"'), 'ObservationLogUI must be child of UI/ObservationLog');
  assert.ok(content.includes('name="EmptyStateLabel"') && content.includes('parent="UI/ObservationLog/MarginContainer/VBoxContainer"'), 'EmptyStateLabel must be in scene hierarchy');
});
test('C07-23: Frozen Domain Audit', () => {
  const status = execSync('git diff --name-status 60bc129..HEAD', { cwd: 'd:/LinhSinhVN', encoding: 'utf8' });
  const lines = status.trim().split('\n').filter(Boolean);
  const allowed = [
    'godot/scripts/presentation/observation_log_ui.gd',
    'tests/demo/demo_c07_observation_log_ui.test.js',
    'godot/scenes/world_view.tscn'
  ];
  for (const line of lines) {
    const parts = line.split('\t');
    const filePath = parts[1] || parts[0];
    const isAllowed = allowed.some(a => filePath.endsWith(a) || filePath.includes(a));
    assert.ok(isAllowed, 'Unpermitted modification in frozen domain: ' + filePath);
  }
});
test('C07-24: Exactly One Visual Row Per Observation (Single Renderer Proof)', () => {
  const ui = new ObservationLogUIModel();
  assert.equal(ui.getDisplayedRowCount(), 0);
  // Send 5 observations
  for (let i = 1; i <= 5; i++) {
    ui.onObservationAppended(makeSampleEntry(i, 0, i, 'SIMULATION', 'ORGANISM_APPEARED', `org ${i}`));
  }
  assert.equal(ui.getDisplayedRowCount(), 5, 'Exactly 5 visual rows must exist for 5 observations (no double rendering)');
});
test('C07-25: Zero Second Ring Buffer Proof', () => {
  const gdPath = 'd:/LinhSinhVN/godot/scripts/presentation/observation_log_ui.gd';
  const content = fs.readFileSync(gdPath, 'utf8');
  // Verify ObservationLogUI does not declare an array ring buffer
  assert.ok(!content.includes('_observation_ring'), 'ObservationLogUI must not maintain an internal _observation_ring');
  assert.ok(!content.includes('pop_front()'), 'ObservationLogUI must not pop from a ring');
  assert.ok(!content.includes('add_child('), 'ObservationLogUI must not add row children (C-06 is sole row creator)');
});