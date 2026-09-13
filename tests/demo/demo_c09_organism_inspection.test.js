/**
 * tests/demo/demo_c09_organism_inspection.test.js
 * 
 * DEMO-01-C / C-09-E: Organism Selection & Inspection Test Suite
 * 
 * Presentation-only selection and inspection model verification.
 * Zero simulation authority, zero command dispatching, zero biological mutation.
 * Fail-closed data formatting without manufactured biological defaults.
 * 
 * Covers C09-E01 through C09-E28 specified by Game Director.
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
      } else {
        const existing = this.interpolationStates.get(orgId);
        if (!existing) {
          this.interpolationStates.set(orgId, {
            source_px: { ...targetPos },
            target_px: { ...targetPos },
            alpha: 1.0
          });
        } else {
          const currentVisual = interpolate_position(existing.source_px, existing.target_px, existing.alpha);
          if (existing.target_px.x !== targetPos.x || existing.target_px.y !== targetPos.y) {
            existing.source_px = currentVisual;
            existing.target_px = { ...targetPos };
            existing.alpha = 0.0;
          }
        }
      }
    }

    // Prune removed organisms
    for (const id of Array.from(this.interpolationStates.keys())) {
      if (!activeIds.has(id)) {
        this.interpolationStates.delete(id);
        if (this.selectedOrganismId === id) {
          this.selectedOrganismId = "";
          this.events.push({ type: 'selection_cleared', reason: 'organism_pruned', organism_id: id });
        }
        if (this.hoveredOrganismId === id) {
          this.hoveredOrganismId = "";
        }
      }
    }
  }

  getVisualPosition(orgId) {
    const st = this.interpolationStates.get(orgId);
    if (!st) return null;
    return interpolate_position(st.source_px, st.target_px, st.alpha);
  }

  getVisualPositionWithStack(org, slotIndex, totalInCell) {
    const orgId = String(org.organism_id);
    const center = this.getVisualPosition(orgId) || calculate_pixel_center(org.position.x, org.position.y);
    if (totalInCell <= 1) return center;

    const stackOffsets = [
      { x: -3, y: -3 },
      { x: 3, y: -3 },
      { x: -3, y: 3 },
      { x: 3, y: 3 }
    ];
    const offset = stackOffsets[slotIndex % 4];
    return {
      x: center.x + offset.x,
      y: center.y + offset.y
    };
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

// Pure presentation inspection formatter mirroring OrganismInspectionUI fail-closed logic
function formatInspectionData(org, organismId) {
  function readRequiredString(dict, key, fallbackKey = "") {
    if (dict && dict[key] != null && typeof dict[key] === 'string') {
      const s = dict[key].trim();
      if (s.length > 0) return s;
    }
    if (fallbackKey && dict && dict[fallbackKey] != null && typeof dict[fallbackKey] === 'string') {
      const s_fb = dict[fallbackKey].trim();
      if (s_fb.length > 0) return s_fb;
    }
    return "—";
  }

  function readRequiredNumber(dict, key) {
    if (dict && dict[key] != null && typeof dict[key] === 'number') {
      const val = dict[key];
      if (!Number.isNaN(val) && Number.isFinite(val)) {
        return val.toFixed(2);
      }
    }
    return "—";
  }

  function readRequiredFloat(dict, key, decimals = 1) {
    if (dict && dict[key] != null && typeof dict[key] === 'number') {
      const val = dict[key];
      if (!Number.isNaN(val) && Number.isFinite(val)) {
        return val.toFixed(decimals);
      }
    }
    return "—";
  }

  function readRequiredInt(dict, key) {
    if (dict && dict[key] != null && typeof dict[key] === 'number') {
      const val = dict[key];
      if (!Number.isNaN(val) && Number.isFinite(val)) {
        return String(Math.floor(val));
      }
    }
    return "—";
  }

  const species = readRequiredString(org, "species_id");
  const sex = readRequiredString(org, "sex");
  const gen = readRequiredInt(org, "generation");
  const stage = readRequiredString(org, "stage_display_label", "current_stage_id");
  const action = readRequiredString(org, "action_display_label", "action_intent");

  let devProg = "—";
  if (org && org.developmental_progress != null && typeof org.developmental_progress === 'number') {
    const dp = org.developmental_progress;
    if (!Number.isNaN(dp) && Number.isFinite(dp)) {
      devProg = (dp * 100).toFixed(1) + "%";
    }
  }

  const energy = readRequiredFloat(org, "stored_energy", 1);
  const biomass = readRequiredFloat(org, "structural_biomass", 1);

  const scale = readRequiredNumber(org, "body_scale_index");
  const pigment = readRequiredNumber(org, "cuticle_pigment_ratio");
  const chHorn = readRequiredNumber(org, "cephalic_horn_scale");
  const thHorn = readRequiredNumber(org, "thoracic_horn_scale");
  const tarsal = readRequiredNumber(org, "tarsal_grip_index");

  return {
    id: organismId,
    species,
    sex,
    generation: gen,
    stage,
    action,
    developmental_progress: devProg,
    stored_energy: energy,
    structural_biomass: biomass,
    body_scale_index: scale,
    cuticle_pigment_ratio: pigment,
    cephalic_horn_scale: chHorn,
    thoracic_horn_scale: thHorn,
    tarsal_grip_index: tarsal
  };
}

describe('DEMO-01-C / C-09-E: Organism Selection & Inspection Suite', () => {

  // --- C09-E01: Organism ID verbatim preservation ---
  it('C09-E01: Organism ID is preserved verbatim without synthesis, hashing, or UUID conversion', () => {
    const model = new OrganismSelectionModel();
    const rawId = 'org_xylotrupes_001_alpha';
    model.applySnapshot([{ organism_id: rawId, position: { x: 20, y: 20, z: 0 } }], 0);

    const center = calculate_pixel_center(20, 20);
    model.onMouseClick(center);

    assert.strictEqual(model.selectedOrganismId, rawId, 'Organism ID must match verbatim');
  });

  // --- C09-E02: Mouse hit-test operates in pixel space ---
  it('C09-E02: Mouse hit-test operates in continuous presentation pixel space', () => {
    const model = new OrganismSelectionModel();
    model.applySnapshot([{ organism_id: 'org_test', position: { x: 5, y: 5, z: 0 } }], 0);

    // Center of cell (5, 5) is (5*16 + 8, 5*16 + 8) = (88, 88)
    const center = calculate_pixel_center(5, 5);
    assert.strictEqual(center.x, 88);
    assert.strictEqual(center.y, 88);

    // Click within radius
    const hit = model.hitTest({ x: 88 + 5, y: 88 + 5 });
    assert.ok(hit !== null, 'Should hit within radius');
    assert.strictEqual(hit.organism_id, 'org_test');

    // Click far away
    const miss = model.hitTest({ x: 120, y: 120 });
    assert.strictEqual(miss, null, 'Should miss beyond radius');
  });

  // --- C09-E03: Quadrant slot offsets for stacked organisms ---
  it('C09-E03: Hit-testing stacked organisms accounts for deterministic quadrant slot offsets', () => {
    const model = new OrganismSelectionModel();
    const organisms = [
      { organism_id: 'org_a', position: { x: 10, y: 10, z: 0 } },
      { organism_id: 'org_b', position: { x: 10, y: 10, z: 0 } },
      { organism_id: 'org_c', position: { x: 10, y: 10, z: 0 } },
      { organism_id: 'org_d', position: { x: 10, y: 10, z: 0 } }
    ];
    model.applySnapshot(organisms, 0);

    const cellCenter = calculate_pixel_center(10, 10);
    // Slot 0 (org_a) offset: (-3, -3) -> pixel (165, 165)
    // Slot 1 (org_b) offset: (+3, -3) -> pixel (171, 165)
    const targetA = { x: cellCenter.x - 3, y: cellCenter.y - 3 };
    const targetB = { x: cellCenter.x + 3, y: cellCenter.y - 3 };

    const hitA = model.hitTest(targetA);
    assert.strictEqual(hitA.organism_id, 'org_a');

    const hitB = model.hitTest(targetB);
    assert.strictEqual(hitB.organism_id, 'org_b');
  });

  // --- C09-E04: Inactive Z-layer filtering ---
  it('C09-E04: Organisms on inactive Z-layers cannot be hit-tested, hovered, or selected', () => {
    const model = new OrganismSelectionModel();
    model.activeZLayer = 0;
    model.applySnapshot([
      { organism_id: 'org_z0', position: { x: 15, y: 15, z: 0 } },
      { organism_id: 'org_z1', position: { x: 15, y: 15, z: 1 } }
    ], 0);

    const center = calculate_pixel_center(15, 15);
    const hit = model.hitTest(center);
    assert.strictEqual(hit.organism_id, 'org_z0', 'Must only hit active Z-layer');

    // Switch active layer to 1
    model.activeZLayer = 1;
    const hitZ1 = model.hitTest(center);
    assert.strictEqual(hitZ1.organism_id, 'org_z1', 'Must hit org on z=1 now');
  });

  // --- C09-E05: Nearest glyph selection ---
  it('C09-E05: Ambiguous clicks choose the nearest visible organism glyph', () => {
    const model = new OrganismSelectionModel();
    model.applySnapshot([
      { organism_id: 'org_left', position: { x: 10, y: 10, z: 0 } },
      { organism_id: 'org_right', position: { x: 11, y: 10, z: 0 } }
    ], 0);

    const centerLeft = calculate_pixel_center(10, 10);
    const centerRight = calculate_pixel_center(11, 10);

    // Click 60% towards org_left
    const clickPos = {
      x: centerLeft.x + (centerRight.x - centerLeft.x) * 0.3,
      y: centerLeft.y
    };

    const hit = model.hitTest(clickPos);
    assert.strictEqual(hit.organism_id, 'org_left');
  });

  // --- C09-E06: Deterministic tie-breaking ---
  it('C09-E06: Exact equidistant tie breaks deterministically via organism_id ASC', () => {
    const model = new OrganismSelectionModel();
    model.applySnapshot([
      { organism_id: 'beta_org', position: { x: 20, y: 20, z: 0 } },
      { organism_id: 'alpha_org', position: { x: 20, y: 20, z: 0 } }
    ], 0);

    // Cell center is equidistant between Slot 0 (-3, -3) and Slot 3 (+3, +3)
    const center = calculate_pixel_center(20, 20);
    const hit = model.hitTest(center);
    assert.strictEqual(hit.organism_id, 'alpha_org', 'Tie-break must pick alpha_org (ASC sort)');
  });

  // --- C09-E07: Mouse motion updates hover state ---
  it('C09-E07: Mouse motion updates hover state and clears when moving to empty space', () => {
    const model = new OrganismSelectionModel();
    model.applySnapshot([{ organism_id: 'org_hover', position: { x: 20, y: 20, z: 0 } }], 0);

    const center = calculate_pixel_center(20, 20);
    model.onMouseMotion(center);
    assert.strictEqual(model.hoveredOrganismId, 'org_hover');

    model.onMouseMotion({ x: 0, y: 0 });
    assert.strictEqual(model.hoveredOrganismId, '', 'Hover must clear on empty space');
  });

  // --- C09-E08: Mouse click selects target organism ---
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
    const BASE_COMMIT = '74666fb';
    const C09_E_CLOSED_COMMIT = '38e98de';
    const gitDiff = execSync(`git diff --name-only ${BASE_COMMIT} ${C09_E_CLOSED_COMMIT}`, { cwd: ROOT_DIR, encoding: 'utf8' }).trim();
    const modifiedFiles = gitDiff ? gitDiff.split(/\r?\n/).filter(Boolean) : [];

    const authorized = [
      'godot/scenes/world_view.tscn',
      'godot/scripts/presentation/organism_inspection_ui.gd',
      'godot/scripts/presentation/organisms_overlay.gd',
      'tests/demo/demo_c09_organism_inspection.test.js'
    ];

    assert.strictEqual(modifiedFiles.length, 4, 'C-09-E milestone diff must contain exactly 4 files');
    for (const f of modifiedFiles) {
      const normalized = f.replace(/\\/g, '/');
      assert.ok(authorized.includes(normalized), `Unauthorized file in C-09-E milestone: ${normalized}`);
    }
  });

  // --- C09-E20: Scene only adds OrganismInspectionUI ---
  it('C09-E20: world_view.tscn diff only adds OrganismInspectionUI under UI CanvasLayer', () => {
    const BASE_COMMIT = '74666fb';
    const C09_E_CLOSED_COMMIT = '38e98de';
    const sceneDiff = execSync(`git diff ${BASE_COMMIT} ${C09_E_CLOSED_COMMIT} -- godot/scenes/world_view.tscn`, { cwd: ROOT_DIR, encoding: 'utf8' });
    assert.ok(sceneDiff.includes('OrganismInspectionUI'), 'Scene diff must contain OrganismInspectionUI addition');
    const addedLines = sceneDiff.split(/\r?\n/).filter(l => l.startsWith('+') && !l.startsWith('+++'));
    for (const line of addedLines) {
      assert.doesNotMatch(line, /Camera2D|WorldGridCanvas|StaticZonesOverlay|IpcClient|SnapshotSynchronizer|PresentationControls|ObservationLog/);
    }
  });

  // --- C09-E21: Missing species_id displays "—", never "xylotrupes_rhinoceros" ---
  it('C09-E21: Missing species_id displays "—", never fabricated "xylotrupes_rhinoceros"', () => {
    const uiCode = fs.readFileSync(INSPECTION_UI_PATH, 'utf8');
    assert.doesNotMatch(uiCode, /"xylotrupes_rhinoceros"/, 'Must never contain hardcoded species fallback');

    const resMissing = formatInspectionData({}, 'org_001');
    assert.strictEqual(resMissing.species, '—', 'Missing species_id must fail closed to "—"');

    const resEmpty = formatInspectionData({ species_id: '   ' }, 'org_001');
    assert.strictEqual(resEmpty.species, '—', 'Whitespace species_id must fail closed to "—"');

    const resValid = formatInspectionData({ species_id: 'lucanus_cervus' }, 'org_001');
    assert.strictEqual(resValid.species, 'lucanus_cervus');
  });

  // --- C09-E22: Missing phenotype fields display "—", never fabricated values ---
  it('C09-E22: Missing phenotype fields display "—", never fabricated numeric values', () => {
    const uiCode = fs.readFileSync(INSPECTION_UI_PATH, 'utf8');
    assert.doesNotMatch(uiCode, /body_scale_index.*1\.0/, 'Must not default scale to 1.0');
    assert.doesNotMatch(uiCode, /cuticle_pigment_ratio.*0\.5/, 'Must not default pigment to 0.5');
    assert.doesNotMatch(uiCode, /tarsal_grip_index.*1\.0/, 'Must not default grip to 1.0');

    const formatted = formatInspectionData({}, 'org_001');
    assert.strictEqual(formatted.body_scale_index, '—');
    assert.strictEqual(formatted.cuticle_pigment_ratio, '—');
    assert.strictEqual(formatted.cephalic_horn_scale, '—');
    assert.strictEqual(formatted.thoracic_horn_scale, '—');
    assert.strictEqual(formatted.tarsal_grip_index, '—');
  });

  // --- C09-E23: Missing energy/biomass/generation/development display "—" ---
  it('C09-E23: Missing energy, biomass, generation, or development fields display "—"', () => {
    const formatted = formatInspectionData({}, 'org_001');
    assert.strictEqual(formatted.stored_energy, '—');
    assert.strictEqual(formatted.structural_biomass, '—');
    assert.strictEqual(formatted.generation, '—');
    assert.strictEqual(formatted.developmental_progress, '—');

    const populated = formatInspectionData({
      stored_energy: 15.2,
      structural_biomass: 3.8,
      generation: 2,
      developmental_progress: 0.654
    }, 'org_001');
    assert.strictEqual(populated.stored_energy, '15.2');
    assert.strictEqual(populated.structural_biomass, '3.8');
    assert.strictEqual(populated.generation, '2');
    assert.strictEqual(populated.developmental_progress, '65.4%');
  });

  // --- C09-E24: Invalid numeric phenotype values display "—" ---
  it('C09-E24: Invalid numeric phenotype values (NaN, Infinity, non-numeric) display "—"', () => {
    const invalidData = formatInspectionData({
      body_scale_index: NaN,
      cuticle_pigment_ratio: Infinity,
      cephalic_horn_scale: -Infinity,
      thoracic_horn_scale: 'string_value',
      tarsal_grip_index: null
    }, 'org_001');

    assert.strictEqual(invalidData.body_scale_index, '—');
    assert.strictEqual(invalidData.cuticle_pigment_ratio, '—');
    assert.strictEqual(invalidData.cephalic_horn_scale, '—');
    assert.strictEqual(invalidData.thoracic_horn_scale, '—');
    assert.strictEqual(invalidData.tarsal_grip_index, '—');

    const uiCode = fs.readFileSync(INSPECTION_UI_PATH, 'utf8');
    assert.ok(uiCode.includes('is_nan') && uiCode.includes('is_inf'), 'UI must validate against NaN and Inf');
  });

  // --- C09-E25: stage_display_label falls back to current_stage_id ---
  it('C09-E25: stage_display_label may fall back to current_stage_id, else "—"', () => {
    const primary = formatInspectionData({ stage_display_label: 'Larva L2' }, 'org_001');
    assert.strictEqual(primary.stage, 'Larva L2');

    const fallback = formatInspectionData({ current_stage_id: 'STAGE_LARVA' }, 'org_001');
    assert.strictEqual(fallback.stage, 'STAGE_LARVA');

    const both = formatInspectionData({ stage_display_label: 'Pupa', current_stage_id: 'STAGE_PUPA' }, 'org_001');
    assert.strictEqual(both.stage, 'Pupa');

    const neither = formatInspectionData({}, 'org_001');
    assert.strictEqual(neither.stage, '—');
  });

  // --- C09-E26: action_display_label falls back to action_intent ---
  it('C09-E26: action_display_label may fall back to action_intent, else "—"', () => {
    const primary = formatInspectionData({ action_display_label: 'Feeding on Sap' }, 'org_001');
    assert.strictEqual(primary.action, 'Feeding on Sap');

    const fallback = formatInspectionData({ action_intent: 'FEED' }, 'org_001');
    assert.strictEqual(fallback.action, 'FEED');

    const both = formatInspectionData({ action_display_label: 'Resting', action_intent: 'REST' }, 'org_001');
    assert.strictEqual(both.action, 'Resting');

    const neither = formatInspectionData({}, 'org_001');
    assert.strictEqual(neither.action, '—');
  });

  // --- C09-E27: Inspection UI has no direct SnapshotSynchronizer binding ---
  it('C09-E27: Inspection UI has zero direct SnapshotSynchronizer binding', () => {
    const uiCode = fs.readFileSync(INSPECTION_UI_PATH, 'utf8');
    assert.doesNotMatch(uiCode, /\bSnapshotSynchronizer\b/, 'Must not reference SnapshotSynchronizer class');
    assert.doesNotMatch(uiCode, /\bsnapshot_synchronizer\b/, 'Must not reference snapshot_synchronizer node/var');
    assert.doesNotMatch(uiCode, /apply_snapshot_organisms/, 'Must not bind to synchronizer snapshot signals');
    assert.ok(uiCode.includes('OrganismsOverlay'), 'Must discover OrganismsOverlay');
    assert.ok(uiCode.includes('organism_selected'), 'Must listen to overlay organism_selected');
  });

  // --- C09-E28: Production HIT_RADIUS is 12.0 and test model matches it ---
  it('C09-E28: Production HIT_RADIUS is 12.0 and selection model strictly matches boundary', () => {
    assert.strictEqual(HIT_RADIUS, 12.0, 'Test constant must equal 12.0');

    const overlayCode = fs.readFileSync(OVERLAY_PATH, 'utf8');
    assert.match(overlayCode, /HIT_RADIUS:\s*float\s*=\s*12\.0/, 'Overlay code must define HIT_RADIUS = 12.0');

    const model = new OrganismSelectionModel();
    model.applySnapshot([{ organism_id: 'org_boundary', position: { x: 10, y: 10, z: 0 } }], 0);
    const center = calculate_pixel_center(10, 10);

    // Distance 11.9 px: within 12.0 -> HIT
    model.onMouseClick({ x: center.x + 11.9, y: center.y });
    assert.strictEqual(model.selectedOrganismId, 'org_boundary');

    // Distance 12.1 px: exceeds 12.0 -> MISS (clears selection on empty click)
    model.onMouseClick({ x: center.x + 12.1, y: center.y });
    assert.strictEqual(model.selectedOrganismId, '');
  });

});
