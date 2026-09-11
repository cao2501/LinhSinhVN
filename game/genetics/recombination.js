/**
 * LinhSinhVN — Recombination Engine
 * 
 * Implements Diploid Independent-Locus Inheritance across canonical locus order.
 * Strictly adheres to docs/GENETICS_SPEC.md Section 4.
 */

import { SCHEMA_VERSION, SPECIES_LOCI_REGISTRY } from './constants.js';

/**
 * Recombines two parent genomes to produce a novel child genome.
 * For each locus in canonical order:
 * - Selects 1 allele from Parent A (50% probability allele_1, 50% allele_2).
 * - Selects 1 allele from Parent B (50% probability allele_1, 50% allele_2).
 * 
 * Parents remain strictly immutable.
 * 
 * @param {object} parentA - Maternal genome object
 * @param {object} parentB - Paternal genome object
 * @param {import('./rng.js').DeterministicRNG} rng - Deterministic PRNG instance
 * @returns {object} Fresh child genome object
 */
export function recombineGenomes(parentA, parentB, rng) {
  if (!parentA?.loci || !parentB?.loci) {
    throw new TypeError('recombineGenomes requires valid parent genomes with loci defined');
  }
  if (!rng || typeof rng.nextFloat !== 'function') {
    throw new TypeError('recombineGenomes requires a valid DeterministicRNG instance');
  }

  const childLoci = {};

  // Strictly follow canonical locus registry order for deterministic RNG consumption
  for (const locusId of SPECIES_LOCI_REGISTRY) {
    const locusA = parentA.loci[locusId];
    const locusB = parentB.loci[locusId];

    if (!locusA || !locusB) {
      throw new Error(`Missing locus definition for '${locusId}' in parent genomes`);
    }

    // 50% chance to inherit maternal allele 1 or 2
    const inheritedA = rng.nextFloat() < 0.5 ? locusA[0] : locusA[1];

    // 50% chance to inherit paternal allele 1 or 2
    const inheritedB = rng.nextFloat() < 0.5 ? locusB[0] : locusB[1];

    childLoci[locusId] = [inheritedA, inheritedB];
  }

  return {
    schema_version: SCHEMA_VERSION,
    species_id: parentA.species_id,
    loci: childLoci
  };
}
