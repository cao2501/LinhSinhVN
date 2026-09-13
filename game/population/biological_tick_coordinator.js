/**
 * LinhSinhVN — Population Biological Tick Coordinator
 *
 * Implements the atomic, deterministic execution pipeline for ticking all organisms
 * in a PopulationRegistry within a SimulationWorld.
 *
 * Enforces:
 * - 5-Phase Transaction: Snapshot -> Demand -> Pure Allocation -> Isolated Biological Evaluation -> Atomic Commit
 * - Same-tick isolation: Evaluates all organisms against isolated pre-tick state
 * - Pure resource allocation: Computes allocation without mutating ResourcePool until Phase E
 * - Dead organism semantics: Dead organisms remain registered, generate zero demand, consume zero resources,
 *   execute no lifecycle ticks, and emit no events
 * - Data-driven intake capacity: Derives demand exclusively from species profile and deltaTime
 * - Total transaction atomicity: Entire tick rolls back on any organism evaluation failure
 * - Single clock advancement ownership
 */

import { toLifecycleEnvironment } from './environment_state.js';
import { createResourceDemand } from './resource_demand.js';
import { allocateResourceDemands } from './resource_pool.js';
import { LifecycleRuntime } from '../lifecycle/lifecycle_runtime.js';

/**
 * Derives resource demand for a single organism.
 *
 * @param {object} organismState - Canonical organism state
 * @param {object} speciesProfile - Canonical species profile
 * @param {number} deltaTime - Discrete tick delta time
 * @returns {object} ResourceDemand conforming to resource_allocation.schema.json
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
 * @param {object} [options.species_profile] - Species profile (optional if registered in world)
 * @param {number} [options.available_resource] - Explicit available resource quantity
 * @param {object} [options.resource_pool] - Optional ResourcePool instance
 * @param {boolean} [options.advance_clock=true] - If false, does not advance SimulationClock (caller owns clock)
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

  let speciesProfile = options.species_profile;
  if (!speciesProfile && typeof world.getSpeciesProfile === 'function') {
    const popSpeciesId = world.getPopulation()?.speciesId;
    if (popSpeciesId && typeof world.hasSpeciesProfile === 'function' && world.hasSpeciesProfile(popSpeciesId)) {
      speciesProfile = world.getSpeciesProfile(popSpeciesId);
    }
  }

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
  // OPTIONAL BEHAVIOR INTEGRATION: Input Bundle Resolution
  // -----------------------------------------------------------------
  const inputBundle = options.input_bundle || null;
  let allocationResult = null;
  let allocationMap = new Map();

  if (inputBundle && inputBundle.organism_inputs) {
    // Sourced directly from BiologicalInputBundle (TASK 07-D)
    for (const org of aliveOrganisms) {
      const orgInput = inputBundle.organism_inputs[org.organism_id];
      const food = orgInput ? Number(orgInput.allocated_food ?? 0.0) : 0.0;
      allocationMap.set(org.organism_id, food);
    }
    if (options.resource_allocation) {
      allocationResult = options.resource_allocation;
    } else {
      let totalAlloc = 0;
      for (const amt of allocationMap.values()) totalAlloc += amt;
      allocationResult = Object.freeze({
        schema_version: '1.0.0',
        initial_resource: availableResource,
        total_requested: totalAlloc,
        total_allocated: totalAlloc,
        remaining_resource: Math.max(0.0, availableResource - totalAlloc),
        allocations: Object.freeze(
          Array.from(allocationMap.entries()).map(([orgId, amt]) => ({
            organism_id: orgId,
            allocated_amount: amt
          }))
        )
      });
    }
  } else {
    // -----------------------------------------------------------------
    // PHASE B: Demand Generation (Legacy fallback)
    // -----------------------------------------------------------------
    const demands = [];
    for (const org of aliveOrganisms) {
      const demand = calculateOrganismResourceDemand(org, speciesProfile, deltaTime);
      demands.push(demand);
    }

    // -----------------------------------------------------------------
    // PHASE C: PURE Resource Allocation (Legacy fallback)
    // -----------------------------------------------------------------
    allocationResult = allocateResourceDemands(availableResource, demands);
    allocationMap = new Map(
      allocationResult.allocations.map(a => [a.organism_id, a.allocated_amount])
    );
  }

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

    const orgInput = inputBundle?.organism_inputs?.[org.organism_id];
    const orgEnv = orgInput && typeof orgInput.shelter_security_factor === 'number'
      ? { ...lifecycleEnv, shelter_security_factor: orgInput.shelter_security_factor }
      : lifecycleEnv;

    const tickInput = {
      deltaTime,
      environment: orgEnv,
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
  // PHASE E: Validation + Atomic Commit (Optional Staged Evaluation)
  // -----------------------------------------------------------------
  // If options.commit === false, caller manages staging and atomic commit.
  // The coordinator performs biological evaluation without mutating authoritative world/pool.
  if (typeof options.on_candidate_states === 'function') {
    options.on_candidate_states(evaluatedClones);
  }

  if (options.commit !== false) {
    // Commit all updated organism states to PopulationRegistry
    for (const updatedClone of evaluatedClones) {
      const target = popRegistry.getOrganism(updatedClone.organism_id);
      if (target) {
        Object.assign(target, updatedClone);
      }
    }

    // Commit resource allocation to pool exactly once (no double subtraction)
    if (activePool && typeof activePool.commitAllocation === 'function') {
      activePool.commitAllocation(allocationResult);
    }
  }

  // Single clock ownership: advance clock only if caller does not manage it
  let nextTick;
  if (options.advance_clock === false) {
    nextTick = currentTick + 1;
  } else {
    nextTick = world.advanceTick(deltaTime);
  }

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
