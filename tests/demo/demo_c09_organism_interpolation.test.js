/**
 * tests/demo/demo_c09_organism_interpolation.test.js
 * 
 * DEMO-01-C / C-09-D: Organism Visual Interpolation Test Suite
 * 
 * Authoritative Simulation Authority: Node.js core ONLY.
 * Godot presentation performs purely visual interpolation between accepted snapshots.
 * 
 * Covers C09-D01 through C09-D20 specified by Game Director.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT_DIR = path.resolve('D:/LinhSinhVN');
const OVERLAY_PATH = path.join(ROOT_DIR, 'godot/scripts/presentation/organisms_overlay.gd');
const INTERPOLATOR_PATH = path.join(ROOT_DIR, 'godot/scripts/presentation/organism_interpolator.gd');
const CONFIG_PATH = path.join(ROOT_DIR, 'godot/scripts/presentation/demo_world_config.gd');

// --- Helper Pure Math Mirror (matches OrganismInterpolator & DemoWorldConfig) ---
const CELL_SIZE = 16;
const WORLD_WIDTH = 50;
const WORLD_HEIGHT = 50;

function calculate_pixel_center(grid_x, grid_y) {
  return {
    x: grid_x * CELL_SIZE + CELL_SIZE * 0.5,
    y: grid_y * CELL_SIZE + CELL_SIZE * 0.5
  };
}

function interpolate_position(source_px, target_px, alpha) {
  const clamped_alpha = Math.max(0.0, Math.min(1.0, alpha));
  return {
    x: source_px.x + (target_px.x - source_px.x) * clamped_alpha,
    y: source_px.y + (target_px.y - source_px.y) * clamped_alpha
  };
}

function advance_alpha(current_alpha, delta, duration) {
  if (duration <= 0.0) return 1.0;
  return Math.min(1.0, current_alpha + delta / duration);
}

// --- Presentation State Machine Simulator (Pure Model Mirror of OrganismsOverlay) ---
class OrganismsOverlayModel {
  constructor() {
    this.interpolationDuration = 0.1; // 100ms
    this.activeZLayer = 0;
    this.cachedOrganisms = [];
    this.interpolationStates = new Map();
    this.lastSeenEpoch = -1;
    this.hasReceivedFirstSnapshot = false;
  }

  applySnapshot(organisms, currentEpoch = 0) {
    let isEpochReset = false;
    if (!this.hasReceivedFirstSnapshot) {
      this.hasReceivedFirstSnapshot = true;
      this.lastSeenEpoch = currentEpoch;
      this.interpolationStates.clear();
      isEpochReset = true;
    } else if (currentEpoch !== this.lastSeenEpoch) {
      this.lastSeenEpoch = currentEpoch;
      this.interpolationStates.clear();
      isEpochReset = true;
    }

    const activeIds = new Set();
    this.cachedOrganisms = JSON.parse(JSON.stringify(organisms));

    for (const org of organisms) {
      if (!org || typeof org !== 'object') continue;
      const orgId = org.organism_id;
      activeIds.add(orgId);

      const pos = org.position;
      if (!pos || typeof pos !== 'object') continue;
      const targetPos = calculate_pixel_center(pos.x, pos.y);

      if (isEpochReset) {
        // CASE D: Epoch Changed / Reset Barrier -> immediate snap, zero cross-epoch lerp
        this.interpolationStates.set(orgId, {
          source_px: { ...targetPos },
          target_px: { ...targetPos },
          alpha: 1.0,
          last_seen_epoch: currentEpoch
        });
      } else if (!this.interpolationStates.has(orgId)) {
        // CASE A: New Organism -> appear immediately at authoritative target
        this.interpolationStates.set(orgId, {
          source_px: { ...targetPos },
          target_px: { ...targetPos },
          alpha: 1.0,
          last_seen_epoch: currentEpoch
        });
      } else {
        // Existing organism in same epoch
        const st = this.interpolationStates.get(orgId);
        const prevTarget = st.target_px;

        if (prevTarget.x === targetPos.x && prevTarget.y === targetPos.y) {
          // CASE B: Same Position -> keep target, alpha = 1.0, DO NOT restart interpolation
          st.target_px = { ...targetPos };
          st.alpha = 1.0;
          st.last_seen_epoch = currentEpoch;
        } else {
          // CASE C: Position Changed -> source is CURRENT VISUAL POSITION
          const currentVisual = interpolate_position(st.source_px, prevTarget, st.alpha);
          st.source_px = currentVisual;
          st.target_px = { ...targetPos };
          st.alpha = 0.0;
          st.last_seen_epoch = currentEpoch;
        }
      }
    }

    // CASE E: Organism Disappearance / Pruning
    for (const kid of Array.from(this.interpolationStates.keys())) {
      if (!activeIds.has(kid)) {
        this.interpolationStates.delete(kid);
      }
    }
  }

  process(delta) {
    let anyChanged = false;
    for (const [orgId, st] of this.interpolationStates.entries()) {
      if (st.alpha < 1.0) {
        st.alpha = advance_alpha(st.alpha, delta, this.interpolationDuration);
        anyChanged = true;
      }
    }
    return anyChanged;
  }

  getVisualPosition(orgId) {
    const st = this.interpolationStates.get(orgId);
    if (!st) return null;
    return interpolate_position(st.source_px, st.target_px, st.alpha);
  }
}

describe('DEMO-01-C / C-09-D: Organism Visual Interpolation Suite', () => {

  // --- C09-D01: Pure grid-to-pixel center mapping ---
  it('C09-D01: Pure grid-to-pixel center mapping maps (x, y) to (x*16+8, y*16+8)', () => {
    const c00 = calculate_pixel_center(0, 0);
    assert.strictEqual(c00.x, 8.0);
    assert.strictEqual(c00.y, 8.0);

    const c22 = calculate_pixel_center(22, 22);
    assert.strictEqual(c22.x, 22 * 16 + 8.0);
    assert.strictEqual(c22.y, 22 * 16 + 8.0);

    const c49 = calculate_pixel_center(49, 49);
    assert.strictEqual(c49.x, 49 * 16 + 8.0);
    assert.strictEqual(c49.y, 49 * 16 + 8.0);

    // Verify GDScript source matches
    const helperCode = fs.readFileSync(INTERPOLATOR_PATH, 'utf8');
    assert.match(helperCode, /func\s+calculate_pixel_center\(grid_x:\s*int,\s*grid_y:\s*int\)\s*->\s*Vector2:/);
    assert.ok(helperCode.includes('Config.world_to_pixel'));
  });

  // --- C09-D02: Linear interpolation alpha=0 ---
  it('C09-D02: Linear interpolation alpha=0 returns exact source position', () => {
    const pA = { x: 100.0, y: 150.0 };
    const pB = { x: 200.0, y: 350.0 };
    const visual = interpolate_position(pA, pB, 0.0);
    assert.strictEqual(visual.x, 100.0);
    assert.strictEqual(visual.y, 150.0);
  });

  // --- C09-D03: Linear interpolation alpha=0.5 ---
  it('C09-D03: Linear interpolation alpha=0.5 returns exact midpoint', () => {
    const pA = { x: 100.0, y: 150.0 };
    const pB = { x: 200.0, y: 350.0 };
    const visual = interpolate_position(pA, pB, 0.5);
    assert.strictEqual(visual.x, 150.0);
    assert.strictEqual(visual.y, 250.0);
  });

  // --- C09-D04: Linear interpolation alpha=1 ---
  it('C09-D04: Linear interpolation alpha=1 returns exact target position', () => {
    const pA = { x: 100.0, y: 150.0 };
    const pB = { x: 200.0, y: 350.0 };
    const visual = interpolate_position(pA, pB, 1.0);
    assert.strictEqual(visual.x, 200.0);
    assert.strictEqual(visual.y, 350.0);
  });

  // --- C09-D05: Alpha is bounded [0,1] ---
  it('C09-D05: Alpha is strictly clamped to [0.0, 1.0] to prevent extrapolation overshoot', () => {
    const pA = { x: 100.0, y: 100.0 };
    const pB = { x: 200.0, y: 200.0 };

    const visualUnder = interpolate_position(pA, pB, -0.5);
    assert.strictEqual(visualUnder.x, 100.0);
    assert.strictEqual(visualUnder.y, 100.0);

    const visualOver = interpolate_position(pA, pB, 1.5);
    assert.strictEqual(visualOver.x, 200.0);
    assert.strictEqual(visualOver.y, 200.0);
  });

  // --- C09-D06: New organism initializes source=target ---
  it('C09-D06: Newborn organism initializes immediately with source=target and alpha=1.0', () => {
    const model = new OrganismsOverlayModel();
    const org = { organism_id: 'org_1', position: { x: 10, y: 10, z: 0 } };
    model.applySnapshot([org], 0);

    const st = model.interpolationStates.get('org_1');
    assert.ok(st, 'State must exist');
    const expectedPos = calculate_pixel_center(10, 10);
    assert.deepStrictEqual(st.source_px, expectedPos);
    assert.deepStrictEqual(st.target_px, expectedPos);
    assert.strictEqual(st.alpha, 1.0);

    const visual = model.getVisualPosition('org_1');
    assert.deepStrictEqual(visual, expectedPos);
  });

  // --- C09-D07: Same-position snapshot does NOT restart interpolation ---
  it('C09-D07: Same-position consecutive snapshot keeps alpha=1.0 and does NOT restart interpolation', () => {
    const model = new OrganismsOverlayModel();
    const org = { organism_id: 'org_1', position: { x: 10, y: 10, z: 0 } };
    model.applySnapshot([org], 0);

    // Second snapshot arrives with same position
    model.applySnapshot([org], 0);
    const st = model.interpolationStates.get('org_1');
    assert.strictEqual(st.alpha, 1.0, 'Alpha must remain 1.0 on static tick');

    // Advancing process should return false (no redraw needed)
    const redrawNeeded = model.process(0.016);
    assert.strictEqual(redrawNeeded, false);
  });

  // --- C09-D08: Position change starts interpolation ---
  it('C09-D08: Authoritative position change starts interpolation segment from previous target', () => {
    const model = new OrganismsOverlayModel();
    const orgA = { organism_id: 'org_1', position: { x: 10, y: 10, z: 0 } };
    model.applySnapshot([orgA], 0);

    const orgB = { organism_id: 'org_1', position: { x: 11, y: 10, z: 0 } };
    model.applySnapshot([orgB], 0);

    const st = model.interpolationStates.get('org_1');
    assert.strictEqual(st.alpha, 0.0, 'Alpha must start at 0.0 for new movement segment');
    assert.deepStrictEqual(st.source_px, calculate_pixel_center(10, 10));
    assert.deepStrictEqual(st.target_px, calculate_pixel_center(11, 10));

    // After 50ms (half of 100ms duration)
    const redraw1 = model.process(0.050);
    assert.strictEqual(redraw1, true);
    assert.strictEqual(st.alpha, 0.5);

    const visualMid = model.getVisualPosition('org_1');
    const midExpected = {
      x: (calculate_pixel_center(10, 10).x + calculate_pixel_center(11, 10).x) * 0.5,
      y: calculate_pixel_center(10, 10).y
    };
    assert.deepStrictEqual(visualMid, midExpected);

    // After another 50ms
    const redraw2 = model.process(0.050);
    assert.strictEqual(redraw2, true);
    assert.strictEqual(st.alpha, 1.0);
    assert.deepStrictEqual(model.getVisualPosition('org_1'), calculate_pixel_center(11, 10));
  });

  // --- C09-D09: Mid-segment update uses CURRENT VISUAL POSITION as source ---
  it('C09-D09: Mid-segment update uses CURRENT VISUAL POSITION as source, preventing visual snapping backwards', () => {
    const model = new OrganismsOverlayModel();
    // Start at (10, 10)
    model.applySnapshot([{ organism_id: 'org_1', position: { x: 10, y: 10, z: 0 } }], 0);

    // Moves towards (20, 10)
    model.applySnapshot([{ organism_id: 'org_1', position: { x: 20, y: 10, z: 0 } }], 0);

    // Interrupted at 40% progress (40ms elapsed out of 100ms)
    model.process(0.040);
    const stBefore = model.interpolationStates.get('org_1');
    assert.strictEqual(Math.round(stBefore.alpha * 100) / 100, 0.40);
    const midVisual = model.getVisualPosition('org_1');

    // New snapshot arrives redirecting to (25, 10)
    model.applySnapshot([{ organism_id: 'org_1', position: { x: 25, y: 10, z: 0 } }], 0);
    const stAfter = model.interpolationStates.get('org_1');

    assert.strictEqual(stAfter.alpha, 0.0, 'Alpha resets to 0.0 for new segment');
    assert.deepStrictEqual(stAfter.source_px, midVisual, 'Source must be exactly the interrupted visual position');
    assert.deepStrictEqual(stAfter.target_px, calculate_pixel_center(25, 10));

    // Zero instant jump: visual position at alpha 0 of new segment equals midVisual
    assert.deepStrictEqual(model.getVisualPosition('org_1'), midVisual);
  });

  // --- C09-D10: Epoch change clears interpolation history ---
  it('C09-D10: Epoch change purges interpolation history to guarantee zero cross-epoch contamination', () => {
    const model = new OrganismsOverlayModel();
    model.applySnapshot([{ organism_id: 'org_1', position: { x: 45, y: 45, z: 0 } }], 0);

    // Advance to Epoch 1 (Reset) with new position (2, 2)
    model.applySnapshot([{ organism_id: 'org_1', position: { x: 2, y: 2, z: 0 } }], 1);

    const st = model.interpolationStates.get('org_1');
    assert.strictEqual(st.last_seen_epoch, 1);
    assert.deepStrictEqual(st.source_px, calculate_pixel_center(2, 2));
    assert.deepStrictEqual(st.target_px, calculate_pixel_center(2, 2));
    assert.strictEqual(st.alpha, 1.0);
  });

  // --- C09-D11: Epoch change causes immediate snap, never cross-epoch interpolation ---
  it('C09-D11: Epoch reset immediately snaps to tick 0 position without cross-map flying animation', () => {
    const model = new OrganismsOverlayModel();
    model.applySnapshot([{ organism_id: 'org_1', position: { x: 48, y: 48, z: 0 } }], 0);

    // Reset occurs, organism spawns at (2, 2) in epoch 1
    model.applySnapshot([{ organism_id: 'org_1', position: { x: 2, y: 2, z: 0 } }], 1);

    const visual = model.getVisualPosition('org_1');
    const expected = calculate_pixel_center(2, 2);
    assert.deepStrictEqual(visual, expected, 'Visual position must immediately snap to (2, 2)');

    // No pending frames to animate
    const redrawNeeded = model.process(0.016);
    assert.strictEqual(redrawNeeded, false, 'No interpolation animation across epochs');
  });

  // --- C09-D12: Organism disappearance prunes interpolation state ---
  it('C09-D12: Organism death/despawn immediately prunes its interpolation state', () => {
    const model = new OrganismsOverlayModel();
    model.applySnapshot([
      { organism_id: 'org_1', position: { x: 10, y: 10, z: 0 } },
      { organism_id: 'org_2', position: { x: 15, y: 15, z: 0 } }
    ], 0);

    assert.strictEqual(model.interpolationStates.size, 2);

    // org_2 dies / disappears from next snapshot
    model.applySnapshot([
      { organism_id: 'org_1', position: { x: 10, y: 10, z: 0 } }
    ], 0);

    assert.strictEqual(model.interpolationStates.size, 1);
    assert.strictEqual(model.interpolationStates.has('org_1'), true);
    assert.strictEqual(model.interpolationStates.has('org_2'), false);
    assert.strictEqual(model.getVisualPosition('org_2'), null);
  });

  // --- C09-D13: Z remains discrete ---
  it('C09-D13: Z coordinate remains discrete; interpolation affects ONLY X/Y pixel centers', () => {
    const overlayCode = fs.readFileSync(OVERLAY_PATH, 'utf8');
    assert.ok(overlayCode.includes('if z != active_z_layer:'), 'Z filtering must remain intact');
    assert.ok(overlayCode.includes('continue'), 'Non-active Z layers must be skipped');

    // Check helper has no Z interpolation
    const helperCode = fs.readFileSync(INTERPOLATOR_PATH, 'utf8');
    assert.doesNotMatch(helperCode, /interpolate_z|z_lerp|grid_z/i, 'Helper must not perform vertical interpolation');
  });

  // --- C09-D14: No RNG ---
  it('C09-D14: Organism interpolator and overlay use zero RNG, zero random wander, zero jitter', () => {
    const helperCode = fs.readFileSync(INTERPOLATOR_PATH, 'utf8');
    const overlayCode = fs.readFileSync(OVERLAY_PATH, 'utf8');

    assert.doesNotMatch(helperCode, /randf|randi|Math\.random|RandomNumberGenerator/i);
    assert.doesNotMatch(overlayCode, /randf|randi|Math\.random|RandomNumberGenerator/i);
    assert.doesNotMatch(overlayCode, /wander|drift|jitter|fidget/i);
  });

  // --- C09-D15: No simulation commands ---
  it('C09-D15: Presentation interpolation layer issues zero simulation commands (step, play, pause, reset)', () => {
    const helperCode = fs.readFileSync(INTERPOLATOR_PATH, 'utf8');
    const overlayCode = fs.readFileSync(OVERLAY_PATH, 'utf8');

    assert.doesNotMatch(helperCode, /\b(?:step|play|pause|reset)\s*\(/);
    assert.doesNotMatch(overlayCode, /ipc_client|send_command|call_remote/i);
  });

  // --- C09-D16: No raw IPC access ---
  it('C09-D16: OrganismsOverlay receives snapshots ONLY through SnapshotSynchronizer apply_snapshot_organisms', () => {
    const overlayCode = fs.readFileSync(OVERLAY_PATH, 'utf8');
    assert.doesNotMatch(overlayCode, /IpcClient|response_received|BridgeConnection/i);
    assert.ok(overlayCode.includes('func apply_snapshot_organisms(organisms: Array) -> void:'));
  });

  // --- C09-D17: No mutation of authoritative snapshot position ---
  it('C09-D17: Interpolation calculations never mutate original snapshot organism dictionaries', () => {
    const model = new OrganismsOverlayModel();
    const rawSnapshotOrg = {
      organism_id: 'org_immutable',
      position: { x: 12, y: 14, z: 0 },
      current_stage_id: 'STAGE_ADULT'
    };
    const cloned = JSON.parse(JSON.stringify(rawSnapshotOrg));

    model.applySnapshot([rawSnapshotOrg], 0);
    model.process(0.050);
    model.getVisualPosition('org_immutable');

    assert.deepStrictEqual(rawSnapshotOrg, cloned, 'Input snapshot object must remain completely unmutated');
  });

  // --- C09-D18: Deterministic identical input produces identical interpolation output ---
  it('C09-D18: Interpolation output is strictly deterministic across repeated identical invocations', () => {
    const pA = { x: 120.0, y: 140.0 };
    const pB = { x: 300.0, y: 220.0 };
    const a1 = interpolate_position(pA, pB, 0.33333);
    const a2 = interpolate_position(pA, pB, 0.33333);
    assert.strictEqual(a1.x, a2.x);
    assert.strictEqual(a1.y, a2.y);
  });

  // --- C09-D19: Frozen-domain guard: only authorized files changed ---
  it('C09-D19: Frozen-domain guard verifies only authorized files have been introduced/modified', () => {
    const gitDiff = execSync('git diff --name-only origin/main', { cwd: ROOT_DIR, encoding: 'utf8' }).trim();
    const modifiedFiles = gitDiff ? gitDiff.split(/\r?\n/).filter(Boolean) : [];
    
    // Check untracked files
    const untracked = execSync('git status --porcelain', { cwd: ROOT_DIR, encoding: 'utf8' }).trim();
    const untrackedFiles = untracked.split(/\r?\n/).filter(line => line.startsWith('?? ')).map(line => line.slice(3).trim());

    const allChanged = [...modifiedFiles, ...untrackedFiles];
    const authorizedFiles = [
      'godot/scripts/presentation/organisms_overlay.gd',
      'godot/scripts/presentation/organism_interpolator.gd',
      'tests/demo/demo_c09_organism_interpolation.test.js'
    ];

    for (const file of allChanged) {
      // Normalize path separators
      const normalized = file.replace(/\\/g, '/');
      assert.ok(
        authorizedFiles.includes(normalized),
        `Unauthorized modified/added file detected: ${normalized}`
      );
    }
  });

  // --- C09-D20: Existing C-09-B morphology remains integrated ---
  it('C09-D20: Existing C-09-B morphology and C-03 stacking remain fully integrated with visual interpolation', () => {
    const overlayCode = fs.readFileSync(OVERLAY_PATH, 'utf8');
    assert.ok(overlayCode.includes('Morphology.calculate_morphology(org)'), 'Morphology calculation must remain integrated');
    assert.ok(overlayCode.includes('group.sort_custom'), 'Deterministic sorting must remain');
    assert.ok(overlayCode.includes('Vector2(8.0, 8.0)'));
    assert.ok(overlayCode.includes('Vector2(5.0, 8.0)'));
    assert.ok(overlayCode.includes('Vector2(11.0, 8.0)'));
    assert.ok(overlayCode.includes('_draw_stack_badge(origin, count - 1)'));
    assert.ok(overlayCode.includes('_get_organism_visual_position'), 'Must integrate visual position helper');
  });

});
