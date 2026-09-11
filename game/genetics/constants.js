/**
 * LinhSinhVN — Genetics Engine Constants & Registry
 * 
 * Defines canonical locus identifiers, species constants, and gameplay model defaults.
 * Strictly adheres to docs/GENETICS_SPEC.md.
 */

export const SCHEMA_VERSION = '1.1.0';

export const PROTOTYPE_SPECIES_ID = 'xylotrupes_rhinoceros_proto';

/**
 * CANONICAL LOCUS ORDER
 * The exact traversal order used by both recombination and mutation
 * to guarantee deterministic PRNG stream consumption across platforms.
 */
export const SPECIES_LOCI_REGISTRY = Object.freeze([
  'LOCUS_BODY_SCALE',
  'LOCUS_CHITIN_DENSITY',
  'LOCUS_CEPHALIC_HORN',
  'LOCUS_THORACIC_HORN',
  'LOCUS_TARSAL_CLAW',
  'LOCUS_METABOLIC_EFFICIENCY',
  'LOCUS_CUTICLE_PIGMENT',
  'LOCUS_ANTENNAL_CLUB'
]);

/**
 * Default mutation configuration from GENETICS_SPEC.md Section 5.2
 */
export const DEFAULT_MUTATION_RATE = 0.05; // 5% probability per allele
export const DEFAULT_MAX_MUTATION_DELTA = 0.12; // Uniform delta range [-0.12, +0.12]

/**
 * Developmental realization bounds from GENETICS_SPEC.md Section 8.2
 */
export const MIN_DEVELOPMENTAL_FACTOR = 0.60;
export const MAX_DEVELOPMENTAL_FACTOR = 1.00;
export const DEFAULT_DEVELOPMENTAL_FACTOR = 1.00;

/**
 * Standard combat action baseline cost for derived stat calculation
 */
export const BASE_ACTION_COST = 10.0;

/**
 * Biological sex enumeration
 */
export const SEX = Object.freeze({
  MALE: 'MALE',
  FEMALE: 'FEMALE'
});
