# LinhSinhVN — Prototype Species Evaluation & Selection

**Phase:** Phase 0 — Foundation  
**Document Status:** PROVISIONAL SPECIFICATION (Requires Biological Verification)  
**Target Focus:** First Vertical Prototype Slice  

---

## 1. Evaluation Context & Criteria

To validate the core biological pipeline:
$$\text{GENOME} \to \text{GENES} \to \text{EXPRESSION} \to \text{PHENOTYPE} \to \text{DERIVED STATS} \to \text{BREEDING}$$

The prototype species must satisfy rigorous mechanical and production criteria:
1. **Morphological Legibility:** Distinct, exaggerated anatomical features visible at small 2D sprite resolutions.
2. **Sexual Dimorphism:** Clear differential gene expression between sexes to validate conditional phenotypic masking.
3. **Continuous Phenotypic Variation:** Anatomy that allows observable scalar variation (e.g., horn curvature, cuticle shine, carapace width) without demanding complete animation re-rigging.
4. **Cultural & Ecological Resonance:** Deeply indigenous to Vietnam and recognizable in Vietnamese folklore or everyday nature.
5. **Simplicity of Movement in 2D:** Crawling, gripping, and pushing dynamics that can be expressed with minimal sprite frames rather than complex multi-jointed martial maneuvers.

---

## 2. Candidate Evaluation

### Candidate 1: Kiến vương hai sừng (Siamese Rhinoceros Beetle)
- **Scientific Name:** *Xylotrupes gideon* (taxon complex, including *Xylotrupes socrates*)
- **Taxonomy:** Order: Coleoptera; Family: Scarabaeidae; Subfamily: Dynastinae
- **Habitat in Vietnam:** Lowland rainforests, bamboo groves, tropical orchards, decaying humus layers across Northern, Central, and Southern Vietnam.
- **Why Suitable:**
  - Iconic Vietnamese childhood association with beetle wrestling (*chọi kiến vương* / *chọi bọ hung*).
  - Extreme, legible sexual dimorphism: Males possess massive bifurcated cephalic and thoracic horns used as prying levers; females lack horns entirely and exhibit compact, armored oval carapaces.
  - Rigid exoskeleton allows modular sprite compositing: Head horn, thoracic shield, and elytra can be layered and scaled via 2D transforms without breaking joint continuity.
  - Natural combat loop based on pushing, prying, and dislodging opponents rather than complex projectile or slashing attacks.
- **Important Visible Traits:** Cephalic horn length/bifurcation, thoracic horn arch, elytra sheen (chestnut brown to obsidian black), body girth, tarsal leg spines.
- **Useful Genetic Traits for Prototype:**
  - Horn scale locus (continuous quantitative expression in males, masked in females).
  - Chitin thickness locus (defensive density and weight).
  - Tarsal claw grip locus (leverage and traction on bark).
  - Body mass scale locus (metabolic cost vs. momentum).
- **Major Implementation Difficulty:** Ensuring modular 2D sprite components (horn, pronotum, elytra) align seamlessly when scaling dynamically based on phenotype values.
- **Recommendation:** **Primary Choice (Top Candidate).**

---

### Candidate 2: Bọ ngựa xanh châu Á (Asian Mantis)
- **Scientific Name:** *Hierodula patellifera*
- **Taxonomy:** Order: Mantodea; Family: Mantidae
- **Habitat in Vietnam:** Gardens, scrubland, rainforest margins, agricultural foliage across all regions.
- **Why Suitable:**
  - High public recognition as a supreme insect predator.
  - Distinct hunting posture (folded raptorial forelegs, triangular swivel head).
  - Dynamic coloration polymorphism (leaf green to bark brown variants).
- **Important Visible Traits:** Raptorial foreleg spines, pronotum length, compound eye size, camouflage coloration.
- **Useful Genetic Traits for Prototype:** Strike speed, binocular visual range, camouflage index, foreleg reach.
- **Major Implementation Difficulty:**
  - High animation overhead: Striking, grasping, grooming, and walking require multi-jointed Inverse Kinematics or dozens of hand-drawn frames.
  - Phenotypic scaling (e.g., longer forelegs) disrupts hitboxes and attack reach unless rigs are completely dynamic.
- **Recommendation:** Deferred. Excellent second-generation predator, but too animation-heavy for the isolated genetics prototype.

---

### Candidate 3: Bọ cạp rừng Đông Dương (Asian Forest Scorpion)
- **Scientific Name:** *Heterometrus laoticus* / *Heterometrus silenus*
- **Taxonomy:** Class: Arachnida; Order: Scorpiones; Family: Scorpionidae
- **Habitat in Vietnam:** Forest leaf litter, burrowing under decaying logs in Central and Southern tropical forests.
- **Why Suitable:**
  - Heavily armored, intimidating presence.
  - Dual physical/chemical attack modes (massive pedipalp chelae claws vs. venomous telson sting).
- **Important Visible Traits:** Chela width, metasoma (tail) curvature and thickness, telson sting size, pectine sensory organs.
- **Useful Genetic Traits for Prototype:** Claw grip power vs. venom yield/toxicity trade-off; burrowing efficiency vs. surface sprint speed.
- **Major Implementation Difficulty:**
  - Segmented tail physics/curling requires specialized multi-segment animation.
  - Introduces venom potency, chemical metabolism, and status effects into combat before base physical clashing is verified.
- **Recommendation:** Deferred. Strong future candidate for predatory/arachnid branch.

---

## 3. Comparative Matrix

| Evaluation Criterion | *Xylotrupes gideon* (Kiến vương) | *Hierodula patellifera* (Bọ ngựa) | *Heterometrus laoticus* (Bọ cạp) |
| :--- | :--- | :--- | :--- |
| **Cultural Resonance in VN** | ⭐⭐⭐⭐⭐ (Folk games/childhood) | ⭐⭐⭐⭐ (Recognized predator) | ⭐⭐⭐ (Known wilderness hazard) |
| **Morphological Legibility** | ⭐⭐⭐⭐⭐ (Huge dual horns & shell) | ⭐⭐⭐⭐ (Thin limbs, mantis head) | ⭐⭐⭐⭐⭐ (Massive claws & tail) |
| **Sexual Dimorphism** | ⭐⭐⭐⭐⭐ (Dramatic horn masking) | ⭐⭐ (Subtle abdomen/wing size) | ⭐⭐ (Pectine teeth count, subtle) |
| **Phenotype Scaling in 2D** | ⭐⭐⭐⭐⭐ (Rigid modular shells) | ⭐⭐ (Complex leg joint rigs) | ⭐⭐⭐ (Segmented tail complexity) |
| **Minimal Animation Cost** | ⭐⭐⭐⭐ (Crawling & horn prying) | ⭐ (Fast strikes & folded legs) | ⭐⭐ (Segmented stinging sweep) |
| **Biological Credibility** | ⭐⭐⭐⭐⭐ (Well-studied allometry) | ⭐⭐⭐⭐ (Classic ambush biology) | ⭐⭐⭐⭐ (Well-studied venomology) |

---

## 4. Decision: Selected Prototype Species

**Selected Species:** **Kiến vương hai sừng (*Xylotrupes gideon* / *Xylotrupes socrates*)**  
**Classification:** **PROVISIONAL — REQUIRES BIOLOGICAL VERIFICATION**

### Verification Notes:
- In contemporary entomological literature, the Indochinese rhinoceros beetle previously classified broadly as *Xylotrupes gideon* is often differentiated as *Xylotrupes socrates* or regional subspecies within the *Xylotrupes* complex.
- For prototype simulation and data design, we establish the base taxon identifier as `species_xylotrupes_gideon` with explicit support for allometric horn scaling and modular sex dimorphism.
- If scientific consensus confirms *Xylotrupes socrates* as the dominant regional taxon in Vietnam, the taxon ID can be updated in `data/species/` without requiring any changes to the genome schema or underlying simulation code.
