/**
 * LinhSinhVN — State Snapshot & Serialization
 * 
 * Generates an immutable, pure JSON-serializable snapshot of OrganismState
 * conforming to data/lifecycle/schema/lifecycle_state.schema.json.
 * 
 * Strips class methods and non-serializable references.
 */

/**
 * Serializes an OrganismState into a validated, pure JSON data snapshot.
 * 
 * @param {object} state - Runtime OrganismState
 * @returns {object} Pure JSON-serializable state snapshot conforming to schema
 */
export function serializeStateSnapshot(state) {
  if (!state || typeof state !== 'object') {
    throw new TypeError('State must be a non-null object');
  }

  const snapshot = {
    schema_version: '1.0.0',
    organism_id: state.organism_id,
    species_id: state.species_id,
    simulation_tick: state.simulation_tick,
    simulation_seed: state.simulation_seed,
    chronological_age_ticks: state.chronological_age_ticks,
    stage_age_ticks: state.stage_age_ticks,
    is_alive: state.is_alive,
    status: state.status,
    current_stage_id: state.current_stage_id,
    current_substage_id: state.current_substage_id,

    developmental_state: {
      schema_version: '1.0.0',
      organism_id: state.organism_id,
      eta_current: state.developmental_state.eta_current,
      eta_min_reached: state.developmental_state.eta_min_reached,
      eta_locked: state.developmental_state.eta_locked,
      eta_lock_stage: state.developmental_state.eta_lock_stage,
      developmental_progress: state.developmental_state.developmental_progress,
      plasticity_capacity: state.developmental_state.plasticity_capacity,
      stunting_event_count: state.developmental_state.stunting_event_count,
      eta_history: state.developmental_state.eta_history.map(item => ({ ...item }))
    },

    nutrition_state: {
      schema_version: '1.0.0',
      organism_id: state.organism_id,
      stored_energy: state.nutrition_state.stored_energy,
      max_energy_capacity: state.nutrition_state.max_energy_capacity,
      structural_biomass: state.nutrition_state.structural_biomass,
      target_biomass_for_molt: state.nutrition_state.target_biomass_for_molt,
      hydration: state.nutrition_state.hydration,
      nutrition_quality_index: state.nutrition_state.nutrition_quality_index,
      cumulative_deficit_ticks: state.nutrition_state.cumulative_deficit_ticks,
      is_starving: state.nutrition_state.is_starving,
      starvation_ticks_elapsed: state.nutrition_state.starvation_ticks_elapsed,
      catabolized_biomass_total: state.nutrition_state.catabolized_biomass_total
    },

    environment_state: {
      schema_version: '1.0.0',
      ambient_temperature_celsius: state.environment_state.ambient_temperature_celsius,
      relative_humidity: state.environment_state.relative_humidity,
      substrate_moisture: state.environment_state.substrate_moisture,
      substrate_organic_richness: state.environment_state.substrate_organic_richness,
      food_density: state.environment_state.food_density,
      shelter_security_factor: state.environment_state.shelter_security_factor,
      population_crowding_index: state.environment_state.population_crowding_index,
      environmental_hazard_rating: state.environment_state.environmental_hazard_rating
    },

    stress_state: {
      schema_version: '1.0.0',
      organism_id: state.organism_id,
      acute_stress: state.stress_state.acute_stress,
      chronic_stress: state.stress_state.chronic_stress,
      nutritional_stress: state.stress_state.nutritional_stress,
      thermal_stress: state.stress_state.thermal_stress,
      desiccation_stress: state.stress_state.desiccation_stress,
      crowding_stress: state.stress_state.crowding_stress,
      stress_tolerance_threshold: state.stress_state.stress_tolerance_threshold,
      is_overstressed: state.stress_state.is_overstressed
    },

    physiological_modifiers: {
      senescence_metabolic_modifier: state.physiological_modifiers.senescence_metabolic_modifier
    },

    death_record: state.death_record ? JSON.parse(JSON.stringify(state.death_record)) : null
  };

  // Deep clone and freeze snapshot to prevent any subsequent tampering
  return Object.freeze(JSON.parse(JSON.stringify(snapshot)));
}
