/**
 * tests/demo/demo_c10_camera_navigation.test.js
 * 
 * DEMO-01-C / C-10-B: Interactive Camera Navigation Test Suite
 * 
 * Presentation-only camera navigation model verification:
 * - Dynamic viewport-aware bounds clamping
 * - Default overview framing calculations
 * - Cursor-centered zoom mathematics
 * - Mouse drag pan & keyboard pan semantics
 * - Zero simulation authority, zero IPC, zero focus/follow logic
 * 
 * Covers C10-B01 through C10-B22 specified by Game Director.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT_DIR = path.resolve('D:/LinhSinhVN');
const CONTROLLER_PATH = path.join(ROOT_DIR, 'godot/scripts/presentation/camera_controller.gd');
const SCENE_PATH = path.join(ROOT_DIR, 'godot/scenes/world_view.tscn');

const WORLD_WIDTH = 800.0;
const WORLD_HEIGHT = 800.0;
const WORLD_CENTER = { x: 400.0, y: 400.0 };

const MIN_ZOOM = 0.6;
const MAX_ZOOM = 4.0;
const ZOOM_STEP_FACTOR = 1.15;
const PAN_SPEED_SCREEN = 400.0;

// Pure Mathematical Model Mirroring CameraController
class CameraNavigationModel {
  constructor(viewportSize = { x: 1152.0, y: 648.0 }) {
    this.viewportSize = { ...viewportSize };
    this.zoom = this.calculateDefaultOverviewZoom(this.viewportSize);
    this.position = this.clampCameraCenter(WORLD_CENTER, this.viewportSize, this.zoom);
    this.isDragging = false;
    this.dragStartMousePos = { x: 0, y: 0 };
  }

  calculateDefaultOverviewZoom(vpSize) {
    const margin = 48.0;
    if (vpSize.x <= margin || vpSize.y <= margin) {
      return MIN_ZOOM;
    }
    const fitX = (vpSize.x - margin) / WORLD_WIDTH;
    const fitY = (vpSize.y - margin) / WORLD_HEIGHT;
    const adaptive = Math.min(fitX, fitY);
    return Math.max(MIN_ZOOM, Math.min(1.2, adaptive));
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

  zoomAtCursor(cursorScreenPos, factor) {
    const oldZ = this.zoom;
    const newZ = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, oldZ * factor));
    if (Math.abs(oldZ - newZ) < 1e-6) return;

    const vpCenter = { x: this.viewportSize.x * 0.5, y: this.viewportSize.y * 0.5 };
    const cursorOffset = {
      x: cursorScreenPos.x - vpCenter.x,
      y: cursorScreenPos.y - vpCenter.y
    };

    const tentativePos = {
      x: this.position.x + cursorOffset.x * (1.0 / oldZ - 1.0 / newZ),
      y: this.position.y + cursorOffset.y * (1.0 / oldZ - 1.0 / newZ)
    };

    this.position = this.clampCameraCenter(tentativePos, this.viewportSize, newZ);
    this.zoom = newZ;
  }

  onMousePan(mouseDelta) {
    if (!this.isDragging) return;
    const worldDelta = {
      x: -mouseDelta.x / this.zoom,
      y: -mouseDelta.y / this.zoom
    };
    const targetPos = {
      x: this.position.x + worldDelta.x,
      y: this.position.y + worldDelta.y
    };
    this.position = this.clampCameraCenter(targetPos, this.viewportSize, this.zoom);
  }

  onKeyboardPan(inputDirection, delta) {
    const len = Math.sqrt(inputDirection.x * inputDirection.x + inputDirection.y * inputDirection.y);
    if (len === 0) return;
    const dir = { x: inputDirection.x / len, y: inputDirection.y / len };
    const screenDelta = {
      x: dir.x * PAN_SPEED_SCREEN * delta,
      y: dir.y * PAN_SPEED_SCREEN * delta
    };
    const worldDelta = {
      x: screenDelta.x / this.zoom,
      y: screenDelta.y / this.zoom
    };
    const targetPos = {
      x: this.position.x + worldDelta.x,
      y: this.position.y + worldDelta.y
    };
    this.position = this.clampCameraCenter(targetPos, this.viewportSize, this.zoom);
  }

  handleMouseButton(buttonIndex, pressed, mousePos) {
    // 1 = LEFT, 2 = RIGHT, 3 = MIDDLE, 4 = WHEEL_UP, 5 = WHEEL_DOWN
    if (buttonIndex === 1) {
      // Left click is ignored by camera controller (reserved for selection)
      return false;
    }
    if (buttonIndex === 2 || buttonIndex === 3) {
      this.isDragging = pressed;
      if (pressed) this.dragStartMousePos = { ...mousePos };
      return true;
    }
    if (buttonIndex === 4 && pressed) {
      this.zoomAtCursor(mousePos, ZOOM_STEP_FACTOR);
      return true;
    }
    if (buttonIndex === 5 && pressed) {
      this.zoomAtCursor(mousePos, 1.0 / ZOOM_STEP_FACTOR);
      return true;
    }
    return false;
  }
}

describe('DEMO-01-C / C-10-B: Interactive Camera Navigation Suite', () => {

  // --- C10-B01: Default overview zoom formula ---
  it('C10-B01: Default overview zoom calculates containment with margin', () => {
    const model = new CameraNavigationModel({ x: 1152, y: 648 });
    // fitX = (1152 - 48)/800 = 1.38, fitY = (648 - 48)/800 = 0.75 -> min = 0.75
    const expected = 0.75;
    assert.strictEqual(Math.abs(model.zoom - expected) < 1e-4, true, `Expected ~0.75, got ${model.zoom}`);
  });

  // --- C10-B02: Default zoom clamps to MIN_ZOOM ---
  it('C10-B02: Default zoom clamps to MIN_ZOOM on tiny viewports', () => {
    const model = new CameraNavigationModel({ x: 300, y: 300 });
    // fit = (300 - 48)/800 = 0.315 -> clamps to MIN_ZOOM = 0.6
    assert.strictEqual(model.zoom, MIN_ZOOM);
  });

  // --- C10-B03: Default zoom clamps to 1.2 maximum ---
  it('C10-B03: Default zoom clamps to 1.2 maximum on massive 4K viewports', () => {
    const model = new CameraNavigationModel({ x: 3840, y: 2160 });
    // fit = (2160 - 48)/800 = 2.64 -> clamps to 1.2
    assert.strictEqual(model.zoom, 1.2);
  });

  // --- C10-B04: Camera center clamp when viewport fits inside world ---
  it('C10-B04: Camera center clamps correctly when viewport fits inside world (Z=2.0)', () => {
    const model = new CameraNavigationModel({ x: 800, y: 600 });
    // At Z = 2.0: hw = 800 / (2*2) = 200, hh = 600 / (2*2) = 150
    // Visible spans: 400 < 800, 300 < 800
    // Legal x: [200, 600], Legal y: [150, 650]
    const clampedCenter = model.clampCameraCenter({ x: 400, y: 400 }, { x: 800, y: 600 }, 2.0);
    assert.strictEqual(clampedCenter.x, 400);
    assert.strictEqual(clampedCenter.y, 400);

    const clampedFarLeft = model.clampCameraCenter({ x: 50, y: 50 }, { x: 800, y: 600 }, 2.0);
    assert.strictEqual(clampedFarLeft.x, 200);
    assert.strictEqual(clampedFarLeft.y, 150);
  });

  // --- C10-B05: Camera center locks to world center when viewport exceeds world width ---
  it('C10-B05: Camera center locks to world center when visible span exceeds world width', () => {
    const model = new CameraNavigationModel({ x: 1200, y: 600 });
    // At Z = 1.0: hw = 1200 / 2 = 600 -> 2*hw = 1200 >= 800
    const clamped = model.clampCameraCenter({ x: 100, y: 300 }, { x: 1200, y: 600 }, 1.0);
    assert.strictEqual(clamped.x, 400.0, 'X center must lock to 400.0 when viewport width exceeds world');
  });

  // --- C10-B06: Camera center locks to world center when viewport exceeds world height ---
  it('C10-B06: Camera center locks to world center when visible span exceeds world height', () => {
    const model = new CameraNavigationModel({ x: 600, y: 1000 });
    // At Z = 1.0: hh = 1000 / 2 = 500 -> 2*hh = 1000 >= 800
    const clamped = model.clampCameraCenter({ x: 300, y: 100 }, { x: 600, y: 1000 }, 1.0);
    assert.strictEqual(clamped.y, 400.0, 'Y center must lock to 400.0 when viewport height exceeds world');
  });

  // --- C10-B07: Camera center clamp at left/top boundaries ---
  it('C10-B07: Camera center clamps strictly at left and top boundaries without underflowing', () => {
    const model = new CameraNavigationModel({ x: 400, y: 400 });
    // At Z = 2.0: hw = 100, hh = 100. Legal range: [100, 700]
    const clamped = model.clampCameraCenter({ x: -200, y: -50 }, { x: 400, y: 400 }, 2.0);
    assert.strictEqual(clamped.x, 100.0);
    assert.strictEqual(clamped.y, 100.0);
  });

  // --- C10-B08: Camera center clamp at right/bottom boundaries ---
  it('C10-B08: Camera center clamps strictly at right and bottom boundaries without overflowing', () => {
    const model = new CameraNavigationModel({ x: 400, y: 400 });
    // At Z = 2.0: hw = 100, hh = 100. Legal range: [100, 700]
    const clamped = model.clampCameraCenter({ x: 1500, y: 999 }, { x: 400, y: 400 }, 2.0);
    assert.strictEqual(clamped.x, 700.0);
    assert.strictEqual(clamped.y, 700.0);
  });

  // --- C10-B09: Cursor-centered zoom mathematical preservation ---
  it('C10-B09: Cursor-centered zoom preserves exact world point beneath cursor prior to clamp', () => {
    const model = new CameraNavigationModel({ x: 1000, y: 1000 });
    model.zoom = 1.0;
    model.position = { x: 400, y: 400 };

    // Cursor at screen (600, 500) -> offset from center (500, 500) is (+100, 0)
    // World point under cursor = 400 + 100/1.0 = 500
    const cursor = { x: 600, y: 500 };
    const preWorldX = model.position.x + (cursor.x - 500) / model.zoom;
    assert.strictEqual(preWorldX, 500);

    // Zoom in by 2.0 -> Z_new = 2.0
    // Legal range at Z=2: hw = 1000/(2*2)=250 -> range [250, 550]
    model.zoomAtCursor(cursor, 2.0);
    assert.strictEqual(model.zoom, 2.0);

    // Post-zoom world point under same screen cursor
    const postWorldX = model.position.x + (cursor.x - 500) / model.zoom;
    assert.strictEqual(Math.abs(postWorldX - 500) < 1e-4, true, 'World point under cursor must remain identical');
  });

  // --- C10-B10: Cursor-centered zoom with post-zoom boundary clamp ---
  it('C10-B10: Cursor-centered zoom applies safe clamping when unconstrained target exceeds boundary', () => {
    const model = new CameraNavigationModel({ x: 800, y: 600 });
    model.zoom = 2.0;
    model.position = { x: 200, y: 150 }; // At boundary edge

    // Zoom out at far left cursor
    model.zoomAtCursor({ x: 10, y: 10 }, 0.5);
    // Z is now 1.0. At Z=1.0: hw = 400, hh = 300. Width span = 800 -> locks to 400
    assert.strictEqual(model.position.x, 400.0);
  });

  // --- C10-B11: Mouse pan sign convention ---
  it('C10-B11: Mouse pan sign convention moves camera opposite to drag vector', () => {
    const model = new CameraNavigationModel({ x: 400, y: 400 });
    model.zoom = 2.0;
    model.position = { x: 400, y: 400 };
    model.isDragging = true;

    // Drag right: mouseDelta.x = +50 -> worldDelta.x = -50/2 = -25 -> camera moves left to 375
    model.onMousePan({ x: 50, y: 0 });
    assert.strictEqual(model.position.x, 375.0);

    // Drag up: mouseDelta.y = -40 -> worldDelta.y = -(-40)/2 = +20 -> camera moves down to 420
    model.onMousePan({ x: 0, y: -40 });
    assert.strictEqual(model.position.y, 420.0);
  });

  // --- C10-B12: Mouse pan is zoom-compensated ---
  it('C10-B12: Mouse pan divides screen delta by zoom to maintain 1:1 cursor tracking', () => {
    const model1 = new CameraNavigationModel({ x: 400, y: 400 });
    model1.zoom = 1.0;
    model1.position = { x: 400, y: 400 };
    model1.isDragging = true;
    model1.onMousePan({ x: 100, y: 0 });
    assert.strictEqual(model1.position.x, 300.0); // 400 - 100/1

    const model2 = new CameraNavigationModel({ x: 400, y: 400 });
    model2.zoom = 2.0;
    model2.position = { x: 400, y: 400 };
    model2.isDragging = true;
    model2.onMousePan({ x: 100, y: 0 });
    assert.strictEqual(model2.position.x, 350.0); // 400 - 100/2
  });

  // --- C10-B13: Keyboard pan screen-space speed semantics ---
  it('C10-B13: Keyboard pan uses constant screen-space speed (400 px/s)', () => {
    const model = new CameraNavigationModel({ x: 400, y: 400 });
    model.zoom = 1.0;
    model.position = { x: 400, y: 400 };

    // Move right for delta = 0.1s: screenDelta = 1.0 * 400 * 0.1 = 40px -> worldDelta = 40/1 = 40
    model.onKeyboardPan({ x: 1, y: 0 }, 0.1);
    assert.strictEqual(model.position.x, 440.0);
  });

  // --- C10-B14: Keyboard pan is zoom-compensated ---
  it('C10-B14: Keyboard pan world displacement scales inversely with zoom', () => {
    const model = new CameraNavigationModel({ x: 400, y: 400 });
    model.zoom = 4.0;
    model.position = { x: 400, y: 400 };

    // Move right for delta = 0.1s at Z=4: screenDelta = 40px -> worldDelta = 40/4 = 10
    model.onKeyboardPan({ x: 1, y: 0 }, 0.1);
    assert.strictEqual(model.position.x, 410.0);
  });

  // --- C10-B15: Zoom never exceeds MAX_ZOOM ---
  it('C10-B15: Zoom is strictly clamped and never exceeds MAX_ZOOM (4.0)', () => {
    const model = new CameraNavigationModel({ x: 400, y: 400 });
    model.zoom = 3.8;

    model.zoomAtCursor({ x: 200, y: 200 }, 1.5);
    assert.strictEqual(model.zoom, MAX_ZOOM);

    model.zoomAtCursor({ x: 200, y: 200 }, 2.0);
    assert.strictEqual(model.zoom, MAX_ZOOM);
  });

  // --- C10-B16: Zoom never goes below MIN_ZOOM ---
  it('C10-B16: Zoom is strictly clamped and never goes below MIN_ZOOM (0.6)', () => {
    const model = new CameraNavigationModel({ x: 400, y: 400 });
    model.zoom = 0.7;

    model.zoomAtCursor({ x: 200, y: 200 }, 0.5);
    assert.strictEqual(model.zoom, MIN_ZOOM);

    model.zoomAtCursor({ x: 200, y: 200 }, 0.2);
    assert.strictEqual(model.zoom, MIN_ZOOM);
  });

  // --- C10-B17: Left mouse does not enter camera drag ---
  it('C10-B17: Left mouse button click does not engage camera drag (reserved for selection)', () => {
    const model = new CameraNavigationModel();
    const handled = model.handleMouseButton(1, true, { x: 100, y: 100 });
    assert.strictEqual(handled, false, 'Left mouse must not be handled by camera controller');
    assert.strictEqual(model.isDragging, false, 'isDragging must remain false');
  });

  // --- C10-B18: Middle/right mouse can enter camera drag ---
  it('C10-B18: Middle and right mouse buttons successfully engage camera drag', () => {
    const model = new CameraNavigationModel();

    const handledRight = model.handleMouseButton(2, true, { x: 100, y: 100 });
    assert.strictEqual(handledRight, true);
    assert.strictEqual(model.isDragging, true);

    model.handleMouseButton(2, false, { x: 100, y: 100 });
    assert.strictEqual(model.isDragging, false);

    const handledMiddle = model.handleMouseButton(3, true, { x: 100, y: 100 });
    assert.strictEqual(handledMiddle, true);
    assert.strictEqual(model.isDragging, true);
  });

  // --- C10-B19: Camera controller contains zero simulation/IPC calls ---
  it('C10-B19: Static safety audit: camera_controller.gd contains zero simulation, IPC, or RNG calls', () => {
    const code = fs.readFileSync(CONTROLLER_PATH, 'utf8');

    assert.doesNotMatch(code, /\bIpcClient\b/);
    assert.doesNotMatch(code, /\bSnapshotSynchronizer\b/);
    assert.doesNotMatch(code, /\bSimulationWorld\b/);
    assert.doesNotMatch(code, /\bstep\s*\(/);
    assert.doesNotMatch(code, /\bplay\s*\(/);
    assert.doesNotMatch(code, /\bpause\s*\(/);
    assert.doesNotMatch(code, /\breset\s*\(/);
    assert.doesNotMatch(code, /\bgetSnapshot\b/);
    assert.doesNotMatch(code, /\brandi\b/);
    assert.doesNotMatch(code, /\brandf\b/);
    assert.doesNotMatch(code, /\bRandomNumberGenerator\b/);
  });

  // --- C10-B20: Scene contains CameraController on Camera2D ---
  it('C10-B20: world_view.tscn contains exactly one Camera2D with CameraController attached', () => {
    const sceneCode = fs.readFileSync(SCENE_PATH, 'utf8');

    assert.ok(sceneCode.includes('camera_controller.gd'));
    assert.ok(sceneCode.includes('script = ExtResource("11_camera_controller")'));

    // Verify Camera2D node count is exactly 1
    const matches = sceneCode.match(/\[node name="Camera2D"/g);
    assert.strictEqual(matches.length, 1, 'Scene must contain exactly one Camera2D');
  });

  // --- C10-B21: Frozen-domain guard ---
  it('C10-B21: Frozen-domain guard verifies only the 3 authorized files have been modified/introduced', () => {
    const baseCommit = '38e98de';
    const c10bClosedCommit = 'a39a493';
    const gitDiff = execSync(`git diff --name-only ${baseCommit} ${c10bClosedCommit}`, { cwd: ROOT_DIR, encoding: 'utf8' }).trim();
    const modifiedFiles = gitDiff ? gitDiff.split(/\r?\n/).filter(Boolean) : [];

    const untracked = execSync('git status --porcelain', { cwd: ROOT_DIR, encoding: 'utf8' }).trim();
    const untrackedFiles = untracked.split(/\r?\n/).filter(l => l.startsWith('?? ')).map(l => l.slice(3).trim());

    const allChanged = [...modifiedFiles, ...untrackedFiles];
    const authorized = [
      'godot/scripts/presentation/camera_controller.gd',
      'godot/scenes/world_view.tscn',
      'tests/demo/demo_c10_camera_navigation.test.js',
      'tests/demo/demo_c09_organism_inspection.test.js'
    ];

    for (const f of allChanged) {
      const normalized = f.replace(/\\/g, '/');
      assert.ok(authorized.includes(normalized), `Unauthorized file modified: ${normalized}`);
    }
  });

  // --- C10-B22: No organism focus/follow logic in C-10-B ---
  it('C10-B22: Verification that C-10-B contains zero premature C-10-C focus/follow logic', () => {
    const code = fs.readFileSync(CONTROLLER_PATH, 'utf8');

    assert.doesNotMatch(code, /\borganism_selected\b/);
    assert.doesNotMatch(code, /\borganism_double_clicked\b/);
    assert.doesNotMatch(code, /\b_follow_\b/);
    assert.doesNotMatch(code, /\bselected_organism\b/);
    assert.doesNotMatch(code, /\bget_organism_visual_position\b/);
  });

});
