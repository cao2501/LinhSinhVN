/**
 * LinhSinhVN — Individual Behavior Constants & Configuration Defaults (TASK 07-B)
 * 
 * Defines immutable domains, priority tiers, and data-driven parameter fallbacks.
 * Adheres strictly to data/behavior/schema/ contracts.
 */

export const BEHAVIOR_TYPES = Object.freeze({
  FORAGE: 'FORAGE',
  REST: 'REST',
  SEEK_SHELTER: 'SEEK_SHELTER',
  SEEK_MATE: 'SEEK_MATE',
  FLEE: 'FLEE',
  EXPLORE: 'EXPLORE'
});

export const URGENCY_CLASSES = Object.freeze({
  CRITICAL: 'CRITICAL',
  HIGH: 'HIGH',
  NORMAL: 'NORMAL',
  LOW: 'LOW'
});

export const URGENCY_WEIGHTS = Object.freeze({
  CRITICAL: 4,
  HIGH: 3,
  NORMAL: 2,
  LOW: 1
});

export const TARGET_DOMAINS = Object.freeze({
  RESOURCE: 'RESOURCE',
  SHELTER: 'SHELTER',
  MATE: 'MATE',
  SAFETY: 'SAFETY',
  REST: 'REST',
  NONE: 'NONE'
});

export const THREAT_SOURCES = Object.freeze({
  ENVIRONMENTAL_HAZARD: 'ENVIRONMENTAL_HAZARD',
  PREDATOR: 'PREDATOR',
  OVERCROWDING: 'OVERCROWDING'
});

/**
 * Baseline fallback behavior parameters when not specified in species_profile.behavior_profile.behavior_parameters.
 * All parameters are purely data-driven, non-arbitrary biological thresholds.
 */
export const DEFAULT_BEHAVIOR_PARAMETERS = Object.freeze({
  // Ratio of stored_energy / max_energy_capacity triggering life-threatening starvation priority (CRITICAL)
  starvation_critical_ratio: 0.15,

  // Ratio of stored_energy / max_energy_capacity triggering standard foraging priority
  hunger_forage_ratio: 0.50,

  // Environmental hazard rating [0, 1] triggering immediate emergency escape (CRITICAL)
  critical_hazard_threshold: 0.80,

  // Environmental hazard rating [0, 1] triggering shelter search (HIGH)
  high_hazard_threshold: 0.50,

  // Acute or chronic stress level [0, 1] triggering critical shelter search (CRITICAL)
  critical_stress_threshold: 0.85,

  // Stress level [0, 1] triggering elevated shelter search (HIGH)
  high_stress_threshold: 0.60,

  // Energy ratio required before an organism considers reproductive activity
  mating_energy_ratio: 0.70,

  // Weight added to resting priority during organism's inactive circadian phase
  circadian_rest_bias: 0.40,

  // Default food intake requested per forage action if not specified in nutrition profile
  forage_intake_capacity: 1.0
});