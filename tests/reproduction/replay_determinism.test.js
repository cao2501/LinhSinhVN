/**
 * LinhSinhVN — 100-Replay Determinism Test for Reproduction System
 *
 * Executes the exact same reproduction transaction 100 times across isolated instances.
 * Asserts 100% bit-for-bit identity across:
 * - Clutch sizes
 * - Child IDs
 * - Child sexes
 * - Child genomes
 * - Child phenotypes & derived stats
 * - Child lineage records
 * - Parent post-states (energy, cooldown)
 * - Emitted event streams & event IDs
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadSpeciesProfile } from '../../game/lifecycle/profile_loader.js';
import { createOrganismState } from '../../game/lifecycle/organism_state.js';
import { ReproductionRuntime } from '../../game/reproduction/reproduction_runtime.js';

describe('Reproduction 100-Replay Determinism', () => {
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

  function createAdult(id, sex, genome) {
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

  test('100-Replay: 100 independent reproduction executions produce 100% bit-for-bit identical results', () => {
    let baselineResult = null;

    for (let run = 1; run <= 100; run++) {
      const female = createAdult('replay_female_01', 'FEMALE', genomeA);
      const male = createAdult('replay_male_01', 'MALE', genomeB);
      const runtime = new ReproductionRuntime();

      const txResult = runtime.executeReproductionTransaction(female, male, profile, 500, {
        breedingNonce: 'canonical_nonce_100_runs',
        birthHabitat: 'deep_humus_layer'
      });

      const serializedRun = {
        clutch_size: txResult.result.clutch_size,
        breeding_seed: txResult.result.breeding_seed,
        parent_a_energy: female.nutrition_state.stored_energy,
        parent_b_energy: male.nutrition_state.stored_energy,
        parent_a_cooldown: female.reproduction_cooldown_until_tick,
        parent_b_cooldown: male.reproduction_cooldown_until_tick,
        children: txResult.result.children.map(c => ({
          id: c.organism_id,
          sex: c.sex,
          gen: c.generation,
          stage: c.current_stage_id,
          genome: c.genetics.genome,
          phenotype: c.genetics.phenotype,
          derivedStats: c.genetics.derived_stats
        })),
        lineages: txResult.result.lineage_records.map(l => ({
          id: l.organism_id,
          gen: l.generation,
          maternal_id: l.parent_ids.maternal_id,
          paternal_id: l.parent_ids.paternal_id,
          seed: l.breeding_seed,
          mutations: l.mutations
        })),
        events: txResult.result.events.map(e => ({
          event_id: e.event_id,
          event_type: e.event_type,
          organism_id: e.organism_id,
          tick: e.simulation_tick,
          order: e.deterministic_order_index,
          payload: e.payload
        }))
      };

      if (run === 1) {
        baselineResult = serializedRun;
      } else {
        assert.deepEqual(
          serializedRun,
          baselineResult,
          `Run #${run} diverged from baseline run #1!`
        );
      }
    }
  });
});
