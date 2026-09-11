/**
 * LinhSinhVN — Tests for Canonical 12-Step Tick Pipeline
 * 
 * Verifies:
 * 1. Exact 12-step pipeline ordering
 * 2. Environment snapshot isolation
 * 3. Feeding & metabolic energy balance
 * 4. Starvation state & tissue catabolism
 * 5. Stress accumulation & recovery
 * 6. eta reduction, recovery, and metamorphosis lock
 * 7. Molt & stage transitions
 * 8. Terminal death handling
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadSpeciesProfile } from '../../game/lifecycle/profile_loader.js';
import { createOrganismState } from '../../game/lifecycle/organism_state.js';
import { PIPELINE_STEPS, executeTickPipeline } from '../../game/lifecycle/tick_pipeline.js';
import { LifecycleEventEmitter } from '../../game/lifecycle/event_emitter.js';

describe('12-Step Tick Pipeline Execution', () => {
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

  function createTestOrganism(stageId = 'STAGE_LARVA', substageId = 'L1') {
    const state = createOrganismState({
      organismId: 'pipe_test_001',
      speciesProfile: profile,
      generation: 1,
      sex: 'MALE',
      genome: mockGenome,
      phenotype: mockPhenotype,
      derivedStats: mockDerivedStats,
      simulationSeed: '0x024aa8a38b63e1b2'
    });
    state.current_stage_id = stageId;
    state.current_substage_id = substageId;
    return state;
  }

  test('canonical 12-step pipeline matches exact specified order', () => {
    assert.deepEqual(PIPELINE_STEPS, [
      'INPUT_INGESTION',
      'ENVIRONMENT_SNAPSHOT_RECORDING',
      'RESOURCE_INTAKE_AND_ASSIMILATION',
      'METABOLIC_EXPENDITURE',
      'STRESS_ACCUMULATION_AND_RECOVERY',
      'DEVELOPMENT_TRAJECTORY_EVALUATION',
      'ETA_UPDATE',
      'BIOMASS_GROWTH_EVALUATION',
      'LIFECYCLE_TRANSITION_CHECK',
      'SURVIVAL_AND_DEATH_EVALUATION',
      'DETERMINISTIC_EVENT_EMISSION',
      'STATE_SNAPSHOT_SERIALIZATION'
    ]);
  });

  test('Step 1 & 2: advances tick, age, and records immutable environment snapshot', () => {
    const state = createTestOrganism();
    const emitter = new LifecycleEventEmitter(state.simulation_seed, state.organism_id, state.species_id);

    const inputEnv = {
      ambient_temperature_celsius: 26.5,
      relative_humidity: 0.80,
      substrate_moisture: 0.70
    };

    executeTickPipeline(state, profile, { deltaTime: 1.0, environment: inputEnv }, emitter);

    assert.equal(state.simulation_tick, 1);
    assert.equal(state.chronological_age_ticks, 1);
    assert.equal(state.stage_age_ticks, 1);
    assert.equal(state.environment_state.ambient_temperature_celsius, 26.5);

    // Caller mutations to inputEnv must not affect state snapshot
    inputEnv.ambient_temperature_celsius = 99.0;
    assert.equal(state.environment_state.ambient_temperature_celsius, 26.5);
  });

  test('Step 3 & 4: assimilates diet, increases energy, and applies metabolic expenditure', () => {
    const state = createTestOrganism('STAGE_LARVA', 'L1');
    state.nutrition_state.stored_energy = 50.0;
    const emitter = new LifecycleEventEmitter(state.simulation_seed, state.organism_id, state.species_id);

    const resources = [
      { resource_id: 'ORGANIC_HUMUS', quantity: 10.0 }
    ];

    executeTickPipeline(state, profile, { resources }, emitter);

    // Feeding should occur and emit event
    const events = emitter.getEvents();
    assert.ok(events.some(e => e.event_type === 'FEEDING'));
    // Stored energy should reflect assimilation minus basal cost
    assert.ok(state.nutrition_state.stored_energy > 50.0);
  });

  test('Step 4: zero energy triggers starvation and structural biomass catabolism', () => {
    const state = createTestOrganism('STAGE_LARVA', 'L1');
    state.nutrition_state.stored_energy = 0.0;
    state.nutrition_state.structural_biomass = 0.50;
    const emitter = new LifecycleEventEmitter(state.simulation_seed, state.organism_id, state.species_id);

    executeTickPipeline(state, profile, { resources: [] }, emitter);

    assert.equal(state.nutrition_state.stored_energy, 0.0);
    assert.equal(state.nutrition_state.is_starving, true);
    assert.equal(state.nutrition_state.starvation_ticks_elapsed, 1);
    assert.ok(state.nutrition_state.structural_biomass < 0.50, 'Biomass must be catabolized for emergency energy');
  });

  test('Step 6 & 7: sustained deficit depresses eta, while optimal conditions allow recovery', () => {
    const state = createTestOrganism('STAGE_LARVA', 'L1');
    state.nutrition_state.stored_energy = 0.0;
    state.nutrition_state.structural_biomass = 0.50;
    state.developmental_state.eta_current = 1.00;
    const emitter = new LifecycleEventEmitter(state.simulation_seed, state.organism_id, state.species_id);

    // 10 ticks of starvation deficit
    for (let i = 0; i < 10; i++) {
      executeTickPipeline(state, profile, { resources: [] }, emitter);
    }

    assert.ok(state.developmental_state.eta_current < 1.00, 'eta must decrease under starvation');
    assert.ok(state.developmental_state.eta_min_reached <= state.developmental_state.eta_current);
    const depressedEta = state.developmental_state.eta_current;

    // Now supply abundant food and neutral stress
    state.nutrition_state.stored_energy = 100.0;
    state.stress_state.chronic_stress = 0.0;

    for (let i = 0; i < 10; i++) {
      executeTickPipeline(state, profile, {
        resources: [{ resource_id: 'ORGANIC_HUMUS', quantity: 50.0 }]
      }, emitter);
    }

    assert.ok(state.developmental_state.eta_current > depressedEta, 'eta must recover under optimal nutrition');
  });

  test('Step 9: advances substage (molt) when biomass and duration thresholds are reached', () => {
    const state = createTestOrganism('STAGE_LARVA', 'L1');
    state.nutrition_state.structural_biomass = 0.20; // > L1 target 0.15
    state.stage_age_ticks = 305; // > L1 min duration 300
    state.nutrition_state.stored_energy = 50.0;
    const emitter = new LifecycleEventEmitter(state.simulation_seed, state.organism_id, state.species_id);

    executeTickPipeline(state, profile, { resources: [] }, emitter);

    assert.equal(state.current_substage_id, 'L2', 'Must advance from L1 to L2');
    const events = emitter.getEvents();
    assert.ok(events.some(e => e.event_type === 'MOLT_COMPLETED'));
  });

  test('Step 9 & 7: entering locking stage (PUPA) permanently locks eta', () => {
    const state = createTestOrganism('STAGE_LARVA', 'L3');
    state.nutrition_state.structural_biomass = 1.05; // >= 1.00 target
    state.stage_age_ticks = 1505; // >= 1500 min duration
    const emitter = new LifecycleEventEmitter(state.simulation_seed, state.organism_id, state.species_id);

    executeTickPipeline(state, profile, { resources: [] }, emitter);

    assert.equal(state.current_stage_id, 'STAGE_PUPA');
    assert.equal(state.developmental_state.eta_locked, true, 'eta must lock upon entering STAGE_PUPA');
    const lockedEta = state.developmental_state.eta_current;

    // Further ticks under severe starvation must NOT alter locked eta
    state.nutrition_state.stored_energy = 0.0;
    for (let i = 0; i < 5; i++) {
      executeTickPipeline(state, profile, { resources: [] }, emitter);
    }
    assert.equal(state.developmental_state.eta_current, lockedEta, 'Locked eta must never change');
  });

  test('Step 10: starvation exhaustion triggers terminal death and seals death_record', () => {
    const state = createTestOrganism('STAGE_LARVA', 'L1');
    state.nutrition_state.stored_energy = 0.0;
    state.nutrition_state.is_starving = true;
    state.nutrition_state.starvation_ticks_elapsed = 145; // > starvation_endurance_time (140)
    const emitter = new LifecycleEventEmitter(state.simulation_seed, state.organism_id, state.species_id);

    executeTickPipeline(state, profile, { resources: [] }, emitter);

    assert.equal(state.is_alive, false);
    assert.equal(state.status, 'DEAD');
    assert.ok(state.death_record !== null);
    assert.equal(state.death_record.primary_cause, 'STARVATION');

    // Dead organism cannot tick
    assert.throws(() => {
      executeTickPipeline(state, profile, {}, emitter);
    }, Error);
  });
});
