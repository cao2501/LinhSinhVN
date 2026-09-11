# LinhSinhVN — Reproduction System Architecture

The **Reproduction System** is a deterministic, headless transaction and orchestration layer responsible for mating evaluation, clutch generation, and parent-offspring lifecycle transitions.

> [!NOTE]
> **GAMEPLAY MODEL / PROTOTYPE CONSTANT:** Numerical constants (energy cost, clutch bounds, cooldown ticks, sex ratios) are prototype gameplay design values and are not biological measurements.

---

## 1. Responsibilities & Ownership Boundaries

### Genetics Ownership Boundary
- The **Genetics Engine** (`game/genetics/*`) is the **SOLE authority** for genome inheritance, independent-locus recombination, mutation induction, gene expression, phenotype calculation, and derived combat/gameplay stats.
- Reproduction **never** recalculates alleles, duplicates phenotypic expressions, or computes derived stats. It passes parent genomes and independent seeds to `executeBreeding()` and receives authoritative child genetic records.
- Parent genomes are completely immutable across all reproduction operations.

### Lifecycle Ownership Boundary
- The **Lifecycle Engine** (`game/lifecycle/*`) is the **SOLE authority** for organism vitality, lifecycle stage progression, and internal nutrition/stress state invariants.
- Reproduction **never** directly mutates lifecycle internals like `state.nutrition_state.stored_energy`.
- State mutation is strictly executed via the Lifecycle boundary functions `validateReproductionDeltas()` and `applyReproductionDeltas()`.
- Newborn organisms are initialized via `createOrganismState()` at `speciesProfile.lifecycle_profile.initial_stage_id`.

---

## 2. Transaction Phases & True Atomicity

Reproduction executes in three distinct phases:

### Phase 1: PLAN (`planReproduction`)
- **Strictly read-only:** Zero parent state mutation occurs.
- Canonicalizes candidate parent pair.
- Evaluates biological eligibility (vitality, stage, age, cooldown, energy, stress).
- Derives independent 64-bit domain seeds from canonical `BreedingSeed`.
- Determines clutch size and individual offspring sexes.
- Queries Genetics Engine `executeBreeding()` for each child.
- Instantiates initial child organism states.
- Generates `LineageRecord`s, `ORGANISM_BORN` events, and `REPRODUCTION_COMPLETED` events.
- Computes parent state deltas (`energy_cost`, `reproduction_cooldown_until_tick`, `last_reproduction_tick`).
- Returns a frozen, immutable `ReproductionPlan`.

### Phase 2: PREFLIGHT (`validateReproductionDeltas`)
- **Strictly zero state mutation.**
- Validates plan eligibility and parent identity matches.
- Preflight-validates deltas for **BOTH** parents via Lifecycle boundary:
  ```javascript
  validateReproductionDeltas(parentA, plan.parent_deltas.parent_a, speciesProfile);
  validateReproductionDeltas(parentB, plan.parent_deltas.parent_b, speciesProfile);
  ```
- If ANY preflight check fails, the transaction immediately throws/aborts. **Neither parent is mutated.**

### Phase 3: APPLY (`applyReproductionDeltas`)
- Executed **only after** all preflight validations have succeeded for all parents.
- Applies validated deltas to Parent A.
- Applies validated deltas to Parent B.
- Finalizes children, lineages, and events.
- Guarantees: It is architecturally impossible for one parent to be mutated while the other remains unmutated.

---

## 3. Determinism & Independent RNG Domain Separation

All calculations rely entirely on pseudo-random number generators seeded by canonical cryptographic hashes.
Zero usage of `Math.random()`, `Date.now()`, or system random APIs.

### Seed Derivation Hierarchy
$$\text{BreedingSeed} = \text{Hash64}(\text{ParentA.id} \mid \text{ParentB.id} \mid \text{ParentA.generation} \mid \text{BreedingNonce})$$
- $\text{ClutchSeed} = \text{Hash64}(\text{BreedingSeed} \mid \text{"CLUTCH"})$
- $\text{ChildSexSeed}(i) = \text{Hash64}(\text{BreedingSeed} \mid \text{"SEX"} \mid i)$
- $\text{ChildGeneticsSeed}(i) = \text{Hash64}(\text{BreedingSeed} \mid \text{"GENETICS"} \mid i)$
- $\text{ChildIdHash}(i) = \text{Hash64}(\text{BreedingSeed} \mid \text{"ID"} \mid i)$
- $\text{ChildSimSeed}(i) = \text{Hash64}(\text{BreedingSeed} \mid \text{"SIM"} \mid i)$

**Decoupling Invariant:** Changing the clutch size range or sex ratio configuration will strictly **never** alter the genetics RNG stream for child $i$.

---

## 4. Canonical Parent Ordering Contract
Because $\text{BreedingSeed}$ is directional:
- For `HETEROSEXUAL_MALE_FEMALE`:
  - `ParentA` (Maternal) is strictly the `FEMALE` parent.
  - `ParentB` (Paternal) is strictly the `MALE` parent.
- For same-sex or isogamous pairings:
  - `ParentA` is the parent with the lexicographically smaller `organism_id` (`idA < idB`).
  - `ParentB` is the other parent.

Therefore:
$$\text{reproduce}(\text{male}, \text{female}) \equiv \text{reproduce}(\text{female}, \text{male})$$
Caller argument ordering cannot alter seeds, offspring genomes, or lineages.

---

## 5. Child ID & Generational Tracking
- **Child ID:** Minimal deterministic identity:
  $$\text{ChildId} = \text{"org\_"} + \text{Hash64}(\text{BreedingSeed} \mid \text{"ID"} \mid \text{child\_index}).\text{slice}(2)$$
- **Generation:** Strictly calculated as $\max(\text{ParentA.generation}, \text{ParentB.generation}) + 1$.
- **Lineage:** Every child is issued a `LineageRecord` tracking maternal/paternal IDs, breeding seed, birth habitat, developmental realization factor, and mutation audits.

---

## 6. Known Prototype Limitations
- **Pairwise Mating Only:** Polyamorous, swarm-fertilized, or colonial broadcast spawning are not yet supported.
- **Fixed Ratio Sex Determination:** Environmental sex determination (temperature-dependent) is not yet modeled; sex is determined via configured profile ratio.
- **Immediate Clutch Emission:** Delayed oviposition / sperm storage (spermatheca) is omitted in this prototype.
