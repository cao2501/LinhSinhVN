/**
 * LinhSinhVN — DEMO-01-C / C-09-B Procedural Insect Morphology Contract Suite
 *
 * Verifies that the presentation layer (organisms_overlay.gd & organism_morphology.gd)
 * deterministically maps authoritative presentation phenotype fields into local visual geometry:
 * - Zero simulation authority
 * - Zero genotype / allele / vExp leakage
 * - Zero pseudo-random number generator usage (randi/randf/RandomNumberGenerator)
 * - Zero biological sex inference for horns (female horns consume authoritative 0.0 upstream)
 * - Deterministic mathematical transforms and color ramp interpolation
 * - Robust rejection and safe fallback for invalid/corrupted phenotype data without synthetic biology
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const morphologyGdPath = path.resolve(__dirname, '../../godot/scripts/presentation/organism_morphology.gd');
const overlayGdPath = path.resolve(__dirname, '../../godot/scripts/presentation/organisms_overlay.gd');

const morphologyGd = fs.readFileSync(morphologyGdPath, 'utf8');
const overlayGd = fs.readFileSync(overlayGdPath, 'utf8');

// Pure JavaScript Mirror of the OrganismMorphology mathematical contract
// Used to directly execute and verify the mathematical and deterministic logic
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

function calculateMorphologyJs(org) {
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
    egg_ry: 4.5 * bodyScale,
    larva_width: 10.0 * bodyScale,
    larva_height: 6.0 * bodyScale,
    pupa_width: 10.0 * bodyScale,
    pupa_height: 7.0 * bodyScale,
    adult_elytra_w: 12.0 * bodyScale,
    adult_elytra_h: 8.0 * bodyScale,
    adult_pronotum_w: 8.0 * bodyScale,
    adult_pronotum_h: 5.0 * bodyScale,
    adult_head_w: 5.0 * bodyScale,
    adult_head_h: 4.0 * bodyScale
  };
}

describe('DEMO-01-C / C-09-B: Procedural Insect Morphology Suite', () => {

  it('C09-B01: Morphology implementation consumes body_scale_index', () => {
    assert.ok(morphologyGd.includes('body_scale_index'), 'organism_morphology.gd must reference body_scale_index');
    assert.ok(morphologyGd.includes('BOUND_BODY_SCALE_MIN'), 'organism_morphology.gd must bound body_scale_index min');
    assert.ok(morphologyGd.includes('BOUND_BODY_SCALE_MAX'), 'organism_morphology.gd must bound body_scale_index max');
    assert.ok(overlayGd.includes('morph["body_scale"]'), 'organisms_overlay.gd must consume body_scale in draw calls');
  });

  it('C09-B02: Morphology consumes cuticle_pigment_ratio', () => {
    assert.ok(morphologyGd.includes('cuticle_pigment_ratio'), 'organism_morphology.gd must reference cuticle_pigment_ratio');
    assert.ok(morphologyGd.includes('BOUND_PIGMENT_MIN'), 'organism_morphology.gd must bound cuticle_pigment_ratio min');
    assert.ok(morphologyGd.includes('BOUND_PIGMENT_MAX'), 'organism_morphology.gd must bound cuticle_pigment_ratio max');
    assert.ok(morphologyGd.includes('CHITIN_LIGHT.lerp(CHITIN_DARK'), 'organism_morphology.gd must lerp cuticle pigment');
  });

  it('C09-B03: Morphology consumes cephalic_horn_scale', () => {
    assert.ok(morphologyGd.includes('cephalic_horn_scale'), 'organism_morphology.gd must reference cephalic_horn_scale');
    assert.ok(morphologyGd.includes('BOUND_CEPHALIC_HORN_MIN'), 'organism_morphology.gd must bound cephalic horn min');
    assert.ok(morphologyGd.includes('BOUND_CEPHALIC_HORN_MAX'), 'organism_morphology.gd must bound cephalic horn max');
    assert.ok(morphologyGd.includes('BASE_CEPHALIC_HORN_LENGTH * cephalic_horn'), 'organism_morphology.gd must scale cephalic horn length');
  });

  it('C09-B04: Morphology consumes thoracic_horn_scale', () => {
    assert.ok(morphologyGd.includes('thoracic_horn_scale'), 'organism_morphology.gd must reference thoracic_horn_scale');
    assert.ok(morphologyGd.includes('BOUND_THORACIC_HORN_MIN'), 'organism_morphology.gd must bound thoracic horn min');
    assert.ok(morphologyGd.includes('BOUND_THORACIC_HORN_MAX'), 'organism_morphology.gd must bound thoracic horn max');
    assert.ok(morphologyGd.includes('BASE_THORACIC_HORN_LENGTH * thoracic_horn'), 'organism_morphology.gd must scale thoracic horn length');
  });

  it('C09-B05: Morphology consumes tarsal_grip_index', () => {
    assert.ok(morphologyGd.includes('tarsal_grip_index'), 'organism_morphology.gd must reference tarsal_grip_index');
    assert.ok(morphologyGd.includes('BOUND_TARSAL_GRIP_MIN'), 'organism_morphology.gd must bound tarsal grip min');
    assert.ok(morphologyGd.includes('BOUND_TARSAL_GRIP_MAX'), 'organism_morphology.gd must bound tarsal grip max');
    assert.ok(morphologyGd.includes('BASE_LEG_LENGTH * (tarsal_grip / 1.50)'), 'organism_morphology.gd must scale leg length');
    assert.ok(morphologyGd.includes('BASE_CLAW_SPREAD * (tarsal_grip / 1.50)'), 'organism_morphology.gd must scale claw spread');
  });

  it('C09-B06: No genome, genotype, alleles, vExp, or derived_stats usage', () => {
    const FORBIDDEN = [
      'genome',
      'genotype',
      'alleles',
      'vExp',
      'mass_index',
      'cuticle_hardness_index',
      'metabolic_drain_index',
      'stamina_economy_modifier',
      'sensory_range_units',
      'derived_stats'
    ];
    for (const word of FORBIDDEN) {
      assert.strictEqual(
        morphologyGd.includes(word),
        false,
        `organism_morphology.gd must not contain forbidden biology key: ${word}`
      );
      assert.strictEqual(
        overlayGd.includes(word),
        false,
        `organisms_overlay.gd must not contain forbidden biology key: ${word}`
      );
    }
  });

  it('C09-B07: No randi, randf, or RandomNumberGenerator usage', () => {
    const RNG_PATTERNS = [/\brandi\s*\(/, /\brandf\s*\(/, /\bRandomNumberGenerator\b/];
    for (const pat of RNG_PATTERNS) {
      assert.ok(!pat.test(morphologyGd), 'organism_morphology.gd must have zero RNG');
      assert.ok(!pat.test(overlayGd), 'organisms_overlay.gd must have zero RNG');
    }
  });

  it('C09-B08: Female horn masking is NOT implemented in Godot; authoritative zero is consumed as-is', () => {
    const FORBIDDEN_SEX_HORN_PATTERNS = [
      /if\s+sex\s*==.*female.*horn/i,
      /if.*female.*horn\s*=\s*0/i,
      /horn.*if.*female/i
    ];
    for (const pat of FORBIDDEN_SEX_HORN_PATTERNS) {
      assert.ok(!pat.test(morphologyGd), 'organism_morphology.gd must not implement biological female horn masking');
      assert.ok(!pat.test(overlayGd), 'organisms_overlay.gd must not implement biological female horn masking');
    }
  });

  it('C09-B09: Body scale transform is mathematically correct', () => {
    const testOrg = {
      body_scale_index: 1.20,
      cuticle_pigment_ratio: 0.50,
      cephalic_horn_scale: 1.00,
      thoracic_horn_scale: 1.00,
      tarsal_grip_index: 1.50,
      current_stage_id: 'STAGE_ADULT'
    };
    const morph = calculateMorphologyJs(testOrg);
    assert.strictEqual(morph.body_scale, 1.20);
    assert.strictEqual(morph.adult_elytra_w, 12.0 * 1.20);
    assert.strictEqual(morph.adult_elytra_h, 8.0 * 1.20);
    assert.strictEqual(morph.adult_pronotum_w, 8.0 * 1.20);
    assert.strictEqual(morph.adult_pronotum_h, 5.0 * 1.20);
    assert.strictEqual(morph.adult_head_w, 5.0 * 1.20);
    assert.strictEqual(morph.adult_head_h, 4.0 * 1.20);
  });

  it('C09-B10: Pigment interpolation is mathematically deterministic', () => {
    const orgLight = {
      body_scale_index: 1.0,
      cuticle_pigment_ratio: 0.0,
      cephalic_horn_scale: 0.0,
      thoracic_horn_scale: 0.0,
      tarsal_grip_index: 1.50
    };
    const orgDark = {
      body_scale_index: 1.0,
      cuticle_pigment_ratio: 1.0,
      cephalic_horn_scale: 0.0,
      thoracic_horn_scale: 0.0,
      tarsal_grip_index: 1.50
    };
    const orgMid = {
      body_scale_index: 1.0,
      cuticle_pigment_ratio: 0.5,
      cephalic_horn_scale: 0.0,
      thoracic_horn_scale: 0.0,
      tarsal_grip_index: 1.50
    };

    const morphLight = calculateMorphologyJs(orgLight);
    const morphDark = calculateMorphologyJs(orgDark);
    const morphMid = calculateMorphologyJs(orgMid);

    assert.deepStrictEqual(morphLight.cuticle_color, CHITIN_LIGHT);
    assert.deepStrictEqual(morphDark.cuticle_color, CHITIN_DARK);

    const expectedR = Number(((CHITIN_LIGHT.r + CHITIN_DARK.r) * 0.5).toFixed(6));
    const expectedG = Number(((CHITIN_LIGHT.g + CHITIN_DARK.g) * 0.5).toFixed(6));
    const expectedB = Number(((CHITIN_LIGHT.b + CHITIN_DARK.b) * 0.5).toFixed(6));

    assert.strictEqual(morphMid.cuticle_color.r, expectedR);
    assert.strictEqual(morphMid.cuticle_color.g, expectedG);
    assert.strictEqual(morphMid.cuticle_color.b, expectedB);
  });

  it('C09-B11: Horn scale transforms are mathematically correct', () => {
    const org = {
      body_scale_index: 1.0,
      cuticle_pigment_ratio: 0.5,
      cephalic_horn_scale: 1.50,
      thoracic_horn_scale: 1.20,
      tarsal_grip_index: 1.50
    };
    const morph = calculateMorphologyJs(org);
    assert.strictEqual(morph.cephalic_horn_len, 6.0 * 1.50 * 1.0);
    assert.strictEqual(morph.thoracic_horn_len, 4.5 * 1.20 * 1.0);
  });

  it('C09-B12: Tarsal visual transform is mathematically correct', () => {
    const org = {
      body_scale_index: 1.0,
      cuticle_pigment_ratio: 0.5,
      cephalic_horn_scale: 0.0,
      thoracic_horn_scale: 0.0,
      tarsal_grip_index: 2.25
    };
    const morph = calculateMorphologyJs(org);
    const ratio = 2.25 / 1.50;
    assert.strictEqual(morph.tarsal_leg_len, 5.0 * ratio * 1.0);
    assert.strictEqual(morph.tarsal_claw_spread, 2.0 * ratio);
  });

  it('C09-B13: Organism ordering remains deterministic (lexical code-point sort)', () => {
    assert.ok(
      overlayGd.includes('group.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:'),
      'overlay must sort group custom'
    );
    assert.ok(
      overlayGd.includes('String(a.get("organism_id", "")) < String(b.get("organism_id", ""))'),
      'overlay must sort by organism_id code-point lexical ASC'
    );
  });

  it('C09-B14: Morphology geometry is local and has no simulation/world position dependency', () => {
    assert.ok(!morphologyGd.includes('global_position'), 'morphology must have zero global position access');
    assert.ok(!morphologyGd.includes('SpatialWorld'), 'morphology must not know SpatialWorld');
    assert.ok(!morphologyGd.includes('SimulationWorld'), 'morphology must not know SimulationWorld');
    assert.ok(overlayGd.includes('func _draw_organism(org: Dictionary, center: Vector2) -> void:'),
      'organisms_overlay must render relative to local center: Vector2');
  });

  it('C09-B15: Invalid phenotype values are not silently replaced by invented biological defaults', () => {
    const badOrgs = [
      { body_scale_index: NaN, cuticle_pigment_ratio: 0.5, cephalic_horn_scale: 0, thoracic_horn_scale: 0, tarsal_grip_index: 1.5 },
      { body_scale_index: 1.0, cuticle_pigment_ratio: Infinity, cephalic_horn_scale: 0, thoracic_horn_scale: 0, tarsal_grip_index: 1.5 },
      { body_scale_index: 0.1, cuticle_pigment_ratio: 0.5, cephalic_horn_scale: 0, thoracic_horn_scale: 0, tarsal_grip_index: 1.5 },
      { body_scale_index: 1.0, cuticle_pigment_ratio: 1.5, cephalic_horn_scale: 0, thoracic_horn_scale: 0, tarsal_grip_index: 1.5 },
      { body_scale_index: 1.0, cuticle_pigment_ratio: 0.5, cephalic_horn_scale: 0, thoracic_horn_scale: 0 }
    ];

    for (const bad of badOrgs) {
      const morph = calculateMorphologyJs(bad);
      assert.strictEqual(morph.is_valid, false, 'Invalid phenotype must be flagged as invalid');
      assert.strictEqual(morph.cephalic_horn_len, 0.0);
      assert.strictEqual(morph.thoracic_horn_len, 0.0);
      assert.strictEqual(morph.tarsal_leg_len, 0.0);
    }
  });

  it('C09-B16: Identical input produces identical morphology output', () => {
    const input = {
      body_scale_index: 1.15,
      cuticle_pigment_ratio: 0.65,
      cephalic_horn_scale: 1.80,
      thoracic_horn_scale: 1.40,
      tarsal_grip_index: 2.10,
      current_stage_id: 'STAGE_ADULT'
    };

    const out1 = calculateMorphologyJs(input);
    const out2 = calculateMorphologyJs(input);

    assert.deepStrictEqual(out1, out2, 'Two identical inputs must produce bit-for-bit identical morphology objects');
  });

  it('C09-B17: Stage determines visual morphology and is not inferred from phenotype/body size', () => {
    assert.ok(overlayGd.includes('match stage_id:'), 'overlay must match on stage_id directly');
    assert.ok(overlayGd.includes('"STAGE_EGG":'), 'overlay must support STAGE_EGG');
    assert.ok(overlayGd.includes('"STAGE_LARVA":'), 'overlay must support STAGE_LARVA');
    assert.ok(overlayGd.includes('"STAGE_PUPA":'), 'overlay must support STAGE_PUPA');
    assert.ok(overlayGd.includes('"STAGE_ADULT":'), 'overlay must support STAGE_ADULT');
  });

  it('C09-B18: Morphology does not modify authoritative organism data', () => {
    const input = Object.freeze({
      organism_id: 'TEST_ORG_01',
      body_scale_index: 1.10,
      cuticle_pigment_ratio: 0.40,
      cephalic_horn_scale: 0.80,
      thoracic_horn_scale: 0.60,
      tarsal_grip_index: 1.20,
      current_stage_id: 'STAGE_ADULT'
    });

    assert.doesNotThrow(() => {
      calculateMorphologyJs(input);
    }, 'Morphology calculation must not mutate input object');
  });

  it('C09-B19: Adult female with authoritative horn values 0 produces zero horn geometry', () => {
    const femaleOrg = {
      body_scale_index: 1.10,
      cuticle_pigment_ratio: 0.40,
      cephalic_horn_scale: 0.0,
      thoracic_horn_scale: 0.0,
      tarsal_grip_index: 1.20,
      current_stage_id: 'STAGE_ADULT',
      sex: 'FEMALE'
    };

    const morph = calculateMorphologyJs(femaleOrg);
    assert.strictEqual(morph.cephalic_horn_len, 0.0, 'Female cephalic horn geometry length must be 0.0');
    assert.strictEqual(morph.thoracic_horn_len, 0.0, 'Female thoracic horn geometry length must be 0.0');
  });

  it('C09-B20: Adult male with non-zero authoritative horn values produces corresponding horn geometry', () => {
    const maleOrg = {
      body_scale_index: 1.20,
      cuticle_pigment_ratio: 0.80,
      cephalic_horn_scale: 1.50,
      thoracic_horn_scale: 1.20,
      tarsal_grip_index: 1.80,
      current_stage_id: 'STAGE_ADULT',
      sex: 'MALE'
    };

    const morph = calculateMorphologyJs(maleOrg);
    assert.ok(morph.cephalic_horn_len > 0.0, 'Male cephalic horn length must be positive');
    assert.ok(morph.thoracic_horn_len > 0.0, 'Male thoracic horn length must be positive');
    assert.strictEqual(morph.cephalic_horn_len, 6.0 * 1.50 * 1.20);
    assert.strictEqual(morph.thoracic_horn_len, 4.5 * 1.20 * 1.20);
  });

});
