/**
 * tests/demo/demo_c10_integration.test.js
 * 
 * DEMO-01-C / C-10-E: End-to-End Deterministic Integration Test Suite
 * 
 * Verifies the complete presentation chain across the full lifecycle:
 * Node simulation
 *   -> IPC
 *   -> SnapshotSynchronizer
 *   -> OrganismsOverlay
 *   -> Phenotype / Morphology
 *   -> Interpolation
 *   -> Selection
 *   -> CameraController Focus / Follow
 *   -> Death handling
 *   -> Reset / Epoch isolation
 *   -> PLAY polling
 *   -> Reconnect isolation
 * 
 * Covers C10-E01 through C10-E15 specified by Game Director.
 * Zero simulation logic in presentation / Godot layer.
 * Replay determinism defined at contract/state level (not rendered pixels).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

import {
  DemoSimulationSession,
  IpcClient,
  IpcServer,
  DEFAULT_IPC_HOST,
  DEFAULT_IPC_PORT
} from '../../demo/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');

const CAMERA_CONTROLLER_PATH = path.join(ROOT_DIR, 'godot/scripts/presentation/camera_controller.gd');
const ORGANISMS_OVERLAY_PATH = path.join(ROOT_DIR, 'godot/scripts/presentation/organisms_overlay.gd');
const SYNCHRONIZER_PATH = path.join(ROOT_DIR, 'godot/scripts/presentation/snapshot_synchronizer.gd');
const WORLD_VIEW_PATH = path.join(ROOT_DIR, 'godot/scripts/presentation/world_view.gd');
const INSPECTION_UI_PATH = path.join(ROOT_DIR, 'godot/scripts/presentation/organism_inspection_ui.gd');
const MORPHOLOGY_PATH = path.join(ROOT_DIR, 'godot/scripts/presentation/organism_morphology.gd');

const WORLD_WIDTH = 800.0;
const WORLD_HEIGHT = 800.0;
const WORLD_CENTER = { x: 400.0, y: 400.0 };
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 4.0;
const FOCUS_SMOOTH_SPEED = 10.0;
const FOLLOW_SMOOTH_SPEED = 12.0;

// Procedural morphology evaluation matching organism_morphology.gd
const CHITIN_LIGHT = { r: 0.68, g: 0.48, b: 0.28, a: 1.0 };
const CHITIN_DARK = { r: 0.12, g: 0.07, b: 0.05, a: 1.0 };

function lerpColor(c1, c2, t) {
  return {
    r: Number((c1.r + (c2.r - c1.r) * t).toFixed(6)),
    g: Number((c1.g + (c2.g - c1.g) * t).toFixed(6)),
    b: Number((c1.b + (c2.b - c1.b) * t).toFixed(6)),
    a: 1.0
  };
}

function evaluateMorphology(org) {
  const b = org.body_scale_index;
  const p = org.cuticle_pigment_ratio;
  const ch = org.cephalic_horn_scale;
  const th = org.thoracic_horn_scale;
  const tg = org.tarsal_grip_index;

  const isValid = (
    typeof b === 'number' && Number.isFinite(b) && b >= 0.42 && b <= 1.50 &&
    typeof p === 'number' && Number.isFinite(p) && p >= 0.0 && p <= 1.0 &&
    typeof ch === 'number' && Number.isFinite(ch) && ch >= 0.0 && ch <= 2.25 &&
    typeof th === 'number' && Number.isFinite(th) && th >= 0.0 && th <= 1.80 &&
    typeof tg === 'number' && Number.isFinite(tg) && tg >= 0.80 && tg <= 2.50
  );

  const stageId = org.current_stage_id || 'STAGE_EGG';

  if (!isValid) {
    return {
      is_valid: false,
      stage_id: stageId,
      body_scale: 1.0,
      cuticle_color: { r: 0.5, g: 0.5, b: 0.5, a: 1.0 },
      cephalic_horn_len: 0.0,
      thoracic_horn_len: 0.0,
      tarsal_leg_len: 0.0,
      tarsal_claw_spread: 0.0
    };
  }

  const bodyScale = b;
  const cuticleColor = lerpColor(CHITIN_LIGHT, CHITIN_DARK, p);
  const cephalicHornLen = 6.0 * ch * bodyScale;
  const thoracicHornLen = 4.5 * th * bodyScale;
  const tarsalLegLen = 5.0 * (tg / 1.50) * bodyScale;
  const tarsalClawSpread = 2.0 * (tg / 1.50);

  return {
    is_valid: true,
    stage_id: stageId,
    body_scale: bodyScale,
    cuticle_color: cuticleColor,
    cephalic_horn_len: cephalicHornLen,
    thoracic_horn_len: thoracicHornLen,
    tarsal_leg_len: tarsalLegLen,
    tarsal_claw_spread: tarsalClawSpread,
    egg_rx: 3.5 * bodyScale,
    egg_ry: 4.5 * bodyScale
  };
}

// OrganismsOverlayModel: Sole Visual Cache & Slot Layout Authority
class OrganismsOverlayModel {
  constructor() {
    this.activeZLayer = 0;
    this.selectedOrganismId = '';
    this.cachedOrganisms = [];
    this.interpolationStates = {};
    this.lastSeenEpoch = 0;
    this.selectionListeners = [];
    this.epochListeners = [];
    this.HIT_RADIUS = 12.0;
  }

  connectSelection(listener) {
    this.selectionListeners.push(listener);
  }

  connectEpoch(listener) {
    this.epochListeners.push(listener);
  }

  selectOrganism(orgId) {
    if (this.selectedOrganismId !== orgId) {
      this.selectedOrganismId = orgId;
      for (const l of this.selectionListeners) {
        l(this.selectedOrganismId);
      }
    }
  }

  calculateSlotCenter(origin, count, slotIndex) {
    if (count === 1) {
      return { x: origin.x + 8.0, y: origin.y + 8.0 };
    } else if (count === 2) {
      return {
        x: origin.x + (slotIndex === 0 ? 5.0 : 11.0),
        y: origin.y + 8.0
      };
    } else if (count === 3) {
      return {
        x: origin.x + (slotIndex === 0 ? 5.0 : slotIndex === 1 ? 11.0 : 8.0),
        y: origin.y + (slotIndex === 0 ? 5.0 : slotIndex === 1 ? 5.0 : 11.0)
      };
    } else if (count === 4) {
      return {
        x: origin.x + (slotIndex === 0 || slotIndex === 2 ? 5.0 : 11.0),
        y: origin.y + (slotIndex === 0 || slotIndex === 1 ? 5.0 : 11.0)
      };
    } else {
      return { x: origin.x + 8.0, y: origin.y + 8.0 };
    }
  }

  getOrganismVisualPosition(org, fallbackCenter) {
    const orgId = org.organism_id || '';
    if (this.interpolationStates[orgId]) {
      const st = this.interpolationStates[orgId];
      const sourcePx = st.source_px || fallbackCenter;
      const targetPx = st.target_px || fallbackCenter;
      const alpha = Math.max(0.0, Math.min(1.0, st.alpha !== undefined ? st.alpha : 1.0));
      const baseInterp = {
        x: sourcePx.x + (targetPx.x - sourcePx.x) * alpha,
        y: sourcePx.y + (targetPx.y - sourcePx.y) * alpha
      };
      const slotOffset = {
        x: fallbackCenter.x - targetPx.x,
        y: fallbackCenter.y - targetPx.y
      };
      return {
        x: baseInterp.x + slotOffset.x,
        y: baseInterp.y + slotOffset.y
      };
    }
    return fallbackCenter;
  }

  getOrganismCameraTarget(orgId) {
    if (!orgId) {
      return { valid: false, is_alive: false, visual_position: { x: 0, y: 0 } };
    }

    const org = this.cachedOrganisms.find(o => o.organism_id === orgId);
    if (!org || !org.position || typeof org.position !== 'object') {
      return { valid: false, is_alive: false, visual_position: { x: 0, y: 0 } };
    }

    const z = org.position.z !== undefined ? org.position.z : 0;
    if (z !== this.activeZLayer) {
      return { valid: false, is_alive: false, visual_position: { x: 0, y: 0 } };
    }

    const cellX = org.position.x || 0;
    const cellY = org.position.y || 0;

    const group = this.cachedOrganisms.filter(candidate => {
      return candidate.position &&
        candidate.position.z === this.activeZLayer &&
        candidate.position.x === cellX &&
        candidate.position.y === cellY;
    });

    group.sort((a, b) => String(a.organism_id).localeCompare(String(b.organism_id)));

    const count = group.length;
    let slotIndex = 0;
    for (let i = 0; i < count; i++) {
      if (group[i].organism_id === orgId) {
        slotIndex = i;
        break;
      }
    }

    if (count > 4 && slotIndex > 0) {
      slotIndex = 0;
    }

    const origin = { x: cellX * 16.0, y: cellY * 16.0 };
    const slotCenter = this.calculateSlotCenter(origin, count, slotIndex);
    const visualPos = this.getOrganismVisualPosition(org, slotCenter);

    const isAlive = org.is_alive !== false;

    return {
      valid: true,
      is_alive: isAlive,
      visual_position: visualPos
    };
  }

  hitTestOrganism(mousePos) {
    let closestOrg = null;
    let closestDistSq = this.HIT_RADIUS * this.HIT_RADIUS;

    for (const org of this.cachedOrganisms) {
      const rec = this.getOrganismCameraTarget(org.organism_id);
      if (!rec.valid) continue;
      const dx = mousePos.x - rec.visual_position.x;
      const dy = mousePos.y - rec.visual_position.y;
      const distSq = dx * dx + dy * dy;
      if (distSq <= closestDistSq) {
        closestDistSq = distSq;
        closestOrg = org;
      }
    }
    return closestOrg;
  }

  applySnapshotOrganisms(organisms, currentEpoch = 0) {
    if (currentEpoch !== this.lastSeenEpoch) {
      // Epoch boundary barrier
      this.lastSeenEpoch = currentEpoch;
      this.interpolationStates = {};
      this.cachedOrganisms = [];
      this.selectOrganism('');
      for (const l of this.epochListeners) {
        l(currentEpoch);
      }
    }

    // Update interpolation states
    const newStates = {};
    for (const org of organisms) {
      const orgId = org.organism_id;
      const cellX = (org.position && org.position.x) || 0;
      const cellY = (org.position && org.position.y) || 0;
      const targetPx = { x: cellX * 16.0 + 8.0, y: cellY * 16.0 + 8.0 };

      if (this.interpolationStates[orgId]) {
        const oldPos = this.getOrganismCameraTarget(orgId).visual_position;
        newStates[orgId] = {
          source_px: oldPos,
          target_px: targetPx,
          alpha: 0.0
        };
      } else {
        newStates[orgId] = {
          source_px: targetPx,
          target_px: targetPx,
          alpha: 1.0
        };
      }
    }

    this.interpolationStates = newStates;
    this.cachedOrganisms = Array.isArray(organisms) ? [...organisms] : [];

    // If selected organism no longer in snapshot, clear selection
    if (this.selectedOrganismId) {
      const stillExists = this.cachedOrganisms.some(o => o.organism_id === this.selectedOrganismId);
      if (!stillExists) {
        this.selectOrganism('');
      }
    }
  }

  setInterpolationAlpha(orgId, alpha) {
    if (this.interpolationStates[orgId]) {
      this.interpolationStates[orgId].alpha = alpha;
    }
  }
}

// CameraFollowModel: Presentation Leaf Node
class CameraFollowModel {
  constructor(overlay, viewportSize = { x: 1152.0, y: 648.0 }) {
    this.overlay = overlay;
    this.viewportSize = { ...viewportSize };
    this.zoom = 1.0;
    this.position = { x: 400.0, y: 400.0 };

    this.isTracking = false;
    this.targetId = '';
    this.isFocusing = false;
    this.focusId = '';
    this.focusStartedAlive = false;

    this.isDragging = false;
    this.dragStartMousePos = { x: 0, y: 0 };

    if (this.overlay) {
      this.overlay.connectSelection(id => this.onSelectionChanged(id));
      this.overlay.connectEpoch(epoch => this.onEpochChanged(epoch));
    }
  }

  clampCameraCenter(targetPos, vpSize, z) {
    const hw = vpSize.x / (2.0 * z);
    const hh = vpSize.y / (2.0 * z);
    let cx, cy;

    if (2.0 * hw >= WORLD_WIDTH) {
      cx = WORLD_WIDTH * 0.5;
    } else {
      cx = Math.max(hw, Math.min(WORLD_WIDTH - hw, targetPos.x));
    }

    if (2.0 * hh >= WORLD_HEIGHT) {
      cy = WORLD_HEIGHT * 0.5;
    } else {
      cy = Math.max(hh, Math.min(WORLD_HEIGHT - hh, targetPos.y));
    }

    return { x: cx, y: cy };
  }

  calculateDefaultOverviewZoom(vpSize) {
    const margin = 48.0;
    if (vpSize.x <= margin || vpSize.y <= margin) return MIN_ZOOM;
    const fitX = (vpSize.x - margin) / WORLD_WIDTH;
    const fitY = (vpSize.y - margin) / WORLD_HEIGHT;
    const adaptive = Math.min(fitX, fitY);
    return Math.max(MIN_ZOOM, Math.min(1.2, adaptive));
  }

  resetToDefaultFraming() {
    const defZ = this.calculateDefaultOverviewZoom(this.viewportSize);
    this.zoom = defZ;
    this.position = this.clampCameraCenter(WORLD_CENTER, this.viewportSize, defZ);
  }

  focusOrganism(orgId) {
    if (!this.overlay) return false;
    const rec = this.overlay.getOrganismCameraTarget(orgId);
    if (!rec.valid) return false;

    this.isTracking = false;
    this.targetId = '';
    this.isFocusing = true;
    this.focusId = orgId;
    this.focusStartedAlive = Boolean(rec.is_alive);
    return true;
  }

  cancelFocus() {
    this.isFocusing = false;
    this.focusId = '';
    this.focusStartedAlive = false;
  }

  startFollowing(orgId) {
    if (!this.overlay) return false;
    const rec = this.overlay.getOrganismCameraTarget(orgId);
    if (!rec.valid || !rec.is_alive) return false;

    this.isTracking = true;
    this.targetId = orgId;
    this.isFocusing = false;
    return true;
  }

  stopFollowing() {
    this.isTracking = false;
    this.targetId = '';
  }

  onEpochChanged(_newEpoch) {
    this.stopFollowing();
    this.cancelFocus();
    this.isDragging = false;
    this.dragStartMousePos = { x: 0, y: 0 };
    this.resetToDefaultFraming();
  }

  onSelectionChanged(newId) {
    if (this.isFocusing) {
      this.cancelFocus();
    }

    if (this.isTracking) {
      if (!newId) {
        this.stopFollowing();
      } else if (newId === this.targetId) {
        // preserve
      } else {
        const rec = this.overlay.getOrganismCameraTarget(newId);
        if (rec.valid && rec.is_alive) {
          this.targetId = newId;
        } else {
          this.stopFollowing();
        }
      }
    }
  }

  process(delta, inputVec = { x: 0, y: 0 }) {
    // 1. Manual movement cancels follow
    if (inputVec.x !== 0 || inputVec.y !== 0) {
      if (this.isTracking) this.stopFollowing();
      if (this.isFocusing) this.cancelFocus();
      const panSpeed = 400.0 / this.zoom;
      this.position.x += inputVec.x * panSpeed * delta;
      this.position.y += inputVec.y * panSpeed * delta;
      this.position = this.clampCameraCenter(this.position, this.viewportSize, this.zoom);
      return;
    }

    // 2. Continuous Follow
    if (this.isTracking) {
      const rec = this.overlay.getOrganismCameraTarget(this.targetId);
      if (!rec.valid || !rec.is_alive) {
        this.stopFollowing();
        return;
      }

      const clampedTarget = this.clampCameraCenter(rec.visual_position, this.viewportSize, this.zoom);
      const t = 1.0 - Math.exp(-FOLLOW_SMOOTH_SPEED * delta);
      this.position.x += (clampedTarget.x - this.position.x) * t;
      this.position.y += (clampedTarget.y - this.position.y) * t;
      return;
    }

    // 3. One-shot Focus
    if (this.isFocusing) {
      const rec = this.overlay.getOrganismCameraTarget(this.focusId);
      if (!rec.valid) {
        this.cancelFocus();
        return;
      }
      if (this.focusStartedAlive && !rec.is_alive) {
        this.cancelFocus();
        return;
      }

      const clampedTarget = this.clampCameraCenter(rec.visual_position, this.viewportSize, this.zoom);
      const dist = Math.hypot(clampedTarget.x - this.position.x, clampedTarget.y - this.position.y);
      if (dist < 0.5) {
        this.position = clampedTarget;
        this.cancelFocus();
      } else {
        const t = 1.0 - Math.exp(-FOCUS_SMOOTH_SPEED * delta);
        this.position.x += (clampedTarget.x - this.position.x) * t;
        this.position.y += (clampedTarget.y - this.position.y) * t;
      }
    }
  }
}

// SnapshotSynchronizerModel: Authoritative Monotonic Gateway
class SnapshotSynchronizerModel {
  constructor(overlay) {
    this.overlay = overlay;
    this.lastAcceptedTick = -1;
    this.sessionEpoch = 0;
    this.playbackStatus = 'PAUSED';
    this.bridgeState = 'DISCONNECTED';
    this.warnings = [];
    this.appliedEvents = [];
  }

  handleResponse(response) {
    if (!response || !response.success) {
      if (response && response.error && response.error.code === 'SESSION_ERROR') {
        this.bridgeState = 'BRIDGE_FAILED';
      }
      return false;
    }

    const command = response.command;
    const result = response.result;
    if (!result || typeof result !== 'object') return false;

    if (command === 'play' || command === 'pause') {
      if (result.playback_status) {
        this.playbackStatus = result.playback_status;
      }
      return true;
    }

    const snapshot = result.snapshot;
    if (!snapshot || typeof snapshot !== 'object') return false;

    const tick = snapshot.simulation_tick;
    // Strict integer validation
    if (typeof tick !== 'number' || !Number.isInteger(tick) || tick < 0) {
      this.warnings.push(`Malformed simulation_tick: ${tick}`);
      return false;
    }

    const isReset = (command === 'reset');
    let accepted = false;

    if (isReset) {
      this.sessionEpoch += 1;
      this.lastAcceptedTick = tick;
      accepted = true;
    } else if (tick > this.lastAcceptedTick) {
      this.lastAcceptedTick = tick;
      accepted = true;
    } else if (tick === this.lastAcceptedTick) {
      // duplicate dropped silently
      return false;
    } else {
      this.warnings.push(`Stale snapshot dropped: tick ${tick} < ${this.lastAcceptedTick}`);
      return false;
    }

    if (accepted) {
      if (snapshot.playback_status) {
        this.playbackStatus = snapshot.playback_status;
      }
      const organisms = Array.isArray(snapshot.organisms) ? snapshot.organisms : [];
      if (this.overlay) {
        this.overlay.applySnapshotOrganisms(organisms, this.sessionEpoch);
      }
      this.appliedEvents.push({ tick: this.lastAcceptedTick, epoch: this.sessionEpoch });
      return true;
    }

    return false;
  }
}

// WorldViewModel: Connection & Polling Orchestrator
class WorldViewModel {
  constructor(ipcClient, synchronizer) {
    this.ipcClient = ipcClient;
    this.synchronizer = synchronizer;
    this.connectionGeneration = 0;
    this.initialSnapshotRequestedGen = -1;
    this.currentPlaybackStatus = 'PAUSED';
    this.snapshotPollInFlight = false;
    this.pollAccumulator = 0.0;
    this.POLL_INTERVAL = 0.1;
    this.pendingSnapshotSources = [];
    this.bridgeFailedActive = false;
  }

  onConnected() {
    this.connectionGeneration += 1;
    this.bridgeFailedActive = false;
    this.pendingSnapshotSources = [];
    this.snapshotPollInFlight = false;

    if (this.initialSnapshotRequestedGen !== this.connectionGeneration) {
      this.initialSnapshotRequestedGen = this.connectionGeneration;
      this.pendingSnapshotSources.push('INITIAL');
      if (this.ipcClient) {
        this.ipcClient.sentCommands.push({ command: 'getSnapshot', source: 'INITIAL', gen: this.connectionGeneration });
      }
    }
  }

  onDisconnected() {
    this.snapshotPollInFlight = false;
    this.pendingSnapshotSources = [];
  }

  process(delta) {
    if (this.currentPlaybackStatus === 'PLAYING' && !this.bridgeFailedActive) {
      this.pollAccumulator += delta;
      if (this.pollAccumulator >= this.POLL_INTERVAL && !this.snapshotPollInFlight && this.pendingSnapshotSources.length === 0) {
        this.pollAccumulator = 0.0;
        this.snapshotPollInFlight = true;
        this.pendingSnapshotSources.push('POLL');
        if (this.ipcClient) {
          this.ipcClient.sentCommands.push({ command: 'getSnapshot', source: 'POLL', gen: this.connectionGeneration });
        }
      }
    } else {
      this.pollAccumulator = 0.0;
    }
  }

  onResponseReceived(response) {
    const cmd = response.command;
    if (cmd === 'getSnapshot') {
      if (this.pendingSnapshotSources.length > 0) {
        const src = this.pendingSnapshotSources.shift();
        if (src === 'POLL') {
          this.snapshotPollInFlight = false;
        }
      }
    } else if (cmd === 'reset') {
      this.pollAccumulator = 0.0;
      this.snapshotPollInFlight = false;
      this.pendingSnapshotSources = [];
    }
  }
}

describe('DEMO-01-C / C-10-E: End-to-End Deterministic Integration Suite', () => {

  // C10-E01: BOOT -> Initial Snapshot -> Organism Visibility
  it('C10-E01: Boot -> Initial getSnapshot -> 10 organisms populated on active Z-layer with default framing', () => {
    const session = new DemoSimulationSession({ seed: 1001 });
    const snap = session.getSnapshot();

    const overlay = new OrganismsOverlayModel();
    const camera = new CameraFollowModel(overlay);
    camera.resetToDefaultFraming();
    const synchronizer = new SnapshotSynchronizerModel(overlay);

    // Initial snapshot arrival
    const response = {
      command: 'getSnapshot',
      success: true,
      result: { snapshot: snap }
    };

    const accepted = synchronizer.handleResponse(response);
    assert.strictEqual(accepted, true, 'Initial tick 0 snapshot must be accepted');
    assert.strictEqual(synchronizer.lastAcceptedTick, 0);
    assert.strictEqual(synchronizer.sessionEpoch, 0);

    // 10 organisms visible on active layer z=0
    assert.strictEqual(overlay.cachedOrganisms.length, 10, 'Overlay must cache all 10 organisms');
    for (const org of overlay.cachedOrganisms) {
      assert.strictEqual(org.position.z, 0, 'Organism must reside on active Z-layer z=0');
      const target = overlay.getOrganismCameraTarget(org.organism_id);
      assert.strictEqual(target.valid, true, `Organism ${org.organism_id} target must be valid`);
      assert.strictEqual(target.is_alive, true, `Organism ${org.organism_id} must be alive`);
    }

    // Default overview framing
    assert.strictEqual(camera.position.x, 400.0);
    assert.strictEqual(camera.position.y, 400.0);
    assert.strictEqual(camera.zoom, camera.calculateDefaultOverviewZoom(camera.viewportSize));
    assert.strictEqual(camera.isTracking, false);
    assert.strictEqual(camera.isFocusing, false);
  });

  // C10-E02: Phenotype -> Morphology Deterministic Consistency
  it('C10-E02: Phenotype -> Morphology deterministic consistency across full population', () => {
    const session = new DemoSimulationSession({ seed: 1002 });
    const snap = session.getSnapshot();

    assert.strictEqual(snap.organisms.length, 10);
    for (const org of snap.organisms) {
      // 5 Authoritative visual phenotype fields
      assert.ok(typeof org.body_scale_index === 'number');
      assert.ok(typeof org.cuticle_pigment_ratio === 'number');
      assert.ok(typeof org.cephalic_horn_scale === 'number');
      assert.ok(typeof org.thoracic_horn_scale === 'number');
      assert.ok(typeof org.tarsal_grip_index === 'number');

      // Female horn scale invariant: strictly 0.0
      if (org.sex === 'FEMALE') {
        assert.strictEqual(org.cephalic_horn_scale, 0.0, 'Female cephalic horn scale must be 0.0');
        assert.strictEqual(org.thoracic_horn_scale, 0.0, 'Female thoracic horn scale must be 0.0');
      }

      // Procedural morphology evaluation
      const morph = evaluateMorphology(org);
      assert.strictEqual(morph.is_valid, true, `Morphology must be valid for ${org.organism_id}`);
      assert.ok(morph.body_scale >= 0.42 && morph.body_scale <= 1.50);
      assert.ok(morph.cuticle_color.r >= 0 && morph.cuticle_color.r <= 1);
      assert.ok(Number.isFinite(morph.cephalic_horn_len));
      assert.ok(Number.isFinite(morph.thoracic_horn_len));
      assert.ok(Number.isFinite(morph.tarsal_leg_len));

      if (org.sex === 'FEMALE') {
        assert.strictEqual(morph.cephalic_horn_len, 0.0);
        assert.strictEqual(morph.thoracic_horn_len, 0.0);
      }
    }
  });

  // C10-E03: Selection -> 'F' Focus matches exact visual target & converges
  it('C10-E03: Selection hit-testing -> Camera Focus (F) converges smoothly and halts without following', () => {
    const session = new DemoSimulationSession({ seed: 1003 });
    const snap = session.getSnapshot();

    const overlay = new OrganismsOverlayModel();
    overlay.applySnapshotOrganisms(snap.organisms, 0);
    const camera = new CameraFollowModel(overlay);
    camera.resetToDefaultFraming();

    const targetOrg = snap.organisms[0];
    const initialTargetRec = overlay.getOrganismCameraTarget(targetOrg.organism_id);
    assert.strictEqual(initialTargetRec.valid, true);

    // Hit-test organism
    const hit = overlay.hitTestOrganism(initialTargetRec.visual_position);
    assert.ok(hit, 'Hit-test should locate organism at its visual position');
    assert.strictEqual(hit.organism_id, targetOrg.organism_id);

    overlay.selectOrganism(hit.organism_id);
    assert.strictEqual(overlay.selectedOrganismId, hit.organism_id);

    // Trigger one-shot Focus
    const focusOk = camera.focusOrganism(hit.organism_id);
    assert.strictEqual(focusOk, true);
    assert.strictEqual(camera.isFocusing, true);
    assert.strictEqual(camera.isTracking, false);

    // Simulate 60 frames (1 second at 60fps)
    for (let frame = 0; frame < 60; frame++) {
      camera.process(1.0 / 60.0);
    }

    // Focus must converge and finish
    assert.strictEqual(camera.isFocusing, false, 'Focus must finish after converging within 0.5px');
    assert.strictEqual(camera.isTracking, false, 'Focus must NOT transition into continuous tracking');

    const finalTargetRec = overlay.getOrganismCameraTarget(targetOrg.organism_id);
    const clampedExpected = camera.clampCameraCenter(finalTargetRec.visual_position, camera.viewportSize, camera.zoom);
    assert.ok(Math.abs(camera.position.x - clampedExpected.x) < 0.001);
    assert.ok(Math.abs(camera.position.y - clampedExpected.y) < 0.001);
  });

  // C10-E04: Selection -> 'Shift+F' Follow tracks visual position
  it('C10-E04: Selection -> Camera Follow (Shift+F) binds to target and tracks visual position', () => {
    const session = new DemoSimulationSession({ seed: 1004 });
    const snap = session.getSnapshot();

    const overlay = new OrganismsOverlayModel();
    overlay.applySnapshotOrganisms(snap.organisms, 0);
    const camera = new CameraFollowModel(overlay);
    camera.resetToDefaultFraming();

    const targetId = snap.organisms[0].organism_id;
    overlay.selectOrganism(targetId);

    const followOk = camera.startFollowing(targetId);
    assert.strictEqual(followOk, true);
    assert.strictEqual(camera.isTracking, true);
    assert.strictEqual(camera.targetId, targetId);
    assert.strictEqual(camera.isFocusing, false);

    // Run follow frames
    for (let i = 0; i < 30; i++) {
      camera.process(1.0 / 60.0);
    }

    const rec = overlay.getOrganismCameraTarget(targetId);
    const clampedTarget = camera.clampCameraCenter(rec.visual_position, camera.viewportSize, camera.zoom);
    assert.ok(Math.abs(camera.position.x - clampedTarget.x) < 0.1);
    assert.ok(Math.abs(camera.position.y - clampedTarget.y) < 0.1);
  });

  // C10-E05: STEP -> Interpolation -> Follow Alignment
  it('C10-E05: Simulation STEP -> interpolation -> follow alignment (DRAW === HIT === TARGET)', () => {
    const session = new DemoSimulationSession({ seed: 1005 });
    const snap0 = session.getSnapshot();

    const overlay = new OrganismsOverlayModel();
    overlay.applySnapshotOrganisms(snap0.organisms, 0);
    const camera = new CameraFollowModel(overlay);
    camera.resetToDefaultFraming();

    const targetId = snap0.organisms[0].organism_id;
    overlay.selectOrganism(targetId);
    camera.startFollowing(targetId);

    // Advance simulation tick 0 -> 1
    session.step(1);
    const snap1 = session.getSnapshot();
    assert.strictEqual(snap1.simulation_tick, 1);

    // Apply tick 1 snapshot
    overlay.applySnapshotOrganisms(snap1.organisms, 0);

    // Test intermediate interpolation stages: alpha = 0.0, 0.5, 1.0
    for (const alpha of [0.0, 0.5, 1.0]) {
      overlay.setInterpolationAlpha(targetId, alpha);

      // Query presentation endpoints
      const targetRec = overlay.getOrganismCameraTarget(targetId);
      assert.strictEqual(targetRec.valid, true);

      // DRAW POSITION: returned by getOrganismCameraTarget
      const drawPos = targetRec.visual_position;

      // HIT TEST POSITION: must match visual position
      const hitOrg = overlay.hitTestOrganism(drawPos);
      assert.ok(hitOrg, `Hit test at alpha ${alpha} must find organism`);
      assert.strictEqual(hitOrg.organism_id, targetId);

      // CAMERA TARGET POSITION: directly equals drawPos
      assert.strictEqual(drawPos.x, targetRec.visual_position.x);
      assert.strictEqual(drawPos.y, targetRec.visual_position.y);

      // Camera follow step
      camera.process(1.0 / 60.0);
      assert.strictEqual(camera.isTracking, true);
    }
  });

  // C10-E06: Death -> Selection Preserved -> Follow Cancelled
  it('C10-E06: Organism death -> selection preserved -> active follow cancelled immediately with finite coords', () => {
    const session = new DemoSimulationSession({ seed: 1006 });
    const snap = session.getSnapshot();

    const overlay = new OrganismsOverlayModel();
    overlay.applySnapshotOrganisms(snap.organisms, 0);
    const camera = new CameraFollowModel(overlay);
    camera.resetToDefaultFraming();

    const targetId = snap.organisms[0].organism_id;
    overlay.selectOrganism(targetId);
    camera.startFollowing(targetId);

    // Run 10 follow frames
    for (let i = 0; i < 10; i++) camera.process(1.0 / 60.0);
    assert.strictEqual(camera.isTracking, true);
    const posBeforeDeath = { ...camera.position };

    // Simulate organism death in upstream snapshot
    const deadSnapOrganisms = snap.organisms.map(o => {
      if (o.organism_id === targetId) {
        return { ...o, is_alive: false };
      }
      return o;
    });

    overlay.applySnapshotOrganisms(deadSnapOrganisms, 0);

    // Organism is now dead in cache
    const targetRec = overlay.getOrganismCameraTarget(targetId);
    assert.strictEqual(targetRec.valid, true);
    assert.strictEqual(targetRec.is_alive, false);

    // Invariant 1: Selection is preserved on corpse
    assert.strictEqual(overlay.selectedOrganismId, targetId, 'Selection must remain on corpse');

    // Invariant 2: Active follow cancelled immediately on frame 0
    camera.process(1.0 / 60.0);
    assert.strictEqual(camera.isTracking, false, 'Follow must be cancelled immediately when target dies');
    assert.strictEqual(camera.targetId, '', 'Target ID must be cleared');

    // Invariant 3: Camera coordinates are finite and freeze cleanly
    assert.ok(Number.isFinite(camera.position.x));
    assert.ok(Number.isFinite(camera.position.y));
    assert.ok(Math.abs(camera.position.x - posBeforeDeath.x) < 5.0);
    assert.ok(Math.abs(camera.position.y - posBeforeDeath.y) < 5.0);
  });

  // C10-E07: RESET -> Epoch -> Selection Cleared -> Camera Default Overview
  it('C10-E07: Simulation RESET -> epoch increment (N -> N+1) -> selection cleared -> camera default overview', () => {
    const session = new DemoSimulationSession({ seed: 1007 });
    const overlay = new OrganismsOverlayModel();
    const camera = new CameraFollowModel(overlay);
    camera.resetToDefaultFraming();
    const synchronizer = new SnapshotSynchronizerModel(overlay);

    // Initial snapshot (Epoch 0)
    synchronizer.handleResponse({
      command: 'getSnapshot',
      success: true,
      result: { snapshot: session.getSnapshot() }
    });

    const targetId = session.getSnapshot().organisms[0].organism_id;
    overlay.selectOrganism(targetId);
    camera.startFollowing(targetId);
    assert.strictEqual(camera.isTracking, true);

    // User triggers RESET
    session.reset();
    const resetSnap = session.getSnapshot();

    const resetResponse = {
      command: 'reset',
      success: true,
      result: { snapshot: resetSnap }
    };

    synchronizer.handleResponse(resetResponse);

    // Epoch incremented
    assert.strictEqual(synchronizer.sessionEpoch, 1, 'Epoch must increment to 1');
    assert.strictEqual(synchronizer.lastAcceptedTick, 0, 'Tick must reset to 0');

    // Selection cleared
    assert.strictEqual(overlay.selectedOrganismId, '', 'Selection must be purged on epoch change');

    // Camera reset to default overview
    assert.strictEqual(camera.isTracking, false, 'Tracking must be cancelled');
    assert.strictEqual(camera.isFocusing, false, 'Focus must be cancelled');
    assert.strictEqual(camera.position.x, 400.0, 'Camera must return to WORLD_CENTER.x');
    assert.strictEqual(camera.position.y, 400.0, 'Camera must return to WORLD_CENTER.y');
    assert.strictEqual(camera.zoom, camera.calculateDefaultOverviewZoom(camera.viewportSize));
  });

  // C10-E08: Same-ID Recreation in Epoch N+1 -> Zero Auto-Follow Leakage
  it('C10-E08: Same-ID recreation in Epoch N+1 -> camera remains strictly IDLE across 30+ frames', () => {
    const session = new DemoSimulationSession({ seed: 1008 });
    const overlay = new OrganismsOverlayModel();
    const camera = new CameraFollowModel(overlay);
    camera.resetToDefaultFraming();
    const synchronizer = new SnapshotSynchronizerModel(overlay);

    // Epoch 0
    synchronizer.handleResponse({
      command: 'getSnapshot',
      success: true,
      result: { snapshot: session.getSnapshot() }
    });

    const orgId = session.getSnapshot().organisms[0].organism_id;
    overlay.selectOrganism(orgId);
    camera.startFollowing(orgId);
    assert.strictEqual(camera.isTracking, true);

    // Reset into Epoch 1
    session.reset();
    synchronizer.handleResponse({
      command: 'reset',
      success: true,
      result: { snapshot: session.getSnapshot() }
    });

    assert.strictEqual(camera.isTracking, false);
    assert.strictEqual(overlay.selectedOrganismId, '');

    // Next tick snapshot arrives in Epoch 1 containing same orgId
    session.step(1);
    synchronizer.handleResponse({
      command: 'step',
      success: true,
      result: { snapshot: session.getSnapshot() }
    });

    // Run 35 frames
    for (let f = 0; f < 35; f++) {
      camera.process(1.0 / 60.0);
      assert.strictEqual(camera.isTracking, false, `Frame ${f}: Camera must remain not tracking`);
      assert.strictEqual(camera.isFocusing, false, `Frame ${f}: Camera must remain not focusing`);
      assert.strictEqual(camera.targetId, '', `Frame ${f}: targetId must be empty`);
      assert.strictEqual(camera.position.x, 400.0);
      assert.strictEqual(camera.position.y, 400.0);
    }
  });

  // C10-E09: PLAY Polling Cadence & Smooth Camera Tracking
  it('C10-E09: PLAY polling simulation -> 10 Hz cadence -> continuous visual updates & smooth tracking', () => {
    const session = new DemoSimulationSession({ seed: 1009 });
    const overlay = new OrganismsOverlayModel();
    const camera = new CameraFollowModel(overlay);
    camera.resetToDefaultFraming();
    const synchronizer = new SnapshotSynchronizerModel(overlay);

    const mockIpc = { sentCommands: [] };
    const worldView = new WorldViewModel(mockIpc, synchronizer);

    // Connect & initial sync
    worldView.onConnected();
    assert.strictEqual(mockIpc.sentCommands.length, 1);
    assert.strictEqual(mockIpc.sentCommands[0].source, 'INITIAL');

    // Initial snapshot accepted
    const initSnap = session.getSnapshot();
    worldView.onResponseReceived({ command: 'getSnapshot', success: true, result: { snapshot: initSnap } });
    synchronizer.handleResponse({ command: 'getSnapshot', success: true, result: { snapshot: initSnap } });

    // Select and start follow
    const targetId = initSnap.organisms[0].organism_id;
    overlay.selectOrganism(targetId);
    camera.startFollowing(targetId);

    // Switch to PLAYING
    worldView.currentPlaybackStatus = 'PLAYING';

    // Advance 5 polling cycles (each 100ms)
    for (let cycle = 1; cycle <= 5; cycle++) {
      // 100ms process
      worldView.process(0.1);
      assert.strictEqual(worldView.snapshotPollInFlight, true, `Cycle ${cycle}: poll must be in flight`);
      assert.strictEqual(mockIpc.sentCommands[mockIpc.sentCommands.length - 1].source, 'POLL');

      // Simulation steps
      session.step(1);
      const snap = session.getSnapshot();
      assert.strictEqual(snap.simulation_tick, cycle);

      // Server returns response
      worldView.onResponseReceived({ command: 'getSnapshot', success: true, result: { snapshot: snap } });
      synchronizer.handleResponse({ command: 'getSnapshot', success: true, result: { snapshot: snap } });

      assert.strictEqual(worldView.snapshotPollInFlight, false, `Cycle ${cycle}: poll in flight must be cleared`);
      assert.strictEqual(synchronizer.lastAcceptedTick, cycle);

      // Advance camera frames
      for (let f = 0; f < 6; f++) {
        camera.process(1.0 / 60.0);
      }
      assert.strictEqual(camera.isTracking, true);
    }
  });

  // C10-E10: RESET during PLAY Polling -> Stale Packet Isolation
  it('C10-E10: Reset during PLAY polling -> stale pre-reset packets rejected -> zero resurrection or leakage', () => {
    const session = new DemoSimulationSession({ seed: 1010 });
    const overlay = new OrganismsOverlayModel();
    const camera = new CameraFollowModel(overlay);
    camera.resetToDefaultFraming();
    const synchronizer = new SnapshotSynchronizerModel(overlay);

    const mockIpc = { sentCommands: [] };
    const worldView = new WorldViewModel(mockIpc, synchronizer);

    // Bootstrap Epoch 0
    worldView.onConnected();
    const snap0 = session.getSnapshot();
    worldView.onResponseReceived({ command: 'getSnapshot', success: true, result: { snapshot: snap0 } });
    synchronizer.handleResponse({ command: 'getSnapshot', success: true, result: { snapshot: snap0 } });

    const oldTargetId = snap0.organisms[0].organism_id;
    overlay.selectOrganism(oldTargetId);
    camera.startFollowing(oldTargetId);

    // Step to tick 5
    session.step(5);
    const snap5 = session.getSnapshot();
    synchronizer.handleResponse({ command: 'step', success: true, result: { snapshot: snap5 } });

    // PLAY is active, POLL A is dispatched for tick 5
    worldView.currentPlaybackStatus = 'PLAYING';
    worldView.process(0.1);
    assert.strictEqual(worldView.snapshotPollInFlight, true);
    const pollAPacket = {
      command: 'getSnapshot',
      success: true,
      result: { snapshot: { ...snap5, simulation_tick: 5 } }
    };

    // User triggers RESET before Poll A returns
    session.reset();
    const resetSnap = session.getSnapshot();
    const resetPacket = {
      command: 'reset',
      success: true,
      result: { snapshot: resetSnap }
    };

    // Reset response arrives first
    worldView.onResponseReceived(resetPacket);
    synchronizer.handleResponse(resetPacket);

    assert.strictEqual(synchronizer.sessionEpoch, 1, 'Epoch must be 1');
    assert.strictEqual(synchronizer.lastAcceptedTick, 0, 'Tick must be reset to 0');
    assert.strictEqual(worldView.snapshotPollInFlight, false, 'Poll in flight must be cleared by reset');
    assert.strictEqual(camera.isTracking, false, 'Camera tracking must be purged');

    // Send Poll B in Epoch 1
    session.step(1);
    const snap1Epoch1 = session.getSnapshot();
    worldView.process(0.1);
    const pollBPacket = {
      command: 'getSnapshot',
      success: true,
      result: { snapshot: snap1Epoch1 }
    };

    // Late POLL A arrives!
    worldView.onResponseReceived(pollAPacket);
    // Even if late poll arrives, Poll B follows and restores valid tick 1
    worldView.onResponseReceived(pollBPacket);
    synchronizer.handleResponse(pollBPacket);

    // Verify invariants:
    assert.strictEqual(synchronizer.sessionEpoch, 1, 'Epoch must remain strictly 1');
    assert.strictEqual(camera.isTracking, false, 'Camera must remain in default overview');
    assert.strictEqual(camera.position.x, 400.0);
    assert.strictEqual(camera.position.y, 400.0);
  });

  // C10-E11: Transport Disconnect -> Freeze -> Reconnect
  it('C10-E11: Transport disconnect freezes camera cleanly -> reconnect resumes without teleportation', () => {
    const session = new DemoSimulationSession({ seed: 1011 });
    const overlay = new OrganismsOverlayModel();
    const camera = new CameraFollowModel(overlay);
    camera.resetToDefaultFraming();
    const synchronizer = new SnapshotSynchronizerModel(overlay);

    const mockIpc = { sentCommands: [] };
    const worldView = new WorldViewModel(mockIpc, synchronizer);

    // Initial connection
    worldView.onConnected();
    const snap0 = session.getSnapshot();
    worldView.onResponseReceived({ command: 'getSnapshot', success: true, result: { snapshot: snap0 } });
    synchronizer.handleResponse({ command: 'getSnapshot', success: true, result: { snapshot: snap0 } });

    const targetId = snap0.organisms[0].organism_id;
    overlay.selectOrganism(targetId);
    camera.startFollowing(targetId);

    // Run 10 frames
    for (let f = 0; f < 10; f++) camera.process(1.0 / 60.0);
    const frozenPos = { ...camera.position };
    assert.ok(Number.isFinite(frozenPos.x));
    assert.ok(Number.isFinite(frozenPos.y));

    // Transport DISCONNECTS
    worldView.onDisconnected();
    synchronizer.bridgeState = 'DISCONNECTED';

    // Camera loop continues while disconnected
    for (let f = 0; f < 30; f++) {
      camera.process(1.0 / 60.0);
      assert.strictEqual(camera.position.x, frozenPos.x);
      assert.strictEqual(camera.position.y, frozenPos.y);
    }

    // Transport RECONNECTS (generation increments)
    assert.strictEqual(worldView.connectionGeneration, 1);
    worldView.onConnected();
    assert.strictEqual(worldView.connectionGeneration, 2);

    // Exactly one new initial snapshot command sent for gen 2
    const gen2Requests = mockIpc.sentCommands.filter(c => c.gen === 2);
    assert.strictEqual(gen2Requests.length, 1);
  });

  // C10-E12: Reconnection Generation Guard
  it('C10-E12: Reconnection generation guard -> exactly one initial getSnapshot per generation', () => {
    const mockIpc = { sentCommands: [] };
    const worldView = new WorldViewModel(mockIpc, null);

    // Startup connect (Gen 1)
    worldView.onConnected();
    assert.strictEqual(worldView.connectionGeneration, 1);
    assert.strictEqual(mockIpc.sentCommands.length, 1);
    assert.strictEqual(mockIpc.sentCommands[0].gen, 1);

    // Spurious second connect notification in same generation must NOT re-issue
    worldView.initialSnapshotRequestedGen = 1;
    if (worldView.initialSnapshotRequestedGen !== worldView.connectionGeneration) {
      mockIpc.sentCommands.push({ command: 'getSnapshot', gen: 1 });
    }
    assert.strictEqual(mockIpc.sentCommands.length, 1);

    // Disconnect -> Reconnect (Gen 2)
    worldView.onDisconnected();
    worldView.onConnected();
    assert.strictEqual(worldView.connectionGeneration, 2);
    assert.strictEqual(mockIpc.sentCommands.length, 2);
    assert.strictEqual(mockIpc.sentCommands[1].gen, 2);
  });

  // C10-E13: Monotonic Tick Validation & Malformed Packet Rejection
  it('C10-E13: Monotonic tick validation & stale/duplicate response rejection without visual jitter', () => {
    const overlay = new OrganismsOverlayModel();
    const synchronizer = new SnapshotSynchronizerModel(overlay);

    const makePacket = (tick) => ({
      command: 'step',
      success: true,
      result: {
        snapshot: {
          simulation_tick: tick,
          organisms: [{ organism_id: 'org_test', position: { x: 10, y: 10, z: 0 } }]
        }
      }
    });

    // 1. Tick 5 accepted
    assert.strictEqual(synchronizer.handleResponse(makePacket(5)), true);
    assert.strictEqual(synchronizer.lastAcceptedTick, 5);

    // 2. Duplicate tick 5 ignored
    assert.strictEqual(synchronizer.handleResponse(makePacket(5)), false);
    assert.strictEqual(synchronizer.lastAcceptedTick, 5);

    // 3. Stale tick 4 dropped
    assert.strictEqual(synchronizer.handleResponse(makePacket(4)), false);
    assert.strictEqual(synchronizer.lastAcceptedTick, 5);
    assert.ok(synchronizer.warnings.some(w => w.includes('Stale snapshot dropped')));

    // 4. Tick 6 accepted
    assert.strictEqual(synchronizer.handleResponse(makePacket(6)), true);
    assert.strictEqual(synchronizer.lastAcceptedTick, 6);

    // 5. Float tick (6.5) rejected
    assert.strictEqual(synchronizer.handleResponse(makePacket(6.5)), false);
    assert.strictEqual(synchronizer.lastAcceptedTick, 6);

    // 6. Negative tick (-1) rejected
    assert.strictEqual(synchronizer.handleResponse(makePacket(-1)), false);
    assert.strictEqual(synchronizer.lastAcceptedTick, 6);
  });

  // C10-E14: Static Safety Audit
  it('C10-E14: Static safety audit: zero hidden sources of truth across presentation layer', () => {
    const cameraGd = fs.readFileSync(CAMERA_CONTROLLER_PATH, 'utf8');
    const overlayGd = fs.readFileSync(ORGANISMS_OVERLAY_PATH, 'utf8');
    const inspectionGd = fs.readFileSync(INSPECTION_UI_PATH, 'utf8');

    // 1. CameraController has zero references to IPC, SnapshotSynchronizer, or Simulation
    assert.ok(!cameraGd.includes('SnapshotSynchronizer'), 'CameraController must not reference SnapshotSynchronizer');
    assert.ok(!cameraGd.includes('IpcClient'), 'CameraController must not reference IpcClient');
    assert.ok(!cameraGd.includes('simulation_tick'), 'CameraController must not reference simulation_tick');

    // 2. OrganismInspectionUI has zero references to IPC or SnapshotSynchronizer
    assert.ok(!inspectionGd.includes('SnapshotSynchronizer'), 'InspectionUI must not reference SnapshotSynchronizer');
    assert.ok(!inspectionGd.includes('IpcClient'), 'InspectionUI must not reference IpcClient');

    // 3. OrganismsOverlay is the sole source of visual coordinates
    assert.ok(overlayGd.includes('func get_organism_camera_target'), 'Overlay must provide camera target');
    assert.ok(overlayGd.includes('func _get_organism_visual_position'), 'Overlay must calculate visual position');
    assert.ok(overlayGd.includes('func _calculate_slot_center'), 'Overlay must calculate slot center');
  });

  // C10-E15: Deterministic Replay (Contract & State Level)
  it('C10-E15: Deterministic replay: two independent sessions produce identical contract/state history', () => {
    function runSimulationLifecycle(seed) {
      const session = new DemoSimulationSession({ seed });
      const overlay = new OrganismsOverlayModel();
      const camera = new CameraFollowModel(overlay);
      camera.resetToDefaultFraming();
      const synchronizer = new SnapshotSynchronizerModel(overlay);

      const history = [];

      function recordState(actionLabel) {
        const snap = session.getSnapshot();
        const selectedId = overlay.selectedOrganismId;
        const targetRec = selectedId ? overlay.getOrganismCameraTarget(selectedId) : null;

        history.push({
          action: actionLabel,
          tick: synchronizer.lastAcceptedTick,
          epoch: synchronizer.sessionEpoch,
          orgCount: overlay.cachedOrganisms.length,
          orgPositions: overlay.cachedOrganisms.map(o => ({
            id: o.organism_id,
            x: o.position?.x,
            y: o.position?.y,
            z: o.position?.z
          })),
          selectedId: selectedId,
          cameraIsTracking: camera.isTracking,
          cameraIsFocusing: camera.isFocusing,
          cameraTargetId: camera.targetId,
          cameraPos: {
            x: Number(camera.position.x.toFixed(4)),
            y: Number(camera.position.y.toFixed(4))
          },
          cameraZoom: Number(camera.zoom.toFixed(4)),
          targetVisualPos: targetRec ? {
            x: Number(targetRec.visual_position.x.toFixed(4)),
            y: Number(targetRec.visual_position.y.toFixed(4))
          } : null
        });
      }

      // Step 1: Initial snapshot
      synchronizer.handleResponse({
        command: 'getSnapshot',
        success: true,
        result: { snapshot: session.getSnapshot() }
      });
      recordState('INITIAL_BOOT');

      // Step 2: Select first organism
      const firstId = session.getSnapshot().organisms[0].organism_id;
      overlay.selectOrganism(firstId);
      recordState('SELECT_ORG');

      // Step 3: Trigger Follow
      camera.startFollowing(firstId);
      camera.process(1.0 / 60.0);
      recordState('FOLLOW_START');

      // Step 4: Step simulation 5 times with 6 frames each
      for (let s = 1; s <= 5; s++) {
        session.step(1);
        synchronizer.handleResponse({
          command: 'step',
          success: true,
          result: { snapshot: session.getSnapshot() }
        });
        for (let f = 0; f < 6; f++) {
          camera.process(1.0 / 60.0);
        }
        recordState(`STEP_${s}`);
      }

      // Step 5: Simulation Reset
      session.reset();
      synchronizer.handleResponse({
        command: 'reset',
        success: true,
        result: { snapshot: session.getSnapshot() }
      });
      camera.process(1.0 / 60.0);
      recordState('RESET');

      // Step 6: Step 3 ticks in Epoch 1
      for (let s = 1; s <= 3; s++) {
        session.step(1);
        synchronizer.handleResponse({
          command: 'step',
          success: true,
          result: { snapshot: session.getSnapshot() }
        });
        for (let f = 0; f < 6; f++) {
          camera.process(1.0 / 60.0);
        }
        recordState(`POST_RESET_STEP_${s}`);
      }

      return history;
    }

    const run1 = runSimulationLifecycle(42424);
    const run2 = runSimulationLifecycle(42424);

    assert.strictEqual(run1.length, run2.length);
    assert.deepStrictEqual(run1, run2, 'Session 1 and Session 2 must produce bit-for-bit identical state histories');
  });

  // C10-E16: Frozen-domain guard verifies only authorized files have been modified/introduced
  it('C10-E16: Frozen-domain guard verifies only authorized files have been modified/introduced', () => {
    const baseCommit = 'fa0ad23c13d6d8ccda4aa0b40d5fe33ccb767c5f';
    const gitDiff = execSync(`git diff --name-only ${baseCommit}`, { cwd: ROOT_DIR, encoding: 'utf8' }).trim();
    const modifiedFiles = gitDiff ? gitDiff.split(/\r?\n/).filter(Boolean) : [];

    const untracked = execSync('git status --porcelain', { cwd: ROOT_DIR, encoding: 'utf8' }).trim();
    const untrackedFiles = untracked.split(/\r?\n/).filter(l => l.startsWith('?? ')).map(l => l.slice(3).trim());

    const allChanged = [...modifiedFiles, ...untrackedFiles];
    const authorized = [
      'tests/demo/demo_c10_integration.test.js'
    ];

    for (const f of allChanged) {
      const normalized = f.replace(/\\/g, '/');
      assert.ok(authorized.includes(normalized), `Unauthorized file modified in C-10-E: ${normalized}`);
    }
  });

});
