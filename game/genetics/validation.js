/**
 * LinhSinhVN — Genetics Validation Layer
 * 
 * Enforces core biological, mathematical, and schema invariants without silently swallowing errors.
 * Strictly adheres to docs/GENETICS_SPEC.md & docs/DEVELOPMENT_RULES.md.
 */

import {
  SPECIES_LOCI_REGISTRY,
  SEX,
  MIN_DEVELOPMENTAL_FACTOR,
  MAX_DEVELOPMENTAL_FACTOR
} from './constants.js';

/**
 * Validates that an OrganismGenome object satisfies all genetic invariants.
 * 
 * @param {object} genome 
 * @throws {Error} if any invariant is violated
 */
export function validateGenome(genome) {
  if (!genome || typeof genome !== 'object') {
    throw new Error('Genome validation failed: genome must be a non-null object.');
  }

  if (typeof genome.species_id !== 'string' || !/^[a-z0-9_]+$/.test(genome.species_id)) {
    throw new Error(`Genome validation failed: invalid species_id '${genome.species_id}'.`);
  }

  if (!genome.loci || typeof genome.loci !== 'object') {
    throw new Error('Genome validation failed: loci must be a non-null object.');
  }

  const locusKeys = Object.keys(genome.loci);
  if (locusKeys.length !== SPECIES_LOCI_REGISTRY.length) {
    throw new Error(
      `Genome validation failed: expected exactly ${SPECIES_LOCI_REGISTRY.length} loci, found ${locusKeys.length}.`
    );
  }

  for (const locusId of SPECIES_LOCI_REGISTRY) {
    const alleles = genome.loci[locusId];
    if (!Array.isArray(alleles)) {
      throw new Error(`Genome validation failed: locus '${locusId}' must be an array.`);
    }
    if (alleles.length !== 2) {
      throw new Error(
        `Genome validation failed: locus '${locusId}' must be diploid (exactly 2 alleles). Got ${alleles.length}.`
      );
    }

    for (let i = 0; i < 2; i++) {
      const a = alleles[i];
      if (typeof a !== 'number') {
        throw new Error(`Genome validation failed: locus '${locusId}' allele[${i}] is not a number: ${typeof a}.`);
      }
      if (Number.isNaN(a)) {
        throw new Error(`Genome validation failed: locus '${locusId}' allele[${i}] is NaN.`);
      }
      if (!Number.isFinite(a)) {
        throw new Error(`Genome validation failed: locus '${locusId}' allele[${i}] is Infinity.`);
      }
      if (a < 0.0 || a > 1.0) {
        throw new Error(
          `Genome validation failed: locus '${locusId}' allele[${i}] out of bounds [0.0, 1.0]: ${a}.`
        );
      }
    }
  }
}

/**
 * Validates biological sex.
 * 
 * @param {string} sex 
 */
export function validateSex(sex) {
  if (sex !== SEX.MALE && sex !== SEX.FEMALE) {
    throw new Error(`Sex validation failed: expected 'MALE' or 'FEMALE', got '${sex}'.`);
  }
}

/**
 * Validates developmental realization factor.
 * 
 * @param {number} eta 
 */
export function validateDevelopmentalFactor(eta) {
  const num = Number(eta);
  if (Number.isNaN(num) || !Number.isFinite(num)) {
    throw new Error(`Developmental factor validation failed: invalid number ${eta}.`);
  }
  if (num < MIN_DEVELOPMENTAL_FACTOR || num > MAX_DEVELOPMENTAL_FACTOR) {
    throw new Error(
      `Developmental factor validation failed: out of bounds [${MIN_DEVELOPMENTAL_FACTOR}, ${MAX_DEVELOPMENTAL_FACTOR}]: ${eta}.`
    );
  }
}

/**
 * Validates that an OrganismPhenotype object contains finite, valid values.
 * 
 * @param {object} phenotype 
 */
export function validatePhenotype(phenotype) {
  if (!phenotype || typeof phenotype !== 'object') {
    throw new Error('Phenotype validation failed: phenotype must be a non-null object.');
  }

  validateSex(phenotype.sex);

  const numericFields = [
    'body_scale_index',
    'mass_index',
    'cuticle_hardness_index',
    'cephalic_horn_scale',
    'thoracic_horn_scale',
    'tarsal_grip_index',
    'metabolic_drain_index',
    'stamina_economy_modifier',
    'sensory_range_units',
    'cuticle_pigment_ratio'
  ];

  for (const field of numericFields) {
    const val = phenotype[field];
    if (typeof val !== 'number' || Number.isNaN(val) || !Number.isFinite(val)) {
      throw new Error(`Phenotype validation failed: field '${field}' is not a finite number: ${val}.`);
    }
  }

  // Female horn masking check
  if (phenotype.sex === SEX.FEMALE) {
    if (phenotype.cephalic_horn_scale !== 0.0 || phenotype.thoracic_horn_scale !== 0.0) {
      throw new Error(
        `Phenotype validation failed: female horns must be masked to 0.0. Got cephalic=${phenotype.cephalic_horn_scale}, thoracic=${phenotype.thoracic_horn_scale}.`
      );
    }
  }
}

/**
 * Validates that a DerivedGameplayStats object contains finite, positive values.
 * 
 * @param {object} stats 
 */
export function validateDerivedStats(stats) {
  if (!stats || typeof stats !== 'object') {
    throw new Error('Derived stats validation failed: stats must be a non-null object.');
  }

  const numericFields = [
    'max_hp',
    'clash_power',
    'armor_reduction',
    'crawl_speed',
    'max_stamina',
    'action_stamina_cost',
    'stamina_regen_rate',
    'perception_radius',
    'starvation_endurance_time'
  ];

  for (const field of numericFields) {
    const val = stats[field];
    if (typeof val !== 'number' || Number.isNaN(val) || !Number.isFinite(val)) {
      throw new Error(`Derived stats validation failed: field '${field}' is not a finite number: ${val}.`);
    }
    if (val < 0.0) {
      throw new Error(`Derived stats validation failed: field '${field}' is negative: ${val}.`);
    }
  }
}
