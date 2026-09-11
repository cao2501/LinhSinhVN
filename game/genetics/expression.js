/**
 * LinhSinhVN — Gene Expression Layer
 * 
 * Computes intermediate expressed scalar values (V_exp in [0.0, 1.0]) from diploid allele pairs.
 * Strictly adheres to docs/GENETICS_SPEC.md Section 3 & Section 9.
 */

import { SEX } from './constants.js';

/**
 * Calculates intermediate expressed values across all loci for an organism.
 * Pure function: Does NOT mutate the genome.
 * 
 * @param {object} genome - Diploid genome object
 * @param {'MALE'|'FEMALE'} sex - Biological sex of the organism
 * @returns {Record<string, number>} Map of locus ID to expressed scalar V_exp
 */
export function calculateGeneExpression(genome, sex) {
  if (!genome?.loci) {
    throw new TypeError('calculateGeneExpression requires a valid genome object with loci');
  }
  if (sex !== SEX.MALE && sex !== SEX.FEMALE) {
    throw new TypeError(`Invalid sex '${sex}'. Must be 'MALE' or 'FEMALE'.`);
  }

  const loci = genome.loci;
  const expressed = {};

  // 1. LOCUS_BODY_SCALE: Additive codominance
  const body = loci.LOCUS_BODY_SCALE;
  expressed.LOCUS_BODY_SCALE = (body[0] + body[1]) / 2.0;

  // 2. LOCUS_CHITIN_DENSITY: Incomplete dominance with positive reinforcement
  const chitin = loci.LOCUS_CHITIN_DENSITY;
  expressed.LOCUS_CHITIN_DENSITY = 0.4 * Math.min(chitin[0], chitin[1]) + 0.6 * Math.max(chitin[0], chitin[1]);

  // 3. LOCUS_CEPHALIC_HORN: Sex-limited expression
  const cephHorn = loci.LOCUS_CEPHALIC_HORN;
  if (sex === SEX.FEMALE) {
    expressed.LOCUS_CEPHALIC_HORN = 0.0;
  } else {
    expressed.LOCUS_CEPHALIC_HORN = (cephHorn[0] + cephHorn[1]) / 2.0;
  }

  // 4. LOCUS_THORACIC_HORN: Sex-limited expression
  const thHorn = loci.LOCUS_THORACIC_HORN;
  if (sex === SEX.FEMALE) {
    expressed.LOCUS_THORACIC_HORN = 0.0;
  } else {
    expressed.LOCUS_THORACIC_HORN = (thHorn[0] + thHorn[1]) / 2.0;
  }

  // 5. LOCUS_TARSAL_CLAW: Additive codominance
  const claw = loci.LOCUS_TARSAL_CLAW;
  expressed.LOCUS_TARSAL_CLAW = (claw[0] + claw[1]) / 2.0;

  // 6. LOCUS_METABOLIC_EFFICIENCY: Additive codominance
  const meta = loci.LOCUS_METABOLIC_EFFICIENCY;
  expressed.LOCUS_METABOLIC_EFFICIENCY = (meta[0] + meta[1]) / 2.0;

  // 7. LOCUS_CUTICLE_PIGMENT: Additive codominance
  const pigment = loci.LOCUS_CUTICLE_PIGMENT;
  expressed.LOCUS_CUTICLE_PIGMENT = (pigment[0] + pigment[1]) / 2.0;

  // 8. LOCUS_ANTENNAL_CLUB: Dominance of larger lamellae
  const antenna = loci.LOCUS_ANTENNAL_CLUB;
  expressed.LOCUS_ANTENNAL_CLUB = 0.7 * Math.max(antenna[0], antenna[1]) + 0.3 * Math.min(antenna[0], antenna[1]);

  return expressed;
}
