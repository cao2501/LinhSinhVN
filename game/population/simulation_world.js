/**
 * LinhSinhVN — Simulation World Coordinator
 *
 * Central coordinator for simulation clock, environment, species registry,
 * resource pool, and population registry.
 *
 * Implements:
 * - INVARIANT-POPTICK-01: PopulationRegistry is sole demographic source of truth.
 * - INVARIANT-POPTICK-02: Environment(t) is immutable input snapshot of tick N.
 * - INVARIANT-POPTICK-03: Ecology feedback creates Environment(t+1) and NEVER mutates Environment(t).
 * - INVARIANT-POPTICK-04: One World Tick advances SimulationClock exactly once (N -> N+1) at commit.
 * - INVARIANT-POPTICK-05: PopulationCensus is pure-derived.
 * - INVARIANT-POPTICK-06: ResourcePool and EnvironmentState are separate domain states.
 * - Single clock ownership & atomic rollback.
 */

import { SimulationClock, createSimulationClock } from './simulation_clock.js';
import { PopulationRegistry, createPopulationRegistry } from './population_registry.js';
import { createEnvironmentState, validateEnvironmentState } from './environment_state.js';
import { computePopulationTickSeed } from './seed_contract.js';
import { executePopulationBiologicalTick } from './biological_tick_coordinator.js';
import { SpeciesRegistry, createSpeciesRegistry } from './species_registry.js';
import { derivePopulationCensus } from './population_census.js';
import { createPopulationBreedingScheduler } from './population_breeding_scheduler.js';
import { canonicalizeEvents } from './event_canonicalizer.js';
import { applyReproductionDeltas } from '../lifecycle/organism_state.js';

import { createResourcePool } from './resource_pool.js';

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
   * @param {object} [config.species_profile] - Optional initial species profile to register
   * @param {object} [config.environment] - Optional initial environment state
   * @param {object} [config.ecology_provider] - Optional EcologyResourceProvider
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
      species_profile,
      environment = {},
      ecology_provider = null,
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

    // Species registry (generic lookup boundary)
    this._speciesRegistry = createSpeciesRegistry();
    if (species_profile) {
      this._speciesRegistry.register(species_profile);
    }

    // Ecology resource provider
    this._ecologyProvider = ecology_provider;

    // Environment state (defensively cloned and validated)
    this._environment = createEnvironmentState(environment);

    // Optional shared resource pool
    this._resourcePool = null;

    // Population breeding scheduler (TASK 06-C)
    this._breedingScheduler = createPopulationBreedingScheduler();
  }

  /**
   * Immutable simulation seed.
   * @returns {string}
   */
  get simulationSeed() {
    return this._simulationSeed;
  }

  /**
   * Access the underlying SimulationClock instance.
   * @returns {SimulationClock}
   */
  get clock() {
    return this._clock;
  }

  /**
   * Access the underlying PopulationRegistry instance.
   * @returns {PopulationRegistry}
   */
  get registry() {
    return this._population;
  }

  /**
   * Access the underlying SpeciesRegistry instance.
   * @returns {SpeciesRegistry}
   */
  get speciesRegistry() {
    return this._speciesRegistry;
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
   * Registers a species profile in the world's species registry.
   * @param {object} profile
   * @returns {Readonly<object>}
   */
  registerSpeciesProfile(profile) {
    return this._speciesRegistry.register(profile);
  }

  /**
   * Retrieves a species profile by species_id.
   * @param {string} speciesId
   * @returns {Readonly<object>}
   */
  getSpeciesProfile(speciesId) {
    return this._speciesRegistry.get(speciesId);
  }

  /**
   * Checks if a species profile is registered.
   * @param {string} speciesId
   * @returns {boolean}
   */
  hasSpeciesProfile(speciesId) {
    return this._speciesRegistry.has(speciesId);
  }

  /**
   * Configures the EcologyResourceProvider on the world.
   * @param {object|null} provider
   */
  setEcologyProvider(provider) {
    this._ecologyProvider = provider;
  }

  /**
   * Retrieves configured EcologyResourceProvider.
   * @returns {object|null}
   */
  getEcologyProvider() {
    return this._ecologyProvider;
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
   * Alias for getEnvironment().
   * @returns {Readonly<object>}
   */
  getEnvironmentState() {
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
   * NOTE: In TASK 06-A, this does NOT execute lifecycle or reproduction biology.
   *
   * @param {number} deltaTime - Positive delta time for this tick
   * @returns {number} The new simulation tick
   */
  advanceTick(deltaTime) {
    return this._clock.advance(deltaTime);
  }

  /**
   * Returns the optional shared ResourcePool, if one was configured.
   * @returns {object|null}
   */

  /**
   * Access the PopulationBreedingScheduler instance.
   * @returns {PopulationBreedingScheduler}
   */
  get breedingScheduler() {
    return this._breedingScheduler;
  }

  /**
   * Configure custom PopulationBreedingScheduler.
   * @param {PopulationBreedingScheduler} scheduler
   */
  setBreedingScheduler(scheduler) {
    this._breedingScheduler = scheduler;
  }

  getResourcePool() {
    return this._resourcePool || null;
  }

  /**
   * Sets the shared ResourcePool on the world.
   * @param {object} pool - ResourcePool instance
   */
  setResourcePool(pool) {
    this._resourcePool = pool;
  }

  /**
   * Forwarding method for TASK 06-B-02 coordinator.
   *
   * @param {number} deltaTime - Positive delta time
   * @param {object} options - Options containing mandatory species_profile
   * @returns {Readonly<object>} PopulationTickResult
   */
  advanceBiologicalTick(deltaTime, options = {}) {
    return executePopulationBiologicalTick(this, deltaTime, options);
  }

  /**
   * MASTER WORLD TICK DISPATCHER (TASK 06-B-03)
   *
   * Coordinates the complete world population tick pipeline:
   * 1. Environment(t) Snapshot
   * 2. EcologyResourceProvider resolves ResourcePool(t)
   * 3. BiologicalTickCoordinator evaluates all organisms
   * 4. Ecological feedback produces Environment(t+1) (never mutating Environment(t))
   * 5. Pure-derived PopulationCensus
   * 6. Atomic Commit: commits candidate states, updates environment, advances clock exactly once
   *
   * @param {number} deltaTime - Positive finite delta time
   * @param {object} [options={}] - Optional configuration
   * @returns {Readonly<object>} PopulationWorldTickResult conforming to population_world_tick_result.schema.json
   */
  advancePopulationTick(deltaTime, options = {}) {
    if (typeof deltaTime !== 'number' || !Number.isFinite(deltaTime) || deltaTime <= 0) {
      throw new TypeError(`deltaTime must be a positive finite number, received: ${deltaTime}`);
    }

    // INVARIANT-POPTICK-02: Environment(t) is immutable input snapshot of tick N
    const envBefore = this._environment;
    const currentTick = this._clock.tick;

    // Resolve species profile
    let speciesProfile = options.species_profile;
    if (!speciesProfile) {
      const popSpeciesId = this._population.speciesId;
      if (popSpeciesId && this._speciesRegistry.has(popSpeciesId)) {
        speciesProfile = this._speciesRegistry.get(popSpeciesId);
      }
    }
    if (!speciesProfile) {
      throw new Error(`SimulationWorld has no registered species profile for '${this._population.speciesId}'`);
    }

    // Resolve Ecology Resource Provider & ResourcePool(t)
    const provider = options.ecology_provider || this._ecologyProvider;
    let pool;
    let availableQuantity;

    if (typeof options.available_resource === 'number') {
      availableQuantity = options.available_resource;
      pool = createResourcePool(availableQuantity);
    } else if (options.resource_pool) {
      pool = options.resource_pool;
      availableQuantity = pool.availableQuantity;
    } else if (provider && typeof provider.provideResource === 'function') {
      availableQuantity = provider.provideResource(envBefore, { world: this, clock: this._clock });
      pool = createResourcePool(availableQuantity);
    } else if (this._resourcePool) {
      pool = this._resourcePool;
      availableQuantity = pool.availableQuantity;
    } else {
      throw new Error('Population world tick requires an explicit ecology_provider, available_resource, or ResourcePool');
    }

    // Pre-tick snapshot of all organisms for failure rollback and transition-level census derivation
    const preTickOrganisms = this._population.listOrganisms().map(org => JSON.parse(JSON.stringify(org)));
    const preTickMap = new Map(preTickOrganisms.map(org => [org.organism_id, org]));
    const prePoolQuantity = pool.availableQuantity;

    let bioCandidates = null;

    try {
      // -----------------------------------------------------------------
      // PHASE 2: Isolated Biological Evaluation (PLAN / STAGE ONLY, zero commit)
      // -----------------------------------------------------------------
      const coordResult = executePopulationBiologicalTick(this, deltaTime, {
        species_profile: speciesProfile,
        resource_pool: pool,
        advance_clock: false,
        commit: false, // ZERO mutation on authoritative PopulationRegistry or pool
        on_candidate_states: (clones) => {
          bioCandidates = clones;
        }
      });

      if (!bioCandidates) {
        throw new Error('Biological evaluation failed to produce candidate states');
      }

      // -----------------------------------------------------------------
      // PHASE 3: Population-Level Reproduction Planning (STAGE ONLY, zero commit)
      // -----------------------------------------------------------------
      // Evaluates candidates against POST-BIOLOGICAL candidate states (energy deducted from feeding/metabolism)
      const tickSeed = this.getPopulationTickSeed();
      const stagedRepro = this._breedingScheduler.stageBreedingPhase(
        bioCandidates,
        this._speciesRegistry,
        currentTick,
        tickSeed,
        options
      );

      // Resource summary invariants (Rule 6)
      const initial = coordResult.resource_allocation.initial_resource;
      const demanded = coordResult.resource_allocation.total_requested;
      const allocated = coordResult.resource_allocation.total_allocated;
      const remaining = coordResult.resource_allocation.remaining_resource;
      const unmet = demanded - allocated;

      if (allocated < 0 || allocated > demanded + 1e-9 || allocated > initial + 1e-9) {
        throw new Error(`Resource invariant violated: allocated (${allocated}) outside valid bounds`);
      }
      if (remaining < 0 || unmet < 0) {
        throw new Error('Resource invariant violated: remaining or unmet cannot be negative');
      }

      const consumptionSummary = {
        initial_resource: initial,
        total_requested: demanded,
        total_allocated: allocated,
        remaining_resource: remaining,
        unmet_demand: unmet
      };

      // -----------------------------------------------------------------
      // PHASE 4: INVARIANT-POPTICK-03 & Rule 7/8: Ecology Feedback Candidate
      // -----------------------------------------------------------------
      let envAfter;
      if (provider && options.ecology_enabled !== false) {
        envAfter = provider.applyFeedback(envBefore, consumptionSummary, { world: this });
      } else {
        envAfter = envBefore;
      }
      validateEnvironmentState(envAfter);

      // -----------------------------------------------------------------
      // PHASE 5: Full Preflight Validation
      // -----------------------------------------------------------------
      // (All preflight checks on biological states, deltas, and environment have passed)

      // =================================================================
      // PHASE 6: SINGLE ATOMIC COMMIT
      // =================================================================
      // 1. Commit biological candidate states to authoritative organisms
      for (const bioClone of bioCandidates) {
        const target = this._population.getOrganism(bioClone.organism_id);
        if (target) {
          Object.assign(target, bioClone);
        }
      }

      // 2. Commit parent reproduction deltas via applyReproductionDeltas
      for (const item of stagedRepro.stagedPlans) {
        const pProf = item.speciesProfile;
        const targetFemale = this._population.getOrganism(item.pair.female.organism_id);
        const targetMale = this._population.getOrganism(item.pair.male.organism_id);
        applyReproductionDeltas(targetFemale, item.plan.parent_deltas.parent_a, pProf);
        applyReproductionDeltas(targetMale, item.plan.parent_deltas.parent_b, pProf);
      }

      // 3. Register staged newborn offspring
      for (const child of stagedRepro.stagedChildren) {
        this._population.addOrganism(child);
      }

      // 4. Commit resource allocation to pool exactly once
      if (pool && typeof pool.commitAllocation === 'function') {
        pool.commitAllocation(coordResult.resource_allocation);
      }

      // 5. Update environment
      this._environment = deepFreeze(envAfter);

      // 6. Advance clock exactly once (INVARIANT-POPTICK-04)
      const nextTick = this._clock.advance(deltaTime);

      // 7. Canonicalize all events across biological and reproduction domains
      const allEvents = [...coordResult.events, ...(stagedRepro.stagedEvents || [])];
      const canonicalEvents = canonicalizeEvents(allEvents);

      // 8. Pure-derived PopulationCensus (INVARIANT-POPTICK-05)
      const census = derivePopulationCensus(preTickMap, this._population, currentTick);

      return Object.freeze({
        schema_version: '1.0.0',
        simulation_tick: currentTick,
        next_simulation_tick: nextTick,
        delta_time: deltaTime,
        environment: Object.freeze({
          before: envBefore,
          after: this._environment
        }),
        resources: Object.freeze({
          initial,
          demanded,
          allocated,
          unmet,
          remaining
        }),
        census,
        events: canonicalEvents,
        resource_allocation: coordResult.resource_allocation,
        organism_results: coordResult.organism_results,
        reproduction: stagedRepro.summary
      });
    } catch (err) {
      // TOTAL TRANSACTION ROLLBACK ON FAILURE
      // 1. Remove any newly added organisms (offspring)
      const currentList = this._population.listOrganisms();
      for (const org of currentList) {
        if (!preTickMap.has(org.organism_id)) {
          this._population.removeOrganism(org.organism_id);
        }
      }
      // 2. Restore pre-tick state for all pre-existing organisms
      for (const preOrg of preTickOrganisms) {
        const target = this._population.getOrganism(preOrg.organism_id);
        if (target) {
          for (const key of Object.keys(target)) {
            if (!(key in preOrg)) delete target[key];
          }
          Object.assign(target, JSON.parse(JSON.stringify(preOrg)));
        }
      }
      // 3. Restore pool
      if (pool && typeof pool._availableQuantity === 'number') {
        pool._availableQuantity = prePoolQuantity;
      }
      // 4. Environment remains envBefore
      this._environment = envBefore;
      // 5. Clock remains currentTick (N)
      throw err;
    }
  }

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
