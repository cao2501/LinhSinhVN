/**
 * LinhSinhVN — Deterministic Parent Pair Canonicalization
 *
 * Ensures reproduction outcomes are strictly order-independent:
 * reproduce(parent1, parent2) === reproduce(parent2, parent1)
 */

/**
 * Resolves two candidate parents into canonical (ParentA, ParentB) order.
 *
 * Rules:
 * 1. For heterosexual mating (e.g. HETEROSEXUAL_MALE_FEMALE):
 *    - Parent A = FEMALE (Maternal)
 *    - Parent B = MALE (Paternal)
 * 2. For isogamous / hermaphroditic / same-sex systems:
 *    - Parent A = organism with lexicographically smaller organism_id (id1 < id2)
 *    - Parent B = other organism
 *
 * @param {object} parent1 - First candidate parent organism state
 * @param {object} parent2 - Second candidate parent organism state
 * @param {object} speciesProfile - Deeply frozen SpeciesProfile
 * @returns {{ parentA: object, parentB: object, isSwapped: boolean }} Canonicalized parent pair
 */
export function canonicalizeParentPair(parent1, parent2, speciesProfile) {
  if (!parent1 || !parent2) {
    throw new TypeError('Both parent1 and parent2 must be defined objects');
  }

  const matingSystem = speciesProfile?.reproduction_profile?.sex_requirements || 'HETEROSEXUAL_MALE_FEMALE';

  if (matingSystem === 'HETEROSEXUAL_MALE_FEMALE') {
    if (parent1.sex === 'FEMALE' && parent2.sex === 'MALE') {
      return { parentA: parent1, parentB: parent2, isSwapped: false };
    }
    if (parent1.sex === 'MALE' && parent2.sex === 'FEMALE') {
      return { parentA: parent2, parentB: parent1, isSwapped: true };
    }
  }

  // Fallback for same-sex, isogamous, or hermaphroditic pairing:
  // Deterministic lexicographical tie-break on organism_id
  const id1 = String(parent1.organism_id || '');
  const id2 = String(parent2.organism_id || '');

  if (id1 <= id2) {
    return { parentA: parent1, parentB: parent2, isSwapped: false };
  } else {
    return { parentA: parent2, parentB: parent1, isSwapped: true };
  }
}
