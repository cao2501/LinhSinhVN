# LinhSinhVN — Genetics & Phenotype Technical Specification

**Version:** 1.0.0  
**Phase:** Phase 0 — Foundation / Prototype Architecture  
**Status:** Authoritative Specification  

---

## 1. Architectural Principles

The biological simulation adheres strictly to a deterministic unidirectional pipeline:

$$\text{GENOME} \longrightarrow \text{GENES} \longrightarrow \text{GENE EXPRESSION} \longrightarrow \text{PHENOTYPE} \longrightarrow \text{DERIVED STATS} \longrightarrow \text{SURVIVAL / COMBAT}$$

### Core Invariants:
1. **The Genome is Authoritative:** Stored genetic data consists strictly of allele pairs across defined loci.
2. **Stats are Derived Values:** Gameplay stats (HP, ATK, DEF, SPD, STAMINA) are never stored as genetic values; they are dynamically computed from expressed phenotype attributes.
3. **Phenotype is Derived from Genes:** Physical morphology (horn length, shell thickness, body scale) is calculated deterministically from gene expression.
4. **Strict Determinism:** Identical parental genomes + identical seed + identical environmental context = identical offspring.
5. **No AI Game-State Mutation:** Language models or generative agents must never modify genomes, breeding outcomes, or derived stats.
6. **No Arbitrary Stat Averaging:** Offspring do not average their parents' stats. They inherit discrete alleles through Mendelian segregation and recombination.

---

## 2. Allele Representation Model

### 2.1 Model Evaluation
We evaluate four potential allele architectures:

| Architecture | Description | Pros | Cons | Verdict |
| :--- | :--- | :--- | :--- | :--- |
| **A. Simple Numeric Allele** | Single float per locus ($a \in [0.0, 1.0]$) | Extremely simple math | No diploid inheritance, no hidden recessive traits, no carrier states | **Rejected** (Too simplistic) |
| **B. Discrete Categorical Allele** | Mendelian letters ($A/a$, $B/b$) | Pure discrete dominance | Cannot represent continuous allometric traits (e.g., millimeter horn growth) | **Rejected** (Too rigid) |
| **C. Diploid Quantitative Pair** | Two continuous floats per locus ($[a_1, a_2], a_i \in [0.0, 1.0]$) | Full diploid inheritance, continuous phenotypic expression, carrier preservation | Slightly more math than single float | **Selected Baseline** |
| **D. Chromosomal String Simulation** | Full bitstring with crossover loci distances | High biological fidelity | Excessive overengineering for Phase 0 | **Deferred** (Phase 2+) |

### 2.2 Selected Model: Diploid Continuous Quantitative Alleles
Every locus contains an unordered pair of continuous alleles:
$$\text{Locus} = [a_1, a_2], \quad a_1, a_2 \in [0.0, 1.0]$$
- $a_1$: Maternal allele contribution.
- $a_2$: Paternal allele contribution.

### 2.3 Definitions
- **Locus:** A specific physical or functional slot within the species genome (e.g., `LOCUS_CHITIN_DENSITY`).
- **Allele:** A normalized floating-point value $a \in [0.0, 1.0]$ representing the genetic magnitude of a trait variant.
- **Genotype:** The complete collection of diploid allele pairs across all loci for a specific organism.
- **Expressed Value ($V_{exp}$):** The intermediate scalar resulting from gene expression rules (additive codominance, dominance weight, or sex-linked masking).
- **Phenotype Property:** A concrete physical or physiological trait (e.g., `chitin_thickness_mm = 0.85 mm`) mapped from the expressed value.
- **Derived Stat:** A gameplay combat/survival number (e.g., `damage_reduction = 42%`) calculated from one or more phenotype properties.

---

## 3. Prototype Loci Specification (*Xylotrupes gideon*)

For the initial prototype, exactly **8 loci** are defined:

```
┌─────────────────────────┬───────────────────────────────┬──────────────────────────────────────────┐
│ Locus ID                │ Biological Role               │ Primary Phenotype Expression             │
├─────────────────────────┼───────────────────────────────┼──────────────────────────────────────────┤
│ LOCUS_BODY_SCALE        │ Overall organism body volume  │ body_length_mm, mass_grams               │
│ LOCUS_CHITIN_DENSITY    │ Cuticle mineral matrix        │ exoskeleton_hardness_gpa, armor_rating   │
│ LOCUS_CEPHALIC_HORN     │ Head horn prying lever        │ cephalic_horn_length_mm (Sex-masked)     │
│ LOCUS_THORACIC_HORN     │ Pronotal arch fork            │ thoracic_horn_arch_mm (Sex-masked)       │
│ LOCUS_TARSAL_CLAW       │ Pretarsal claw recurvature    │ substrate_grip_newtons, push_traction    │
│ LOCUS_METABOLIC_RATE    │ Mitochondrial respiration     │ basal_metabolic_cost, starvation_rate    │
│ LOCUS_CUTICLE_PIGMENT   │ Melanin & sclerotization      │ melanism_ratio, thermal_absorption       │
│ LOCUS_ANTENNAL_CLUB     │ Lamellate olfactory sensors   │ pheromone_detection_radius_meters        │
└─────────────────────────┴───────────────────────────────┴──────────────────────────────────────────┘
```

### Detailed Locus Profiles:

#### 1. `LOCUS_BODY_SCALE`
- **Allele Range:** $[0.0, 1.0]$ (Mapping to dwarf minor vs. major giant forms).
- **Expression Rule:** Additive codominance: $V_{exp} = \frac{a_1 + a_2}{2}$.
- **Phenotype Effect:** Determines `body_length_mm` ($35.0\text{ mm} \to 75.0\text{ mm}$) and `body_mass_g` ($10.0\text{ g} \to 40.0\text{ g}$).
- **Stat Effect:** Directly scales `max_health` and `mass_knockback_resistance`.
- **Trade-off:** High scale dramatically increases `basal_metabolic_cost` (requires much more food) and reduces turning agility.

#### 2. `LOCUS_CHITIN_DENSITY`
- **Allele Range:** $[0.0, 1.0]$.
- **Expression Rule:** Incomplete dominance with positive reinforcement: $V_{exp} = 0.4 \min(a_1, a_2) + 0.6 \max(a_1, a_2)$.
- **Phenotype Effect:** Determines `exoskeleton_thickness_mm` ($0.4\text{ mm} \to 1.8\text{ mm}$) and hardness index.
- **Stat Effect:** Increases `defense_armor_value`.
- **Trade-off:** Heavier shell adds weight penalty, reducing sprint acceleration.

#### 3. `LOCUS_CEPHALIC_HORN`
- **Allele Range:** $[0.0, 1.0]$.
- **Expression Rule:** Sex-limited expression:
  - If organism sex is `FEMALE`: $V_{exp} = 0.0$ (complete phenotypic suppression; alleles remain in genome and pass to progeny).
  - If organism sex is `MALE`: $V_{exp} = \left(\frac{a_1 + a_2}{2}\right) \times \text{AllometricModifier}(\text{body\_scale})$.
- **Phenotype Effect:** Determines `cephalic_horn_length_mm` ($0.0\text{ mm}$ for females; up to $45.0\text{ mm}$ for males).
- **Stat Effect:** Determines `clash_lift_leverage` (offensive prying power in beetle wrestling).
- **Trade-off:** Large horns incur structural weight and high stamina expenditure during attacks.

#### 4. `LOCUS_THORACIC_HORN`
- **Allele Range:** $[0.0, 1.0]$.
- **Expression Rule:** Sex-limited expression:
  - If `FEMALE`: $V_{exp} = 0.0$.
  - If `MALE`: $V_{exp} = \frac{a_1 + a_2}{2}$.
- **Phenotype Effect:** Determines `thoracic_horn_curvature_index` and clamping gap between upper and lower horn.
- **Stat Effect:** Determines `pin_lock_strength` (ability to hold and flip opponent).
- **Trade-off:** Increases front-heavy drag.

#### 5. `LOCUS_TARSAL_CLAW`
- **Allele Range:** $[0.0, 1.0]$.
- **Expression Rule:** Additive codominance: $V_{exp} = \frac{a_1 + a_2}{2}$.
- **Phenotype Effect:** Determines `claw_hook_depth_microns` and micro-spine density on tibial joints.
- **Stat Effect:** Direct modifier to `traction_grip` and resistance to being dislodged from tree bark.
- **Trade-off:** High claw curvature slightly reduces crawling speed on smooth flat stone surfaces.

#### 6. `LOCUS_METABOLIC_RATE`
- **Allele Range:** $[0.0, 1.0]$.
- **Expression Rule:** Non-linear metabolic curve: $V_{exp} = \frac{a_1 + a_2}{2}$.
- **Phenotype Effect:** Efficiency of ATP/glycogen synthesis and fat reserves.
- **Stat Effect:** High metabolic rate yields faster `stamina_recovery_rate`, while low metabolic rate extends `starvation_interval`.
- **Trade-off:** Organisms with fast stamina regeneration must forage constantly or face rapid starvation.

#### 7. `LOCUS_CUTICLE_PIGMENT`
- **Allele Range:** $[0.0, 1.0]$.
- **Expression Rule:** Additive codominance: $V_{exp} = \frac{a_1 + a_2}{2}$.
- **Phenotype Effect:** `cuticle_melanism_ratio` ($0.0 = \text{chestnut red-brown}$, $1.0 = \text{jet obsidian black}$).
- **Stat Effect:** Affects solar thermal absorption and nocturnal camouflage. Darker morphs absorb heat faster in morning sun; lighter morphs resist overheating under midday sun.
- **Trade-off:** Environmental context determines fitness.

#### 8. `LOCUS_ANTENNAL_CLUB`
- **Allele Range:** $[0.0, 1.0]$.
- **Expression Rule:** Dominance of larger lamellae: $V_{exp} = 0.7 \max(a_1, a_2) + 0.3 \min(a_1, a_2)$.
- **Phenotype Effect:** Expansion surface area of terminal antennal plates.
- **Stat Effect:** Increases `olfactory_detection_radius` for locating rotting tree sap and receptive mates.
- **Trade-off:** Delicate structures vulnerable to damage during abrasive head-to-head combat.

---

## 4. Recombination (Breeding Algorithm)

### 4.1 Principle
During sexual reproduction, offspring inherit exactly one allele per locus from Parent A (Maternal) and one allele per locus from Parent B (Paternal).

### 4.2 Seed Derivation
To guarantee absolute determinism and prevent replay tampering, the breeding RNG seed is derived via 64-bit cryptographic/hash combination:
$$\text{BreedingSeed} = \text{Hash64}(\text{ParentA.id} \,\|\, \text{ParentB.id} \,\|\, \text{ParentA.generation} \,\|\, \text{BreedingNonce})$$

### 4.3 Pseudocode

```python
class DiploidLocus:
    allele_1: float  # Maternal
    allele_2: float  # Paternal

class Genome:
    loci: dict[str, DiploidLocus]

def recombine_genome(parent_a: Genome, parent_b: Genome, rng: DeterministicRNG) -> Genome:
    child_genome = Genome(loci={})
    
    # Iterate over all loci defined in species schema
    for locus_id in SPECIES_LOCI_REGISTRY:
        locus_a = parent_a.loci[locus_id]
        locus_b = parent_b.loci[locus_id]
        
        # Segregation: 50% probability to pick allele_1 or allele_2 from Parent A
        inherited_from_a = locus_a.allele_1 if rng.next_float() < 0.5 else locus_a.allele_2
        
        # Segregation: 50% probability to pick allele_1 or allele_2 from Parent B
        inherited_from_b = locus_b.allele_1 if rng.next_float() < 0.5 else locus_b.allele_2
        
        child_genome.loci[locus_id] = DiploidLocus(
            allele_1=inherited_from_a,
            allele_2=inherited_from_b
        )
        
    return child_genome
```

*Note on Genetic Linkage:* For the initial prototype, loci segregate independently (Mendel's second law). Chromosomal physical linkage maps and chiasmata crossover will be layered in Phase 2 without altering the locus interface.

---

## 5. Mutation System

### 5.1 Rules of Mutation
1. **Separation from Recombination:** Mutation is a distinct second-pass operation executed after parental segregation.
2. **Deterministic Mutation Rolls:** Mutation triggers are evaluated strictly against the deterministic RNG stream.
3. **No Unbounded Spikes:** Alleles are mutated by a bounded delta $\Delta \sim \text{Uniform}(-\delta_{max}, +\delta_{max})$ and hard-clamped to $[0.0, 1.0]$.
4. **No Free Lunches (Physiological Trade-offs):** Mutations that increase physical capacity automatically inherit the physiological costs defined in the phenotype and stat formulas.

### 5.2 Mutation Parameters
- `per_locus_mutation_rate` ($P_{mut}$): Default $0.05$ (5% chance per locus).
- `max_mutation_delta` ($\delta_{max}$): Default $0.12$.

### 5.3 Pseudocode

```python
def apply_mutation(genome: Genome, rng: DeterministicRNG, p_mut: float = 0.05, delta_max: float = 0.12) -> tuple[Genome, list[MutationRecord]]:
    mutation_history = []
    
    for locus_id, locus in genome.loci.items():
        # Evaluate allele_1
        if rng.next_float() < p_mut:
            delta = (rng.next_float() * 2.0 - 1.0) * delta_max
            original_val = locus.allele_1
            locus.allele_1 = max(0.0, min(1.0, original_val + delta))
            mutation_history.append(MutationRecord(locus_id, allele_index=1, old_val=original_val, new_val=locus.allele_1))
            
        # Evaluate allele_2
        if rng.next_float() < p_mut:
            delta = (rng.next_float() * 2.0 - 1.0) * delta_max
            original_val = locus.allele_2
            locus.allele_2 = max(0.0, min(1.0, original_val + delta))
            mutation_history.append(MutationRecord(locus_id, allele_index=2, old_val=original_val, new_val=locus.allele_2))
            
    return genome, mutation_history
```

### 5.4 Causal Chain Example
1. Mutation event: During reproduction, `LOCUS_CEPHALIC_HORN` allele_2 experiences positive delta $+0.11$, shifting from $0.65 \to 0.76$.
2. Gene expression: In a male offspring with `LOCUS_BODY_SCALE` expressed at $0.80$, the expressed horn index jumps from $0.62 \to 0.73$.
3. Phenotype outcome: `cephalic_horn_length_mm` increases from $27.9\text{ mm} \to 32.8\text{ mm}$ (a massive visual and structural change).
4. Stat consequence:
   - `clash_lift_leverage` increases from $45 \to 58$ (+28% prying power).
   - `horn_weight_penalty` increases mass burden, increasing `stamina_cost_per_clash` by +15%.
   - Turning speed decreases by 5%.

---

## 6. Phenotype Mapping Layer

The phenotype layer transforms expressed genetic values into concrete morphological and physiological properties.

```
┌─────────────────────────────────┬───────────────────────────┬───────────────┬────────────────────────────────────────────────────────┐
│ Phenotype Property              │ Source Loci               │ Unit / Range  │ Mapping Formula                                        │
├─────────────────────────────────┼───────────────────────────┼───────────────┼────────────────────────────────────────────────────────┤
│ body_length_mm                  │ BODY_SCALE                │ 35.0 – 75.0 mm│ 35.0 + (V_exp * 40.0)                                  │
│ body_mass_grams                 │ BODY_SCALE, CHITIN        │ 10.0 – 45.0 g │ (10.0 + V_exp_body * 25.0) * (1.0 + V_exp_chitin * 0.2)│
│ exoskeleton_hardness_gpa        │ CHITIN_DENSITY            │ 1.5 – 6.0 GPa │ 1.5 + (V_exp * 4.5)                                    │
│ cephalic_horn_length_mm         │ CEPHALIC_HORN, BODY_SCALE │ 0.0 – 48.0 mm │ Male: (V_exp_horn^1.2) * 35.0 * (body_length / 55.0)   │
│                                 │                           │               │ Female: 0.0                                            │
│ thoracic_horn_arch_mm           │ THORACIC_HORN, BODY_SCALE │ 0.0 – 30.0 mm │ Male: V_exp_thoracic * 22.0 * (body_length / 55.0)     │
│                                 │                           │               │ Female: 0.0                                            │
│ tarsal_grip_newtons             │ TARSAL_CLAW, BODY_SCALE   │ 0.5 – 3.5 N   │ 0.5 + (V_exp_claw * 2.2) + (V_exp_body * 0.8)          │
│ basal_metabolic_cost_cal_hr     │ METABOLIC_RATE, BODY_SCALE│ 2.0 – 12.0 cal│ 2.0 + (V_exp_meta * 4.0) + (body_mass_grams * 0.15)    │
│ sensory_detection_radius_m      │ ANTENNAL_CLUB             │ 1.0 – 8.0 m   │ 1.0 + (V_exp_antennal * 7.0)                           │
│ cuticle_melanism_ratio          │ CUTICLE_PIGMENT           │ 0.0 – 1.0     │ V_exp_pigment                                          │
└─────────────────────────────────┴───────────────────────────┴───────────────┴────────────────────────────────────────────────────────┘
```

---

## 7. Derived Gameplay Stats

Gameplay stats are computed from the phenotype properties. **Never from raw genes directly.**

### 7.1 Stat Definitions & Formulas

1. **Max Health (`max_hp`):**
   $$\text{max\_hp} = 100 + (\text{body\_mass\_grams} \times 3.0) + (\text{exoskeleton\_hardness\_gpa} \times 12.0)$$
   - *Baseline range:* $148 \to 307 \text{ HP}$.
2. **Clash Power (`clash_power`):**
   $$\text{clash\_power} = (\text{cephalic\_horn\_length\_mm} \times 2.2) + (\text{tarsal\_grip\_newtons} \times 18.0)$$
   - *Female baseline:* Driven primarily by claw grip ($9 \to 63$).
   - *Male baseline:* Horn leverage + claw push ($9 \to 168$).
3. **Damage Reduction (`armor_def`):**
   $$\text{armor\_def} = \frac{\text{exoskeleton\_hardness\_gpa}}{6.0} \times 0.60 \quad (\text{yielding } 15\% \to 60\% \text{ passive damage soak})$$
4. **Crawl Speed (`crawl_speed_cm_s`):**
   $$\text{crawl\_speed} = \left(12.0 + \text{tarsal\_grip\_newtons} \times 2.5\right) \times \left(\frac{25.0}{\text{body\_mass\_grams}}\right)^{0.4}$$
5. **Stamina Capacity (`max_stamina`):**
   $$\text{max\_stamina} = 80.0 + (\text{body\_mass\_grams} \times 2.0) - (\text{cephalic\_horn\_length\_mm} \times 0.8)$$
6. **Stamina Recovery Rate (`stamina_regen_per_s`):**
   $$\text{stamina\_regen} = 4.0 + (\text{basal\_metabolic\_cost\_cal\_hr} \times 0.7)$$
7. **Foraging Perception (`perception_radius`):**
   $$\text{perception\_radius} = \text{sensory\_detection\_radius\_m}$$
8. **Starvation Duration (`starvation_hours`):**
   $$\text{starvation\_hours} = \frac{\text{body\_mass\_grams} \times 1.8}{\text{basal\_metabolic\_cost\_cal\_hr}}$$

---

## 8. Environmental Interaction & Phenotypic Plasticity

### 8.1 The Immutable Boundary
$$\text{GENETIC VALUE} \neq \text{CURRENT CONDITION}$$

Environmental factors (temperature, humidity, larval nutrition, toxins) **never rewrite the organism's genome**.

### 8.2 Expression Modification vs. Condition Scaling
1. **Larval Nutrition (Developmental Plasticity):**
   - During the larval/pupal stage, nutritional deficit sets a permanent `developmental_realization_factor` ($\eta \in [0.6, 1.0]$).
   - In adult emergence:
     $$\text{body\_length\_realized} = \text{body\_length\_genetic} \times \eta$$
   - The *genome* remains $100\%$ untouched. If a starved dwarf adult breeds in optimal conditions, its progeny inherit full genetic potential.
2. **Temperature on Cuticle Pigment (Current Condition):**
   $$\text{effective\_body\_temp} = T_{ambient} + (\text{SolarRadiation} \times \text{cuticle\_melanism\_ratio} \times 4.5)$$
   - High melanism in cool mountain mornings grants rapid warm-up to operating temperature.
   - High melanism in scorching midday heat causes heat exhaustion debuffs unless shelter is found.

---

## 9. Emergent Evolution Architecture

### 9.1 Philosophy: No Pre-scripted Evolution Trees
Evolution is an emergent macroscopic phenomenon resulting from generations of:
$$\text{Recombination} + \text{Mutation} + \text{Environmental Selection} + \text{Genetic Drift}$$

### 9.2 Future Mechanics Enabled by this Genome
1. **Speciation Distance ($\Delta G$):**
   The Euclidean genetic distance between an organism's locus values and an ancestral centroid:
   $$\Delta G = \sqrt{\sum_{i=1}^{N} (V_{exp, i} - V_{archetype, i})^2}$$
2. **Adaptive Branching:**
   When a sub-population survives in extreme subterranean caves over 10 generations, selection weeds out large horns and high vision, favoring compact bodies, enhanced antennae, and reduced pigmentation. The game designates this lineage as a recognized emergent subspecies (e.g., *Xylotrupes gideon cavernicola*).
3. **Zero Level-Up Evolutions:**
   Creatures do not evolve into new species at "Level 16". Speciation occurs strictly across generational lineage transitions.

---

## 10. Lineage Identity Model

To trace lineages across generations, each organism carries a persistent lineage manifest:

```json
{
  "$schema": "lineage_record.schema.json",
  "version": "1.0.0",
  "organism_id": "org_xyd_gen04_0087",
  "species_id": "species_xylotrupes_gideon",
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
