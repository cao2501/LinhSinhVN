/**
 * LinhSinhVN — Genome Model
 * 
 * Provides pure factory, cloning, and deep immutability helpers for diploid genomes.
 * Conforms to data/genetics/schema/genome.schema.json.
 */

import { SCHEMA_VERSION, PROTOTYPE_SPECIES_ID, SPECIES_LOCI_REGISTRY } from './constants.js';

/**
 * Creates a fresh diploid genome data structure.
 * 
 * @param {string} [speciesId=PROTOTYPE_SPECIES_ID] 
 * @param {Record<string, [number, number]>} lociMap 
 * @returns {object} Conforming OrganismGenome object
 */
export function createGenome(speciesId = PROTOTYPE_SPECIES_ID, lociMap = {}) {
  const loci = {};
  
  for (const locusId of SPECIES_LOCI_REGISTRY) {
    if (lociMap[locusId]) {
      const [a1, a2] = lociMap[locusId];
      loci[locusId] = [Number(a1), Number(a2)];
    } else {
      // Default baseline alleles
      loci[locusId] = [0.5, 0.5];
    }
  }

  return {
    schema_version: SCHEMA_VERSION,
    species_id: speciesId,
    loci
  };
}

/**
 * Creates a complete deep clone of a genome, ensuring child genomes
 * share zero references with parents.
 * 
 * @param {object} genome 
 * @returns {object} Independent deep copy of the genome
 */
export function cloneGenome(genome) {
  if (!genome || typeof genome !== 'object') {
    throw new TypeError('cloneGenome requires a valid genome object');
  }

  const clonedLoci = {};
  for (const [locusId, alleles] of Object.entries(genome.loci || {})) {
    clonedLoci[locusId] = [alleles[0], alleles[1]];
  }

  return {
    schema_version: genome.schema_version || SCHEMA_VERSION,
    species_id: genome.species_id || PROTOTYPE_SPECIES_ID,
    loci: clonedLoci
  };
}

/**
 * Deeply freezes a genome object to mathematically enforce parent immutability.
 * 
 * @param {object} genome 
 * @returns {object} Deeply frozen genome
 */
export function freezeGenome(genome) {
  if (!genome || typeof genome !== 'object') return genome;

  if (genome.loci && typeof genome.loci === 'object') {
    for (const alleles of Object.values(genome.loci)) {
      if (Array.isArray(alleles)) {
        Object.freeze(alleles);
      }
    }
    Object.freeze(genome.loci);
  }

  return Object.freeze(genome);
}
