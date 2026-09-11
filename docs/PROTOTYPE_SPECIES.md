# LinhSinhVN — Prototype Species Evaluation & Selection

**Phase:** Phase 0 — Foundation  
**Document Status:** PROVISIONAL — BIOLOGICAL VERIFICATION REQUIRED  
**Target Focus:** First Vertical Prototype Slice  

---

## 1. Evaluation Context & Methodological Boundary

### 1.1 Real Biology vs. Gameplay Model
LinhSinhVN enforces a strict conceptual distinction:
$$\text{REAL BIOLOGY (Inspiration / Qualitative Constraints)} \longrightarrow \text{GAMEPLAY MODEL (Deterministic Gameplay Constants)}$$

- **Real Biology:** Informs qualitative anatomical relationships, life cycles, sexual dimorphism, and environmental context. We do **not** claim exact biological field measurements or peer-reviewed biometric datasets for the prototype species.
- **Gameplay Model:** Defines explicit, deterministic numerical parameters, normalized bounds, and derived combat/survival formulas designed for game balance and verification.

### 1.2 Prototype Evaluation Criteria
1. **Morphological Legibility:** Distinct, exaggerated anatomical features recognizable in a 2D top-down view.
2. **Sexual Dimorphism:** Clear differential gene expression between sexes to validate conditional phenotypic masking.
3. **Continuous Phenotypic Variation:** Anatomy allowing observable scalar changes (e.g., horn curvature, shell proportion) without requiring hundreds of hand-crafted animation frames.
4. **Cultural & Ecological Resonance:** Familiarity within Vietnamese rural traditions, folklore, or micro-habitats.
5. **Production Feasibility:** Locomotion and clashing dynamics achievable with modular sprite layering.

---

## 2. Candidate Evaluation

### Candidate 1: Kiến vương hai sừng (Rhinoceros Beetle Prototype)
- **Internal Prototype ID:** `xylotrupes_rhinoceros_proto`
- **Scientific Name (Metadata):** *Xylotrupes gideon* complex (provisional grouping including *Xylotrupes socrates*)
- **Taxonomy (Qualitative):** Order: Coleoptera; Family: Scarabaeidae; Subfamily: Dynastinae
- **Observed Habitat Context:** Tropical lowland foliage, bamboo stands, rotting wood/humus substrate across Indochina.
- **Why Suitable:**
  - Iconic Vietnamese childhood association with beetle wrestling (*chọi kiến vương* / *chọi bọ hung*).
  - Extreme, legible sexual dimorphism: Males possess pronounced bifurcated cephalic and thoracic horns used as prying levers; females lack horns entirely, exhibiting compact oval carapaces.
  - Exoskeletal structure lends itself to modular 2D sprite layering (independent head horn, pronotum, and elytra) and dynamic scaling.
  - Core combat loop is physical grappling (prying leverage, traction, dislodging) rather than high-frame-rate martial arts.
- **Qualitative Biological Traits:** Cephalic horn development, thoracic horn arch, elytral pigmentation (chestnut brown to black), body mass, pretarsal claw grip.
- **Prototype Loci Mapping:** Horn scale locus (sex-masked in females), cuticle density locus, tarsal grip locus, metabolic efficiency locus.
- **Implementation Trade-offs:** Modular 2D sprite components must align dynamically across scale variations without seam gaps.
- **Recommendation:** **Primary Choice (Top Candidate).**

---

### Candidate 2: Bọ ngựa xanh châu Á (Asian Mantis)
- **Scientific Name (Metadata):** *Hierodula patellifera*
- **Taxonomy (Qualitative):** Order: Mantodea; Family: Mantidae
- **Observed Habitat Context:** Garden shrubbery, rainforest margins across Vietnam.
- **Why Suitable:** High recognition as an apex insect ambush predator with mobile head articulation and raptorial forelegs.
- **Major Implementation Difficulty:** High animation overhead. Striking, grabbing, and multi-jointed leg articulation require dynamic inverse kinematics or extensive sprite sets.
- **Recommendation:** Deferred to subsequent predatory milestones.

---

### Candidate 3: Bọ cạp rừng Đông Dương (Asian Forest Scorpion)
- **Scientific Name (Metadata):** *Heterometrus laoticus* / *Heterometrus silenus*
- **Taxonomy (Qualitative):** Class: Arachnida; Order: Scorpiones; Family: Scorpionidae
- **Observed Habitat Context:** Forest leaf litter, burrowing under decaying logs in Central/Southern Vietnam.
- **Why Suitable:** Armored presence, dual physical (chelae claws) and chemical (venom telson) attack modes.
- **Major Implementation Difficulty:** Multi-segmented tail animation complexity and premature introduction of venom toxicity balances before basic physical push mechanics are proven.
- **Recommendation:** Deferred to subsequent predator milestones.

---

## 3. Comparative Matrix

| Evaluation Criterion | *Xylotrupes* Prototype | Mantis (*Hierodula*) | Scorpion (*Heterometrus*) |
| :--- | :--- | :--- | :--- |
| **Cultural Resonance in VN** | ⭐⭐⭐⭐⭐ (Traditional beetle clashing) | ⭐⭐⭐⭐ (Recognized predator) | ⭐⭐⭐ (Known wilderness hazard) |
| **Morphological Legibility** | ⭐⭐⭐⭐⭐ (Dual horns & armored shell) | ⭐⭐⭐⭐ (Slender body, folded legs) | ⭐⭐⭐⭐⭐ (Massive pincers & tail) |
| **Sexual Dimorphism** | ⭐⭐⭐⭐⭐ (Distinct male horn masking) | ⭐⭐ (Subtle body size difference) | ⭐⭐ (Pectine teeth count, subtle) |
| **2D Modular Scaling** | ⭐⭐⭐⭐⭐ (Rigid segmented shells) | ⭐⭐ (Complex joint deformation) | ⭐⭐⭐ (Curved segmented tail) |
| **Animation Overhead** | ⭐⭐⭐⭐ (Crawling & horn prying) | ⭐ (Fast multi-frame strikes) | ⭐⭐ (Segmented stinging sweep) |

---

## 4. Selection & Architectural Binding

- **Internal Species Identifier:** `xylotrupes_rhinoceros_proto`
- **Taxonomic Status:** **PROVISIONAL — BIOLOGICAL VERIFICATION REQUIRED**
- **Taxonomy Note:** Regional Indochinese populations of the *Xylotrupes* genus contain taxonomic nuance between *X. gideon* and *X. socrates*. The internal ID `xylotrupes_rhinoceros_proto` isolates the simulation and data schemas from unresolved scientific debates. The game model draws qualitative morphological inspiration from these beetles while running entirely on decoupled gameplay constants.
