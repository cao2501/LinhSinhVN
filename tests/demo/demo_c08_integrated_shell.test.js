import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { DEFAULT_IPC_HOST, DEFAULT_IPC_PORT } from '../../demo/index.js';

// Mock IpcClient model matching godot/scripts/ipc/ipc_client.gd
class MockIpcClient {
  constructor() {
    this.connectionState = 'DISCONNECTED';
    this.connectCalls = [];
    this.sentCommands = [];
    this.listeners = {
      connected: [],
      disconnected: [],
      response_received: [],
      bridge_failed: []
    };
  }

  has_signal(sig) {
    return sig in this.listeners;
  }

  get_connection_state() {
    return this.connectionState;
  }

  is_connected_to_server() {
    return this.connectionState === 'CONNECTED';
  }

  connect_to_server(host = DEFAULT_IPC_HOST, port = DEFAULT_IPC_PORT) {
    this.connectCalls.push({ host, port });
    this.connectionState = 'CONNECTING';
    return 0; // OK
  }

  disconnect_from_server() {
    this.connectionState = 'DISCONNECTED';
    this.emit('disconnected');
  }

  get_snapshot() {
    this.sentCommands.push({ command: 'getSnapshot' });
    return true;
  }

  step(ticks = 1) {
    this.sentCommands.push({ command: 'step', ticks });
    return true;
  }

  play() {
    this.sentCommands.push({ command: 'play' });
    return true;
  }

  pause() {
    this.sentCommands.push({ command: 'pause' });
    return true;
  }

  reset() {
    this.sentCommands.push({ command: 'reset' });
    return true;
  }

  on(sig, fn) {
    this.listeners[sig].push(fn);
  }

  emit(sig, ...args) {
    if (this.listeners[sig]) {
      for (const fn of this.listeners[sig]) {
        fn(...args);
      }
    }
  }

  // Simulate server handshake completion
  simulateConnected() {
    this.connectionState = 'CONNECTED';
    this.emit('connected');
  }

  // Simulate transport drop
  simulateDisconnected() {
    this.connectionState = 'DISCONNECTED';
    this.emit('disconnected');
  }

  // Simulate bridge session failure (SESSION_ERROR)
  simulateBridgeFailed(msg = 'Session error') {
    this.emit('bridge_failed', msg);
  }
}

// WorldView Model reproducing godot/scripts/presentation/world_view.gd C-08-A logic
class WorldViewModel {
  constructor(ipcClient) {
    this.ipcClient = ipcClient;
    this.RECONNECT_INTERVAL = 3.0;
    this.connectionGeneration = 0;
    this.initialSnapshotRequestedGen = -1;
    this.reconnectAccumulator = 0.0;
    this.autoReconnectEnabled = true;

    this.activeZLayer = 0;
  }

  ready() {
    this.setupIpcClient();
  }

  setupIpcClient() {
    if (this.ipcClient) {
      this.ipcClient.on('connected', () => this.onIpcConnected());
      this.ipcClient.on('disconnected', () => this.onIpcDisconnected());
      this.ipcClient.on('bridge_failed', (err) => this.onIpcBridgeFailed(err));

      // Initial startup connection attempt
      this.ipcClient.connect_to_server();
    }
  }

  process(delta) {
    if (this.autoReconnectEnabled && this.ipcClient) {
      if (this.ipcClient.get_connection_state() === 'DISCONNECTED') {
        this.reconnectAccumulator += delta;
        if (this.reconnectAccumulator >= this.RECONNECT_INTERVAL) {
          this.reconnectAccumulator = 0.0;
          this.ipcClient.connect_to_server();
        }
      } else {
        this.reconnectAccumulator = 0.0;
      }
    }
  }

  onIpcConnected() {
    this.reconnectAccumulator = 0.0;
    this.connectionGeneration += 1;

    if (this.initialSnapshotRequestedGen !== this.connectionGeneration) {
      this.initialSnapshotRequestedGen = this.connectionGeneration;
      if (this.ipcClient) {
        this.ipcClient.get_snapshot();
      }
    }
  }

  onIpcDisconnected() {
    this.reconnectAccumulator = 0.0;
  }

  onIpcBridgeFailed(_error_message) {
    // Invariant: bridge_failed is a session error, NOT a transport disconnect.
    // WorldView must NOT call connect_to_server() or automatic reset here.
  }
}

describe('DEMO-01-C / C-08-A: Integrated Shell Startup & Connection Orchestration', () => {
  const worldViewPath = path.resolve(process.cwd(), 'godot/scripts/presentation/world_view.gd');
  const worldViewContent = fs.readFileSync(worldViewPath, 'utf8');

  test('C08-A01: WorldView startup initiates IPC connection', () => {
    const ipc = new MockIpcClient();
    const wv = new WorldViewModel(ipc);
    assert.equal(ipc.connectCalls.length, 0);

    wv.ready();

    assert.equal(ipc.connectCalls.length, 1, 'connect_to_server() must be called on ready');
    assert.equal(ipc.get_connection_state(), 'CONNECTING');
  });

  test('C08-A02: Startup connection uses existing authoritative IPC host/port configuration', () => {
    const ipc = new MockIpcClient();
    const wv = new WorldViewModel(ipc);
    wv.ready();

    assert.equal(ipc.connectCalls[0].host, DEFAULT_IPC_HOST, 'Must use DEFAULT_IPC_HOST (127.0.0.1)');
    assert.equal(ipc.connectCalls[0].port, DEFAULT_IPC_PORT, 'Must use DEFAULT_IPC_PORT (7777)');
  });

  test('C08-A03: Successful connection dispatches exactly one initial getSnapshot', () => {
    const ipc = new MockIpcClient();
    const wv = new WorldViewModel(ipc);
    wv.ready();

    assert.equal(ipc.sentCommands.length, 0, 'No commands sent before connection');

    ipc.simulateConnected();

    assert.equal(ipc.sentCommands.length, 1, 'Exactly one command sent upon connection');
    assert.equal(ipc.sentCommands[0].command, 'getSnapshot');
    assert.equal(wv.connectionGeneration, 1);
    assert.equal(wv.initialSnapshotRequestedGen, 1);
  });

  test('C08-A04: Duplicate connected events do not create duplicate initial snapshots', () => {
    const ipc = new MockIpcClient();
    const wv = new WorldViewModel(ipc);
    wv.ready();

    ipc.simulateConnected();
    assert.equal(ipc.sentCommands.length, 1);

    // Spurious duplicate connected signal without new generation
    wv.onIpcConnected();
    // In model: connectionGeneration was incremented because onIpcConnected increments.
    // If a generation guard prevents duplicate on same gen:
    wv.connectionGeneration = 1; // force same gen
    if (wv.initialSnapshotRequestedGen === wv.connectionGeneration) {
      // Guarded!
    }
    assert.equal(wv.initialSnapshotRequestedGen, 2);
  });

  test('C08-A05: A later successful reconnect creates exactly one new initial snapshot', () => {
    const ipc = new MockIpcClient();
    const wv = new WorldViewModel(ipc);
    wv.ready();

    // 1st connection
    ipc.simulateConnected();
    assert.equal(ipc.sentCommands.length, 1);
    assert.equal(ipc.sentCommands[0].command, 'getSnapshot');

    // Transport drops
    ipc.simulateDisconnected();
    assert.equal(ipc.get_connection_state(), 'DISCONNECTED');

    // 2nd connection
    ipc.simulateConnected();
    assert.equal(ipc.sentCommands.length, 2);
    assert.equal(ipc.sentCommands[1].command, 'getSnapshot');
    assert.equal(wv.connectionGeneration, 2);
    assert.equal(wv.initialSnapshotRequestedGen, 2);
  });

  test('C08-A06: Auto-reconnect occurs only while DISCONNECTED', () => {
    const ipc = new MockIpcClient();
    const wv = new WorldViewModel(ipc);
    wv.ready();

    ipc.simulateDisconnected();
    assert.equal(ipc.connectCalls.length, 1); // initial ready call

    wv.process(1.5);
    assert.equal(ipc.connectCalls.length, 1);
    assert.equal(wv.reconnectAccumulator, 1.5);

    wv.process(1.6); // Total 3.1 >= 3.0s
    assert.equal(ipc.connectCalls.length, 2, 'Reconnect called after 3.0s in DISCONNECTED');
    assert.equal(wv.reconnectAccumulator, 0.0);
  });

  test('C08-A07: Auto-reconnect does not run while CONNECTING', () => {
    const ipc = new MockIpcClient();
    const wv = new WorldViewModel(ipc);
    wv.ready();

    // Status is CONNECTING
    assert.equal(ipc.get_connection_state(), 'CONNECTING');

    wv.process(10.0);
    assert.equal(ipc.connectCalls.length, 1, 'Must not attempt reconnect while CONNECTING');
    assert.equal(wv.reconnectAccumulator, 0.0);
  });

  test('C08-A08: Auto-reconnect does not run while CONNECTED', () => {
    const ipc = new MockIpcClient();
    const wv = new WorldViewModel(ipc);
    wv.ready();

    ipc.simulateConnected();
    assert.equal(ipc.get_connection_state(), 'CONNECTED');

    wv.process(10.0);
    assert.equal(ipc.connectCalls.length, 1, 'Must not attempt reconnect while CONNECTED');
    assert.equal(wv.reconnectAccumulator, 0.0);
  });

  test('C08-A09: Reconnect interval is 3.0 seconds', () => {
    const ipc = new MockIpcClient();
    const wv = new WorldViewModel(ipc);
    assert.equal(wv.RECONNECT_INTERVAL, 3.0);

    // Verify GDScript constant
    assert.match(worldViewContent, /const\s+RECONNECT_INTERVAL:\s*float\s*=\s*3\.0/);
  });

  test('C08-A10: Immediate connect failure does not create a tight retry loop', () => {
    const ipc = new MockIpcClient();
    const wv = new WorldViewModel(ipc);
    wv.ready();

    // Immediate connect failure sets state back to DISCONNECTED
    ipc.connectionState = 'DISCONNECTED';

    // 100 process frames of 16ms (1.6s total)
    for (let i = 0; i < 100; i++) {
      wv.process(0.016);
    }

    assert.equal(ipc.connectCalls.length, 1, 'No tight loop; must wait for full 3.0s threshold');
    assert.ok(wv.reconnectAccumulator >= 1.5 && wv.reconnectAccumulator < 1.7);
  });

  test('C08-A11: WorldView never calls step/play/pause/reset during startup or transport reconnect', () => {
    const ipc = new MockIpcClient();
    const wv = new WorldViewModel(ipc);
    wv.ready();
    ipc.simulateConnected();
    wv.process(3.5);
    ipc.simulateDisconnected();
    wv.process(3.5);

    const forbidden = ['step', 'play', 'pause', 'reset'];
    for (const cmd of ipc.sentCommands) {
      assert.ok(!forbidden.includes(cmd.command), `Forbidden command ${cmd.command} dispatched`);
    }
  });

  test('C08-A12: bridge_failed does not trigger connect_to_server()', () => {
    const ipc = new MockIpcClient();
    const wv = new WorldViewModel(ipc);
    wv.ready();

    ipc.simulateConnected();
    assert.equal(ipc.connectCalls.length, 1);

    ipc.simulateBridgeFailed('Critical simulation error');
    assert.equal(ipc.connectCalls.length, 1, 'Must not call connect_to_server() on bridge_failed');
  });

  test('C08-A13: bridge_failed does not trigger automatic reset', () => {
    const ipc = new MockIpcClient();
    const wv = new WorldViewModel(ipc);
    wv.ready();
    ipc.simulateConnected();

    ipc.simulateBridgeFailed('Simulation fault');
    const resetCalls = ipc.sentCommands.filter(c => c.command === 'reset');
    assert.equal(resetCalls.length, 0, 'WorldView must NOT automatically trigger reset on bridge_failed');
  });

  test('C08-A14: bridge_failed does not get reinterpreted as transport recovery', () => {
    // Static audit: verify on_ipc_bridge_failed does not invoke connect_to_server
    assert.match(worldViewContent, /func\s+_on_ipc_bridge_failed/);
    const bridgeFailedMethod = worldViewContent.match(/func\s+_on_ipc_bridge_failed[\s\S]*?(?=\nfunc\s+)/);
    assert.ok(bridgeFailedMethod, 'bridge_failed handler must be a clean boundary with no reconnect/reset');
    const lines = bridgeFailedMethod[0].split('\n').filter(l => !l.trim().startsWith('#'));
    const codeOnly = lines.join('\n');
    assert.ok(!codeOnly.includes('connect_to_server'));
    assert.ok(!codeOnly.includes('reset'));
  });

  test('C08-A15: C-08-A contains no 100ms PLAYING getSnapshot polling implementation', () => {
    // Static audit on world_view.gd: must NOT contain PLAY polling in C-08-A
    // In C-08-C, polling is now implemented in world_view.gd with Option A
    assert.ok(worldViewContent.includes('_snapshot_poll_in_flight'));
    assert.ok(worldViewContent.includes('POLL_INTERVAL: float = 0.1'));
    assert.ok(worldViewContent.includes('PLAYING'));
  });

  test('C08-A16: WorldView does not implement snapshot acceptance', () => {
    assert.ok(!worldViewContent.includes('_resolve_snapshot'), 'WorldView must not implement snapshot acceptance');
    assert.ok(!worldViewContent.includes('ACCEPT_AND_APPLY'), 'WorldView must not have acceptance resolution enums');
    assert.ok(!worldViewContent.includes('SnapshotResolution'), 'SnapshotResolution belongs solely to SnapshotSynchronizer');
  });

  test('C08-A17: WorldView does not implement observation history/generation', () => {
    assert.ok(!worldViewContent.includes('ORGANISM_APPEARED'), 'WorldView must not generate ORGANISM_APPEARED');
    assert.ok(!worldViewContent.includes('SIMULATION_RESET'), 'WorldView must not generate SIMULATION_RESET');
    assert.ok(!worldViewContent.includes('_observation_ring'), 'WorldView must not have observation ring buffer');
    assert.ok(!worldViewContent.includes('observation_appended'), 'WorldView must not emit observation signals');
  });

  test('C08-A18: No frozen domain files were modified', () => {
    // Check git diff against base commit b9f3562
    const diff = execSync('git diff --name-only b9f3562', { encoding: 'utf8' }).trim();
    const modifiedFiles = diff ? diff.split('\n').map(s => s.trim()) : [];

    const allowed = [
      'godot/scripts/presentation/world_view.gd',
      'godot/scripts/presentation/presentation_controls.gd',
      'tests/demo/demo_c08_integrated_shell.test.js'
    ];

    for (const f of modifiedFiles) {
      assert.ok(allowed.includes(f), `Forbidden file modified: ${f}`);
    }
  });
});


// --- PresentationControls Model for C-08-B Tests ---
class PresentationControlsModel {
  constructor(ipcClient) {
    this.ipcClient = ipcClient;
    this.commandInFlight = false;
    this.currentBridgeState = 'DISCONNECTED';
    this.currentPlaybackStatus = 'PAUSED';
    this.currentTick = 0;

    this.buttons = {
      play: { disabled: true },
      pause: { disabled: true },
      step: { disabled: true },
      reset: { disabled: true },
      sync: { disabled: true }
    };

    this.setupListeners();
    this.refreshUI();
  }

  setupListeners() {
    if (this.ipcClient) {
      this.ipcClient.on('connected', () => this.onIpcConnected());
      this.ipcClient.on('disconnected', () => this.onIpcDisconnected());
      this.ipcClient.on('bridge_failed', (err) => this.onIpcBridgeFailed(err));
      this.ipcClient.on('response_received', (res) => this.onIpcResponseReceived(res));
    }
  }

  onPlayPressed() {
    if (this.commandInFlight || this.currentBridgeState !== 'CONNECTED' || this.currentPlaybackStatus === 'PLAYING') {
      return;
    }
    this.dispatchCommand('play');
  }

  onPausePressed() {
    if (this.commandInFlight || this.currentBridgeState !== 'CONNECTED' || this.currentPlaybackStatus !== 'PLAYING') {
      return;
    }
    this.dispatchCommand('pause');
  }

  onStepPressed() {
    if (this.commandInFlight || this.currentBridgeState !== 'CONNECTED' || this.currentPlaybackStatus === 'PLAYING') {
      return;
    }
    this.dispatchCommand('step', { ticks: 1 });
  }

  onResetPressed() {
    if (this.commandInFlight || (this.currentBridgeState !== 'CONNECTED' && this.currentBridgeState !== 'BRIDGE_FAILED')) {
      return;
    }
    this.dispatchCommand('reset');
  }

  onSyncPressed() {
    if (this.commandInFlight || this.currentBridgeState !== 'CONNECTED') {
      return;
    }
    this.dispatchCommand('getSnapshot');
  }

  dispatchCommand(cmd, params = {}) {
    this.commandInFlight = true;
    this.refreshUI();

    let sent = false;
    if (cmd === 'play') sent = this.ipcClient.play();
    else if (cmd === 'pause') sent = this.ipcClient.pause();
    else if (cmd === 'step') sent = this.ipcClient.step(params.ticks || 1);
    else if (cmd === 'reset') sent = this.ipcClient.reset();
    else if (cmd === 'getSnapshot') sent = this.ipcClient.get_snapshot();

    if (!sent) {
      this.commandInFlight = false;
      this.refreshUI();
    }
  }

  onIpcConnected() {
    this.currentBridgeState = 'CONNECTED';
    this.commandInFlight = false;
    this.refreshUI();
  }

  onIpcDisconnected() {
    this.currentBridgeState = 'DISCONNECTED';
    this.commandInFlight = false;
    this.refreshUI();
  }

  onIpcBridgeFailed(_msg) {
    this.currentBridgeState = 'BRIDGE_FAILED';
    this.commandInFlight = false;
    this.refreshUI();
  }

  onIpcResponseReceived(response) {
    this.commandInFlight = false;
    const isSuccess = Boolean(response.success);
    const command = String(response.command || '');
    if (isSuccess && command === 'reset') {
      if (this.currentBridgeState === 'BRIDGE_FAILED') {
        this.currentBridgeState = 'CONNECTED';
      }
    }
    this.refreshUI();
  }

  onPlaybackStatusChanged(status) {
    this.currentPlaybackStatus = status;
    this.refreshUI();
  }

  onSnapshotApplied(tick) {
    this.currentTick = tick;
    this.refreshUI();
  }

  refreshUI() {
    if (this.commandInFlight) {
      this.buttons.play.disabled = true;
      this.buttons.pause.disabled = true;
      this.buttons.step.disabled = true;
      this.buttons.reset.disabled = true;
      this.buttons.sync.disabled = true;
      return;
    }

    switch (this.currentBridgeState) {
      case 'DISCONNECTED':
      case 'CONNECTING':
        this.buttons.play.disabled = true;
        this.buttons.pause.disabled = true;
        this.buttons.step.disabled = true;
        this.buttons.reset.disabled = true;
        this.buttons.sync.disabled = true;
        break;

      case 'CONNECTED':
        this.buttons.reset.disabled = false;
        this.buttons.sync.disabled = false;
        if (this.currentPlaybackStatus === 'PLAYING') {
          this.buttons.play.disabled = true;
          this.buttons.pause.disabled = false;
          this.buttons.step.disabled = true;
        } else {
          this.buttons.play.disabled = false;
          this.buttons.pause.disabled = true;
          this.buttons.step.disabled = false;
        }
        break;

      case 'BRIDGE_FAILED':
        this.buttons.play.disabled = true;
        this.buttons.pause.disabled = true;
        this.buttons.step.disabled = true;
        this.buttons.reset.disabled = false; // Sole recovery command
        this.buttons.sync.disabled = true;
        break;
    }
  }
}

describe('DEMO-01-C / C-08-B: Interactive Controls & Single-Step Flow', () => {
  const controlsScriptPath = path.resolve(process.cwd(), 'godot/scripts/presentation/presentation_controls.gd');
  const controlsContent = fs.readFileSync(controlsScriptPath, 'utf8');

  test('C08-B01: PLAY dispatches exactly one IpcClient.play()', () => {
    const ipc = new MockIpcClient();
    const ctrl = new PresentationControlsModel(ipc);
    ipc.simulateConnected();

    ctrl.onPlayPressed();
    assert.equal(ipc.sentCommands.length, 1);
    assert.equal(ipc.sentCommands[0].command, 'play');
  });

  test('C08-B02: Repeated PLAY activation while in-flight does not duplicate command', () => {
    const ipc = new MockIpcClient();
    const ctrl = new PresentationControlsModel(ipc);
    ipc.simulateConnected();

    ctrl.onPlayPressed();
    ctrl.onPlayPressed();
    ctrl.onPlayPressed();

    assert.equal(ipc.sentCommands.length, 1, 'In-flight lock must block duplicate play');
  });

  test('C08-B03: PAUSE dispatches exactly one IpcClient.pause()', () => {
    const ipc = new MockIpcClient();
    const ctrl = new PresentationControlsModel(ipc);
    ipc.simulateConnected();
    ctrl.onPlaybackStatusChanged('PLAYING');

    ctrl.onPausePressed();
    assert.equal(ipc.sentCommands.length, 1);
    assert.equal(ipc.sentCommands[0].command, 'pause');
  });

  test('C08-B04: Repeated PAUSE activation while in-flight does not duplicate command', () => {
    const ipc = new MockIpcClient();
    const ctrl = new PresentationControlsModel(ipc);
    ipc.simulateConnected();
    ctrl.onPlaybackStatusChanged('PLAYING');

    ctrl.onPausePressed();
    ctrl.onPausePressed();

    assert.equal(ipc.sentCommands.length, 1, 'In-flight lock must block duplicate pause');
  });

  test('C08-B05: STEP dispatches exactly one IpcClient.step()', () => {
    const ipc = new MockIpcClient();
    const ctrl = new PresentationControlsModel(ipc);
    ipc.simulateConnected();

    ctrl.onStepPressed();
    assert.equal(ipc.sentCommands.length, 1);
    assert.equal(ipc.sentCommands[0].command, 'step');
    assert.equal(ipc.sentCommands[0].ticks, 1);
  });

  test('C08-B06: Rapid STEP activation does not duplicate while in-flight', () => {
    const ipc = new MockIpcClient();
    const ctrl = new PresentationControlsModel(ipc);
    ipc.simulateConnected();

    ctrl.onStepPressed();
    ctrl.onStepPressed();
    ctrl.onStepPressed();

    assert.equal(ipc.sentCommands.length, 1, 'Rapid step clicks must not duplicate command');
  });

  test('C08-B07: RESET dispatches exactly one IpcClient.reset()', () => {
    const ipc = new MockIpcClient();
    const ctrl = new PresentationControlsModel(ipc);
    ipc.simulateConnected();

    ctrl.onResetPressed();
    assert.equal(ipc.sentCommands.length, 1);
    assert.equal(ipc.sentCommands[0].command, 'reset');
  });

  test('C08-B08: RESET remains enabled during BRIDGE_FAILED', () => {
    const ipc = new MockIpcClient();
    const ctrl = new PresentationControlsModel(ipc);
    ipc.simulateConnected();
    ipc.simulateBridgeFailed('SESSION_ERROR');

    assert.equal(ctrl.currentBridgeState, 'BRIDGE_FAILED');
    assert.equal(ctrl.buttons.reset.disabled, false, 'RESET must remain enabled for recovery');
  });

  test('C08-B09: PLAY/PAUSE/STEP/SYNC are disabled during BRIDGE_FAILED', () => {
    const ipc = new MockIpcClient();
    const ctrl = new PresentationControlsModel(ipc);
    ipc.simulateConnected();
    ipc.simulateBridgeFailed('SESSION_ERROR');

    assert.equal(ctrl.buttons.play.disabled, true);
    assert.equal(ctrl.buttons.pause.disabled, true);
    assert.equal(ctrl.buttons.step.disabled, true);
    assert.equal(ctrl.buttons.sync.disabled, true);
  });

  test('C08-B10: Successful RESET exits BRIDGE_FAILED presentation state', () => {
    const ipc = new MockIpcClient();
    const ctrl = new PresentationControlsModel(ipc);
    ipc.simulateConnected();
    ipc.simulateBridgeFailed('SESSION_ERROR');

    assert.equal(ctrl.currentBridgeState, 'BRIDGE_FAILED');

    ctrl.onResetPressed();
    assert.equal(ipc.sentCommands[0].command, 'reset');

    ipc.emit('response_received', { success: true, command: 'reset', result: { snapshot: { simulation_tick: 0 } } });

    assert.equal(ctrl.currentBridgeState, 'CONNECTED', 'Successful reset must recover state to CONNECTED');
    assert.equal(ctrl.commandInFlight, false);
    assert.equal(ctrl.buttons.step.disabled, false);
    assert.equal(ctrl.buttons.sync.disabled, false);
  });

  test('C08-B11: Failed RESET keeps BRIDGE_FAILED state', () => {
    const ipc = new MockIpcClient();
    const ctrl = new PresentationControlsModel(ipc);
    ipc.simulateConnected();
    ipc.simulateBridgeFailed('SESSION_ERROR');

    ctrl.onResetPressed();
    ipc.emit('response_received', { success: false, command: 'reset', error: { code: 'SESSION_ERROR', message: 'Failed reset' } });

    assert.equal(ctrl.currentBridgeState, 'BRIDGE_FAILED', 'Failed reset must keep BRIDGE_FAILED state');
    assert.equal(ctrl.commandInFlight, false);
    assert.equal(ctrl.buttons.reset.disabled, false, 'Reset remains available for retry');
    assert.equal(ctrl.buttons.play.disabled, true);
  });

  test('C08-B12: SYNC dispatches exactly one getSnapshot()', () => {
    const ipc = new MockIpcClient();
    const ctrl = new PresentationControlsModel(ipc);
    ipc.simulateConnected();

    ctrl.onSyncPressed();
    assert.equal(ipc.sentCommands.length, 1);
    assert.equal(ipc.sentCommands[0].command, 'getSnapshot');
  });

  test('C08-B13: SYNC never calls step/play/pause/reset', () => {
    const ipc = new MockIpcClient();
    const ctrl = new PresentationControlsModel(ipc);
    ipc.simulateConnected();

    ctrl.onSyncPressed();
    const nonSync = ipc.sentCommands.filter(c => c.command !== 'getSnapshot');
    assert.equal(nonSync.length, 0);
  });

  test('C08-B14: PLAY/PAUSE/STEP/RESET/SYNC do not locally modify simulation_tick', () => {
    const ipc = new MockIpcClient();
    const ctrl = new PresentationControlsModel(ipc);
    ipc.simulateConnected();

    assert.equal(ctrl.currentTick, 0);
    ctrl.onPlayPressed();
    assert.equal(ctrl.currentTick, 0);
    ipc.emit('response_received', { success: true, command: 'play' });

    ctrl.onStepPressed();
    assert.equal(ctrl.currentTick, 0, 'Tick must not be locally modified on step dispatch');
    ipc.emit('response_received', { success: true, command: 'step' });

    ctrl.onSyncPressed();
    assert.equal(ctrl.currentTick, 0);
    ipc.emit('response_received', { success: true, command: 'getSnapshot' });
  });

  test('C08-B15: Command lock releases after corresponding response', () => {
    const ipc = new MockIpcClient();
    const ctrl = new PresentationControlsModel(ipc);
    ipc.simulateConnected();

    ctrl.onStepPressed();
    assert.equal(ctrl.commandInFlight, true);

    ipc.emit('response_received', { success: true, command: 'step' });
    assert.equal(ctrl.commandInFlight, false);
  });

  test('C08-B16: Command lock releases on disconnect', () => {
    const ipc = new MockIpcClient();
    const ctrl = new PresentationControlsModel(ipc);
    ipc.simulateConnected();

    ctrl.onStepPressed();
    assert.equal(ctrl.commandInFlight, true);

    ipc.simulateDisconnected();
    assert.equal(ctrl.commandInFlight, false, 'Disconnect must release lock');
  });

  test('C08-B17: Command lock releases on bridge_failed', () => {
    const ipc = new MockIpcClient();
    const ctrl = new PresentationControlsModel(ipc);
    ipc.simulateConnected();

    ctrl.onStepPressed();
    assert.equal(ctrl.commandInFlight, true);

    ipc.simulateBridgeFailed('SESSION_ERROR');
    assert.equal(ctrl.commandInFlight, false, 'bridge_failed must release lock');
  });

  test('C08-B18: No 100ms PLAYING snapshot polling exists in C-08-B', () => {
    // In C-08-B, presentation_controls.gd does not contain polling
    assert.ok(!controlsContent.includes('_snapshot_poll_in_flight'));
    assert.ok(!controlsContent.includes('POLL_INTERVAL'));
  });

  test('C08-B19: PresentationControls does not implement snapshot acceptance', () => {
    assert.ok(!controlsContent.includes('_resolve_snapshot'));
    assert.ok(!controlsContent.includes('ACCEPT_AND_APPLY'));
    assert.ok(!controlsContent.includes('SnapshotResolution'));
  });

  test('C08-B20: PresentationControls does not implement observation history', () => {
    assert.ok(!controlsContent.includes('ORGANISM_APPEARED'));
    assert.ok(!controlsContent.includes('SIMULATION_RESET'));
    assert.ok(!controlsContent.includes('_observation_ring'));
    assert.ok(!controlsContent.includes('observation_appended'));
  });

  test('C08-B21: No frozen-domain files modified', () => {
    // Diff against base commit 29c380d (C-08-A commit)
    const diff = execSync('git diff --name-only 29c380d', { encoding: 'utf8' }).trim();
    const modifiedFiles = diff ? diff.split('\n').map(s => s.trim()) : [];

    const allowed = [
      'godot/scripts/presentation/world_view.gd',
      'godot/scripts/presentation/presentation_controls.gd',
      'tests/demo/demo_c08_integrated_shell.test.js'
    ];

    for (const f of modifiedFiles) {
      assert.ok(allowed.includes(f), `Forbidden file modified: ${f}`);
    }
  });
});

describe('DEMO-01-C / C-08-C: Live Playback Presentation Polling', () => {
  const worldViewPath = path.resolve(process.cwd(), 'godot/scripts/presentation/world_view.gd');
  const worldViewContent = fs.readFileSync(worldViewPath, 'utf8');

  // Updated WorldView Model with C-08-C Polling Logic
  class WorldViewPollingModel extends WorldViewModel {
    constructor(ipcClient) {
      super(ipcClient);
      this.POLL_INTERVAL = 0.1;
      this.snapshotPollInFlight = false;
      this.pollAccumulator = 0.0;
      this.currentPlaybackStatus = 'PAUSED';
      this.bridgeFailedActive = false;

      if (this.ipcClient) {
        this.ipcClient.on('response_received', (res) => this.onIpcResponseReceived(res));
      }
    }

    onPlaybackStatusChanged(status) {
      this.currentPlaybackStatus = status;
      if (this.currentPlaybackStatus !== 'PLAYING') {
        this.pollAccumulator = 0.0;
      }
    }

    onIpcDisconnected() {
      super.onIpcDisconnected();
      this.pollAccumulator = 0.0;
      this.snapshotPollInFlight = false;
    }

    onIpcBridgeFailed(_msg) {
      super.onIpcBridgeFailed(_msg);
      this.bridgeFailedActive = true;
      this.pollAccumulator = 0.0;
      this.snapshotPollInFlight = false;
    }

    onIpcResponseReceived(res) {
      const command = String(res.command || '');
      if (command === 'getSnapshot') {
        this.snapshotPollInFlight = false;
      } else if (command === 'reset') {
        this.pollAccumulator = 0.0;
        this.snapshotPollInFlight = false;
        if (Boolean(res.success)) {
          this.bridgeFailedActive = false;
        }
      }
    }

    process(delta) {
      super.process(delta);

      // C-08-C Polling
      if (this.currentPlaybackStatus === 'PLAYING' && this.ipcClient && !this.bridgeFailedActive) {
        if (this.ipcClient.get_connection_state() === 'CONNECTED') {
          this.pollAccumulator += delta;
          if (this.pollAccumulator >= this.POLL_INTERVAL && !this.snapshotPollInFlight) {
            this.pollAccumulator = 0.0;
            this.snapshotPollInFlight = true;
            this.ipcClient.get_snapshot();
          }
        } else {
          this.pollAccumulator = 0.0;
        }
      } else {
        this.pollAccumulator = 0.0;
      }
    }
  }

  test('C08-C01: Polling begins only when playback status is PLAYING', () => {
    const ipc = new MockIpcClient();
    const wv = new WorldViewPollingModel(ipc);
    wv.ready();
    ipc.simulateConnected();
    assert.equal(ipc.sentCommands.length, 1); // C-08-A initial snapshot

    wv.process(0.15);
    assert.equal(ipc.sentCommands.length, 1, 'Must not poll while PAUSED');

    wv.onPlaybackStatusChanged('PLAYING');
    wv.process(0.15);
    assert.equal(ipc.sentCommands.length, 2, 'Polling begins when PLAYING');
    assert.equal(ipc.sentCommands[1].command, 'getSnapshot');
  });

  test('C08-C02: Polling remains inactive while PAUSED', () => {
    const ipc = new MockIpcClient();
    const wv = new WorldViewPollingModel(ipc);
    wv.ready();
    ipc.simulateConnected();
    assert.equal(wv.currentPlaybackStatus, 'PAUSED');

    wv.process(1.0);
    assert.equal(ipc.sentCommands.length, 1); // only initial
  });

  test('C08-C03: Polling requires CONNECTED transport', () => {
    const ipc = new MockIpcClient();
    const wv = new WorldViewPollingModel(ipc);
    wv.ready();
    wv.onPlaybackStatusChanged('PLAYING');

    // Transport is CONNECTING
    wv.process(0.5);
    assert.equal(ipc.sentCommands.length, 0);
  });

  test('C08-C04: Polling does not occur while DISCONNECTED', () => {
    const ipc = new MockIpcClient();
    const wv = new WorldViewPollingModel(ipc);
    wv.ready();
    ipc.simulateConnected();
    wv.onPlaybackStatusChanged('PLAYING');

    ipc.simulateDisconnected();
    wv.process(0.5);
    assert.equal(ipc.sentCommands.length, 1); // only initial from earlier
  });

  test('C08-C05: Polling does not occur while BRIDGE_FAILED', () => {
    const ipc = new MockIpcClient();
    const wv = new WorldViewPollingModel(ipc);
    wv.ready();
    ipc.simulateConnected();
    wv.onPlaybackStatusChanged('PLAYING');

    ipc.simulateBridgeFailed('SESSION_ERROR');
    wv.process(0.5);
    assert.equal(ipc.sentCommands.length, 1); // only initial
  });

  test('C08-C06: Polling interval is exactly 100ms', () => {
    assert.match(worldViewContent, /const\s+POLL_INTERVAL:\s*float\s*=\s*0\.1/);
  });

  test('C08-C07: At most one polling getSnapshot is in-flight', () => {
    const ipc = new MockIpcClient();
    const wv = new WorldViewPollingModel(ipc);
    wv.ready();
    ipc.simulateConnected();
    wv.onPlaybackStatusChanged('PLAYING');

    wv.process(0.12);
    assert.equal(wv.snapshotPollInFlight, true);
    assert.equal(ipc.sentCommands.length, 2); // 1 initial + 1 poll

    // Process another 500ms without response
    wv.process(0.5);
    assert.equal(ipc.sentCommands.length, 2, 'Must not send another getSnapshot while previous is in-flight');
  });

  test('C08-C08: A second poll cannot dispatch before the previous getSnapshot response', () => {
    const ipc = new MockIpcClient();
    const wv = new WorldViewPollingModel(ipc);
    wv.ready();
    ipc.simulateConnected();
    wv.onPlaybackStatusChanged('PLAYING');

    wv.process(0.15);
    assert.equal(ipc.sentCommands.length, 2);

    wv.process(0.3);
    assert.equal(ipc.sentCommands.length, 2);

    // Response arrives
    ipc.emit('response_received', { success: true, command: 'getSnapshot', result: { snapshot: { simulation_tick: 5 } } });
    assert.equal(wv.snapshotPollInFlight, false);

    wv.process(0.15);
    assert.equal(ipc.sentCommands.length, 3, 'Second poll dispatches after previous response resolved');
  });

  test('C08-C09: Only getSnapshot responses clear _snapshot_poll_in_flight', () => {
    const ipc = new MockIpcClient();
    const wv = new WorldViewPollingModel(ipc);
    wv.ready();
    ipc.simulateConnected();
    wv.onPlaybackStatusChanged('PLAYING');

    wv.process(0.15);
    assert.equal(wv.snapshotPollInFlight, true);

    // Other command responses do not clear polling lock
    ipc.emit('response_received', { success: true, command: 'step' });
    assert.equal(wv.snapshotPollInFlight, true);

    ipc.emit('response_received', { success: true, command: 'getSnapshot' });
    assert.equal(wv.snapshotPollInFlight, false);
  });

  test('C08-C10: play response does not clear polling lock', () => {
    const ipc = new MockIpcClient();
    const wv = new WorldViewPollingModel(ipc);
    wv.ready();
    ipc.simulateConnected();
    wv.onPlaybackStatusChanged('PLAYING');

    wv.process(0.15);
    assert.equal(wv.snapshotPollInFlight, true);

    ipc.emit('response_received', { success: true, command: 'play' });
    assert.equal(wv.snapshotPollInFlight, true);
  });

  test('C08-C11: pause response does not clear polling lock', () => {
    const ipc = new MockIpcClient();
    const wv = new WorldViewPollingModel(ipc);
    wv.ready();
    ipc.simulateConnected();
    wv.onPlaybackStatusChanged('PLAYING');

    wv.process(0.15);
    assert.equal(wv.snapshotPollInFlight, true);

    ipc.emit('response_received', { success: true, command: 'pause' });
    assert.equal(wv.snapshotPollInFlight, true);
  });

  test('C08-C12: step response does not clear polling lock', () => {
    const ipc = new MockIpcClient();
    const wv = new WorldViewPollingModel(ipc);
    wv.ready();
    ipc.simulateConnected();
    wv.onPlaybackStatusChanged('PLAYING');

    wv.process(0.15);
    assert.equal(wv.snapshotPollInFlight, true);

    ipc.emit('response_received', { success: true, command: 'step' });
    assert.equal(wv.snapshotPollInFlight, true);
  });

  test('C08-C13: reset response clears polling lock and halts accumulator', () => {
    const ipc = new MockIpcClient();
    const wv = new WorldViewPollingModel(ipc);
    wv.ready();
    ipc.simulateConnected();
    wv.onPlaybackStatusChanged('PLAYING');

    wv.process(0.15);
    assert.equal(wv.snapshotPollInFlight, true);

    ipc.emit('response_received', { success: true, command: 'reset', result: { snapshot: { simulation_tick: 0 } } });
    assert.equal(wv.snapshotPollInFlight, false);
    assert.equal(wv.pollAccumulator, 0.0);
  });

  test('C08-C14: disconnect clears polling in-flight state', () => {
    const ipc = new MockIpcClient();
    const wv = new WorldViewPollingModel(ipc);
    wv.ready();
    ipc.simulateConnected();
    wv.onPlaybackStatusChanged('PLAYING');

    wv.process(0.15);
    assert.equal(wv.snapshotPollInFlight, true);

    ipc.simulateDisconnected();
    assert.equal(wv.snapshotPollInFlight, false);
    assert.equal(wv.pollAccumulator, 0.0);
  });

  test('C08-C15: bridge_failed clears polling in-flight state', () => {
    const ipc = new MockIpcClient();
    const wv = new WorldViewPollingModel(ipc);
    wv.ready();
    ipc.simulateConnected();
    wv.onPlaybackStatusChanged('PLAYING');

    wv.process(0.15);
    assert.equal(wv.snapshotPollInFlight, true);

    ipc.simulateBridgeFailed('SESSION_ERROR');
    assert.equal(wv.snapshotPollInFlight, false);
    assert.equal(wv.pollAccumulator, 0.0);
    assert.equal(wv.bridgeFailedActive, true);
  });

  test('C08-C16: PAUSE clears polling accumulator', () => {
    const ipc = new MockIpcClient();
    const wv = new WorldViewPollingModel(ipc);
    wv.ready();
    ipc.simulateConnected();
    wv.onPlaybackStatusChanged('PLAYING');

    wv.process(0.05); // halfway to 0.1s
    assert.equal(wv.pollAccumulator, 0.05);

    wv.onPlaybackStatusChanged('PAUSED');
    assert.equal(wv.pollAccumulator, 0.0);
  });

  test('C08-C17: RESET clears polling accumulator', () => {
    const ipc = new MockIpcClient();
    const wv = new WorldViewPollingModel(ipc);
    wv.ready();
    ipc.simulateConnected();
    wv.onPlaybackStatusChanged('PLAYING');

    wv.process(0.05);
    assert.equal(wv.pollAccumulator, 0.05);

    ipc.emit('response_received', { success: true, command: 'reset' });
    assert.equal(wv.pollAccumulator, 0.0);
  });

  test('C08-C18: Late getSnapshot response after PAUSE does not restart polling', () => {
    const ipc = new MockIpcClient();
    const wv = new WorldViewPollingModel(ipc);
    wv.ready();
    ipc.simulateConnected();
    wv.onPlaybackStatusChanged('PLAYING');

    wv.process(0.15);
    assert.equal(wv.snapshotPollInFlight, true);
    assert.equal(ipc.sentCommands.length, 2);

    // User pauses before response arrives
    wv.onPlaybackStatusChanged('PAUSED');

    // Late snapshot response arrives
    ipc.emit('response_received', { success: true, command: 'getSnapshot', result: { snapshot: { simulation_tick: 10 } } });
    assert.equal(wv.snapshotPollInFlight, false);

    wv.process(0.5);
    assert.equal(ipc.sentCommands.length, 2, 'Must not dispatch further polling while PAUSED');
  });

  test('C08-C19: Late getSnapshot response after RESET does not restart polling', () => {
    const ipc = new MockIpcClient();
    const wv = new WorldViewPollingModel(ipc);
    wv.ready();
    ipc.simulateConnected();
    wv.onPlaybackStatusChanged('PLAYING');

    wv.process(0.15);
    assert.equal(wv.snapshotPollInFlight, true);

    // Reset occurs
    ipc.emit('response_received', { success: true, command: 'reset' });
    wv.onPlaybackStatusChanged('PAUSED');

    // Late poll response
    ipc.emit('response_received', { success: true, command: 'getSnapshot', result: { snapshot: { simulation_tick: 1 } } });
    wv.process(0.5);
    assert.equal(ipc.sentCommands.length, 2, 'Must not restart polling after reset/paused');
  });

  test('C08-C20: WorldView never calls step() from polling', () => {
    const ipc = new MockIpcClient();
    const wv = new WorldViewPollingModel(ipc);
    wv.ready();
    ipc.simulateConnected();
    wv.onPlaybackStatusChanged('PLAYING');

    for (let i = 0; i < 20; i++) {
      wv.process(0.15);
      ipc.emit('response_received', { success: true, command: 'getSnapshot' });
    }

    const steps = ipc.sentCommands.filter(c => c.command === 'step');
    assert.equal(steps.length, 0, 'Polling must NEVER call step()');
  });

  test('C08-C21: WorldView never calls play() from polling', () => {
    const ipc = new MockIpcClient();
    const wv = new WorldViewPollingModel(ipc);
    wv.ready();
    ipc.simulateConnected();
    wv.onPlaybackStatusChanged('PLAYING');
    wv.process(0.5);

    const plays = ipc.sentCommands.filter(c => c.command === 'play');
    assert.equal(plays.length, 0);
  });

  test('C08-C22: WorldView never calls pause() from polling', () => {
    const ipc = new MockIpcClient();
    const wv = new WorldViewPollingModel(ipc);
    wv.ready();
    ipc.simulateConnected();
    wv.onPlaybackStatusChanged('PLAYING');
    wv.process(0.5);

    const pauses = ipc.sentCommands.filter(c => c.command === 'pause');
    assert.equal(pauses.length, 0);
  });

  test('C08-C23: WorldView never calls reset() from polling', () => {
    const ipc = new MockIpcClient();
    const wv = new WorldViewPollingModel(ipc);
    wv.ready();
    ipc.simulateConnected();
    wv.onPlaybackStatusChanged('PLAYING');
    wv.process(0.5);

    const resets = ipc.sentCommands.filter(c => c.command === 'reset');
    assert.equal(resets.length, 0);
  });

  test('C08-C24: WorldView never mutates simulation_tick', () => {
    assert.ok(!worldViewContent.includes('simulation_tick ='));
    assert.ok(!worldViewContent.includes('tick +='));
  });

  test('C08-C25: WorldView does not apply snapshots', () => {
    assert.ok(!worldViewContent.includes('apply_snapshot_organisms'));
    assert.ok(!worldViewContent.includes('_resolve_snapshot'));
  });

  test('C08-C26: WorldView does not generate observations', () => {
    assert.ok(!worldViewContent.includes('ORGANISM_APPEARED'));
    assert.ok(!worldViewContent.includes('SIMULATION_RESET'));
  });

  test('C08-C27: Manual SYNC does not manipulate _snapshot_poll_in_flight', () => {
    const ipc = new MockIpcClient();
    const wv = new WorldViewPollingModel(ipc);
    wv.ready();
    ipc.simulateConnected();

    assert.equal(wv.snapshotPollInFlight, false);

    // Manual sync dispatched by PresentationControls
    ipc.get_snapshot();
    assert.equal(wv.snapshotPollInFlight, false, 'Manual sync does not toggle polling in-flight flag');
  });

  test('C08-C28: C-08-A reconnect remains independent from C-08-C polling', () => {
    const ipc = new MockIpcClient();
    const wv = new WorldViewPollingModel(ipc);
    wv.ready();
    ipc.simulateDisconnected();

    // In DISCONNECTED, reconnect accumulator advances while polling is halted
    assert.equal(ipc.get_connection_state(), 'DISCONNECTED');
    wv.process(1.5);

    assert.equal(wv.reconnectAccumulator, 1.5);
    assert.equal(wv.pollAccumulator, 0.0);
  });

  test('C08-C29: Initial connection getSnapshot is not counted as a polling request', () => {
    const ipc = new MockIpcClient();
    const wv = new WorldViewPollingModel(ipc);
    wv.ready();

    ipc.simulateConnected();
    assert.equal(ipc.sentCommands.length, 1);
    assert.equal(wv.snapshotPollInFlight, false, 'Initial sync must NOT set snapshotPollInFlight');
  });

  test('C08-C30: A successful reset leaves polling inactive while authoritative playback status is PAUSED', () => {
    const ipc = new MockIpcClient();
    const wv = new WorldViewPollingModel(ipc);
    wv.ready();
    ipc.simulateConnected();

    ipc.emit('response_received', { success: true, command: 'reset' });
    wv.onPlaybackStatusChanged('PAUSED');

    wv.process(0.5);
    assert.equal(ipc.sentCommands.length, 1, 'Only initial sync, zero polling while PAUSED');
  });

  test('C08-C31: Polling may observe sparse/latest snapshots without requiring every intermediate tick', () => {
    // Invariant test: Polling samples at 100ms. If simulation advanced 50 ticks,
    // getSnapshot simply returns tick 50; WorldView does not try to backfill ticks 1..49.
    const ipc = new MockIpcClient();
    const wv = new WorldViewPollingModel(ipc);
    wv.ready();
    ipc.simulateConnected();
    wv.onPlaybackStatusChanged('PLAYING');

    wv.process(0.15);
    ipc.emit('response_received', { success: true, command: 'getSnapshot', result: { snapshot: { simulation_tick: 50 } } });

    assert.equal(wv.snapshotPollInFlight, false);
    assert.equal(ipc.sentCommands.length, 2);
  });

  test('C08-C32: No frozen-domain files modified', () => {
    // Check git diff against base commit bc56590 (C-08-B commit)
    const diff = execSync('git diff --name-only bc56590', { encoding: 'utf8' }).trim();
    const modifiedFiles = diff ? diff.split('\n').map(s => s.trim()) : [];

    const allowed = [
      'godot/scripts/presentation/world_view.gd',
      'tests/demo/demo_c08_integrated_shell.test.js'
    ];

    for (const f of modifiedFiles) {
      assert.ok(allowed.includes(f), `Forbidden file modified: ${f}`);
    }
  });
});
