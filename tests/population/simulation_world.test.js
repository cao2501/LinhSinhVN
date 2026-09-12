/**
 * LinhSinhVN — SimulationWorld Unit & Integration Tests
 *
 * Tests TC-POP-08 through TC-POP-16.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createSimulationWorld } from '../../game/population/simulation_world.js';
import { createSimulationClock } from '../../game/population/simulation_clock.js';
import { computePopulationTickSeed } from '../../game/population/seed_contract.js';

const MASTER_SEED = '0x024aa8a38b63e1b2';
const POP_ID = 'pop_xylotrupes_01';
const SPECIES_ID = 'xylotrupes_rhinoceros_proto';

function createMockOrganism(id, isAlive = true) {
  return {
    organism_id: id,
    species_id: SPECIES_ID,
    is_alive: isAlive,
    status: isAlive ? 'ALIVE' : 'DEAD',
    simulation_tick: 0,
    chronological_age_ticks: 0,
    nutrition_state: { stored_energy: 100.0, structural_biomass: 0.05 },
    developmental_state: { eta_current: 0.95 },
    reproduction_cooldown_until_tick: 0,
    last_reproduction_tick: null
  };
}

describe('SimulationWorld & SimulationClock (TC-POP-08 -> TC-POP-16)', () => {
  it('TC-POP-08: Simulation clock starts deterministically', () => {
    const clockDefault = createSimulationClock();
    assert.equal(clockDefault.tick, 0);
    assert.equal(clockDefault.lastDeltaTime, null);

    const clockCustom = createSimulationClock(100);
    assert.equal(clockCustom.tick, 100);
    assert.equal(clockCustom.lastDeltaTime, null);

    const world = createSimulationWorld({
      simulation_seed: MASTER_SEED,
      population_id: POP_ID,
      species_id: SPECIES_ID,
      initial_tick: 50
    });
    assert.equal(world.getSimulationTick(), 50);
  });

  it('TC-POP-09: advanceTick increments exactly once', () => {
    const world = createSimulationWorld({
      simulation_seed: MASTER_SEED,
      population_id: POP_ID,
      species_id: SPECIES_ID,
      initial_tick: 0
    });

    assert.equal(world.getSimulationTick(), 0);

    const tick1 = world.advanceTick(1.0);
    assert.equal(tick1, 1);
    assert.equal(world.getSimulationTick(), 1);

    const tick2 = world.advanceTick(10.5);
    assert.equal(tick2, 2);
    assert.equal(world.getSimulationTick(), 2);

    const tick3 = world.advanceTick(0.1);
    assert.equal(tick3, 3);
    assert.equal(world.getSimulationTick(), 3);
  });

  it('TC-POP-10: invalid delta_time is rejected', () => {
    const world = createSimulationWorld({
      simulation_seed: MASTER_SEED,
      population_id: POP_ID,
      species_id: SPECIES_ID
    });

    assert.throws(() => world.advanceTick(0), /deltaTime must be a positive finite number/);
    assert.throws(() => world.advanceTick(-1.0), /deltaTime must be a positive finite number/);
    assert.throws(() => world.advanceTick(NaN), /deltaTime must be a positive finite number/);
    assert.throws(() => world.advanceTick(Infinity), /deltaTime must be a positive finite number/);
    assert.throws(() => world.advanceTick('1.0'), /deltaTime must be a positive finite number/);
    assert.throws(() => world.advanceTick(null), /deltaTime must be a positive finite number/);

    // Tick did not advance after rejected calls
    assert.equal(world.getSimulationTick(), 0);
  });

  it('TC-POP-11: simulation seed is immutable', () => {
    const world = createSimulationWorld({
      simulation_seed: MASTER_SEED,
      population_id: POP_ID,
      species_id: SPECIES_ID
    });

    assert.equal(world.simulationSeed, MASTER_SEED);

    // Attempting to overwrite property should throw (or be ignored in non-strict, but throwing via getter-only)
    assert.throws(() => {
      world.simulationSeed = '0x9999999999999999';
    }, TypeError);

    assert.equal(world.simulationSeed, MASTER_SEED);
  });

  it('TC-POP-12: PopulationTickSeed is deterministic', () => {
    const seedA = computePopulationTickSeed(MASTER_SEED, POP_ID, 0);
    const seedB = computePopulationTickSeed(MASTER_SEED, POP_ID, 0);

    assert.equal(typeof seedA, 'string');
    assert.match(seedA, /^0x[0-9a-fA-F]{16}$/);
    assert.equal(seedA, seedB);

    const world = createSimulationWorld({
      simulation_seed: MASTER_SEED,
      population_id: POP_ID,
      species_id: SPECIES_ID
    });

    assert.equal(world.getPopulationTickSeed(), seedA);
  });

  it('TC-POP-13: Insertion-order invariant canonical serialization', () => {
    // Construct World A with insertion: C -> A -> B
    const worldA = createSimulationWorld({
      simulation_seed: MASTER_SEED,
      population_id: POP_ID,
      species_id: SPECIES_ID
    });
    worldA.getPopulation().addOrganism(createMockOrganism('org_C', true));
    worldA.getPopulation().addOrganism(createMockOrganism('org_A', true));
    worldA.getPopulation().addOrganism(createMockOrganism('org_B', false));

    // Construct World B with insertion: B -> C -> A
    const worldB = createSimulationWorld({
      simulation_seed: MASTER_SEED,
      population_id: POP_ID,
      species_id: SPECIES_ID
    });
    worldB.getPopulation().addOrganism(createMockOrganism('org_B', false));
    worldB.getPopulation().addOrganism(createMockOrganism('org_C', true));
    worldB.getPopulation().addOrganism(createMockOrganism('org_A', true));

    // Advance both by 1 tick with identical deltaTime
    worldA.advanceTick(1.0);
    worldB.advanceTick(1.0);

    const snapA = worldA.snapshot();
    const snapB = worldB.snapshot();

    // Verify organism ordering in snapshot is canonically A, B, C
    assert.deepEqual(
      snapA.population.organisms.map(o => o.organism_id),
      ['org_A', 'org_B', 'org_C']
    );
    assert.deepEqual(
      snapB.population.organisms.map(o => o.organism_id),
      ['org_A', 'org_B', 'org_C']
    );

    // Byte-for-byte serialization identity
    const jsonA = JSON.stringify(snapA);
    const jsonB = JSON.stringify(snapB);
    assert.equal(jsonA, jsonB);
  });

  it('TC-POP-14: different simulation tick produces different PopulationTickSeed', () => {
    const seedTick0 = computePopulationTickSeed(MASTER_SEED, POP_ID, 0);
    const seedTick1 = computePopulationTickSeed(MASTER_SEED, POP_ID, 1);
    const seedTick2 = computePopulationTickSeed(MASTER_SEED, POP_ID, 2);

    assert.notEqual(seedTick0, seedTick1);
    assert.notEqual(seedTick1, seedTick2);
    assert.notEqual(seedTick0, seedTick2);
  });

  it('TC-POP-15: environment validation rejects invalid values and defensive copy prevents external mutation', () => {
    const world = createSimulationWorld({
      simulation_seed: MASTER_SEED,
      population_id: POP_ID,
      species_id: SPECIES_ID
    });

    // Rejection of out of bound temperature
    assert.throws(
      () => world.setEnvironment({ temperature: 70.0 }),
      /temperature must be within \[-20.0, 60.0\]/
    );

    // Rejection of out of bound humidity
    assert.throws(
      () => world.setEnvironment({ humidity: 1.5 }),
      /humidity must be within \[0.0, 1.0\]/
    );

    // Rejection of invalid season
    assert.throws(
      () => world.setEnvironment({ season: 'NUCLEAR_WINTER' }),
      /season must be one of/
    );

    // Defensive copy test
    const externalEnv = {
      temperature: 28.0,
      humidity: 0.85,
      food_resource: 0.60,
      season: 'MONSOON'
    };

    world.setEnvironment(externalEnv);
    assert.equal(world.getEnvironment().temperature, 28.0);
    assert.equal(world.getEnvironment().season, 'MONSOON');

    // Mutating externalEnv must NOT mutate world environment
    externalEnv.temperature = -10.0;
    externalEnv.season = 'DRY';
    assert.equal(world.getEnvironment().temperature, 28.0);
    assert.equal(world.getEnvironment().season, 'MONSOON');

    // Returned environment is frozen
    assert.throws(() => {
      world.getEnvironment().temperature = 30.0;
    });
  });

  it('TC-POP-16: world does NOT execute lifecycle/reproduction during advanceTick yet', () => {
    const world = createSimulationWorld({
      simulation_seed: MASTER_SEED,
      population_id: POP_ID,
      species_id: SPECIES_ID
    });

    const org = createMockOrganism('org_immobile', true);
    world.getPopulation().addOrganism(org);

    // Advance world clock by 10 ticks
    for (let i = 0; i < 10; i++) {
      world.advanceTick(1.0);
    }

    assert.equal(world.getSimulationTick(), 10);

    // Organism within world must have zero biological advancement
    const storedOrg = world.getPopulation().getOrganism('org_immobile');
    assert.equal(storedOrg.simulation_tick, 0);
    assert.equal(storedOrg.chronological_age_ticks, 0);
    assert.equal(storedOrg.nutrition_state.stored_energy, 100.0);
    assert.equal(storedOrg.reproduction_cooldown_until_tick, 0);
    assert.equal(storedOrg.last_reproduction_tick, null);
  });
});
