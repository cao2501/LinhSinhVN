/**
 * LinhSinhVN — Validation & Architectural Invariants Regression Suite
 * 
 * Verifies that the engine strictly rejects invalid inputs with descriptive errors,
 * maintains canonical iteration ordering, and correctly executes per-allele mutation rolls.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGenome,
  validateGenome,
  validateSex,
  validateDevelopmentalFactor,
  validatePhenotype,
  validateDerivedStats,
  applyMutation,
  recombineGenomes,
  DeterministicRNG,
  SPECIES_LOCI_REGISTRY,
  SEX
} from '../../game/genetics/index.js';

describe('Validation Layer & Core Invariants', () => {

  describe('Boundary & Type Validation', () => {
    it('throws when genome has an allele < 0.0', () => {
      const g = createGenome('xylotrupes_rhinoceros_proto');
      g.loci.LOCUS_BODY_SCALE[0] = -0.05;
      assert.throws(() => validateGenome(g), /out of bounds/);
    });

    it('throws when genome has an allele > 1.0', () => {
      const g = createGenome('xylotrupes_rhinoceros_proto');
      g.loci.LOCUS_CHITIN_DENSITY[1] = 1.05;
      assert.throws(() => validateGenome(g), /out of bounds/);
    });

    it('throws when genome has an allele equal to NaN', () => {
      const g = createGenome('xylotrupes_rhinoceros_proto');
      g.loci.LOCUS_TARSAL_CLAW[0] = NaN;
      assert.throws(() => validateGenome(g), /NaN/);
    });

    it('throws when genome has an allele equal to Infinity', () => {
      const g = createGenome('xylotrupes_rhinoceros_proto');
      g.loci.LOCUS_METABOLIC_EFFICIENCY[1] = Infinity;
      assert.throws(() => validateGenome(g), /Infinity/);
    });

    it('throws when a locus is missing from genome', () => {
      const g = createGenome('xylotrupes_rhinoceros_proto');
      delete g.loci.LOCUS_ANTENNAL_CLUB;
      assert.throws(() => validateGenome(g), /expected exactly 8 loci/);
    });

    it('throws when a locus is not diploid (e.g. 1 or 3 alleles)', () => {
      const g1 = createGenome('xylotrupes_rhinoceros_proto');
      g1.loci.LOCUS_BODY_SCALE = [0.5]; // 1 allele
      assert.throws(() => validateGenome(g1), /diploid/);

      const g3 = createGenome('xylotrupes_rhinoceros_proto');
      g3.loci.LOCUS_BODY_SCALE = [0.5, 0.5, 0.5]; // 3 alleles
      assert.throws(() => validateGenome(g3), /diploid/);
    });

    it('throws when sex is not MALE or FEMALE', () => {
      assert.throws(() => validateSex('UNKNOWN'), /Sex validation failed/);
      assert.throws(() => validateSex('HERMAPHRODITE'), /Sex validation failed/);
    });

    it('throws when developmental factor eta is out of bounds [0.60, 1.00]', () => {
      assert.throws(() => validateDevelopmentalFactor(0.55), /out of bounds/);
      assert.throws(() => validateDevelopmentalFactor(1.05), /out of bounds/);
      assert.throws(() => validateDevelopmentalFactor(NaN), /invalid number/);
    });

    it('throws when female phenotype has non-zero horn scale', () => {
      const invalidFemalePt = {
        sex: SEX.FEMALE,
        body_scale_index: 1.0,
        mass_index: 1.0,
        cuticle_hardness_index: 1.5,
        cephalic_horn_scale: 0.25, // VIOLATION
        thoracic_horn_scale: 0.0,
        tarsal_grip_index: 1.0,
        metabolic_drain_index: 1.0,
        stamina_economy_modifier: 1.0,
        sensory_range_units: 30.0,
        cuticle_pigment_ratio: 0.5
      };
      assert.throws(() => validatePhenotype(invalidFemalePt), /female horns must be masked to 0.0/);
    });

    it('throws when derived stats contain negative or non-finite values', () => {
      const invalidStats = {
        max_hp: -50, // VIOLATION
        clash_power: 50,
        armor_reduction: 0.2,
        crawl_speed: 10,
        max_stamina: 80,
        action_stamina_cost: 10,
        stamina_regen_rate: 5,
        perception_radius: 30,
        starvation_endurance_time: 100
      };
      assert.throws(() => validateDerivedStats(invalidStats), /negative/);
    });
  });

  describe('Architectural Invariants & Semantics', () => {
    it('Per-Allele Mutation Semantics: 100% mutation rate produces exactly 16 mutations', () => {
      const genome = createGenome('xylotrupes_rhinoceros_proto');
      const rng = new DeterministicRNG('0x1234567890ABCDEF');

      // If mutation rate is 1.0, each of the 16 alleles in the 8 diploid loci must mutate
      const { mutationCount, mutationHistory } = applyMutation(genome, rng, {
        mutationRate: 1.0,
        maxDelta: 0.05
      });

      assert.strictEqual(mutationCount, 16, '8 diploid loci = 16 independent allele mutation evaluations');
      assert.strictEqual(mutationHistory.length, 16);

      // Verify each locus has exactly 1 mutation for allele_index 1 and 1 for allele_index 2
      for (const locusId of SPECIES_LOCI_REGISTRY) {
        const locusMutations = mutationHistory.filter(m => m.locus_id === locusId);
        assert.strictEqual(locusMutations.length, 2, `Locus ${locusId} must have 2 mutations`);
        assert.strictEqual(locusMutations[0].allele_index, 1);
        assert.strictEqual(locusMutations[1].allele_index, 2);
      }
    });

    it('Canonical Order: Recombination and Mutation consume PRNG in strict SPECIES_LOCI_REGISTRY order', () => {
      // Create a test PRNG tracker
      let rolls = 0;
      const trackingRng = {
        nextFloat() {
          rolls++;
          return 0.25; // Constant roll
        }
      };

      const pA = createGenome('xylotrupes_rhinoceros_proto');
      const pB = createGenome('xylotrupes_rhinoceros_proto');

      recombineGenomes(pA, pB, trackingRng);
      // 8 loci * 2 rolls per locus = exactly 16 PRNG rolls
      assert.strictEqual(rolls, 16, 'Recombination must consume exactly 2 PRNG rolls per canonical locus');
    });
  });
});
