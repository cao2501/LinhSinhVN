/**
 * LinhSinhVN — Mutation Engine
 * 
 * Implements post-recombination bounded stochastic mutation across canonical locus order.
 * Strictly adheres to docs/GENETICS_SPEC.md Section 5.
 */

import {
  SCHEMA_VERSION,
  SPECIES_LOCI_REGISTRY,
  DEFAULT_MUTATION_RATE,
  DEFAULT_MAX_MUTATION_DELTA
} from './constants.js';

/**
 * Applies bounded mutations to a newly recombined genome.
 * Evaluates each allele independently in canonical locus order.
 * 
 * @param {object} genome - Target genome to mutate (cloned / child genome)
 * @param {import('./rng.js').DeterministicRNG} rng - Deterministic PRNG instance
 * @param {object} [options]
 * @param {number} [options.mutationRate=DEFAULT_MUTATION_RATE] - Probability per allele
 * @param {number} [options.maxDelta=DEFAULT_MAX_MUTATION_DELTA] - Maximum uniform delta
 * @returns {{ mutatedGenome: object, mutationHistory: Array<object>, mutationOccurred: boolean, mutationCount: number }}
 */
export function applyMutation(genome, rng, options = {}) {
  const pMut = options.mutationRate !== undefined ? options.mutationRate : DEFAULT_MUTATION_RATE;
  const deltaMax = options.maxDelta !== undefined ? options.maxDelta : DEFAULT_MAX_MUTATION_DELTA;

  if (!genome?.loci) {
    throw new TypeError('applyMutation requires a valid genome object with loci');
  }
  if (!rng || typeof rng.nextFloat !== 'function') {
    throw new TypeError('applyMutation requires a valid DeterministicRNG instance');
  }

  // Deep clone child loci to ensure no external references
  const mutatedLoci = {};
  for (const [k, v] of Object.entries(genome.loci)) {
    mutatedLoci[k] = [v[0], v[1]];
  }

  const mutationHistory = [];

  // Strictly traverse canonical locus order
  for (const locusId of SPECIES_LOCI_REGISTRY) {
    const locus = mutatedLoci[locusId];
    if (!locus) {
      throw new Error(`Missing locus '${locusId}' in genome during mutation pass`);
    }

    // Evaluate maternal allele (index 1 in 1-based schema, 0 in JS array)
    if (rng.nextFloat() < pMut) {
      const delta = (rng.nextFloat() * 2.0 - 1.0) * deltaMax;
      const oldVal = locus[0];
      const newVal = Math.max(0.0, Math.min(1.0, oldVal + delta));
      locus[0] = newVal;
      mutationHistory.push({
        locus_id: locusId,
        allele_index: 1,
        old_value: oldVal,
        new_value: newVal
      });
    }

    // Evaluate paternal allele (index 2 in 1-based schema, 1 in JS array)
    if (rng.nextFloat() < pMut) {
      const delta = (rng.nextFloat() * 2.0 - 1.0) * deltaMax;
      const oldVal = locus[1];
      const newVal = Math.max(0.0, Math.min(1.0, oldVal + delta));
      locus[1] = newVal;
      mutationHistory.push({
        locus_id: locusId,
        allele_index: 2,
        old_value: oldVal,
        new_value: newVal
      });
    }
  }

  const mutatedGenome = {
    schema_version: genome.schema_version || SCHEMA_VERSION,
    species_id: genome.species_id,
    loci: mutatedLoci
  };

  return {
    mutatedGenome,
    mutationHistory,
    mutationOccurred: mutationHistory.length > 0,
    mutationCount: mutationHistory.length
  };
}
