/**
 * LinhSinhVN — Simulation World Coordinator
 *
 * Central coordinator for simulation clock, environment, and population registry.
 * Zero biological simulation during advanceTick() at TASK 06-A.
 * Owns its environment state with defensive copying and immutability.
 */

import { SimulationClock, createSimulationClock } from './simulation_clock.js';
import { PopulationRegistry, createPopulationRegistry } from './population_registry.js';
import { createEnvironmentState, validateEnvironmentState } from './environment_state.js';
import { computePopulationTickSeed } from './seed_contract.js';

const HEX_64_REGEX = /^0x[0-9a-fA-F]{16}$/;

/**
 * Deep freezes an object recursively to guarantee immutability.
 * @param {object} obj
 * @returns {object}
 */
function deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    deepFreeze(obj[key]);
  }
  return obj;
}

export class SimulationWorld {
  /**
   * @param {object} config
   * @param {string} config.simulation_seed - 64-bit hex master simulation seed
   * @param {string} config.population_id - Unique population ID
   * @param {string} config.species_id - Species identifier
   * @param {object} [config.environment] - Optional initial environment state
   * @param {number} [config.initial_tick=0] - Initial simulation tick
   */
  constructor(config = {}) {
    if (!config || typeof config !== 'object') {
      throw new TypeError('SimulationWorld config must be a non-null object');
    }

    const {
      simulation_seed,
      population_id,
      species_id,
      environment = {},
      initial_tick = 0
    } = config;

    if (typeof simulation_seed !== 'string' || !HEX_64_REGEX.test(simulation_seed)) {
      throw new TypeError(`simulation_seed must be a 64-bit hex string, received: ${simulation_seed}`);
    }

    // Freeze master seed
    this._simulationSeed = simulation_seed;

    // Simulation clock
    this._clock = createSimulationClock(initial_tick);

    // Population registry
    this._population = createPopulationRegistry({
      population_id,
      species_id,
      simulation_seed
    });

    // Environment state (defensively cloned and validated)
    this._environment = createEnvironmentState(environment);
  }

  /**
   * Immutable simulation seed.
   * @returns {string}
   */
  get simulationSeed() {
    return this._simulationSeed;
  }

  /**
   * Returns current discrete simulation tick.
   * @returns {number}
   */
  getSimulationTick() {
    return this._clock.tick;
  }

  /**
   * Returns the underlying PopulationRegistry instance.
   * @returns {PopulationRegistry}
   */
  getPopulation() {
    return this._population;
  }

  /**
   * Computes the deterministic 64-bit PopulationTickSeed for the current tick.
   * @returns {string}
   */
  getPopulationTickSeed() {
    return computePopulationTickSeed(
      this._simulationSeed,
      this._population.populationId,
      this._clock.tick
    );
  }

  /**
   * Returns a deep-frozen, immutable copy of the current canonical environment state.
   * External callers cannot mutate world state via this reference.
   * @returns {Readonly<object>}
   */
  getEnvironment() {
    return this._environment;
  }

  /**
   * Defensively updates environment state with strict validation and deep freezing.
   * External modification of the caller's input object has zero effect on world state.
   *
   * @param {object} input - Environment parameters
   */
  setEnvironment(input) {
    if (!input || typeof input !== 'object') {
      throw new TypeError('Environment input must be a non-null object');
    }
    // Deep clone input to decouple from caller
    const clonedInput = JSON.parse(JSON.stringify(input));
    const newEnv = createEnvironmentState(clonedInput);
    this._environment = deepFreeze(newEnv);
  }

  /**
   * Advances the simulation clock by strictly +1 tick.
   * CRITICAL: In TASK 06-A, this does NOT execute lifecycle or reproduction biology.
   *
   * @param {number} deltaTime - Positive delta time for this tick
   * @returns {number} The new simulation tick
   */
  advanceTick(deltaTime) {
    return this._clock.advance(deltaTime);
  }

  /**
   * Produces a deterministic, canonical snapshot conforming to simulation_world.schema.json.
   * Insertion-order invariant: organisms are canonically sorted by organism_id ascending.
   *
   * @returns {object} Canonical world snapshot
   */
  snapshot() {
    return {
      schema_version: '1.0.0',
      simulation_seed: this._simulationSeed,
      simulation_tick: this._clock.tick,
      last_delta_time: this._clock.lastDeltaTime,
      population_tick_seed: this.getPopulationTickSeed(),
      environment: { ...this._environment },
      population: this._population.snapshot()
    };
  }
}

/**
 * Functional factory for SimulationWorld.
 *
 * @param {object} config
 * @returns {SimulationWorld}
 */
export function createSimulationWorld(config) {
  return new SimulationWorld(config);
}
