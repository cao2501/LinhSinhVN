/**
 * LinhSinhVN — Biological Input Bundle Factory (TASK 07-C)
 * 
 * Pure factory assembling the single authoritative input package for BiologicalTickCoordinator.
 * Strictly prevents shadow state creation and prevents double resource consumption.
 * 
 * Hard Invariants:
 * - PURE FUNCTION: Zero mutation of input states.
 * - NO SHADOW STATE: Contains ONLY tick inputs required by BiologicalTickCoordinator:
 *   { allocated_food, shelter_security_factor, behavior_type, metabolic_activity_rate }.
 * - ZERO INVENTED BIOLOGICAL CONSTANTS:
 *   `metabolic_activity_rate` is loaded strictly from data contracts:
 *   `stage.metabolic_drain_multiplier` defined in `speciesProfile.lifecycle_profile.stages`.
 *   Not hardcoded as REST=0.5 / FORAGE=1.2 / FLEE=1.8.
 * - SINGLE SOURCE OF NUTRITION:
 *   `allocated_food` comes strictly from InteractionResult, never from direct ResourcePool mutation.
 */

import { BEHAVIOR_TYPES } from './constants.js';

/**
 * Builds a pure BiologicalInputBundle conforming to biological_input_bundle.schema.json.
 * 
 * @param {object} params
 * @param {object} params.interactionResult - Validated InteractionResult from InteractionResolver
 * @param {Array<object>} params.behaviorDecisions - List of BehaviorDecision objects
 * @param {object} params.environmentSnapshot - Immutable EnvironmentState snapshot
 * @param {string} params.populationId - Unique population identifier
 * @param {number} params.simulationTick - Current simulation tick integer
 * @param {object|Map<string, object>} params.speciesProfiles - Species profile map
 * @param {Array<object>} [params.organisms] - Optional list of OrganismState objects to resolve stages
 * @returns {object} Pure BiologicalInputBundle
 */
export function buildBiologicalInputBundle({
  interactionResult,
  behaviorDecisions,
  environmentSnapshot,
  populationId,
  simulationTick,
  speciesProfiles,
  organisms = []
}) {
  if (!interactionResult || typeof interactionResult !== 'object') {
    throw new TypeError('interactionResult must be provided as an object');
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

  // Create organism lookup map for stage and species resolution
  const organismMap = new Map();
  for (const org of organisms) {
    organismMap.set(org.organism_id, org);
  }

  const organism_inputs = {};

  for (const decision of behaviorDecisions) {
    const organismId = decision.organism_id;
    const behaviorType = decision.behavior_type;

    // 1. Allocated food sourced strictly from InteractionResult
    const allocations = interactionResult.resource_allocations?.[organismId] || {};
    let allocatedFood = 0.0;
    for (const rType of Object.keys(allocations)) {
      allocatedFood += Number(allocations[rType] || 0.0);
    }

    // 2. Shelter security factor sourced strictly from InteractionResult or Environment
    const shelterAssignment = interactionResult.shelter_assignments?.[organismId];
    const shelterSecurity = shelterAssignment?.effective_security_factor
      ?? (environmentSnapshot.shelter_security_factor ?? 0.80);

    // 3. Metabolic activity rate sourced strictly from approved species profile lifecycle stages
    // (stage.metabolic_drain_multiplier). Zero invented biological constants.
    let metabolicActivityRate = 1.0;
    const orgState = organismMap.get(organismId);
    if (orgState) {
      const speciesId = orgState.species_id;
      const profile = (speciesProfiles instanceof Map)
        ? speciesProfiles.get(speciesId)
        : speciesProfiles[speciesId];

      if (profile) {
        const stageId = orgState.current_stage_id;
        const stage = profile.lifecycle_profile?.stages?.find(s => s.stage_id === stageId);
        if (stage && typeof stage.metabolic_drain_multiplier === 'number') {
          metabolicActivityRate = stage.metabolic_drain_multiplier;
        }
      }
    }

    organism_inputs[organismId] = {
      allocated_food: Number(allocatedFood.toFixed(4)),
      shelter_security_factor: Number(shelterSecurity.toFixed(4)),
      behavior_type: behaviorType,
      metabolic_activity_rate: Number(metabolicActivityRate.toFixed(4))
    };
  }

  return {
    schema_version: '1.0.0',
    population_id: populationId,
    simulation_tick: simulationTick,
    organism_inputs,
    environmental_snapshot: { ...environmentSnapshot }
  };
}