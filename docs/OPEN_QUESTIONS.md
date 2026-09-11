# LinhSinhVN — Open Questions

**Phase:** Phase 0 — Foundation  
**Status:** Active Backlog (Tracked Design & Technical Decisions)  

---

### 1. Protagonist & Species Taxonomy
- **Exact protagonist species [PROVISIONALLY RESOLVED FOR PROTOTYPE]:** Internal prototype identifier `xylotrupes_rhinoceros_proto` provisionally selected for the initial vertical prototype slice. Scientific metadata recorded as *Xylotrupes gideon* complex (`PROVISIONAL — BIOLOGICAL VERIFICATION REQUIRED`). See [docs/PROTOTYPE_SPECIES.md](file:///d:/LinhSinhVN/docs/PROTOTYPE_SPECIES.md).
  - *Remaining Biological Verification:* Confirmation of regional Indochinese taxonomy differentiation between *Xylotrupes gideon* and *Xylotrupes socrates*. The internal game ID isolates the codebase from taxonomy debates.
- **Insect vs. other small animal:** Focus locked to indigenous Vietnamese Coleoptera for the foundation prototype slice. Secondary branches (Mantodea, Scorpiones, small amphibians) deferred to post-prototype milestones.

### 2. Art Direction & Visual Identity
- **Exact art direction:** High-fidelity pixel art (e.g., 32x32 / 64x64 sprites), hand-drawn 2D vector art, or skeletal 2D animation (Spine/DragonBones)?
- **Visual tone:** Hyper-realistic anatomical biology with stylized accents, or semi-stylized illustrative tropical aesthetic?
- **Phenotype visualization:** Modular 2D sprite layering selected in principle for *Xylotrupes* (independent cephalic horn, thoracic pronotum, and abdomen/elytra components). Precise asset pipeline and shader recoloring specifications remain open.

### 3. Genetics & Biological Simulation
- **Exact genome model [RESOLVED FOR PHASE 0]:** Diploid quantitative continuous allele pairs $[a_1, a_2] \in [0.0, 1.0]$ across 8 defined loci. All values classified as **Gameplay Model / Prototype Constants**. See [docs/GENETICS_SPEC.md](file:///d:/LinhSinhVN/docs/GENETICS_SPEC.md).
- **Inheritance paradigm [RESOLVED FOR PHASE 0]:** Diploid Independent-Locus Inheritance. Chromosome linkage maps and crossover deferred to future milestones.
- **Metabolic model [RESOLVED FOR PHASE 0]:** `LOCUS_METABOLIC_EFFICIENCY` governing metabolic drain index, stamina economy, and starvation endurance.
- **Allele structure [RESOLVED FOR PHASE 0]:** Additive codominance default with sex-limited masking for horn allometry.
- **Mutation model [RESOLVED FOR PHASE 0]:** Bounded continuous delta ($\Delta \sim \text{Uniform}(-\delta_{max}, +\delta_{max})$) clamped to $[0.0, 1.0]$ with physiological trade-off coupling.
- **Speciation boundary [RESOLVED FOR PHASE 0]:** Genetic distance does **not** automatically equal speciation. Speciation mechanics deferred to future ecosystem phase.
- **Cross-species breeding rules [RESOLVED FOR PHASE 0]:** Strictly conspecific reproduction during Phase 0 prototype. Hybridization rules deferred to multi-species ecosystem phase.

### 4. Gameplay & Survival Loop
- **Survival mechanics:** Balance between real-time action survival (stamina, dodging, grappling) and tactical/metabolic budgeting (starvation interval, temperature regulation).
- **Death mechanics & Lineage continuation:** Exact penalty and transition when an organism dies prior to mating (e.g., reversion to previous ancestral clutch vs. sibling offshoot).
- **Ecosystem simulation depth:** Local bubble simulation around player vs. statistical background population tracking.
- **Combat model:** Micro-mechanics of beetle grappling (horn leverage, grip slip, prying torque) in a 2D plane.

### 5. Narrative, Dialogue & Fourth-Wall Systems
- **Fourth-wall character personality:** Sarcastic tone balance between humorous roasting and player motivation.
- **Dialogue generation architecture:** Pre-authored scripted dialogue matrices with dynamic variable insertion vs. deterministic template engines vs. local/cloud LLM runtime generation (strictly decoupled from simulation state).

### 6. Platform, Commercial & Production Scope
- **Target platform:** Desktop PC (Steam/itch.io) as sole initial target, with mobile/touch consideration deferred.
- **Multiplayer / Social features:** Fully offline single-player experience vs. asynchronous lineage export.
- **Monetization (if any):** Premium buy-to-play standalone title.
- **Final commercial title:** Evaluation of final title ("LinhSinhVN" vs. commercial subtitle).
