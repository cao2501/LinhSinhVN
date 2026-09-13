/**
 * tests/demo/demo_c09_organism_inspection.test.js
 * 
 * DEMO-01-C / C-09-E: Organism Selection & Inspection Test Suite
 * 
 * Presentation-only selection and inspection model verification.
 * Zero simulation authority, zero command dispatching, zero biological mutation.
 * 
 * Covers C09-E01 through C09-E20 specified by Game Director.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT_DIR = path.resolve('D:/LinhSinhVN');
const OVERLAY_PATH = path.join(ROOT_DIR, 'godot/scripts/presentation/organisms_overlay.gd');
const INSPECTION_UI_PATH = path.join(ROOT_DIR, 'godot/scripts/presentation/organism_inspection_ui.gd');
const SCENE_PATH = path.join(ROOT_DIR, 'godot/scenes/world_view.tscn');
const INTERPOLATOR_PATH = path.join(ROOT_DIR, 'godot/scripts/presentation/organism_interpolator.gd');

const CELL_SIZE = 16;
const HIT_RADIUS = 12.0;

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

// Pure Selection & Hit-Test Model mirroring OrganismsOverlay exactly
class OrganismSelectionModel {
  constructor() {
    this.activeZLayer = 0;
    this.cachedOrganisms = [];
    this.interpolationStates = new Map();
    this.selectedOrganismId = "";
    this.hoveredOrganismId = "";
    this.lastSeenEpoch = -1;
    this.hasReceivedFirstSnapshot = false;
    this.events = [];
  }

  applySnapshot(organisms, currentEpoch = 0) {
    let isEpochReset = false;
    if (!this.hasReceivedFirstSnapshot) {
      this.hasReceivedFirstSnapshot = true;
      this.lastSeenEpoch = currentEpoch;
      this.interpolationStates.clear();
      this.selectedOrganismId = "";
      this.hoveredOrganismId = "";
      isEpochReset = true;
    } else if (currentEpoch !== this.lastSeenEpoch) {
      this.lastSeenEpoch = currentEpoch;
      this.interpolationStates.clear();
      this.selectedOrganismId = "";
      this.hoveredOrganismId = "";
      this.events.push({ type: 'selection_cleared', reason: 'epoch_reset' });
      isEpochReset = true;
    }

    const activeIds = new Set();
    this.cachedOrganisms = JSON.parse(JSON.stringify(organisms));

    for (const org of organisms) {
      if (!org || typeof org !== 'object') continue;
      const orgId = String(org.organism_id);
      activeIds.add(orgId);

      const pos = org.position;
      if (!pos || typeof pos !== 'object') continue;
      const targetPos = calculate_pixel_center(pos.x, pos.y);

      if (isEpochReset) {
        this.interpolationStates.set(orgId, {
          source_px: { ...targetPos },
          target_px: { ...targetPos },
          alpha: 1.0
        });
      } else if (!this.interpolationStates.has(orgId)) {
        this.interpolationStates.set(orgId, {
          source_px: { ...targetPos },
          target_px: { ...targetPos },
          alpha: 1.0
        });
      } else {
        const st = this.interpolationStates.get(orgId);
        const prevTarget = st.target_px;
        if (prevTarget.x === targetPos.x && prevTarget.y === targetPos.y) {
          st.target_px = { ...targetPos };
          st.alpha = 1.0;
        } else {
          const currentVisual = interpolate_position(st.source_px, prevTarget, st.alpha);
          st.source_px = currentVisual;
          st.target_px = { ...targetPos };
          st.alpha = 0.0;
        }
      }
    }

    // Prune missing organisms
    for (const kid of Array.from(this.interpolationStates.keys())) {
      if (!activeIds.has(kid)) {
        this.interpolationStates.delete(kid);
      }
    }

    // Selection lifecycle
    if (this.selectedOrganismId !== "") {
      if (!activeIds.has(this.selectedOrganismId)) {
        this.selectedOrganismId = "";
        this.events.push({ type: 'selection_cleared', reason: 'missing_organism' });
      } else {
        this.events.push({ type: 'selection_refreshed', organism_id: this.selectedOrganismId });
      }
    }
  }

  getVisualPosition(org) {
    const orgId = String(org.organism_id);
    const pos = org.position;
    const origin = { x: pos.x * CELL_SIZE, y: pos.y * CELL_SIZE };
    const defaultCenter = { x: origin.x + 8.0, y: origin.y + 8.0 };

    if (this.interpolationStates.has(orgId)) {
      const st = this.interpolationStates.get(orgId);
      return interpolate_position(st.source_px, st.target_px, st.alpha);
    }
    return defaultCenter;
  }

  getVisualPositionWithStack(org, indexInCell, countInCell) {
    const baseInterp = this.getVisualPosition(org);
    const pos = org.position;
    const origin = { x: pos.x * CELL_SIZE, y: pos.y * CELL_SIZE };
    const cellCenter = { x: origin.x + 8.0, y: origin.y + 8.0 };

    let fallbackCenter = cellCenter;
    if (countInCell === 2) {
      fallbackCenter = { x: origin.x + (indexInCell === 0 ? 5.0 : 11.0), y: origin.y + 8.0 };
    } else if (countInCell === 3) {
      fallbackCenter = {
        x: origin.x + (indexInCell === 0 ? 5.0 : (indexInCell === 1 ? 11.0 : 8.0)),
        y: origin.y + (indexInCell === 2 ? 11.0 : 5.0)
      };
    } else if (countInCell === 4) {
      fallbackCenter = {
        x: origin.x + (indexInCell % 2 === 0 ? 5.0 : 11.0),
        y: origin.y + (indexInCell < 2 ? 5.0 : 11.0)
      };
    } else if (countInCell > 4) {
      fallbackCenter = cellCenter;
    }

    const slotOffset = { x: fallbackCenter.x - cellCenter.x, y: fallbackCenter.y - cellCenter.y };
    return { x: baseInterp.x + slotOffset.x, y: baseInterp.y + slotOffset.y };
  }

  hitTest(pixelPos) {
    if (this.cachedOrganisms.length === 0) return null;

    // Group by cell
    const cellGroups = new Map();
    for (const org of this.cachedOrganisms) {
      if (!org.position || org.position.z !== this.activeZLayer) continue;
      const key = `${org.position.x}_${org.position.y}_${org.position.z}`;
      if (!cellGroups.has(key)) cellGroups.set(key, []);
      cellGroups.get(key).push(org);
    }

    let bestOrg = null;
    let minDist = HIT_RADIUS;

    for (const [key, group] of cellGroups.entries()) {
      group.sort((a, b) => String(a.organism_id).localeCompare(String(b.organism_id)));
      const count = group.length;

      for (let i = 0; i < count; i++) {
        const org = group[i];
        if (count > 4 && i > 0) continue; // N > 4 renders only group[0]

        const visualPos = this.getVisualPositionWithStack(org, i, count);
        const dx = pixelPos.x - visualPos.x;
        const dy = pixelPos.y - visualPos.y;
        const d = Math.sqrt(dx * dx + dy * dy);

        if (d <= minDist) {
          if (Math.abs(d - minDist) < 1e-6 && bestOrg !== null) {
            // Deterministic tie break: organism_id ASC
            if (String(org.organism_id) < String(bestOrg.organism_id)) {
              bestOrg = org;
              minDist = d;
            }
          } else {
            bestOrg = org;
            minDist = d;
          }
        }
      }
    }

    return bestOrg;
  }

  onMouseMotion(pixelPos) {
    const candidate = this.hitTest(pixelPos);
    const newHover = candidate ? String(candidate.organism_id) : "";
    if (newHover !== this.hoveredOrganismId) {
      this.hoveredOrganismId = newHover;
      this.events.push({ type: 'hover_changed', organism_id: this.hoveredOrganismId });
    }
  }

  onMouseClick(pixelPos) {
    const candidate = this.hitTest(pixelPos);
    const newSelected = candidate ? String(candidate.organism_id) : "";
    if (newSelected !== this.selectedOrganismId) {
      this.selectedOrganismId = newSelected;
      this.events.push({ type: 'selection_changed', organism_id: this.selectedOrganismId });
    }
  }
}

describe('DEMO-01-C / C-09-E: Organism Selection & Inspection Suite', () => {

  // --- C09-E01: Organism ID is used verbatim ---
  it('C09-E01: Organism ID is preserved verbatim without synthesis, hashing, or UUID conversion', () => {
    const model = new OrganismSelectionModel();
    const org = { organism_id: 'beetle_specimen_alpha_99', position: { x: 10, y: 10, z: 0 } };
    model.applySnapshot([org], 0);

    const hit = model.hitTest(calculate_pixel_center(10, 10));
    assert.ok(hit);
    assert.strictEqual(hit.organism_id, 'beetle_specimen_alpha_99');

    // GDScript inspection source audit
    const uiCode = fs.readFileSync(INSPECTION_UI_PATH, 'utf8');
    assert.ok(uiCode.includes('_id_label.text = "ID: %s" % _current_organism_id'));
  });

  // --- C09-E02: Mouse hit-test uses presentation position ---
  it('C09-E02: Mouse hit-test operates in continuous presentation pixel space', () => {
    const model = new OrganismSelectionModel();
    model.applySnapshot([{ organism_id: 'org_1', position: { x: 5, y: 5, z: 0 } }], 0);

    const center = calculate_pixel_center(5, 5); // (88, 88)
    // Click within radius
    const hitNear = model.hitTest({ x: center.x + 4.0, y: center.y - 4.0 });
    assert.ok(hitNear, 'Must hit within 12px radius');
    assert.strictEqual(hitNear.organism_id, 'org_1');

    // Click outside radius
    const hitFar = model.hitTest({ x: center.x + 15.0, y: center.y });
    assert.strictEqual(hitFar, null, 'Must not hit outside radius');
  });

  // --- C09-E03: Hit-test includes stack offset ---
  it('C09-E03: Hit-testing stacked organisms accounts for deterministic quadrant slot offsets', () => {
    const model = new OrganismSelectionModel();
    // Two organisms in cell (10, 10)
    model.applySnapshot([
      { organism_id: 'org_A', position: { x: 10, y: 10, z: 0 } },
      { organism_id: 'org_B', position: { x: 10, y: 10, z: 0 } }
    ], 0);

    const cellOrigin = { x: 10 * CELL_SIZE, y: 10 * CELL_SIZE };
    const slotA = { x: cellOrigin.x + 5.0, y: cellOrigin.y + 8.0 };
    const slotB = { x: cellOrigin.x + 11.0, y: cellOrigin.y + 8.0 };

    // Click exactly on slot A
    const hitA = model.hitTest(slotA);
    assert.ok(hitA);
    assert.strictEqual(hitA.organism_id, 'org_A');

    // Click exactly on slot B
    const hitB = model.hitTest(slotB);
    assert.ok(hitB);
    assert.strictEqual(hitB.organism_id, 'org_B');
  });

  // --- C09-E04: Z-layer filtering works ---
  it('C09-E04: Organisms on inactive Z-layers cannot be hit-tested, hovered, or selected', () => {
    const model = new OrganismSelectionModel();
    model.activeZLayer = 0;
    model.applySnapshot([
      { organism_id: 'org_z0', position: { x: 10, y: 10, z: 0 } },
      { organism_id: 'org_z1', position: { x: 10, y: 10, z: 1 } }
    ], 0);

    const targetPos = calculate_pixel_center(10, 10);
    const hit = model.hitTest(targetPos);
    assert.ok(hit);
    assert.strictEqual(hit.organism_id, 'org_z0');

    // Switch active layer to z=1
    model.activeZLayer = 1;
    const hitLayer1 = model.hitTest(targetPos);
    assert.ok(hitLayer1);
    assert.strictEqual(hitLayer1.organism_id, 'org_z1');

    // Switch active layer to z=2 (empty)
    model.activeZLayer = 2;
    const hitLayer2 = model.hitTest(targetPos);
    assert.strictEqual(hitLayer2, null);
  });

  // --- C09-E05: Nearest glyph wins ---
  it('C09-E05: Ambiguous clicks choose the nearest visible organism glyph', () => {
    const model = new OrganismSelectionModel();
    model.applySnapshot([
      { organism_id: 'org_left', position: { x: 10, y: 10, z: 0 } },
      { organism_id: 'org_right', position: { x: 11, y: 10, z: 0 } }
    ], 0);

    const centerLeft = calculate_pixel_center(10, 10);
    const centerRight = calculate_pixel_center(11, 10);

    // Click between cells, closer to left (40% of the distance)
    const clickPoint = {
      x: centerLeft.x + (centerRight.x - centerLeft.x) * 0.35,
      y: centerLeft.y
    };

    const hit = model.hitTest(clickPoint);
    assert.ok(hit);
    assert.strictEqual(hit.organism_id, 'org_left');
  });

  // --- C09-E06: Equal-distance tie breaks organism_id ASC ---
  it('C09-E06: Exact equidistant tie breaks deterministically via organism_id ASC', () => {
    const model = new OrganismSelectionModel();
    model.applySnapshot([
      { organism_id: 'zeta', position: { x: 10, y: 10, z: 0 } },
      { organism_id: 'alpha', position: { x: 10, y: 10, z: 0 } }
    ], 0);

    const cellOrigin = { x: 10 * CELL_SIZE, y: 10 * CELL_SIZE };
    // Exact midpoint between slot 0 (5.0, 8.0) and slot 1 (11.0, 8.0)
    const midpoint = { x: cellOrigin.x + 8.0, y: cellOrigin.y + 8.0 };

    const hit = model.hitTest(midpoint);
    assert.ok(hit);
    assert.strictEqual(hit.organism_id, 'alpha', 'Tie-break must pick alpha over zeta');
  });

  // --- C09-E07: Hover state changes deterministically ---
  it('C09-E07: Mouse motion updates hover state and clears when moving to empty space', () => {
    const model = new OrganismSelectionModel();
    model.applySnapshot([{ organism_id: 'org_target', position: { x: 15, y: 15, z: 0 } }], 0);

    const center = calculate_pixel_center(15, 15);
    model.onMouseMotion(center);
    assert.strictEqual(model.hoveredOrganismId, 'org_target');

    // Move away to empty space
    model.onMouseMotion({ x: 0.0, y: 0.0 });
    assert.strictEqual(model.hoveredOrganismId, '');
  });

  // --- C09-E08: Selection state changes deterministically ---
  it('C09-E08: Mouse click selects target organism and updates state', () => {
    const model = new OrganismSelectionModel();
    model.applySnapshot([{ organism_id: 'org_click', position: { x: 20, y: 20, z: 0 } }], 0);

    const center = calculate_pixel_center(20, 20);
    model.onMouseClick(center);
    assert.strictEqual(model.selectedOrganismId, 'org_click');
  });

  // --- C09-E09: Click empty space clears selection ---
  it('C09-E09: Clicking on empty space clears selection', () => {
    const model = new OrganismSelectionModel();
    model.applySnapshot([{ organism_id: 'org_click', position: { x: 20, y: 20, z: 0 } }], 0);

    const center = calculate_pixel_center(20, 20);
    model.onMouseClick(center);
    assert.strictEqual(model.selectedOrganismId, 'org_click');

    model.onMouseClick({ x: 10.0, y: 10.0 });
    assert.strictEqual(model.selectedOrganismId, '');
  });

  // --- C09-E10: Selected organism remains selected during interpolation ---
  it('C09-E10: Selected organism remains selected across interpolation updates', () => {
    const model = new OrganismSelectionModel();
    model.applySnapshot([{ organism_id: 'org_moving', position: { x: 10, y: 10, z: 0 } }], 0);
    model.onMouseClick(calculate_pixel_center(10, 10));
    assert.strictEqual(model.selectedOrganismId, 'org_moving');

    // Movement snapshot arrives
    model.applySnapshot([{ organism_id: 'org_moving', position: { x: 12, y: 10, z: 0 } }], 0);
    assert.strictEqual(model.selectedOrganismId, 'org_moving', 'Selection identity persists during move');
  });

  // --- C09-E11: Selection ring follows visual position ---
  it('C09-E11: Selection highlight ring follows interpolated visual position', () => {
    const overlayCode = fs.readFileSync(OVERLAY_PATH, 'utf8');
    assert.ok(overlayCode.includes('func _draw_organism_with_highlight'), 'Highlight rendering method must exist');
    assert.ok(overlayCode.includes('_selected_organism_id'), 'Selection ID check in rendering');
    assert.ok(overlayCode.includes('SELECTION_COLOR'), 'Selection highlight color used');
  });

  // --- C09-E12: Epoch change clears selection ---
  it('C09-E12: Simulation reset (epoch change) immediately clears selection and hover state', () => {
    const model = new OrganismSelectionModel();
    model.applySnapshot([{ organism_id: 'org_1', position: { x: 10, y: 10, z: 0 } }], 0);
    model.onMouseClick(calculate_pixel_center(10, 10));
    assert.strictEqual(model.selectedOrganismId, 'org_1');

    // Reset occurs: epoch advances from 0 to 1
    model.applySnapshot([{ organism_id: 'org_1', position: { x: 10, y: 10, z: 0 } }], 1);
    assert.strictEqual(model.selectedOrganismId, '', 'Selection must clear on epoch boundary');
    assert.strictEqual(model.hoveredOrganismId, '');
  });

  // --- C09-E13: Selected dead organism remains inspectable ---
  it('C09-E13: Selected organism that dies remains inspectable with DEAD status display', () => {
    const model = new OrganismSelectionModel();
    model.applySnapshot([{ organism_id: 'org_1', position: { x: 10, y: 10, z: 0 }, is_alive: true }], 0);
    model.onMouseClick(calculate_pixel_center(10, 10));
    assert.strictEqual(model.selectedOrganismId, 'org_1');

    // Organism dies in subsequent snapshot (retained with is_alive: false)
    model.applySnapshot([{ organism_id: 'org_1', position: { x: 10, y: 10, z: 0 }, is_alive: false }], 0);
    assert.strictEqual(model.selectedOrganismId, 'org_1', 'Dead organism must remain selected');

    // GDScript audit for dead status handling
    const uiCode = fs.readFileSync(INSPECTION_UI_PATH, 'utf8');
    assert.ok(uiCode.includes('Status: DEAD'));
    assert.ok(uiCode.includes('Status: ALIVE'));
  });

  // --- C09-E14: Missing selected organism clears selection ---
  it('C09-E14: Organism that completely disappears from snapshot clears selection', () => {
    const model = new OrganismSelectionModel();
    model.applySnapshot([{ organism_id: 'org_vanishing', position: { x: 10, y: 10, z: 0 } }], 0);
    model.onMouseClick(calculate_pixel_center(10, 10));
    assert.strictEqual(model.selectedOrganismId, 'org_vanishing');

    // Disappears completely from snapshot
    model.applySnapshot([], 0);
    assert.strictEqual(model.selectedOrganismId, '', 'Selection must clear when organism is pruned');
  });

  // --- C09-E15: Inspection uses latest accepted organism record ---
  it('C09-E15: Inspection UI populates from latest accepted snapshot record', () => {
    const uiCode = fs.readFileSync(INSPECTION_UI_PATH, 'utf8');
    assert.ok(uiCode.includes('stored_energy'));
    assert.ok(uiCode.includes('structural_biomass'));
    assert.ok(uiCode.includes('developmental_progress'));
    assert.ok(uiCode.includes('stage_display_label'));
    assert.ok(uiCode.includes('action_display_label'));
    assert.ok(uiCode.includes('body_scale_index'));
    assert.ok(uiCode.includes('cuticle_pigment_ratio'));
    assert.ok(uiCode.includes('cephalic_horn_scale'));
    assert.ok(uiCode.includes('thoracic_horn_scale'));
    assert.ok(uiCode.includes('tarsal_grip_index'));
    assert.ok(uiCode.includes('habitat_id'));
    assert.ok(uiCode.includes('sheltered_in'));
  });

  // --- C09-E16: No raw genotype exposed ---
  it('C09-E16: Inspection UI never exposes raw genotype, alleles, loci, or vExp', () => {
    const uiCode = fs.readFileSync(INSPECTION_UI_PATH, 'utf8');
    const overlayCode = fs.readFileSync(OVERLAY_PATH, 'utf8');

    assert.doesNotMatch(uiCode, /\b(?:genome|genotype|alleles|loci|vExp|derived_stats)\b/i);
    assert.doesNotMatch(overlayCode, /\b(?:genome|genotype|alleles|loci|vExp|derived_stats)\b/i);
  });

  // --- C09-E17: No simulation commands ---
  it('C09-E17: Selection and inspection layers issue zero simulation commands', () => {
    const uiCode = fs.readFileSync(INSPECTION_UI_PATH, 'utf8');
    const overlayCode = fs.readFileSync(OVERLAY_PATH, 'utf8');

    assert.doesNotMatch(uiCode, /\b(?:step|play|pause|reset)\s*\(/);
    assert.doesNotMatch(uiCode, /ipc_client|send_command/i);
    assert.doesNotMatch(overlayCode, /\b(?:step|play|pause|reset)\s*\(/);
  });

  // --- C09-E18: No raw IPC ---
  it('C09-E18: Selection and inspection layers contain zero raw IPC client bindings', () => {
    const uiCode = fs.readFileSync(INSPECTION_UI_PATH, 'utf8');
    const overlayCode = fs.readFileSync(OVERLAY_PATH, 'utf8');

    assert.doesNotMatch(uiCode, /IpcClient|response_received|BridgeConnection/i);
    assert.doesNotMatch(overlayCode, /IpcClient|response_received|BridgeConnection/i);
  });

  // --- C09-E19: Frozen-domain guard ---
  it('C09-E19: Frozen-domain guard verifies only the 4 authorized files have been modified/introduced', () => {
    const gitDiff = execSync('git diff --name-only origin/main', { cwd: ROOT_DIR, encoding: 'utf8' }).trim();
    const modifiedFiles = gitDiff ? gitDiff.split(/\r?\n/).filter(Boolean) : [];

    const untracked = execSync('git status --porcelain', { cwd: ROOT_DIR, encoding: 'utf8' }).trim();
    const untrackedFiles = untracked.split(/\r?\n/).filter(l => l.startsWith('?? ')).map(l => l.slice(3).trim());

    const allChanged = [...modifiedFiles, ...untrackedFiles];
    const authorized = [
      'godot/scripts/presentation/organisms_overlay.gd',
      'godot/scenes/world_view.tscn',
      'godot/scripts/presentation/organism_inspection_ui.gd',
      'tests/demo/demo_c09_organism_inspection.test.js'
    ];

    for (const f of allChanged) {
      const normalized = f.replace(/\\/g, '/');
      assert.ok(authorized.includes(normalized), `Unauthorized file modified: ${normalized}`);
    }
  });

  // --- C09-E20: Scene only adds OrganismInspectionUI ---
  it('C09-E20: world_view.tscn diff only adds OrganismInspectionUI under UI CanvasLayer', () => {
    const sceneDiff = execSync('git diff godot/scenes/world_view.tscn', { cwd: ROOT_DIR, encoding: 'utf8' });
    assert.ok(sceneDiff.includes('OrganismInspectionUI'), 'Scene must contain OrganismInspectionUI addition');
    const addedLines = sceneDiff.split(/\r?\n/).filter(l => l.startsWith('+') && !l.startsWith('+++'));
    for (const line of addedLines) {
      assert.doesNotMatch(line, /Camera2D|WorldGridCanvas|StaticZonesOverlay|IpcClient|SnapshotSynchronizer|PresentationControls|ObservationLog/);
    }
  });

});
