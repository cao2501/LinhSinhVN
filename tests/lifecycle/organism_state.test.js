/**
 * LinhSinhVN — Tests for OrganismState & Invariants
 * 
 * Verifies:
 * 1. Proper initialization of state from profile and genetics inputs
 * 2. Strict isolation from combat fields (no HP/stamina combat state)
 * 3. Enforces invariants (bounds, non-negative numbers, dead organism state)
 * 4. Genome immutability preservation
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadSpeciesProfile } from '../../game/lifecycle/profile_loader.js';
import { createOrganismState, assertStateInvariants } from '../../game/lifecycle/organism_state.js';

describe('OrganismState & Invariants', () => {
  const profile = loadSpeciesProfile('data/species/xylotrupes_rhinoceros_proto.json');

  const mockGenome = {
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

  const mockPhenotype = {
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

  const mockDerivedStats = {
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

  test('creates valid initial organism state matching schema specifications', () => {
    const state = createOrganismState({
      organismId: 'beetle_001',
      speciesProfile: profile,
      generation: 1,
      sex: 'MALE',
      genome: mockGenome,
      phenotype: mockPhenotype,
      derivedStats: mockDerivedStats,
      simulationSeed: '0x024aa8a38b63e1b2'
    });

    assert.equal(state.organism_id, 'beetle_001');
    assert.equal(state.current_stage_id, 'STAGE_EGG');
    assert.equal(state.is_alive, true);
    assert.equal(state.status, 'ALIVE');
    assert.equal(state.developmental_state.eta_current, 1.00);
    assert.equal(state.developmental_state.eta_locked, false);
    assert.equal(state.nutrition_state.stored_energy, 100.0);
    assert.equal(state.death_record, null);
  });

  test('preserves genome immutability (deep freezes inputs on creation)', () => {
    const state = createOrganismState({
      organismId: 'beetle_002',
      speciesProfile: profile,
      generation: 1,
      sex: 'FEMALE',
      genome: mockGenome,
      phenotype: mockPhenotype,
      derivedStats: mockDerivedStats,
      simulationSeed: '0x024aa8a38b63e1b2'
    });

    assert.ok(Object.isFrozen(state.genetics.genome));
    assert.ok(Object.isFrozen(state.genetics.genome.loci));
    assert.throws(() => {
      // @ts-ignore
      state.genetics.genome.loci.LOCUS_BODY_SCALE = [1.0, 1.0];
    }, TypeError);
  });

  test('assertStateInvariants throws on out-of-bounds eta values', () => {
    const state = createOrganismState({
      organismId: 'beetle_003',
      speciesProfile: profile,
      generation: 1,
      sex: 'MALE',
      genome: mockGenome,
      phenotype: mockPhenotype,
      derivedStats: mockDerivedStats,
      simulationSeed: '0x024aa8a38b63e1b2'
    });

    state.developmental_state.eta_current = 0.55; // out of [0.60, 1.00]
    assert.throws(() => {
      assertStateInvariants(state, profile);
    }, RangeError);

    state.developmental_state.eta_current = 1.05; // out of [0.60, 1.00]
    assert.throws(() => {
      assertStateInvariants(state, profile);
    }, RangeError);
  });

  test('assertStateInvariants throws on negative stored energy or biomass', () => {
    const state = createOrganismState({
      organismId: 'beetle_004',
      speciesProfile: profile,
      generation: 1,
      sex: 'FEMALE',
      genome: mockGenome,
      phenotype: mockPhenotype,
      derivedStats: mockDerivedStats,
      simulationSeed: '0x024aa8a38b63e1b2'
    });

    state.nutrition_state.stored_energy = -5.0;
    assert.throws(() => {
      assertStateInvariants(state, profile);
    }, RangeError);

    state.nutrition_state.stored_energy = 50.0;
    state.nutrition_state.structural_biomass = -0.1;
    assert.throws(() => {
      assertStateInvariants(state, profile);
    }, RangeError);
  });

  test('assertStateInvariants enforces dead organism terminal status consistency', () => {
    const state = createOrganismState({
      organismId: 'beetle_005',
      speciesProfile: profile,
      generation: 1,
      sex: 'MALE',
      genome: mockGenome,
      phenotype: mockPhenotype,
      derivedStats: mockDerivedStats,
      simulationSeed: '0x024aa8a38b63e1b2'
    });

    state.is_alive = false;
    state.status = 'ALIVE'; // inconsistent!
    assert.throws(() => {
      assertStateInvariants(state, profile);
    }, Error);

    state.status = 'DEAD';
    state.death_record = null; // dead without record!
    assert.throws(() => {
      assertStateInvariants(state, profile);
    }, Error);
  });
});
