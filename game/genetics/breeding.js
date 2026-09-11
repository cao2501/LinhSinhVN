/**
 * LinhSinhVN — Breeding Orchestration Pipeline
 * 
 * Orchestrates:
 * Deterministic Seed -> Recombination -> Mutation -> Expression -> Phenotype -> Derived Stats -> Result & Lineage
 * 
 * Strictly adheres to docs/GENETICS_SPEC.md.
 */

import { SCHEMA_VERSION, DEFAULT_DEVELOPMENTAL_FACTOR, SEX } from './constants.js';
import { computeBreedingSeed, DeterministicRNG } from './rng.js';
import { recombineGenomes } from './recombination.js';
import { applyMutation } from './mutation.js';
import { calculatePhenotype } from './phenotype.js';
import { calculateDerivedStats } from './stats.js';
import { createLineageRecord } from './lineage.js';
import {
  validateGenome,
  validatePhenotype,
  validateDerivedStats,
  validateDevelopmentalFactor
} from './validation.js';

/**
 * Executes a deterministic breeding event between two parent organisms.
 * 
 * @param {object} parentA - Maternal parent descriptor
 * @param {string} parentA.id - Maternal organism ID
 * @param {object} parentA.genome - Maternal diploid genome
 * @param {number} parentA.generation - Maternal generation
 * @param {object} parentB - Paternal parent descriptor
 * @param {string} parentB.id - Paternal organism ID
 * @param {object} parentB.genome - Paternal diploid genome
 * @param {number} parentB.generation - Paternal generation
 * @param {object} options - Breeding configuration
 * @param {string|number} options.breedingNonce - Unique reproduction nonce
 * @param {string} [options.childId] - Generated child organism ID
 * @param {'MALE'|'FEMALE'} [options.childSex] - Child sex (rolled deterministically if omitted)
 * @param {number} [options.developmentalFactor=1.0] - Environmental realization factor eta in [0.60, 1.00]
 * @param {number} [options.mutationRate=0.05] - Per-allele mutation probability
 * @param {number} [options.maxMutationDelta=0.12] - Max bounded uniform delta
 * @param {string} [options.birthHabitat='habitat_default'] - Habitat identifier
 * @param {string} [options.explicitSeed] - Override seed for direct test harness injection
 * @returns {{
 *   breedingResult: object,
 *   lineageRecord: object,
 *   childGenome: object,
 *   phenotype: object,
 *   derivedStats: object,
 *   childSex: string,
 *   seedUsed: string
 * }}
 */
export function executeBreeding(parentA, parentB, options = {}) {
  // 1. Validate parent descriptors and genomes
  if (!parentA?.id || !parentA?.genome) {
    throw new Error('executeBreeding: parentA must have an id and genome.');
  }
  if (!parentB?.id || !parentB?.genome) {
    throw new Error('executeBreeding: parentB must have an id and genome.');
  }

  validateGenome(parentA.genome);
  validateGenome(parentB.genome);

  const developmentalFactor = options.developmentalFactor !== undefined
    ? Number(options.developmentalFactor)
    : DEFAULT_DEVELOPMENTAL_FACTOR;
  validateDevelopmentalFactor(developmentalFactor);

  const childGen = Math.max(Number(parentA.generation || 0), Number(parentB.generation || 0)) + 1;
  const nonce = options.breedingNonce !== undefined ? options.breedingNonce : 0;

  // 2. Derive 64-bit deterministic breeding seed
  const seedUsed = options.explicitSeed
    ? String(options.explicitSeed)
    : computeBreedingSeed(parentA.id, parentB.id, parentA.generation || 0, nonce);

  // 3. Initialize dedicated DeterministicRNG
  const rng = new DeterministicRNG(seedUsed);

  // 4. Recombination (Parent segregation in canonical locus order)
  const recombinedGenome = recombineGenomes(parentA.genome, parentB.genome, rng);

  // 5. Mutation (Independent pass following recombination in canonical locus order)
  const {
    mutatedGenome,
    mutationHistory,
    mutationOccurred
  } = applyMutation(recombinedGenome, rng, {
    mutationRate: options.mutationRate,
    maxDelta: options.maxMutationDelta
  });

  // Validate resulting child genome
  validateGenome(mutatedGenome);

  // 6. Child Sex Determination (deterministic roll if omitted)
  let childSex = options.childSex;
  if (!childSex) {
    childSex = rng.nextFloat() < 0.5 ? SEX.MALE : SEX.FEMALE;
  }

  // 7. Phenotype Calculation (Gene expression + developmental realization)
  const phenotype = calculatePhenotype(mutatedGenome, childSex, developmentalFactor);
  validatePhenotype(phenotype);

  // 8. Derived Stats Calculation
  const derivedStats = calculateDerivedStats(phenotype);
  validateDerivedStats(derivedStats);

  const childId = options.childId || `org_${mutatedGenome.species_id}_gen${childGen}_${seedUsed.slice(2, 8)}`;

  // 9. BreedingResult Data Structure (conforming strictly to breeding_result.schema.json)
  const breedingResult = {
    schema_version: SCHEMA_VERSION,
    seed_used: seedUsed,
    child_id: childId,
    child_genome: mutatedGenome,
    mutation_occurred: mutationOccurred,
    mutations: mutationHistory.map(m => ({
      locus_id: m.locus_id,
      allele_index: m.allele_index,
      old_value: m.old_value,
      new_value: m.new_value
    }))
  };

  // 10. LineageRecord Data Structure (conforming strictly to lineage_record.schema.json)
  const lineageRecord = createLineageRecord({
    organismId: childId,
    speciesId: mutatedGenome.species_id,
    generation: childGen,
    sex: childSex,
    parentIds: {
      maternal_id: parentA.id,
      paternal_id: parentB.id
    },
    breedingSeed: seedUsed,
    birthHabitat: options.birthHabitat || 'habitat_default',
    developmentalFactor,
    mutations: mutationHistory
  });

  return {
    breedingResult,
    lineageRecord,
    childGenome: mutatedGenome,
    phenotype,
    derivedStats,
    childSex,
    seedUsed
  };
}
