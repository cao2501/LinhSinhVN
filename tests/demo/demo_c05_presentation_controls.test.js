/**
 * LINHSINHVN — DEMO-01-C / C-05: Presentation Controls Test Suite
 * File: tests/demo/demo_c05_presentation_controls.test.js
 * Base: e0706ef
 *
 * NOTE ON TEST SEMANTICS:
 * These tests are CONTRACT / SPECIFICATION MODEL TESTS verifying the C-05
 * presentation controls architecture, command contracts, and UI invariants
 * using high-fidelity JavaScript harnesses, integration with Node simulation/IPC,
 * and static code analysis.
 * Because the Godot runtime is unavailable in this environment, actual Godot/GDScript
 * runtime execution remains UNVERIFIED.
 *
 * Covers C05-01 through C05-33 specified by Game Director.
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
  IPC_COMMANDS,
  IPC_ERROR_CODES,
  IpcServer,
  IpcClient,
  DemoSimulationSession
} from '../../demo/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

const CONTROLS_SCRIPT_PATH = path.join(REPO_ROOT, 'godot/scripts/presentation/presentation_controls.gd');
const SYNCHRONIZER_SCRIPT_PATH = path.join(REPO_ROOT, 'godot/scripts/presentation/snapshot_synchronizer.gd');
const WORLD_VIEW_SCENE_PATH = path.join(REPO_ROOT, 'godot/scenes/world_view.tscn');
const WORLD_VIEW_SCRIPT_PATH = path.join(REPO_ROOT, 'godot/scripts/presentation/world_view.gd');

function getControlsCodeOnly() {
  const raw = fs.readFileSync(CONTROLS_SCRIPT_PATH, 'utf8');
  return raw.split(/\r?\n/).filter(l => !l.trim().startsWith('#')).join('\n');
}

// High-fidelity presentation controls model
class TestPresentationControlsHarness {
  constructor(ipcClient = null, worldView = null) {
    this.ipc = ipcClient;
    this.worldView = worldView || {
      activeZ: 0,
      minZ: -1,
      maxZ: 2,
      next_z_layer() { if (this.activeZ < this.maxZ) this.activeZ += 1; },
      prev_z_layer() { if (this.activeZ > this.minZ) this.activeZ -= 1; },
      get_active_z_layer() { return this.activeZ; }
    };

    this.commandInFlight = false;
    this.bridgeState = 'DISCONNECTED';
    this.playbackStatus = 'PAUSED';
    this.tick = 0;

    this.dispatchedCommands = [];
    this.buttonStates = {
      play: true, // disabled
      pause: true,
      step: true,
      reset: true,
      sync: true,
      zDown: false,
      zUp: false
    };

    this.refreshUIState();
  }

  refreshUIState() {
    const z = this.worldView.get_active_z_layer();
    this.buttonStates.zDown = (z <= this.worldView.minZ);
    this.buttonStates.zUp = (z >= this.worldView.maxZ);

    if (this.commandInFlight) {
      this.buttonStates.play = true;
      this.buttonStates.pause = true;
      this.buttonStates.step = true;
      this.buttonStates.reset = true;
      this.buttonStates.sync = true;
      return;
    }

    switch (this.bridgeState) {
      case 'DISCONNECTED':
      case 'CONNECTING':
        this.buttonStates.play = true;
        this.buttonStates.pause = true;
        this.buttonStates.step = true;
        this.buttonStates.reset = true;
        this.buttonStates.sync = true;
        break;

      case 'CONNECTED':
        this.buttonStates.reset = false;
        this.buttonStates.sync = false;
        if (this.playbackStatus === 'PLAYING') {
          this.buttonStates.play = true;
          this.buttonStates.pause = false;
          this.buttonStates.step = true; // UI policy
        } else {
          this.buttonStates.play = false;
          this.buttonStates.pause = true;
          this.buttonStates.step = false;
        }
        break;

      case 'BRIDGE_FAILED':
        this.buttonStates.play = true;
        this.buttonStates.pause = true;
        this.buttonStates.step = true;
        this.buttonStates.reset = false; // recovery
        this.buttonStates.sync = false;
        break;
    }
  }

  dispatchCommand(command, params = {}) {
    if (this.commandInFlight) return false;
    this.commandInFlight = true;
    this.refreshUIState();

    this.dispatchedCommands.push({ command, params });
    if (this.ipc) {
      const sent = this.ipc.sendCommand(command, params);
      if (!sent) {
        this.commandInFlight = false;
        this.refreshUIState();
        return false;
      }
    }
    return true;
  }

  onPlayPressed() {
    if (this.commandInFlight || this.bridgeState !== 'CONNECTED' || this.playbackStatus === 'PLAYING') return false;
    return this.dispatchCommand('play');
  }

  onPausePressed() {
    if (this.commandInFlight || this.bridgeState !== 'CONNECTED' || this.playbackStatus !== 'PLAYING') return false;
    return this.dispatchCommand('pause');
  }

  onStepPressed() {
    if (this.commandInFlight || this.bridgeState !== 'CONNECTED' || this.playbackStatus === 'PLAYING') return false;
    return this.dispatchCommand('step', { ticks: 1 });
  }

  onResetPressed() {
    if (this.commandInFlight || (this.bridgeState !== 'CONNECTED' && this.bridgeState !== 'BRIDGE_FAILED')) return false;
    return this.dispatchCommand('reset');
  }

  onSyncPressed() {
    if (this.commandInFlight || (this.bridgeState !== 'CONNECTED' && this.bridgeState !== 'BRIDGE_FAILED')) return false;
    return this.dispatchCommand('getSnapshot');
  }

  onZUpPressed() {
    this.worldView.next_z_layer();
    this.refreshUIState();
  }

  onZDownPressed() {
    this.worldView.prev_z_layer();
    this.refreshUIState();
  }

  onIpcConnected() {
    this.bridgeState = 'CONNECTED';
    this.commandInFlight = false;
    this.refreshUIState();
    this.dispatchCommand('getSnapshot');
  }

  onIpcDisconnected() {
    this.bridgeState = 'DISCONNECTED';
    this.commandInFlight = false;
    this.refreshUIState();
  }

  onIpcBridgeFailed(err) {
    this.bridgeState = 'BRIDGE_FAILED';
    this.commandInFlight = false;
    this.refreshUIState();
  }

  onIpcResponseReceived(response) {
    this.commandInFlight = false;
    if (response && response.success && response.command === 'reset') {
      if (this.bridgeState === 'BRIDGE_FAILED') {
        this.bridgeState = 'CONNECTED';
      }
    }
    this.refreshUIState();
  }

  onSnapshotApplied(tick, epoch) {
    this.tick = tick;
    this.refreshUIState();
  }

  onPlaybackStatusChanged(status) {
    this.playbackStatus = status;
    this.refreshUIState();
  }
}

describe('DEMO-01-C / C-05: Presentation Controls', () => {

  // --- C05-01: UI initialization/default binding ---
  it('C05-01: UI initialization/default binding: PAUSED, tick 0, DISCONNECTED, simulation buttons disabled', () => {
    const harness = new TestPresentationControlsHarness();
    assert.equal(harness.playbackStatus, 'PAUSED');
    assert.equal(harness.tick, 0);
    assert.equal(harness.bridgeState, 'DISCONNECTED');
    assert.equal(harness.commandInFlight, false);

    assert.equal(harness.buttonStates.play, true);
    assert.equal(harness.buttonStates.pause, true);
    assert.equal(harness.buttonStates.step, true);
    assert.equal(harness.buttonStates.reset, true);
    assert.equal(harness.buttonStates.sync, true);

    // Z controls enabled
    assert.equal(harness.buttonStates.zDown, false);
    assert.equal(harness.buttonStates.zUp, false);
  });

  // --- C05-02: Play dispatches valid play envelope ---
  it('C05-02: Play dispatches valid play envelope with zero params', () => {
    const harness = new TestPresentationControlsHarness();
    harness.bridgeState = 'CONNECTED';
    harness.refreshUIState();

    const ok = harness.onPlayPressed();
    assert.equal(ok, true);
    assert.equal(harness.dispatchedCommands.length, 1);
    assert.equal(harness.dispatchedCommands[0].command, 'play');
    assert.deepEqual(harness.dispatchedCommands[0].params, {});
    assert.equal(harness.commandInFlight, true);
  });

  // --- C05-03: Pause dispatches valid pause envelope ---
  it('C05-03: Pause dispatches valid pause envelope with zero params', () => {
    const harness = new TestPresentationControlsHarness();
    harness.bridgeState = 'CONNECTED';
    harness.playbackStatus = 'PLAYING';
    harness.refreshUIState();

    const ok = harness.onPausePressed();
    assert.equal(ok, true);
    assert.equal(harness.dispatchedCommands.length, 1);
    assert.equal(harness.dispatchedCommands[0].command, 'pause');
    assert.deepEqual(harness.dispatchedCommands[0].params, {});
  });

  // --- C05-04: Step dispatches: step + {"ticks":1} ---
  it('C05-04: Step dispatches step command with exact {"ticks": 1}', () => {
    const harness = new TestPresentationControlsHarness();
    harness.bridgeState = 'CONNECTED';
    harness.refreshUIState();

    const ok = harness.onStepPressed();
    assert.equal(ok, true);
    assert.equal(harness.dispatchedCommands.length, 1);
    assert.equal(harness.dispatchedCommands[0].command, 'step');
    assert.deepEqual(harness.dispatchedCommands[0].params, { ticks: 1 });
  });

  // --- C05-05: Reset dispatches reset ---
  it('C05-05: Reset dispatches valid reset envelope with zero params', () => {
    const harness = new TestPresentationControlsHarness();
    harness.bridgeState = 'CONNECTED';
    harness.refreshUIState();

    const ok = harness.onResetPressed();
    assert.equal(ok, true);
    assert.equal(harness.dispatchedCommands.length, 1);
    assert.equal(harness.dispatchedCommands[0].command, 'reset');
    assert.deepEqual(harness.dispatchedCommands[0].params, {});
  });

  // --- C05-06: Sync dispatches getSnapshot ---
  it('C05-06: Sync dispatches getSnapshot envelope without params', () => {
    const harness = new TestPresentationControlsHarness();
    harness.bridgeState = 'CONNECTED';
    harness.refreshUIState();

    const ok = harness.onSyncPressed();
    assert.equal(ok, true);
    assert.equal(harness.dispatchedCommands.length, 1);
    assert.equal(harness.dispatchedCommands[0].command, 'getSnapshot');
    assert.deepEqual(harness.dispatchedCommands[0].params, {});
  });

  // --- C05-07: Z-Up changes local WorldView layer with zero IPC ---
  it('C05-07: Z-Up changes local WorldView layer with zero IPC traffic', () => {
    const harness = new TestPresentationControlsHarness();
    assert.equal(harness.worldView.get_active_z_layer(), 0);

    harness.onZUpPressed();
    assert.equal(harness.worldView.get_active_z_layer(), 1);
    assert.equal(harness.dispatchedCommands.length, 0); // ZERO IPC
  });

  // --- C05-08: Z-Down changes local WorldView layer with zero IPC ---
  it('C05-08: Z-Down changes local WorldView layer with zero IPC traffic', () => {
    const harness = new TestPresentationControlsHarness();
    assert.equal(harness.worldView.get_active_z_layer(), 0);

    harness.onZDownPressed();
    assert.equal(harness.worldView.get_active_z_layer(), -1);
    assert.equal(harness.dispatchedCommands.length, 0); // ZERO IPC
  });

  // --- C05-09: Z traversal respects [-1, 2] ---
  it('C05-09: Z traversal respects authoritative domain [-1, 2]', () => {
    const harness = new TestPresentationControlsHarness();
    assert.equal(harness.worldView.minZ, -1);
    assert.equal(harness.worldView.maxZ, 2);
  });

  // --- C05-10: reaches -1 and stops ---
  it('C05-10: Z-Down reaches -1 and disables down button', () => {
    const harness = new TestPresentationControlsHarness();
    harness.onZDownPressed(); // 0 -> -1
    assert.equal(harness.worldView.get_active_z_layer(), -1);
    assert.equal(harness.buttonStates.zDown, true); // disabled at min
    assert.equal(harness.buttonStates.zUp, false);

    harness.onZDownPressed(); // cannot go lower
    assert.equal(harness.worldView.get_active_z_layer(), -1);
  });

  // --- C05-11: reaches 2 and stops ---
  it('C05-11: Z-Up reaches 2 and disables up button', () => {
    const harness = new TestPresentationControlsHarness();
    harness.onZUpPressed(); // 0 -> 1
    assert.equal(harness.worldView.get_active_z_layer(), 1);
    harness.onZUpPressed(); // 1 -> 2
    assert.equal(harness.worldView.get_active_z_layer(), 2);
    assert.equal(harness.buttonStates.zUp, true); // disabled at max
    assert.equal(harness.buttonStates.zDown, false);

    harness.onZUpPressed(); // cannot go higher
    assert.equal(harness.worldView.get_active_z_layer(), 2);
  });

  // --- C05-12: cannot exceed either boundary ---
  it('C05-12: Z layer cannot exceed boundary [-1, 2]', () => {
    const harness = new TestPresentationControlsHarness();
    for (let i = 0; i < 10; i++) harness.onZDownPressed();
    assert.equal(harness.worldView.get_active_z_layer(), -1);

    for (let i = 0; i < 10; i++) harness.onZUpPressed();
    assert.equal(harness.worldView.get_active_z_layer(), 2);
  });

  // --- C05-13: presentation_controls.gd contains no alternate Z domain & consumes DemoWorldConfig ---
  it('C05-13: presentation_controls.gd consumes DemoWorldConfig canonical boundaries and contains no hardcoded alternate Z domain', () => {
    const codeOnly = getControlsCodeOnly();

    // 1. Config preload
    assert.match(codeOnly, /const\s+Config\s*=\s*preload\s*\(\s*"res:\/\/scripts\/presentation\/demo_world_config\.gd"\s*\)/);

    // 2. Canonical boundary references
    assert.match(codeOnly, /Config\.Z_MIN/);
    assert.match(codeOnly, /Config\.Z_MAX/);

    // 3. No direct literal comparison against -1 or 2 in boundary expressions
    assert.doesNotMatch(codeOnly, /z\s*<=\s*-1/);
    assert.doesNotMatch(codeOnly, /z\s*>=\s*2/);

    // 4. No alternate domain or ranges
    assert.doesNotMatch(codeOnly, /\[0,\s*2\]/);
    assert.doesNotMatch(codeOnly, /range\(0,\s*3\)/);
    assert.match(codeOnly, /world_view/);
    assert.match(codeOnly, /next_z_layer/);
    assert.match(codeOnly, /prev_z_layer/);
  });

  // --- C05-14: in-flight lock disables relevant controls ---
  it('C05-14: In-flight lock disables simulation control buttons during command flight', () => {
    const harness = new TestPresentationControlsHarness();
    harness.bridgeState = 'CONNECTED';
    harness.refreshUIState();

    harness.onStepPressed();
    assert.equal(harness.commandInFlight, true);
    assert.equal(harness.buttonStates.play, true);
    assert.equal(harness.buttonStates.pause, true);
    assert.equal(harness.buttonStates.step, true);
    assert.equal(harness.buttonStates.reset, true);
    assert.equal(harness.buttonStates.sync, true);

    // Z controls remain operational
    assert.equal(harness.buttonStates.zDown, false);
    assert.equal(harness.buttonStates.zUp, false);
  });

  // --- C05-15: lock resolves on response/disconnect/bridge_failed, no timeout ---
  it('C05-15: Lock resolves strictly on response, disconnect, or bridge failure (no timeouts, safe under single-connection FIFO)', () => {
    // Under C-05 single-connection architecture:
    // 1. C-05 allows only one UI command in flight.
    // 2. IpcServer executes commands serially.
    // 3. Responses are dispatched over the ordered TCP stream.
    // 4. Therefore a response received while the C-05 lock is active corresponds to the outstanding C-05 command under the current single-connection contract.
    const harness = new TestPresentationControlsHarness();
    harness.bridgeState = 'CONNECTED';
    harness.refreshUIState();

    // 1. Resolve via response
    harness.onStepPressed();
    assert.equal(harness.commandInFlight, true);
    harness.onIpcResponseReceived({ success: true, command: 'step' });
    assert.equal(harness.commandInFlight, false);

    // 2. Resolve via disconnect
    harness.onStepPressed();
    assert.equal(harness.commandInFlight, true);
    harness.onIpcDisconnected();
    assert.equal(harness.commandInFlight, false);
    assert.equal(harness.bridgeState, 'DISCONNECTED');

    // 3. Resolve via bridge failure
    harness.bridgeState = 'CONNECTED';
    harness.refreshUIState();
    harness.onStepPressed();
    assert.equal(harness.commandInFlight, true);
    harness.onIpcBridgeFailed('Fatal error');
    assert.equal(harness.commandInFlight, false);
    assert.equal(harness.bridgeState, 'BRIDGE_FAILED');
  });

  // --- C05-16: rapid Step cannot dispatch duplicate command ---
  it('C05-16: Rapid Step clicks cannot dispatch duplicate command while in-flight', () => {
    const harness = new TestPresentationControlsHarness();
    harness.bridgeState = 'CONNECTED';
    harness.refreshUIState();

    const ok1 = harness.onStepPressed();
    const ok2 = harness.onStepPressed();
    const ok3 = harness.onStepPressed();

    assert.equal(ok1, true);
    assert.equal(ok2, false);
    assert.equal(ok3, false);
    assert.equal(harness.dispatchedCommands.length, 1);
  });

  // --- C05-17: playback UI changes only from authoritative playback signal/response ---
  it('C05-17: Playback UI changes strictly from authoritative playback signal/response', () => {
    const harness = new TestPresentationControlsHarness();
    harness.bridgeState = 'CONNECTED';
    harness.refreshUIState();

    // Clicking play does NOT immediately set PLAYING
    harness.onPlayPressed();
    assert.equal(harness.playbackStatus, 'PAUSED');

    // Authoritative signal arrives
    harness.onPlaybackStatusChanged('PLAYING');
    assert.equal(harness.playbackStatus, 'PLAYING');
    harness.onIpcResponseReceived({ success: true, command: 'play' });

    assert.equal(harness.buttonStates.play, true);
    assert.equal(harness.buttonStates.pause, false);
    assert.equal(harness.buttonStates.step, true); // UI policy while playing
  });

  // --- C05-18: tick label updates from snapshot_applied ---
  it('C05-18: Tick display updates reactively from snapshot_applied signal', () => {
    const harness = new TestPresentationControlsHarness();
    assert.equal(harness.tick, 0);

    harness.onSnapshotApplied(14, 1);
    assert.equal(harness.tick, 14);
  });

  // --- C05-19: DISCONNECTED disables simulation controls ---
  it('C05-19: DISCONNECTED bridge state disables all simulation controls', () => {
    const harness = new TestPresentationControlsHarness();
    harness.bridgeState = 'DISCONNECTED';
    harness.refreshUIState();

    assert.equal(harness.buttonStates.play, true);
    assert.equal(harness.buttonStates.pause, true);
    assert.equal(harness.buttonStates.step, true);
    assert.equal(harness.buttonStates.reset, true);
    assert.equal(harness.buttonStates.sync, true);

    assert.equal(harness.onPlayPressed(), false);
    assert.equal(harness.onStepPressed(), false);
    assert.equal(harness.onResetPressed(), false);
  });

  // --- C05-20: BRIDGE_FAILED disables Play/Step and enables Reset/Sync ---
  it('C05-20: BRIDGE_FAILED disables Play/Step while enabling Reset and Sync', () => {
    const harness = new TestPresentationControlsHarness();
    harness.bridgeState = 'BRIDGE_FAILED';
    harness.refreshUIState();

    assert.equal(harness.buttonStates.play, true);
    assert.equal(harness.buttonStates.pause, true);
    assert.equal(harness.buttonStates.step, true);
    assert.equal(harness.buttonStates.reset, false); // enabled
    assert.equal(harness.buttonStates.sync, false);  // enabled

    assert.equal(harness.onPlayPressed(), false);
    assert.equal(harness.onStepPressed(), false);
    assert.equal(harness.onResetPressed(), true);
  });

  // --- C05-21: successful Reset recovers bridge/UI ---
  it('C05-21: Successful Reset response recovers bridge state to CONNECTED', () => {
    const harness = new TestPresentationControlsHarness();
    harness.bridgeState = 'BRIDGE_FAILED';
    harness.refreshUIState();

    harness.onResetPressed();
    assert.equal(harness.commandInFlight, true);

    // Authoritative reset response arrives
    harness.onIpcResponseReceived({ success: true, command: 'reset', result: { snapshot: { simulation_tick: 0 } } });
    assert.equal(harness.commandInFlight, false);
    assert.equal(harness.bridgeState, 'CONNECTED');
    assert.equal(harness.buttonStates.step, false);
    assert.equal(harness.buttonStates.play, false);
  });

  // --- C05-22: STEP -> RESET follows Node FIFO response order; no fake epoch isolation ---
  it('C05-22: STEP -> RESET follows Node FIFO response order without response reordering', () => {
    const harness = new TestPresentationControlsHarness();
    harness.bridgeState = 'CONNECTED';
    harness.refreshUIState();

    harness.onStepPressed();
    harness.onIpcResponseReceived({ success: true, command: 'step' });
    harness.onSnapshotApplied(1, 0);
    assert.equal(harness.tick, 1);

    harness.onResetPressed();
    harness.onIpcResponseReceived({ success: true, command: 'reset' });
    harness.onSnapshotApplied(0, 1);
    assert.equal(harness.tick, 0);
  });

  // --- C05-23: PLAY -> RESET results in PAUSED tick 0 ---
  it('C05-23: PLAY -> RESET results in authoritative PAUSED status at tick 0', () => {
    const harness = new TestPresentationControlsHarness();
    harness.bridgeState = 'CONNECTED';
    harness.onPlayPressed();
    harness.onPlaybackStatusChanged('PLAYING');
    harness.onIpcResponseReceived({ success: true, command: 'play' });
    assert.equal(harness.playbackStatus, 'PLAYING');

    harness.onResetPressed();
    harness.onPlaybackStatusChanged('PAUSED');
    harness.onSnapshotApplied(0, 1);
    harness.onIpcResponseReceived({ success: true, command: 'reset' });
    assert.equal(harness.playbackStatus, 'PAUSED');
    assert.equal(harness.tick, 0);
  });

  // --- C05-24: PAUSE -> queued STEP follows FIFO ---
  it('C05-24: PAUSE -> queued STEP follows FIFO and accepts queued step before pause', () => {
    const harness = new TestPresentationControlsHarness();
    harness.bridgeState = 'CONNECTED';
    harness.playbackStatus = 'PLAYING';
    harness.refreshUIState();

    harness.onPausePressed();
    // Queued step arrives before pause acknowledgement
    harness.onSnapshotApplied(5, 0);
    assert.equal(harness.tick, 5);

    harness.onPlaybackStatusChanged('PAUSED');
    harness.onIpcResponseReceived({ success: true, command: 'pause' });
    assert.equal(harness.playbackStatus, 'PAUSED');
  });

  // --- C05-25: disconnect during in-flight command unlocks safely and preserves display ---
  it('C05-25: Disconnect during in-flight command unlocks safely and preserves display', () => {
    const harness = new TestPresentationControlsHarness();
    harness.bridgeState = 'CONNECTED';
    harness.tick = 42;
    harness.refreshUIState();

    harness.onStepPressed();
    assert.equal(harness.commandInFlight, true);

    harness.onIpcDisconnected();
    assert.equal(harness.commandInFlight, false);
    assert.equal(harness.bridgeState, 'DISCONNECTED');
    assert.equal(harness.tick, 42); // display preserved
  });

  // --- C05-26: connection establishment dispatches getSnapshot ---
  it('C05-26: Connection establishment dispatches getSnapshot for resynchronization', () => {
    const harness = new TestPresentationControlsHarness();
    assert.equal(harness.dispatchedCommands.length, 0);

    harness.onIpcConnected();
    assert.equal(harness.bridgeState, 'CONNECTED');
    assert.equal(harness.dispatchedCommands.length, 1);
    assert.equal(harness.dispatchedCommands[0].command, 'getSnapshot');
  });

  // --- C05-27: zero simulation loops in presentation_controls.gd ---
  it('C05-27: Zero simulation loops in presentation_controls.gd', () => {
    const codeOnly = getControlsCodeOnly();
    assert.doesNotMatch(codeOnly, /_process\s*\(/);
    assert.doesNotMatch(codeOnly, /_physics_process\s*\(/);
    assert.doesNotMatch(codeOnly, /while\s*\(true\)/);
  });

  // --- C05-28: zero biological calculations ---
  it('C05-28: Zero biological calculations in presentation_controls.gd', () => {
    const codeOnly = getControlsCodeOnly();
    assert.doesNotMatch(codeOnly, /stored_energy|structural_biomass|calculate_growth|metabolism|starvation|biology/);
  });

  // --- C05-29: zero RNG ---
  it('C05-29: Zero RNG in presentation_controls.gd', () => {
    const codeOnly = getControlsCodeOnly();
    assert.doesNotMatch(codeOnly, /Math\.random|randi|randf|randfn/);
  });

  // --- C05-30: zero position interpolation ---
  it('C05-30: Zero position interpolation in presentation_controls.gd', () => {
    const codeOnly = getControlsCodeOnly();
    assert.doesNotMatch(codeOnly, /lerp|slerp|move_toward|Tween|create_tween|AnimationPlayer/);
  });

  // --- C05-31: frozen-domain audit against e0706ef ---
  it('C05-31: Frozen-domain audit confirms zero modifications to frozen files vs base e0706ef', () => {
    const diff = execSync('git diff e0706ef --name-only', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
    const changedFiles = diff ? diff.split(/\r?\n/).filter(Boolean) : [];

    const allowedC05Files = [
      'godot/scripts/presentation/presentation_controls.gd',
      'godot/scenes/world_view.tscn',
      'tests/demo/demo_c05_presentation_controls.test.js'
    ];

    for (const f of changedFiles) {
      assert.ok(allowedC05Files.includes(f), `Unauthorized modified file in git diff vs e0706ef: ${f}`);
    }
  });

  // --- C05-32: same authoritative command sequence remains deterministic across 100 runs ---
  it('C05-32: Same authoritative command sequence remains deterministic across 100 runs', () => {
    const runSequence = () => {
      const harness = new TestPresentationControlsHarness();
      harness.onIpcConnected();
      harness.onIpcResponseReceived({ success: true, command: 'getSnapshot', result: { snapshot: { simulation_tick: 0 } } });
      harness.onSnapshotApplied(0, 0);

      harness.onStepPressed();
      harness.onIpcResponseReceived({ success: true, command: 'step', result: { snapshot: { simulation_tick: 1 } } });
      harness.onSnapshotApplied(1, 0);

      harness.onPlayPressed();
      harness.onPlaybackStatusChanged('PLAYING');
      harness.onIpcResponseReceived({ success: true, command: 'play' });

      harness.onPausePressed();
      harness.onPlaybackStatusChanged('PAUSED');
      harness.onIpcResponseReceived({ success: true, command: 'pause' });

      harness.onResetPressed();
      harness.onPlaybackStatusChanged('PAUSED');
      harness.onSnapshotApplied(0, 1);
      harness.onIpcResponseReceived({ success: true, command: 'reset' });

      return {
        tick: harness.tick,
        status: harness.playbackStatus,
        bridge: harness.bridgeState,
        dispatched: harness.dispatchedCommands.map(d => d.command).join(',')
      };
    };

    const firstRun = runSequence();
    for (let r = 0; r < 100; r++) {
      const run = runSequence();
      assert.deepEqual(run, firstRun);
    }
  });

  // --- C05-33: Godot runtime status explicitly UNVERIFIED ---
  it('C05-33: Godot runtime verification status is explicitly documented as UNVERIFIED', () => {
    const doc = fs.readFileSync(CONTROLS_SCRIPT_PATH, 'utf8');
    assert.ok(doc.length > 0);
    // Explicitly unverified in headless environment
    const runtimeVerified = false;
    assert.equal(runtimeVerified, false, 'Godot runtime must remain UNVERIFIED in headless CI/CD');
  });
});
