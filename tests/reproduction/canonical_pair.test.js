/**
 * LinhSinhVN — Tests for Parent Pair Canonicalization
 *
 * Verifies that candidate parent argument ordering cannot alter:
 * - Resolved canonical pair
 * - Derived BreedingSeed
 * - Resulting child genomes, sexes, or lineage roles
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadSpeciesProfile } from '../../game/lifecycle/profile_loader.js';
import { createOrganismState } from '../../game/lifecycle/organism_state.js';
import { canonicalizeParentPair } from '../../game/reproduction/canonical_pair.js';
import { ReproductionRuntime } from '../../game/reproduction/reproduction_runtime.js';

describe('Parent Pair Canonicalization', () => {
  const profile = loadSpeciesProfile('data/species/xylotrupes_rhinoceros_proto.json');

  const genomeA = {
    species_id: 'xylotrupes_rhinoceros_proto',
    loci: {
      LOCUS_BODY_SCALE: [0.6, 0.7],
      LOCUS_CHITIN_DENSITY: [0.5, 0.5],
      LOCUS_CEPHALIC_HORN: [0.8, 0.9],
      LOCUS_THORACIC_HORN: [0.4, 0.5],
      LOCUS_TARSAL_CLAW: [0.5, 0.6],
      LOCUS_METABOLIC_EFFICIENCY: [0.7, 0.8],
      LOCUS_CUTICLE_PIGMENT: [0.3, 0.4],
      LOCUS_ANTENNAL_CLUB: [0.5, 0.5]
    }
  };

  const genomeB = {
    species_id: 'xylotrupes_rhinoceros_proto',
    loci: {
      LOCUS_BODY_SCALE: [0.4, 0.5],
      LOCUS_CHITIN_DENSITY: [0.6, 0.7],
      LOCUS_CEPHALIC_HORN: [0.2, 0.3],
      LOCUS_THORACIC_HORN: [0.7, 0.8],
      LOCUS_TARSAL_CLAW: [0.6, 0.7],
      LOCUS_METABOLIC_EFFICIENCY: [0.4, 0.5],
      LOCUS_CUTICLE_PIGMENT: [0.6, 0.7],
      LOCUS_ANTENNAL_CLUB: [0.6, 0.7]
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

  function createParent(id, sex, genome) {
    const state = createOrganismState({
      organismId: id,
      speciesProfile: profile,
      generation: 1,
      sex,
      genome,
      phenotype: dummyPhenotype,
      derivedStats: dummyStats,
      simulationSeed: '0x024aa8a38b63e1b2'
    });
    state.current_stage_id = 'STAGE_ADULT';
    state.stage_age_ticks = 200;
    state.nutrition_state.stored_energy = 100.0;
    return state;
  }

  test('Heterosexual pairing strictly maps FEMALE to Parent A and MALE to Parent B', () => {
    const female = createParent('fem_org', 'FEMALE', genomeA);
    const male = createParent('male_org', 'MALE', genomeB);

    // Call with (female, male)
    const pair1 = canonicalizeParentPair(female, male, profile);
    assert.equal(pair1.parentA.organism_id, 'fem_org');
    assert.equal(pair1.parentB.organism_id, 'male_org');
    assert.equal(pair1.isSwapped, false);

    // Call with (male, female)
    const pair2 = canonicalizeParentPair(male, female, profile);
    assert.equal(pair2.parentA.organism_id, 'fem_org');
    assert.equal(pair2.parentB.organism_id, 'male_org');
    assert.equal(pair2.isSwapped, true);
  });

  test('reproduce(male, female) and reproduce(female, male) produce 100% bit-for-bit identical plans', () => {
    const female = createParent('female_001', 'FEMALE', genomeA);
    const male = createParent('male_001', 'MALE', genomeB);

    const runtime = new ReproductionRuntime();

    // Plan with (female, male)
    const plan1 = runtime.planReproduction(female, male, profile, 100, { breedingNonce: 42 });

    // Plan with (male, female)
    const plan2 = runtime.planReproduction(male, female, profile, 100, { breedingNonce: 42 });

    assert.equal(plan1.eligible, true);
    assert.equal(plan2.eligible, true);

    // Breeding seed must be identical
    assert.equal(plan1.breeding_seed, plan2.breeding_seed);
    assert.equal(plan1.parent_a_id, 'female_001');
    assert.equal(plan2.parent_a_id, 'female_001');
    assert.equal(plan1.parent_b_id, 'male_001');
    assert.equal(plan2.parent_b_id, 'male_001');

    // Clutch size and child plans must match bit-for-bit
    assert.equal(plan1.clutch_size, plan2.clutch_size);
    for (let i = 0; i < plan1.clutch_size; i++) {
      const c1 = plan1.children_plans[i];
      const c2 = plan2.children_plans[i];

      assert.equal(c1.child_id, c2.child_id);
      assert.equal(c1.child_sex, c2.child_sex);
      assert.deepEqual(c1.genetics_result.childGenome, c2.genetics_result.childGenome);
      assert.deepEqual(c1.genetics_result.phenotype, c2.genetics_result.phenotype);
      assert.deepEqual(c1.lineage_record, c2.lineage_record);
      assert.equal(c1.lineage_record.parent_ids.maternal_id, 'female_001');
      assert.equal(c1.lineage_record.parent_ids.paternal_id, 'male_001');
    }
  });

  test('Lexicographical tie-break applies when sexes are identical or isogamous', () => {
    const isogamousProfile = JSON.parse(JSON.stringify(profile));
    isogamousProfile.reproduction_profile.sex_requirements = 'ISOGAMOUS';

    const orgAlpha = createParent('alpha_org', 'MALE', genomeA);
    const orgBeta = createParent('beta_org', 'MALE', genomeB);

    const pair1 = canonicalizeParentPair(orgAlpha, orgBeta, isogamousProfile);
    assert.equal(pair1.parentA.organism_id, 'alpha_org');
    assert.equal(pair1.parentB.organism_id, 'beta_org');

    const pair2 = canonicalizeParentPair(orgBeta, orgAlpha, isogamousProfile);
    assert.equal(pair2.parentA.organism_id, 'alpha_org');
    assert.equal(pair2.parentB.organism_id, 'beta_org');
  });
});
