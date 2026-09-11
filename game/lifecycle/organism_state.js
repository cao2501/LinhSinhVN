/**
 * LinhSinhVN — Organism Lifecycle & Developmental State
 * 
 * Defines runtime state representation and authoritative state invariants.
 * Strictly owns lifecycle, development, nutrition, stress, and survival state.
 * Combat state (HP, combat stamina) is intentionally excluded.
 * 
 * Conforms to data/lifecycle/schema/lifecycle_state.schema.json.
 */

import { deepFreeze } from './profile_loader.js';

/**
 * Creates a new runtime OrganismState object initialized from a species profile and genetics inputs.
 * 
 * @param {object} config
 * @param {string} config.organismId
 * @param {object} config.speciesProfile - Validated species profile
 * @param {number} [config.generation=1]
 * @param {'MALE'|'FEMALE'} config.sex
 * @param {object} config.genome - Authoritative diploid genome (treated as immutable input)
 * @param {object} config.phenotype - Base phenotype (treated as immutable input)
 * @param {object} config.derivedStats - Base derived stats (treated as immutable input)
 * @param {string} config.simulationSeed - 64-bit hex seed
 * @returns {object} Mutable runtime organism state
 */
export function createOrganismState({
  organismId,
  speciesProfile,
  generation = 1,
  sex,
  genome,
  phenotype,
  derivedStats,
  simulationSeed
}) {
  if (!organismId || typeof organismId !== 'string') {
    throw new TypeError('organismId must be a non-empty string');
  }
  if (!speciesProfile || !speciesProfile.species_id) {
    throw new TypeError('Valid speciesProfile must be provided');
  }
  if (!genome || typeof genome !== 'object') {
    throw new TypeError('Genome must be provided as an object');
  }
  if (!phenotype || typeof phenotype !== 'object') {
    throw new TypeError('Phenotype must be provided as an object');
  }
  if (!derivedStats || typeof derivedStats !== 'object') {
    throw new TypeError('Derived stats must be provided as an object');
  }
  if (!simulationSeed || typeof simulationSeed !== 'string' || !/^0x[0-9a-fA-F]{16}$/.test(simulationSeed)) {
    throw new TypeError(`Invalid simulationSeed format: '${simulationSeed}'. Expected 64-bit hex ('0x...')`);
  }
  if (sex !== 'MALE' && sex !== 'FEMALE') {
    throw new TypeError(`Invalid sex: '${sex}'. Expected 'MALE' or 'FEMALE'`);
  }

  const lc = speciesProfile.lifecycle_profile;
  const initialStageId = lc.initial_stage_id;
  const initialStage = lc.stages.find(s => s.stage_id === initialStageId);
  if (!initialStage) {
    throw new Error(`Initial stage '${initialStageId}' not found in profile stages`);
  }

  const initialSubstageId = (initialStage.substages && initialStage.substages.length > 0)
    ? initialStage.substages[0].substage_id
    : null;

  const targetBiomassForMolt = (initialStage.substages && initialStage.substages.length > 0)
    ? initialStage.substages[0].target_biomass
    : 0.0;

  const devProfile = speciesProfile.development_profile;

  // Clone and freeze genetics inputs to prevent accidental runtime mutation
  const immutableGenome = deepFreeze(JSON.parse(JSON.stringify(genome)));
  const immutablePhenotype = deepFreeze(JSON.parse(JSON.stringify(phenotype)));
  const immutableDerivedStats = deepFreeze(JSON.parse(JSON.stringify(derivedStats)));

  const state = {
    schema_version: '1.0.0',
    organism_id: organismId,
    species_id: speciesProfile.species_id,
    generation: Number(generation),
    sex,
    simulation_tick: 0,
    simulation_seed: simulationSeed,
    chronological_age_ticks: 0,
    stage_age_ticks: 0,
    is_alive: true,
    status: 'ALIVE',
    current_stage_id: initialStageId,
    current_substage_id: initialSubstageId,

    // Development (η trajectory)
    developmental_state: {
      schema_version: '1.0.0',
      organism_id: organismId,
      eta_current: devProfile.initial_eta,
      eta_min_reached: devProfile.initial_eta,
      eta_locked: false,
      eta_lock_stage: devProfile.eta_lock_stage,
      developmental_progress: 0.0,
      plasticity_capacity: 1.0,
      stunting_event_count: 0,
      eta_history: []
    },

    // Nutrition & Energy
    nutrition_state: {
      schema_version: '1.0.0',
      organism_id: organismId,
      stored_energy: 100.0,
      max_energy_capacity: 200.0,
      structural_biomass: 0.05,
      target_biomass_for_molt: targetBiomassForMolt,
      hydration: 0.80,
      nutrition_quality_index: 0.50,
      cumulative_deficit_ticks: 0,
      is_starving: false,
      starvation_ticks_elapsed: 0,
      catabolized_biomass_total: 0.0
    },

    // Stress Metrics
    stress_state: {
      schema_version: '1.0.0',
      organism_id: organismId,
      acute_stress: 0.0,
      chronic_stress: 0.0,
      nutritional_stress: 0.0,
      thermal_stress: 0.0,
      desiccation_stress: 0.0,
      crowding_stress: 0.0,
      stress_tolerance_threshold: 0.80,
      is_overstressed: false
    },

    // Environment Snapshot (initialized with neutral baseline)
    environment_state: {
      schema_version: '1.0.0',
      ambient_temperature_celsius: 25.0,
      relative_humidity: 0.75,
      substrate_moisture: 0.65,
      substrate_organic_richness: 0.80,
      food_density: 0.70,
      shelter_security_factor: 0.90,
      population_crowding_index: 0.10,
      environmental_hazard_rating: 0.0
    },

    // Physiological Modifiers (Lifecycle / Aging)
    physiological_modifiers: {
      senescence_metabolic_modifier: 1.00
    },

    // Genetics References (Immutable Inputs)
    genetics: {
      genome: immutableGenome,
      phenotype: immutablePhenotype,
      derived_stats: immutableDerivedStats
    },

    // Death Record (null while ALIVE)
    death_record: null
  };

  assertStateInvariants(state, speciesProfile);
  return state;
}

/**
 * Asserts all strict invariant conditions on an organism state.
 * Throws explicit descriptive errors on invariant violation.
 * 
 * @param {object} state 
 * @param {object} speciesProfile 
 * @throws {Error|RangeError}
 */
export function assertStateInvariants(state, speciesProfile) {
  if (!state || typeof state !== 'object') {
    throw new TypeError('State must be a non-null object');
  }

  // Vitality & Terminality
  if (!state.is_alive && state.status !== 'DEAD') {
    throw new Error(`Inconsistent vitality state: is_alive is false but status is '${state.status}'`);
  }
  if (state.is_alive && state.status !== 'ALIVE') {
    throw new Error(`Inconsistent vitality state: is_alive is true but status is '${state.status}'`);
  }
  if (!state.is_alive && state.death_record === null) {
    throw new Error('Dead organism must possess an immutable death_record');
  }

  // Lifecycle Stage validity
  const lc = speciesProfile.lifecycle_profile;
  const stage = lc.stages.find(s => s.stage_id === state.current_stage_id);
  if (!stage) {
    throw new Error(`Current stage '${state.current_stage_id}' is not defined in species profile`);
  }
  if (state.current_substage_id !== null) {
    const sub = stage.substages?.find(sb => sb.substage_id === state.current_substage_id);
    if (!sub) {
      throw new Error(`Current substage '${state.current_substage_id}' not found in stage '${stage.stage_id}'`);
    }
  }

  // Developmental Bounds
  const dev = state.developmental_state;
  const devProf = speciesProfile.development_profile;
  if (dev.eta_current < devProf.eta_min || dev.eta_current > devProf.eta_max) {
    throw new RangeError(
      `eta_current (${dev.eta_current}) violates bounds [${devProf.eta_min}, ${devProf.eta_max}]`
    );
  }
  if (dev.eta_min_reached < devProf.eta_min || dev.eta_min_reached > devProf.eta_max) {
    throw new RangeError(
      `eta_min_reached (${dev.eta_min_reached}) violates bounds [${devProf.eta_min}, ${devProf.eta_max}]`
    );
  }
  if (dev.eta_current < dev.eta_min_reached - 1e-9) {
    throw new Error(
      `eta_current (${dev.eta_current}) cannot be lower than recorded eta_min_reached (${dev.eta_min_reached})`
    );
  }

  // Nutrition Bounds
  const nut = state.nutrition_state;
  if (nut.stored_energy < 0) {
    throw new RangeError(`stored_energy (${nut.stored_energy}) cannot be negative`);
  }
  if (nut.structural_biomass < 0) {
    throw new RangeError(`structural_biomass (${nut.structural_biomass}) cannot be negative`);
  }
  if (nut.hydration < 0.0 || nut.hydration > 1.0) {
    throw new RangeError(`hydration (${nut.hydration}) must be within [0.0, 1.0]`);
  }
  if (nut.nutrition_quality_index < 0.0 || nut.nutrition_quality_index > 1.0) {
    throw new RangeError(`nutrition_quality_index (${nut.nutrition_quality_index}) must be within [0.0, 1.0]`);
  }

  // Stress Bounds
  const str = state.stress_state;
  const stressFields = ['acute_stress', 'chronic_stress', 'nutritional_stress', 'thermal_stress', 'desiccation_stress', 'crowding_stress'];
  for (const f of stressFields) {
    if (str[f] < 0.0 || str[f] > 1.0) {
      throw new RangeError(`Stress field '${f}' (${str[f]}) out of bounds [0.0, 1.0]`);
    }
  }

  // Chronology non-negativity
  if (state.simulation_tick < 0 || state.chronological_age_ticks < 0 || state.stage_age_ticks < 0) {
    throw new RangeError('Tick and age counters must be non-negative');
  }

  // Physiological Modifiers
  if (state.physiological_modifiers.senescence_metabolic_modifier < 1.00) {
    throw new RangeError('senescence_metabolic_modifier cannot be less than 1.00');
  }
}
