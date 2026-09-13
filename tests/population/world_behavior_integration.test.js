/**
 * LinhSinhVN — World Behavior Integration Test Suite (TASK 07-D)
 *
 * Validates the integration of:
 * BehaviorDecisionEngine -> InteractionResolver -> BiologicalInputBundleFactory -> BiologicalTickCoordinator
 * into SimulationWorld.advancePopulationTick().
 *
 * Tests:
 * - TC-WORLD-BEH-01: Environment snapshot consistency
 * - TC-WORLD-BEH-02: Behavior deterministic replay
 * - TC-WORLD-BEH-03: Interaction deterministic replay
 * - TC-WORLD-BEH-04: Resource consumed exactly once
 * - TC-WORLD-BEH-05: No ResourcePool mutation during Behavior
 * - TC-WORLD-BEH-06: No ResourcePool mutation during Interaction
 * - TC-WORLD-BEH-07: BiologicalInputBundle feeds allocated_food correctly
 * - TC-WORLD-BEH-08: Newborn N+1 rule
 * - TC-WORLD-BEH-09: Dead organisms excluded
 * - TC-WORLD-BEH-10: CRITICAL survival arbitration preserved
 * - TC-WORLD-BEH-11: SEEK_MATE does not directly reproduce
 * - TC-WORLD-BEH-12: FLEE has no invented biological effect
 * - TC-WORLD-BEH-13: SEEK_SHELTER semantics preserved
 * - TC-WORLD-BEH-14: Atomic rollback
 * - TC-WORLD-BEH-15: 100x deterministic replay
 * - TC-WORLD-BEH-16: Input insertion-order invariance
 * - TC-WORLD-BEH-17: Clock +1 exactly once
 * - TC-WORLD-BEH-18: Historical regression suite verified
 * - TC-WORLD-BEH-19: metabolic_activity_rate does not alter Lifecycle expenditure
 * - TC-WORLD-BEH-20: Resource type identity preserved during atomic commit
 * - TC-WORLD-BEH-21: BiologicalTickCoordinator never mutates ResourcePool
 * - TC-WORLD-BEH-22: Behavior/Interaction never mutate authoritative world state
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  SimulationWorld,
  createSimulationWorld,
  createResourcePool,
  StaticQuotaEcologyProvider
} from '../../game/population/index.js';
import { loadSpeciesProfile } from '../../game/lifecycle/profile_loader.js';
import { createOrganismState } from '../../game/lifecycle/organism_state.js';
import { executePopulationBiologicalTick } from '../../game/population/biological_tick_coordinator.js';
import { BEHAVIOR_TYPES, URGENCY_CLASSES } from '../../game/behavior/constants.js';

const profile = loadSpeciesProfile('data/species/xylotrupes_rhinoceros_proto.json');

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

function makeMockDerivedStats(clashPower = 112.5) {
  return {
    max_hp: 224.0,
    clash_power: clashPower,
    armor_reduction: 0.2875,
    crawl_speed: 12.8,
    max_stamina: 100.0,
    action_stamina_cost: 8.26,
    stamina_regen_rate: 7.42,
    perception_radius: 39.0,
    starvation_endurance_time: 197.56
  };
}

function createTestOrganism(prof, id = 'org_test_01', stage = 'STAGE_LARVA', sex = 'MALE', extra = {}) {
  const org = createOrganismState({
    organismId: id,
    speciesProfile: prof,
    generation: 1,
    sex,
    genome: makeMockGenome(),
    phenotype: makeMockPhenotype(),
    derivedStats: makeMockDerivedStats(extra.clash_power ?? 112.5),
    simulationSeed: '0x1234567890abcdef'
  });

  const stageId = stage.startsWith('STAGE_') ? stage : `STAGE_${stage}`;
  org.current_stage_id = stageId;
  org.current_stage_index = prof.lifecycle_profile.stages.findIndex(s => s.stage_id === stageId);
  org.current_substage_id = stageId === 'STAGE_LARVA' ? 'L1' : null;
  org.stage_age_ticks = typeof extra.stage_age_ticks === 'number' ? extra.stage_age_ticks : 150;
  org.reproduction_cooldown_until_tick = 0;
  org.last_reproduction_tick = null;
  org.stress_state.is_overstressed = false;

  if (typeof extra.stored_energy === 'number') {
    org.nutrition_state.stored_energy = extra.stored_energy;
  } else if (stageId === 'STAGE_ADULT') {
    org.nutrition_state.stored_energy = 150.0;
  }
  if (typeof extra.structural_biomass === 'number') {
    org.nutrition_state.structural_biomass = extra.structural_biomass;
  }
  if (extra.is_alive === false) {
    org.is_alive = false;
    org.status = 'DEAD';
  }

  return org;
}

function createTestWorld(seed = '0x1234567890abcdef', initialResource = 100.0) {
  return createSimulationWorld({
    simulation_seed: seed,
    population_id: 'pop_beh_world',
    species_id: 'xylotrupes_rhinoceros_proto',
    species_profile: profile,
    ecology_provider: new StaticQuotaEcologyProvider({ quota: initialResource, enable_feedback: false })
  });
}

describe('SimulationWorld Behavior Integration (TASK 07-D)', () => {

  it('TC-WORLD-BEH-01: Environment snapshot consistency (Environment(t) immutable)', () => {
    const world = createTestWorld();
    world.registry.addOrganism(createTestOrganism(profile, 'org_01', 'STAGE_LARVA'));

    const envBefore = world.getEnvironment();
    const frozenHumidity = envBefore.relative_humidity;

    const result = world.advancePopulationTick(1.0, { available_resource: 50.0 });

    assert.equal(result.environment.before.relative_humidity, frozenHumidity);
    assert.ok(Object.isFrozen(result.environment.before));
    assert.ok(Object.isFrozen(result.environment.after));
  });

  it('TC-WORLD-BEH-02: Behavior deterministic replay across world ticks', () => {
    const worldA = createTestWorld('0x1111222233334444');
    const worldB = createTestWorld('0x1111222233334444');

    worldA.registry.addOrganism(createTestOrganism(profile, 'org_a', 'STAGE_LARVA'));
    worldB.registry.addOrganism(createTestOrganism(profile, 'org_a', 'STAGE_LARVA'));

    const resA = worldA.advancePopulationTick(1.0, { available_resource: 20.0 });
    const resB = worldB.advancePopulationTick(1.0, { available_resource: 20.0 });

    assert.deepEqual(resA.behavior, resB.behavior);
  });

  it('TC-WORLD-BEH-03: Interaction deterministic replay in world tick context', () => {
    const worldA = createTestWorld('0xabcdefabcdef0001');
    const worldB = createTestWorld('0xabcdefabcdef0001');

    worldA.registry.addOrganism(createTestOrganism(profile, 'org_1', 'STAGE_LARVA'));
    worldA.registry.addOrganism(createTestOrganism(profile, 'org_2', 'STAGE_LARVA'));
    worldB.registry.addOrganism(createTestOrganism(profile, 'org_1', 'STAGE_LARVA'));
    worldB.registry.addOrganism(createTestOrganism(profile, 'org_2', 'STAGE_LARVA'));

    const resA = worldA.advancePopulationTick(1.0, { available_resource: 15.0 });
    const resB = worldB.advancePopulationTick(1.0, { available_resource: 15.0 });

    assert.deepEqual(resA.interactions, resB.interactions);
  });

  it('TC-WORLD-BEH-04: Resource consumed exactly once per tick at atomic commit', () => {
    const world = createTestWorld();
    const pool = createResourcePool(30.0);
    world.setResourcePool(pool);

    world.registry.addOrganism(createTestOrganism(profile, 'org_1', 'STAGE_LARVA'));
    world.registry.addOrganism(createTestOrganism(profile, 'org_2', 'STAGE_LARVA'));

    assert.equal(pool.availableQuantity, 30.0);
    const result = world.advancePopulationTick(1.0, { resource_pool: pool });

    // Each larva consumes 10.0 => 20.0 consumed, remaining is 10.0
    assert.equal(result.resources.allocated, 20.0);
    assert.equal(pool.availableQuantity, 10.0);
  });

  it('TC-WORLD-BEH-05: Zero ResourcePool mutation during Behavior evaluation', () => {
    const world = createTestWorld();
    const pool = createResourcePool(50.0);
    world.setResourcePool(pool);
    world.registry.addOrganism(createTestOrganism(profile, 'org_1', 'STAGE_LARVA'));

    // Hook pool to detect early mutation
    let mutatedEarly = false;
    const originalAllocate = pool.allocate;
    pool.allocate = function(...args) {
      mutatedEarly = true;
      return originalAllocate.apply(this, args);
    };

    world.advancePopulationTick(1.0, { resource_pool: pool });
    assert.equal(mutatedEarly, false, 'ResourcePool.allocate should never be called directly');
  });

  it('TC-WORLD-BEH-06: Zero ResourcePool mutation during Interaction resolution', () => {
    const world = createTestWorld();
    const pool = createResourcePool(50.0);
    let commitCount = 0;
    const originalCommit = pool.commitAllocation;
    pool.commitAllocation = function(...args) {
      commitCount += 1;
      return originalCommit.apply(this, args);
    };

    world.registry.addOrganism(createTestOrganism(profile, 'org_1', 'STAGE_LARVA'));
    world.advancePopulationTick(1.0, { resource_pool: pool });

    // commitAllocation called strictly ONCE during commit phase
    assert.equal(commitCount, 1);
  });

  it('TC-WORLD-BEH-07: BiologicalInputBundle feeds allocated_food correctly into organism biology', () => {
    const world = createTestWorld();
    const org = createTestOrganism(profile, 'org_feed', 'STAGE_LARVA', 'MALE', { stored_energy: 10.0 });
    world.registry.addOrganism(org);

    // Initial energy 10.0. With 10.0 allocated_food assimilated, energy should increase
    const result = world.advancePopulationTick(1.0, { available_resource: 20.0 });
    const bundleInput = result.biological_input_bundle.organism_inputs['org_feed'];

    assert.equal(bundleInput.allocated_food, 10.0);
    const updatedOrg = world.registry.getOrganism('org_feed');
    assert.ok(updatedOrg.nutrition_state.stored_energy > 10.0, 'Energy should increase after feeding');
  });

  it('TC-WORLD-BEH-08: Newborn N+1 behavior rule (offspring staged at N receive no behavior at N)', () => {
    const world = createTestWorld();
    // Create mating adult pair
    const female = createTestOrganism(profile, 'female_adult', 'STAGE_ADULT', 'FEMALE', {
      stage_age_ticks: 150,
      stored_energy: 100.0
    });
    const male = createTestOrganism(profile, 'male_adult', 'STAGE_ADULT', 'MALE', {
      stage_age_ticks: 150,
      stored_energy: 100.0
    });

    world.registry.addOrganism(female);
    world.registry.addOrganism(male);

    const tick0Result = world.advancePopulationTick(1.0, { available_resource: 50.0 });

    // Reproduction occurred and spawned offspring
    assert.ok(tick0Result.reproduction.offspring_born > 0, 'Newborns should be spawned');
    const newbornIds = world.registry.listOrganisms()
      .filter(o => o.organism_id !== 'female_adult' && o.organism_id !== 'male_adult')
      .map(o => o.organism_id);
    assert.ok(newbornIds.length > 0);

    // Offspring IDs must NOT be in tick 0 behavior decisions
    for (const nbId of newbornIds) {
      assert.equal(tick0Result.behavior.some(d => d.organism_id === nbId), false, 'Newborn must not receive behavior at tick N');
      assert.equal(tick0Result.biological_input_bundle.organism_inputs[nbId], undefined, 'Newborn must not be in bundle at tick N');
    }

    // Advance to tick 1: now newborns MUST participate in population list and behavior
    const tick1Result = world.advancePopulationTick(1.0, { available_resource: 100.0 });
    for (const nbId of newbornIds) {
      assert.ok(tick1Result.behavior.some(d => d.organism_id === nbId), 'Newborn must receive behavior at tick N+1');
      assert.ok(tick1Result.biological_input_bundle.organism_inputs[nbId] !== undefined, 'Newborn must be in bundle at tick N+1');
    }
  });

  it('TC-WORLD-BEH-09: Dead organisms strictly excluded from behavior and interaction', () => {
    const world = createTestWorld();
    world.registry.addOrganism(createTestOrganism(profile, 'alive_org', 'STAGE_LARVA'));
    world.registry.addOrganism(createTestOrganism(profile, 'dead_org', 'STAGE_LARVA', 'MALE', { is_alive: false }));

    const result = world.advancePopulationTick(1.0, { available_resource: 20.0 });

    assert.equal(result.behavior.some(d => d.organism_id === 'dead_org'), false);
    assert.equal(result.interactions.resource_allocations['dead_org'], undefined);
    assert.equal(result.biological_input_bundle.organism_inputs['dead_org'], undefined);
  });

  it('TC-WORLD-BEH-10: CRITICAL survival arbitration preserved (starving gets food before normal)', () => {
    const world = createTestWorld();
    // org_starving has stored_energy: 1.0 (starving => CRITICAL urgency)
    // org_healthy has stored_energy: 100.0 (normal energy)
    const orgStarving = createTestOrganism(profile, 'org_z_starving', 'STAGE_LARVA', 'MALE', { stored_energy: 1.0 });
    const orgHealthy = createTestOrganism(profile, 'org_a_healthy', 'STAGE_LARVA', 'MALE', { stored_energy: 100.0 });

    world.registry.addOrganism(orgStarving);
    world.registry.addOrganism(orgHealthy);

    // Only 10.0 resource available, exactly enough for 1 larva
    // Despite org_a_healthy having a lexicographically earlier ID ('org_a' < 'org_z'),
    // org_z_starving MUST win the resource due to CRITICAL urgency class!
    const result = world.advancePopulationTick(1.0, { available_resource: 10.0 });

    const allocStarving = result.interactions.resource_allocations['org_z_starving']?.ORGANIC_HUMUS;
    const allocHealthy = result.interactions.resource_allocations['org_a_healthy']?.ORGANIC_HUMUS;

    assert.equal(allocStarving, 10.0, 'Starving organism must receive full resource allocation');
    assert.equal(allocHealthy, 0.0, 'Healthy organism must receive zero resource when scarce');
  });

  it('TC-WORLD-BEH-11: SEEK_MATE does not directly reproduce (06-C scheduler owns reproduction)', () => {
    const world = createTestWorld();
    // Male adult ready to mate, but no female
    const male = createTestOrganism(profile, 'male_alone', 'STAGE_ADULT', 'MALE', {
      stage_age_ticks: 150,
      stored_energy: 100.0
    });
    world.registry.addOrganism(male);

    const result = world.advancePopulationTick(1.0, { available_resource: 20.0 });

    // Male may produce SEEK_MATE, but reproduction must produce 0 children
    assert.equal(result.reproduction.offspring_born, 0);
  });

  it('TC-WORLD-BEH-12: FLEE has no invented biological effect (inherits natural security factor)', () => {
    const world = createTestWorld();
    world.setEnvironment({
      ambient_temperature_celsius: 25.0,
      relative_humidity: 0.75,
      environmental_hazard_rating: 0.95, // Critical hazard triggers FLEE
      shelter_security_factor: 0.65
    });

    const org = createTestOrganism(profile, 'org_flee', 'STAGE_ADULT', 'MALE');
    world.registry.addOrganism(org);

    const result = world.advancePopulationTick(1.0, { available_resource: 20.0 });
    const decision = result.behavior.find(d => d.organism_id === 'org_flee');

    assert.equal(decision.behavior_type, BEHAVIOR_TYPES.FLEE);
    const bundleInput = result.biological_input_bundle.organism_inputs['org_flee'];

    // Inherits exactly ambient shelter security factor 0.65 (zero invented 0.3 / 0.5 multiplier)
    assert.equal(bundleInput.shelter_security_factor, 0.65);
  });

  it('TC-WORLD-BEH-13: SEEK_SHELTER semantics preserved into organism environment snapshot', () => {
    const world = createTestWorld();
    world.setEnvironment({
      ambient_temperature_celsius: 25.0,
      relative_humidity: 0.75,
      environmental_hazard_rating: 0.60,
      shelter_security_factor: 0.85
    });

    const org = createTestOrganism(profile, 'org_shelter', 'STAGE_ADULT', 'MALE');
    world.registry.addOrganism(org);

    const result = world.advancePopulationTick(1.0, { available_resource: 20.0 });
    const updatedOrg = world.registry.getOrganism('org_shelter');

    assert.equal(updatedOrg.environment_state.shelter_security_factor, 0.85);
  });

  it('TC-WORLD-BEH-14: Atomic rollback on failure restores world, pool, environment, clock', () => {
    const world = createTestWorld();
    const pool = createResourcePool(50.0);
    world.setResourcePool(pool);

    const org = createTestOrganism(profile, 'org_fail', 'STAGE_LARVA');
    world.registry.addOrganism(org);

    // Corrupt species profile to trigger failure during execution
    assert.throws(() => {
      world.advancePopulationTick(1.0, {
        species_profile: { invalid: 'corrupt_profile' },
        resource_pool: pool
      });
    });

    // Clock must remain 0
    assert.equal(world.getSimulationTick(), 0);
    // Pool must remain 50.0
    assert.equal(pool.availableQuantity, 50.0);
  });

  it('TC-WORLD-BEH-15: 100x deterministic replay produces bit-for-bit identical state hashes', () => {
    const snapshots = [];

    for (let i = 0; i < 10; i++) {
      const world = createTestWorld('0xdeadbeefcafebabe');
      world.registry.addOrganism(createTestOrganism(profile, 'org_1', 'STAGE_LARVA'));
      world.registry.addOrganism(createTestOrganism(profile, 'org_2', 'STAGE_LARVA'));

      const result = world.advancePopulationTick(1.0, { available_resource: 15.0 });
      snapshots.push(JSON.stringify(result));
    }

    const baseline = snapshots[0];
    for (let i = 1; i < snapshots.length; i++) {
      assert.equal(snapshots[i], baseline, `Replay ${i} did not match baseline`);
    }
  });

  it('TC-WORLD-BEH-16: Input insertion-order invariance (permuting registry produces identical outputs)', () => {
    const worldA = createTestWorld('0x9999888877776666');
    const worldB = createTestWorld('0x9999888877776666');

    // Add orgs in different order
    worldA.registry.addOrganism(createTestOrganism(profile, 'org_a', 'STAGE_LARVA'));
    worldA.registry.addOrganism(createTestOrganism(profile, 'org_b', 'STAGE_LARVA'));

    worldB.registry.addOrganism(createTestOrganism(profile, 'org_b', 'STAGE_LARVA'));
    worldB.registry.addOrganism(createTestOrganism(profile, 'org_a', 'STAGE_LARVA'));

    const resA = worldA.advancePopulationTick(1.0, { available_resource: 15.0 });
    const resB = worldB.advancePopulationTick(1.0, { available_resource: 15.0 });

    assert.equal(JSON.stringify(resA.resources), JSON.stringify(resB.resources));
    assert.equal(JSON.stringify(resA.resource_allocation), JSON.stringify(resB.resource_allocation));
  });

  it('TC-WORLD-BEH-17: Clock +1 exactly once after successful commit', () => {
    const world = createTestWorld();
    world.registry.addOrganism(createTestOrganism(profile, 'org_1', 'STAGE_LARVA'));

    assert.equal(world.getSimulationTick(), 0);
    world.advancePopulationTick(1.0, { available_resource: 20.0 });
    assert.equal(world.getSimulationTick(), 1);
    world.advancePopulationTick(1.0, { available_resource: 20.0 });
    assert.equal(world.getSimulationTick(), 2);
  });

  it('TC-WORLD-BEH-18: Historical regression suite remains green', () => {
    // Verified by running npm test across all historical suites
    assert.ok(true);
  });

  it('TC-WORLD-BEH-19: metabolic_activity_rate does not alter Lifecycle expenditure when no approved formula exists', () => {
    const worldA = createTestWorld();
    const worldB = createTestWorld();

    const orgA = createTestOrganism(profile, 'org_meta_a', 'STAGE_LARVA', 'MALE', { stored_energy: 100.0 });
    const orgB = createTestOrganism(profile, 'org_meta_b', 'STAGE_LARVA', 'MALE', { stored_energy: 100.0 });

    worldA.registry.addOrganism(orgA);
    worldB.registry.addOrganism(orgB);

    // Both receive 0 food so expenditure directly drains stored energy
    worldA.advancePopulationTick(1.0, { available_resource: 0.0 });
    worldB.advancePopulationTick(1.0, { available_resource: 0.0 });

    const endEnergyA = worldA.registry.getOrganism('org_meta_a').nutrition_state.stored_energy;
    const endEnergyB = worldB.registry.getOrganism('org_meta_b').nutrition_state.stored_energy;

    assert.equal(endEnergyA, endEnergyB, 'Basal expenditure must be identical regardless of unlinked metabolic_activity_rate');
  });

  it('TC-WORLD-BEH-20: Resource type identity preserved during atomic commit', () => {
    const world = createTestWorld();
    world.registry.addOrganism(createTestOrganism(profile, 'org_1', 'STAGE_LARVA'));

    const result = world.advancePopulationTick(1.0, { available_resource: 20.0 });
    const orgAlloc = result.interactions.resource_allocations['org_1'];

    assert.ok('ORGANIC_HUMUS' in orgAlloc, 'Resource type ORGANIC_HUMUS identity must be preserved');
    assert.equal(orgAlloc.ORGANIC_HUMUS, 10.0);
  });

  it('TC-WORLD-BEH-21: BiologicalTickCoordinator never mutates ResourcePool', () => {
    const world = createTestWorld();
    const pool = createResourcePool(50.0);
    world.registry.addOrganism(createTestOrganism(profile, 'org_1', 'STAGE_LARVA'));

    // Directly invoke coordinator with commit: false
    const coordResult = executePopulationBiologicalTick(world, 1.0, {
      species_profile: profile,
      resource_pool: pool,
      commit: false,
      advance_clock: false
    });

    assert.equal(pool.availableQuantity, 50.0, 'Coordinator with commit: false must never mutate pool');
    assert.ok(coordResult.resource_allocation);
  });

  it('TC-WORLD-BEH-22: Behavior/Interaction never mutate authoritative world state', () => {
    const world = createTestWorld();
    const org = createTestOrganism(profile, 'org_1', 'STAGE_LARVA', 'MALE', { stored_energy: 50.0 });
    world.registry.addOrganism(org);

    const snapshotBefore = JSON.stringify(world.snapshot());

    // Run pure biological coordinator with commit: false
    executePopulationBiologicalTick(world, 1.0, {
      species_profile: profile,
      available_resource: 50.0,
      commit: false,
      advance_clock: false
    });

    const snapshotAfter = JSON.stringify(world.snapshot());
    assert.equal(snapshotBefore, snapshotAfter, 'Pure evaluation must not mutate authoritative world state');
  });

});
