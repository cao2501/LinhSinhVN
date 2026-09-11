# LinhSinhVN — Genetics & Phenotype Technical Specification

**Version:** 1.1.0  
**Phase:** Phase 0 — Foundation / Prototype Architecture  
**Status:** Authoritative Specification (Corrected Baseline)  

---

## 1. Methodological Boundary & Architectural Principles

### 1.1 Real Biology vs. Gameplay Model
LinhSinhVN strictly enforces a fundamental separation between biological inspiration and the gameplay model:

$$\text{REAL BIOLOGY (Inspiration / Qualitative Constraints)} \longrightarrow \text{GAMEPLAY MODEL (Deterministic Gameplay Constants)}$$

- **Real Biology:** Informs qualitative anatomy, lifecycle stages, sexual dimorphism, and environmental adaptations. Real biological measurements are **not** claimed as verified scientific facts within this specification.
- **Gameplay Model:** Defines explicit, deterministic numerical parameters, normalized bounds, and derived combat/survival formulas designed for game balance, testing, and determinism.
- **Classification:** All numerical values, formulas, and ranges in this specification are designated strictly as **GAMEPLAY MODEL / PROTOTYPE CONSTANTS**.

### 1.2 The Deterministic Simulation Pipeline
The biological simulation adheres to an unyielding unidirectional pipeline:

$$\text{GENOME} \longrightarrow \text{GENES} \longrightarrow \text{GENE EXPRESSION} \longrightarrow \text{PHENOTYPE} \longrightarrow \text{DERIVED STATS} \longrightarrow \text{SURVIVAL / COMBAT}$$

### 1.3 Core Invariants
1. **The Genome is Authoritative:** Stored genetic data consists strictly of allele pairs across defined loci.
2. **Stats are Derived Values:** Gameplay stats (HP, Clash Power, Defense, Speed, Stamina) are never stored as genetic values; they are dynamically derived from expressed phenotype attributes.
3. **Phenotype is Derived from Genes:** Physical morphology (body scale, shell density, horn scale) is computed deterministically from gene expression.
4. **Strict Determinism:** Identical parental genomes + identical seed + identical environmental context = identical offspring.
5. **No AI Game-State Mutation:** Generative agents and LLMs must never modify genomes, breeding outcomes, or derived stats.
6. **No Arbitrary Stat Averaging:** Offspring do not average their parents' stats. They inherit discrete alleles through Mendelian segregation.

---

## 2. Allele Abstraction & Inheritance Model

### 2.1 Conceptual Abstraction Layer
To ensure long-term modularity and avoid tightly coupling gameplay, rendering, or combat systems to raw floats, the architecture enforces a layered conceptual abstraction:

```
GENOME
 └── Locus
      ├── allele_a  (Maternal origin)
      └── allele_b  (Paternal origin)
           │
           ▼
   EXPRESSION RULE
           │
           ▼
    EXPRESSED VALUE (Normalized intermediate scalar)
           │
           ▼
       PHENOTYPE   (Realized morphology & physiology)
           │
           ▼
     DERIVED STATS (Authoritative combat & survival values)
```

- **Prototype Representation:** In Phase 0, each allele is implemented as a floating-point scalar normalized to $[0.0, 1.0]$.
- **Decoupling Guarantee:** Downstream systems (presentation, combat, UI) interact exclusively with the `Phenotype` and `DerivedStats` layers. The internal allele representation can be refined in future phases without modifying external contracts.

### 2.2 Diploid Independent-Locus Inheritance
The prototype inheritance model is designated precisely as:
**DIPLOID INDEPENDENT-LOCUS INHERITANCE**

- **Scope:** Each locus contains exactly two alleles ($[a_1, a_2]$) segregating independently during reproduction (Mendelian independent assortment).
- **Meiosis Boundary:** This mechanism is an algorithmic inheritance model, **not** a complete cytological simulation of biological meiosis.
- **Roadmap:**
  - *Phase 1 (Prototype):* Independent locus segregation.
  - *Future Milestones:* Physical chromosome linkage maps, genetic linkage groups, and chiasmata crossover will be evaluated only if justified by gameplay depth.

---

## 3. Prototype Loci Specification (`xylotrupes_rhinoceros_proto`)

- **Internal Species Identifier:** `xylotrupes_rhinoceros_proto`
- **Taxonomic Metadata:** *Xylotrupes gideon* complex (`PROVISIONAL — BIOLOGICAL VERIFICATION REQUIRED`)

For the initial prototype, exactly **8 loci** are defined:

```
┌────────────────────────────┬─────────────────────────────┬──────────────────────────────────────────┐
│ Locus ID                   │ Biological Role             │ Primary Phenotype Expression             │
├────────────────────────────┼─────────────────────────────┼──────────────────────────────────────────┤
│ LOCUS_BODY_SCALE           │ General organism volume     │ body_scale_index, mass_index             │
│ LOCUS_CHITIN_DENSITY       │ Cuticle sclerotization      │ cuticle_hardness_index, armor_resistance │
│ LOCUS_CEPHALIC_HORN        │ Head prying horn lever      │ cephalic_horn_scale (Sex-masked)         │
│ LOCUS_THORACIC_HORN        │ Pronotal arch fork          │ thoracic_horn_scale (Sex-masked)         │
│ LOCUS_TARSAL_CLAW          │ Pretarsal hook recurvature  │ tarsal_grip_index, traction_factor       │
│ LOCUS_METABOLIC_EFFICIENCY │ Energetic conversion thrift │ metabolic_drain_index, stamina_economy   │
│ LOCUS_CUTICLE_PIGMENT      │ Melanin concentration       │ cuticle_pigment_ratio, thermal_absorb    │
│ LOCUS_ANTENNAL_CLUB        │ Lamellate olfactory plates  │ sensory_range_units                      │
└────────────────────────────┴─────────────────────────────┴──────────────────────────────────────────┘
```

### Detailed Locus Profiles (All values are Prototype Constants):

#### 1. `LOCUS_BODY_SCALE`
- **Allele Range:** $[0.0, 1.0]$.
- **Expression Rule:** Additive codominance: $V_{exp} = \frac{a_1 + a_2}{2}$.
- **Phenotype Target:** `body_scale_index` ($0.70 \to 1.50$) and `mass_index` ($0.80 \to 2.20$).
- **Stat Effect:** Directly scales `max_hp` and knockback resistance.
- **Trade-off:** Larger body scale increases base metabolic drain and increases turning inertia.

#### 2. `LOCUS_CHITIN_DENSITY`
- **Allele Range:** $[0.0, 1.0]$.
- **Expression Rule:** Incomplete dominance with positive reinforcement: $V_{exp} = 0.4 \min(a_1, a_2) + 0.6 \max(a_1, a_2)$.
- **Phenotype Target:** `cuticle_hardness_index` ($1.0 \to 3.0$).
- **Stat Effect:** Increases `armor_reduction` (damage soak).
- **Trade-off:** High cuticle density adds structural weight to `mass_index`, reducing sprint acceleration.

#### 3. `LOCUS_CEPHALIC_HORN`
- **Allele Range:** $[0.0, 1.0]$.
- **Expression Rule:** Sex-limited expression:
  - If `FEMALE`: $V_{exp} = 0.0$ (complete phenotypic suppression; alleles remain intact in genome and pass to progeny).
  - If `MALE`: $V_{exp} = \frac{a_1 + a_2}{2}$ (allometric scaling with `body_scale_index` is computed downstream in the phenotype mapping layer).
- **Phenotype Target:** `cephalic_horn_scale` ($0.0$ for females; $0.20 \to 1.80$ for males).
- **Stat Effect:** Scales `clash_power` (prying leverage in beetle wrestling).
- **Trade-off:** High horn scale adds front-heavy balance drag and increases action stamina expenditure.

#### 4. `LOCUS_THORACIC_HORN`
- **Allele Range:** $[0.0, 1.0]$.
- **Expression Rule:** Sex-limited expression:
  - If `FEMALE`: $V_{exp} = 0.0$.
  - If `MALE`: $V_{exp} = \frac{a_1 + a_2}{2}$.
- **Phenotype Target:** `thoracic_horn_scale` ($0.0$ for females; $0.20 \to 1.40$ for males).
- **Stat Effect:** Modifies grapple clamping strength.
- **Trade-off:** Adds minor forward mass burden.

#### 5. `LOCUS_TARSAL_CLAW`
- **Allele Range:** $[0.0, 1.0]$.
- **Expression Rule:** Additive codominance: $V_{exp} = \frac{a_1 + a_2}{2}$.
- **Phenotype Target:** `tarsal_grip_index` ($0.80 \to 2.50$).
- **Stat Effect:** Modifies `traction_grip` and push stability.
- **Trade-off:** Very high claw recurvature slightly reduces crawl speed across smooth flat surfaces.

#### 6. `LOCUS_METABOLIC_EFFICIENCY`
- **Allele Range:** $[0.0, 1.0]$.
- **Expression Rule:** Additive codominance: $V_{exp} = \frac{a_1 + a_2}{2}$.
- **Phenotype Target:** `metabolic_drain_index` ($0.60 \to 1.40$) and `stamina_economy_modifier` ($0.80 \to 1.30$).
- **Stat Effect:** 
  - Higher efficiency yields **lower** metabolic drain (slower starvation, reduced food consumption).
  - Higher efficiency yields **better** stamina economy (lower stamina cost per combat action).
  - Improves `starvation_endurance_time`.
- **Trade-off:** High metabolic efficiency reduces rapid burst recovery (`stamina_regen_rate` is steady rather than explosive).

#### 7. `LOCUS_CUTICLE_PIGMENT`
- **Allele Range:** $[0.0, 1.0]$.
- **Expression Rule:** Additive codominance: $V_{exp} = \frac{a_1 + a_2}{2}$.
- **Phenotype Target:** `cuticle_pigment_ratio` ($0.0 = \text{chestnut brown}$, $1.0 = \text{jet black}$).
- **Stat Effect:** Affects solar thermal absorption index. Darker carapaces warm up faster in cool morning hours; lighter carapaces resist overheating under intense sun.
- **Trade-off:** Fitness is dictated by ambient environmental context.

#### 8. `LOCUS_ANTENNAL_CLUB`
- **Allele Range:** $[0.0, 1.0]$.
- **Expression Rule:** Dominance of larger lamellae: $V_{exp} = 0.7 \max(a_1, a_2) + 0.3 \min(a_1, a_2)$.
- **Phenotype Target:** `sensory_range_units` ($15.0 \to 60.0$).
- **Stat Effect:** Modifies `perception_radius` for locating food nodes and conspecifics.
- **Trade-off:** Larger sensory clubs suffer higher damage vulnerability during frontal head clashing.

---

## 4. Recombination (Breeding Algorithm)

### 4.1 Principle
During sexual reproduction, offspring inherit exactly one allele per locus from Parent A (Maternal) and one allele per locus from Parent B (Paternal) via independent assortment.

### 4.2 Seed Derivation
To guarantee absolute determinism, the breeding PRNG seed is derived via 64-bit cryptographic/hash combination:
$$\text{BreedingSeed} = \text{Hash64}(\text{ParentA.id} \,\|\, \text{ParentB.id} \,\|\, \text{ParentA.generation} \,\|\, \text{BreedingNonce})$$

### 4.3 Pseudocode

```python
class DiploidLocus:
    allele_1: float  # Maternal origin
    allele_2: float  # Paternal origin

class Genome:
    species_id: str
    loci: dict[str, DiploidLocus]

def recombine_genome(parent_a: Genome, parent_b: Genome, rng: DeterministicRNG) -> Genome:
    child_genome = Genome(species_id=parent_a.species_id, loci={})
    
    for locus_id in SPECIES_LOCI_REGISTRY:
        locus_a = parent_a.loci[locus_id]
        locus_b = parent_b.loci[locus_id]
        
        # Segregation: 50% probability to inherit allele_1 or allele_2 from Parent A
        inherited_a = locus_a.allele_1 if rng.next_float() < 0.5 else locus_a.allele_2
        
        # Segregation: 50% probability to inherit allele_1 or allele_2 from Parent B
        inherited_b = locus_b.allele_1 if rng.next_float() < 0.5 else locus_b.allele_2
        
        child_genome.loci[locus_id] = DiploidLocus(
            allele_1=inherited_a,
            allele_2=inherited_b
        )
        
    return child_genome
```

---

## 5. Mutation System

### 5.1 Rules of Mutation
1. **Separation from Recombination:** Mutation is an independent second-pass operation executed after parental segregation.
2. **Deterministic Mutation Rolls:** Mutation triggers are evaluated strictly against the deterministic PRNG stream.
3. **Bounded Deltas:** Alleles mutate by a bounded delta $\Delta \sim \text{Uniform}(-\delta_{max}, +\delta_{max})$ and are hard-clamped to $[0.0, 1.0]$.
4. **Physiological Trade-offs:** Advantageous phenotypic changes automatically incur the trade-offs hardcoded into the derived stat formulas.

### 5.2 Prototype Parameters (Gameplay Constants)
- `per_locus_mutation_rate` ($P_{mut}$): $0.05$ (5% chance per allele).
- `max_mutation_delta` ($\delta_{max}$): $0.12$.

### 5.3 Pseudocode

```python
def apply_mutation(genome: Genome, rng: DeterministicRNG, p_mut: float = 0.05, delta_max: float = 0.12) -> tuple[Genome, list[dict]]:
    mutation_history = []
    
    # Iterate in canonical registry order to guarantee cross-platform determinism
    for locus_id in SPECIES_LOCI_REGISTRY:
        locus = genome.loci[locus_id]
        # Evaluate allele_1
        if rng.next_float() < p_mut:
            delta = (rng.next_float() * 2.0 - 1.0) * delta_max
            old_val = locus.allele_1
            locus.allele_1 = max(0.0, min(1.0, old_val + delta))
            mutation_history.append({"locus_id": locus_id, "allele_index": 1, "old": old_val, "new": locus.allele_1})
            
        # Evaluate allele_2
        if rng.next_float() < p_mut:
            delta = (rng.next_float() * 2.0 - 1.0) * delta_max
            old_val = locus.allele_2
            locus.allele_2 = max(0.0, min(1.0, old_val + delta))
            mutation_history.append({"locus_id": locus_id, "allele_index": 2, "old": old_val, "new": locus.allele_2})
            
    return genome, mutation_history
```

---

## 6. Phenotype Mapping Layer

All values produced by this layer are **Gameplay Model Constants**:

```
┌───────────────────────────┬───────────────────────────┬──────────────┬────────────────────────────────────────────────────────┐
│ Phenotype Property        │ Source Loci               │ Game Units   │ Mapping Formula (Prototype Constants)                  │
├───────────────────────────┼───────────────────────────┼──────────────┼────────────────────────────────────────────────────────┤
│ body_scale_index          │ BODY_SCALE                │ 0.70 – 1.50  │ 0.70 + (V_exp * 0.80)                                  │
│ mass_index                │ BODY_SCALE, CHITIN        │ 0.80 – 2.20  │ (0.80 + V_exp_body * 1.0) * (1.0 + V_exp_chitin * 0.2) │
│ cuticle_hardness_index    │ CHITIN_DENSITY            │ 1.0 – 3.0    │ 1.0 + (V_exp * 2.0)                                    │
│ cephalic_horn_scale       │ CEPHALIC_HORN, BODY_SCALE │ 0.0 – 1.80   │ Male: (V_exp_horn^1.2) * 1.50 * body_scale_index       │
│                           │                           │              │ Female: 0.0                                            │
│ thoracic_horn_scale       │ THORACIC_HORN, BODY_SCALE │ 0.0 – 1.40   │ Male: V_exp_thoracic * 1.20 * body_scale_index         │
│                           │                           │              │ Female: 0.0                                            │
│ tarsal_grip_index         │ TARSAL_CLAW, BODY_SCALE   │ 0.80 – 2.50  │ 0.80 + (V_exp_claw * 1.20) + (V_exp_body * 0.50)       │
│ metabolic_drain_index     │ METABOLIC_EFFICIENCY, MASS│ 0.60 – 1.40  │ (1.40 - V_exp_eff * 0.60) * (mass_index^0.3)           │
│ stamina_economy_modifier  │ METABOLIC_EFFICIENCY      │ 0.80 – 1.30  │ 0.80 + (V_exp_eff * 0.50)                              │
│ sensory_range_units       │ ANTENNAL_CLUB             │ 15.0 – 60.0  │ 15.0 + (V_exp_antennal * 45.0)                         │
│ cuticle_pigment_ratio     │ CUTICLE_PIGMENT           │ 0.0 – 1.0    │ V_exp_pigment                                          │
└───────────────────────────┴───────────────────────────┴──────────────┴────────────────────────────────────────────────────────┘
```

---

## 7. Derived Gameplay Stats

Gameplay stats are computed exclusively from the phenotype layer:

### 7.1 Formulas & Balances (Gameplay Model Constants)

1. **Max Health (`max_hp`):**
   $$\text{max\_hp} = 100.0 + (\text{mass\_index} \times 50.0) + (\text{cuticle\_hardness\_index} \times 20.0)$$
   - *Baseline range:* $160 \to 270\text{ HP}$.
2. **Clash Power (`clash_power`):**
   $$\text{clash\_power} = (\text{cephalic\_horn\_scale} \times 50.0) + (\text{tarsal\_grip\_index} \times 25.0)$$
   - *Female baseline:* Driven primarily by grip ($20 \to 62$).
   - *Male baseline:* Horn leverage + claw push ($20 \to 152$).
3. **Damage Reduction (`armor_reduction`):**
   $$\text{armor\_reduction} = \frac{\text{cuticle\_hardness\_index} - 1.0}{2.0} \times 0.50 \quad (0\% \to 50\% \text{ soak})$$
4. **Crawl Speed (`crawl_speed`):**
   $$\text{crawl\_speed} = (10.0 + \text{tarsal\_grip\_index} \times 3.0) \times \left(\frac{1.0}{\text{mass\_index}}\right)^{0.35}$$
5. **Max Stamina (`max_stamina`):**
   $$\text{max\_stamina} = 80.0 + (\text{mass\_index} \times 25.0) - (\text{cephalic\_horn\_scale} \times 15.0)$$
6. **Stamina Drain per Action (`action_stamina_cost`):**
   $$\text{action\_stamina\_cost} = \frac{\text{base\_action\_cost}}{\text{stamina\_economy\_modifier}} \quad (\text{normalized standard combat clash baseline: } \text{base\_action\_cost} = 10.0)$$
   - *Baseline range:* $7.69 \to 12.50\text{ stamina per standard action}$.
7. **Stamina Recovery Rate (`stamina_regen_rate`):**
   $$\text{stamina\_regen\_rate} = 5.0 + (\text{stamina\_economy\_modifier} \times 2.0)$$
8. **Perception Radius (`perception_radius`):**
   $$\text{perception\_radius} = \text{sensory\_range\_units}$$
9. **Starvation Endurance (`starvation_endurance_time`):**
   $$\text{starvation\_endurance\_time} = \frac{\text{mass\_index} \times 100.0}{\text{metabolic\_drain\_index}}$$

---

## 8. Developmental Realization & Environmental Modifiers

### 8.1 The Immutable Separation
$$\text{GENOME (Genetic Potential)} \neq \text{DEVELOPMENTAL MODIFIER} \neq \text{REALIZED PHENOTYPE}$$

Under no circumstances do environmental stresses, nutritional deficits, or injuries mutate or rewrite the underlying genome.

### 8.2 Developmental Plasticity vs. Current Conditions
1. **Developmental Conditions (`developmental_realization_factor`):**
   - During the larval/pupal nymph stage, nutritional deficits register an irreversible environmental modifier ($\eta \in [0.60, 1.00]$).
   - Upon adult emergence:
     $$\text{body\_scale\_realized} = \text{body\_scale\_index} \times \eta$$
   - In `OrganismPhenotype`, the field `body_scale_index` stores this realized adult value, which naturally cascades into allometrically scaled traits (`mass_index`, `cephalic_horn_scale`, `thoracic_horn_scale`).
   - The adult organism has a stunted physical phenotype, but its **genome retains 100% of its original genetic potential**. Progeny raised in abundant nutrition express full genetic potential.
2. **Current Environmental Conditions:**
   - Ambient temperature, humidity, and solar radiation dynamically interact with `cuticle_pigment_ratio` to modify active movement and stamina efficiency without changing the underlying phenotype or genome.

---

## 9. Evolution & Speciation Boundary

### 9.1 Conceptual Architecture
Evolution in LinhSinhVN is strictly emergent and non-linear. The game does **not** feature level-based evolution trees.

$$\text{GENETIC DIVERGENCE} \longrightarrow \text{Possible Lineage Differentiation Signal} \longrightarrow \text{Future Evolution System}$$

### 9.2 Boundary Invariants:
1. **Genetic Distance Does NOT Automatically Equal Speciation:** The Euclidean genetic divergence ($\Delta G$) across loci is an analytical tracking metric, not an instant speciation trigger.
2. **Speciation is Deferred:** Mechanics governing speciation thresholds, reproductive isolation barriers, and subspecies classification are reserved for future ecosystem milestones. The Phase 0 genome schema is designed to support lineage tracking without imposing premature taxonomic boundaries.

---

## 10. Lineage Record Contract

Lineage records store generational history and provenance without altering genomic schemas:

```json
{
  "$schema": "lineage_record.schema.json",
  "version": "1.1.0",
  "organism_id": "org_xyd_gen04_0087",
  "species_id": "xylotrupes_rhinoceros_proto",
  "generation": 4,
  "sex": "MALE",
  "parent_ids": {
    "maternal_id": "org_xyd_gen03_0032",
    "paternal_id": "org_xyd_gen03_0045"
  },
  "breeding_seed": "0xA8F432B911C840E2",
  "birth_habitat": "habitat_cuc_phuong_rainforest",
  "developmental_realization_factor": 0.95,
  "mutation_count": 1,
  "mutations": [
    {
      "locus_id": "LOCUS_CEPHALIC_HORN",
      "allele_index": 2,
      "old_value": 0.6500,
      "new_value": 0.7600
    }
  ]
}
```
