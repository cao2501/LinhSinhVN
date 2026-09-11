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

  test('Step 10: DEVELOPMENTAL_FAILURE terminal death via event/arrest and non-feeding exhaustion', () => {
    // 1. Triggered via explicit developmental arrest event input
    const state1 = createTestOrganism('STAGE_LARVA', 'L2');
    const emitter1 = new LifecycleEventEmitter(state1.simulation_seed, state1.organism_id, state1.species_id);

    executeTickPipeline(state1, profile, {
      developmental_failure: { reason: 'Lethal ecdysial arrest during cuticle shedding' }
    }, emitter1);

    assert.equal(state1.is_alive, false);
    assert.equal(state1.status, 'DEAD');
    assert.ok(state1.death_record !== null);
    assert.equal(state1.death_record.primary_cause, 'DEVELOPMENTAL_FAILURE');
    assert.ok(state1.death_record.detailed_cause_narrative.includes('Lethal ecdysial arrest'));
    assert.ok(Object.isFrozen(state1.death_record));

    // Dead organism cannot tick
    assert.throws(() => {
      executeTickPipeline(state1, profile, {}, emitter1);
    }, /dead organism/i);

    // 2. Triggered in non-feeding developmental stage (STAGE_PUPA) when metabolic energy is exhausted
    const state2 = createTestOrganism('STAGE_PUPA', null);
    state2.nutrition_state.stored_energy = 0.0;
    state2.nutrition_state.is_starving = true;
    state2.nutrition_state.starvation_ticks_elapsed = 150;
    const emitter2 = new LifecycleEventEmitter(state2.simulation_seed, state2.organism_id, state2.species_id);

    executeTickPipeline(state2, profile, { resources: [] }, emitter2);

    assert.equal(state2.is_alive, false);
    assert.equal(state2.status, 'DEAD');
    assert.ok(state2.death_record !== null);
    assert.equal(state2.death_record.primary_cause, 'DEVELOPMENTAL_FAILURE');
    assert.ok(state2.death_record.detailed_cause_narrative.includes('Metabolic energy exhaustion prior to adult eclosion'));
  });

  test('Step 10: CATASTROPHIC_EVENT terminal death via generic external input or extreme hazard', () => {
    // 1. Generic catastrophic event input
    const state1 = createTestOrganism('STAGE_LARVA', 'L1');
    const emitter1 = new LifecycleEventEmitter(state1.simulation_seed, state1.organism_id, state1.species_id);

    executeTickPipeline(state1, profile, {
      catastrophic_event: { reason: 'Severe substrate collapse crushing' }
    }, emitter1);

    assert.equal(state1.is_alive, false);
    assert.equal(state1.status, 'DEAD');
    assert.ok(state1.death_record !== null);
    assert.equal(state1.death_record.primary_cause, 'CATASTROPHIC_EVENT');
    assert.ok(state1.death_record.detailed_cause_narrative.includes('Severe substrate collapse crushing'));
    assert.ok(Object.isFrozen(state1.death_record));

    // 2. External events array input
    const state2 = createTestOrganism('STAGE_LARVA', 'L1');
    const emitter2 = new LifecycleEventEmitter(state2.simulation_seed, state2.organism_id, state2.species_id);

    executeTickPipeline(state2, profile, {
      external_events: [{ type: 'CATASTROPHIC_EVENT', narrative: 'Flash flood inundation' }]
    }, emitter2);

    assert.equal(state2.is_alive, false);
    assert.equal(state2.death_record.primary_cause, 'CATASTROPHIC_EVENT');

    // 3. Catastrophic environmental hazard rating >= 1.0
    const state3 = createTestOrganism('STAGE_LARVA', 'L1');
    const emitter3 = new LifecycleEventEmitter(state3.simulation_seed, state3.organism_id, state3.species_id);

    executeTickPipeline(state3, profile, {
      environment: { environmental_hazard_rating: 1.0 }
    }, emitter3);

    assert.equal(state3.is_alive, false);
    assert.equal(state3.death_record.primary_cause, 'CATASTROPHIC_EVENT');
  });

  test('All five death causes satisfy the exact same terminal invariants', () => {
    const deathCauses = [
      { cause: 'STARVATION', input: {}, setup: (st) => { st.nutrition_state.stored_energy = 0; st.nutrition_state.is_starving = true; st.nutrition_state.starvation_ticks_elapsed = 200; } },
      { cause: 'DEVELOPMENTAL_FAILURE', input: { developmental_failure: true }, setup: () => {} },
      { cause: 'ENVIRONMENTAL_FAILURE', input: { environment: { ambient_temperature_celsius: -5.0 } }, setup: () => {} },
      { cause: 'OLD_AGE', input: {}, setup: (st) => { st.current_stage_id = 'STAGE_ADULT'; st.current_substage_id = null; st.stage_age_ticks = 3005; } },
      { cause: 'CATASTROPHIC_EVENT', input: { catastrophic_event: true }, setup: () => {} }
    ];

    for (const { cause, input, setup } of deathCauses) {
      const state = createTestOrganism('STAGE_LARVA', 'L1');
      setup(state);
      const emitter = new LifecycleEventEmitter(state.simulation_seed, state.organism_id, state.species_id);

      const result = executeTickPipeline(state, profile, input, emitter);

      // Invariant 1: Vitality & terminal status
      assert.equal(state.is_alive, false, `${cause} must set is_alive = false`);
      assert.equal(state.status, 'DEAD', `${cause} must set status = DEAD`);

      // Invariant 2: death_record exists, matches cause, and is frozen
      assert.ok(state.death_record !== null, `${cause} must generate death_record`);
      assert.equal(state.death_record.primary_cause, cause, `${cause} primary_cause must match`);
      assert.equal(typeof state.death_record.detailed_cause_narrative, 'string');
      assert.ok(state.death_record.detailed_cause_narrative.length > 0);
      assert.ok(Object.isFrozen(state.death_record), `${cause} death_record must be frozen`);
      assert.ok(Object.isFrozen(state.death_record.parent_ids), `${cause} parent_ids must be frozen`);

      // Invariant 3: Attempt to mutate death_record fails
      assert.throws(() => {
        'use strict';
        state.death_record.primary_cause = 'MUTATED';
      }, TypeError, `${cause} mutating frozen death_record must throw`);

      // Invariant 4: Emitted terminal DEATH event
      const deathEvent = result.events.find(e => e.event_type === 'DEATH');
      assert.ok(deathEvent, `${cause} must emit DEATH event`);
      assert.equal(deathEvent.payload.primary_cause, cause);

      // Invariant 5: DEAD organism rejects any subsequent tick
      assert.throws(() => {
        executeTickPipeline(state, profile, {}, emitter);
      }, Error, `${cause} dead organism must be non-tickable`);
    }
  });

  test('Metabolic expenditure consumes configured motility_multiplier from species profile without hardcoded stage checks', () => {
    // Stage EGG: configured motility_multiplier = 0.20
    const stateEgg = createTestOrganism('STAGE_EGG', null);
    stateEgg.nutrition_state.stored_energy = 100.0;
    const emitterEgg = new LifecycleEventEmitter(stateEgg.simulation_seed, stateEgg.organism_id, stateEgg.species_id);

    executeTickPipeline(stateEgg, profile, { deltaTime: 1.0 }, emitterEgg);
    const eggDrain = 100.0 - stateEgg.nutrition_state.stored_energy;

    // Stage LARVA: configured motility_multiplier = 1.00
    const stateLarva = createTestOrganism('STAGE_LARVA', 'L1');
    stateLarva.nutrition_state.stored_energy = 100.0;
    const emitterLarva = new LifecycleEventEmitter(stateLarva.simulation_seed, stateLarva.organism_id, stateLarva.species_id);

    // Ensure no resource intake for fair comparison
    executeTickPipeline(stateLarva, profile, { deltaTime: 1.0, resources: [] }, emitterLarva);
    const larvaDrain = 100.0 - stateLarva.nutrition_state.stored_energy;

    // Ratio of drain should equal motility_multiplier ratio (0.20 / 1.00 = 0.20)
    const ratio = eggDrain / larvaDrain;
    assert.ok(Math.abs(ratio - 0.20) < 1e-4, `Expected ratio ~0.20, got ${ratio}`);
  });
});
