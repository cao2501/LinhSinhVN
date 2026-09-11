/**
 * LinhSinhVN — Tests for State Snapshot Serialization
 * 
 * Verifies:
 * 1. Output snapshot is pure JSON data
 * 2. Matches schema structure
 * 3. Deep cloning ensures state mutation after snapshot does not contaminate snapshot
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadSpeciesProfile } from '../../game/lifecycle/profile_loader.js';
import { createOrganismState } from '../../game/lifecycle/organism_state.js';
import { serializeStateSnapshot } from '../../game/lifecycle/state_snapshot.js';

describe('Lifecycle State Snapshot & Serialization', () => {
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

  test('serializes state into pure JSON conforming to lifecycle_state schema', () => {
    const state = createOrganismState({
      organismId: 'snap_001',
      speciesProfile: profile,
      generation: 1,
      sex: 'MALE',
      genome: mockGenome,
      phenotype: mockPhenotype,
      derivedStats: mockDerivedStats,
      simulationSeed: '0x024aa8a38b63e1b2'
    });

    const snapshot = serializeStateSnapshot(state);

    assert.equal(snapshot.organism_id, 'snap_001');
    assert.equal(snapshot.species_id, 'xylotrupes_rhinoceros_proto');
    assert.equal(snapshot.simulation_tick, 0);
    assert.equal(snapshot.is_alive, true);
    assert.equal(snapshot.status, 'ALIVE');
    assert.equal(typeof snapshot.developmental_state, 'object');
    assert.equal(typeof snapshot.nutrition_state, 'object');
    assert.equal(typeof snapshot.environment_state, 'object');
    assert.equal(typeof snapshot.stress_state, 'object');
    assert.equal(typeof snapshot.physiological_modifiers, 'object');
    assert.equal(snapshot.death_record, null);

    // Verify it is stringifiable and parseable without loss
    const jsonString = JSON.stringify(snapshot);
    const roundTripped = JSON.parse(jsonString);
    assert.deepEqual(roundTripped, snapshot);
  });

  test('snapshot is fully decoupled and frozen from subsequent state changes', () => {
    const state = createOrganismState({
      organismId: 'snap_002',
      speciesProfile: profile,
      generation: 1,
      sex: 'FEMALE',
      genome: mockGenome,
      phenotype: mockPhenotype,
      derivedStats: mockDerivedStats,
      simulationSeed: '0x024aa8a38b63e1b2'
    });

    const snapshot1 = serializeStateSnapshot(state);

    // Mutate state after snapshot
    state.nutrition_state.stored_energy = 42.0;
    state.simulation_tick = 5;

    assert.equal(snapshot1.nutrition_state.stored_energy, 100.0, 'Snapshot must not reflect later state mutations');
    assert.equal(snapshot1.simulation_tick, 0);
    assert.ok(Object.isFrozen(snapshot1));
  });
});
