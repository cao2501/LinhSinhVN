/**
 * LinhSinhVN — Pure Reproduction Eligibility Evaluator
 *
 * Verifies all biological, physiological, and profile constraints.
 * Strictly READ-ONLY with ZERO state mutation.
 */

import { ELIGIBILITY_REASONS } from './constants.js';

/**
 * Evaluates whether two organisms are eligible to reproduce at the specified simulation tick.
 *
 * @param {object} parentA - First parent organism state
 * @param {object} parentB - Second parent organism state
 * @param {object} speciesProfile - Deeply frozen SpeciesProfile
 * @param {number} currentTick - Current global simulation tick
 * @returns {{
 *   eligible: boolean,
 *   reasons: Array<string>,
 *   parent_a_id: string,
 *   parent_b_id: string
 * }} Structured evaluation result
 */
export function evaluateReproductionEligibility(parentA, parentB, speciesProfile, currentTick = 0) {
  if (!parentA || !parentB) {
    throw new TypeError('Both parentA and parentB must be defined organism states');
  }
  if (!speciesProfile?.reproduction_profile) {
    throw new TypeError('speciesProfile with valid reproduction_profile must be provided');
  }

  const reasons = [];
  const repProf = speciesProfile.reproduction_profile;

  // A. Vitality check
  if (!parentA.is_alive || parentA.status !== 'ALIVE' || !parentB.is_alive || parentB.status !== 'ALIVE') {
    reasons.push(ELIGIBILITY_REASONS.ORGANISM_NOT_ALIVE);
  }

  // B. Species compatibility
  if (parentA.species_id !== speciesProfile.species_id || parentB.species_id !== speciesProfile.species_id) {
    reasons.push(ELIGIBILITY_REASONS.SPECIES_INCOMPATIBLE);
  }

  // C. Sex requirements
  if (repProf.sex_requirements === 'HETEROSEXUAL_MALE_FEMALE') {
    const isHetero = (parentA.sex === 'MALE' && parentB.sex === 'FEMALE') ||
                     (parentA.sex === 'FEMALE' && parentB.sex === 'MALE');
    if (!isHetero) {
      reasons.push(ELIGIBILITY_REASONS.SEX_INCOMPATIBLE);
    }
  }

  // D. Reproductive lifecycle stage
  const requiredStage = repProf.reproductive_stage_id;
  if (parentA.current_stage_id !== requiredStage || parentB.current_stage_id !== requiredStage) {
    reasons.push(ELIGIBILITY_REASONS.STAGE_INCOMPATIBLE);
  }

  // E. Minimum mating age (ticks in adult stage)
  const minAge = repProf.min_mating_age_ticks || 0;
  if (parentA.stage_age_ticks < minAge || parentB.stage_age_ticks < minAge) {
    reasons.push(ELIGIBILITY_REASONS.AGE_INSUFFICIENT);
  }

  // F. Reproduction cooldown
  const cooldownA = typeof parentA.reproduction_cooldown_until_tick === 'number'
    ? parentA.reproduction_cooldown_until_tick
    : ((parentA.last_reproduction_tick ?? -Infinity) + (repProf.breeding_cooldown_ticks || 0));
  const cooldownB = typeof parentB.reproduction_cooldown_until_tick === 'number'
    ? parentB.reproduction_cooldown_until_tick
    : ((parentB.last_reproduction_tick ?? -Infinity) + (repProf.breeding_cooldown_ticks || 0));

  if (currentTick < cooldownA || currentTick < cooldownB) {
    reasons.push(ELIGIBILITY_REASONS.COOLDOWN_ACTIVE);
  }

  // G. Reproduction energy cost
  const energyCost = repProf.energy_cost_per_mating || 0.0;
  const energyA = parentA.nutrition_state?.stored_energy ?? 0.0;
  const energyB = parentB.nutrition_state?.stored_energy ?? 0.0;

  if (energyA < energyCost || energyB < energyCost) {
    reasons.push(ELIGIBILITY_REASONS.INSUFFICIENT_ENERGY);
  }

  // H. Physiological blocks (e.g. chronic overstress)
  if (parentA.stress_state?.is_overstressed || parentB.stress_state?.is_overstressed) {
    reasons.push(ELIGIBILITY_REASONS.REPRODUCTIVELY_BLOCKED);
  }

  return {
    eligible: reasons.length === 0,
    reasons,
    parent_a_id: parentA.organism_id,
    parent_b_id: parentB.organism_id
  };
}
