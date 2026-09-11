/**
 * LinhSinhVN — Phenotype Mapping Layer
 * 
 * Maps intermediate gene expression scalars to concrete gameplay phenotype indices.
 * Applies developmental realization modifier without altering underlying genome.
 * Strictly adheres to docs/GENETICS_SPEC.md Section 6 & Section 8.
 * Conforms to data/genetics/schema/phenotype.schema.json.
 */

import {
  SCHEMA_VERSION,
  SEX,
  DEFAULT_DEVELOPMENTAL_FACTOR,
  MIN_DEVELOPMENTAL_FACTOR,
  MAX_DEVELOPMENTAL_FACTOR
} from './constants.js';
import { calculateGeneExpression } from './expression.js';

/**
 * Derives the complete morphological and physiological phenotype of an organism.
 * Pure function: Does NOT mutate the genome.
 * 
 * @param {object} genome - Diploid genome object
 * @param {'MALE'|'FEMALE'} sex - Biological sex
 * @param {number} [developmentalFactor=1.0] - Environmental realization factor eta in [0.60, 1.00]
 * @returns {object} Conforming OrganismPhenotype object
 */
export function calculatePhenotype(genome, sex, developmentalFactor = DEFAULT_DEVELOPMENTAL_FACTOR) {
  const eta = Number(developmentalFactor);
  if (Number.isNaN(eta) || eta < MIN_DEVELOPMENTAL_FACTOR || eta > MAX_DEVELOPMENTAL_FACTOR) {
    throw new RangeError(
      `developmentalFactor must be in range [${MIN_DEVELOPMENTAL_FACTOR}, ${MAX_DEVELOPMENTAL_FACTOR}]. Got: ${developmentalFactor}`
    );
  }

  const vExp = calculateGeneExpression(genome, sex);

  // 1. Body scale (genetic potential modified by developmental realization eta)
  const geneticBodyScale = 0.70 + (vExp.LOCUS_BODY_SCALE * 0.80);
  const bodyScaleIndex = geneticBodyScale * eta;

  // 2. Mass index (cascades from realized body scale and chitin mineralization)
  const massIndex = (0.80 + (vExp.LOCUS_BODY_SCALE * eta) * 1.0) * (1.0 + vExp.LOCUS_CHITIN_DENSITY * 0.2);

  // 3. Cuticle hardness index
  const cuticleHardnessIndex = 1.0 + (vExp.LOCUS_CHITIN_DENSITY * 2.0);

  // 4. Cephalic horn scale (sex-limited to males, allometrically scaled with realized body scale)
  let cephalicHornScale = 0.0;
  if (sex === SEX.MALE) {
    cephalicHornScale = Math.pow(vExp.LOCUS_CEPHALIC_HORN, 1.2) * 1.50 * bodyScaleIndex;
  }

  // 5. Thoracic horn scale (sex-limited to males, allometrically scaled with realized body scale)
  let thoracicHornScale = 0.0;
  if (sex === SEX.MALE) {
    thoracicHornScale = vExp.LOCUS_THORACIC_HORN * 1.20 * bodyScaleIndex;
  }

  // 6. Tarsal grip index
  const tarsalGripIndex = 0.80 + (vExp.LOCUS_TARSAL_CLAW * 1.20) + (vExp.LOCUS_BODY_SCALE * 0.50);

  // 7. Metabolic drain index (inversely scaled with efficiency, weighted by mass)
  const metabolicDrainIndex = (1.40 - (vExp.LOCUS_METABOLIC_EFFICIENCY * 0.60)) * Math.pow(massIndex, 0.3);

  // 8. Stamina economy modifier (higher efficiency reduces stamina costs)
  const staminaEconomyModifier = 0.80 + (vExp.LOCUS_METABOLIC_EFFICIENCY * 0.50);

  // 9. Sensory range units
  const sensoryRangeUnits = 15.0 + (vExp.LOCUS_ANTENNAL_CLUB * 45.0);

  // 10. Cuticle pigment ratio
  const cuticlePigmentRatio = vExp.LOCUS_CUTICLE_PIGMENT;

  return {
    schema_version: SCHEMA_VERSION,
    sex,
    body_scale_index: bodyScaleIndex,
    mass_index: massIndex,
    cuticle_hardness_index: cuticleHardnessIndex,
    cephalic_horn_scale: cephalicHornScale,
    thoracic_horn_scale: thoracicHornScale,
    tarsal_grip_index: tarsalGripIndex,
    metabolic_drain_index: metabolicDrainIndex,
    stamina_economy_modifier: staminaEconomyModifier,
    sensory_range_units: sensoryRangeUnits,
    cuticle_pigment_ratio: cuticlePigmentRatio
  };
}
