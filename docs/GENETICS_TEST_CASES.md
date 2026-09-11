# LinhSinhVN — Genetics Determinism & Specification Test Cases

**Version:** 1.0.0  
**Phase:** Phase 0 — Foundation / Specification  
**Status:** Verification Baseline for Future Implementation  

---

## Overview
These test cases define the exact behavioral contracts that any future implementation of the Genetics, Phenotype, and Breeding subsystems must satisfy. Every test is designed to run in a headless, deterministic test harness.

---

### TC-GEN-01: Absolute Recombination Determinism
- **Category:** Determinism
- **Description:** Verifies that identical parents bred with an identical PRNG seed produce exactly identical offspring genomes and phenotypes.
- **Inputs:**
  - `Parent A`: Genome $G_A$
  - `Parent B`: Genome $G_B$
  - `Seed`: `0x5A2F08C1`
- **Steps:**
  1. Execute `recombine_genome(G_A, G_B, Seed)` to produce `Offspring_1`.
  2. Re-initialize PRNG with `Seed` (`0x5A2F08C1`).
  3. Execute `recombine_genome(G_A, G_B, Seed)` to produce `Offspring_2`.
- **Expected Outcome:**
  - For every locus $L$, `Offspring_1.loci[L].allele_1 == Offspring_2.loci[L].allele_1`.
  - For every locus $L$, `Offspring_1.loci[L].allele_2 == Offspring_2.loci[L].allele_2`.
  - Derived phenotype values and stats for `Offspring_1` and `Offspring_2` are bit-for-bit identical.

---

### TC-GEN-02: Seed Sensitivity & Independent Assortment
- **Category:** Segregation
- **Description:** Verifies that changing the PRNG seed produces different valid Mendelian assortments without violating parental allele constraints.
- **Inputs:**
  - `Parent A`: $L_1 = [0.20, 0.80]$
  - `Parent B`: $L_1 = [0.30, 0.70]$
  - `Seed 1`: `0x11111111`
  - `Seed 2`: `0x99999999`
- **Steps:**
  1. Produce `Child_1` with `Seed 1` ($P_{mut} = 0.0$).
  2. Produce `Child_2` with `Seed 2` ($P_{mut} = 0.0$).
- **Expected Outcome:**
  - For both children, `allele_1` $\in \{0.20, 0.80\}$ and `allele_2` $\in \{0.30, 0.70\}$.
  - Across multiple unlinked loci, `Child_1` and `Child_2` exhibit different combinations of parental alleles.

---

### TC-GEN-03: Zero-Mutation Invariant (Strict Mendelian Purity)
- **Category:** Mutation Invariant
- **Description:** Verifies that when mutation probability is set to $0.0$, no alleles outside the exact parental set are ever introduced.
- **Inputs:**
  - `Parent A`, `Parent B`
  - `Mutation Rate`: $0.0$
  - 1,000 randomized breeding runs across diverse seeds.
- **Steps:**
  1. Loop 1,000 times with random seeds.
  2. For every child locus, check if `allele_1` matches either maternal allele and `allele_2` matches either paternal allele.
- **Expected Outcome:**
  - Zero novel alleles generated ($100\%$ Mendelian fidelity).
  - `mutation_history` array is empty for all 1,000 runs.

---

### TC-GEN-04: Deterministic Mutation Induction
- **Category:** Mutation Determinism
- **Description:** Verifies that with mutation enabled, identical seeds generate identical mutation targets, deltas, and resulting alleles.
- **Inputs:**
  - `Parent A`, `Parent B`
  - `Mutation Rate`: $0.05$
  - `Fixed Seed`: `0xDEADBEEF42`
- **Steps:**
  1. Breed with `Fixed Seed` $\to$ `Child_A`.
  2. Breed with `Fixed Seed` $\to$ `Child_B`.
- **Expected Outcome:**
  - `Child_A.mutations` and `Child_B.mutations` contain identical locus targets, old values, and mutated values.

---

### TC-GEN-05: Allele Clamping & Boundary Invariant
- **Category:** Value Integrity
- **Description:** Verifies that extreme positive or negative mutations cannot push allele values outside $[0.0, 1.0]$.
- **Inputs:**
  - Parent locus at boundary: $L = [0.98, 0.02]$.
  - Force mutation roll with large positive delta $+0.50$ and large negative delta $-0.50$.
- **Steps:**
  1. Apply mutation step.
- **Expected Outcome:**
  - Upper mutated allele is clamped to exactly $1.0000$ (never $> 1.0$).
  - Lower mutated allele is clamped to exactly $0.0000$ (never $< 0.0$).

---

### TC-GEN-06: Parental Immutability (Zero Side-Effects)
- **Category:** System Integrity
- **Description:** Verifies that the breeding operation does not alter the state of either parent genome.
- **Inputs:**
  - `Parent A`, `Parent B`.
- **Steps:**
  1. Capture deep copy / cryptographic hash of $G_A$ and $G_B$.
  2. Execute 100 breeding cycles involving `Parent A` and `Parent B`.
  3. Re-verify hashes of $G_A$ and $G_B$.
- **Expected Outcome:**
  - Post-breeding hashes of $G_A$ and $G_B$ match pre-breeding hashes perfectly.

---

### TC-GEN-07: Sexual Dimorphism Phenotypic Masking
- **Category:** Phenotype Expression
- **Description:** Verifies that females carrying high-expression horn alleles suppress the physical horn phenotype while retaining the alleles in their genotype.
- **Inputs:**
  - Male organism $M_1$ and Female organism $F_1$ with **identical** genomes:
    - `LOCUS_CEPHALIC_HORN = [0.85, 0.90]`
    - `LOCUS_BODY_SCALE = [0.80, 0.80]`
- **Steps:**
  1. Calculate phenotype for $M_1$ (`sex = MALE`).
  2. Calculate phenotype for $F_1$ (`sex = FEMALE`).
- **Expected Outcome:**
  - $M_1$: `cephalic_horn_length_mm` $> 30.0\text{ mm}$, `clash_power` $> 90$.
  - $F_1$: `cephalic_horn_length_mm == 0.0\text{ mm}`, `clash_power` driven solely by claw grip.
  - $F_1$'s stored genome retains `LOCUS_CEPHALIC_HORN = [0.85, 0.90]`.
  - When $F_1$ breeds with a hornless male, male offspring express the horn inherited from $F_1$.

---

### TC-GEN-08: Environmental Decoupling (Genotype Protection)
- **Category:** Environmental Interaction
- **Description:** Verifies that severe environmental deficits (e.g., larval starvation or thermal stress) modify realized phenotype attributes without altering the underlying genome.
- **Inputs:**
  - Organism $O_{starved}$ undergoing severe larval starvation (`developmental_realization_factor = 0.65`).
  - Baseline unstarved adult organism $O_{normal}$ with identical genome.
- **Steps:**
  1. Express adult phenotypes.
  2. Compare adult `body_length_mm` and `body_mass_grams`.
  3. Compare underlying `Genome` objects.
- **Expected Outcome:**
  - $O_{starved}$ expresses significantly reduced physical dimensions (`body_length_mm` is reduced by $35\%$).
  - $O_{starved}$'s `Genome.loci` is $100\%$ identical to $O_{normal}$'s `Genome.loci`.
  - Progeny of $O_{starved}$ raised under normal conditions develop full physical dimensions.
