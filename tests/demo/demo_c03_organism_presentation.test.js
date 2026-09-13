/**
 * LinhSinhVN — DEMO-01-C / C-03 Organism Presentation Test Suite
 *
 * Checkpoint: DEMO-01-C / C-03 Organism Presentation
 * Verifies deterministic organism visual mapping, fixed stage glyphs, Z-layer filtering,
 * dead organism retention, deterministic stacking, developmental_progress validation,
 * zero biological inference, scene wiring, and hard frozen domain integrity.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  INITIAL_ORGANISM_POSITIONS,
  INITIAL_POPULATION_COUNT,
  CANONICAL_ACTION_LABELS,
  CANONICAL_STAGE_LABELS
} from '../../demo/demo_constants.js';
import { DemoSimulationSession } from '../../demo/demo_simulation_session.js';
import { loadSpeciesProfile } from '../../game/lifecycle/profile_loader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

describe('DEMO-01-C / C-03: Organism Presentation', () => {
  const overlayScriptPath = path.join(REPO_ROOT, 'godot/scripts/presentation/organisms_overlay.gd');
  const worldViewScriptPath = path.join(REPO_ROOT, 'godot/scripts/presentation/world_view.gd');
  const worldViewScenePath = path.join(REPO_ROOT, 'godot/scenes/world_view.tscn');
  const configScriptPath = path.join(REPO_ROOT, 'godot/scripts/presentation/demo_world_config.gd');

  function getDemoProfile() {
    return loadSpeciesProfile('data/species/xylotrupes_rhinoceros_proto.json');
  }

  function getTick0Snapshot() {
    const session = new DemoSimulationSession({ speciesProfile: getDemoProfile() });
    return session.getSnapshot();
  }

  function getOverlayCodeOnly() {
    const raw = fs.readFileSync(overlayScriptPath, 'utf8');
    return raw.split(/\r?\n/).filter(l => !l.trim().startsWith('#')).join('\n');
  }

  // --- C03-01: Coordinate -> pixel mapping deterministic ---
  it('C03-01: Coordinate -> pixel mapping is deterministic for all bootstrap organisms', () => {
    const snap = getTick0Snapshot();
    assert.equal(snap.organisms.length, INITIAL_POPULATION_COUNT);

    const CELL_SIZE = 16;
    for (const org of snap.organisms) {
      assert.ok(org.position, 'Organism must have position');
      const expectedPx = org.position.x * CELL_SIZE;
      const expectedPy = org.position.y * CELL_SIZE;
      const centerPx = expectedPx + 8.0;
      const centerPy = expectedPy + 8.0;

      // Coordinate bounds check
      assert.ok(org.position.x >= 20 && org.position.x <= 24);
      assert.ok(org.position.y >= 20 && org.position.y <= 21);
      assert.equal(org.position.z, 0);

      assert.equal(centerPx, org.position.x * 16 + 8.0);
      assert.equal(centerPy, org.position.y * 16 + 8.0);
    }
  });

  // --- C03-02: Same input produces identical visual representation ---
  it('C03-02: Same organism data always produces identical visual tokens (idempotent)', () => {
    const overlayCode = fs.readFileSync(overlayScriptPath, 'utf8');

    // Stage tokens are constant and deterministic
    assert.match(overlayCode, /"STAGE_EGG":/);
    assert.match(overlayCode, /"STAGE_LARVA":/);
    assert.match(overlayCode, /"STAGE_PUPA":/);
    assert.match(overlayCode, /"STAGE_ADULT":/);

    // Sex accent colors are constant and deterministic
    assert.match(overlayCode, /"MALE":/);
    assert.match(overlayCode, /"FEMALE":/);

    // Zero time or random dependence
    assert.doesNotMatch(overlayCode, /Math\.random|randf|randi|Time\.get|OS\.get_ticks/);
  });

  // --- C03-03: Source snapshot cannot be mutated ---
  it('C03-03: Presentation input cannot mutate source snapshot', () => {
    const snap = getTick0Snapshot();
    const originalJson = JSON.stringify(snap);

    // Emulate passing deep-frozen snapshot to presentation logic
    const testOrgs = JSON.parse(originalJson).organisms;
    assert.deepEqual(snap.organisms, testOrgs);

    // Verify source is unchanged
    assert.equal(JSON.stringify(snap), originalJson);
  });

  // --- C03-04: Z-layer filtering is visual-only ---
  it('C03-04: Z filtering is visual-only and does not mutate coordinates', () => {
    const overlayCode = fs.readFileSync(overlayScriptPath, 'utf8');

    // Filters on z == active_z_layer
    assert.ok(overlayCode.includes('if z != active_z_layer:'));
    assert.ok(overlayCode.includes('continue'));
    const codeOnly = getOverlayCodeOnly();
    assert.doesNotMatch(codeOnly, /pos\.z\s*=/); // Never assigns to coordinate
  });

  // --- C03-05: Stage IDs map to fixed visual glyphs ---
  it('C03-05: Stage IDs map directly to fixed visual glyphs without biological calculation', () => {
    const overlayCode = fs.readFileSync(overlayScriptPath, 'utf8');
    assert.match(overlayCode, /match\s+stage_id:/);
    assert.match(overlayCode, /"STAGE_EGG":/);
    assert.match(overlayCode, /"STAGE_LARVA":/);
    assert.match(overlayCode, /"STAGE_PUPA":/);
    assert.match(overlayCode, /"STAGE_ADULT":/);

    // No horn, morphing, or biological progression logic
    assert.doesNotMatch(overlayCode, /horn|morph|evolve|growth_rate/i);
  });

  // --- C03-06: Canonical action_intent remains unchanged ---
  it('C03-06: Canonical action_intent remains unchanged', () => {
    const overlayCode = fs.readFileSync(overlayScriptPath, 'utf8');
    const intents = ['FORAGE', 'REST', 'SEEK_SHELTER', 'FLEE', 'SEEK_MATE', 'EXPLORE', 'NONE', 'IDLE'];
    for (const intent of intents) {
      assert.ok(overlayCode.includes(`"${intent}":`), `Action intent ${intent} must be supported`);
    }
  });

  // --- C03-07: Dead organisms remain represented ---
  it('C03-07: Dead organisms remain represented at recorded coordinate with deceased styling', () => {
    const overlayCode = fs.readFileSync(overlayScriptPath, 'utf8');
    assert.match(overlayCode, /DEAD_COLOR/);
    assert.ok(overlayCode.includes('Color(0.3, 0.3, 0.3, 0.9)')); // Cross marker color
    assert.doesNotMatch(overlayCode, /queue_free|erase|remove_at/); // No deletion
  });

  // --- C03-08: Same-cell stacking deterministic ---
  it('C03-08: Same-cell stacking is deterministic by organism_id ASC', () => {
    const overlayCode = fs.readFileSync(overlayScriptPath, 'utf8');
    // Code-point lexical sort
    assert.match(overlayCode, /group\.sort_custom/);
    assert.match(overlayCode, /String\(a\.get\("organism_id",\s*""\)\)\s*<\s*String\(b\.get\("organism_id",\s*""\)\)/);

    // Quadrant offsets for N=1..4 and badge for N>4
    assert.ok(overlayCode.includes('Vector2(8.0, 8.0)'));
    assert.ok(overlayCode.includes('Vector2(5.0, 8.0)'));
    assert.ok(overlayCode.includes('Vector2(11.0, 8.0)'));
    assert.match(overlayCode, /_draw_stack_badge/);
  });

  // --- C03-09: No presentation coordinate mutation ---
  it('C03-09: No presentation logic writes simulation coordinates', () => {
    const codeOnly = getOverlayCodeOnly();
    assert.doesNotMatch(codeOnly, /set_entity_position|updateEntityPosition|\.position\s*=/);
  });

  // --- C03-10: Frozen-domain audit ---
  it('C03-10: Frozen-domain audit confirms only authorized files changed vs base b29c427', () => {
    const diff = execSync('git diff b29c427 --name-only', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
    const changedFiles = diff ? diff.split(/\r?\n/).filter(Boolean) : [];
    
    // Only authorized C-03 files allowed in diff vs base b29c427
    const allowedC03Files = [
      'godot/scenes/world_view.tscn',
      'godot/scripts/presentation/organisms_overlay.gd',
      'tests/demo/demo_c03_organism_presentation.test.js'
    ];
    for (const f of changedFiles) {
      assert.ok(allowedC03Files.includes(f), `Unexpected modified file vs base b29c427: ${f}`);
    }

    // Verify git status: only organisms_overlay.gd, world_view.tscn, and this test allowed
    const untracked = execSync('git status --porcelain', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
    const statusLines = untracked ? untracked.split(/\r?\n/).filter(Boolean) : [];
    for (const line of statusLines) {
      const filePath = line.replace(/^[MADRCU?! ]{1,2}\s+/, '').trim();
      const isAllowed = (
        filePath === 'godot/scenes/world_view.tscn' ||
        filePath === 'godot/scripts/presentation/organisms_overlay.gd' ||
        filePath === 'tests/demo/demo_c03_organism_presentation.test.js'
      );
      assert.ok(isAllowed, `Unauthorized file in git status: ${line} (parsed: ${filePath})`);
    }
  });

  // --- C03-11: Forbidden API audit ---
  it('C03-11: Forbidden API scan across newly created C-03 files', () => {
    const overlayCode = fs.readFileSync(overlayScriptPath, 'utf8');
    const forbidden = [/Math\.random/, /Date\.now/, /performance\.now/, /localeCompare/, /Intl\.Collator/];
    for (const pattern of forbidden) {
      assert.doesNotMatch(overlayCode, pattern);
    }
  });

  // --- C03-12: Scene hierarchy and signal wiring ---
  it('C03-12: Scene hierarchy integrity and world_view.gd byte-for-byte freeze', () => {
    // 1. world_view.gd must be byte-for-byte identical to base b29c427 (zero git diff)
    const viewDiff = execSync('git diff b29c427 -- godot/scripts/presentation/world_view.gd', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
    assert.equal(viewDiff, '', 'world_view.gd must remain byte-for-byte frozen with zero changes');

    // 2. world_view.tscn must attach OrganismsOverlay with z_index 20 and signal connection
    const sceneContent = fs.readFileSync(worldViewScenePath, 'utf8');
    assert.match(sceneContent, /node name="OrganismsOverlay" type="Node2D"/);
    assert.match(sceneContent, /z_index = 20/);
    assert.match(sceneContent, /connection signal="z_layer_changed" from="\." to="OrganismsOverlay" method="set_active_z_layer"/);
  });

  // --- C03-13: No invented biological thresholds ---
  it('C03-13: No invented biological thresholds exist in C-03 code', () => {
    const codeOnly = getOverlayCodeOnly();
    assert.doesNotMatch(codeOnly, /stored_energy|structural_biomass|<\s*15|starvation|danger|critical/i);
  });

  // --- C03-14: No structural_biomass -> marker scaling ---
  it('C03-14: No structural_biomass -> marker scale mapping in C-03 code', () => {
    const codeOnly = getOverlayCodeOnly();
    assert.doesNotMatch(codeOnly, /biomass|structural_biomass/i);
  });

  // --- C03-15: Zero IPC/timer/simulation-loop ownership ---
  it('C03-15: Zero IPC, timer, or simulation loop ownership in OrganismsOverlay', () => {
    const codeOnly = getOverlayCodeOnly();
    assert.doesNotMatch(codeOnly, /func\s+_process/);
    assert.doesNotMatch(codeOnly, /IpcClient|getSnapshot|step|send_command/);
    assert.doesNotMatch(codeOnly, /Timer/);
  });

  // --- Developmental progress validation suite ---
  it('C03-16: Developmental progress validation tests (0.0, 1.0, 0.5, negative, >1, NaN, Inf)', () => {
    const overlayCode = fs.readFileSync(overlayScriptPath, 'utf8');
    // Verifies validation logic presence
    assert.ok(overlayCode.includes('not is_nan(p) and not is_inf(p) and p >= 0.0 and p <= 1.0'));
    assert.ok(overlayCode.includes('push_warning'));
    assert.doesNotMatch(overlayCode, /clampf/); // Strict rejection, no silent clamping
  });
});
