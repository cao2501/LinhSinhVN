# LinhSinhVN — Prototype Species Evaluation & Selection

**Phase:** Phase 0 — Foundation  
**Document Status:** PROVISIONAL — BIOLOGICAL VERIFICATION REQUIRED  
**Target Focus:** First Vertical Prototype Slice  

---

## 1. Evaluation Context & Methodological Boundaries

### 1.1 Real Biology vs. Gameplay Model
LinhSinhVN enforces a strict conceptual distinction:
$$\text{REAL BIOLOGY (Inspiration / Qualitative Constraints)} \longrightarrow \text{GAMEPLAY MODEL (Deterministic Gameplay Constants)}$$

- **Real Biology:** Informs qualitative anatomical relationships, life cycles, sexual dimorphism, and environmental context. We do **not** claim exact biological field measurements or peer-reviewed biometric datasets for the prototype species.
- **Gameplay Model:** Defines explicit, deterministic numerical parameters, normalized bounds, and derived combat/survival formulas designed for game balance and verification.

### 1.2 Vietnamese Biodiversity Boundary & Territorial Scope
LinhSinhVN is strictly anchored to biodiversity recorded within the **modern territory of Vietnam**:
- **Rejection of Vague Regional Labels:** Broad tags such as "Indochina", "Southeast Asia", or "Asian" must **never** serve as automatic inclusion criteria.
- **Evidence Requirement:** A species may enter the core roster only when supported by reasonable evidence of verified records within Vietnam's territorial borders.
- **Uncertainty Principle:** If geographic or taxonomic confirmation within Vietnam is incomplete, the taxon must carry `STATUS = PROVISIONAL` and `biodiversity_status = PROVISIONAL`.
- **Foreign / Invasive Species:** Non-native species are excluded from the core roster unless explicitly justified by future migration or invasive ecology mechanics, and must be marked as non-native.
- **Roster Priority Hierarchy:**
  1. Vietnamese native species (*loài bản địa*)
  2. Vietnamese endemic species (*loài đặc hữu*)
  3. Species strongly associated with Vietnamese habitats and micro-ecosystems
  4. Verified Vietnamese biodiversity records

### 1.3 Prototype Technical Criteria
1. **Morphological Legibility:** Distinct, exaggerated anatomical features recognizable in a 2D top-down view.
2. **Sexual Dimorphism:** Clear differential gene expression between sexes to validate conditional phenotypic masking.
3. **Continuous Phenotypic Variation:** Anatomy allowing observable scalar changes (e.g., horn curvature, shell proportion) without requiring hundreds of hand-crafted animation frames.
4. **Cultural & Ecological Resonance:** Deep familiarity within Vietnamese rural traditions, folklore, or domestic micro-habitats.
5. **Production Feasibility:** Locomotion and clashing dynamics achievable with modular 2D sprite layering.

---

## 2. Candidate Evaluation

### Candidate 1: Kiến vương hai sừng (Rhinoceros Beetle Prototype)
- **Internal Prototype ID:** `xylotrupes_rhinoceros_proto`
- **Scientific Name (Metadata):** *Xylotrupes gideon* complex (provisional grouping including *Xylotrupes socrates*)
- **Biodiversity Status:** `PROVISIONAL` (pending taxonomic record verification within Vietnam)
- **Taxonomy (Qualitative):** Order: Coleoptera; Family: Scarabaeidae; Subfamily: Dynastinae
- **Observed Habitat Context in Vietnam:** Forested lowlands, decaying humus, bamboo clumps, and rural tree trunks across Northern, Central, and Southern Vietnam.
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
- **Biodiversity Status:** `PROVISIONAL`
- **Taxonomy (Qualitative):** Order: Mantodea; Family: Mantidae
- **Observed Habitat Context in Vietnam:** Garden foliage, agricultural shrubbery, forest margins in Vietnam.
- **Why Suitable:** High recognition as an ambush insect predator with mobile head articulation and raptorial forelegs.
- **Major Implementation Difficulty:** High animation overhead. Striking, grabbing, and multi-jointed leg articulation require dynamic inverse kinematics or extensive sprite sets.
- **Recommendation:** Deferred to subsequent predatory milestones.

---

### Candidate 3: Bọ cạp rừng Đông Dương (Asian Forest Scorpion)
- **Scientific Name (Metadata):** *Heterometrus laoticus* / *Heterometrus silenus*
- **Biodiversity Status:** `PROVISIONAL`
- **Taxonomy (Qualitative):** Class: Arachnida; Order: Scorpiones; Family: Scorpionidae
- **Observed Habitat Context in Vietnam:** Forest floor leaf litter, burrows under decaying logs in Central and Southern Vietnam.
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
- **Territorial Justification:**
  Rhinoceros beetles (*kiến vương*) are ubiquitous in Vietnamese folk culture and widely observed in Vietnamese tropical ecosystems. However, under the strict **Vietnamese Biodiversity Boundary**, the exact species-level distinction within modern Vietnamese territory (e.g., whether local populations are *Xylotrupes gideon*, *Xylotrupes socrates*, or specific subspecies) requires formal reference against verified Vietnamese entomological records.
  The internal identifier `xylotrupes_rhinoceros_proto` isolates the gameplay engine while respecting the biodiversity boundary rule.

---

## 5. Canonical Species Profile & Data Contract Architecture (Task 04-B)

The prototype species configuration is formally defined as pure data under [`data/species/xylotrupes_rhinoceros_proto.json`](file:///d:/LinhSinhVN/data/species/xylotrupes_rhinoceros_proto.json), conforming to the generic species schema [`data/species/schema/species_profile.schema.json`](file:///d:/LinhSinhVN/data/species/schema/species_profile.schema.json).

### 5.1 Generic Engine vs. Species Profile Separation
```
┌─────────────────────────────────────────────────────────────┐
│                 GENERIC LIFECYCLE ENGINE                    │
│   (Stage-agnostic, Substage-agnostic, Deterministic Ticks)  │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│               SPECIES PROFILE DATA CONTRACT                 │
│         (data/species/xylotrupes_rhinoceros_proto.json)     │
├─────────────────────────────────────────────────────────────┤
│ • Lifecycle: EGG ──► LARVA [L1, L2, L3] ──► PUPA ──► ADULT  │
│ • Development: η ∈ [0.60, 1.00], locked at STAGE_PUPA      │
│ • Environment: Temperature (24-28°C), Moisture, Humidity    │
│ • Nutrition: Organic Humus, Decaying Wood, Tree Sap, Fruit  │
│ • Reproduction: Adult polygyne, clutch size 15-45 eggs      │
│ • Behavior: Nocturnal, burrowing/crawling/flight, prying    │
│ • Genetics Ref: references loci without duplicating formulas│
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Key Profile Modules & Design Invariants

1. **Species-Specific Instars (`L1`, `L2`, `L3`):**
   - The existence of 3 larval instars is strictly a **species-level configuration profile**. The core lifecycle engine knows only generic stages and substages.
2. **Developmental Realization Parameters:**
   - Initial $\eta = 1.00$, $\eta_{\min} = 0.60$, $\eta_{\max} = 1.00$.
   - Primary plasticity window: `STAGE_LARVA`.
   - Irrevocable locking event: `STAGE_PUPA` entry (`eta_lock_trigger: true`).
3. **Biological Uncertainty & Data Labeling:**
   - All empirical metadata carries `biological_confidence: "PROVISIONAL"`.
   - All numerical thresholds, durations, metabolic rates, and molt energy costs carry the explicit caveat: **`GAMEPLAY MODEL / PROTOTYPE CONSTANT`**.
4. **Genetics Engine Isolation:**
   - The species profile references `genetics_species_id: "xylotrupes_rhinoceros_proto"` without duplicating loci definitions, allele math, or derived stat formulas. The Genetics Engine remains the sole authoritative source of truth for genetics.

