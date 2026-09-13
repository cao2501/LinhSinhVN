/**
 * LinhSinhVN — Population Biological Tick Coordinator Tests
 *
 * Covers TC-TICK-01 through TC-TICK-27:
 * - TC-TICK-01: Advance biological tick in empty world
 * - TC-TICK-02: Single organism biological tick updates state
 * - TC-TICK-03: Multi-organism tick evaluates all living organisms
 * - TC-TICK-04: Canonical organism ID order in result
 * - TC-TICK-05: Non-feeding stage (e.g. EGG) generates 0 demand
 * - TC-TICK-06: Feeding stage (e.g. LARVA) generates demand = base_intake * dt
 * - TC-TICK-07: Sufficient resource satisfies all demands
 * - TC-TICK-08: Scarce resource allocates in canonical order
 * - TC-TICK-09: Zero resource causes deficit/starvation
 * - TC-TICK-10: Dead organisms generate 0 demand and consume 0 resources
 * - TC-TICK-11: Dead organisms remain in PopulationRegistry (DEATH != REMOVE)
 * - TC-TICK-12: Dead organisms execute no lifecycle ticks and emit no new events
 * - TC-TICK-13: Natural death during tick transitions status and records death
 * - TC-TICK-14: Emitted events aggregate into tick result in canonical order
 * - TC-TICK-15: SimulationClock advances exactly once on successful commit
 * - TC-TICK-16: Clock does NOT advance on failure
 * - TC-TICK-17: SimulationWorld.advanceBiologicalTick forwards to coordinator
 * - TC-TICK-18: Environment snapshot matches EnvironmentState
 * - TC-TICK-19: Organisms do not mutate each other in the same tick (Same-tick isolation)
 * - TC-TICK-20: Pre-tick state is preserved if evaluation fails (Atomicity)
 * - TC-TICK-21: PopulationTickResult matches JSON schema
 * - TC-TICK-22: 50-run replay determinism with identical initial state
 * - TC-TICK-23: Invalid delta_time rejected
 * - TC-TICK-24: Missing/invalid species profile rejected
 * - TC-TICK-25: Data-driven intake capacity (different configs produce proportional demands)
 * - TC-TICK-26: Missing resource configuration fails explicitly (no food_resource conversion)
 * - TC-TICK-27: Resource allocation commits exactly once (no double subtraction)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createSimulationWorld } from '../../game/population/simulation_world.js';
import { createResourcePool } from '../../game/population/resource_pool.js';
import {
  calculateOrganismResourceDemand,
  executePopulationBiologicalTick
} from '../../game/population/biological_tick_coordinator.js';
import { loadSpeciesProfile } from '../../game/lifecycle/profile_loader.js';
import { createOrganismState } from '../../game/lifecycle/organism_state.js';

const EPSILON = 1e-7;

function makeMockGenome() {
  return {
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
}

function makeMockPhenotype() {
  return {
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
}

function makeMockDerivedStats() {
  return {
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
}

function createTestWorld(seed = '0x0123456789abcdef') {
  return createSimulationWorld({
    simulation_seed: seed,
    population_id: 'pop_xylotrupes_01',
    species_id: 'xylotrupes_rhinoceros_proto'
  });
}

function createTestOrganism(profile, id = 'org_test_01', stage = 'STAGE_LARVA', extra = {}) {
  const org = createOrganismState({
    organismId: id,
    speciesProfile: profile,
    generation: 1,
    sex: 'MALE',
    genome: makeMockGenome(),
    phenotype: makeMockPhenotype(),
    derivedStats: makeMockDerivedStats(),
    simulationSeed: '0x0123456789abcdef'
  });

  const stageId = stage.startsWith('STAGE_') ? stage : `STAGE_${stage}`;
  if (stageId !== 'STAGE_EGG') {
    org.current_stage_id = stageId;
    org.current_stage_index = profile.lifecycle_profile.stages.findIndex(s => s.stage_id === stageId);
    if (stageId === 'STAGE_LARVA') {
      org.current_substage_id = 'L1';
    } else {
      org.current_substage_id = null;
    }
  }

  if (extra.is_alive === false) {
    org.is_alive = false;
    org.status = 'DEAD';
    org.death_record = {
      schema_version: '1.0.0',
      organism_id: org.organism_id,
      species_id: org.species_id,
      death_tick: 1,
      chronological_age_ticks: org.chronological_age_ticks,
      death_stage: org.current_stage_id,
      death_substage: org.current_substage_id,
      primary_cause: 'OLD_AGE',
      detailed_cause_narrative: 'Old age',
      terminal_eta: org.developmental_state.eta_current,
      terminal_biomass: org.nutrition_state.structural_biomass,
      terminal_stored_energy: org.nutrition_state.stored_energy,
      terminal_hydration: org.nutrition_state.hydration
    };
  }

  if (typeof extra.stored_energy === 'number') {
    org.nutrition_state.stored_energy = extra.stored_energy;
  }
  if (typeof extra.structural_biomass === 'number') {
    org.nutrition_state.structural_biomass = extra.structural_biomass;
  }

  return org;
}

describe('Population Biological Tick Coordinator (TC-TICK-01 -> TC-TICK-27)', () => {
  const profile = loadSpeciesProfile('data/species/xylotrupes_rhinoceros_proto.json');

  it('TC-TICK-01: Advance biological tick in empty world', () => {
    const world = createTestWorld();
    const result = executePopulationBiologicalTick(world, 1.0, {
      species_profile: profile,
      available_resource: 100.0
    });

    assert.equal(result.schema_version, '1.0.0');
    assert.equal(result.simulation_tick, 0);
    assert.equal(result.next_simulation_tick, 1);
    assert.equal(world.clock.currentTick, 1);
    assert.equal(result.organism_results.length, 0);
    assert.equal(result.events.length, 0);
    assert.equal(result.resource_allocation.allocations.length, 0);
  });

  it('TC-TICK-02: Single organism biological tick updates state', () => {
    const world = createTestWorld();
    const org = createTestOrganism(profile, 'org_01', 'STAGE_LARVA');
    world.registry.addOrganism(org);

    const prevTick = org.simulation_tick;
    const result = executePopulationBiologicalTick(world, 1.0, {
      species_profile: profile,
      available_resource: 50.0
    });

    assert.equal(result.simulation_tick, 0);
    assert.equal(result.next_simulation_tick, 1);
    assert.equal(world.clock.currentTick, 1);

    const registeredOrg = world.registry.getOrganism('org_01');
    assert.equal(registeredOrg.simulation_tick, prevTick + 1);
    assert.equal(result.organism_results.length, 1);
    assert.equal(result.organism_results[0].organism_id, 'org_01');
    assert.equal(result.organism_results[0].is_alive, true);
  });

  it('TC-TICK-03: Multi-organism tick evaluates all living organisms', () => {
    const world = createTestWorld();
    world.registry.addOrganism(createTestOrganism(profile, 'org_02', 'STAGE_LARVA'));
    world.registry.addOrganism(createTestOrganism(profile, 'org_01', 'STAGE_LARVA'));
    world.registry.addOrganism(createTestOrganism(profile, 'org_03', 'STAGE_LARVA'));

    const result = executePopulationBiologicalTick(world, 1.0, {
      species_profile: profile,
      available_resource: 200.0
    });

    assert.equal(result.organism_results.length, 3);
    for (const org of world.registry.listOrganisms()) {
      assert.equal(org.simulation_tick, 1);
    }
  });

  it('TC-TICK-04: Canonical organism ID order in result', () => {
    const world = createTestWorld();
    // Insert out of order
    world.registry.addOrganism(createTestOrganism(profile, 'org_z', 'STAGE_LARVA'));
    world.registry.addOrganism(createTestOrganism(profile, 'org_a', 'STAGE_LARVA'));
    world.registry.addOrganism(createTestOrganism(profile, 'org_m', 'STAGE_LARVA'));

    const result = executePopulationBiologicalTick(world, 1.0, {
      species_profile: profile,
      available_resource: 100.0
    });

    assert.deepEqual(
      result.organism_results.map(r => r.organism_id),
      ['org_a', 'org_m', 'org_z']
    );
    assert.deepEqual(
      result.resource_allocation.allocations.map(a => a.organism_id),
      ['org_a', 'org_m', 'org_z']
    );
  });

  it('TC-TICK-05: Non-feeding stage (e.g. EGG) generates 0 demand', () => {
    const egg = createTestOrganism(profile, 'egg_01', 'STAGE_EGG');
    const demand = calculateOrganismResourceDemand(egg, profile, 1.0);

    assert.equal(demand.organism_id, 'egg_01');
    assert.equal(demand.requested_amount, 0.0);
  });

  it('TC-TICK-06: Feeding stage (e.g. LARVA) generates demand = base_intake * dt', () => {
    const larva = createTestOrganism(profile, 'larva_01', 'STAGE_LARVA');
    const dt = 2.5;
    const expected = profile.nutrition_profile.base_intake_capacity_per_tick * dt;

    const demand = calculateOrganismResourceDemand(larva, profile, dt);
    assert.equal(demand.organism_id, 'larva_01');
    assert.ok(Math.abs(demand.requested_amount - expected) < EPSILON);
  });

  it('TC-TICK-07: Sufficient resource satisfies all demands', () => {
    const world = createTestWorld();
    world.registry.addOrganism(createTestOrganism(profile, 'org_01', 'STAGE_LARVA'));
    world.registry.addOrganism(createTestOrganism(profile, 'org_02', 'STAGE_LARVA'));

    const expectedDemand = profile.nutrition_profile.base_intake_capacity_per_tick * 1.0;
    const result = executePopulationBiologicalTick(world, 1.0, {
      species_profile: profile,
      available_resource: 100.0
    });

    assert.equal(result.resource_allocation.allocations[0].allocated_amount, expectedDemand);
    assert.equal(result.resource_allocation.allocations[0].unmet_amount, 0.0);
    assert.equal(result.resource_allocation.allocations[1].allocated_amount, expectedDemand);
    assert.equal(result.resource_allocation.allocations[1].unmet_amount, 0.0);
  });

  it('TC-TICK-08: Scarce resource allocates in canonical order', () => {
    const world = createTestWorld();
    world.registry.addOrganism(createTestOrganism(profile, 'org_b', 'STAGE_LARVA'));
    world.registry.addOrganism(createTestOrganism(profile, 'org_a', 'STAGE_LARVA'));

    const intake = profile.nutrition_profile.base_intake_capacity_per_tick; // 10.0
    // Provide only 15.0: org_a gets 10.0, org_b gets 5.0
    const result = executePopulationBiologicalTick(world, 1.0, {
      species_profile: profile,
      available_resource: 15.0
    });

    const allocA = result.resource_allocation.allocations.find(a => a.organism_id === 'org_a');
    const allocB = result.resource_allocation.allocations.find(a => a.organism_id === 'org_b');

    assert.equal(allocA.allocated_amount, 10.0);
    assert.equal(allocA.unmet_amount, 0.0);
    assert.equal(allocB.allocated_amount, 5.0);
    assert.equal(allocB.unmet_amount, 5.0);
  });

  it('TC-TICK-09: Zero resource causes deficit/starvation', () => {
    const world = createTestWorld();
    world.registry.addOrganism(createTestOrganism(profile, 'org_starve', 'STAGE_LARVA'));

    const result = executePopulationBiologicalTick(world, 1.0, {
      species_profile: profile,
      available_resource: 0.0
    });

    const alloc = result.resource_allocation.allocations[0];
    assert.equal(alloc.allocated_amount, 0.0);
    assert.ok(alloc.unmet_amount > 0);

    const org = world.registry.getOrganism('org_starve');
    assert.equal(org.nutrition_state.cumulative_deficit_ticks, 1);
  });

  it('TC-TICK-10: Dead organisms generate 0 demand and consume 0 resources', () => {
    const deadOrg = createTestOrganism(profile, 'dead_01', 'STAGE_LARVA', { is_alive: false });
    const demand = calculateOrganismResourceDemand(deadOrg, profile, 1.0);
    assert.equal(demand.requested_amount, 0.0);

    const world = createTestWorld();
    world.registry.addOrganism(deadOrg);

    const result = executePopulationBiologicalTick(world, 1.0, {
      species_profile: profile,
      available_resource: 100.0
    });

    assert.equal(result.resource_allocation.allocations.length, 0);
  });

  it('TC-TICK-11: Dead organisms remain in PopulationRegistry (DEATH != REMOVE)', () => {
    const world = createTestWorld();
    world.registry.addOrganism(createTestOrganism(profile, 'dead_01', 'STAGE_LARVA', { is_alive: false }));

    executePopulationBiologicalTick(world, 1.0, {
      species_profile: profile,
      available_resource: 100.0
    });

    assert.equal(world.registry.size, 1);
    assert.ok(world.registry.getOrganism('dead_01'));
    assert.equal(world.registry.countLiving(), 0);
    assert.equal(world.registry.countDead(), 1);
  });

  it('TC-TICK-12: Dead organisms execute no lifecycle ticks and emit no new events', () => {
    const world = createTestWorld();
    const deadOrg = createTestOrganism(profile, 'dead_01', 'STAGE_LARVA', { is_alive: false });
    deadOrg.simulation_tick = 5;
    world.registry.addOrganism(deadOrg);

    const result = executePopulationBiologicalTick(world, 1.0, {
      species_profile: profile,
      available_resource: 100.0
    });

    assert.equal(deadOrg.simulation_tick, 5); // Did not tick
    assert.equal(result.events.length, 0);
    assert.equal(result.organism_results.length, 0);
  });

  it('TC-TICK-13: Natural death during tick transitions status and records death', () => {
    const world = createTestWorld();
    // Organism with 0 energy and depleted biomass to trigger death in tick
    const dyingOrg = createTestOrganism(profile, 'dying_01', 'STAGE_LARVA', {
      stored_energy: 0.0,
      structural_biomass: 0.0005
    });
    world.registry.addOrganism(dyingOrg);

    const result = executePopulationBiologicalTick(world, 1.0, {
      species_profile: profile,
      available_resource: 0.0 // No food -> starvation exhaustion
    });

    const org = world.registry.getOrganism('dying_01');
    assert.equal(org.is_alive, false);
    assert.equal(org.status, 'DEAD');
    assert.ok(org.death_record);
    assert.equal(org.death_record.primary_cause, 'STARVATION');

    const orgRes = result.organism_results.find(r => r.organism_id === 'dying_01');
    assert.equal(orgRes.is_alive, false);
    assert.equal(orgRes.status, 'DEAD');
  });

  it('TC-TICK-14: Emitted events aggregate into tick result in canonical order', () => {
    const world = createTestWorld();
    world.registry.addOrganism(createTestOrganism(profile, 'org_02', 'STAGE_LARVA'));
    world.registry.addOrganism(createTestOrganism(profile, 'org_01', 'STAGE_LARVA'));

    const result = executePopulationBiologicalTick(world, 1.0, {
      species_profile: profile,
      available_resource: 100.0
    });

    assert.ok(result.events.length > 0);
    // Events for org_01 should precede events for org_02
    const firstOrgId = result.events[0].organism_id;
    assert.equal(firstOrgId, 'org_01');
    const lastOrgId = result.events[result.events.length - 1].organism_id;
    assert.equal(lastOrgId, 'org_02');
  });

  it('TC-TICK-15: SimulationClock advances exactly once on successful commit', () => {
    const world = createTestWorld();
    assert.equal(world.clock.currentTick, 0);

    const res = executePopulationBiologicalTick(world, 1.0, {
      species_profile: profile,
      available_resource: 100.0
    });

    assert.equal(res.simulation_tick, 0);
    assert.equal(res.next_simulation_tick, 1);
    assert.equal(world.clock.currentTick, 1);
  });

  it('TC-TICK-16: Clock does NOT advance on failure', () => {
    const world = createTestWorld();
    // Add corrupted organism that will fail assertStateInvariants during tick
    const corruptedOrg = createTestOrganism(profile, 'corrupt_01', 'STAGE_LARVA');
    corruptedOrg.developmental_state.eta_current = -999.0; // Invalid invariant
    world.registry.addOrganism(corruptedOrg);

    assert.equal(world.clock.currentTick, 0);
    assert.throws(() => {
      executePopulationBiologicalTick(world, 1.0, {
        species_profile: profile,
        available_resource: 100.0
      });
    });

    assert.equal(world.clock.currentTick, 0);
  });

  it('TC-TICK-17: SimulationWorld.advanceBiologicalTick forwards to coordinator', () => {
    const world = createTestWorld();
    world.registry.addOrganism(createTestOrganism(profile, 'org_fwd', 'STAGE_LARVA'));

    const res = world.advanceBiologicalTick(1.0, {
      species_profile: profile,
      available_resource: 100.0
    });

    assert.equal(res.simulation_tick, 0);
    assert.equal(res.next_simulation_tick, 1);
    assert.equal(world.clock.currentTick, 1);
    assert.equal(res.organism_results[0].organism_id, 'org_fwd');
  });

  it('TC-TICK-18: Environment snapshot matches EnvironmentState', () => {
    const world = createTestWorld();
    const snap = world.getEnvironmentState();

    const res = executePopulationBiologicalTick(world, 1.0, {
      species_profile: profile,
      available_resource: 100.0
    });

    assert.equal(res.environment_snapshot.ambient_temperature_celsius, snap.ambient_temperature_celsius);
    assert.equal(res.environment_snapshot.relative_humidity, snap.relative_humidity);
    assert.equal(res.environment_snapshot.season, snap.season);
    assert.equal(res.environment_snapshot.time_of_day, snap.time_of_day);
  });

  it('TC-TICK-19: Organisms do not mutate each other in the same tick (Same-tick isolation)', () => {
    const world = createTestWorld();
    const orgA = createTestOrganism(profile, 'org_a', 'STAGE_LARVA');
    const orgB = createTestOrganism(profile, 'org_b', 'STAGE_LARVA');
    world.registry.addOrganism(orgA);
    world.registry.addOrganism(orgB);

    const snapABefore = JSON.stringify(orgA);
    const snapBBefore = JSON.stringify(orgB);

    // During evaluation Phase D, each organism evaluated independently
    const res = executePopulationBiologicalTick(world, 1.0, {
      species_profile: profile,
      available_resource: 100.0
    });

    assert.notEqual(JSON.stringify(orgA), snapABefore);
    assert.notEqual(JSON.stringify(orgB), snapBBefore);
    // Both ticked cleanly
    assert.equal(orgA.simulation_tick, 1);
    assert.equal(orgB.simulation_tick, 1);
  });

  it('TC-TICK-20: Pre-tick state is preserved if evaluation fails (Atomicity)', () => {
    const world = createTestWorld();
    const goodOrg = createTestOrganism(profile, 'org_good', 'STAGE_LARVA');
    const corruptOrg = createTestOrganism(profile, 'org_z_corrupt', 'STAGE_LARVA');
    corruptOrg.developmental_state.eta_current = -99.0; // Invariant violation

    world.registry.addOrganism(goodOrg);
    world.registry.addOrganism(corruptOrg);

    const goodSnap = JSON.stringify(goodOrg);
    const pool = createResourcePool(100.0);
    world.setResourcePool(pool);

    assert.throws(() => {
      executePopulationBiologicalTick(world, 1.0, {
        species_profile: profile,
        resource_pool: pool
      });
    });

    // Good organism must be 100% untouched
    assert.equal(JSON.stringify(goodOrg), goodSnap);
    assert.equal(goodOrg.simulation_tick, 0);

    // Resource pool must be 100% untouched
    assert.equal(pool.availableQuantity, 100.0);

    // Clock must remain 0
    assert.equal(world.clock.currentTick, 0);
  });

  it('TC-TICK-21: PopulationTickResult matches JSON schema', () => {
    const schemaContent = readFileSync('data/population/schema/population_tick_result.schema.json', 'utf8');
    const schema = JSON.parse(schemaContent);
    assert.equal(schema.$id, 'https://linhsinhvn.game/schemas/population/population_tick_result.schema.json');

    const world = createTestWorld();
    world.registry.addOrganism(createTestOrganism(profile, 'org_01', 'STAGE_LARVA'));

    const result = executePopulationBiologicalTick(world, 1.0, {
      species_profile: profile,
      available_resource: 100.0
    });

    assert.equal(result.schema_version, '1.0.0');
    assert.ok(typeof result.population_id === 'string');
    assert.ok(typeof result.simulation_tick === 'number');
    assert.ok(typeof result.next_simulation_tick === 'number');
    assert.ok(typeof result.delta_time === 'number');
    assert.ok(result.environment_snapshot);
    assert.ok(result.resource_allocation);
    assert.ok(Array.isArray(result.organism_results));
    assert.ok(Array.isArray(result.events));
  });

  it('TC-TICK-22: 50-run replay determinism with identical initial state', () => {
    function runSim() {
      const world = createTestWorld('0x1234567890abcdef');
      world.registry.addOrganism(createTestOrganism(profile, 'org_2', 'STAGE_LARVA'));
      world.registry.addOrganism(createTestOrganism(profile, 'org_1', 'STAGE_LARVA'));
      world.registry.addOrganism(createTestOrganism(profile, 'org_3', 'STAGE_LARVA'));

      const res = executePopulationBiologicalTick(world, 1.0, {
        species_profile: profile,
        available_resource: 25.0
      });

      return JSON.stringify(res);
    }

    const baseline = runSim();
    for (let i = 0; i < 50; i++) {
      const run = runSim();
      assert.equal(run, baseline);
    }
  });

  it('TC-TICK-23: Invalid delta_time rejected', () => {
    const world = createTestWorld();

    assert.throws(() => {
      executePopulationBiologicalTick(world, 0, { species_profile: profile, available_resource: 10.0 });
    }, /deltaTime must be a positive finite number/);

    assert.throws(() => {
      executePopulationBiologicalTick(world, -1.0, { species_profile: profile, available_resource: 10.0 });
    }, /deltaTime must be a positive finite number/);

    assert.throws(() => {
      executePopulationBiologicalTick(world, NaN, { species_profile: profile, available_resource: 10.0 });
    }, /deltaTime must be a positive finite number/);
  });

  it('TC-TICK-24: Missing/invalid species profile rejected', () => {
    const world = createTestWorld();

    assert.throws(() => {
      executePopulationBiologicalTick(world, 1.0, { available_resource: 10.0 });
    }, /species_profile must be provided in options/);

    assert.throws(() => {
      executePopulationBiologicalTick(world, 1.0, { species_profile: null, available_resource: 10.0 });
    }, /species_profile must be provided in options/);
  });

  it('TC-TICK-25: Data-driven intake capacity (different configs produce proportional demands)', () => {
    const larva = createTestOrganism(profile, 'larva_01', 'STAGE_LARVA');

    // Profile 1: capacity 10.0
    const demand1 = calculateOrganismResourceDemand(larva, profile, 1.0);
    assert.equal(demand1.requested_amount, 10.0);

    // Mock Profile 2 with custom capacity 25.0
    const profile2 = JSON.parse(JSON.stringify(profile));
    profile2.nutrition_profile.base_intake_capacity_per_tick = 25.0;

    const demand2 = calculateOrganismResourceDemand(larva, profile2, 1.0);
    assert.equal(demand2.requested_amount, 25.0);

    // Scaled by deltaTime = 2.0 -> 50.0
    const demand3 = calculateOrganismResourceDemand(larva, profile2, 2.0);
    assert.equal(demand3.requested_amount, 50.0);

    // Profile with missing base_intake_capacity_per_tick throws, never falls back to 10.0
    const invalidProfile = JSON.parse(JSON.stringify(profile));
    delete invalidProfile.nutrition_profile.base_intake_capacity_per_tick;

    assert.throws(() => {
      calculateOrganismResourceDemand(larva, invalidProfile, 1.0);
    }, /speciesProfile\.nutrition_profile\.base_intake_capacity_per_tick must be a finite non-negative number/);
  });

  it('TC-TICK-26: Missing resource configuration fails explicitly (no food_resource conversion)', () => {
    const world = createTestWorld();
    world.registry.addOrganism(createTestOrganism(profile, 'org_01', 'STAGE_LARVA'));

    // Calling coordinator with no resource option and no world pool must throw explicitly
    assert.throws(() => {
      executePopulationBiologicalTick(world, 1.0, {
        species_profile: profile
      });
    }, /Population biological tick requires an explicit available_resource or ResourcePool/);

    // Verifies it does NOT invent food_resource * 100
    const env = world.getEnvironment();
    assert.equal(env.food_resource, 0.50); // Remains untouched
  });

  it('TC-TICK-27: Resource allocation commits exactly once (no double subtraction)', () => {
    const world = createTestWorld();
    world.registry.addOrganism(createTestOrganism(profile, 'org_01', 'STAGE_LARVA'));

    const pool = createResourcePool(100.0);
    assert.equal(pool.availableQuantity, 100.0);

    const result = executePopulationBiologicalTick(world, 1.0, {
      species_profile: profile,
      resource_pool: pool
    });

    const allocated = result.resource_allocation.allocations[0].allocated_amount;
    assert.equal(allocated, 10.0);

    // Pool must have exactly (100.0 - 10.0) = 90.0, NOT 80.0 (no double subtraction)
    assert.ok(Math.abs(pool.availableQuantity - 90.0) < EPSILON);
  });
});
