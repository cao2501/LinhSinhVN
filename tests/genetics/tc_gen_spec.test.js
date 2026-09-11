/**
 * LinhSinhVN — Genetics Specification Regression Tests (TC-GEN-01 -> TC-GEN-08)
 * 
 * Formal automated test suite executing all test cases defined in docs/GENETICS_TEST_CASES.md.
 * Strictly verifies the core biological and mathematical invariants.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGenome,
  freezeGenome,
  executeBreeding,
  applyMutation,
  calculatePhenotype,
  calculateDerivedStats,
  DeterministicRNG,
  SPECIES_LOCI_REGISTRY,
  SEX
} from '../../game/genetics/index.js';

describe('Specification Regression Suite: TC-GEN-01 -> TC-GEN-08', () => {

  /**
   * TC-GEN-01: Absolute Recombination Determinism
   * Verifies that identical parents bred with an identical PRNG seed produce
   * exactly identical offspring genomes, phenotypes, and derived stats.
   */
  it('TC-GEN-01: Absolute Recombination Determinism', () => {
    const genomeA = createGenome('xylotrupes_rhinoceros_proto', {
      LOCUS_BODY_SCALE: [0.30, 0.70],
      LOCUS_CHITIN_DENSITY: [0.45, 0.80],
      LOCUS_CEPHALIC_HORN: [0.55, 0.85],
      LOCUS_THORACIC_HORN: [0.40, 0.75],
      LOCUS_TARSAL_CLAW: [0.35, 0.65],
      LOCUS_METABOLIC_EFFICIENCY: [0.50, 0.90],
      LOCUS_CUTICLE_PIGMENT: [0.25, 0.75],
      LOCUS_ANTENNAL_CLUB: [0.40, 0.80]
    });
    const genomeB = createGenome('xylotrupes_rhinoceros_proto', {
      LOCUS_BODY_SCALE: [0.40, 0.60],
      LOCUS_CHITIN_DENSITY: [0.50, 0.65],
      LOCUS_CEPHALIC_HORN: [0.30, 0.60],
      LOCUS_THORACIC_HORN: [0.25, 0.55],
      LOCUS_TARSAL_CLAW: [0.55, 0.75],
      LOCUS_METABOLIC_EFFICIENCY: [0.45, 0.65],
      LOCUS_CUTICLE_PIGMENT: [0.35, 0.55],
      LOCUS_ANTENNAL_CLUB: [0.60, 0.70]
    });

    const parentA = { id: 'org_tc01_mat', genome: genomeA, generation: 1 };
    const parentB = { id: 'org_tc01_pat', genome: genomeB, generation: 1 };
    const seed = '0x5A2F08C1';

    // Step 1 & 2: Execute 2 separate breeding runs with identical seed
    const run1 = executeBreeding(parentA, parentB, {
      explicitSeed: seed,
      childSex: SEX.MALE,
      developmentalFactor: 1.0
    });

    const run2 = executeBreeding(parentA, parentB, {
      explicitSeed: seed,
      childSex: SEX.MALE,
      developmentalFactor: 1.0
    });

    // Verify seeds match
    assert.strictEqual(run1.seedUsed, seed, 'Run 1 must use the specified seed');
    assert.strictEqual(run2.seedUsed, seed, 'Run 2 must use the specified seed');

    // Verify alleles are bit-for-bit identical for every locus
    for (const locusId of SPECIES_LOCI_REGISTRY) {
      assert.strictEqual(
        run1.childGenome.loci[locusId][0],
        run2.childGenome.loci[locusId][0],
        `TC-GEN-01: Locus '${locusId}' allele_1 mismatch between run1 and run2`
      );
      assert.strictEqual(
        run1.childGenome.loci[locusId][1],
        run2.childGenome.loci[locusId][1],
        `TC-GEN-01: Locus '${locusId}' allele_2 mismatch between run1 and run2`
      );
    }

    // Verify phenotype values and derived stats are bit-for-bit identical
    assert.deepStrictEqual(
      run1.phenotype,
      run2.phenotype,
      'TC-GEN-01: Derived phenotype values must be bit-for-bit identical'
    );
    assert.deepStrictEqual(
      run1.derivedStats,
      run2.derivedStats,
      'TC-GEN-01: Derived stats must be bit-for-bit identical'
    );
    assert.deepStrictEqual(
      run1.breedingResult.mutations,
      run2.breedingResult.mutations,
      'TC-GEN-01: Mutation histories must be identical'
    );
  });

  /**
   * TC-GEN-02: Seed Sensitivity & Independent Assortment
   * Verifies that changing the PRNG seed produces different valid Mendelian assortments
   * without violating parental allele constraints.
   */
  it('TC-GEN-02: Seed Sensitivity & Independent Assortment', () => {
    const genomeA = createGenome('xylotrupes_rhinoceros_proto', {
      LOCUS_BODY_SCALE: [0.20, 0.80],
      LOCUS_CHITIN_DENSITY: [0.15, 0.85],
      LOCUS_CEPHALIC_HORN: [0.25, 0.75],
      LOCUS_THORACIC_HORN: [0.10, 0.90],
      LOCUS_TARSAL_CLAW: [0.30, 0.70],
      LOCUS_METABOLIC_EFFICIENCY: [0.20, 0.80],
      LOCUS_CUTICLE_PIGMENT: [0.05, 0.95],
      LOCUS_ANTENNAL_CLUB: [0.10, 0.80]
    });
    const genomeB = createGenome('xylotrupes_rhinoceros_proto', {
      LOCUS_BODY_SCALE: [0.30, 0.70],
      LOCUS_CHITIN_DENSITY: [0.25, 0.75],
      LOCUS_CEPHALIC_HORN: [0.35, 0.65],
      LOCUS_THORACIC_HORN: [0.20, 0.80],
      LOCUS_TARSAL_CLAW: [0.40, 0.60],
      LOCUS_METABOLIC_EFFICIENCY: [0.30, 0.70],
      LOCUS_CUTICLE_PIGMENT: [0.15, 0.85],
      LOCUS_ANTENNAL_CLUB: [0.20, 0.70]
    });

    const parentA = { id: 'org_tc02_mat', genome: genomeA, generation: 1 };
    const parentB = { id: 'org_tc02_pat', genome: genomeB, generation: 1 };

    const seed1 = '0x11111111';
    const seed2 = '0x99999999';

    const child1 = executeBreeding(parentA, parentB, {
      explicitSeed: seed1,
      mutationRate: 0.0 // Mutation disabled per spec
    });

    const child2 = executeBreeding(parentA, parentB, {
      explicitSeed: seed2,
      mutationRate: 0.0 // Mutation disabled per spec
    });

    // Check allele provenance for both children
    for (const locusId of SPECIES_LOCI_REGISTRY) {
      const parentAAlleles = genomeA.loci[locusId];
      const parentBAlleles = genomeB.loci[locusId];

      const c1 = child1.childGenome.loci[locusId];
      const c2 = child2.childGenome.loci[locusId];

      // Maternal allele check
      assert.ok(
        parentAAlleles.includes(c1[0]),
        `TC-GEN-02: Child 1 maternal allele ${c1[0]} at ${locusId} must come from Parent A`
      );
      assert.ok(
        parentAAlleles.includes(c2[0]),
        `TC-GEN-02: Child 2 maternal allele ${c2[0]} at ${locusId} must come from Parent A`
      );

      // Paternal allele check
      assert.ok(
        parentBAlleles.includes(c1[1]),
        `TC-GEN-02: Child 1 paternal allele ${c1[1]} at ${locusId} must come from Parent B`
      );
      assert.ok(
        parentBAlleles.includes(c2[1]),
        `TC-GEN-02: Child 2 paternal allele ${c2[1]} at ${locusId} must come from Parent B`
      );
    }

    // Verify Child 1 and Child 2 genomes are distinct across seeds
    const genomesDiffer = JSON.stringify(child1.childGenome) !== JSON.stringify(child2.childGenome);
    assert.ok(genomesDiffer, 'TC-GEN-02: Different seeds must produce different Mendelian combinations');
  });

  /**
   * TC-GEN-03: Zero-Mutation Invariant (Strict Mendelian Purity)
   * Verifies that when mutation probability is set to 0.0, no alleles outside
   * the exact parental set are ever introduced across 1,000 runs.
   */
  it('TC-GEN-03: Zero-Mutation Invariant (Strict Mendelian Purity across 1,000 runs)', () => {
    const genomeA = createGenome('xylotrupes_rhinoceros_proto', {
      LOCUS_BODY_SCALE: [0.11, 0.22],
      LOCUS_CHITIN_DENSITY: [0.33, 0.44],
      LOCUS_CEPHALIC_HORN: [0.55, 0.66],
      LOCUS_THORACIC_HORN: [0.77, 0.88],
      LOCUS_TARSAL_CLAW: [0.12, 0.34],
      LOCUS_METABOLIC_EFFICIENCY: [0.56, 0.78],
      LOCUS_CUTICLE_PIGMENT: [0.90, 0.15],
      LOCUS_ANTENNAL_CLUB: [0.25, 0.75]
    });
    const genomeB = createGenome('xylotrupes_rhinoceros_proto', {
      LOCUS_BODY_SCALE: [0.91, 0.82],
      LOCUS_CHITIN_DENSITY: [0.73, 0.64],
      LOCUS_CEPHALIC_HORN: [0.51, 0.42],
      LOCUS_THORACIC_HORN: [0.39, 0.28],
      LOCUS_TARSAL_CLAW: [0.98, 0.87],
      LOCUS_METABOLIC_EFFICIENCY: [0.65, 0.43],
      LOCUS_CUTICLE_PIGMENT: [0.21, 0.89],
      LOCUS_ANTENNAL_CLUB: [0.31, 0.69]
    });

    const parentA = { id: 'org_tc03_mat', genome: genomeA, generation: 1 };
    const parentB = { id: 'org_tc03_pat', genome: genomeB, generation: 1 };

    // Execute 1,000 runs across diverse deterministic seeds
    for (let i = 0; i < 1000; i++) {
      const seed = `0x${(0x1000000000000000n + BigInt(i * 7919)).toString(16)}`;
      const result = executeBreeding(parentA, parentB, {
        explicitSeed: seed,
        mutationRate: 0.0
      });

      assert.strictEqual(
        result.breedingResult.mutations.length,
        0,
        `TC-GEN-03: Mutation occurred at run ${i} despite rate = 0.0`
      );
      assert.strictEqual(
        result.breedingResult.mutation_occurred,
        false,
        `TC-GEN-03: mutation_occurred flag is true at run ${i}`
      );

      // Verify every child allele matches exactly maternal or paternal source
      for (const locusId of SPECIES_LOCI_REGISTRY) {
        const matAlleles = genomeA.loci[locusId];
        const patAlleles = genomeB.loci[locusId];
        const childAlleles = result.childGenome.loci[locusId];

        assert.ok(
          matAlleles.includes(childAlleles[0]),
          `TC-GEN-03: Novel maternal allele ${childAlleles[0]} at run ${i}, locus ${locusId}`
        );
        assert.ok(
          patAlleles.includes(childAlleles[1]),
          `TC-GEN-03: Novel paternal allele ${childAlleles[1]} at run ${i}, locus ${locusId}`
        );
      }
    }
  });

  /**
   * TC-GEN-04: Deterministic Mutation Induction
   * Verifies that with mutation enabled, identical seeds generate identical
   * mutation targets, deltas, and resulting alleles.
   */
  it('TC-GEN-04: Deterministic Mutation Induction', () => {
    const genomeA = createGenome('xylotrupes_rhinoceros_proto');
    const genomeB = createGenome('xylotrupes_rhinoceros_proto');

    const parentA = { id: 'org_tc04_mat', genome: genomeA, generation: 1 };
    const parentB = { id: 'org_tc04_pat', genome: genomeB, generation: 1 };
    const fixedSeed = '0xDEADBEEF42';

    const childA = executeBreeding(parentA, parentB, {
      explicitSeed: fixedSeed,
      mutationRate: 0.05
    });

    const childB = executeBreeding(parentA, parentB, {
      explicitSeed: fixedSeed,
      mutationRate: 0.05
    });

    // Identical mutation count and audit records
    assert.strictEqual(
      childA.breedingResult.mutations.length,
      childB.breedingResult.mutations.length,
      'TC-GEN-04: Mutation counts must be identical for identical seeds'
    );
    assert.deepStrictEqual(
      childA.breedingResult.mutations,
      childB.breedingResult.mutations,
      'TC-GEN-04: Mutation audit arrays must be bit-for-bit identical'
    );
    assert.deepStrictEqual(
      childA.childGenome,
      childB.childGenome,
      'TC-GEN-04: Mutated genomes must be bit-for-bit identical'
    );
  });

  /**
   * TC-GEN-05: Allele Clamping & Boundary Invariant
   * Verifies that extreme positive or negative mutations cannot push allele values outside [0.0, 1.0].
   */
  it('TC-GEN-05: Allele Clamping & Boundary Invariant', () => {
    // Parent near bounds: 0.98 and 0.02
    const boundaryGenome = createGenome('xylotrupes_rhinoceros_proto', {
      LOCUS_BODY_SCALE: [0.98, 0.02],
      LOCUS_CHITIN_DENSITY: [0.99, 0.01],
      LOCUS_CEPHALIC_HORN: [0.99, 0.01],
      LOCUS_THORACIC_HORN: [0.99, 0.01],
      LOCUS_TARSAL_CLAW: [0.99, 0.01],
      LOCUS_METABOLIC_EFFICIENCY: [0.99, 0.01],
      LOCUS_CUTICLE_PIGMENT: [0.99, 0.01],
      LOCUS_ANTENNAL_CLUB: [0.99, 0.01]
    });

    const rng = new DeterministicRNG('0xCAFEBABEDEAD');

    // Force extreme mutation delta of +/- 0.50 with 100% mutation rate
    const { mutatedGenome } = applyMutation(boundaryGenome, rng, {
      mutationRate: 1.0,
      maxDelta: 0.50
    });

    for (const locusId of SPECIES_LOCI_REGISTRY) {
      const [a1, a2] = mutatedGenome.loci[locusId];
      assert.ok(
        a1 >= 0.0 && a1 <= 1.0,
        `TC-GEN-05: mutated allele_1 at ${locusId} exceeded bounds [0.0, 1.0]: ${a1}`
      );
      assert.ok(
        a2 >= 0.0 && a2 <= 1.0,
        `TC-GEN-05: mutated allele_2 at ${locusId} exceeded bounds [0.0, 1.0]: ${a2}`
      );
    }
  });

  /**
   * TC-GEN-06: Parental Immutability (Zero Side-Effects)
   * Verifies that the breeding operation does not alter the state of either parent genome.
   */
  it('TC-GEN-06: Parental Immutability (Zero Side-Effects across 100 cycles)', () => {
    const genomeA = createGenome('xylotrupes_rhinoceros_proto', {
      LOCUS_BODY_SCALE: [0.35, 0.75],
      LOCUS_CHITIN_DENSITY: [0.40, 0.85],
      LOCUS_CEPHALIC_HORN: [0.60, 0.90],
      LOCUS_THORACIC_HORN: [0.50, 0.80],
      LOCUS_TARSAL_CLAW: [0.30, 0.70],
      LOCUS_METABOLIC_EFFICIENCY: [0.65, 0.85],
      LOCUS_CUTICLE_PIGMENT: [0.20, 0.80],
      LOCUS_ANTENNAL_CLUB: [0.45, 0.75]
    });
    const genomeB = createGenome('xylotrupes_rhinoceros_proto', {
      LOCUS_BODY_SCALE: [0.50, 0.65],
      LOCUS_CHITIN_DENSITY: [0.55, 0.70],
      LOCUS_CEPHALIC_HORN: [0.40, 0.70],
      LOCUS_THORACIC_HORN: [0.35, 0.65],
      LOCUS_TARSAL_CLAW: [0.60, 0.80],
      LOCUS_METABOLIC_EFFICIENCY: [0.50, 0.70],
      LOCUS_CUTICLE_PIGMENT: [0.40, 0.60],
      LOCUS_ANTENNAL_CLUB: [0.50, 0.80]
    });

    // Deep freeze parents to test immutability at engine level
    freezeGenome(genomeA);
    freezeGenome(genomeB);

    const baselineSnapshotA = JSON.stringify(genomeA);
    const baselineSnapshotB = JSON.stringify(genomeB);

    const parentA = { id: 'org_tc06_mat', genome: genomeA, generation: 1 };
    const parentB = { id: 'org_tc06_pat', genome: genomeB, generation: 1 };

    for (let cycle = 0; cycle < 100; cycle++) {
      executeBreeding(parentA, parentB, {
        breedingNonce: `cycle_${cycle}`,
        mutationRate: 0.10 // High mutation to ensure mutation code is actively executed
      });

      assert.strictEqual(
        JSON.stringify(parentA.genome),
        baselineSnapshotA,
        `TC-GEN-06: Parent A genome mutated at cycle ${cycle}!`
      );
      assert.strictEqual(
        JSON.stringify(parentB.genome),
        baselineSnapshotB,
        `TC-GEN-06: Parent B genome mutated at cycle ${cycle}!`
      );
    }
  });

  /**
   * TC-GEN-07: Sexual Dimorphism Phenotypic Masking
   * Verifies that females carrying high-expression horn alleles suppress the physical horn
   * phenotype while retaining the alleles in their genotype.
   */
  it('TC-GEN-07: Sexual Dimorphism Phenotypic Masking', () => {
    // Identical genomes carrying large horn alleles
    const testGenome = createGenome('xylotrupes_rhinoceros_proto', {
      LOCUS_BODY_SCALE: [0.80, 0.80],
      LOCUS_CHITIN_DENSITY: [0.50, 0.50],
      LOCUS_CEPHALIC_HORN: [0.85, 0.90],
      LOCUS_THORACIC_HORN: [0.80, 0.85],
      LOCUS_TARSAL_CLAW: [0.50, 0.50],
      LOCUS_METABOLIC_EFFICIENCY: [0.50, 0.50],
      LOCUS_CUTICLE_PIGMENT: [0.50, 0.50],
      LOCUS_ANTENNAL_CLUB: [0.50, 0.50]
    });

    const malePhenotype = calculatePhenotype(testGenome, SEX.MALE, 1.0);
    const femalePhenotype = calculatePhenotype(testGenome, SEX.FEMALE, 1.0);

    // Male horn expressivity
    assert.ok(
      malePhenotype.cephalic_horn_scale > 1.0,
      `TC-GEN-07: Expected male cephalic_horn_scale > 1.0, got ${malePhenotype.cephalic_horn_scale}`
    );
    assert.ok(
      malePhenotype.thoracic_horn_scale > 0.8,
      `TC-GEN-07: Expected male thoracic_horn_scale > 0.8, got ${malePhenotype.thoracic_horn_scale}`
    );

    const maleStats = calculateDerivedStats(malePhenotype);
    assert.ok(
      maleStats.clash_power > 80.0,
      `TC-GEN-07: Expected male clash_power > 80.0, got ${maleStats.clash_power}`
    );

    // Female complete horn masking
    assert.strictEqual(
      femalePhenotype.cephalic_horn_scale,
      0.0,
      'TC-GEN-07: Female cephalic_horn_scale must be exactly 0.0'
    );
    assert.strictEqual(
      femalePhenotype.thoracic_horn_scale,
      0.0,
      'TC-GEN-07: Female thoracic_horn_scale must be exactly 0.0'
    );

    const femaleStats = calculateDerivedStats(femalePhenotype);
    // Female clash power driven solely by claw grip
    const expectedFemaleClashPower = femalePhenotype.tarsal_grip_index * 25.0;
    assert.strictEqual(
      femaleStats.clash_power,
      expectedFemaleClashPower,
      'TC-GEN-07: Female clash_power must be driven solely by tarsal grip'
    );

    // Female genotype must retain horn alleles unattenuated
    assert.deepStrictEqual(
      testGenome.loci.LOCUS_CEPHALIC_HORN,
      [0.85, 0.90],
      'TC-GEN-07: Female genome must retain horn alleles [0.85, 0.90]'
    );

    // When female breeds with a hornless male, male offspring must express inherited horn
    const hornlessMaleGenome = createGenome('xylotrupes_rhinoceros_proto', {
      LOCUS_BODY_SCALE: [0.80, 0.80],
      LOCUS_CHITIN_DENSITY: [0.50, 0.50],
      LOCUS_CEPHALIC_HORN: [0.0, 0.0],
      LOCUS_THORACIC_HORN: [0.0, 0.0],
      LOCUS_TARSAL_CLAW: [0.50, 0.50],
      LOCUS_METABOLIC_EFFICIENCY: [0.50, 0.50],
      LOCUS_CUTICLE_PIGMENT: [0.50, 0.50],
      LOCUS_ANTENNAL_CLUB: [0.50, 0.50]
    });

    const crossChild = executeBreeding(
      { id: 'mat_f1', genome: testGenome, generation: 1 },
      { id: 'pat_hornless', genome: hornlessMaleGenome, generation: 1 },
      {
        breedingNonce: 'cross_f1_test',
        childSex: SEX.MALE,
        mutationRate: 0.0
      }
    );

    // Maternal horn allele (0.85 or 0.90) passed to male offspring
    const maleOffspringCeph = crossChild.childGenome.loci.LOCUS_CEPHALIC_HORN;
    assert.ok(
      [0.85, 0.90].includes(maleOffspringCeph[0]),
      'TC-GEN-07: Male offspring must inherit horn allele from masked female parent'
    );
    assert.strictEqual(
      maleOffspringCeph[1],
      0.0,
      'TC-GEN-07: Male offspring inherits 0.0 from hornless father'
    );
    assert.ok(
      crossChild.phenotype.cephalic_horn_scale > 0.0,
      'TC-GEN-07: Male offspring from masked mother expresses visible horn'
    );
  });

  /**
   * TC-GEN-08: Environmental Decoupling (Genotype Protection)
   * Verifies that severe environmental deficits (e.g., larval starvation)
   * modify realized phenotype attributes without altering the underlying genome.
   */
  it('TC-GEN-08: Environmental Decoupling (Genotype Protection)', () => {
    const parentA = {
      id: 'org_tc08_mat',
      genome: createGenome('xylotrupes_rhinoceros_proto'),
      generation: 1
    };
    const parentB = {
      id: 'org_tc08_pat',
      genome: createGenome('xylotrupes_rhinoceros_proto'),
      generation: 1
    };

    const fixedNonce = 'stunting_test_nonce';

    // Severely starved run: eta = 0.65 (35% nutritional deficit)
    const starvedRun = executeBreeding(parentA, parentB, {
      breedingNonce: fixedNonce,
      childSex: SEX.MALE,
      developmentalFactor: 0.65
    });

    // Baseline optimal run: eta = 1.00
    const normalRun = executeBreeding(parentA, parentB, {
      breedingNonce: fixedNonce,
      childSex: SEX.MALE,
      developmentalFactor: 1.00
    });

    // 1. Underling Genome MUST be 100% identical
    assert.deepStrictEqual(
      starvedRun.childGenome,
      normalRun.childGenome,
      'TC-GEN-08: Starved and normal offspring must have identical genotypes'
    );

    // 2. Realized adult body scale is reduced by exactly 35% (eta = 0.65)
    const expectedStarvedScale = normalRun.phenotype.body_scale_index * 0.65;
    assert.ok(
      Math.abs(starvedRun.phenotype.body_scale_index - expectedStarvedScale) < 1e-9,
      'TC-GEN-08: Realized body_scale_index must be scaled by eta = 0.65'
    );

    // 3. Progeny of starved organism raised under optimal conditions (eta = 1.00)
    // develop full genetic body scale
    const starvedParent = {
      id: 'org_starved_adult',
      genome: starvedRun.childGenome,
      generation: 2
    };
    const secondParent = {
      id: 'org_mate',
      genome: normalRun.childGenome,
      generation: 2
    };

    const nextGenRun = executeBreeding(starvedParent, secondParent, {
      breedingNonce: 'next_gen_optimal',
      childSex: SEX.MALE,
      developmentalFactor: 1.00
    });

    assert.ok(
      nextGenRun.phenotype.body_scale_index >= 0.70,
      'TC-GEN-08: Progeny of stunted organism develops full genetic scale under eta = 1.0'
    );
  });
});
