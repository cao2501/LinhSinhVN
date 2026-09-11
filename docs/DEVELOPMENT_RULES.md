# LinhSinhVN — Development Rules

**Version:** 1.0.0  
**Phase:** Phase 0 — Foundation  
**Enforcement:** Mandatory for all human and AI contributors  

---

### RULE 01: Do Not Turn LinhSinhVN into a Pokémon Clone
LinhSinhVN is a creature-centric survival, genetics, and generational evolution simulation. Do not introduce human trainers, pocket capture mechanics, badge progression, or turn-based monster collection paradigms. The creature is the sovereign protagonist.

### RULE 02: Vietnamese Biodiversity Boundary is a Core Identity Pillar
LinhSinhVN is explicitly centered on biodiversity recorded within the **modern territory of Vietnam**.
1. **No Automatic Regional Inclusions:** Broad regional descriptors such as "Indochina", "Southeast Asia", or "Asian" must **not** be treated as automatic inclusion criteria. A creature may be incorporated as a core species only when there is reasonable evidence that the species is recorded within the borders of Vietnam.
2. **Provisional Handling for Uncertainty:** If the geographic or taxonomic status of a species within Vietnam is uncertain or unconfirmed, its status must be explicitly designated as `STATUS = PROVISIONAL` and it must **not** be presented as confirmed Vietnamese biodiversity.
3. **Foreign / Introduced Species:** Non-native species may appear only when explicitly justified by future migration, cargo hitchhiking, or invasive ecology systems, and must be clearly marked as non-native.
4. **Core Creature Roster Prioritization:**
   - Priority 1: Vietnamese native species (*loài bản địa*)
   - Priority 2: Vietnamese endemic species (*loài đặc hữu*)
   - Priority 3: Species strongly associated with Vietnamese habitats and cultural ecosystems
   - Priority 4: Verified Vietnamese biodiversity records in established scientific literature or herbarium/museum registries.

### RULE 03: Real Species, Fictional Variants, Mutations, and Evolutions Must Be Clearly Distinguished
Data models and game taxonomy must strictly separate:
1. True biological baseline taxa (e.g., *Odontolabis mouhoti*, *Heterometrus laoticus*).
2. Emergent genetic mutations (phenotypic variants within a biological species).
3. Speculative or fictional evolutionary branches resulting from extreme generational pressure.

### RULE 04: Do Not Present Invented Biology as Scientific Fact
While gameplay mechanics may extrapolate, simplify, or stylize evolutionary mechanisms, in-game encyclopedias and documentation must maintain clear demarcations between real-world entomology/biology and fictionalized mechanics.

### RULE 05: Core Simulation Must Be Deterministic Where Practical
Given identical initial state, random number generator seed, genome sequence, parent lineages, and environmental input vectors, the simulation must produce identical outcomes. This applies strictly to:
- Genetics and allele recombination
- Mutation incidence
- Phenotype calculation and stat derivation
- Combat formulas and damage resolution
- Evolutionary threshold determinations

### RULE 06: LLMs Must Not Arbitrarily Modify Deterministic Game-State Outcomes
Language models and generative AI may be leveraged for dynamic commentary, narrative flavor, NPC reaction dialogue, and fourth-wall banter. However, LLMs are **strictly observers and presenters**. They must **never** mutate authoritative game state, decide survival checks, resolve combat, or inject unseeded genetic changes.

### RULE 07: Prefer Data-Driven Systems
Species characteristics, genetic loci, mutation weights, habitat parameters, item properties, and abilities must be declared in structured data files (e.g., JSON or engine Resource definitions). Engine code provides the simulation logic that interprets data, never hardcoding species tables into code.

### RULE 08: Avoid Premature Overengineering
Build the simplest viable implementation that satisfies current design contracts. Do not construct convoluted abstract frameworks for hypothetical mechanics that have not been approved.

### RULE 09: Prove the Core Gameplay Loop Before Creating Huge Amounts of Content
Before implementing dozens of species or massive maps, the minimal slice of the core loop (Explore → Survive → Develop → Breed → Mutate → Express Phenotype) must be validated for mechanical depth and fun.

### RULE 10: A Feature is NOT Complete Merely Because Code Compiles
Compilation or syntax passing is the minimum baseline. A feature is complete only when it satisfies its specification, operates within the deterministic simulation, integrates cleanly with dependent layers, and passes validation.

### RULE 11: Major Features Must Eventually Be Tested in the Actual Running Game
Unit tests and headless scripts are necessary for simulation validation, but gameplay systems must ultimately be verified in runtime execution within the engine environment.

### RULE 12: Keep Systems Modular
Systems must maintain high cohesion and loose coupling. Clear interface contracts must govern boundaries (e.g., the Genetics engine knows nothing of rendering or UI; UI reads read-only representations of Phenotypes).

### RULE 13: Do Not Silently Change Approved Design Contracts
If an architectural boundary, data contract, or core design choice needs modification, it must be explicitly documented, proposed, and approved. Silent refactorings that alter design semantics are prohibited.

### RULE 14: If a Major Design Decision is Unclear, Document It in OPEN_QUESTIONS.md
Do not make silent assumptions or invent speculative gameplay systems when requirements are ambiguous. Record the trade-offs, unknowns, and implications in `docs/OPEN_QUESTIONS.md` for team alignment.

### RULE 15: Before Major Architectural Changes, Explain Why, Alternatives, and Consequences
Any proposal to alter existing architectural foundations must present:
1. **Rationale:** Why the current design is inadequate.
2. **Alternatives Considered:** What other patterns were evaluated.
3. **Consequences:** Impact on performance, determinism, testability, and timeline.

### RULE 16: Do Not Generate Hundreds of Creatures/Assets Before the Core Loop is Proven Fun
Resist the temptation to batch-generate creature sprites, animations, or extensive species lists before the foundational prototype demonstrates engaging gameplay. Content creation scales only after mechanical validation.

### RULE 17: Every Important System Must Have a Clear Owner/Domain
Every feature, data directory, and code subsystem must map cleanly to one of the defined architectural domains (CORE, GENETICS, PHENOTYPE, WORLD, UI, etc.). No orphan logic or ambiguous cross-cutting dependencies.
