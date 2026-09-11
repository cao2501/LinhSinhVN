/**
 * LinhSinhVN — Expression Rules & Derived Stats Regression Suite
 * 
 * Tests the 8 individual expression rules and 9 derived stats formulas
 * against independently hand-calculated golden fixtures.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGenome,
  calculateGeneExpression,
  calculatePhenotype,
  calculateDerivedStats,
  SEX
} from '../../game/genetics/index.js';

describe('Gene Expression Rules & Derived Stats Golden Fixtures', () => {

  it('Gene Expression: evaluates all 8 loci with independent mathematical precision', () => {
    const genome = createGenome('xylotrupes_rhinoceros_proto', {
      LOCUS_BODY_SCALE: [0.30, 0.70],           // avg = 0.50
      LOCUS_CHITIN_DENSITY: [0.20, 0.80],       // 0.4(0.2) + 0.6(0.8) = 0.08 + 0.48 = 0.56
      LOCUS_CEPHALIC_HORN: [0.40, 0.60],        // avg = 0.50 (male) / 0.0 (female)
      LOCUS_THORACIC_HORN: [0.30, 0.70],        // avg = 0.50 (male) / 0.0 (female)
      LOCUS_TARSAL_CLAW: [0.40, 0.80],          // avg = 0.60
      LOCUS_METABOLIC_EFFICIENCY: [0.20, 0.80], // avg = 0.50
      LOCUS_CUTICLE_PIGMENT: [0.10, 0.90],      // avg = 0.50
      LOCUS_ANTENNAL_CLUB: [0.20, 0.80]         // 0.7(0.8) + 0.3(0.2) = 0.56 + 0.06 = 0.62
    });

    // 1. Male expression
    const maleExp = calculateGeneExpression(genome, SEX.MALE);
    assert.ok(Math.abs(maleExp.LOCUS_BODY_SCALE - 0.50) < 1e-9, 'BODY_SCALE must be average');
    assert.ok(Math.abs(maleExp.LOCUS_CHITIN_DENSITY - 0.56) < 1e-9, 'CHITIN_DENSITY must be 0.4*min + 0.6*max');
    assert.ok(Math.abs(maleExp.LOCUS_CEPHALIC_HORN - 0.50) < 1e-9, 'Male CEPHALIC_HORN must be average');
    assert.ok(Math.abs(maleExp.LOCUS_THORACIC_HORN - 0.50) < 1e-9, 'Male THORACIC_HORN must be average');
    assert.ok(Math.abs(maleExp.LOCUS_TARSAL_CLAW - 0.60) < 1e-9, 'TARSAL_CLAW must be average');
    assert.ok(Math.abs(maleExp.LOCUS_METABOLIC_EFFICIENCY - 0.50) < 1e-9, 'METABOLIC_EFFICIENCY must be average');
    assert.ok(Math.abs(maleExp.LOCUS_CUTICLE_PIGMENT - 0.50) < 1e-9, 'CUTICLE_PIGMENT must be average');
    assert.ok(Math.abs(maleExp.LOCUS_ANTENNAL_CLUB - 0.62) < 1e-9, 'ANTENNAL_CLUB must be 0.7*max + 0.3*min');

    // 2. Female expression (horn suppression)
    const femaleExp = calculateGeneExpression(genome, SEX.FEMALE);
    assert.strictEqual(femaleExp.LOCUS_CEPHALIC_HORN, 0.0, 'Female CEPHALIC_HORN must be 0.0');
    assert.strictEqual(femaleExp.LOCUS_THORACIC_HORN, 0.0, 'Female THORACIC_HORN must be 0.0');
    assert.strictEqual(femaleExp.LOCUS_BODY_SCALE, 0.50, 'Female non-horn loci unaffected');
  });

  it('Phenotype Mapping: Golden calculation with developmental realization cascade', () => {
    // Genome with all loci = [0.5, 0.5]
    const baselineGenome = createGenome('xylotrupes_rhinoceros_proto', {
      LOCUS_BODY_SCALE: [0.5, 0.5],           // V_exp = 0.50
      LOCUS_CHITIN_DENSITY: [0.5, 0.5],       // V_exp = 0.50
      LOCUS_CEPHALIC_HORN: [0.5, 0.5],        // V_exp = 0.50
      LOCUS_THORACIC_HORN: [0.5, 0.5],        // V_exp = 0.50
      LOCUS_TARSAL_CLAW: [0.5, 0.5],          // V_exp = 0.50
      LOCUS_METABOLIC_EFFICIENCY: [0.5, 0.5], // V_exp = 0.50
      LOCUS_CUTICLE_PIGMENT: [0.5, 0.5],      // V_exp = 0.50
      LOCUS_ANTENNAL_CLUB: [0.5, 0.5]         // V_exp = 0.50
    });

    // Unstunted male (eta = 1.0)
    const malePt = calculatePhenotype(baselineGenome, SEX.MALE, 1.0);

    // Expected values from GENETICS_SPEC.md Table 6:
    // body_scale_index = 0.70 + (0.50 * 0.80) = 1.10
    assert.strictEqual(malePt.body_scale_index, 1.10);

    // mass_index = (0.80 + 0.50 * 1.0) * (1.0 + 0.50 * 0.2) = 1.30 * 1.10 = 1.43
    assert.strictEqual(Number(malePt.mass_index.toFixed(4)), 1.4300);

    // cuticle_hardness_index = 1.0 + (0.50 * 2.0) = 2.00
    assert.strictEqual(malePt.cuticle_hardness_index, 2.00);

    // cephalic_horn_scale = (0.50^1.2) * 1.50 * 1.10 = 0.435275281648062 * 1.65 = 0.7182042147193024
    assert.ok(Math.abs(malePt.cephalic_horn_scale - 0.718204) < 1e-4);

    // thoracic_horn_scale = 0.50 * 1.20 * 1.10 = 0.66
    assert.strictEqual(Number(malePt.thoracic_horn_scale.toFixed(4)), 0.6600);

    // tarsal_grip_index = 0.80 + (0.50 * 1.20) + (0.50 * 0.50) = 0.80 + 0.60 + 0.25 = 1.65
    assert.strictEqual(malePt.tarsal_grip_index, 1.65);

    // metabolic_drain_index = (1.40 - 0.50 * 0.60) * (1.43^0.3) = 1.10 * 1.11295 = 1.22424...
    assert.ok(Math.abs(malePt.metabolic_drain_index - 1.22424) < 1e-3);

    // stamina_economy_modifier = 0.80 + (0.50 * 0.50) = 1.05
    assert.strictEqual(malePt.stamina_economy_modifier, 1.05);

    // sensory_range_units = 15.0 + (0.50 * 45.0) = 37.5
    assert.strictEqual(malePt.sensory_range_units, 37.5);

    // cuticle_pigment_ratio = 0.50
    assert.strictEqual(malePt.cuticle_pigment_ratio, 0.50);
  });

  it('Derived Stats: Golden formula calculations from known phenotype fixture', () => {
    const fixturePhenotype = {
      schema_version: '1.1.0',
      sex: SEX.MALE,
      body_scale_index: 1.10,
      mass_index: 1.20,
      cuticle_hardness_index: 1.80,
      cephalic_horn_scale: 0.80,
      thoracic_horn_scale: 0.60,
      tarsal_grip_index: 1.50,
      metabolic_drain_index: 0.90,
      stamina_economy_modifier: 1.10,
      sensory_range_units: 35.0,
      cuticle_pigment_ratio: 0.40
    };

    const stats = calculateDerivedStats(fixturePhenotype);

    // 1. max_hp = 100 + (1.2 * 50) + (1.8 * 20) = 100 + 60 + 36 = 196.0
    assert.strictEqual(stats.max_hp, 196.0, 'max_hp formula check');

    // 2. clash_power = (0.8 * 50) + (1.5 * 25) = 40 + 37.5 = 77.5
    assert.strictEqual(stats.clash_power, 77.5, 'clash_power formula check');

    // 3. armor_reduction = ((1.8 - 1.0)/2.0) * 0.50 = 0.4 * 0.50 = 0.20
    assert.strictEqual(stats.armor_reduction, 0.20, 'armor_reduction formula check');

    // 4. crawl_speed = (10.0 + 1.5 * 3.0) * (1.0 / 1.2)^0.35 = 14.5 * 0.93818085 = 13.6036...
    assert.ok(Math.abs(stats.crawl_speed - 13.6036) < 1e-3, 'crawl_speed formula check');

    // 5. max_stamina = 80 + (1.2 * 25) - (0.8 * 15) = 80 + 30 - 12 = 98.0
    assert.strictEqual(stats.max_stamina, 98.0, 'max_stamina formula check');

    // 6. action_stamina_cost = 10.0 / 1.10 = 9.090909...
    assert.ok(Math.abs(stats.action_stamina_cost - (10.0 / 1.10)) < 1e-9, 'action_stamina_cost formula check');

    // 7. stamina_regen_rate = 5.0 + (1.10 * 2.0) = 7.20
    assert.strictEqual(stats.stamina_regen_rate, 7.20, 'stamina_regen_rate formula check');

    // 8. perception_radius = 35.0
    assert.strictEqual(stats.perception_radius, 35.0, 'perception_radius formula check');

    // 9. starvation_endurance_time = (1.20 * 100.0) / 0.90 = 133.333333...
    assert.ok(Math.abs(stats.starvation_endurance_time - 133.3333) < 1e-3, 'starvation_endurance_time check');
  });
});
