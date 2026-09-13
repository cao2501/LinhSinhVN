/**
 * LinhSinhVN — Individual Behavior Decision Engine (TASK 07-B)
 * 
 * Pure, deterministic, data-driven evaluator mapping:
 * (OrganismState + SpeciesProfile + EnvironmentSnapshot) -> BehaviorDecision -> ActionIntent
 * 
 * Hard Invariants:
 * - Zero mutation on any authoritative state.
 * - Dead organisms produce NO decisions and NO intents.
 * - Stage mobility/capability restrictions strictly enforced.
 * - Survival Urgency (CRITICAL > HIGH > NORMAL > LOW) dominates priority_score.
 * - Data-driven behavior parameters from SpeciesProfile.
 * - Circadian rhythm aligns with species activity period & environment time_of_day.
 * - Nullable decision_seed (null for deterministic branches; domain-separated 64-bit hex for stochastic branches).
 * - Zero nondeterminism.
 */

import {
  BEHAVIOR_TYPES,
  URGENCY_CLASSES,
  URGENCY_WEIGHTS,
  TARGET_DOMAINS,
  THREAT_SOURCES,
  DEFAULT_BEHAVIOR_PARAMETERS
} from './constants.js';

import { deriveBehaviorSeed } from './seed_derivation.js';

function clamp(value, min = 0.0, max = 1.0) {
  if (Number.isNaN(value) || !Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

/**
 * Resolves circadian active state for an organism based on species profile and environmental time of day.
 * 
 * @param {string} primaryActivityPeriod - 'NOCTURNAL' | 'DIURNAL' | 'CREPUSCULAR' | 'CATHEMERAL'
 * @param {string} timeOfDay - 'DAWN' | 'DAY' | 'DUSK' | 'NIGHT'
 * @returns {boolean} True if organism is in its active physiological period
 */
export function isCircadianActivePeriod(primaryActivityPeriod, timeOfDay) {
  switch (primaryActivityPeriod) {
    case 'NOCTURNAL':
      return timeOfDay === 'NIGHT' || timeOfDay === 'DUSK';
    case 'DIURNAL':
      return timeOfDay === 'DAY' || timeOfDay === 'DAWN';
    case 'CREPUSCULAR':
      return timeOfDay === 'DAWN' || timeOfDay === 'DUSK';
    case 'CATHEMERAL':
    default:
      return true;
  }
}

/**
 * Pure evaluation of an individual organism's behavioral decision for a single tick.
 * 
 * @param {object} params
 * @param {object} params.organismState - Read-only OrganismState
 * @param {object} params.speciesProfile - Read-only SpeciesProfile
 * @param {object} params.environmentSnapshot - Read-only EnvironmentState snapshot
 * @param {number} params.simulationTick - Current simulation tick integer
 * @param {string} params.simulationSeed - World simulation seed string
 * @param {string} params.populationId - Unique population identifier
 * @param {boolean} [params.enableStochasticTieBreak=false] - Optional flag to enable deterministic stochastic tie-breaking
 * @returns {{ decision: object, intent: object } | null} Returns null if organism is dead
 */
export function evaluateOrganismBehavior({
  organismState,
  speciesProfile,
  environmentSnapshot,
  simulationTick,
  simulationSeed,
  populationId,
  enableStochasticTieBreak = false
}) {
  if (!organismState || typeof organismState !== 'object') {
    throw new TypeError('organismState must be provided as an object');
  }
  if (!speciesProfile || typeof speciesProfile !== 'object') {
    throw new TypeError('speciesProfile must be provided as an object');
  }
  if (!environmentSnapshot || typeof environmentSnapshot !== 'object') {
    throw new TypeError('environmentSnapshot must be provided as an object');
  }

  // 1. INVARIANT: Dead organisms produce NO decisions and NO intents
  if (organismState.is_alive === false || organismState.status === 'DEAD') {
    return null;
  }

  const organismId = organismState.organism_id;
  const currentStageId = organismState.current_stage_id;
  const stages = speciesProfile.lifecycle_profile?.stages || [];
  const currentStage = stages.find(s => s.stage_id === currentStageId);

  // 2. INVARIANT: Lifecycle stage restrictions (immobile stages cannot forage, mate, flee, explore)
  const isMotile = currentStage ? Boolean(currentStage.is_motile_stage) : true;
  const isFeedingStage = currentStage ? Boolean(currentStage.is_feeding_stage) : true;
  const isReproductiveStage = currentStage ? Boolean(currentStage.is_reproductive_stage) : false;

  if (!isMotile) {
    const decision = {
      schema_version: '1.0.0',
      organism_id: organismId,
      simulation_tick: simulationTick,
      behavior_type: BEHAVIOR_TYPES.REST,
      urgency_class: URGENCY_CLASSES.LOW,
      priority_score: 0.1,
      target_domain: TARGET_DOMAINS.REST,
      reason_codes: ['STAGE_IMMOBILE', `STAGE_${currentStageId}`],
      decision_seed: null
    };

    const intent = createActionIntentFromDecision(decision, organismState, speciesProfile);
    return { decision, intent };
  }

  // 3. Resolve data-driven behavior parameters
  const bpConfig = speciesProfile.behavior_profile?.behavior_parameters || {};
  const paramsConfig = {
    starvation_critical_ratio: bpConfig.starvation_critical_ratio ?? DEFAULT_BEHAVIOR_PARAMETERS.starvation_critical_ratio,
    hunger_forage_ratio: bpConfig.hunger_forage_ratio ?? DEFAULT_BEHAVIOR_PARAMETERS.hunger_forage_ratio,
    critical_hazard_threshold: bpConfig.critical_hazard_threshold ?? DEFAULT_BEHAVIOR_PARAMETERS.critical_hazard_threshold,
    high_hazard_threshold: bpConfig.high_hazard_threshold ?? DEFAULT_BEHAVIOR_PARAMETERS.high_hazard_threshold,
    critical_stress_threshold: bpConfig.critical_stress_threshold ?? DEFAULT_BEHAVIOR_PARAMETERS.critical_stress_threshold,
    high_stress_threshold: bpConfig.high_stress_threshold ?? DEFAULT_BEHAVIOR_PARAMETERS.high_stress_threshold,
    mating_energy_ratio: bpConfig.mating_energy_ratio ?? DEFAULT_BEHAVIOR_PARAMETERS.mating_energy_ratio,
    circadian_rest_bias: bpConfig.circadian_rest_bias ?? DEFAULT_BEHAVIOR_PARAMETERS.circadian_rest_bias,
    forage_intake_capacity: bpConfig.forage_intake_capacity ?? DEFAULT_BEHAVIOR_PARAMETERS.forage_intake_capacity
  };

  // 4. Biological & Environmental facts
  const storedEnergy = organismState.nutrition_state?.stored_energy ?? 100.0;
  const maxCapacity = organismState.nutrition_state?.max_energy_capacity ?? 200.0;
  const energyRatio = maxCapacity > 0 ? (storedEnergy / maxCapacity) : 0.0;
  const isStarving = Boolean(organismState.nutrition_state?.is_starving) || (energyRatio <= paramsConfig.starvation_critical_ratio);

  const acuteStress = organismState.stress_state?.acute_stress ?? 0.0;
  const chronicStress = organismState.stress_state?.chronic_stress ?? 0.0;
  const crowdingStress = organismState.stress_state?.crowding_stress ?? 0.0;
  const effectiveStress = Math.max(acuteStress, chronicStress);
  const isOverstressed = Boolean(organismState.stress_state?.is_overstressed) || (effectiveStress >= paramsConfig.critical_stress_threshold);

  const hazardRating = environmentSnapshot.hazard_rating ?? 0.0;
  const timeOfDay = environmentSnapshot.time_of_day ?? 'DAY';
  const primaryPeriod = speciesProfile.behavior_profile?.primary_activity_period ?? 'CATHEMERAL';
  const isCircadianActive = isCircadianActivePeriod(primaryPeriod, timeOfDay);

  // 5. Evaluate behavior candidates
  const candidates = [];

  // A. Candidate: FLEE
  if (hazardRating >= paramsConfig.critical_hazard_threshold) {
    candidates.push({
      behavior_type: BEHAVIOR_TYPES.FLEE,
      urgency_class: URGENCY_CLASSES.CRITICAL,
      priority_score: clamp(hazardRating),
      target_domain: TARGET_DOMAINS.SAFETY,
      reason_codes: ['CRITICAL_ENVIRONMENTAL_HAZARD'],
      threat_source: THREAT_SOURCES.ENVIRONMENTAL_HAZARD
    });
  } else if (crowdingStress >= 0.90) {
    candidates.push({
      behavior_type: BEHAVIOR_TYPES.FLEE,
      urgency_class: URGENCY_CLASSES.CRITICAL,
      priority_score: 0.90,
      target_domain: TARGET_DOMAINS.SAFETY,
      reason_codes: ['CRITICAL_OVERCROWDING'],
      threat_source: THREAT_SOURCES.OVERCROWDING
    });
  }

  // B. Candidate: FORAGE
  if (isFeedingStage) {
    if (isStarving) {
      const deficitDepth = paramsConfig.starvation_critical_ratio > 0
        ? clamp(1.0 - (energyRatio / paramsConfig.starvation_critical_ratio))
        : 1.0;
      candidates.push({
        behavior_type: BEHAVIOR_TYPES.FORAGE,
        urgency_class: URGENCY_CLASSES.CRITICAL,
        priority_score: clamp(0.80 + deficitDepth * 0.20),
        target_domain: TARGET_DOMAINS.RESOURCE,
        reason_codes: ['CRITICAL_STARVATION']
      });
    } else if (energyRatio <= paramsConfig.hunger_forage_ratio) {
      const hungerScore = clamp(1.0 - energyRatio);
      candidates.push({
        behavior_type: BEHAVIOR_TYPES.FORAGE,
        urgency_class: isCircadianActive ? URGENCY_CLASSES.HIGH : URGENCY_CLASSES.NORMAL,
        priority_score: hungerScore,
        target_domain: TARGET_DOMAINS.RESOURCE,
        reason_codes: ['HUNGER_DEFICIT', isCircadianActive ? 'CIRCADIAN_ACTIVE' : 'CIRCADIAN_PASSIVE']
      });
    }
  }

  // C. Candidate: SEEK_SHELTER
  if (isOverstressed) {
    candidates.push({
      behavior_type: BEHAVIOR_TYPES.SEEK_SHELTER,
      urgency_class: URGENCY_CLASSES.CRITICAL,
      priority_score: clamp(effectiveStress),
      target_domain: TARGET_DOMAINS.SHELTER,
      reason_codes: ['CRITICAL_STRESS_EXHAUSTION']
    });
  } else if (hazardRating >= paramsConfig.high_hazard_threshold || effectiveStress >= paramsConfig.high_stress_threshold) {
    const shelterScore = clamp(Math.max(hazardRating, effectiveStress));
    candidates.push({
      behavior_type: BEHAVIOR_TYPES.SEEK_SHELTER,
      urgency_class: URGENCY_CLASSES.HIGH,
      priority_score: shelterScore,
      target_domain: TARGET_DOMAINS.SHELTER,
      reason_codes: ['HIGH_HAZARD_OR_STRESS']
    });
  }

  // D. Candidate: SEEK_MATE
  const minMatingAge = speciesProfile.reproduction_profile?.min_mating_age_ticks ?? 0;
  const stageAge = organismState.stage_age_ticks ?? 0;
  const cooldownUntil = organismState.reproduction_cooldown_until_tick ?? 0;

  if (
    isReproductiveStage &&
    stageAge >= minMatingAge &&
    simulationTick >= cooldownUntil &&
    energyRatio >= paramsConfig.mating_energy_ratio &&
    !isOverstressed &&
    isCircadianActive
  ) {
    const matingPriority = speciesProfile.behavior_profile?.priorities?.mating ?? 0.80;
    candidates.push({
      behavior_type: BEHAVIOR_TYPES.SEEK_MATE,
      urgency_class: URGENCY_CLASSES.NORMAL,
      priority_score: clamp(matingPriority),
      target_domain: TARGET_DOMAINS.MATE,
      reason_codes: ['REPRODUCTIVE_READY']
    });
  }

  // E. Candidate: REST
  if (!isCircadianActive) {
    // Circadian alignment: passive hours significantly favor REST
    const restScore = clamp(0.70 + paramsConfig.circadian_rest_bias * 0.20);
    candidates.push({
      behavior_type: BEHAVIOR_TYPES.REST,
      urgency_class: URGENCY_CLASSES.NORMAL,
      priority_score: restScore,
      target_domain: TARGET_DOMAINS.REST,
      reason_codes: ['CIRCADIAN_REST_PERIOD']
    });
  } else {
    // Active circadian hours baseline REST
    candidates.push({
      behavior_type: BEHAVIOR_TYPES.REST,
      urgency_class: URGENCY_CLASSES.LOW,
      priority_score: 0.30,
      target_domain: TARGET_DOMAINS.REST,
      reason_codes: ['REST_BASELINE']
    });
  }

  // F. Candidate: EXPLORE
  if (isCircadianActive && energyRatio > paramsConfig.hunger_forage_ratio && !isOverstressed && hazardRating < paramsConfig.high_hazard_threshold) {
    candidates.push({
      behavior_type: BEHAVIOR_TYPES.EXPLORE,
      urgency_class: URGENCY_CLASSES.LOW,
      priority_score: 0.40,
      target_domain: TARGET_DOMAINS.NONE,
      reason_codes: ['EXPLORATION_BASELINE']
    });
  }

  // 6. Select optimal decision based on strict hierarchical arbitration
  // Survival Urgency dominates priority_score: CRITICAL > HIGH > NORMAL > LOW
  candidates.sort((a, b) => {
    const weightDiff = URGENCY_WEIGHTS[b.urgency_class] - URGENCY_WEIGHTS[a.urgency_class];
    if (weightDiff !== 0) return weightDiff;

    const scoreDiff = b.priority_score - a.priority_score;
    if (Math.abs(scoreDiff) > 1e-9) return scoreDiff;

    // Biological tie-breaker fallback order
    const fallbackOrder = {
      FLEE: 6,
      FORAGE: 5,
      SEEK_SHELTER: 4,
      SEEK_MATE: 3,
      REST: 2,
      EXPLORE: 1
    };
    return (fallbackOrder[b.behavior_type] || 0) - (fallbackOrder[a.behavior_type] || 0);
  });

  const selectedCandidate = candidates[0];

  let decisionSeed = null;
  if (enableStochasticTieBreak) {
    decisionSeed = deriveBehaviorSeed(simulationSeed, populationId, simulationTick, organismId);
  }

  const decision = {
    schema_version: '1.0.0',
    organism_id: organismId,
    simulation_tick: simulationTick,
    behavior_type: selectedCandidate.behavior_type,
    urgency_class: selectedCandidate.urgency_class,
    priority_score: Number(selectedCandidate.priority_score.toFixed(4)),
    target_domain: selectedCandidate.target_domain,
    reason_codes: selectedCandidate.reason_codes,
    decision_seed: decisionSeed
  };

  const intent = createActionIntentFromDecision(
    decision,
    organismState,
    speciesProfile,
    selectedCandidate.threat_source
  );

  return { decision, intent };
}

/**
 * Creates a valid discriminated ActionIntent conforming to action_intent.schema.json from a decision.
 * 
 * @param {object} decision - Validated BehaviorDecision object
 * @param {object} organismState - Read-only OrganismState
 * @param {object} speciesProfile - Read-only SpeciesProfile
 * @param {string} [threatSource] - Optional threat source for FLEE intent
 * @returns {object} Discriminated ActionIntent
 */
export function createActionIntentFromDecision(decision, organismState, speciesProfile, threatSource = THREAT_SOURCES.ENVIRONMENTAL_HAZARD) {
  const organismId = decision.organism_id;
  const tick = decision.simulation_tick;
  const actionType = decision.behavior_type;
  const speciesId = organismState.species_id || speciesProfile.species_id;

  const clashPower = Number((organismState.genetics?.derived_stats?.clash_power ?? 0.0).toFixed(4));
  const intentId = `intent_${organismId}_${tick}_${actionType.toLowerCase()}`;

  const baseIntent = {
    schema_version: '1.0.0',
    intent_id: intentId,
    organism_id: organismId,
    species_id: speciesId,
    urgency_class: decision.urgency_class,
    priority_score: decision.priority_score,
    clash_power: clashPower
  };

  switch (actionType) {
    case BEHAVIOR_TYPES.FORAGE: {
      const consumableList = speciesProfile.nutrition_profile?.consumable_resources || [];
      const targetResource = consumableList[0] || 'FOOD';
      const intakeCapacity = speciesProfile.nutrition_profile?.base_intake_capacity_per_tick || 1.0;

      return {
        ...baseIntent,
        action_type: BEHAVIOR_TYPES.FORAGE,
        payload: {
          target_resource_type: targetResource,
          requested_quantity: Number(intakeCapacity.toFixed(4))
        }
      };
    }

    case BEHAVIOR_TYPES.SEEK_SHELTER: {
      const capabilities = speciesProfile.behavior_profile?.capabilities || {};
      const targetShelter = capabilities.can_burrow ? 'SUBSTRATE_BURROW' : 'CANOPY';

      return {
        ...baseIntent,
        action_type: BEHAVIOR_TYPES.SEEK_SHELTER,
        payload: {
          target_shelter_type: targetShelter,
          minimum_security_factor: 0.50
        }
      };
    }

    case BEHAVIOR_TYPES.SEEK_MATE: {
      const organismSex = organismState.sex;
      const targetSex = organismSex === 'MALE' ? 'FEMALE' : 'MALE';

      return {
        ...baseIntent,
        action_type: BEHAVIOR_TYPES.SEEK_MATE,
        payload: {
          target_criteria: {
            compatible_species_id: speciesId,
            target_sex: targetSex
          }
        }
      };
    }

    case BEHAVIOR_TYPES.FLEE: {
      return {
        ...baseIntent,
        action_type: BEHAVIOR_TYPES.FLEE,
        payload: {
          threat_source: threatSource
        }
      };
    }

    case BEHAVIOR_TYPES.REST: {
      return {
        ...baseIntent,
        action_type: BEHAVIOR_TYPES.REST,
        payload: null
      };
    }

    case BEHAVIOR_TYPES.EXPLORE: {
      return {
        ...baseIntent,
        action_type: BEHAVIOR_TYPES.EXPLORE,
        payload: null
      };
    }

    default:
      throw new Error(`Unsupported behavior_type: ${actionType}`);
  }
}

/**
 * Pure evaluation of behavior across an entire population of organisms for tick N.
 * Canonical organism ordering (organism_id ASC) guarantees insertion-order invariance.
 * 
 * @param {object} params
 * @param {Array<object>} params.organisms - List of OrganismState objects
 * @param {Map<string, object>|object} params.speciesProfiles - Species profile map or dictionary
 * @param {object} params.environmentSnapshot - Immutable EnvironmentState snapshot
 * @param {number} params.simulationTick - Current simulation tick integer
 * @param {string} params.simulationSeed - World simulation seed string
 * @param {string} params.populationId - Unique population identifier
 * @param {boolean} [params.enableStochasticTieBreak=false] - Optional stochastic flag
 * @returns {{ evaluation_result: object, decisions: Array<object>, intents: Array<object> }}
 */
export function evaluatePopulationBehavior({
  organisms,
  speciesProfiles,
  environmentSnapshot,
  simulationTick,
  simulationSeed,
  populationId,
  enableStochasticTieBreak = false
}) {
  if (!Array.isArray(organisms)) {
    throw new TypeError('organisms must be provided as an array');
  }
  if (!populationId || typeof populationId !== 'string') {
    throw new TypeError('populationId must be a valid string');
  }

  // Sort canonically by organism_id to guarantee pure determinism
  const sortedOrganisms = [...organisms].sort((a, b) => a.organism_id.localeCompare(b.organism_id));

  const decisions = [];
  const intents = [];

  for (const organism of sortedOrganisms) {
    const speciesId = organism.species_id;
    const profile = (speciesProfiles instanceof Map)
      ? speciesProfiles.get(speciesId)
      : speciesProfiles[speciesId];

    if (!profile) {
      throw new Error(`SpeciesProfile not found for organism '${organism.organism_id}' with species '${speciesId}'`);
    }

    const result = evaluateOrganismBehavior({
      organismState: organism,
      speciesProfile: profile,
      environmentSnapshot,
      simulationTick,
      simulationSeed,
      populationId,
      enableStochasticTieBreak
    });

    if (result) {
      decisions.push(result.decision);
      intents.push(result.intent);
    }
  }

  const evaluation_result = {
    schema_version: '1.0.0',
    population_id: populationId,
    simulation_tick: simulationTick,
    decisions
  };

  return {
    evaluation_result,
    decisions,
    intents
  };
}