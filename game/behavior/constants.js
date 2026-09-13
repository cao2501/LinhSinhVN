/**
 * LinhSinhVN — Individual Behavior Constants & Configuration Defaults (TASK 07-B)
 *
 * Defines immutable domains, priority tiers, and data-driven parameter fallbacks.
 * Adheres strictly to data/behavior/schema/ contracts.
 *
 * PARAMETER CLASSIFICATION ARCHITECTURE:
 * 1. Universal Engine Invariants (BEHAVIOR_TYPES, URGENCY_CLASSES, URGENCY_WEIGHTS, TARGET_DOMAINS, THREAT_SOURCES):
 *    Immutable core contracts of the simulation architecture.
 *
 * 2. Prototype Gameplay Defaults (PROTOTYPE_FALLBACK_BEHAVIOR_PARAMETERS):
 *    Documented fallback thresholds applied strictly when an individual SpeciesProfile
 *    omits specific species-level `behavior_parameters`. Not universal biology.
 *
 * 3. Species-Specific Behavior Parameters:
 *    Owned by SpeciesProfile (speciesProfile.behavior_profile.behavior_parameters).
 *
 * 4. Nutrition / Physiological Parameters (e.g. intake capacity):
 *    Owned strictly by SpeciesProfile.nutrition_profile (base_intake_capacity_per_tick).
 *    Behavior Engine does NOT duplicate or define intake capacity.
 */

/**
 * Universal Engine Invariant: Allowed behavioral decision types in Phase 07-B.
 */
export const BEHAVIOR_TYPES = Object.freeze({
  FORAGE: 'FORAGE',
  REST: 'REST',
  SEEK_SHELTER: 'SEEK_SHELTER',
  SEEK_MATE: 'SEEK_MATE',
  FLEE: 'FLEE',
  EXPLORE: 'EXPLORE'
});

/**
 * Universal Engine Invariant: 4-tier survival urgency hierarchy.
 */
export const URGENCY_CLASSES = Object.freeze({
  CRITICAL: 'CRITICAL',
  HIGH: 'HIGH',
  NORMAL: 'NORMAL',
  LOW: 'LOW'
});

/**
 * Universal Engine Invariant: Urgency ranking weights enforcing Survival Urgency dominance.
 * CRITICAL (4) > HIGH (3) > NORMAL (2) > LOW (1).
 */
export const URGENCY_WEIGHTS = Object.freeze({
  CRITICAL: 4,
  HIGH: 3,
  NORMAL: 2,
  LOW: 1
});

/**
 * Universal Engine Invariant: Functional target domains for behavior decisions.
 */
export const TARGET_DOMAINS = Object.freeze({
  RESOURCE: 'RESOURCE',
  SHELTER: 'SHELTER',
  MATE: 'MATE',
  SAFETY: 'SAFETY',
  REST: 'REST',
  NONE: 'NONE'
});

/**
 * Universal Engine Invariant: Recognized sources of threat for FLEE action intents.
 */
export const THREAT_SOURCES = Object.freeze({
  ENVIRONMENTAL_HAZARD: 'ENVIRONMENTAL_HAZARD',
  PREDATOR: 'PREDATOR',
  OVERCROWDING: 'OVERCROWDING'
});

/**
 * Prototype Gameplay Defaults:
 * Fallback values used ONLY when an organism's species profile does not specify
 * individual fields in `speciesProfile.behavior_profile.behavior_parameters`.
 *
 * These are explicit prototype defaults, NOT universal biological constants.
 */
export const PROTOTYPE_FALLBACK_BEHAVIOR_PARAMETERS = Object.freeze({
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
  circadian_rest_bias: 0.40
});

// Backward compatibility alias during patch transition
export const DEFAULT_BEHAVIOR_PARAMETERS = PROTOTYPE_FALLBACK_BEHAVIOR_PARAMETERS;
