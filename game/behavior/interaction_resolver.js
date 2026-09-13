/**
 * LinhSinhVN — Ecological Interaction Resolver (TASK 07-C)
 * 
 * Pure, deterministic ecological arbiter resolving resource competition,
 * shelter access, and multi-organism interaction requests.
 * 
 * Hard Invariants:
 * - PURE FUNCTION: Zero mutation of OrganismState, NutritionState, ResourcePool,
 *   SpeciesProfile, EnvironmentState, or SimulationClock.
 * - CONSERVATION OF MASS:
 *   initial_resource = allocated_resource + remaining_resource
 *   demanded_resource = allocated_resource + unmet_resource
 *   0 <= allocated <= demanded
 *   total_resource_claims[R] = sum of allocations[org][R]
 * - DETERMINISTIC ARBITRATION HIERARCHY:
 *   1. urgency_class (CRITICAL > HIGH > NORMAL > LOW)
 *   2. priority_score DESC
 *   3. clash_power DESC
 *   4. organism_id ASC (Canonical tie-breaker)
 * - SCOPE SEPARATION:
 *   07-B generates individual intent requests.
 *   07-C resolves multi-organism arbitration without biological assimilation.
 *   Biological assimilation belongs strictly to BiologicalTickCoordinator.
 */

import {
  BEHAVIOR_TYPES,
  URGENCY_CLASSES,
  URGENCY_WEIGHTS
} from './constants.js';

const EPSILON = 1e-7;

/**
 * Pure evaluation of ecological interactions across an entire population for tick N.
 * 
 * @param {object} params
 * @param {Array<object>} params.actionIntents - List of ActionIntent requests from 07-B
 * @param {Array<object>} params.behaviorDecisions - List of BehaviorDecision results from 07-B
 * @param {object|Map<string, number>} params.resourcePoolSnapshot - Read-only snapshot of available resources
 * @param {object} params.environmentSnapshot - Immutable EnvironmentState snapshot
 * @param {string} params.populationId - Unique population identifier
 * @param {number} params.simulationTick - Current simulation tick integer
 * @param {object|Map<string, object>} [params.speciesProfiles] - Optional species profile map
 * @returns {object} Pure InteractionResult conforming to interaction_result.schema.json
 */
export function resolveEcologicalInteractions({
  actionIntents,
  behaviorDecisions,
  resourcePoolSnapshot,
  environmentSnapshot,
  populationId,
  simulationTick,
  speciesProfiles = {}
}) {
  if (!Array.isArray(actionIntents)) {
    throw new TypeError('actionIntents must be provided as an array');
  }
  if (!Array.isArray(behaviorDecisions)) {
    throw new TypeError('behaviorDecisions must be provided as an array');
  }
  if (!environmentSnapshot || typeof environmentSnapshot !== 'object') {
    throw new TypeError('environmentSnapshot must be provided as an object');
  }
  if (!populationId || typeof populationId !== 'string') {
    throw new TypeError('populationId must be a valid string');
  }
  if (typeof simulationTick !== 'number' || !Number.isInteger(simulationTick) || simulationTick < 0) {
    throw new TypeError('simulationTick must be a non-negative integer');
  }

  // Helper to read initial available resource safely from object or ResourcePool
  function getAvailableResource(resourceType) {
    if (!resourcePoolSnapshot) return 0.0;
    if (typeof resourcePoolSnapshot.getQuantity === 'function') {
      return Number(resourcePoolSnapshot.getQuantity(resourceType) ?? 0.0);
    }
    return Number(resourcePoolSnapshot[resourceType] ?? 0.0);
  }

  const resource_allocations = {};
  const shelter_assignments = {};
  const unmet_intents = [];
  const total_resource_claims = {};

  // Group intents by action_type
  const forageIntents = [];
  const shelterIntents = [];
  const mateIntents = [];
  const otherIntents = [];

  for (const intent of actionIntents) {
    if (intent.action_type === BEHAVIOR_TYPES.FORAGE) {
      forageIntents.push(intent);
    } else if (intent.action_type === BEHAVIOR_TYPES.SEEK_SHELTER) {
      shelterIntents.push(intent);
    } else if (intent.action_type === BEHAVIOR_TYPES.SEEK_MATE) {
      mateIntents.push(intent);
    } else {
      otherIntents.push(intent);
    }
  }

  // 1. ARBITRATE RESOURCE COMPETITION (FORAGE)
  // Partition by target_resource_type
  const forageByResource = {};
  for (const intent of forageIntents) {
    const rType = intent.payload?.target_resource_type || 'FOOD';
    if (!forageByResource[rType]) {
      forageByResource[rType] = [];
    }
    forageByResource[rType].push(intent);
  }

  for (const resourceType of Object.keys(forageByResource)) {
    const intentsForResource = forageByResource[resourceType];

    // Canonical Arbitration Sorting
    // 1. urgency_class (CRITICAL > HIGH > NORMAL > LOW)
    // 2. priority_score DESC
    // 3. clash_power DESC
    // 4. organism_id ASC
    intentsForResource.sort((a, b) => {
      const weightA = URGENCY_WEIGHTS[a.urgency_class] || 0;
      const weightB = URGENCY_WEIGHTS[b.urgency_class] || 0;
      if (weightB !== weightA) return weightB - weightA;

      const priorityDiff = b.priority_score - a.priority_score;
      if (Math.abs(priorityDiff) > 1e-9) return priorityDiff;

      const clashDiff = b.clash_power - a.clash_power;
      if (Math.abs(clashDiff) > 1e-9) return clashDiff;

      return a.organism_id.localeCompare(b.organism_id);
    });

    let available = getAvailableResource(resourceType);
    let totalClaimed = 0.0;

    for (const intent of intentsForResource) {
      const organismId = intent.organism_id;
      const requested = intent.payload?.requested_quantity;

      if (typeof requested !== 'number' || requested <= 0 || !Number.isFinite(requested)) {
        throw new RangeError(
          `Invalid requested_quantity for organism '${organismId}': must be a positive finite number`
        );
      }

      if (!resource_allocations[organismId]) {
        resource_allocations[organismId] = {};
      }

      let allocated = 0.0;
      if (available >= requested) {
        allocated = requested;
        available -= requested;
      } else if (available > 0.0) {
        allocated = available;
        available = 0.0;
        unmet_intents.push({
          organism_id: organismId,
          action_type: BEHAVIOR_TYPES.FORAGE,
          reason: 'RESOURCE_DEPLETED'
        });
      } else {
        allocated = 0.0;
        unmet_intents.push({
          organism_id: organismId,
          action_type: BEHAVIOR_TYPES.FORAGE,
          reason: 'RESOURCE_DEPLETED'
        });
      }

      const cleanAllocated = Number(allocated.toFixed(4));
      resource_allocations[organismId][resourceType] = cleanAllocated;
      totalClaimed += cleanAllocated;
    }

    total_resource_claims[resourceType] = Number(totalClaimed.toFixed(4));
  }

  // 2. ARBITRATE SHELTER COMPETITION (SEEK_SHELTER)
  // Evaluates shelter security based on environmental security baseline
  const envShelterSecurity = environmentSnapshot.shelter_security_factor ?? 0.80;

  for (const intent of shelterIntents) {
    const organismId = intent.organism_id;
    const minSecurity = intent.payload?.minimum_security_factor ?? 0.0;

    if (envShelterSecurity >= minSecurity) {
      shelter_assignments[organismId] = {
        shelter_acquired: true,
        effective_security_factor: Number(envShelterSecurity.toFixed(4))
      };
    } else {
      shelter_assignments[organismId] = {
        shelter_acquired: false,
        effective_security_factor: Number((envShelterSecurity * 0.5).toFixed(4))
      };
      unmet_intents.push({
        organism_id: organismId,
        action_type: BEHAVIOR_TYPES.SEEK_SHELTER,
        reason: 'HAZARD_BLOCKED'
      });
    }
  }

  // 3. RESOLVE REPRODUCTIVE INTENTS (SEEK_MATE)
  // Pair matching identification: verifies if compatible mates exist in current intents
  const matesBySpeciesAndSex = {};
  for (const intent of mateIntents) {
    const spId = intent.species_id;
    const targetSex = intent.payload?.target_criteria?.target_sex;
    const key = `${spId}|${targetSex}`;
    if (!matesBySpeciesAndSex[key]) {
      matesBySpeciesAndSex[key] = [];
    }
    matesBySpeciesAndSex[key].push(intent);
  }

  for (const intent of mateIntents) {
    const spId = intent.species_id;
    const selfSex = intent.payload?.target_criteria?.target_sex === 'MALE' ? 'FEMALE' : 'MALE';
    const complementaryKey = `${spId}|${selfSex}`;
    const potentialMatches = matesBySpeciesAndSex[complementaryKey] || [];

    if (potentialMatches.length === 0) {
      unmet_intents.push({
        organism_id: intent.organism_id,
        action_type: BEHAVIOR_TYPES.SEEK_MATE,
        reason: 'NO_COMPATIBLE_MATE'
      });
    }
  }

  // 4. RESOLVE FLEE INTENTS
  for (const intent of otherIntents) {
    if (intent.action_type === BEHAVIOR_TYPES.FLEE) {
      shelter_assignments[intent.organism_id] = {
        shelter_acquired: false,
        effective_security_factor: Number((envShelterSecurity * 0.3).toFixed(4))
      };
    }
  }

  // Ensure every participating organism has entry in resource_allocations and shelter_assignments
  for (const decision of behaviorDecisions) {
    const orgId = decision.organism_id;
    if (!resource_allocations[orgId]) {
      resource_allocations[orgId] = {};
    }
    if (!shelter_assignments[orgId]) {
      shelter_assignments[orgId] = {
        shelter_acquired: false,
        effective_security_factor: Number((envShelterSecurity * 0.5).toFixed(4))
      };
    }
  }

  // Ensure unmet_intents are canonical sorted by organism_id ASC
  unmet_intents.sort((a, b) => a.organism_id.localeCompare(b.organism_id));

  return {
    schema_version: '1.0.0',
    population_id: populationId,
    simulation_tick: simulationTick,
    resource_allocations,
    shelter_assignments,
    unmet_intents,
    total_resource_claims
  };
}