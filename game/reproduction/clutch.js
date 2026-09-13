/**
 * LinhSinhVN — Deterministic Clutch Size & Sex Determination
 *
 * Generates clutch size and offspring sex strictly using DeterministicRNG and domain seeds.
 * Zero nondeterministic APIs.
 */

import { DeterministicRNG } from '../genetics/rng.js';

/**
 * Deterministically determines the clutch size within configured bounds.
 *
 * @param {number} clutchMin - Minimum clutch size
 * @param {number} clutchMax - Maximum clutch size
 * @param {string} clutchSeed - 64-bit hex seed derived from BreedingSeed | "CLUTCH"
 * @returns {number} Integer clutch size in [clutchMin, clutchMax]
 */
export function determineClutchSize(clutchMin, clutchMax, clutchSeed) {
  if (typeof clutchMin !== 'number' || typeof clutchMax !== 'number') {
    throw new TypeError('clutchMin and clutchMax must be numbers');
  }
  if (clutchMin < 1 || clutchMax < clutchMin) {
    throw new RangeError(`Invalid clutch range: [${clutchMin}, ${clutchMax}]`);
  }
  if (!clutchSeed) {
    throw new TypeError('clutchSeed must be provided');
  }

  if (clutchMin === clutchMax) {
    return clutchMin;
  }

  const rng = new DeterministicRNG(clutchSeed);
  const range = BigInt(clutchMax - clutchMin + 1);
  const offset = Number(rng.nextUInt64() % range);
  return clutchMin + offset;
}

/**
 * Deterministically determines child sex using the profile's sex_determination configuration.
 *
 * @param {object} sexDeterminationConfig - Configuration from speciesProfile.reproduction_profile.sex_determination
 * @param {string} sexSeed - 64-bit hex seed derived from BreedingSeed | "SEX" | childIndex
 * @returns {'MALE'|'FEMALE'} Authoritative child sex
 */
export function determineChildSex(sexDeterminationConfig, sexSeed) {
  if (!sexDeterminationConfig || typeof sexDeterminationConfig !== 'object') {
    throw new TypeError('sex_determination configuration object must be provided from species profile');
  }
  if (sexDeterminationConfig.mode !== 'FIXED_RATIO') {
    throw new Error(`Unsupported sex_determination mode: '${sexDeterminationConfig.mode}'`);
  }
  if (typeof sexDeterminationConfig.male_ratio !== 'number' ||
      sexDeterminationConfig.male_ratio < 0.0 ||
      sexDeterminationConfig.male_ratio > 1.0) {
    throw new RangeError(`Invalid sex_determination male_ratio: ${sexDeterminationConfig.male_ratio}. Must be in [0.0, 1.0]`);
  }
  if (!sexSeed) {
    throw new TypeError('sexSeed must be provided');
  }

  const rng = new DeterministicRNG(sexSeed);
  return rng.nextFloat() < sexDeterminationConfig.male_ratio ? 'MALE' : 'FEMALE';
}
