/**
 * LinhSinhVN — Tests for LifecycleRuntime Coordinator & 100-Tick Deterministic Replay
 * 
 * Verifies:
 * 1. Runtime initialization and API
 * 2. 100-Tick deterministic replay: running two isolated simulations with identical inputs
 *    produces identical final states, snapshots, event sequences, and event IDs.
 * 3. Genome immutability across multi-tick execution.
 * 4. Dead organism rejection.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadSpeciesProfile } from '../../game/lifecycle/profile_loader.js';
import { createOrganismState } from '../../game/lifecycle/organism_state.js';
import { LifecycleRuntime } from '../../game/lifecycle/lifecycle_runtime.js';

describe('LifecycleRuntime Coordinator & Replay Determinism', () => {
  const profile = loadSpeciesProfile('data/species/xylotrupes_rhinoceros_proto.json');

  const baseGenome = {
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

  const basePhenotype = {
    body_scale_index: 1.24,
    mass_index: 1.62,
    cuticle_hardness_index: 2.15,
    cephalic_horn_scale: 1.37,
    thoracic_horn_scale: 0.93,
    tarsal_grip_index: 1.76,
    metabolic_drain_index: 0.82,
    stamina_economy_modifier: 1.21,
    sensory_range_units: 39.0,
    cuticle_pigment_ratio: 0.425,
    developmental_realization_factor: 1.00
  };

  const baseDerivedStats = {
    max_hp: 224.0,
    clash_power: 112.5,
    armor_reduction: 0.2875,
    crawl_speed: 12.8,
    max_stamina: 100.0,
    action_stamina_cost: 8.26,
    stamina_regen_rate: 7.42,
    perception_radius: 39.0,
    starvation_endurance_time: 197.56
  };

  function createRuntimeInstance(orgId = 'replay_org_01') {
    const state = createOrganismState({
      organismId: orgId,
      speciesProfile: profile,
      generation: 1,
      sex: 'MALE',
      genome: baseGenome,
      phenotype: basePhenotype,
      derivedStats: baseDerivedStats,
      simulationSeed: '0x024aa8a38b63e1b2'
    });
    return new LifecycleRuntime(state, profile);
  }

  test('Runtime initializes correctly with alive state and valid snapshot', () => {
    const runtime = createRuntimeInstance('init_test');
    assert.equal(runtime.isAlive(), true);
    const snap = runtime.getSnapshot();
    assert.equal(snap.organism_id, 'init_test');
    assert.equal(snap.simulation_tick, 0);
  });

  test('100-Tick Deterministic Replay: Two runs with identical inputs produce identical outcomes', () => {
    const runtime1 = createRuntimeInstance('canonical_org');
    const runtime2 = createRuntimeInstance('canonical_org');

    // Create a deterministic sequence of 100 inputs with varied resources and temperature
    const inputSequence = [];
    for (let tick = 1; tick <= 100; tick++) {
      const temp = 24.0 + (tick % 5) * 0.8;
      const humidity = 0.70 + (tick % 3) * 0.05;
      const resources = (tick % 2 === 0)
        ? [{ resource_id: 'ORGANIC_HUMUS', quantity: 2.0 }]
        : [];

      inputSequence.push({
        deltaTime: 1.0,
        environment: {
          ambient_temperature_celsius: temp,
          relative_humidity: humidity
        },
        resources
      });
    }

    const allEvents1 = [];
    const allEvents2 = [];

    for (let i = 0; i < 100; i++) {
      const res1 = runtime1.tick(inputSequence[i]);
      const res2 = runtime2.tick(inputSequence[i]);

      allEvents1.push(...res1.events);
      allEvents2.push(...res2.events);

      // Verify each step snapshot matches identically
      assert.deepEqual(res1.snapshot, res2.snapshot, `Snapshot at tick ${i + 1} must be identical`);
    }

    // Assert final snapshots match bit-for-bit
    const finalSnap1 = runtime1.getSnapshot();
    const finalSnap2 = runtime2.getSnapshot();
    assert.deepEqual(finalSnap1, finalSnap2, 'Final 100-tick state snapshot must be identical');

    // Assert total event counts and event IDs match identically
    assert.equal(allEvents1.length, allEvents2.length, 'Event counts must match exactly');
    for (let j = 0; j < allEvents1.length; j++) {
      assert.equal(allEvents1[j].event_id, allEvents2[j].event_id, `Event ID at index ${j} must match`);
      assert.equal(allEvents1[j].event_type, allEvents2[j].event_type);
      assert.equal(allEvents1[j].deterministic_order_index, allEvents2[j].deterministic_order_index);
      assert.deepEqual(allEvents1[j].payload, allEvents2[j].payload);
    }
  });

  test('Genome immutability is 100% preserved after 100 simulation ticks', () => {
    const runtime = createRuntimeInstance('genome_safety_org');

    const genomeBefore = JSON.stringify(runtime.state.genetics.genome);

    for (let tick = 0; tick < 100; tick++) {
      runtime.tick({ deltaTime: 1.0 });
    }

    const genomeAfter = JSON.stringify(runtime.state.genetics.genome);
    assert.equal(genomeBefore, genomeAfter, 'Genome must remain completely untouched after 100 ticks');
    assert.equal(runtime.state.species_id, 'xylotrupes_rhinoceros_proto');
    assert.equal(runtime.state.generation, 1);
  });

  test('Dead organism explicitly rejects subsequent ticks', () => {
    const runtime = createRuntimeInstance('dead_test_org');
    // Force terminal state
    runtime.state.is_alive = false;
    runtime.state.status = 'DEAD';
    runtime.state.death_record = { primary_cause: 'OLD_AGE' };

    assert.equal(runtime.isAlive(), false);
    assert.throws(() => {
      runtime.tick({});
    }, Error);
  });
});
