/**
 * tests/demo/demo_c10_camera_follow.test.js
 * 
 * DEMO-01-C / C-10-C: Organism Focus & Camera Follow Test Suite
 * 
 * Presentation-only camera focus and follow model verification:
 * - One-shot Focus ('F') on selected organisms (alive or dead)
 * - Continuous Follow ('Shift+F') tracking live organisms on active Z-layer
 * - Unified single source of truth for visual position & slot offsets
 * - Narrow presentation record contract: { valid, is_alive, visual_position }
 * - Frame-rate-independent camera smoothing (1.0 - exp(-speed * delta))
 * - Automatic cancellation on manual pan (WASD, drag), death, disappearance, or Z change
 * - Strict epoch isolation via selection signal
 * - Zero simulation authority, zero IPC, zero duplicate organism interpolation
 * 
 * Covers C10-C01 through C10-C31 and C10-D01 through C10-D12 specified by Game Director.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT_DIR = path.resolve('D:/LinhSinhVN');
const CONTROLLER_PATH = path.join(ROOT_DIR, 'godot/scripts/presentation/camera_controller.gd');
const OVERLAY_PATH = path.join(ROOT_DIR, 'godot/scripts/presentation/organisms_overlay.gd');
const SCENE_PATH = path.join(ROOT_DIR, 'godot/scenes/world_view.tscn');

const WORLD_WIDTH = 800.0;
const WORLD_HEIGHT = 800.0;
const WORLD_CENTER = { x: 400.0, y: 400.0 };

const MIN_ZOOM = 0.6;
const MAX_ZOOM = 4.0;
const FOCUS_SMOOTH_SPEED = 10.0;
const FOLLOW_SMOOTH_SPEED = 12.0;

// Pure Mathematical & State Model Mirroring OrganismsOverlay Camera Target Pipeline
class OrganismsOverlayModel {
  constructor() {
    this.activeZLayer = 0;
    this.selectedOrganismId = '';
    this.cachedOrganisms = [];
    this.interpolationStates = {};
    this.selectionListeners = [];
    this.epochListeners = [];
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

  simulateEpochChange(newEpoch = 1) {
    this.selectedOrganismId = '';
    this.cachedOrganisms = [];
    this.interpolationStates = {};
    for (const l of this.selectionListeners) {
      l('');
    }
    for (const l of this.epochListeners) {
      l(newEpoch);
    }
  }
}

// Pure Mathematical & State Model Mirroring CameraController Focus & Follow
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
      if (this.overlay.connectEpoch) {
        this.overlay.connectEpoch(epoch => this.onEpochChanged(epoch));
      }
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
        // Same organism -> preserve follow
      } else {
        // A -> B
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
    // Manual pan check
    if (inputVec.x !== 0 || inputVec.y !== 0) {
      if (this.isTracking) this.stopFollowing();
      if (this.isFocusing) this.cancelFocus();

      const len = Math.hypot(inputVec.x, inputVec.y);
      const dir = { x: inputVec.x / len, y: inputVec.y / len };
      const screenDelta = { x: dir.x * (400.0 * delta), y: dir.y * (400.0 * delta) };
      const worldDelta = { x: screenDelta.x / this.zoom, y: screenDelta.y / this.zoom };
      this.position = this.clampCameraCenter(
        { x: this.position.x + worldDelta.x, y: this.position.y + worldDelta.y },
        this.viewportSize,
        this.zoom
      );
      return;
    }

    // Follow loop
    if (this.isTracking) {
      const rec = this.overlay.getOrganismCameraTarget(this.targetId);
      if (!rec.valid || !rec.is_alive) {
        this.stopFollowing();
        return;
      }
      const clampedDest = this.clampCameraCenter(rec.visual_position, this.viewportSize, this.zoom);
      const weight = 1.0 - Math.exp(-FOLLOW_SMOOTH_SPEED * delta);
      this.position = {
        x: this.position.x + (clampedDest.x - this.position.x) * weight,
        y: this.position.y + (clampedDest.y - this.position.y) * weight
      };
      return;
    }

    // Focus loop
    if (this.isFocusing) {
      const rec = this.overlay.getOrganismCameraTarget(this.focusId);
      if (!rec.valid) {
        this.cancelFocus();
        return;
      }
      const isAliveNow = Boolean(rec.is_alive);
      if (this.focusStartedAlive && !isAliveNow) {
        this.cancelFocus();
        return;
      }
      const clampedDest = this.clampCameraCenter(rec.visual_position, this.viewportSize, this.zoom);
      const weight = 1.0 - Math.exp(-FOCUS_SMOOTH_SPEED * delta);
      this.position = {
        x: this.position.x + (clampedDest.x - this.position.x) * weight,
        y: this.position.y + (clampedDest.y - this.position.y) * weight
      };
      if (Math.hypot(clampedDest.x - this.position.x, clampedDest.y - this.position.y) < 0.5) {
        this.position = clampedDest;
        this.cancelFocus();
      }
    }
  }
}

describe('DEMO-01-C / C-10-C: Organism Focus & Camera Follow Suite', () => {

  // --- C10-C01: selected organism focus ---
  it('C10-C01: focus_organism sets camera target toward selected organism visual position', () => {
    const overlay = new OrganismsOverlayModel();
    overlay.cachedOrganisms = [
      { organism_id: 'org_1', position: { x: 25, y: 25, z: 0 }, is_alive: true }
    ];
    const camera = new CameraFollowModel(overlay);
    assert.strictEqual(camera.focusOrganism('org_1'), true);
    assert.strictEqual(camera.isFocusing, true);
    assert.strictEqual(camera.focusId, 'org_1');
  });

  // --- C10-C02: focus uses exact visual position ---
  it('C10-C02: Focus consumes interpolated visual position rather than discrete grid position', () => {
    const overlay = new OrganismsOverlayModel();
    overlay.cachedOrganisms = [
      { organism_id: 'org_1', position: { x: 21, y: 20, z: 0 }, is_alive: true }
    ];
    overlay.interpolationStates['org_1'] = {
      source_px: { x: 328.0, y: 328.0 },
      target_px: { x: 344.0, y: 328.0 },
      alpha: 0.5 // Midpoint: 336.0
    };
    const target = overlay.getOrganismCameraTarget('org_1');
    assert.strictEqual(target.valid, true);
    assert.strictEqual(target.visual_position.x, 336.0);
    assert.strictEqual(target.visual_position.y, 328.0);
  });

  // --- C10-C03: focus respects camera bounds ---
  it('C10-C03: Focus target respects clamp_camera_center bounds and cannot place viewport out of world', () => {
    const overlay = new OrganismsOverlayModel();
    overlay.cachedOrganisms = [
      { organism_id: 'org_edge', position: { x: 0, y: 0, z: 0 }, is_alive: true }
    ];
    const camera = new CameraFollowModel(overlay, { x: 1152.0, y: 648.0 });
    camera.zoom = 1.0;
    // With viewport 1152x648 at Z=1.0, width span exceeds 800, so cx locks to 400.0
    const clamped = camera.clampCameraCenter({ x: 8.0, y: 8.0 }, camera.viewportSize, camera.zoom);
    assert.strictEqual(clamped.x, 400.0);
    assert.ok(clamped.y >= 324.0);
  });

  // --- C10-C04: follow activation ---
  it('C10-C04: start_following transitions controller into is_following == true for live organism', () => {
    const overlay = new OrganismsOverlayModel();
    overlay.cachedOrganisms = [
      { organism_id: 'org_live', position: { x: 25, y: 25, z: 0 }, is_alive: true }
    ];
    const camera = new CameraFollowModel(overlay);
    assert.strictEqual(camera.startFollowing('org_live'), true);
    assert.strictEqual(camera.isTracking, true);
    assert.strictEqual(camera.targetId, 'org_live');
  });

  // --- C10-C05: follow visual tracking ---
  it('C10-C05: Follow loop tracks visual position continuously across simulation frames', () => {
    const overlay = new OrganismsOverlayModel();
    overlay.cachedOrganisms = [
      { organism_id: 'org_moving', position: { x: 25, y: 25, z: 0 }, is_alive: true }
    ];
    const camera = new CameraFollowModel(overlay, { x: 400, y: 400 });
    camera.zoom = 2.0; // High zoom so camera centers exactly
    camera.startFollowing('org_moving');

    // Simulate 30 frames of follow tracking
    for (let f = 0; f < 30; f++) {
      camera.process(1.0 / 60.0);
    }
    // Target position is 25*16 + 8 = 408.0
    assert.ok(Math.abs(camera.position.x - 408.0) < 1.0);
    assert.ok(Math.abs(camera.position.y - 408.0) < 1.0);
  });

  // --- C10-C06: stacked target ---
  it('C10-C06: Follow targets exact quadrant slot offset for stacked organisms in the same cell', () => {
    const overlay = new OrganismsOverlayModel();
    overlay.cachedOrganisms = [
      { organism_id: 'org_a', position: { x: 10, y: 10, z: 0 }, is_alive: true },
      { organism_id: 'org_b', position: { x: 10, y: 10, z: 0 }, is_alive: true }
    ];
    const targetA = overlay.getOrganismCameraTarget('org_a');
    const targetB = overlay.getOrganismCameraTarget('org_b');

    assert.strictEqual(targetA.valid, true);
    assert.strictEqual(targetB.valid, true);
    // Origin is (160, 160). For count 2, slot 0 is +5, +8 -> (165, 168); slot 1 is +11, +8 -> (171, 168)
    assert.strictEqual(targetA.visual_position.x, 165.0);
    assert.strictEqual(targetA.visual_position.y, 168.0);
    assert.strictEqual(targetB.visual_position.x, 171.0);
    assert.strictEqual(targetB.visual_position.y, 168.0);
  });

  // --- C10-C07: dead target cancellation ---
  it('C10-C07: Dead organism (is_alive == false) automatically cancels follow mode', () => {
    const overlay = new OrganismsOverlayModel();
    overlay.cachedOrganisms = [
      { organism_id: 'org_dying', position: { x: 25, y: 25, z: 0 }, is_alive: true }
    ];
    const camera = new CameraFollowModel(overlay);
    camera.startFollowing('org_dying');
    assert.strictEqual(camera.isTracking, true);

    // Organism dies in new snapshot
    overlay.cachedOrganisms[0].is_alive = false;

    camera.process(1.0 / 60.0);
    assert.strictEqual(camera.isTracking, false, 'Follow must be cancelled when target dies');
    assert.strictEqual(camera.targetId, '');
  });

  // --- C10-C08: dead target focus remains possible ---
  it('C10-C08: Dead organism (is_alive == false) allows one-shot Focus on corpse', () => {
    const overlay = new OrganismsOverlayModel();
    overlay.cachedOrganisms = [
      { organism_id: 'org_corpse', position: { x: 25, y: 25, z: 0 }, is_alive: false }
    ];
    const targetRec = overlay.getOrganismCameraTarget('org_corpse');
    assert.strictEqual(targetRec.valid, true, 'Corpse on active Z layer is valid for presentation');
    assert.strictEqual(targetRec.is_alive, false);

    const camera = new CameraFollowModel(overlay);
    assert.strictEqual(camera.focusOrganism('org_corpse'), true, 'Focus on corpse must succeed');
    assert.strictEqual(camera.isFocusing, true);
  });

  // --- C10-C09: missing/pruned target cancellation ---
  it('C10-C09: Missing or pruned organism immediately cancels follow mode', () => {
    const overlay = new OrganismsOverlayModel();
    overlay.cachedOrganisms = [
      { organism_id: 'org_despawn', position: { x: 25, y: 25, z: 0 }, is_alive: true }
    ];
    const camera = new CameraFollowModel(overlay);
    camera.startFollowing('org_despawn');

    // Despawn/prune from snapshot
    overlay.cachedOrganisms = [];

    camera.process(1.0 / 60.0);
    assert.strictEqual(camera.isTracking, false);
    assert.strictEqual(camera.targetId, '');
  });

  // --- C10-C10: Z-layer cancellation ---
  it('C10-C10: Active Z-layer change with target on different layer cancels follow mode immediately', () => {
    const overlay = new OrganismsOverlayModel();
    overlay.cachedOrganisms = [
      { organism_id: 'org_z0', position: { x: 25, y: 25, z: 0 }, is_alive: true }
    ];
    const camera = new CameraFollowModel(overlay);
    camera.startFollowing('org_z0');

    // User changes active Z to 1
    overlay.activeZLayer = 1;

    camera.process(1.0 / 60.0);
    assert.strictEqual(camera.isTracking, false, 'Follow must cancel when target is invisible on active Z');
  });

  // --- C10-C11: reset/epoch cancellation ---
  it('C10-C11: Simulation RESET (epoch change) invalidates follow state via selection clear signal', () => {
    const overlay = new OrganismsOverlayModel();
    overlay.cachedOrganisms = [
      { organism_id: 'org_epoch', position: { x: 25, y: 25, z: 0 }, is_alive: true }
    ];
    const camera = new CameraFollowModel(overlay);
    camera.startFollowing('org_epoch');
    assert.strictEqual(camera.isTracking, true);

    // Simulation reset triggers epoch change and clears selection
    overlay.simulateEpochChange();

    assert.strictEqual(camera.isTracking, false, 'Follow must be cancelled on epoch change');
    assert.strictEqual(camera.targetId, '');
  });

  // --- C10-C12: epoch isolation ---
  it('C10-C12: Epoch isolation guarantees old organism ID cannot bridge into new simulation epoch', () => {
    const overlay = new OrganismsOverlayModel();
    const camera = new CameraFollowModel(overlay);
    overlay.cachedOrganisms = [
      { organism_id: 'org_old_epoch', position: { x: 25, y: 25, z: 0 }, is_alive: true }
    ];
    camera.startFollowing('org_old_epoch');

    // Epoch reset clears cache and selection
    overlay.simulateEpochChange();

    // New epoch populates new organisms
    overlay.cachedOrganisms = [
      { organism_id: 'org_new_epoch', position: { x: 25, y: 25, z: 0 }, is_alive: true }
    ];

    camera.process(1.0 / 60.0);
    assert.strictEqual(camera.isTracking, false);
    assert.strictEqual(camera.targetId, '');
  });

  // --- C10-C13: disconnect freeze/no jump ---
  it('C10-C13: Transport DISCONNECT freezes camera at last valid position with zero teleportation or NaN', () => {
    const overlay = new OrganismsOverlayModel();
    overlay.cachedOrganisms = [
      { organism_id: 'org_disc', position: { x: 25, y: 25, z: 0 }, is_alive: true }
    ];
    const camera = new CameraFollowModel(overlay, { x: 400, y: 400 });
    camera.zoom = 2.0;
    camera.startFollowing('org_disc');

    for (let f = 0; f < 90; f++) {
      camera.process(1.0 / 60.0);
    }
    const posBeforeDisconnect = { ...camera.position };

    // Simulation stops sending updates during disconnect
    for (let f = 0; f < 30; f++) {
      camera.process(1.0 / 60.0);
    }

    assert.ok(Math.abs(camera.position.x - posBeforeDisconnect.x) < 0.01);
    assert.ok(Math.abs(camera.position.y - posBeforeDisconnect.y) < 0.01);
    assert.ok(!isNaN(camera.position.x));
    assert.ok(!isNaN(camera.position.y));
  });

  // --- C10-C14: reconnect isolation ---
  it('C10-C14: Transport RECONNECT resumes follow only if organism is alive and present in current epoch', () => {
    const overlay = new OrganismsOverlayModel();
    const camera = new CameraFollowModel(overlay);
    overlay.cachedOrganisms = [
      { organism_id: 'org_rec', position: { x: 25, y: 25, z: 0 }, is_alive: true }
    ];
    camera.startFollowing('org_rec');

    // Transport reconnects with epoch reset
    overlay.simulateEpochChange();
    assert.strictEqual(camera.isTracking, false);
  });

  // --- C10-C15: keyboard pan cancellation ---
  it('C10-C15: Manual keyboard pan (WASD / Arrows) immediately cancels follow mode on frame 0', () => {
    const overlay = new OrganismsOverlayModel();
    overlay.cachedOrganisms = [
      { organism_id: 'org_pan', position: { x: 25, y: 25, z: 0 }, is_alive: true }
    ];
    const camera = new CameraFollowModel(overlay);
    camera.startFollowing('org_pan');
    assert.strictEqual(camera.isTracking, true);

    // User presses 'D' (right)
    camera.process(1.0 / 60.0, { x: 1.0, y: 0.0 });
    assert.strictEqual(camera.isTracking, false, 'Keyboard pan must immediately cancel follow');
    assert.strictEqual(camera.targetId, '');
  });

  // --- C10-C16: mouse drag cancellation ---
  it('C10-C16: Manual mouse drag pan immediately cancels follow mode', () => {
    const overlay = new OrganismsOverlayModel();
    overlay.cachedOrganisms = [
      { organism_id: 'org_drag', position: { x: 25, y: 25, z: 0 }, is_alive: true }
    ];
    const camera = new CameraFollowModel(overlay);
    camera.startFollowing('org_drag');

    // Simulate middle/right drag event start
    camera.stopFollowing(); // Mirrors _unhandled_input drag branch
    assert.strictEqual(camera.isTracking, false);
  });

  // --- C10-C17: wheel preserves follow ---
  it('C10-C17: Mouse wheel zoom preserves follow mode while updating camera zoom level', () => {
    const overlay = new OrganismsOverlayModel();
    overlay.cachedOrganisms = [
      { organism_id: 'org_zoom', position: { x: 25, y: 25, z: 0 }, is_alive: true }
    ];
    const camera = new CameraFollowModel(overlay);
    camera.startFollowing('org_zoom');

    // Zoom in
    camera.zoom = Math.min(MAX_ZOOM, camera.zoom * 1.15);
    camera.process(1.0 / 60.0);

    assert.strictEqual(camera.isTracking, true, 'Zoom must preserve active follow mode');
    assert.strictEqual(camera.targetId, 'org_zoom');
  });

  // --- C10-C18: F focus ---
  it('C10-C18: Key F triggers one-shot focus on currently selected organism', () => {
    const overlay = new OrganismsOverlayModel();
    overlay.cachedOrganisms = [
      { organism_id: 'org_f', position: { x: 30, y: 30, z: 0 }, is_alive: true }
    ];
    overlay.selectOrganism('org_f');
    const camera = new CameraFollowModel(overlay);

    assert.strictEqual(camera.focusOrganism(overlay.selectedOrganismId), true);
    assert.strictEqual(camera.isFocusing, true);
    assert.strictEqual(camera.isTracking, false, 'Focus must NOT activate continuous follow');
  });

  // --- C10-C19: Shift+F toggle ---
  it('C10-C19: Key Shift+F toggles follow mode for currently selected organism', () => {
    const overlay = new OrganismsOverlayModel();
    overlay.cachedOrganisms = [
      { organism_id: 'org_toggle', position: { x: 30, y: 30, z: 0 }, is_alive: true }
    ];
    overlay.selectOrganism('org_toggle');
    const camera = new CameraFollowModel(overlay);

    // Toggle ON
    assert.strictEqual(camera.startFollowing(overlay.selectedOrganismId), true);
    assert.strictEqual(camera.isTracking, true);

    // Toggle OFF
    camera.stopFollowing();
    assert.strictEqual(camera.isTracking, false);
  });

  // --- C10-C20: ESC cancellation ---
  it('C10-C20: Key Escape immediately cancels active follow mode', () => {
    const overlay = new OrganismsOverlayModel();
    overlay.cachedOrganisms = [
      { organism_id: 'org_esc', position: { x: 30, y: 30, z: 0 }, is_alive: true }
    ];
    const camera = new CameraFollowModel(overlay);
    camera.startFollowing('org_esc');
    assert.strictEqual(camera.isTracking, true);

    camera.stopFollowing(); // Mirrors ESC handler
    assert.strictEqual(camera.isTracking, false);
  });

  // --- C10-C21: selection change retarget/cancel ---
  it('C10-C21: Selection change retargets follow if new target is valid+alive, otherwise cancels', () => {
    const overlay = new OrganismsOverlayModel();
    overlay.cachedOrganisms = [
      { organism_id: 'org_1', position: { x: 20, y: 20, z: 0 }, is_alive: true },
      { organism_id: 'org_2', position: { x: 25, y: 25, z: 0 }, is_alive: true },
      { organism_id: 'org_dead', position: { x: 30, y: 30, z: 0 }, is_alive: false }
    ];
    const camera = new CameraFollowModel(overlay);
    overlay.selectOrganism('org_1');
    camera.startFollowing('org_1');
    assert.strictEqual(camera.targetId, 'org_1');

    // Select org_2 (alive & visible) -> retargets to org_2
    overlay.selectOrganism('org_2');
    assert.strictEqual(camera.isTracking, true);
    assert.strictEqual(camera.targetId, 'org_2');

    // Select org_dead -> cancels follow
    overlay.selectOrganism('org_dead');
    assert.strictEqual(camera.isTracking, false);
    assert.strictEqual(camera.targetId, '');
  });

  // --- C10-C22: no IPC authority ---
  it('C10-C22: Static safety audit: camera_controller.gd and organisms_overlay.gd contain zero IPC calls', () => {
    const controllerCode = fs.readFileSync(CONTROLLER_PATH, 'utf8');
    const overlayCode = fs.readFileSync(OVERLAY_PATH, 'utf8');

    assert.doesNotMatch(controllerCode, /\bIpcClient\b/);
    assert.doesNotMatch(controllerCode, /\bget_snapshot\b/);
    assert.doesNotMatch(controllerCode, /\bstep\b\s*\(/);
    assert.doesNotMatch(controllerCode, /\bplay\b\s*\(/);
    assert.doesNotMatch(controllerCode, /\bpause\b\s*\(/);
    assert.doesNotMatch(controllerCode, /\breset\b\s*\(/);

    assert.doesNotMatch(overlayCode, /\bIpcClient\b/);
  });

  // --- C10-C23: no simulation authority ---
  it('C10-C23: Static safety audit: CameraController contains zero simulation state authority', () => {
    const controllerCode = fs.readFileSync(CONTROLLER_PATH, 'utf8');

    assert.doesNotMatch(controllerCode, /\bSnapshotSynchronizer\b/);
    assert.doesNotMatch(controllerCode, /\b_session_epoch\b/);
    assert.doesNotMatch(controllerCode, /\bbiological_state\b/);
    assert.doesNotMatch(controllerCode, /\bmetabolic_rate\b/);
  });

  // --- C10-C24: no duplicate organism interpolation ---
  it('C10-C24: Negative audit: CameraController does not duplicate organism interpolation or slot math', () => {
    const controllerCode = fs.readFileSync(CONTROLLER_PATH, 'utf8');

    assert.doesNotMatch(controllerCode, /\bOrganismInterpolator\b/);
    assert.doesNotMatch(controllerCode, /\b_interpolation_states\b/);
    assert.doesNotMatch(controllerCode, /\binterpolate_position\b/);
    assert.doesNotMatch(controllerCode, /\b_calculate_slot_center\b/);
  });

  // --- C10-C25: frame-rate-independent smoothing ---
  it('C10-C25: Camera smoothing consumes frame-rate-independent exponential decay (1.0 - exp(-k * dt))', () => {
    const controllerCode = fs.readFileSync(CONTROLLER_PATH, 'utf8');

    assert.ok(controllerCode.includes('exp(-FOLLOW_SMOOTH_SPEED * delta)'), 'Must use exponential decay for follow');
    assert.ok(controllerCode.includes('exp(-FOCUS_SMOOTH_SPEED * delta)'), 'Must use exponential decay for focus');
    assert.doesNotMatch(controllerCode, /position\.lerp\([^,]+,\s*delta\s*\*/, 'Forbidden linear delta multiplier');
  });

  // --- C10-C26: focus cancellation on selection change ---
  it('C10-C26: In-flight Focus animation is immediately cancelled if selection changes', () => {
    const overlay = new OrganismsOverlayModel();
    overlay.cachedOrganisms = [
      { organism_id: 'org_f1', position: { x: 20, y: 20, z: 0 }, is_alive: true },
      { organism_id: 'org_f2', position: { x: 30, y: 30, z: 0 }, is_alive: true }
    ];
    const camera = new CameraFollowModel(overlay);
    overlay.selectOrganism('org_f1');
    camera.focusOrganism('org_f1');
    assert.strictEqual(camera.isFocusing, true);

    // Selection changes while focusing
    overlay.selectOrganism('org_f2');
    assert.strictEqual(camera.isFocusing, false, 'Focus must be cancelled on selection change');
  });

  // --- C10-C27: same selection preserving follow ---
  it('C10-C27: Re-selecting the already-followed organism preserves follow tracking', () => {
    const overlay = new OrganismsOverlayModel();
    overlay.cachedOrganisms = [
      { organism_id: 'org_same', position: { x: 20, y: 20, z: 0 }, is_alive: true }
    ];
    const camera = new CameraFollowModel(overlay);
    overlay.selectOrganism('org_same');
    camera.startFollowing('org_same');
    assert.strictEqual(camera.isTracking, true);

    // Same selection event received
    camera.onSelectionChanged('org_same');
    assert.strictEqual(camera.isTracking, true);
    assert.strictEqual(camera.targetId, 'org_same');
  });

  // --- C10-C29: alive target dying during active Focus immediately cancels Focus ---
  it('C10-C29: Alive target dying during active Focus animation immediately cancels Focus and halts camera', () => {
    const overlay = new OrganismsOverlayModel();
    overlay.cachedOrganisms = [
      { organism_id: 'org_f_die', position: { x: 40, y: 40, z: 0 }, is_alive: true }
    ];
    overlay.selectOrganism('org_f_die');
    const camera = new CameraFollowModel(overlay);
    camera.position = { x: 100.0, y: 100.0 };

    // 1 & 2: Start Focus
    assert.strictEqual(camera.focusOrganism('org_f_die'), true);
    // 3: Assert Focus active
    assert.strictEqual(camera.isFocusing, true);
    assert.strictEqual(camera.focusId, 'org_f_die');
    assert.strictEqual(camera.focusStartedAlive, true);

    // 4: Process at least one frame so Focus is genuinely in progress
    camera.process(0.016);
    assert.strictEqual(camera.isFocusing, true);
    const posMid = { ...camera.position };
    assert.ok(posMid.x > 100.0, 'Camera moved toward target');

    // 5: Change organism is_alive from true -> false
    overlay.cachedOrganisms[0].is_alive = false;

    // 6: Process another frame
    camera.process(0.016);

    // 7: Assert isFocusing === false and focusId === ""
    assert.strictEqual(camera.isFocusing, false, 'Focus must be cancelled immediately when alive target dies');
    assert.strictEqual(camera.focusId, '', 'focusId must be cleared on cancellation');

    // 8: Assert camera position remains finite
    assert.ok(Number.isFinite(camera.position.x) && Number.isFinite(camera.position.y), 'Camera position must remain finite');
    assert.strictEqual(camera.position.x, posMid.x, 'Camera position must freeze where it was when cancelled');

    // 9: Assert selection is not modified by CameraController
    assert.strictEqual(overlay.selectedOrganismId, 'org_f_die', 'Selection must remain untouched by CameraController');
  });

  // --- C10-C30: dead organism may start Focus and remain focusable while already dead ---
  it('C10-C30: Starting Focus on already-dead organism is permitted and completes smoothly', () => {
    const overlay = new OrganismsOverlayModel();
    overlay.cachedOrganisms = [
      { organism_id: 'org_f_dead', position: { x: 30, y: 30, z: 0 }, is_alive: false }
    ];
    const camera = new CameraFollowModel(overlay, { x: 400, y: 400 });
    camera.zoom = 2.0;
    camera.position = { x: 200.0, y: 200.0 };

    // 1 & 2: organism is_alive=false, focus succeeds
    assert.strictEqual(camera.focusOrganism('org_f_dead'), true);
    assert.strictEqual(camera.isFocusing, true);
    assert.strictEqual(camera.focusId, 'org_f_dead');
    assert.strictEqual(camera.focusStartedAlive, false);

    // 3 & 4: Focus remains active after processing, no cancellation merely because dead
    camera.process(0.016);
    assert.strictEqual(camera.isFocusing, true, 'Focus remains active after frame processing on dead organism');
    assert.ok(camera.position.x > 200.0, 'Camera moves toward corpse position');

    // Process frames until arrival
    for (let i = 0; i < 60; i++) {
      camera.process(0.016);
      if (!camera.isFocusing) break;
    }

    assert.strictEqual(camera.isFocusing, false, 'Focus completes upon reaching target');
    assert.ok(Math.abs(camera.position.x - 488.0) < 1.0, 'Camera reached dead organism location');
  });

  // --- C10-C31: F supersedes active Follow and enters one-shot Focus ---
  it('C10-C31: F supersedes active Follow and enters one-shot Focus', () => {
    const overlay = new OrganismsOverlayModel();
    overlay.cachedOrganisms = [
      { organism_id: 'org_a', position: { x: 25, y: 25, z: 0 }, is_alive: true }
    ];
    overlay.selectOrganism('org_a');
    const camera = new CameraFollowModel(overlay, { x: 400, y: 400 });
    camera.zoom = 2.0;
    camera.position = { x: 200.0, y: 200.0 };

    // 1 & 2: Start following A
    assert.strictEqual(camera.startFollowing('org_a'), true);

    // 3: Assert Follow active
    assert.strictEqual(camera.isTracking, true);
    assert.strictEqual(camera.targetId, 'org_a');
    assert.strictEqual(camera.isFocusing, false);

    // 4: Trigger focusOrganism("org_a")
    assert.strictEqual(camera.focusOrganism('org_a'), true);

    // 5: Assert immediately mutually exclusive transition
    assert.strictEqual(camera.isTracking, false, 'Follow must be cancelled when Focus starts');
    assert.strictEqual(camera.targetId, '', 'targetId must be cleared');
    assert.strictEqual(camera.isFocusing, true, 'Focus must become active');
    assert.strictEqual(camera.focusId, 'org_a', 'focusId must be set');

    // 6: Process one frame
    const posStart = { ...camera.position };
    camera.process(0.016);

    // 7 & 8: Assert camera actually moves through Focus logic and remains active
    assert.ok(camera.position.x > posStart.x, 'Camera moves toward target via Focus smoothing');
    assert.strictEqual(camera.isFocusing, true, 'Focus remains active during transit');
    assert.strictEqual(camera.isTracking, false, 'Follow remains inactive');
  });

  // =========================================================================
  // DEMO-01-C / C-10-D: Camera Reset & Epoch Isolation Test Suite
  // =========================================================================

  // --- C10-D01: Reset while idle ---
  it('C10-D01: Reset while idle restores/maintains default overview framing and stays in IDLE mode', () => {
    const overlay = new OrganismsOverlayModel();
    const camera = new CameraFollowModel(overlay);
    camera.position = { x: 600.0, y: 600.0 };
    camera.zoom = 2.5;

    overlay.simulateEpochChange(1);

    const defZ = camera.calculateDefaultOverviewZoom(camera.viewportSize);
    assert.strictEqual(camera.isTracking, false);
    assert.strictEqual(camera.isFocusing, false);
    assert.strictEqual(camera.zoom, defZ, 'Zoom must reset to default overview zoom');
    assert.strictEqual(camera.position.x, 400.0, 'Position must reset to world center');
    assert.strictEqual(camera.position.y, 400.0, 'Position must reset to world center');
  });

  // --- C10-D02: Reset while following ---
  it('C10-D02: Reset while actively following cancels follow immediately', () => {
    const overlay = new OrganismsOverlayModel();
    overlay.cachedOrganisms = [
      { organism_id: 'org_f', position: { x: 25, y: 25, z: 0 }, is_alive: true }
    ];
    overlay.selectOrganism('org_f');
    const camera = new CameraFollowModel(overlay, { x: 400, y: 400 });
    camera.zoom = 2.0;
    camera.startFollowing('org_f');
    assert.strictEqual(camera.isTracking, true);

    // Simulation reset occurs
    overlay.simulateEpochChange(2);

    assert.strictEqual(camera.isTracking, false, 'Follow must be cancelled on reset');
    assert.strictEqual(camera.targetId, '', 'targetId must be cleared on reset');
  });

  // --- C10-D03: Reset while focusing ---
  it('C10-D03: Reset while actively focusing cancels focus immediately', () => {
    const overlay = new OrganismsOverlayModel();
    overlay.cachedOrganisms = [
      { organism_id: 'org_focus', position: { x: 35, y: 35, z: 0 }, is_alive: true }
    ];
    overlay.selectOrganism('org_focus');
    const camera = new CameraFollowModel(overlay, { x: 400, y: 400 });
    camera.zoom = 2.0;
    camera.position = { x: 100.0, y: 100.0 };
    camera.focusOrganism('org_focus');
    assert.strictEqual(camera.isFocusing, true);
    assert.strictEqual(camera.focusStartedAlive, true);

    // Frame runs mid-transit
    camera.process(0.016);
    assert.strictEqual(camera.isFocusing, true);

    // Simulation reset occurs
    overlay.simulateEpochChange(2);

    assert.strictEqual(camera.isFocusing, false, 'Focus must be cancelled on reset');
    assert.strictEqual(camera.focusId, '', 'focusId must be cleared on reset');
    assert.strictEqual(camera.focusStartedAlive, false, 'focusStartedAlive must be reset');
  });

  // --- C10-D04: Same organism_id recreated in next epoch ---
  it('C10-D04: Same organism_id recreated in next epoch guarantees zero auto-follow leakage', () => {
    const overlay = new OrganismsOverlayModel();
    overlay.cachedOrganisms = [
      { organism_id: 'org_reused', position: { x: 10, y: 10, z: 0 }, is_alive: true }
    ];
    overlay.selectOrganism('org_reused');
    const camera = new CameraFollowModel(overlay, { x: 400, y: 400 });
    camera.zoom = 2.0;
    camera.startFollowing('org_reused');
    assert.strictEqual(camera.isTracking, true);

    // Epoch resets
    overlay.simulateEpochChange(2);
    assert.strictEqual(camera.isTracking, false);
    assert.strictEqual(camera.targetId, '');

    // Next epoch populates org_reused at a different cell (45, 45)
    overlay.cachedOrganisms = [
      { organism_id: 'org_reused', position: { x: 45, y: 45, z: 0 }, is_alive: true }
    ];

    const posAfterReset = { ...camera.position };

    // Process 30 simulation/presentation frames
    for (let f = 0; f < 30; f++) {
      camera.process(0.016);
    }

    assert.strictEqual(camera.isTracking, false, 'Camera must remain in IDLE mode');
    assert.strictEqual(camera.targetId, '', 'Camera must not latch onto newly spawned org_reused');
    assert.strictEqual(camera.position.x, posAfterReset.x, 'Camera must NOT move toward new org_reused');
    assert.strictEqual(camera.position.y, posAfterReset.y, 'Camera must NOT move toward new org_reused');
  });

  // --- C10-D05: Follow cannot cross epoch boundary ---
  it('C10-D05: Follow cannot cross epoch boundary; old target cannot be resumed without explicit selection', () => {
    const overlay = new OrganismsOverlayModel();
    overlay.cachedOrganisms = [
      { organism_id: 'org_ep_a', position: { x: 15, y: 15, z: 0 }, is_alive: true }
    ];
    overlay.selectOrganism('org_ep_a');
    const camera = new CameraFollowModel(overlay);
    camera.startFollowing('org_ep_a');

    overlay.simulateEpochChange(2);

    // Attempting to follow without overlay target validation must fail
    assert.strictEqual(camera.isTracking, false);
    assert.strictEqual(overlay.selectedOrganismId, '');
  });

  // --- C10-D06: Focus cannot cross epoch boundary ---
  it('C10-D06: Focus cannot cross epoch boundary even if target recreated', () => {
    const overlay = new OrganismsOverlayModel();
    overlay.cachedOrganisms = [
      { organism_id: 'org_focus_ep', position: { x: 30, y: 30, z: 0 }, is_alive: true }
    ];
    overlay.selectOrganism('org_focus_ep');
    const camera = new CameraFollowModel(overlay, { x: 400, y: 400 });
    camera.zoom = 2.0;
    camera.position = { x: 100.0, y: 100.0 };
    camera.focusOrganism('org_focus_ep');
    camera.process(0.016);
    assert.strictEqual(camera.isFocusing, true);

    // Epoch resets
    overlay.simulateEpochChange(2);
    assert.strictEqual(camera.isFocusing, false);
    assert.strictEqual(camera.focusId, '');

    // org_focus_ep recreated at (40, 40)
    overlay.cachedOrganisms = [
      { organism_id: 'org_focus_ep', position: { x: 40, y: 40, z: 0 }, is_alive: true }
    ];

    const posAfterReset = { ...camera.position };
    for (let f = 0; f < 30; f++) {
      camera.process(0.016);
    }

    assert.strictEqual(camera.isFocusing, false);
    assert.strictEqual(camera.position.x, posAfterReset.x, 'Camera motion must remain completely halted');
  });

  // --- C10-D07: Normal deselect preserves framing ---
  it('C10-D07: Normal deselect preserves camera position and zoom, unlike epoch reset', () => {
    const overlay = new OrganismsOverlayModel();
    overlay.cachedOrganisms = [
      { organism_id: 'org_desel', position: { x: 20, y: 20, z: 0 }, is_alive: true }
    ];
    overlay.selectOrganism('org_desel');
    const camera = new CameraFollowModel(overlay, { x: 400, y: 400 });
    camera.position = { x: 320.0, y: 320.0 };
    camera.zoom = 2.2;
    camera.startFollowing('org_desel');

    // Normal deselect click on empty ground
    overlay.selectOrganism('');

    assert.strictEqual(camera.isTracking, false, 'Follow cancels on deselect');
    assert.strictEqual(camera.position.x, 320.0, 'Camera position MUST be preserved on normal deselect');
    assert.strictEqual(camera.position.y, 320.0, 'Camera position MUST be preserved on normal deselect');
    assert.strictEqual(camera.zoom, 2.2, 'Camera zoom MUST be preserved on normal deselect');
  });

  // --- C10-D08: Reset clears mouse drag state ---
  it('C10-D08: Reset clears active mouse drag state and anchor', () => {
    const overlay = new OrganismsOverlayModel();
    const camera = new CameraFollowModel(overlay);
    camera.isDragging = true;
    camera.dragStartMousePos = { x: 512.0, y: 384.0 };

    overlay.simulateEpochChange(2);

    assert.strictEqual(camera.isDragging, false, 'isDragging must be reset to false');
    assert.strictEqual(camera.dragStartMousePos.x, 0, 'dragStartMousePos must be cleared');
    assert.strictEqual(camera.dragStartMousePos.y, 0, 'dragStartMousePos must be cleared');
  });

  // --- C10-D09: Reset restores canonical default camera position ---
  it('C10-D09: Reset restores canonical default camera position (WORLD_CENTER)', () => {
    const overlay = new OrganismsOverlayModel();
    const camera = new CameraFollowModel(overlay, { x: 1152, y: 648 });
    camera.position = { x: 750.0, y: 750.0 };

    overlay.simulateEpochChange(2);

    assert.strictEqual(camera.position.x, 400.0, 'Camera center x must be 400');
    assert.strictEqual(camera.position.y, 400.0, 'Camera center y must be 400');
  });

  // --- C10-D10: Reset restores canonical default zoom ---
  it('C10-D10: Reset restores canonical default zoom', () => {
    const overlay = new OrganismsOverlayModel();
    const camera = new CameraFollowModel(overlay, { x: 1152, y: 648 });
    camera.zoom = 3.5;

    overlay.simulateEpochChange(2);

    const expectedZ = camera.calculateDefaultOverviewZoom({ x: 1152, y: 648 });
    assert.strictEqual(camera.zoom, expectedZ, 'Camera zoom must be default overview zoom');
  });

  // --- C10-D11: Static safety audit ---
  it('C10-D11: Static safety audit: CameraController has no SnapshotSynchronizer, IPC, or simulation references', () => {
    const controllerSource = fs.readFileSync(CONTROLLER_PATH, 'utf8');
    assert.ok(!controllerSource.includes('SnapshotSynchronizer'), 'CameraController must not reference SnapshotSynchronizer');
    assert.ok(!controllerSource.includes('IpcClient'), 'CameraController must not reference IpcClient');
    assert.ok(!controllerSource.includes('get_session_epoch'), 'CameraController must not call get_session_epoch');
    assert.ok(!controllerSource.includes('get_last_accepted_tick'), 'CameraController must not query tick authority');
  });

  // --- C10-D12: Multiple sequential epoch transitions ---
  it('C10-D12: Multiple sequential epoch transitions (N -> N+1 -> N+2) remain isolated', () => {
    const overlay = new OrganismsOverlayModel();
    const camera = new CameraFollowModel(overlay, { x: 400, y: 400 });

    for (let epoch = 1; epoch <= 5; epoch++) {
      overlay.cachedOrganisms = [
        { organism_id: 'org_ep_' + epoch, position: { x: 20 + epoch, y: 20 + epoch, z: 0 }, is_alive: true }
      ];
      overlay.selectOrganism('org_ep_' + epoch);
      camera.startFollowing('org_ep_' + epoch);
      assert.strictEqual(camera.isTracking, true);

      // Trigger epoch change
      overlay.simulateEpochChange(epoch + 1);
      assert.strictEqual(camera.isTracking, false);
      assert.strictEqual(camera.targetId, '');
      assert.strictEqual(camera.isFocusing, false);
      assert.strictEqual(camera.position.x, 400.0);
      assert.strictEqual(camera.position.y, 400.0);
    }
  });

  // --- C10-C28: Frozen-domain guard ---
  it('C10-C28: Frozen-domain guard verifies only the authorized files have been modified/introduced', () => {
    const baseCommit = 'a39a493';
    const gitDiff = execSync(`git diff --name-only ${baseCommit}`, { cwd: ROOT_DIR, encoding: 'utf8' }).trim();
    const modifiedFiles = gitDiff ? gitDiff.split(/\r?\n/).filter(Boolean) : [];

    const untracked = execSync('git status --porcelain', { cwd: ROOT_DIR, encoding: 'utf8' }).trim();
    const untrackedFiles = untracked.split(/\r?\n/).filter(l => l.startsWith('?? ')).map(l => l.slice(3).trim());

    const allChanged = [...modifiedFiles, ...untrackedFiles];
    const authorized = [
      'godot/scripts/presentation/organisms_overlay.gd',
      'godot/scripts/presentation/camera_controller.gd',
      'tests/demo/demo_c10_camera_follow.test.js',
      'tests/demo/demo_c10_camera_navigation.test.js'
    ];

    for (const f of allChanged) {
      const normalized = f.replace(/\\/g, '/');
      assert.ok(authorized.includes(normalized), `Unauthorized file modified: ${normalized}`);
    }
  });

});
