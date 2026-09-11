# LinhSinhVN — Deterministic Headless Genetics Engine

Pure-logic, zero-dependency, headless implementation of the LinhSinhVN biological inheritance pipeline.

## 1. Architecture Overview

Adheres strictly to `docs/GENETICS_SPEC.md` and `docs/DEVELOPMENT_RULES.md`:

$$\text{Parent Genomes} \xrightarrow{\text{Hash64 Seed}} \text{Recombination} \xrightarrow{\text{Canonical Order}} \text{Mutation} \xrightarrow{\text{Expression Layer}} \text{Phenotype} \xrightarrow{\text{Derived Stats}} \text{Breeding Result / Lineage}$$

- **Independent Loci:** Diploid quantitative alleles across 8 canonical loci.
- **Strict Determinism:** SplitMix64 PRNG seeded via 64-bit cryptographic hash (`Hash64(ParentA.id | ParentB.id | ParentA.generation | Nonce)`).
- **Decoupling Boundaries:**
  - $\text{Genome} \neq \text{Phenotype} \neq \text{Derived Stats}$.
  - Environment (`developmental_realization_factor`) modifies realized adult phenotype without altering underlying genome.
  - Sexual dimorphism masks female horn phenotypes to 0.0 while preserving alleles in genome.

## 2. Module Directory

```
game/genetics/
├── constants.js     # Canonical 8-locus registry, species ID, defaults
├── rng.js           # Hash64 seed generator & SplitMix64 DeterministicRNG
├── genome.js        # Genome factory, deep cloning, and deep freezing
├── recombination.js # Diploid independent-locus assortment
├── mutation.js      # Post-recombination bounded stochastic mutation
├── expression.js    # Pure intermediate gene expression scalar calculation
├── phenotype.js     # Phenotype mapping layer & developmental realization
├── stats.js         # Derived gameplay stats calculation
├── lineage.js       # Historical genealogical lineage record factory
├── validation.js    # Comprehensive mathematical and biological invariants
├── index.js         # Public API re-exports
└── README.md        # Architecture and usage documentation
```

## 3. Usage Example

```javascript
import { createGenome, executeBreeding, SEX } from './index.js';

const parentA = {
  id: 'org_mat_01',
  generation: 1,
  genome: createGenome('xylotrupes_rhinoceros_proto', {
    LOCUS_BODY_SCALE: [0.4, 0.8],
    LOCUS_CHITIN_DENSITY: [0.5, 0.7],
    LOCUS_CEPHALIC_HORN: [0.6, 0.9],
    LOCUS_THORACIC_HORN: [0.5, 0.8],
    LOCUS_TARSAL_CLAW: [0.3, 0.7],
    LOCUS_METABOLIC_EFFICIENCY: [0.6, 0.8],
    LOCUS_CUTICLE_PIGMENT: [0.2, 0.8],
    LOCUS_ANTENNAL_CLUB: [0.4, 0.7]
  })
};

const parentB = {
  id: 'org_pat_02',
  generation: 1,
  genome: createGenome('xylotrupes_rhinoceros_proto', {
    LOCUS_BODY_SCALE: [0.5, 0.6],
    LOCUS_CHITIN_DENSITY: [0.6, 0.7],
    LOCUS_CEPHALIC_HORN: [0.4, 0.7],
    LOCUS_THORACIC_HORN: [0.4, 0.6],
    LOCUS_TARSAL_CLAW: [0.5, 0.8],
    LOCUS_METABOLIC_EFFICIENCY: [0.5, 0.7],
    LOCUS_CUTICLE_PIGMENT: [0.4, 0.6],
    LOCUS_ANTENNAL_CLUB: [0.5, 0.8]
  })
};

const result = executeBreeding(parentA, parentB, {
  breedingNonce: 'turn_104_event_1',
  childSex: SEX.MALE,
  developmentalFactor: 0.90
});

console.log('Seed:', result.seedUsed);
console.log('Child Phenotype:', result.phenotype);
console.log('Derived Stats:', result.derivedStats);
```
