/**
 * LinhSinhVN — Population Biological Tick Coordinator
 *
 * Orchestrates headless, deterministic multi-organism lifecycle simulation ticks.
 * Coordinates Environment Snapshot, Resource Demand, Pure Allocation,
 * Isolated Biological Evaluation, and Atomic Commit.
 *
 * Guaranteed:
 * - 5-Phase Transactional Pipeline
 * - Zero hardcoded intake constants (data-driven via speciesProfile.nutrition_profile)
 * - EnvironmentState.food_resource is strictly READ-ONLY (no arbitrary unit conversions)
 * - True failure atomicity across Organisms, ResourcePool, and SimulationClock
 * - Dead organisms remain in PopulationRegistry (DEATH != REMOVE) and are skipped
 * - Zero RNG dependencies; canonical organism_id ordering
 */

import { LifecycleRuntime } from '../lifecycle/lifecycle_runtime.js';
import { toLifecycleEnvironment } from './environment_state.js';
import { createResourceDemand } from './resource_demand.js';
import { allocateResourceDemands } from './resource_pool.js';

/**
 * Calculates the resource demand for a single organism according to its stage
 * and the configured data-driven intake capacity in speciesProfile.
 *
 * @param {object} organismState - Current organism state
 * @param {object} speciesProfile - Species profile containing lifecycle and nutrition profiles
 * @param {number} deltaTime - Discrete delta time
 * @returns {Readonly<{ organism_id: string, requested_amount: number }>} Validated ResourceDemand
 * @throws {TypeError} If speciesProfile lacks valid nutrition configuration
 */
export function calculateOrganismResourceDemand(organismState, speciesProfile, deltaTime) {
  if (!organismState || typeof organismState !== 'object') {
    throw new TypeError('organismState must be a non-null object');
  }
  const orgId = organismState.organism_id || 'unknown';
  if (!organismState.is_alive) {
    return createResourceDemand(orgId, 0.0);
  }
  if (!speciesProfile || typeof speciesProfile !== 'object') {
    throw new TypeError('speciesProfile must be a non-null object');
  }

  const stages = speciesProfile.lifecycle_profile?.stages;
  if (!Array.isArray(stages)) {
    throw new TypeError('speciesProfile must contain lifecycle_profile.stages array');
  }

  const currentStage = stages.find(s => s.stage_id === organismState.current_stage_id);
  if (!currentStage || !currentStage.is_feeding_stage) {
    return createResourceDemand(orgId, 0.0);
  }

  const dietMatrix = speciesProfile.nutrition_profile?.stage_diet_matrix;
  const stageDiet = dietMatrix ? dietMatrix[organismState.current_stage_id] : null;
  if (!Array.isArray(stageDiet) || stageDiet.length === 0) {
    return createResourceDemand(orgId, 0.0);
  }

  const intakeCapacity = speciesProfile.nutrition_profile?.base_intake_capacity_per_tick;
  if (typeof intakeCapacity !== 'number' || !Number.isFinite(intakeCapacity) || intakeCapacity < 0) {
    throw new TypeError('speciesProfile.nutrition_profile.base_intake_capacity_per_tick must be a finite non-negative number');
  }

  return createResourceDemand(orgId, intakeCapacity * deltaTime);
}

/**
 * Executes a single deterministic population biological tick across all alive organisms.
 *
 * @param {object} world - SimulationWorld instance
 * @param {number} deltaTime - Positive delta time
 * @param {object} options - Options containing species_profile and resource configuration
 * @param {object} options.species_profile - Mandatory species profile
 * @param {number} [options.available_resource] - Explicit available resource quantity
 * @param {object} [options.resource_pool] - Optional ResourcePool instance
 * @returns {Readonly<object>} PopulationTickResult
 * @throws {Error} If inputs are invalid or any organism tick fails
 */
export function executePopulationBiologicalTick(world, deltaTime, options = {}) {
  if (!world || typeof world !== 'object') {
    throw new TypeError('world must be a non-null SimulationWorld object');
  }
  if (typeof deltaTime !== 'number' || !Number.isFinite(deltaTime) || deltaTime <= 0) {
    throw new TypeError(`deltaTime must be a positive finite number, received: ${deltaTime}`);
  }

  const speciesProfile = options.species_profile;
  if (!speciesProfile || typeof speciesProfile !== 'object') {
    throw new TypeError('species_profile must be provided in options');
  }

  // Resolve available resource without arbitrary unit conversions
  let availableResource;
  let activePool = null;

  if (typeof options.available_resource === 'number') {
    if (!Number.isFinite(options.available_resource) || options.available_resource < 0) {
      throw new TypeError('options.available_resource must be a finite non-negative number');
    }
    availableResource = options.available_resource;
  } else if (options.resource_pool && typeof options.resource_pool.availableQuantity === 'number') {
    availableResource = options.resource_pool.availableQuantity;
    activePool = options.resource_pool;
  } else if (typeof world.getResourcePool === 'function' && world.getResourcePool()) {
    availableResource = world.getResourcePool().availableQuantity;
    activePool = world.getResourcePool();
  } else {
    throw new Error('Population biological tick requires an explicit available_resource or ResourcePool');
  }

  // -----------------------------------------------------------------
  // PHASE A: Snapshot & Pre-flight
  // -----------------------------------------------------------------
  const currentTick = world.getSimulationTick();
  const envSnapshot = world.getEnvironment(); // Immutable environment state
  const lifecycleEnv = toLifecycleEnvironment(envSnapshot);
  const popRegistry = world.getPopulation();

  // All organisms in canonical order (organism_id ascending)
  const allOrganisms = popRegistry.listOrganisms();

  // Filter alive organisms; dead organisms are strictly skipped
  const aliveOrganisms = allOrganisms.filter(org => org.is_alive === true);

  // -----------------------------------------------------------------
  // PHASE B: Demand Generation
  // -----------------------------------------------------------------
  const demands = [];
  for (const org of aliveOrganisms) {
    const demand = calculateOrganismResourceDemand(org, speciesProfile, deltaTime);
    demands.push(demand);
  }

  // -----------------------------------------------------------------
  // PHASE C: PURE Resource Allocation
  // -----------------------------------------------------------------
  // Pure mathematical allocation: does NOT mutate activePool or world state
  const allocationResult = allocateResourceDemands(availableResource, demands);
  const allocationMap = new Map(
    allocationResult.allocations.map(a => [a.organism_id, a.allocated_amount])
  );

  // -----------------------------------------------------------------
  // PHASE D: Isolated Biological Evaluation
  // -----------------------------------------------------------------
  // Evaluate all organisms against isolated clones of pre-tick state
  const evaluatedClones = [];
  const organismResults = [];
  const aggregatedEvents = [];

  for (const org of aliveOrganisms) {
    const allocatedAmount = allocationMap.get(org.organism_id) || 0.0;
    const stageDiet = speciesProfile.nutrition_profile?.stage_diet_matrix?.[org.current_stage_id] || [];
    const primaryResource = stageDiet[0] || 'ORGANIC_HUMUS';

    const resources = allocatedAmount > 0
      ? [{ resource_id: primaryResource, quantity: allocatedAmount }]
      : [];

    const tickInput = {
      deltaTime,
      environment: lifecycleEnv,
      resources
    };

    // Deep clone pre-tick state to guarantee failure atomicity and same-tick isolation
    const stateClone = JSON.parse(JSON.stringify(org));
    const runtime = new LifecycleRuntime(stateClone, speciesProfile);

    // May throw if organism state is corrupted or invalid
    const tickResult = runtime.tick(tickInput);

    evaluatedClones.push(stateClone);
    organismResults.push(Object.freeze({
      organism_id: stateClone.organism_id,
      is_alive: stateClone.is_alive,
      status: stateClone.status,
      current_stage_id: stateClone.current_stage_id,
      current_substage_id: stateClone.current_substage_id,
      snapshot: tickResult.snapshot
    }));

    // Aggregate events in canonical order
    if (Array.isArray(tickResult.events)) {
      for (const ev of tickResult.events) {
        aggregatedEvents.push(ev);
      }
    }
  }

  // -----------------------------------------------------------------
  // PHASE E: Validation + Atomic Commit
  // -----------------------------------------------------------------
  // If any error occurred in Phase D, execution would not reach Phase E.
  // Commit all updated organism states to PopulationRegistry
  for (const updatedClone of evaluatedClones) {
    // Retain object reference or replace in registry
    const target = popRegistry.getOrganism(updatedClone.organism_id);
    if (target) {
      // Overwrite target in-place with validated state clone
      Object.assign(target, updatedClone);
    }
  }

  // Commit resource allocation to pool exactly once (no double subtraction)
  if (activePool && typeof activePool.commitAllocation === 'function') {
    activePool.commitAllocation(allocationResult);
  }

  // Advance SimulationClock by exactly +1 tick
  const nextTick = world.advanceTick(deltaTime);

  return Object.freeze({
    schema_version: '1.0.0',
    population_id: popRegistry.populationId,
    simulation_tick: currentTick,
    next_simulation_tick: nextTick,
    delta_time: deltaTime,
    environment_snapshot: envSnapshot,
    resource_allocation: allocationResult,
    organism_results: Object.freeze(organismResults),
    events: Object.freeze(aggregatedEvents)
  });
}
