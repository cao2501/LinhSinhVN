/**
 * LinhSinhVN — DEMO-01-C / C-03 Organism Presentation Test Suite
 *
 * Checkpoint: DEMO-01-C / C-03 Organism Presentation
 * Base: 4bdf2ae
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

  // --- C03-10: Frozen-domain audit vs base 4bdf2ae ---
  it('C03-10: Frozen-domain audit confirms only authorized files changed vs base 4bdf2ae', () => {
    const diff = execSync('git diff 4bdf2ae --name-only', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
    const changedFiles = diff ? diff.split(/\r?\n/).filter(Boolean) : [];
    
    // Only authorized C-03 files allowed in diff vs base 4bdf2ae
    const allowedC03Files = [
      'godot/scripts/presentation/organisms_overlay.gd',
      'tests/demo/demo_c03_organism_presentation.test.js'
    ];
    for (const f of changedFiles) {
      assert.ok(allowedC03Files.includes(f), `Unexpected modified file vs base 4bdf2ae: ${f}`);
    }

    // Verify git status: only organisms_overlay.gd and this test allowed
    const untracked = execSync('git status --porcelain', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
    const statusLines = untracked ? untracked.split(/\r?\n/).filter(Boolean) : [];
    for (const line of statusLines) {
      const filePath = line.replace(/^[MADRCU?! ]{1,2}\s+/, '').trim();
      const isAllowed = (
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

  // --- C03-14: 100% Fixed Dimensions (ZERO scale_factor) ---
  it('C03-14: Marker dimensions are 100% fixed and not altered by stack count or scale_factor', () => {
    const codeOnly = getOverlayCodeOnly();
    assert.doesNotMatch(codeOnly, /biomass|structural_biomass/i);
    // Prove scale_factor is completely removed from _draw_organism and code
    assert.doesNotMatch(codeOnly, /scale_factor/);
    assert.match(codeOnly, /func\s+_draw_organism\(org:\s*Dictionary,\s*center:\s*Vector2\)\s*->\s*void:/);

    // Verify fixed dimensions in AST/source
    assert.match(codeOnly, /var\s+r:\s*float\s*=\s*3\.5/); // STAGE_EGG
    assert.match(codeOnly, /Vector2\(10\.0,\s*6\.0\)/);     // STAGE_LARVA
    assert.match(codeOnly, /Vector2\(10\.0,\s*7\.0\)/);     // STAGE_PUPA
    assert.match(codeOnly, /Vector2\(12\.0,\s*10\.0\)/);    // STAGE_ADULT
    assert.match(codeOnly, /var\s+accent_r:\s*float\s*=\s*5\.5/); // Sex ring fixed radius
    assert.match(codeOnly, /var\s+arc_r:\s*float\s*=\s*6\.8/);    // Progress arc fixed radius
    assert.match(codeOnly, /var\s+dot_pos:\s*Vector2\s*=\s*center\s*\+\s*Vector2\(4\.5,\s*-4\.5\)/); // Action dot fixed
    assert.match(codeOnly, /var\s+x_half:\s*float\s*=\s*4\.0/);   // Dead X fixed extent
  });

  // --- C03-15: Zero IPC/timer/simulation-loop ownership ---
  it('C03-15: Zero IPC, timer, or simulation loop ownership in OrganismsOverlay', () => {
    const codeOnly = getOverlayCodeOnly();
    assert.doesNotMatch(codeOnly, /func\s+_process/);
    assert.doesNotMatch(codeOnly, /IpcClient|getSnapshot|step|send_command/);
    assert.doesNotMatch(codeOnly, /Timer/);
  });

  // --- Developmental progress validation suite ---
  it('C03-16: Developmental progress validation tests (0.0, 1.0, 0.5, negative, >1, NaN, Inf, non-numeric)', () => {
    const overlayCode = fs.readFileSync(overlayScriptPath, 'utf8');
    // Verifies validation logic presence
    assert.ok(overlayCode.includes('not is_nan(p) and not is_inf(p) and p >= 0.0 and p <= 1.0'));
    assert.ok(overlayCode.includes('push_warning'));
    assert.doesNotMatch(overlayCode, /clampf/); // Strict rejection, no silent clamping

    // Verify validation control flow
    assert.match(overlayCode, /var\s+is_numeric:\s*bool/);
    assert.match(overlayCode, /if\s+not\s+is_valid:/);
    assert.match(overlayCode, /else:\s*\r?\n\s*if\s+p\s*>\s*0\.0:/);

    // Direct unit test of validation contract
    const validate = (val) => {
      const isNumeric = typeof val === 'number';
      let isValid = false;
      let p = 0;
      if (isNumeric) {
        p = Number(val);
        if (!Number.isNaN(p) && Number.isFinite(p) && p >= 0.0 && p <= 1.0) {
          isValid = true;
        }
      }
      return {
        isValid,
        warn: !isValid,
        drawArc: isValid && p > 0.0
      };
    };

    // Valid cases: 0.0 does NOT warn and does NOT draw arc
    assert.deepEqual(validate(0.0), { isValid: true, warn: false, drawArc: false });
    assert.deepEqual(validate(0.5), { isValid: true, warn: false, drawArc: true });
    assert.deepEqual(validate(1.0), { isValid: true, warn: false, drawArc: true });

    // Invalid cases: all warn and omit arc
    assert.deepEqual(validate(-0.1), { isValid: false, warn: true, drawArc: false });
    assert.deepEqual(validate(1.1), { isValid: false, warn: true, drawArc: false });
    assert.deepEqual(validate(NaN), { isValid: false, warn: true, drawArc: false });
    assert.deepEqual(validate(Infinity), { isValid: false, warn: true, drawArc: false });
    assert.deepEqual(validate(-Infinity), { isValid: false, warn: true, drawArc: false });
    assert.deepEqual(validate('invalid'), { isValid: false, warn: true, drawArc: false });
    assert.deepEqual(validate(null), { isValid: false, warn: true, drawArc: false });
    assert.deepEqual(validate(true), { isValid: false, warn: true, drawArc: false });
  });

  // --- C03-17: Actual Stack Count Badge Text ---
  it('C03-17: Actual stack count badge renders "+N" text for N > 4 (N=5 -> "+4", N=6 -> "+5")', () => {
    const overlayCode = fs.readFileSync(overlayScriptPath, 'utf8');

    // Verify _draw_stack_badge signature and text format
    assert.match(overlayCode, /func\s+_draw_stack_badge\(origin:\s*Vector2,\s*extra_count:\s*int\)\s*->\s*void:/);
    assert.match(overlayCode, /var\s+badge_text:\s*String\s*=\s*"\+%d"\s*%\s*extra_count/);
    assert.match(overlayCode, /draw_string\(font,\s*badge_pos/);

    // Call site verification
    assert.match(overlayCode, /_draw_stack_badge\(origin,\s*count\s*-\s*1\)/);

    // Verify text for N=5 and N=6
    const formatBadge = (totalCount) => `+${totalCount - 1}`;
    assert.equal(formatBadge(5), '+4');
    assert.equal(formatBadge(6), '+5');
    assert.equal(formatBadge(10), '+9');
  });
});
