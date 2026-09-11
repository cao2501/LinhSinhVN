# LinhSinhVN — Open Questions

**Phase:** Phase 0 — Foundation  
**Status:** Active Backlog (Unresolved Design & Technical Decisions)  
**Rule:** Do not resolve these prematurely. They must be evaluated and approved systematically.

---

### 1. Protagonist & Species Taxonomy
- **Exact protagonist species:** What is the precise starter species for the initial prototype slice?
- **Insect vs. other small animal:** Should the initial focus remain strictly entomological (e.g., rhinoceros beetle *Xylotrupes gideon*, Asian forest scorpion *Heterometrus laoticus*, praying mantis *Hierodula patellifera*), or include small reptiles/amphibians (e.g., Tokay gecko *Gekko gecko*, tree frogs)?

### 2. Art Direction & Visual Identity
- **Exact art direction:** High-fidelity pixel art (e.g., 32x32 / 64x64 sprites), hand-drawn 2D vector art, or skeletal 2D animation (Spine/DragonBones)?
- **Visual tone:** Hyper-realistic anatomical biology with stylized accents, or semi-stylized illustrative tropical aesthetic?
- **Phenotype visualization:** How are dynamic phenotypic differences (larger mandibles, altered leg segments, carapace color shifts) visually composed at runtime (modular sprite layering vs. shader recoloring vs. procedural part assembly)?

### 3. Genetics & Biological Simulation
- **Exact genome model:** What is the underlying data structure representing the chromosome set (e.g., fixed-length binary bitstrings, integer arrays, or typed locus dictionaries)?
- **Allele structure:** Are traits strictly diploid (pairs of maternal/paternal alleles), or do certain loci support polygenic or multi-allelic series?
- **Dominant/recessive system:** Complete Mendelian dominance, incomplete dominance (blended expression), or co-dominance?
- **Mutation model:** Pure stochastic random bit flips, or environmental/stress-induced epigenetic mutations with weighted probabilities?
- **Cross-species breeding rules:** Can closely related sympatric species interbreed with sterile/fertile offspring (hybridization), or is reproduction strictly conspecific?

### 4. Gameplay & Survival Loop
- **Survival mechanics:** What is the balance between real-time action survival (stamina, dodging, attacking) and tactical/resource-management survival (temperature regulation, humidity, calorie budgeting)?
- **Death mechanics & Lineage continuation:** What happens when an organism dies before reproducing? Is it a permadeath game over requiring a restart from an ancestral branch, or is there a persistent colony/nursery pool?
- **Ecosystem simulation depth:** How simulated is the surrounding world when off-screen? Full cellular automaton, statistical abstract pools, or local bubble simulation around the player?
- **Combat model:** Direct real-time action (hitboxes, lunges, venom strikes) vs. tactical pause or positional micro-clashes?

### 5. Narrative, Dialogue & Fourth-Wall Systems
- **Fourth-wall character personality:** Exactly how aggressive or endearing is the protagonist's sarcasm? How is the balance struck between humorous roasting and player motivation?
- **Dialogue generation architecture:** Pre-authored scripted dialogue matrices with dynamic variable insertion vs. deterministic template engines vs. local/cloud LLM runtime generation (strictly decoupled from simulation state)?

### 6. Platform, Commercial & Production Scope
- **Target platform:** Desktop PC (Steam/itch.io) as sole initial target, or mobile (touchscreen input adaptation considerations)?
- **Multiplayer / Social features:** Fully offline single-player experience, or asynchronous lineage sharing (e.g., exporting genetic codes, encountering wandering ghosts of other players' lineages)?
- **Monetization (if any):** Premium buy-to-play standalone title, episodic releases, or other models?
- **Final commercial title:** Will the project retain "LinhSinhVN", or transition to a finalized bilingual title (e.g., "Linh Sinh: Microcosm Vietnam")?
