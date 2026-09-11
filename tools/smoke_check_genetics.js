/**
 * LinhSinhVN — Genetics Engine Smoke Check
 * 
 * Verifies that the headless engine executes deterministically:
 * Run 1 and Run 2 with identical inputs produce bit-for-bit identical outputs.
 * Verifies parent immutability, female horn masking, and developmental decoupling.
 */

import {
  createGenome,
  freezeGenome,
  executeBreeding,
  SEX
} from '../game/genetics/index.js';

function runSmokeCheck() {
  console.log('====================================================');
  console.log('LINHSINHVN — GENETICS ENGINE SMOKE CHECK (TASK 03-A)');
  console.log('====================================================\n');

  // Setup Parent A (Maternal)
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
  freezeGenome(genomeA);

  // Setup Parent B (Paternal)
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
  freezeGenome(genomeB);

  const parentA = {
    id: 'org_proto_mat_001',
    genome: genomeA,
    generation: 1
  };

  const parentB = {
    id: 'org_proto_pat_002',
    genome: genomeB,
    generation: 1
  };

  const fixedNonce = 'trial_smoke_nonce_42';
  const fixedEta = 0.85;

  console.log('[1] Executing Run 1...');
  const run1 = executeBreeding(parentA, parentB, {
    breedingNonce: fixedNonce,
    childSex: SEX.MALE,
    developmentalFactor: fixedEta,
    birthHabitat: 'habitat_cuc_phuong'
  });

  console.log('[2] Executing Run 2 with identical inputs...');
  const run2 = executeBreeding(parentA, parentB, {
    breedingNonce: fixedNonce,
    childSex: SEX.MALE,
    developmentalFactor: fixedEta,
    birthHabitat: 'habitat_cuc_phuong'
  });

  // Verify Determinism
  const json1 = JSON.stringify(run1);
  const json2 = JSON.stringify(run2);
  const isIdentical = json1 === json2;

  console.log('\n--- DETERMINISM COMPARISON ---');
  console.log(`Seed 1: ${run1.seedUsed}`);
  console.log(`Seed 2: ${run2.seedUsed}`);
  console.log(`Seeds Match: ${run1.seedUsed === run2.seedUsed}`);
  console.log(`Genomes Match: ${JSON.stringify(run1.childGenome) === JSON.stringify(run2.childGenome)}`);
  console.log(`Phenotypes Match: ${JSON.stringify(run1.phenotype) === JSON.stringify(run2.phenotype)}`);
  console.log(`Derived Stats Match: ${JSON.stringify(run1.derivedStats) === JSON.stringify(run2.derivedStats)}`);
  console.log(`Mutation Histories Match: ${JSON.stringify(run1.breedingResult.mutations) === JSON.stringify(run2.breedingResult.mutations)}`);
  console.log(`Complete JSON Payloads Match: ${isIdentical}`);

  if (!isIdentical) {
    console.error('\nFAIL: Run 1 and Run 2 produced non-identical outputs!');
    process.exit(1);
  }

  // Verify Female Horn Masking
  console.log('\n[3] Testing Female Horn Phenotypic Masking...');
  const femaleRun = executeBreeding(parentA, parentB, {
    breedingNonce: fixedNonce,
    childSex: SEX.FEMALE,
    developmentalFactor: 1.0
  });

  const femaleHornZero = femaleRun.phenotype.cephalic_horn_scale === 0.0 &&
                         femaleRun.phenotype.thoracic_horn_scale === 0.0;
  const femaleHornAllelesPreserved = femaleRun.childGenome.loci.LOCUS_CEPHALIC_HORN.length === 2 &&
                                     femaleRun.childGenome.loci.LOCUS_CEPHALIC_HORN.every(a => a > 0.0);

  console.log(`Female Horn Phenotype is 0.0: ${femaleHornZero}`);
  console.log(`Female Horn Genotype Retained: ${femaleHornAllelesPreserved}`);

  if (!femaleHornZero || !femaleHornAllelesPreserved) {
    console.error('\nFAIL: Female horn masking invariant violated!');
    process.exit(1);
  }

  // Verify Developmental Decoupling (Genotype Unaltered by Stunting)
  console.log('\n[4] Testing Developmental Realization Decoupling...');
  const stuntedRun = executeBreeding(parentA, parentB, {
    breedingNonce: fixedNonce,
    childSex: SEX.MALE,
    developmentalFactor: 0.65 // Severe starvation
  });

  const normalRun = executeBreeding(parentA, parentB, {
    breedingNonce: fixedNonce,
    childSex: SEX.MALE,
    developmentalFactor: 1.00 // Optimal nutrition
  });

  const genomesIdenticalUnderStunting = JSON.stringify(stuntedRun.childGenome) === JSON.stringify(normalRun.childGenome);
  const phenotypeStunted = stuntedRun.phenotype.body_scale_index < normalRun.phenotype.body_scale_index;

  console.log(`Genomes Identical Despite Stunting: ${genomesIdenticalUnderStunting}`);
  console.log(`Phenotype Body Scale Reduced by Stunting: ${phenotypeStunted}`);
  console.log(`Normal Body Scale: ${normalRun.phenotype.body_scale_index.toFixed(4)}`);
  console.log(`Stunted Body Scale: ${stuntedRun.phenotype.body_scale_index.toFixed(4)}`);

  if (!genomesIdenticalUnderStunting || !phenotypeStunted) {
    console.error('\nFAIL: Developmental decoupling invariant violated!');
    process.exit(1);
  }

  console.log('\n====================================================');
  console.log('SMOKE CHECK PASSED: ALL INVARIANTS VERIFIED!');
  console.log('====================================================');
}

runSmokeCheck();
