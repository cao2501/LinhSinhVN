/**
 * LinhSinhVN — Lineage Record Layer
 * 
 * Creates historical genealogical lineage records tracking ancestry, generational depth, and mutations.
 * Conforms to data/genetics/schema/lineage_record.schema.json.
 */

import { SCHEMA_VERSION, DEFAULT_DEVELOPMENTAL_FACTOR } from './constants.js';

/**
 * Constructs a conforming LineageRecord object.
 * 
 * @param {object} params
 * @param {string} params.organismId
 * @param {string} params.speciesId
 * @param {number} params.generation
 * @param {'MALE'|'FEMALE'} params.sex
 * @param {{ maternal_id: string|null, paternal_id: string|null }} params.parentIds
 * @param {string} params.breedingSeed
 * @param {string} [params.birthHabitat='habitat_default']
 * @param {number} [params.developmentalFactor=DEFAULT_DEVELOPMENTAL_FACTOR]
 * @param {Array<object>} [params.mutations=[]]
 * @returns {object} Conforming LineageRecord object
 */
export function createLineageRecord({
  organismId,
  speciesId,
  generation,
  sex,
  parentIds,
  breedingSeed,
  birthHabitat = 'habitat_default',
  developmentalFactor = DEFAULT_DEVELOPMENTAL_FACTOR,
  mutations = []
}) {
  return {
    schema_version: SCHEMA_VERSION,
    organism_id: organismId,
    species_id: speciesId,
    generation: Number(generation),
    sex,
    parent_ids: {
      maternal_id: parentIds?.maternal_id || null,
      paternal_id: parentIds?.paternal_id || null
    },
    breeding_seed: breedingSeed,
    birth_habitat: birthHabitat,
    developmental_realization_factor: Number(developmentalFactor),
    mutation_count: mutations.length,
    mutations: mutations.map(m => ({
      locus_id: m.locus_id,
      allele_index: m.allele_index,
      old_value: m.old_value,
      new_value: m.new_value
    }))
  };
}
