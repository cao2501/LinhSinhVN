/**
 * LinhSinhVN — Tests for Reproduction Eligibility Evaluator
 *
 * Verifies all eligibility constraints:
 * - Dead parent rejection
 * - Species mismatch rejection
 * - Incompatible sex combination rejection
 * - Non-reproductive stage rejection
 * - Underage adult rejection
 * - Cooldown active rejection
 * - Insufficient energy rejection
 * - Overstressed parent rejection
 * - Success when all criteria are satisfied
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadSpeciesProfile } from '../../game/lifecycle/profile_loader.js';
import { createOrganismState } from '../../game/lifecycle/organism_state.js';
import { evaluateReproductionEligibility } from '../../game/reproduction/eligibility.js';
import { ELIGIBILITY_REASONS } from '../../game/reproduction/constants.js';

describe('Reproduction Eligibility Evaluator', () => {
  const profile = loadSpeciesProfile('data/species/xylotrupes_rhinoceros_proto.json');

  const baseGenome = {
    species_id: 'xylotrupes_rhinoceros_proto',
    loci: {
      LOCUS_BODY_SCALE: [0.5, 0.5],
      LOCUS_CHITIN_DENSITY: [0.5, 0.5],
      LOCUS_CEPHALIC_HORN: [0.5, 0.5],
      LOCUS_THORACIC_HORN: [0.5, 0.5],
      LOCUS_TARSAL_CLAW: [0.5, 0.5],
      LOCUS_METABOLIC_EFFICIENCY: [0.5, 0.5],
      LOCUS_CUTICLE_PIGMENT: [0.5, 0.5],
      LOCUS_ANTENNAL_CLUB: [0.5, 0.5]
    }
  };

  const basePhenotype = {
    body_scale_index: 1.10,
    mass_index: 1.40,
    cuticle_hardness_index: 2.0,
    cephalic_horn_scale: 0.80,
    thoracic_horn_scale: 0.60,
    tarsal_grip_index: 1.65,
    metabolic_drain_index: 1.00,
    stamina_economy_modifier: 1.05,
    sensory_range_units: 37.5,
    cuticle_pigment_ratio: 0.50,
    developmental_realization_factor: 1.00
  };

  const baseDerivedStats = {
    max_hp: 210.0,
    clash_power: 81.25,
    armor_reduction: 0.25,
    crawl_speed: 13.15,
    max_stamina: 103.0,
    action_stamina_cost: 9.52,
    stamina_regen_rate: 7.10,
    perception_radius: 37.5,
    starvation_endurance_time: 140.0
  };

  function createAdult(id, sex, overrides = {}) {
    const state = createOrganismState({
      organismId: id,
      speciesProfile: profile,
      generation: 1,
      sex,
      genome: baseGenome,
      phenotype: basePhenotype,
      derivedStats: baseDerivedStats,
      simulationSeed: '0x024aa8a38b63e1b2'
    });
    state.current_stage_id = 'STAGE_ADULT';
    state.current_substage_id = null;
    state.stage_age_ticks = 150; // > min_mating_age_ticks (100)
    state.nutrition_state.stored_energy = 80.0; // > cost (40.0)

    Object.assign(state, overrides);
    return state;
  }

  test('Eligible compatible adult pair passes evaluation', () => {
    const female = createAdult('female_01', 'FEMALE');
    const male = createAdult('male_01', 'MALE');

    const result = evaluateReproductionEligibility(female, male, profile, 200);
    assert.equal(result.eligible, true);
    assert.equal(result.reasons.length, 0);
  });

  test('Dead parent is rejected', () => {
    const female = createAdult('female_dead', 'FEMALE', { is_alive: false, status: 'DEAD' });
    const male = createAdult('male_alive', 'MALE');

    const result = evaluateReproductionEligibility(female, male, profile, 200);
    assert.equal(result.eligible, false);
    assert.ok(result.reasons.includes(ELIGIBILITY_REASONS.ORGANISM_NOT_ALIVE));
  });

  test('Incompatible species is rejected', () => {
    const female = createAdult('female_wrong_sp', 'FEMALE', { species_id: 'other_species' });
    const male = createAdult('male_alive', 'MALE');

    const result = evaluateReproductionEligibility(female, male, profile, 200);
    assert.equal(result.eligible, false);
    assert.ok(result.reasons.includes(ELIGIBILITY_REASONS.SPECIES_INCOMPATIBLE));
  });

  test('Incompatible sex combination (MALE + MALE or FEMALE + FEMALE) is rejected', () => {
    const male1 = createAdult('male_01', 'MALE');
    const male2 = createAdult('male_02', 'MALE');

    const resultMale = evaluateReproductionEligibility(male1, male2, profile, 200);
    assert.equal(resultMale.eligible, false);
    assert.ok(resultMale.reasons.includes(ELIGIBILITY_REASONS.SEX_INCOMPATIBLE));

    const female1 = createAdult('female_01', 'FEMALE');
    const female2 = createAdult('female_02', 'FEMALE');

    const resultFemale = evaluateReproductionEligibility(female1, female2, profile, 200);
    assert.equal(resultFemale.eligible, false);
    assert.ok(resultFemale.reasons.includes(ELIGIBILITY_REASONS.SEX_INCOMPATIBLE));
  });

  test('Non-reproductive lifecycle stage (e.g. LARVA) is rejected', () => {
    const larvaFemale = createAdult('larva_f', 'FEMALE', { current_stage_id: 'STAGE_LARVA' });
    const adultMale = createAdult('adult_m', 'MALE');

    const result = evaluateReproductionEligibility(larvaFemale, adultMale, profile, 200);
    assert.equal(result.eligible, false);
    assert.ok(result.reasons.includes(ELIGIBILITY_REASONS.STAGE_INCOMPATIBLE));
  });

  test('Adult below minimum mating age is rejected', () => {
    const youngFemale = createAdult('young_f', 'FEMALE', { stage_age_ticks: 50 }); // < 100
    const adultMale = createAdult('adult_m', 'MALE');

    const result = evaluateReproductionEligibility(youngFemale, adultMale, profile, 200);
    assert.equal(result.eligible, false);
    assert.ok(result.reasons.includes(ELIGIBILITY_REASONS.AGE_INSUFFICIENT));
  });

  test('Parent under active cooldown is rejected', () => {
    const female = createAdult('cooldown_f', 'FEMALE', { reproduction_cooldown_until_tick: 500 });
    const male = createAdult('male_01', 'MALE', { reproduction_cooldown_until_tick: 0 });

    const resultAtTick400 = evaluateReproductionEligibility(female, male, profile, 400); // 400 < 500
    assert.equal(resultAtTick400.eligible, false);
    assert.ok(resultAtTick400.reasons.includes(ELIGIBILITY_REASONS.COOLDOWN_ACTIVE));

    const resultAtTick500 = evaluateReproductionEligibility(female, male, profile, 500); // 500 >= 500
    assert.equal(resultAtTick500.eligible, true);
  });

  test('Parent with insufficient stored energy is rejected', () => {
    const starvingFemale = createAdult('starving_f', 'FEMALE');
    starvingFemale.nutrition_state.stored_energy = 20.0; // < 40.0 cost
    const male = createAdult('male_01', 'MALE');

    const result = evaluateReproductionEligibility(starvingFemale, male, profile, 200);
    assert.equal(result.eligible, false);
    assert.ok(result.reasons.includes(ELIGIBILITY_REASONS.INSUFFICIENT_ENERGY));
  });

  test('Overstressed parent is rejected', () => {
    const stressedFemale = createAdult('stressed_f', 'FEMALE');
    stressedFemale.stress_state.is_overstressed = true;
    const male = createAdult('male_01', 'MALE');

    const result = evaluateReproductionEligibility(stressedFemale, male, profile, 200);
    assert.equal(result.eligible, false);
    assert.ok(result.reasons.includes(ELIGIBILITY_REASONS.REPRODUCTIVELY_BLOCKED));
  });
});
