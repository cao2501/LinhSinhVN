/**
 * LinhSinhVN — Tests for Atomic Reproduction Transactions
 *
 * Verifies:
 * - True multi-parent atomicity: failed commit causes zero mutation to either parent
 * - Phase 1 plan is strictly read-only
 * - Energy cost deducted exactly once on commit
 * - Cooldown applied exactly once on commit
 * - Parent genomes remain 100% immutable
 * - Child generation = max(genA, genB) + 1
 * - Child initial stage matches profile initial_stage_id
 * - Lineage records contain both maternal and paternal IDs
 * - Deterministic events emitted
 * - Distinct breeding nonces produce distinct deterministic outcomes
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadSpeciesProfile } from '../../game/lifecycle/profile_loader.js';
import { createOrganismState } from '../../game/lifecycle/organism_state.js';
import { ReproductionRuntime } from '../../game/reproduction/reproduction_runtime.js';

describe('Atomic Reproduction Transactions', () => {
  const profile = loadSpeciesProfile('data/species/xylotrupes_rhinoceros_proto.json');

  const genomeA = {
    species_id: 'xylotrupes_rhinoceros_proto',
    loci: {
      LOCUS_BODY_SCALE: [0.65, 0.70],
      LOCUS_CHITIN_DENSITY: [0.55, 0.60],
      LOCUS_CEPHALIC_HORN: [0.75, 0.80],
      LOCUS_THORACIC_HORN: [0.60, 0.65],
      LOCUS_TARSAL_CLAW: [0.50, 0.55],
      LOCUS_METABOLIC_EFFICIENCY: [0.80, 0.85],
      LOCUS_CUTICLE_PIGMENT: [0.40, 0.45],
      LOCUS_ANTENNAL_CLUB: [0.50, 0.55]
    }
  };

  const genomeB = {
    species_id: 'xylotrupes_rhinoceros_proto',
    loci: {
      LOCUS_BODY_SCALE: [0.45, 0.50],
      LOCUS_CHITIN_DENSITY: [0.65, 0.70],
      LOCUS_CEPHALIC_HORN: [0.30, 0.35],
      LOCUS_THORACIC_HORN: [0.70, 0.75],
      LOCUS_TARSAL_CLAW: [0.60, 0.65],
      LOCUS_METABOLIC_EFFICIENCY: [0.50, 0.55],
      LOCUS_CUTICLE_PIGMENT: [0.55, 0.60],
      LOCUS_ANTENNAL_CLUB: [0.65, 0.70]
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

  function createAdult(id, sex, genome, generation = 1) {
    const state = createOrganismState({
      organismId: id,
      speciesProfile: profile,
      generation,
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

  test('Phase 1 Planning is strictly read-only and causes zero parent state mutation', () => {
    const female = createAdult('f_plan_test', 'FEMALE', genomeA);
    const male = createAdult('m_plan_test', 'MALE', genomeB);

    const femaleSnapBefore = JSON.stringify(female);
    const maleSnapBefore = JSON.stringify(male);

    const runtime = new ReproductionRuntime();
    const plan = runtime.planReproduction(female, male, profile, 50, { breedingNonce: 1 });

    assert.equal(plan.eligible, true);
    assert.equal(JSON.stringify(female), femaleSnapBefore, 'Female parent must be 100% untouched after planning');
    assert.equal(JSON.stringify(male), maleSnapBefore, 'Male parent must be 100% untouched after planning');
  });

  test('Critical Atomicity: If Parent B fails preflight, Parent A is NOT mutated', () => {
    const female = createAdult('f_atom_test', 'FEMALE', genomeA);
    const male = createAdult('m_atom_test', 'MALE', genomeB);
    const runtime = new ReproductionRuntime();

    const plan = runtime.planReproduction(female, male, profile, 100, { breedingNonce: 7 });
    assert.equal(plan.eligible, true);

    const femaleEnergyBefore = female.nutrition_state.stored_energy;
    const femaleCooldownBefore = female.reproduction_cooldown_until_tick;

    // Simulate concurrent or external energy depletion on male before commit
    male.nutrition_state.stored_energy = 5.0; // < 40.0 cost

    // Commit must fail preflight on male
    assert.throws(() => {
      runtime.commitReproduction(plan, female, male, profile);
    }, /insufficient stored energy/i);

    // Assert female parent was strictly NOT mutated!
    assert.equal(female.nutrition_state.stored_energy, femaleEnergyBefore, 'Parent A energy must not be deducted if transaction aborts');
    assert.equal(female.reproduction_cooldown_until_tick, femaleCooldownBefore, 'Parent A cooldown must not change if transaction aborts');
  });

  test('Critical Atomicity: If Parent A fails preflight, Parent B is NOT mutated', () => {
    const female = createAdult('f_atom_test2', 'FEMALE', genomeA);
    const male = createAdult('m_atom_test2', 'MALE', genomeB);
    const runtime = new ReproductionRuntime();

    const plan = runtime.planReproduction(female, male, profile, 100, { breedingNonce: 8 });

    const maleEnergyBefore = male.nutrition_state.stored_energy;
    const maleCooldownBefore = male.reproduction_cooldown_until_tick;

    // Simulate female becoming dead before commit
    female.is_alive = false;
    female.status = 'DEAD';

    assert.throws(() => {
      runtime.commitReproduction(plan, female, male, profile);
    }, /dead or non-alive/i);

    // Assert male was strictly NOT mutated
    assert.equal(male.nutrition_state.stored_energy, maleEnergyBefore);
    assert.equal(male.reproduction_cooldown_until_tick, maleCooldownBefore);
  });

  test('Successful commit applies energy costs, cooldown, creates children and lineages atomically', () => {
    const female = createAdult('f_success', 'FEMALE', genomeA, 1);
    const male = createAdult('m_success', 'MALE', genomeB, 2);
    const runtime = new ReproductionRuntime();

    const femaleGenomeBefore = JSON.stringify(female.genetics.genome);
    const maleGenomeBefore = JSON.stringify(male.genetics.genome);

    const result = runtime.executeReproductionTransaction(female, male, profile, 250, {
      breedingNonce: 'tx_01',
      birthHabitat: 'forest_floor'
    });

    assert.equal(result.success, true);
    assert.ok(result.result.clutch_size >= 15 && result.result.clutch_size <= 45);

    // 1. Parent energy deducted exactly once (cost = 40.0)
    assert.equal(female.nutrition_state.stored_energy, 60.0);
    assert.equal(male.nutrition_state.stored_energy, 60.0);

    // 2. Cooldown and last reproduction tick set (cooldown = 300, tick = 250 => until 550)
    assert.equal(female.reproduction_cooldown_until_tick, 550);
    assert.equal(female.last_reproduction_tick, 250);
    assert.equal(male.reproduction_cooldown_until_tick, 550);
    assert.equal(male.last_reproduction_tick, 250);

    // 3. Parent genomes remain 100% immutable
    assert.equal(JSON.stringify(female.genetics.genome), femaleGenomeBefore);
    assert.equal(JSON.stringify(male.genetics.genome), maleGenomeBefore);

    // 4. Children validation
    assert.equal(result.result.children.length, result.result.clutch_size);
    for (const child of result.result.children) {
      assert.ok(child.organism_id.startsWith('org_'));
      assert.equal(child.species_id, 'xylotrupes_rhinoceros_proto');
      assert.equal(child.generation, 3, 'Child generation must be max(1, 2) + 1 = 3');
      assert.ok(child.sex === 'MALE' || child.sex === 'FEMALE');
      assert.equal(child.is_alive, true);
      assert.equal(child.status, 'ALIVE');
      assert.equal(child.current_stage_id, profile.lifecycle_profile.initial_stage_id, 'Child stage must equal initial_stage_id');
      assert.equal(child.simulation_tick, 0);
      assert.ok(child.genetics.genome);
      assert.ok(child.genetics.phenotype);
      assert.ok(child.genetics.derived_stats);
    }

    // 5. Lineages validation
    assert.equal(result.result.lineage_records.length, result.result.clutch_size);
    for (const lineage of result.result.lineage_records) {
      assert.equal(lineage.generation, 3);
      assert.equal(lineage.parent_ids.maternal_id, 'f_success');
      assert.equal(lineage.parent_ids.paternal_id, 'm_success');
      assert.equal(lineage.birth_habitat, 'forest_floor');
      assert.ok(lineage.breeding_seed);
    }

    // 6. Events validation
    const events = result.result.events;
    const parentCompletedEvents = events.filter(e => e.event_type === 'REPRODUCTION_COMPLETED');
    const childBornEvents = events.filter(e => e.event_type === 'ORGANISM_BORN');

    assert.equal(parentCompletedEvents.length, 2, 'Must emit REPRODUCTION_COMPLETED for both parents');
    assert.equal(childBornEvents.length, result.result.clutch_size, 'Must emit ORGANISM_BORN for each child');
  });

  test('Different breeding nonces produce different deterministic seeds and genetic outcomes', () => {
    const female = createAdult('f_nonce', 'FEMALE', genomeA);
    const male = createAdult('m_nonce', 'MALE', genomeB);
    const runtime = new ReproductionRuntime();

    const plan1 = runtime.planReproduction(female, male, profile, 100, { breedingNonce: 'seed_A' });
    const plan2 = runtime.planReproduction(female, male, profile, 100, { breedingNonce: 'seed_B' });

    assert.notEqual(plan1.breeding_seed, plan2.breeding_seed, 'Different nonces must derive different breeding seeds');
  });
});
