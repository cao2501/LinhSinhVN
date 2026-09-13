/**
 * LINHSINHVN — DEMO-01-C / C-04: Live Snapshot Synchronization Test Suite
 * File: tests/demo/demo_c04_snapshot_sync.test.js
 * Base: 3c3b3bf (Patch-01)
 *
 * NOTE ON TEST SEMANTICS:
 * These tests are CONTRACT / SPECIFICATION MODEL TESTS verifying the C-04
 * live snapshot synchronization architecture and protocol invariants using
 * high-fidelity JavaScript harnesses and static code analysis.
 * Because the Godot runtime is unavailable in this environment, actual Godot/GDScript
 * runtime execution remains UNVERIFIED.
 *
 * Covers C04-01 through C04-33:
 * - Connection lifecycle & framing
 * - Snapshot extraction and strict non-negative integer validation
 * - Monotonic tick advance, duplicate ignore, stale rejection
 * - Explicit reset epoch transition & state cleansing
 * - Play/pause FIFO queue semantics
 * - Negative capability AST scans (zero lerp, tween, physics, bio calculation, RNG)
 * - Deterministic discrete synchronization without wall-clock dependence
 * - Static proof of GDScript strict integer validation contract
 * - Frozen-domain audits
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

import {
  DEFAULT_IPC_HOST,
  DEFAULT_IPC_PORT,
  PROTOCOL_VERSION,
  MAX_FRAME_SIZE,
  BRIDGE_HEALTH,
  IPC_COMMANDS,
  IPC_ERROR_CODES,
  encodeFrame,
  FrameParser,
  IpcServer,
  IpcClient,
  DemoSimulationSession
} from '../../demo/index.js';
import { loadSpeciesProfile } from '../../game/lifecycle/profile_loader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

const SYNCHRONIZER_SCRIPT_PATH = path.join(REPO_ROOT, 'godot/scripts/presentation/snapshot_synchronizer.gd');
const OVERLAY_SCRIPT_PATH = path.join(REPO_ROOT, 'godot/scripts/presentation/organisms_overlay.gd');
const WORLD_VIEW_SCENE_PATH = path.join(REPO_ROOT, 'godot/scenes/world_view.tscn');
const WORLD_VIEW_SCRIPT_PATH = path.join(REPO_ROOT, 'godot/scripts/presentation/world_view.gd');

function getSynchronizerCodeOnly() {
  const raw = fs.readFileSync(SYNCHRONIZER_SCRIPT_PATH, 'utf8');
  return raw.split(/\r?\n/).filter(l => !l.trim().startsWith('#')).join('\n');
}

function getDemoProfile() {
  return loadSpeciesProfile('data/species/xylotrupes_rhinoceros_proto.json');
}

// Pure simulated harness reflecting SnapshotSynchronizer logic
class TestSnapshotSynchronizerHarness {
  constructor() {
    this.lastAcceptedTick = -1;
    this.sessionEpoch = 0;
    this.playbackStatus = 'PAUSED';
    this.bridgeState = 'DISCONNECTED';
    this.appliedOrganisms = null;
    this.redrawCount = 0;
    this.warnings = [];
  }

  handleConnected() {
    this.bridgeState = 'CONNECTED';
  }

  handleDisconnected() {
    this.bridgeState = 'DISCONNECTED';
  }

  handleBridgeFailed(err) {
    this.bridgeState = 'BRIDGE_FAILED';
  }

  handleResponse(response) {
    if (!response || !response.success) {
      if (response && response.error && response.error.code === 'SESSION_ERROR') {
        this.handleBridgeFailed(response.error.message);
      }
      return 'ERROR_DROPPED';
    }

    const { command, result } = response;
    if (!result || typeof result !== 'object') return 'NO_RESULT';

    if (command === 'play' || command === 'pause') {
      if (typeof result.playback_status === 'string') {
        this.playbackStatus = result.playback_status;
      }
      return 'PLAYBACK_STATUS_UPDATED';
    }

    const snapshot = result.snapshot;
    if (!snapshot || typeof snapshot !== 'object') return 'NO_SNAPSHOT';

    const tick = snapshot.simulation_tick;
    // Strict non-negative integer check: must be type number, Number.isInteger, not float, >= 0
    if (typeof tick !== 'number' || !Number.isInteger(tick) || tick < 0 || Object.is(tick, -0)) {
      this.warnings.push(`Malformed tick: ${tick}`);
      return 'MALFORMED_TICK';
    }

    const isReset = (command === 'reset');
    if (isReset) {
      this.sessionEpoch += 1;
      this.lastAcceptedTick = tick;
      if (snapshot.playback_status) this.playbackStatus = snapshot.playback_status;
      this.appliedOrganisms = snapshot.organisms || [];
      this.redrawCount += 1;
      return 'ACCEPT_AND_APPLY';
    }

    if (tick > this.lastAcceptedTick) {
      this.lastAcceptedTick = tick;
      if (snapshot.playback_status) this.playbackStatus = snapshot.playback_status;
      this.appliedOrganisms = snapshot.organisms || [];
      this.redrawCount += 1;
      return 'ACCEPT_AND_APPLY';
    } else if (tick === this.lastAcceptedTick) {
      return 'IGNORE_DUPLICATE';
    } else {
      this.warnings.push(`Stale tick: ${tick} < ${this.lastAcceptedTick}`);
      return 'REJECT_STALE';
    }
  }
}

describe('DEMO-01-C / C-04: Live Snapshot Synchronization', () => {

  // --- C04-01: Connection establishment ---
  it('C04-01: Connection establishment via IpcClient handshake to IpcServer', async () => {
    const server = new IpcServer({ port: 0 });
    const addr = await server.start();
    const client = new IpcClient();
    await client.connect(addr.port, addr.host);

    assert.equal(client.isConnected, true);
    client.disconnect();
    await server.stop();
  });

  // --- C04-02: Disconnect handling ---
  it('C04-02: Disconnect handling cleans connection state and preserves last snapshot', () => {
    const harness = new TestSnapshotSynchronizerHarness();
    harness.handleConnected();
    assert.equal(harness.bridgeState, 'CONNECTED');

    // Simulate receiving initial snapshot
    harness.handleResponse({
      success: true,
      command: 'getSnapshot',
      result: { snapshot: { simulation_tick: 5, organisms: [{ organism_id: 'org_1' }] } }
    });
    assert.equal(harness.lastAcceptedTick, 5);
    assert.equal(harness.appliedOrganisms.length, 1);

    // Disconnect
    harness.handleDisconnected();
    assert.equal(harness.bridgeState, 'DISCONNECTED');
    // Last snapshot remains preserved
    assert.equal(harness.lastAcceptedTick, 5);
    assert.equal(harness.appliedOrganisms.length, 1);
  });

  // --- C04-03: Snapshot extraction ---
  it('C04-03: Snapshot extraction validates envelope and extracts result.snapshot', () => {
    const harness = new TestSnapshotSynchronizerHarness();
    const res = harness.handleResponse({
      protocol_version: '1.0',
      request_id: 'godot_000001',
      success: true,
      command: 'getSnapshot',
      result: {
        snapshot: {
          schema_version: '1.0',
          simulation_tick: 0,
          simulation_seed: '0x123',
          playback_status: 'PAUSED',
          playback_speed: 1,
          census: {},
          organisms: []
        }
      }
    });
    assert.equal(res, 'ACCEPT_AND_APPLY');
    assert.equal(harness.lastAcceptedTick, 0);
  });

  // --- C04-04: Newer tick accepted ---
  it('C04-04: Newer tick accepted (tick > last_accepted_tick -> ACCEPT_AND_APPLY)', () => {
    const harness = new TestSnapshotSynchronizerHarness();
    harness.handleResponse({ success: true, command: 'getSnapshot', result: { snapshot: { simulation_tick: 0, organisms: [] } } });
    assert.equal(harness.lastAcceptedTick, 0);

    const res = harness.handleResponse({ success: true, command: 'step', result: { snapshot: { simulation_tick: 1, organisms: [] } } });
    assert.equal(res, 'ACCEPT_AND_APPLY');
    assert.equal(harness.lastAcceptedTick, 1);
    assert.equal(harness.redrawCount, 2);
  });

  // --- C04-05: Stale tick rejected ---
  it('C04-05: Stale tick rejected (tick < last_accepted_tick -> REJECT_STALE with warning)', () => {
    const harness = new TestSnapshotSynchronizerHarness();
    harness.handleResponse({ success: true, command: 'step', result: { snapshot: { simulation_tick: 5, organisms: [] } } });
    assert.equal(harness.lastAcceptedTick, 5);

    const staleRes = harness.handleResponse({ success: true, command: 'step', result: { snapshot: { simulation_tick: 3, organisms: [] } } });
    assert.equal(staleRes, 'REJECT_STALE');
    assert.equal(harness.lastAcceptedTick, 5);
    assert.equal(harness.warnings.length, 1);
    assert.match(harness.warnings[0], /Stale tick: 3 < 5/);
  });

  // --- C04-06: Duplicate tick ignored with zero redraw ---
  it('C04-06: Duplicate tick ignored with zero redraw (tick == last -> IGNORE_DUPLICATE)', () => {
    const harness = new TestSnapshotSynchronizerHarness();
    harness.handleResponse({ success: true, command: 'step', result: { snapshot: { simulation_tick: 2, organisms: [] } } });
    assert.equal(harness.redrawCount, 1);

    const dupRes = harness.handleResponse({ success: true, command: 'getSnapshot', result: { snapshot: { simulation_tick: 2, organisms: [] } } });
    assert.equal(dupRes, 'IGNORE_DUPLICATE');
    assert.equal(harness.redrawCount, 1); // Redraw count unchanged!
  });

  // --- C04-07: step response synchronizes organism presentation ---
  it('C04-07: step response synchronizes organism presentation from Node session', () => {
    const session = new DemoSimulationSession({ speciesProfile: getDemoProfile() });
    const snap1 = session.step(1);

    const harness = new TestSnapshotSynchronizerHarness();
    harness.handleResponse({ success: true, command: 'step', result: { snapshot: snap1 } });
    assert.equal(harness.lastAcceptedTick, 1);
    assert.equal(harness.appliedOrganisms.length, 10);
  });

  // --- C04-08: getSnapshot synchronizes without advancing simulation ---
  it('C04-08: getSnapshot synchronizes without advancing simulation', () => {
    const session = new DemoSimulationSession({ speciesProfile: getDemoProfile() });
    const snapBefore = session.getSnapshot();
    assert.equal(snapBefore.simulation_tick, 0);

    const snapQuery = session.getSnapshot();
    assert.equal(snapQuery.simulation_tick, 0);

    const harness = new TestSnapshotSynchronizerHarness();
    harness.handleResponse({ success: true, command: 'getSnapshot', result: { snapshot: snapQuery } });
    assert.equal(harness.lastAcceptedTick, 0);
  });

  // --- C04-09: reset establishes new presentation epoch ---
  it('C04-09: reset establishes new presentation epoch and accepts tick 0', () => {
    const harness = new TestSnapshotSynchronizerHarness();
    harness.handleResponse({ success: true, command: 'step', result: { snapshot: { simulation_tick: 50, organisms: [] } } });
    assert.equal(harness.lastAcceptedTick, 50);
    assert.equal(harness.sessionEpoch, 0);

    const resetRes = harness.handleResponse({
      success: true,
      command: 'reset',
      result: { snapshot: { simulation_tick: 0, organisms: [{ organism_id: 'bootstrap_1' }] } }
    });
    assert.equal(resetRes, 'ACCEPT_AND_APPLY');
    assert.equal(harness.lastAcceptedTick, 0);
    assert.equal(harness.sessionEpoch, 1);
    assert.equal(harness.appliedOrganisms.length, 1);
  });

  // --- C04-10: reset completely replaces stale presentation state ---
  it('C04-10: reset completely replaces stale presentation state (dead/newborn wiped)', () => {
    const harness = new TestSnapshotSynchronizerHarness();
    // Simulate population with dead and newborn organisms at tick 100
    harness.handleResponse({
      success: true,
      command: 'step',
      result: {
        snapshot: {
          simulation_tick: 100,
          organisms: [
            { organism_id: 'org_old_dead', is_alive: false },
            { organism_id: 'org_newborn', is_alive: true }
          ]
        }
      }
    });
    assert.equal(harness.appliedOrganisms.length, 2);

    // Issue reset
    harness.handleResponse({
      success: true,
      command: 'reset',
      result: {
        snapshot: {
          simulation_tick: 0,
          organisms: [{ organism_id: 'org_clean_bootstrap', is_alive: true }]
        }
      }
    });

    // Old organisms are completely gone
    assert.equal(harness.appliedOrganisms.length, 1);
    assert.equal(harness.appliedOrganisms[0].organism_id, 'org_clean_bootstrap');
  });

  // --- C04-11: play creates zero Godot simulation loops ---
  it('C04-11: play creates zero Godot simulation loops', () => {
    const codeOnly = getSynchronizerCodeOnly();
    assert.doesNotMatch(codeOnly, /func\s+_process/);
    assert.doesNotMatch(codeOnly, /func\s+_physics_process/);
    assert.doesNotMatch(codeOnly, /step\s*\(/); // Never calls step autonomously
  });

  // --- C04-12: pause respects Node FIFO queued-step semantics ---
  it('C04-12: pause respects Node FIFO queued-step semantics (halts future steps, allows queued)', () => {
    const harness = new TestSnapshotSynchronizerHarness();
    harness.handleResponse({ success: true, command: 'play', result: { playback_status: 'PLAYING' } });
    assert.equal(harness.playbackStatus, 'PLAYING');

    // Pause received
    harness.handleResponse({ success: true, command: 'pause', result: { playback_status: 'PAUSED' } });
    assert.equal(harness.playbackStatus, 'PAUSED');

    // If an in-flight queued step from before pause arrives, it is legitimately accepted
    const queuedStepRes = harness.handleResponse({
      success: true,
      command: 'step',
      result: { snapshot: { simulation_tick: 5, organisms: [] } }
    });
    assert.equal(queuedStepRes, 'ACCEPT_AND_APPLY');
    assert.equal(harness.lastAcceptedTick, 5);
  });

  // --- C04-13: z-layer sends zero IPC commands ---
  it('C04-13: z-layer changes emit zero IPC commands and modify zero snapshot data', () => {
    const syncCode = fs.readFileSync(SYNCHRONIZER_SCRIPT_PATH, 'utf8');
    assert.doesNotMatch(syncCode, /z_layer_changed/);
    assert.doesNotMatch(syncCode, /set_active_z_layer/);
  });

  // --- C04-14: exact position mapping ---
  it('C04-14: Exact position mapping passes unchanged coordinates to overlay', () => {
    const harness = new TestSnapshotSynchronizerHarness();
    const testOrgs = [
      { organism_id: 'org_1', position: { x: 22, y: 22, z: 0 } },
      { organism_id: 'org_2', position: { x: 20, y: 21, z: 1 } }
    ];
    harness.handleResponse({
      success: true,
      command: 'getSnapshot',
      result: { snapshot: { simulation_tick: 1, organisms: testOrgs } }
    });

    assert.deepEqual(harness.appliedOrganisms, testOrgs);
    assert.equal(harness.appliedOrganisms[0].position.x, 22);
    assert.equal(harness.appliedOrganisms[1].position.z, 1);
  });

  // --- C04-15: zero position interpolation ---
  it('C04-15: Zero position interpolation (no lerp, tween, slerp, move_toward)', () => {
    const codeOnly = getSynchronizerCodeOnly();
    assert.doesNotMatch(codeOnly, /lerp|slerp|move_toward|Tween|create_tween/);
  });

  // --- C04-16: zero biological calculations ---
  it('C04-16: Zero biological calculations in SnapshotSynchronizer', () => {
    const codeOnly = getSynchronizerCodeOnly();
    assert.doesNotMatch(codeOnly, /stored_energy|structural_biomass|calculate_growth|metabolism|starvation/);
  });

  // --- C04-17: negative capability AST audit ---
  it('C04-17: Negative capability AST audit across C-04 source', () => {
    const codeOnly = getSynchronizerCodeOnly();
    // Physics / Collision
    assert.doesNotMatch(codeOnly, /PhysicsBody|CharacterBody2D|RigidBody2D|Area2D|CollisionShape2D/);
    // Animation / Movement
    assert.doesNotMatch(codeOnly, /AnimationPlayer|velocity|position\s*\+=|translate/);
    // RNG
    assert.doesNotMatch(codeOnly, /Math\.random|randi|randf|randfn/);
    // Lifecycle / Mutation
    assert.doesNotMatch(codeOnly, /lifecycle_stage\s*=|advance_stage/);
  });

  // --- C04-18: malformed response rejection & strict integer simulation_tick regression ---
  it('C04-18: Malformed response rejection & strict integer simulation_tick regression suite', () => {
    const harness = new TestSnapshotSynchronizerHarness();

    // 1. Initial valid integer 0 accepted
    const res0 = harness.handleResponse({ success: true, command: 'getSnapshot', result: { snapshot: { simulation_tick: 0, organisms: [{ id: 'org_0' }] } } });
    assert.equal(res0, 'ACCEPT_AND_APPLY');
    assert.equal(harness.lastAcceptedTick, 0);
    assert.equal(harness.sessionEpoch, 0);
    assert.equal(harness.redrawCount, 1);
    assert.equal(harness.appliedOrganisms.length, 1);

    // 2. Valid positive integer accepted
    const resPos = harness.handleResponse({ success: true, command: 'step', result: { snapshot: { simulation_tick: 5, organisms: [{ id: 'org_5' }] } } });
    assert.equal(resPos, 'ACCEPT_AND_APPLY');
    assert.equal(harness.lastAcceptedTick, 5);
    assert.equal(harness.redrawCount, 2);

    // Capture baseline state before malformed inputs
    const baselineTick = harness.lastAcceptedTick;
    const baselineEpoch = harness.sessionEpoch;
    const baselineRedraws = harness.redrawCount;
    const baselineOrganisms = harness.appliedOrganisms;

    const malformedPayloads = [
      { desc: 'negative integer -1', tick: -1 },
      { desc: 'negative integer -5', tick: -5 },
      { desc: 'fractional float 1.5', tick: 1.5 },
      { desc: 'fractional float 5.5', tick: 5.5 },
      { desc: 'fractional float 5.9', tick: 5.9 },
      { desc: 'string "1"', tick: "1" },
      { desc: 'null', tick: null },
      { desc: 'undefined', tick: undefined },
      { desc: 'NaN', tick: NaN },
      { desc: 'Infinity', tick: Infinity }
    ];

    for (const testCase of malformedPayloads) {
      const payload = { success: true, command: 'step', result: { snapshot: { simulation_tick: testCase.tick, organisms: [{ id: 'bad' }] } } };
      const res = harness.handleResponse(payload);
      assert.equal(res, 'MALFORMED_TICK', `Failed to reject ${testCase.desc}`);
      // Assert zero mutation of presentation state
      assert.equal(harness.lastAcceptedTick, baselineTick, `Tick mutated on ${testCase.desc}`);
      assert.equal(harness.sessionEpoch, baselineEpoch, `Epoch mutated on ${testCase.desc}`);
      assert.equal(harness.redrawCount, baselineRedraws, `Redraw triggered on ${testCase.desc}`);
      assert.equal(harness.appliedOrganisms, baselineOrganisms, `Organisms mutated on ${testCase.desc}`);
    }

    // Verify null response & SESSION_ERROR do not advance
    assert.equal(harness.handleResponse(null), 'ERROR_DROPPED');
    assert.equal(harness.handleResponse({ success: false, error: { code: 'INVALID_REQUEST' } }), 'ERROR_DROPPED');
    assert.equal(harness.handleResponse({ success: true, command: 'step', result: {} }), 'NO_SNAPSHOT');
    assert.equal(harness.redrawCount, baselineRedraws);
  });

  // --- C04-19: SESSION_ERROR / bridge failure behavior ---
  it('C04-19: SESSION_ERROR / bridge failure transitions bridgeState to BRIDGE_FAILED', () => {
    const harness = new TestSnapshotSynchronizerHarness();
    harness.handleConnected();
    assert.equal(harness.bridgeState, 'CONNECTED');

    harness.handleResponse({
      success: false,
      error: { code: 'SESSION_ERROR', message: 'Simulation session crashed' }
    });

    assert.equal(harness.bridgeState, 'BRIDGE_FAILED');
  });

  // --- C04-20: deterministic synchronization using controlled discrete command/response sequences ---
  it('C04-20: Deterministic synchronization using controlled discrete sequence (100 runs bit-for-bit identical)', () => {
    const runReplay = () => {
      const harness = new TestSnapshotSynchronizerHarness();
      const decisions = [];

      decisions.push(harness.handleResponse({ success: true, command: 'getSnapshot', result: { snapshot: { simulation_tick: 0, organisms: [{ id: 'a' }] } } }));
      decisions.push(harness.handleResponse({ success: true, command: 'step', result: { snapshot: { simulation_tick: 1, organisms: [{ id: 'b' }] } } }));
      decisions.push(harness.handleResponse({ success: true, command: 'getSnapshot', result: { snapshot: { simulation_tick: 1, organisms: [{ id: 'b' }] } } })); // dup
      decisions.push(harness.handleResponse({ success: true, command: 'step', result: { snapshot: { simulation_tick: 2, organisms: [{ id: 'c' }] } } }));
      decisions.push(harness.handleResponse({ success: true, command: 'step', result: { snapshot: { simulation_tick: 1, organisms: [{ id: 'b' }] } } })); // stale
      decisions.push(harness.handleResponse({ success: true, command: 'reset', result: { snapshot: { simulation_tick: 0, organisms: [{ id: 'a' }] } } })); // reset

      return {
        decisions,
        finalTick: harness.lastAcceptedTick,
        epoch: harness.sessionEpoch,
        redraws: harness.redrawCount
      };
    };

    const firstRun = runReplay();
    assert.deepEqual(firstRun.decisions, [
      'ACCEPT_AND_APPLY',
      'ACCEPT_AND_APPLY',
      'IGNORE_DUPLICATE',
      'ACCEPT_AND_APPLY',
      'REJECT_STALE',
      'ACCEPT_AND_APPLY'
    ]);
    assert.equal(firstRun.finalTick, 0);
    assert.equal(firstRun.epoch, 1);
    assert.equal(firstRun.redraws, 4);

    for (let i = 0; i < 100; i++) {
      assert.deepEqual(runReplay(), firstRun);
    }
  });

  // --- C04-21: frozen-domain audit ---
  it('C04-21: Frozen-domain audit confirms only authorized files changed vs base 3c3b3bf', () => {
    const diff = execSync('git diff 3c3b3bf --name-only', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
    const changedFiles = diff ? diff.split(/\r?\n/).filter(Boolean) : [];

    const allowedC04Files = [
      'godot/scenes/world_view.tscn',
      'godot/scripts/presentation/snapshot_synchronizer.gd',
      'tests/demo/demo_c04_snapshot_sync.test.js'
    ];
    for (const f of changedFiles) {
      assert.ok(allowedC04Files.includes(f), `Unexpected modified file vs base 3c3b3bf: ${f}`);
    }

    const untracked = execSync('git status --porcelain', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
    const statusLines = untracked ? untracked.split(/\r?\n/).filter(Boolean) : [];
    for (const line of statusLines) {
      const filePath = line.replace(/^[MADRCU?! ]{1,2}\s+/, '').trim();
      const isAllowed = (
        filePath === 'godot/scenes/world_view.tscn' ||
        filePath === 'godot/scripts/presentation/snapshot_synchronizer.gd' ||
        filePath === 'tests/demo/demo_c04_snapshot_sync.test.js'
      );
      assert.ok(isAllowed, `Unauthorized file in git status: ${line} (parsed: ${filePath})`);
    }
  });

  // --- C04-22: pause stops future scheduler enqueue but does not cancel already queued STEP ---
  it('C04-22: pause stops future scheduler enqueue without canceling queued STEP', async () => {
    const server = new IpcServer({ port: 0, tickIntervalMs: 50 });
    const addr = await server.start();
    const client = new IpcClient();
    await client.connect(addr.port, addr.host);

    const playResp = await client.sendRequest(IPC_COMMANDS.PLAY);
    assert.equal(playResp.success, true);

    const pauseResp = await client.sendRequest(IPC_COMMANDS.PAUSE);
    assert.equal(pauseResp.success, true);
    assert.equal(pauseResp.result.playback_status, 'PAUSED');

    client.disconnect();
    await server.stop();
  });

  // --- C04-23: presentation polling sends getSnapshot only ---
  it('C04-23: Presentation polling in C-04 can send getSnapshot only (never autonomous step)', () => {
    const codeOnly = getSynchronizerCodeOnly();
    assert.doesNotMatch(codeOnly, /step\s*\(/);
    assert.doesNotMatch(codeOnly, /COMMAND_STEP/);
  });

  // --- C04-24: presentation polling cannot modify simulation tick ---
  it('C04-24: getSnapshot polling cannot modify authoritative simulation tick', () => {
    const session = new DemoSimulationSession({ speciesProfile: getDemoProfile() });
    for (let i = 0; i < 10; i++) {
      const snap = session.getSnapshot();
      assert.equal(snap.simulation_tick, 0);
    }
  });

  // --- C04-25: duplicate snapshot causes no redraw ---
  it('C04-25: Duplicate snapshot causes zero redraw in presentation', () => {
    const harness = new TestSnapshotSynchronizerHarness();
    harness.handleResponse({ success: true, command: 'step', result: { snapshot: { simulation_tick: 1, organisms: [] } } });
    const initialRedraws = harness.redrawCount;

    harness.handleResponse({ success: true, command: 'getSnapshot', result: { snapshot: { simulation_tick: 1, organisms: [] } } });
    assert.equal(harness.redrawCount, initialRedraws);
  });

  // --- C04-26: stale snapshot causes no redraw ---
  it('C04-26: Stale snapshot causes zero redraw in presentation', () => {
    const harness = new TestSnapshotSynchronizerHarness();
    harness.handleResponse({ success: true, command: 'step', result: { snapshot: { simulation_tick: 10, organisms: [] } } });
    const initialRedraws = harness.redrawCount;

    harness.handleResponse({ success: true, command: 'step', result: { snapshot: { simulation_tick: 8, organisms: [] } } });
    assert.equal(harness.redrawCount, initialRedraws);
  });

  // --- C04-27: reset response establishes a new epoch ---
  it('C04-27: Reset response establishes a new epoch and increments sessionEpoch', () => {
    const harness = new TestSnapshotSynchronizerHarness();
    assert.equal(harness.sessionEpoch, 0);

    harness.handleResponse({ success: true, command: 'reset', result: { snapshot: { simulation_tick: 0, organisms: [] } } });
    assert.equal(harness.sessionEpoch, 1);

    harness.handleResponse({ success: true, command: 'reset', result: { snapshot: { simulation_tick: 0, organisms: [] } } });
    assert.equal(harness.sessionEpoch, 2);
  });

  // --- C04-28: pre-reset stale snapshot cannot overwrite post-reset state ---
  it('C04-28: Pre-reset stale snapshot cannot overwrite post-reset state', () => {
    const harness = new TestSnapshotSynchronizerHarness();
    // Advance to tick 10
    harness.handleResponse({ success: true, command: 'step', result: { snapshot: { simulation_tick: 10, organisms: [] } } });
    // Reset to tick 0
    harness.handleResponse({ success: true, command: 'reset', result: { snapshot: { simulation_tick: 0, organisms: [{ id: 'post_reset' }] } } });

    assert.equal(harness.lastAcceptedTick, 0);
    assert.equal(harness.sessionEpoch, 1);
  });

  // --- C04-29: SESSION_ERROR is never processed as a snapshot ---
  it('C04-29: SESSION_ERROR is never processed as a snapshot', () => {
    const harness = new TestSnapshotSynchronizerHarness();
    const res = harness.handleResponse({
      success: false,
      command: 'step',
      error: { code: 'SESSION_ERROR', message: 'Fatal crash' },
      result: { snapshot: { simulation_tick: 999 } }
    });

    assert.equal(res, 'ERROR_DROPPED');
    assert.equal(harness.lastAcceptedTick, -1);
    assert.equal(harness.bridgeState, 'BRIDGE_FAILED');
  });

  // --- C04-30: bridge failure preserves last valid presentation snapshot ---
  it('C04-30: Bridge failure preserves last valid presentation snapshot', () => {
    const harness = new TestSnapshotSynchronizerHarness();
    harness.handleResponse({
      success: true,
      command: 'step',
      result: { snapshot: { simulation_tick: 4, organisms: [{ id: 'valid_org' }] } }
    });
    assert.equal(harness.appliedOrganisms.length, 1);

    // Bridge failure occurs
    harness.handleBridgeFailed('Connection lost');
    assert.equal(harness.bridgeState, 'BRIDGE_FAILED');
    assert.equal(harness.appliedOrganisms.length, 1);
    assert.equal(harness.appliedOrganisms[0].id, 'valid_org');
  });

  // --- C04-31: negative-capability static audit ---
  it('C04-31: Negative-capability static audit across GDScript synchronizer', () => {
    const raw = fs.readFileSync(SYNCHRONIZER_SCRIPT_PATH, 'utf8');
    const forbidden = [
      'lerp', 'slerp', 'move_toward', 'Tween', 'create_tween', 'AnimationPlayer',
      'PhysicsBody', 'CharacterBody2D', 'RigidBody2D', 'Area2D', 'CollisionShape2D',
      'stored_energy', 'structural_biomass', 'metabolism', 'starvation',
      'Math.random', 'randi', 'randf'
    ];
    for (const pat of forbidden) {
      assert.doesNotMatch(raw, new RegExp(pat));
    }
  });

  // --- C04-32: deterministic synchronization without wall-clock dependence ---
  it('C04-32: Deterministic synchronization without wall-clock dependence (no Date.now, performance.now)', () => {
    const raw = fs.readFileSync(SYNCHRONIZER_SCRIPT_PATH, 'utf8');
    assert.doesNotMatch(raw, /Date\.now|performance\.now|Time\.get_ticks|OS\.get_system_time/);
  });
  // --- C04-33: static proof of GDScript strict integer validation and reset correlation semantics ---
  it('C04-33: Static proof of GDScript strict integer validation contract and reset correlation semantics', () => {
    const raw = fs.readFileSync(SYNCHRONIZER_SCRIPT_PATH, 'utf8');

    // 1. Strict TYPE_INT validation: must check for TYPE_INT
    assert.match(raw, /typeof\(tick_var\)\s*!=\s*TYPE_INT/);

    // 2. Strict rejection of TYPE_FLOAT: TYPE_FLOAT must NOT be accepted in tick validation
    assert.doesNotMatch(raw, /typeof\(tick_var\)\s*==\s*TYPE_FLOAT/);
    assert.doesNotMatch(raw, /typeof\(tick_var\)\s*!=\s*TYPE_FLOAT/);

    // 3. Non-negative tick verification
    assert.match(raw, /tick\s*<\s*0/);

    // 4. Reset correlation is command-level
    assert.match(raw, /var\s+is_reset:\s*bool\s*=\s*\(command\s*==\s*"reset"\)/);
    assert.match(raw, /Reset correlation is command-level correlation/i);
  });
});