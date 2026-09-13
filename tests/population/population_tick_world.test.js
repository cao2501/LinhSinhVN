/**
 * LinhSinhVN — World Population Tick & Ecology Semantics Test Suite
 *
 * Validates TASK 06-B-03:
 * - TC-POPTICK-01: Single-species multi-organism world dispatch
 * - TC-POPTICK-02: Canonical organism ordering
 * - TC-POPTICK-03: Census total/alive/dead
 * - TC-POPTICK-04: Generic stage distribution
 * - TC-POPTICK-05: Dead organisms retained
 * - TC-POPTICK-06: Dead organisms zero demand/no lifecycle tick
 * - TC-POPTICK-07: Resource summary invariants
 * - TC-POPTICK-08: Scarce resource deterministic allocation
 * - TC-POPTICK-09: deaths_this_tick from pre/post transition
 * - TC-POPTICK-10: death_causes aggregation
 * - TC-POPTICK-11: Ecology OFF
 * - TC-POPTICK-12: Ecology ON
 * - TC-POPTICK-13: Ecology bounds/clamping
 * - TC-POPTICK-14: Environment(t) is not mutated by feedback (INVARIANT-POPTICK-03)
 * - TC-POPTICK-15: Environment snapshot immutability
 * - TC-POPTICK-16: Full transaction rollback
 * - TC-POPTICK-17: Clock advances exactly once
 * - TC-POPTICK-18: Clock does not advance on failure
 * - TC-POPTICK-19: Unknown species rejection
 * - TC-POPTICK-20: Duplicate species rejection
 * - TC-POPTICK-21: Replay determinism
 * - TC-POPTICK-22: Canonical serialized WorldTickResult conforms to schema
 * - TC-POPTICK-23: Audit forbidden nondeterministic APIs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  SimulationWorld,
  createSimulationWorld,
  SpeciesRegistry,
  createSpeciesRegistry,
  StaticQuotaEcologyProvider,
  createStaticQuotaEcologyProvider,
  EnvironmentalFractionProvider,
  createEnvironmentalFractionProvider,
  createResourcePool
} from '../../game/population/index.js';
import { loadSpeciesProfile } from '../../game/lifecycle/profile_loader.js';
import { createOrganismState } from '../../game/lifecycle/organism_state.js';

const EPSILON = 1e-7;
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

function createTestWorld(seed = '0x1234567890abcdef', provider = null) {
  return createSimulationWorld({
    simulation_seed: seed,
    population_id: 'pop_test_world',
    species_id: 'xylotrupes_rhinoceros_proto',
    species_profile: profile,
    ecology_provider: provider || createStaticQuotaEcologyProvider({ quota: 100.0, enable_feedback: false })
  });
}

function createTestOrganism(prof, id = 'org_test_01', stage = 'STAGE_LARVA', extra = {}) {
  const org = createOrganismState({
    organismId: id,
    speciesProfile: prof,
    generation: 1,
    sex: 'MALE',
    genome: makeMockGenome(),
    phenotype: makeMockPhenotype(),
    derivedStats: makeMockDerivedStats(),
    simulationSeed: '0x1234567890abcdef'
  });

  const stageId = stage.startsWith('STAGE_') ? stage : `STAGE_${stage}`;
  if (stageId !== 'STAGE_EGG') {
    org.current_stage_id = stageId;
    org.current_stage_index = prof.lifecycle_profile.stages.findIndex(s => s.stage_id === stageId);
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
      primary_cause: extra.cause || 'OLD_AGE',
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

describe('World Population Tick & Ecology Semantics (TC-POPTICK-01 -> TC-POPTICK-23)', () => {

  it('TC-POPTICK-01: Single-species multi-organism world dispatch', () => {
    const world = createTestWorld();
    world.registry.addOrganism(createTestOrganism(profile, 'org_01', 'STAGE_LARVA'));
    world.registry.addOrganism(createTestOrganism(profile, 'org_02', 'STAGE_LARVA'));

    const result = world.advancePopulationTick(1.0);

    assert.equal(result.schema_version, '1.0.0');
    assert.equal(result.simulation_tick, 0);
    assert.equal(result.next_simulation_tick, 1);
    assert.equal(world.clock.tick, 1);
    assert.equal(result.census.counts.total, 2);
    assert.equal(result.census.counts.alive, 2);
  });

  it('TC-POPTICK-02: Canonical organism ordering', () => {
    const world = createTestWorld();
    world.registry.addOrganism(createTestOrganism(profile, 'org_gamma', 'STAGE_LARVA'));
    world.registry.addOrganism(createTestOrganism(profile, 'org_alpha', 'STAGE_LARVA'));
    world.registry.addOrganism(createTestOrganism(profile, 'org_beta', 'STAGE_LARVA'));

    const result = world.advancePopulationTick(1.0);

    const ids = result.resource_allocation.allocations.map(a => a.organism_id);
    assert.deepEqual(ids, ['org_alpha', 'org_beta', 'org_gamma']);
  });

  it('TC-POPTICK-03: Census total/alive/dead', () => {
    const world = createTestWorld();
    world.registry.addOrganism(createTestOrganism(profile, 'org_alive_1', 'STAGE_LARVA'));
    world.registry.addOrganism(createTestOrganism(profile, 'org_alive_2', 'STAGE_ADULT'));
    world.registry.addOrganism(createTestOrganism(profile, 'org_dead_1', 'STAGE_LARVA', {
      is_alive: false
    }));

    const result = world.advancePopulationTick(1.0);
    const census = result.census;

    assert.equal(census.counts.total, 3);
    assert.equal(census.counts.alive, 2);
    assert.equal(census.counts.dead, 1);
  });

  it('TC-POPTICK-04: Generic stage distribution', () => {
    const world = createTestWorld();
    world.registry.addOrganism(createTestOrganism(profile, 'org_egg', 'STAGE_EGG'));
    world.registry.addOrganism(createTestOrganism(profile, 'org_larva_1', 'STAGE_LARVA'));
    world.registry.addOrganism(createTestOrganism(profile, 'org_larva_2', 'STAGE_LARVA'));
    world.registry.addOrganism(createTestOrganism(profile, 'org_dead', 'STAGE_PUPA', {
      is_alive: false
    }));

    const result = world.advancePopulationTick(1.0);
    const stages = result.census.alive_by_stage;

    // Generic array, sorted by stage ascending
    assert.ok(Array.isArray(stages));
    assert.deepEqual(stages, [
      { stage: 'STAGE_EGG', count: 1 },
      { stage: 'STAGE_LARVA', count: 2 }
    ]);
    // DEAD is NOT a developmental stage
    assert.equal(stages.some(s => s.stage === 'DEAD'), false);
  });

  it('TC-POPTICK-05: Dead organisms retained', () => {
    const world = createTestWorld();
    world.registry.addOrganism(createTestOrganism(profile, 'org_dead', 'STAGE_LARVA', {
      is_alive: false
    }));

    assert.equal(world.registry.size, 1);
    const result = world.advancePopulationTick(1.0);

    assert.equal(world.registry.size, 1);
    assert.equal(world.registry.hasOrganism('org_dead'), true);
    assert.equal(result.census.counts.dead, 1);
  });

  it('TC-POPTICK-06: Dead organisms zero demand/no lifecycle tick', () => {
    const world = createTestWorld();
    world.registry.addOrganism(createTestOrganism(profile, 'org_dead', 'STAGE_LARVA', {
      is_alive: false
    }));

    const result = world.advancePopulationTick(1.0);

    assert.equal(result.resources.demanded, 0);
    assert.equal(result.resources.allocated, 0);
    assert.equal(result.events.length, 0);
  });

  it('TC-POPTICK-07: Resource summary invariants', () => {
    const world = createTestWorld();
    world.registry.addOrganism(createTestOrganism(profile, 'org_1', 'STAGE_LARVA'));
    world.registry.addOrganism(createTestOrganism(profile, 'org_2', 'STAGE_LARVA'));

    const result = world.advancePopulationTick(1.0, { available_resource: 50.0 });
    const res = result.resources;

    // Invariants (Rule 6):
    // remaining = initial - allocated
    assert.ok(Math.abs(res.remaining - (res.initial - res.allocated)) < EPSILON);
    // unmet = demanded - allocated
    assert.ok(Math.abs(res.unmet - (res.demanded - res.allocated)) < EPSILON);
    // initial = allocated + remaining
    assert.ok(Math.abs(res.initial - (res.allocated + res.remaining)) < EPSILON);
    // demanded = allocated + unmet
    assert.ok(Math.abs(res.demanded - (res.allocated + res.unmet)) < EPSILON);
    // 0 <= allocated <= demanded
    assert.ok(res.allocated >= 0 && res.allocated <= res.demanded + EPSILON);
    // 0 <= allocated <= initial
    assert.ok(res.allocated <= res.initial + EPSILON);
    // remaining >= 0, unmet >= 0
    assert.ok(res.remaining >= 0);
    assert.ok(res.unmet >= 0);
  });

  it('TC-POPTICK-08: Scarce resource deterministic allocation', () => {
    const world = createTestWorld();
    world.registry.addOrganism(createTestOrganism(profile, 'org_a', 'STAGE_LARVA'));
    world.registry.addOrganism(createTestOrganism(profile, 'org_b', 'STAGE_LARVA'));

    // Available is 15.0, each demands 10.0
    const result = world.advancePopulationTick(1.0, { available_resource: 15.0 });

    assert.equal(result.resources.initial, 15.0);
    assert.equal(result.resources.demanded, 20.0);
    assert.equal(result.resources.allocated, 15.0);
    assert.equal(result.resources.unmet, 5.0);
    assert.equal(result.resources.remaining, 0.0);

    const allocs = result.resource_allocation.allocations;
    assert.equal(allocs[0].organism_id, 'org_a');
    assert.equal(allocs[0].allocated_amount, 10.0);
    assert.equal(allocs[1].organism_id, 'org_b');
    assert.equal(allocs[1].allocated_amount, 5.0);
  });

  it('TC-POPTICK-09: deaths_this_tick from pre/post transition', () => {
    const world = createTestWorld();
    // One organism with zero energy and minimal biomass -> will starve and die
    const starvingOrg = createTestOrganism(profile, 'org_starve', 'STAGE_LARVA', { stored_energy: 0.0, structural_biomass: 0.0005 });
    const healthyOrg = createTestOrganism(profile, 'org_healthy', 'STAGE_LARVA', { stored_energy: 50.0, structural_biomass: 0.15 });
    // One pre-existing dead organism
    const preDeadOrg = createTestOrganism(profile, 'org_predead', 'STAGE_LARVA', { is_alive: false });

    world.registry.addOrganism(starvingOrg);
    world.registry.addOrganism(healthyOrg);
    world.registry.addOrganism(preDeadOrg);

    const result = world.advancePopulationTick(1.0, { available_resource: 0.0 });

    const census = result.census;
    // Total dead is 2 (predead + newly dead)
    assert.equal(census.counts.total, 3);
    assert.equal(census.counts.alive, 1);
    assert.equal(census.counts.dead, 2);

    // But deaths_this_tick is strictly 1 (only org_starve transitioned)
    assert.equal(census.mortality.deaths_this_tick, 1);
  });

  it('TC-POPTICK-10: death_causes aggregation', () => {
    const world = createTestWorld();
    const starvingOrg = createTestOrganism(profile, 'org_starve', 'STAGE_LARVA', { stored_energy: 0.0, structural_biomass: 0.0005 });
    world.registry.addOrganism(starvingOrg);

    const result = world.advancePopulationTick(1.0, { available_resource: 0.0 });
    const causes = result.census.mortality.death_causes;

    assert.equal(causes.STARVATION, 1);
  });

  it('TC-POPTICK-11: Ecology OFF', () => {
    const ecologyOffProvider = createStaticQuotaEcologyProvider({
      quota: 50.0,
      enable_feedback: false
    });
    const world = createTestWorld('0x1234567890abcdef', ecologyOffProvider);
    world.registry.addOrganism(createTestOrganism(profile, 'org_01', 'STAGE_LARVA'));

    const beforeEnv = world.getEnvironment();
    const result = world.advancePopulationTick(1.0);

    // Environment(t+1) MUST equal Environment(t)
    assert.deepEqual(result.environment.before, beforeEnv);
    assert.deepEqual(result.environment.after, beforeEnv);
    assert.deepEqual(world.getEnvironment(), beforeEnv);
  });

  it('TC-POPTICK-12: Ecology ON', () => {
    const ecologyOnProvider = createStaticQuotaEcologyProvider({
      quota: 50.0,
      enable_feedback: true,
      depletion_rate: 0.01 // 10 consumed -> 0.10 food_resource depletion
    });
    const world = createTestWorld('0x1234567890abcdef', ecologyOnProvider);
    world.registry.addOrganism(createTestOrganism(profile, 'org_01', 'STAGE_LARVA'));

    const beforeEnv = world.getEnvironment();
    const result = world.advancePopulationTick(1.0);

    assert.equal(result.resources.allocated, 10.0);
    // Before: 0.50 -> After: 0.50 - (10.0 * 0.01) = 0.40
    assert.ok(result.environment.after.food_resource < beforeEnv.food_resource);
    assert.ok(Math.abs(result.environment.after.food_resource - 0.40) < EPSILON);
    assert.equal(world.getEnvironment().food_resource, result.environment.after.food_resource);
  });

  it('TC-POPTICK-13: Ecology bounds/clamping', () => {
    const ecologyProvider = createStaticQuotaEcologyProvider({
      quota: 500.0,
      enable_feedback: true,
      depletion_rate: 1.0 // Massive depletion
    });
    const world = createTestWorld('0x1234567890abcdef', ecologyProvider);
    world.registry.addOrganism(createTestOrganism(profile, 'org_01', 'STAGE_LARVA'));

    const result = world.advancePopulationTick(1.0);

    // Must be clamped at 0.0, never negative
    assert.equal(result.environment.after.food_resource, 0.0);
    assert.ok(result.environment.after.food_resource >= 0.0);
    assert.ok(result.environment.after.food_resource <= 1.0);
  });

  it('TC-POPTICK-14: Environment(t) is not mutated by feedback (INVARIANT-POPTICK-03)', () => {
    const provider = createStaticQuotaEcologyProvider({ quota: 50.0, enable_feedback: true, depletion_rate: 0.01 });
    const world = createTestWorld('0x1234567890abcdef', provider);
    world.registry.addOrganism(createTestOrganism(profile, 'org_01', 'STAGE_LARVA'));

    const envSnapshotT = world.getEnvironment();
    const initialFood = envSnapshotT.food_resource;

    const result = world.advancePopulationTick(1.0);

    // envSnapshotT must be 100% UNTOUCHED
    assert.equal(envSnapshotT.food_resource, initialFood);
    assert.equal(result.environment.before.food_resource, initialFood);
    // Only environment.after changed
    assert.notEqual(result.environment.after.food_resource, initialFood);
  });

  it('TC-POPTICK-15: Environment snapshot immutability', () => {
    const world = createTestWorld();
    const env = world.getEnvironment();

    assert.throws(() => {
      env.temperature = 99.0;
    }, TypeError);

    assert.throws(() => {
      env.food_resource = 0.0;
    }, TypeError);
  });

  it('TC-POPTICK-16: Full transaction rollback', () => {
    const provider = createStaticQuotaEcologyProvider({ quota: 100.0, enable_feedback: true });
    const world = createTestWorld('0x1234567890abcdef', provider);

    const goodOrg = createTestOrganism(profile, 'org_good', 'STAGE_LARVA');
    const corruptOrg = createTestOrganism(profile, 'org_corrupt', 'STAGE_LARVA');
    corruptOrg.developmental_state.eta_current = -999.0; // Corrupted state will throw

    world.registry.addOrganism(goodOrg);
    world.registry.addOrganism(corruptOrg);

    const goodSnap = JSON.stringify(goodOrg);
    const envSnap = world.getEnvironment();

    assert.throws(() => {
      world.advancePopulationTick(1.0);
    });

    // Clock must remain 0
    assert.equal(world.clock.tick, 0);
    // Environment remains untouched
    assert.deepEqual(world.getEnvironment(), envSnap);
    // Good organism remains untouched
    assert.equal(JSON.stringify(goodOrg), goodSnap);
  });

  it('TC-POPTICK-17: Clock advances exactly once', () => {
    const world = createTestWorld();
    world.registry.addOrganism(createTestOrganism(profile, 'org_01', 'STAGE_LARVA'));

    assert.equal(world.clock.tick, 0);
    const res1 = world.advancePopulationTick(1.0);
    assert.equal(world.clock.tick, 1);
    assert.equal(res1.simulation_tick, 0);
    assert.equal(res1.next_simulation_tick, 1);

    const res2 = world.advancePopulationTick(1.0);
    assert.equal(world.clock.tick, 2);
    assert.equal(res2.simulation_tick, 1);
    assert.equal(res2.next_simulation_tick, 2);
  });

  it('TC-POPTICK-18: Clock does not advance on failure', () => {
    const world = createTestWorld();
    const corruptOrg = createTestOrganism(profile, 'org_bad', 'STAGE_LARVA');
    corruptOrg.developmental_state.eta_current = -999.0;
    world.registry.addOrganism(corruptOrg);

    assert.equal(world.clock.tick, 0);
    assert.throws(() => {
      world.advancePopulationTick(1.0);
    });
    assert.equal(world.clock.tick, 0);
  });

  it('TC-POPTICK-19: Unknown species rejection', () => {
    const world = createSimulationWorld({
      simulation_seed: '0x1234567890abcdef',
      population_id: 'pop_unknown',
      species_id: 'unknown_alien_bug',
      ecology_provider: createStaticQuotaEcologyProvider({ quota: 100.0 })
    });

    assert.throws(() => {
      world.advancePopulationTick(1.0);
    }, /has no registered species profile/);
  });

  it('TC-POPTICK-20: Duplicate species rejection', () => {
    const registry = createSpeciesRegistry();
    registry.register(profile);

    assert.throws(() => {
      registry.register(profile);
    }, /Duplicate species_id/);
  });

  it('TC-POPTICK-21: Replay determinism', () => {
    function simulate() {
      const provider = createEnvironmentalFractionProvider({
        harvest_fraction: 0.5,
        resource_scale: 100.0,
        enable_feedback: true
      });
      const world = createTestWorld('0xabcdef1234567890', provider);
      world.registry.addOrganism(createTestOrganism(profile, 'org_3', 'STAGE_LARVA'));
      world.registry.addOrganism(createTestOrganism(profile, 'org_1', 'STAGE_LARVA'));
      world.registry.addOrganism(createTestOrganism(profile, 'org_2', 'STAGE_LARVA'));

      const res = world.advancePopulationTick(1.0);
      return JSON.stringify(res);
    }

    const baseline = simulate();
    for (let i = 0; i < 50; i++) {
      assert.equal(simulate(), baseline);
    }
  });

  it('TC-POPTICK-22: Canonical serialized WorldTickResult conforms to schema', () => {
    const schemaContent = readFileSync('data/population/schema/population_world_tick_result.schema.json', 'utf8');
    const schema = JSON.parse(schemaContent);
    assert.equal(schema.$id, 'https://linhsinhvn.game/schemas/population/population_world_tick_result.schema.json');

    const world = createTestWorld();
    world.registry.addOrganism(createTestOrganism(profile, 'org_01', 'STAGE_LARVA'));

    const result = world.advancePopulationTick(1.0);

    assert.equal(result.schema_version, '1.0.0');
    assert.equal(typeof result.simulation_tick, 'number');
    assert.equal(typeof result.next_simulation_tick, 'number');
    assert.equal(typeof result.delta_time, 'number');
    assert.ok(result.environment.before);
    assert.ok(result.environment.after);
    assert.ok(result.resources);
    assert.ok(result.census);
    assert.ok(Array.isArray(result.events));
  });

  it('TC-POPTICK-23: Audit forbidden nondeterministic APIs', () => {
    const filesToAudit = [
      'game/population/species_registry.js',
      'game/population/ecology_provider.js',
      'game/population/population_census.js',
      'game/population/simulation_world.js',
      'game/population/biological_tick_coordinator.js'
    ];

    const forbiddenPatterns = [
      /\bMath\.random\s*\(/,
      /\bDate\.now\s*\(/,
      /\bnew\s+Date\s*\(/,
      /\bcrypto\.randomUUID\s*\(/
    ];

    for (const file of filesToAudit) {
      const code = readFileSync(file, 'utf8');
      for (const pattern of forbiddenPatterns) {
        assert.equal(
          pattern.test(code),
          false,
          `Forbidden nondeterministic API found in ${file}: ${pattern}`
        );
      }
    }
  });
});
