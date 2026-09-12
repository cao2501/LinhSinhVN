/**
 * LinhSinhVN — Population & Simulation World Foundation
 */

export {
  SimulationClock,
  createSimulationClock
} from './simulation_clock.js';

export {
  hash64,
  computePopulationTickSeed
} from './seed_contract.js';

export {
  VALID_TIMES_OF_DAY,
  VALID_SEASONS,
  validateEnvironmentState,
  createEnvironmentState,
  toLifecycleEnvironment
} from './environment_state.js';

export {
  PopulationRegistry,
  createPopulationRegistry
} from './population_registry.js';

export {
  SimulationWorld,
  createSimulationWorld
} from './simulation_world.js';

export {
  createResourceDemand,
  validateResourceDemand,
  validateDemandsList
} from './resource_demand.js';

export {
  ResourcePool,
  createResourcePool,
  allocateResourceDemands
} from './resource_pool.js';
