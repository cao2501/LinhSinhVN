/**
 * LinhSinhVN — Tests for Seed Derivation, Clutch Bounds, and RNG Decoupling
 *
 * Verifies:
 * - Clutch size determinism and bounds
 * - Child ID minimal Hash64 format: org_ + Hash64(BreedingSeed | "ID" | i)
 * - Sex determination contract adherence
 * - RNG domain decoupling: changing clutch or sex config leaves genetics seeds/genomes completely untouched
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadSpeciesProfile } from '../../game/lifecycle/profile_loader.js';
import { createOrganismState } from '../../game/lifecycle/organism_state.js';
import {
  deriveClutchSeed,
  deriveChildSexSeed,
  deriveChildGeneticsSeed,
  deriveChildId,
  deriveChildSimulationSeed
} from '../../game/reproduction/seed_derivation.js';
import { determineClutchSize, determineChildSex } from '../../game/reproduction/clutch.js';
import { ReproductionRuntime } from '../../game/reproduction/reproduction_runtime.js';

describe('Seed Derivations & RNG Domain Decoupling', () => {
  const profile = loadSpeciesProfile('data/species/xylotrupes_rhinoceros_proto.json');

  const baseGenome = {
    species_id: 'xylotrupes_rhinoceros_proto',
    loci: {
      LOCUS_BODY_SCALE: [0.65, 0.75],
      LOCUS_CHITIN_DENSITY: [0.45, 0.55],
      LOCUS_CEPHALIC_HORN: [0.80, 0.90],
      LOCUS_THORACIC_HORN: [0.60, 0.70],
      LOCUS_TARSAL_CLAW: [0.50, 0.50],
      LOCUS_METABOLIC_EFFICIENCY: [0.70, 0.80],
      LOCUS_CUTICLE_PIGMENT: [0.30, 0.40],
      LOCUS_ANTENNAL_CLUB: [0.50, 0.60]
    }
  };

  const dummyPhenotype = {
    body_scale_index: 1.0,
    mass_index: 1.0,
    cuticle_hardness_index: 1.0,
    cephalic_horn_scale: 0.5,
    thoracic_horn_scale: 0.5,
    tarsal_grip_index: 1.0,
    metabolic_drain_index: 1.0,
    stamina_economy_modifier: 1.0,
    sensory_range_units: 30.0,
    cuticle_pigment_ratio: 0.5,
    developmental_realization_factor: 1.0
  };

  const dummyStats = {
    max_hp: 100.0,
    clash_power: 50.0,
    armor_reduction: 0.2,
    crawl_speed: 10.0,
    max_stamina: 100.0,
    action_stamina_cost: 10.0,
    stamina_regen_rate: 5.0,
    perception_radius: 30.0,
    starvation_endurance_time: 100.0
  };

  function createParent(id, sex) {
    const state = createOrganismState({
      organismId: id,
      speciesProfile: profile,
      generation: 1,
      sex,
      genome: baseGenome,
      phenotype: dummyPhenotype,
      derivedStats: dummyStats,
      simulationSeed: '0x024aa8a38b63e1b2'
    });
    state.current_stage_id = 'STAGE_ADULT';
    state.stage_age_ticks = 200;
    state.nutrition_state.stored_energy = 100.0;
    return state;
  }

  test('Clutch size determinism adheres strictly to bounds [clutch_size_min, clutch_size_max]', () => {
    const breedingSeed = '0xa8f432b911c840e2';
    const clutchSeed = deriveClutchSeed(breedingSeed);

    const size1 = determineClutchSize(15, 45, clutchSeed);
    const size2 = determineClutchSize(15, 45, clutchSeed);

    assert.equal(size1, size2, 'Same clutch seed must produce identical clutch size');
    assert.ok(size1 >= 15 && size1 <= 45, `Clutch size (${size1}) must be within [15, 45]`);
  });

  test('Child ID conforms to minimal org_ + Hash64(BreedingSeed | "ID" | i) contract', () => {
    const breedingSeed = '0xa8f432b911c840e2';
    const childId0 = deriveChildId(breedingSeed, 0);
    const childId1 = deriveChildId(breedingSeed, 1);

    assert.match(childId0, /^org_[0-9a-f]{16}$/);
    assert.match(childId1, /^org_[0-9a-f]{16}$/);
    assert.notEqual(childId0, childId1, 'Different child indices must derive different child IDs');

    // Reproducibility
    assert.equal(childId0, deriveChildId(breedingSeed, 0));
  });

  test('Child sex determination uses sex_determination config without magic fallback', () => {
    const sexSeed = deriveChildSexSeed('0xa8f432b911c840e2', 0);

    const config = { mode: 'FIXED_RATIO', male_ratio: 0.50 };
    const sex = determineChildSex(config, sexSeed);
    assert.ok(sex === 'MALE' || sex === 'FEMALE');

    // 100% male ratio
    const maleOnlyConfig = { mode: 'FIXED_RATIO', male_ratio: 1.00 };
    assert.equal(determineChildSex(maleOnlyConfig, sexSeed), 'MALE');

    // 0% male ratio (female only)
    const femaleOnlyConfig = { mode: 'FIXED_RATIO', male_ratio: 0.00 };
    assert.equal(determineChildSex(femaleOnlyConfig, sexSeed), 'FEMALE');

    // Missing or invalid config must throw
    assert.throws(() => determineChildSex(null, sexSeed), TypeError);
    assert.throws(() => determineChildSex({ mode: 'INVALID_MODE', male_ratio: 0.5 }, sexSeed), Error);
    assert.throws(() => determineChildSex({ mode: 'FIXED_RATIO', male_ratio: 1.5 }, sexSeed), RangeError);
  });

  test('RNG Domain Decoupling: Altering clutch range does NOT shift child genetics seeds or genomes', () => {
    const female = createParent('fem_decouple', 'FEMALE');
    const male = createParent('male_decouple', 'MALE');
    const runtime = new ReproductionRuntime();

    // Run with original profile (clutch 15-45)
    const planA = runtime.planReproduction(female, male, profile, 100, { breedingNonce: 99 });

    // Modify profile clutch bounds to 5-10
    const profileModifiedClutch = JSON.parse(JSON.stringify(profile));
    profileModifiedClutch.reproduction_profile.clutch_size_min = 5;
    profileModifiedClutch.reproduction_profile.clutch_size_max = 10;

    const planB = runtime.planReproduction(female, male, profileModifiedClutch, 100, { breedingNonce: 99 });

    // Both plans share the same breeding seed
    assert.equal(planA.breeding_seed, planB.breeding_seed);

    // Clutch sizes will differ due to different clutch bounds
    assert.notEqual(planA.clutch_size, planB.clutch_size);

    // For all indices valid in both (at least 5), child genetics seeds, genomes, and phenotypes MUST be bit-for-bit identical!
    const sharedCount = Math.min(planA.clutch_size, planB.clutch_size);
    for (let i = 0; i < sharedCount; i++) {
      const childA = planA.children_plans[i];
      const childB = planB.children_plans[i];

      assert.equal(childA.child_id, childB.child_id, `Child ${i} ID must match`);
      assert.equal(childA.child_sex, childB.child_sex, `Child ${i} sex must match`);
      assert.deepEqual(
        childA.genetics_result.childGenome,
        childB.genetics_result.childGenome,
        `Child ${i} genome must be 100% identical despite clutch range change`
      );
      assert.deepEqual(
        childA.genetics_result.phenotype,
        childB.genetics_result.phenotype,
        `Child ${i} phenotype must be 100% identical despite clutch range change`
      );
    }
  });

  test('RNG Domain Decoupling: Altering sex ratio does NOT shift child genetics seeds or genomes', () => {
    const female = createParent('fem_sex_decouple', 'FEMALE');
    const male = createParent('male_sex_decouple', 'MALE');
    const runtime = new ReproductionRuntime();

    const planDefault = runtime.planReproduction(female, male, profile, 100, { breedingNonce: 123 });

    // Modify profile to 100% male ratio
    const profileAllMale = JSON.parse(JSON.stringify(profile));
    profileAllMale.reproduction_profile.sex_determination.male_ratio = 1.00;

    const planAllMale = runtime.planReproduction(female, male, profileAllMale, 100, { breedingNonce: 123 });

    // Child genetics seeds for each index i MUST be identical
    for (let i = 0; i < planDefault.clutch_size; i++) {
      const seedDefault = deriveChildGeneticsSeed(planDefault.breeding_seed, i);
      const seedAllMale = deriveChildGeneticsSeed(planAllMale.breeding_seed, i);
      assert.equal(seedDefault, seedAllMale, `Child ${i} genetics seed must be strictly independent of sex determination`);

      // Child genomes are also identical (genome recombination and mutations depend only on GeneticsSeed)
      assert.deepEqual(
        planDefault.children_plans[i].genetics_result.childGenome,
        planAllMale.children_plans[i].genetics_result.childGenome,
        `Child ${i} genome must remain identical`
      );
    }
  });
});
