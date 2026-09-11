/**
 * LinhSinhVN — Canonical 12-Step Deterministic Lifecycle Tick Pipeline
 * 
 * Implements the exact 12-step execution pipeline from docs/LIFECYCLE_SPEC.md Section 11.
 * Pure generic execution driven entirely by species profile configuration.
 * 
 * Pipeline order is immutable and explicitly exported for test assertions.
 */

import { serializeStateSnapshot } from './state_snapshot.js';
import { assertStateInvariants } from './organism_state.js';

/**
 * Authoritative canonical list of pipeline steps in exact execution order.
 */
export const PIPELINE_STEPS = Object.freeze([
  'INPUT_INGESTION',
  'ENVIRONMENT_SNAPSHOT_RECORDING',
  'RESOURCE_INTAKE_AND_ASSIMILATION',
  'METABOLIC_EXPENDITURE',
  'STRESS_ACCUMULATION_AND_RECOVERY',
  'DEVELOPMENT_TRAJECTORY_EVALUATION',
  'ETA_UPDATE',
  'BIOMASS_GROWTH_EVALUATION',
  'LIFECYCLE_TRANSITION_CHECK',
  'SURVIVAL_AND_DEATH_EVALUATION',
  'DETERMINISTIC_EVENT_EMISSION',
  'STATE_SNAPSHOT_SERIALIZATION'
]);

// Base constants (GAMEPLAY MODEL / PROTOTYPE CONSTANT)
const E_BASE_RATE = 1.0;
const Q10_COEFF = 2.0;
const T_REF = 25.0;

/**
 * Executes a single deterministic simulation tick on an OrganismState.
 * 
 * @param {object} state - Mutable OrganismState
 * @param {object} speciesProfile - Deeply frozen SpeciesProfile
 * @param {object} tickInput - Input payload for this tick
 * @param {import('./event_emitter.js').LifecycleEventEmitter} emitter - Deterministic event emitter
 * @returns {{ snapshot: object, events: Array<object> }} End-of-tick snapshot and emitted events
 */
export function executeTickPipeline(state, speciesProfile, tickInput, emitter) {
  if (!state.is_alive) {
    throw new Error(`Cannot execute tick on dead organism '${state.organism_id}' (status: ${state.status})`);
  }

  emitter.beginTick();

  // -------------------------------------------------------------
  // Step 1: INPUT_INGESTION
  // -------------------------------------------------------------
  const dt = typeof tickInput.deltaTime === 'number' && tickInput.deltaTime > 0 ? tickInput.deltaTime : 1.0;
  const inputEnv = tickInput.environment || {};
  const inputResources = tickInput.resources || [];

  // Advance chronological clock
  state.simulation_tick += 1;
  state.chronological_age_ticks += 1;
  state.stage_age_ticks += 1;

  // -------------------------------------------------------------
  // Step 2: ENVIRONMENT_SNAPSHOT_RECORDING
  // -------------------------------------------------------------
  // Deep-copy and normalize environment input into immutable state snapshot
  state.environment_state = {
    schema_version: '1.0.0',
    ambient_temperature_celsius: typeof inputEnv.ambient_temperature_celsius === 'number' ? inputEnv.ambient_temperature_celsius : 25.0,
    relative_humidity: Math.max(0.0, Math.min(1.0, typeof inputEnv.relative_humidity === 'number' ? inputEnv.relative_humidity : 0.75)),
    substrate_moisture: Math.max(0.0, Math.min(1.0, typeof inputEnv.substrate_moisture === 'number' ? inputEnv.substrate_moisture : 0.65)),
    substrate_organic_richness: Math.max(0.0, Math.min(1.0, typeof inputEnv.substrate_organic_richness === 'number' ? inputEnv.substrate_organic_richness : 0.80)),
    food_density: Math.max(0.0, Math.min(1.0, typeof inputEnv.food_density === 'number' ? inputEnv.food_density : 0.50)),
    shelter_security_factor: Math.max(0.0, Math.min(1.0, typeof inputEnv.shelter_security_factor === 'number' ? inputEnv.shelter_security_factor : 0.80)),
    population_crowding_index: Math.max(0.0, Math.min(1.0, typeof inputEnv.population_crowding_index === 'number' ? inputEnv.population_crowding_index : 0.10)),
    environmental_hazard_rating: Math.max(0.0, Math.min(1.0, typeof inputEnv.environmental_hazard_rating === 'number' ? inputEnv.environmental_hazard_rating : 0.0))
  };

  const currentStage = speciesProfile.lifecycle_profile.stages.find(s => s.stage_id === state.current_stage_id);
  if (!currentStage) {
    throw new Error(`Stage '${state.current_stage_id}' not found in profile`);
  }

  // -------------------------------------------------------------
  // Step 3: RESOURCE_INTAKE_AND_ASSIMILATION
  // -------------------------------------------------------------
  let assimilatedEnergy = 0.0;
  let synthesizedBiomass = 0.0;
  const nutProf = speciesProfile.nutrition_profile;
  const stageDiet = nutProf.stage_diet_matrix[state.current_stage_id] || [];

  if (currentStage.is_feeding_stage && stageDiet.length > 0) {
    // Find matching consumable items in input resources
    let consumedAmount = 0.0;
    for (const res of inputResources) {
      if (res && stageDiet.includes(res.resource_id)) {
        const available = Math.max(0.0, Number(res.quantity) || 0.0);
        const intake = Math.min(available, 10.0 * dt); // Cap intake per tick
        consumedAmount += intake;
      }
    }

    if (consumedAmount > 0.0) {
      assimilatedEnergy = consumedAmount * nutProf.energy_yield_per_unit;
      synthesizedBiomass = consumedAmount * nutProf.biomass_yield_per_unit * speciesProfile.growth_profile.biomass_conversion_yield;
      state.nutrition_state.stored_energy = Math.min(
        state.nutrition_state.max_energy_capacity,
        state.nutrition_state.stored_energy + assimilatedEnergy
      );
      state.nutrition_state.nutrition_quality_index = Math.min(1.0, state.nutrition_state.nutrition_quality_index * 0.95 + 0.05);

      emitter.emit('FEEDING', state.simulation_tick, state.current_stage_id, state.current_substage_id, {
        consumed_amount: consumedAmount,
        assimilated_energy: assimilatedEnergy,
        synthesized_biomass: synthesizedBiomass
      }, 'NUTRITION');
    } else {
      // Incur deficit
      state.nutrition_state.cumulative_deficit_ticks += 1;
      state.nutrition_state.nutrition_quality_index = Math.max(0.0, state.nutrition_state.nutrition_quality_index * 0.98);
      emitter.emit('NUTRITION_DEFICIT', state.simulation_tick, state.current_stage_id, state.current_substage_id, {
        cumulative_deficit_ticks: state.nutrition_state.cumulative_deficit_ticks
      }, 'NUTRITION');
    }
  }

  // -------------------------------------------------------------
  // Step 4: METABOLIC_EXPENDITURE
  // -------------------------------------------------------------
  // Basal metabolic expenditure (GAMEPLAY MODEL / PROTOTYPE CONSTANT)
  // E_basal = E_base_rate * metabolic_drain_index * mass_index^0.75 * phi(T) * psi_senescence * motility_mult * dt
  const metabolicDrainIndex = state.genetics.derived_stats.metabolic_drain_index || 1.0;
  const massIndex = state.genetics.phenotype.mass_index || 1.0;
  const tempCelsius = state.environment_state.ambient_temperature_celsius;

  // Temperature multiplier phi(T) clamped to [0.40, 2.50]
  const phiT = Math.max(0.40, Math.min(2.50, Math.pow(Q10_COEFF, (tempCelsius - T_REF) / 10.0)));
  const psiSenescence = state.physiological_modifiers.senescence_metabolic_modifier;
  // Stage-specific motility multiplier configured in species profile
  // GAMEPLAY MODEL / PROTOTYPE CONSTANT: Quiescent stages specify 0.20, motile stages 1.00
  const motilityMultiplier = typeof currentStage.motility_multiplier === 'number'
    ? currentStage.motility_multiplier
    : (typeof currentStage.metabolic_drain_multiplier === 'number' ? currentStage.metabolic_drain_multiplier : 1.0);

  const basalExpenditure = E_BASE_RATE * metabolicDrainIndex * Math.pow(massIndex, 0.75) * phiT * psiSenescence * motilityMultiplier * dt;

  if (state.nutrition_state.stored_energy >= basalExpenditure) {
    state.nutrition_state.stored_energy -= basalExpenditure;
    if (state.nutrition_state.is_starving) {
      state.nutrition_state.is_starving = false;
      state.nutrition_state.starvation_ticks_elapsed = 0;
      emitter.emit('STARVATION_ENDED', state.simulation_tick, state.current_stage_id, state.current_substage_id, {}, 'SURVIVAL');
    }
  } else {
    // Stored energy reaches 0; enter acute starvation & catabolize tissue
    const remainingDeficit = basalExpenditure - state.nutrition_state.stored_energy;
    state.nutrition_state.stored_energy = 0.0;

    if (!state.nutrition_state.is_starving) {
      state.nutrition_state.is_starving = true;
      state.nutrition_state.starvation_ticks_elapsed = 0;
      emitter.emit('STARVATION_STARTED', state.simulation_tick, state.current_stage_id, state.current_substage_id, {}, 'SURVIVAL');
    }

    state.nutrition_state.starvation_ticks_elapsed += 1;
    // Catabolize structural biomass (1 BU yields 100 EU => deficit requires remainingDeficit / 100.0 BU)
    const biomassCatabolized = remainingDeficit / 100.0;
    state.nutrition_state.structural_biomass = Math.max(0.0, state.nutrition_state.structural_biomass - biomassCatabolized);
    state.nutrition_state.catabolized_biomass_total += biomassCatabolized;
  }

  // -------------------------------------------------------------
  // Step 5: STRESS_ACCUMULATION_AND_RECOVERY
  // -------------------------------------------------------------
  const envProf = speciesProfile.environment_profile;
  const str = state.stress_state;

  // Thermal stress
  if (tempCelsius < envProf.temperature_celsius.preferred_min) {
    const range = Math.max(1.0, envProf.temperature_celsius.preferred_min - envProf.temperature_celsius.tolerated_min);
    str.thermal_stress = Math.min(1.0, (envProf.temperature_celsius.preferred_min - tempCelsius) / range);
  } else if (tempCelsius > envProf.temperature_celsius.preferred_max) {
    const range = Math.max(1.0, envProf.temperature_celsius.tolerated_max - envProf.temperature_celsius.preferred_max);
    str.thermal_stress = Math.min(1.0, (tempCelsius - envProf.temperature_celsius.preferred_max) / range);
  } else {
    str.thermal_stress = Math.max(0.0, str.thermal_stress - 0.05 * dt);
  }

  // Desiccation stress
  const humidity = state.environment_state.relative_humidity;
  if (humidity < envProf.relative_humidity.preferred_min) {
    const range = Math.max(0.01, envProf.relative_humidity.preferred_min - envProf.relative_humidity.tolerated_min);
    str.desiccation_stress = Math.min(1.0, (envProf.relative_humidity.preferred_min - humidity) / range);
  } else {
    str.desiccation_stress = Math.max(0.0, str.desiccation_stress - 0.05 * dt);
  }

  // Nutritional stress
  str.nutritional_stress = state.nutrition_state.is_starving ? Math.min(1.0, str.nutritional_stress + 0.05 * dt) : Math.max(0.0, str.nutritional_stress - 0.02 * dt);

  // Crowding stress
  const crowding = state.environment_state.population_crowding_index;
  if (crowding > envProf.crowding_density.stress_onset) {
    str.crowding_stress = Math.min(1.0, (crowding - envProf.crowding_density.stress_onset) / (1.0 - envProf.crowding_density.stress_onset));
  } else {
    str.crowding_stress = Math.max(0.0, str.crowding_stress - 0.05 * dt);
  }

  // Acute & Chronic stress integration
  const instantaneousStress = Math.min(1.0, (str.thermal_stress + str.desiccation_stress + str.nutritional_stress + str.crowding_stress) / 2.0);
  str.acute_stress = instantaneousStress;
  str.chronic_stress = str.chronic_stress * 0.95 + str.acute_stress * 0.05;
  str.is_overstressed = str.chronic_stress >= str.stress_tolerance_threshold;

  // -------------------------------------------------------------
  // Step 6: DEVELOPMENT_TRAJECTORY_EVALUATION
  // -------------------------------------------------------------
  const dev = state.developmental_state;
  const devProf = speciesProfile.development_profile;

  if (currentStage.plasticity_enabled && !dev.eta_locked) {
    // Assess deficit and stress gradients
    const hasDeficit = state.nutrition_state.is_starving || state.nutrition_state.stored_energy < 10.0;
    const isUnderStress = str.chronic_stress > 0.30;

    // -------------------------------------------------------------
    // Step 7: ETA_UPDATE
    // -------------------------------------------------------------
    if (hasDeficit || isUnderStress) {
      const deltaDeficit = hasDeficit ? devProf.deficit_response_rate * dt : 0.0;
      const deltaStress = isUnderStress ? devProf.stress_response_rate * (str.chronic_stress - 0.30) * dt : 0.0;
      const totalDelta = deltaDeficit + deltaStress;

      if (totalDelta > 0) {
        dev.eta_current = Math.max(devProf.eta_min, dev.eta_current - totalDelta);
        dev.eta_min_reached = Math.min(dev.eta_min_reached, dev.eta_current);
        dev.stunting_event_count += 1;

        dev.eta_history.push({
          tick: state.simulation_tick,
          event_type: hasDeficit ? 'NUTRITIONAL_DEFICIT' : 'THERMAL_STRESS',
          delta_eta: -totalDelta,
          resulting_eta: dev.eta_current,
          trigger_reason: `Deficit: ${hasDeficit}, Stress: ${str.chronic_stress.toFixed(2)}`
        });

        emitter.emit('DEVELOPMENTAL_REALIZATION_CHANGED', state.simulation_tick, state.current_stage_id, state.current_substage_id, {
          delta_eta: -totalDelta,
          new_eta: dev.eta_current,
          reason: 'STUNTING_DEFICIT'
        }, 'DEVELOPMENT');
      }
    } else if (state.nutrition_state.stored_energy > 50.0 && str.chronic_stress < 0.10) {
      // Compensatory recovery (asymmetric, bounded)
      if (dev.eta_current < devProf.recovery_cap) {
        const deltaRecovery = devProf.recovery_response_rate * (devProf.recovery_cap - dev.eta_current) * dt;
        dev.eta_current = Math.min(devProf.recovery_cap, dev.eta_current + deltaRecovery);

        dev.eta_history.push({
          tick: state.simulation_tick,
          event_type: 'COMPENSATORY_RECOVERY',
          delta_eta: deltaRecovery,
          resulting_eta: dev.eta_current,
          trigger_reason: 'Optimal nutrition and low stress'
        });

        emitter.emit('DEVELOPMENTAL_REALIZATION_CHANGED', state.simulation_tick, state.current_stage_id, state.current_substage_id, {
          delta_eta: deltaRecovery,
          new_eta: dev.eta_current,
          reason: 'COMPENSATORY_RECOVERY'
        }, 'DEVELOPMENT');
      }
    }
  }

  // -------------------------------------------------------------
  // Step 8: BIOMASS_GROWTH_EVALUATION
  // -------------------------------------------------------------
  if (currentStage.is_growth_stage && synthesizedBiomass > 0) {
    const growthProf = speciesProfile.growth_profile;
    const substageMultiplier = (state.current_substage_id && growthProf.stage_growth_multipliers[state.current_substage_id])
      ? growthProf.stage_growth_multipliers[state.current_substage_id]
      : 1.0;

    const actualBiomassAddition = synthesizedBiomass * substageMultiplier;
    state.nutrition_state.structural_biomass = Math.min(
      growthProf.max_biomass_index,
      state.nutrition_state.structural_biomass + actualBiomassAddition
    );

    emitter.emit('GROWTH_UPDATED', state.simulation_tick, state.current_stage_id, state.current_substage_id, {
      added_biomass: actualBiomassAddition,
      current_biomass: state.nutrition_state.structural_biomass
    }, 'GROWTH');
  }

  // -------------------------------------------------------------
  // Step 9: LIFECYCLE_TRANSITION_CHECK
  // -------------------------------------------------------------
  // Evaluate Substage Transition (e.g. Molting / Instars)
  if (Array.isArray(currentStage.substages) && currentStage.substages.length > 0) {
    const currentSubIndex = currentStage.substages.findIndex(sb => sb.substage_id === state.current_substage_id);
    if (currentSubIndex >= 0 && currentSubIndex < currentStage.substages.length - 1) {
      const currentSub = currentStage.substages[currentSubIndex];
      const nextSub = currentStage.substages[currentSubIndex + 1];

      if (state.nutrition_state.structural_biomass >= currentSub.target_biomass && state.stage_age_ticks >= currentSub.min_duration_ticks) {
        // Execute substage transition
        emitter.emit('MOLT_STARTED', state.simulation_tick, state.current_stage_id, state.current_substage_id, {
          from_substage: currentSub.substage_id,
          to_substage: nextSub.substage_id
        }, 'MOLT');

        state.current_substage_id = nextSub.substage_id;
        state.nutrition_state.target_biomass_for_molt = nextSub.target_biomass;
        state.nutrition_state.stored_energy = Math.max(0.0, state.nutrition_state.stored_energy - currentSub.molt_resource_cost);

        emitter.emit('MOLT_COMPLETED', state.simulation_tick, state.current_stage_id, state.current_substage_id, {
          new_substage: nextSub.substage_id
        }, 'MOLT');
      }
    }
  }

  // Evaluate Stage Transition
  const stages = speciesProfile.lifecycle_profile.stages;
  const currentStageIndex = stages.findIndex(s => s.stage_id === state.current_stage_id);
  const canAdvanceStage = state.stage_age_ticks >= currentStage.min_duration_ticks;

  if (canAdvanceStage && currentStageIndex >= 0 && currentStageIndex < stages.length - 1) {
    let conditionsMet = true;

    // Check transition conditions from profile
    if (currentStage.transition_conditions) {
      if (typeof currentStage.transition_conditions.min_biomass_index === 'number') {
        if (state.nutrition_state.structural_biomass < currentStage.transition_conditions.min_biomass_index) {
          conditionsMet = false;
        }
      }
    }

    if (conditionsMet) {
      const nextStage = stages[currentStageIndex + 1];
      const previousStageId = state.current_stage_id;
      state.current_stage_id = nextStage.stage_id;
      state.stage_age_ticks = 0;
      state.current_substage_id = (nextStage.substages && nextStage.substages.length > 0)
        ? nextStage.substages[0].substage_id
        : null;

      emitter.emit('STAGE_TRANSITIONED', state.simulation_tick, state.current_stage_id, state.current_substage_id, {
        from_stage: previousStageId,
        to_stage: nextStage.stage_id
      }, 'LIFECYCLE');

      // Check if entering locking stage
      if (nextStage.eta_lock_trigger || nextStage.stage_id === devProf.eta_lock_stage) {
        dev.eta_locked = true;
        dev.plasticity_capacity = 0.0;
        dev.eta_history.push({
          tick: state.simulation_tick,
          event_type: 'LOCKED_AT_METAMORPHOSIS',
          delta_eta: 0.0,
          resulting_eta: dev.eta_current,
          trigger_reason: `Entered locking stage: ${nextStage.stage_id}`
        });

        emitter.emit('DEVELOPMENTAL_REALIZATION_CHANGED', state.simulation_tick, state.current_stage_id, state.current_substage_id, {
          delta_eta: 0.0,
          new_eta: dev.eta_current,
          locked: true,
          reason: 'LOCKED_AT_METAMORPHOSIS'
        }, 'DEVELOPMENT');
      }
    }
  }

  // Adult Senescence Modifier
  if (currentStage.order === stages.length) {
    // Final adult stage
    const maxDur = currentStage.max_duration_ticks || 3000;
    if (state.stage_age_ticks > maxDur * 0.5) {
      const progress = (state.stage_age_ticks - maxDur * 0.5) / (maxDur * 0.5);
      state.physiological_modifiers.senescence_metabolic_modifier = 1.00 + 0.50 * Math.min(1.0, progress * progress);
    }
  }

  // -------------------------------------------------------------
  // Step 10: SURVIVAL_AND_DEATH_EVALUATION
  // -------------------------------------------------------------
  let deathCause = null;
  let narrative = '';

  // 1. CATASTROPHIC_EVENT (Generic external event input or catastrophic environmental trauma)
  if (
    tickInput.catastrophic_event ||
    tickInput.catastrophicEvent ||
    (Array.isArray(tickInput.external_events) && tickInput.external_events.some(e => e && (e.type === 'CATASTROPHIC_EVENT' || e.is_catastrophic))) ||
    (Array.isArray(tickInput.externalEvents) && tickInput.externalEvents.some(e => e && (e.type === 'CATASTROPHIC_EVENT' || e.is_catastrophic))) ||
    state.environment_state.environmental_hazard_rating >= 1.0
  ) {
    deathCause = 'CATASTROPHIC_EVENT';
    const detail = (typeof tickInput.catastrophic_event === 'object' && tickInput.catastrophic_event !== null)
      ? (tickInput.catastrophic_event.narrative || tickInput.catastrophic_event.reason || 'Overwhelming external trauma.')
      : ((typeof tickInput.catastrophicEvent === 'object' && tickInput.catastrophicEvent !== null)
        ? (tickInput.catastrophicEvent.narrative || tickInput.catastrophicEvent.reason || 'Overwhelming external trauma.')
        : (state.environment_state.environmental_hazard_rating >= 1.0 ? 'Overwhelming environmental hazard destruction.' : 'Overwhelming external trauma.'));
    narrative = `Catastrophic fatality: ${detail}`;
  }

  // 2. DEVELOPMENTAL_FAILURE (Generic developmental arrest, failed molt/metamorphosis, or non-feeding energy exhaustion)
  if (!deathCause) {
    if (tickInput.developmental_failure || tickInput.developmentalFailure || tickInput.critical_molt_failure || tickInput.criticalMoltFailure) {
      deathCause = 'DEVELOPMENTAL_FAILURE';
      const detail = (typeof tickInput.developmental_failure === 'object' && tickInput.developmental_failure !== null)
        ? (tickInput.developmental_failure.narrative || tickInput.developmental_failure.reason || 'Lethal developmental arrest.')
        : ((typeof tickInput.developmentalFailure === 'object' && tickInput.developmentalFailure !== null)
          ? (tickInput.developmentalFailure.narrative || tickInput.developmentalFailure.reason || 'Lethal developmental arrest.')
          : 'Lethal developmental arrest during morphogenesis.');
      narrative = `Developmental failure: ${detail}`;
    } else if (!currentStage.is_feeding_stage && currentStage.order < stages.length) {
      // In non-feeding developmental stages, depletion of structural biomass/energy prior to eclosion is developmental failure
      const starvationLimit = state.genetics.derived_stats.starvation_endurance_time || 100.0;
      if (state.nutrition_state.starvation_ticks_elapsed >= starvationLimit || state.nutrition_state.structural_biomass <= 0.001) {
        deathCause = 'DEVELOPMENTAL_FAILURE';
        narrative = `Developmental failure: Metabolic energy exhaustion prior to adult eclosion in ${currentStage.stage_id}.`;
      }
    }
  }

  // 3. Direct / Forced Death Cause (Generic event input support for simulation drivers)
  if (!deathCause && tickInput.force_death_cause) {
    const validCauses = ['STARVATION', 'DEVELOPMENTAL_FAILURE', 'ENVIRONMENTAL_FAILURE', 'OLD_AGE', 'CATASTROPHIC_EVENT'];
    if (validCauses.includes(tickInput.force_death_cause)) {
      deathCause = tickInput.force_death_cause;
      narrative = tickInput.force_death_narrative || `Direct terminal transition: ${deathCause}.`;
    }
  }

  // 4. STARVATION (Feeding stages acute nutritional/biomass exhaustion)
  if (!deathCause) {
    const starvationLimit = state.genetics.derived_stats.starvation_endurance_time || 100.0;
    if (state.nutrition_state.starvation_ticks_elapsed >= starvationLimit || state.nutrition_state.structural_biomass <= 0.001) {
      deathCause = 'STARVATION';
      narrative = `Structural biomass exhausted after ${state.nutrition_state.starvation_ticks_elapsed} ticks of acute starvation.`;
    }
  }

  // 5. ENVIRONMENTAL_FAILURE (Lethal thermal shock or desiccation)
  if (!deathCause) {
    if (tempCelsius <= envProf.temperature_celsius.lethal_min || tempCelsius >= envProf.temperature_celsius.lethal_max) {
      deathCause = 'ENVIRONMENTAL_FAILURE';
      narrative = `Lethal temperature shock at ${tempCelsius.toFixed(1)}°C.`;
    } else if (humidity <= envProf.relative_humidity.lethal_min) {
      deathCause = 'ENVIRONMENTAL_FAILURE';
      narrative = `Lethal atmospheric desiccation at relative humidity ${humidity.toFixed(2)}.`;
    }
  }

  // 6. OLD_AGE (Chronological senescence beyond max adult duration)
  if (!deathCause && currentStage.order === stages.length) {
    const maxAdultTicks = currentStage.max_duration_ticks || 3000;
    if (state.stage_age_ticks >= maxAdultTicks) {
      deathCause = 'OLD_AGE';
      narrative = `Terminal physiological exhaustion due to advanced chronological age (${state.stage_age_ticks} adult ticks).`;
    }
  }

  if (deathCause) {
    state.is_alive = false;
    state.status = 'DEAD';
    state.death_record = Object.freeze({
      schema_version: '1.0.0',
      organism_id: state.organism_id,
      species_id: state.species_id,
      death_tick: state.simulation_tick,
      chronological_age_ticks: state.chronological_age_ticks,
      death_stage: state.current_stage_id,
      death_substage: state.current_substage_id,
      primary_cause: deathCause,
      detailed_cause_narrative: narrative,
      terminal_eta: state.developmental_state.eta_current,
      terminal_biomass: state.nutrition_state.structural_biomass,
      terminal_stored_energy: state.nutrition_state.stored_energy,
      terminal_stress_index: state.stress_state.chronic_stress,
      parent_ids: Object.freeze([])
    });

    emitter.emit('DEATH', state.simulation_tick, state.current_stage_id, state.current_substage_id, {
      primary_cause: deathCause,
      narrative
    }, 'MORTALITY');
  }

  // Validate state invariants
  assertStateInvariants(state, speciesProfile);

  // -------------------------------------------------------------
  // Step 11: DETERMINISTIC_EVENT_EMISSION
  // -------------------------------------------------------------
  const emittedEvents = emitter.getEvents();

  // -------------------------------------------------------------
  // Step 12: STATE_SNAPSHOT_SERIALIZATION
  // -------------------------------------------------------------
  const snapshot = serializeStateSnapshot(state);

  return { snapshot, events: emittedEvents };
}
