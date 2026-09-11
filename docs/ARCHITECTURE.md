# LinhSinhVN — Initial Architecture

**Document Status:** INITIAL ARCHITECTURE (Subject to evolutionary refactoring)  
**Phase:** Phase 0 — Foundation  

---

## 1. Architectural Philosophy & Dependency Flow

The system architecture enforces a strict unidirectional dependency hierarchy. Higher layers depend on lower layers; lower layers never import or depend on higher layers.

```
┌──────────────────────────────────────────────┐
│                     DATA                     │
│    (Species, Loci, Biomes, Encounters)       │
└──────────────────────┬───────────────────────┘
                       ▼
┌──────────────────────────────────────────────┐
│               CORE SIMULATION                │
│    (Deterministic Math, RNG, Clock, State)   │
└──────────────────────┬───────────────────────┘
                       ▼
┌──────────────────────────────────────────────┐
│               GAMEPLAY SYSTEMS               │
│ (Genetics, Phenotype, Evolution, Survival,   │
│         Ecosystem, World, Combat)            │
└──────────────────────┬───────────────────────┘
                       ▼
┌──────────────────────────────────────────────┐
│                 PRESENTATION                 │
│  (Scene Tree, Animation, Camera, Dialogue,   │
│             Fourth-Wall System)              │
└──────────────────────┬───────────────────────┘
                       ▼
┌──────────────────────────────────────────────┐
│               UI / AUDIO / VFX               │
│   (HUD, Audio Buses, Shaders, Particles)     │
└──────────────────────────────────────────────┘
```

### Critical Dependency Rules
1. **GENETICS must NOT depend on UI:** Genetic code, allele math, and mutation algorithms must be completely headless and executable in isolated test harnesses without engine display servers.
2. **CORE SIMULATION must NOT depend on DIALOGUE:** The authoritative biological simulation runs whether dialogue systems are present, muted, or active.
3. **DIALOGUE observes Game State:** The dialogue and fourth-wall subsystems act strictly as read-only observers of simulation events (e.g., listening to `CreatureDamaged`, `NearDeathExperience`, `BlunderDetected`, `OffspringBorn`). They do not mutate game state.

---

## 2. Domain Breakdown

### 2.1 DATA
- **Responsibility:** Static configuration, species schemas, genetic allele libraries, environmental thresholds, item profiles, and localization keys.
- **Form:** Structured files (JSON/YAML or Godot Resources) located in `/data`.
- **Dependencies:** None.

### 2.2 CORE
- **Responsibility:** Deterministic pseudo-random number generation (seeded PRNG), simulation ticks, global event bus, math primitives, and system clocks.
- **Dependencies:** DATA.

### 2.3 CREATURE
- **Responsibility:** Aggregate creature identity, biological lifecycle stage (egg, larva/nymph, adult, elder), health/vitality status, and entity lifecycle.
- **Dependencies:** CORE, DATA.

### 2.4 GENETICS
- **Responsibility:** Genome representation, chromosome pairs, allele segregation, genetic crossover, mutation rates, and inheritance calculation.
- **Dependencies:** CORE, DATA.

### 2.5 PHENOTYPE
- **Responsibility:** Translation of expressed genetic alleles into concrete biological attributes: morphological scales, anatomical features, base stats (speed, defense, venom, vision).
- **Dependencies:** GENETICS, DATA.

### 2.6 EVOLUTION
- **Responsibility:** Tracking lineage generational history, speciation thresholds, adaptation metrics, and deep-time phylogenetic tree recording.
- **Dependencies:** GENETICS, PHENOTYPE, CREATURE.

### 2.7 WORLD
- **Responsibility:** Spatial map representation, micro-habitats, obstacles, terrain passability, foraging nodes, and shelter locations.
- **Dependencies:** CORE, DATA.

### 2.8 ECOSYSTEM
- **Responsibility:** Population dynamics, predator-prey food chains, seasonal shifts, local resource regeneration, and environmental carrying capacity.
- **Dependencies:** WORLD, CREATURE, CORE.

### 2.9 SURVIVAL
- **Responsibility:** Immediate metabolic simulation: hunger, hydration, body temperature, stamina, oxygen, toxins, and environmental hazards.
- **Dependencies:** CREATURE, PHENOTYPE, WORLD.

### 2.10 COMBAT
- **Responsibility:** Resolution of physical predation, defense clashes, venom injection, territorial disputes, and retreat mechanics.
- **Dependencies:** CREATURE, PHENOTYPE, SURVIVAL, CORE.

### 2.11 DIALOGUE
- **Responsibility:** Delivery of spoken lines, text rendering, localized text feeds, and procedural line selection.
- **Dependencies:** CORE (Event Bus).

### 2.12 FOURTH-WALL
- **Responsibility:** Monitoring player inputs, repeated mistakes, session length, and death streaks; injecting protagonist self-awareness commentary into the DIALOGUE layer.
- **Dependencies:** DIALOGUE, CREATURE, CORE (Event Bus).

### 2.13 SAVE/LOAD
- **Responsibility:** Serialization and deserialization of the lineage tree, active creature genome, world state, and player progression without data corruption.
- **Dependencies:** CREATURE, GENETICS, EVOLUTION, WORLD.

### 2.14 ASSETS
- **Responsibility:** Storage and organization of textures, models, spritesheets, fonts, and materials under `/assets`.
- **Dependencies:** Engine asset pipeline.

### 2.15 AUDIO
- **Responsibility:** Ambient soundscape playback, creature sound effects (foley, chirps, clicks), dynamic musical scoring, and audio bus management under `/audio`.
- **Dependencies:** CORE (Event Bus).

### 2.16 UI
- **Responsibility:** HUD, metabolic gauges, lineage tree inspector, genome viewer, settings menus, and dialogue boxes.
- **Dependencies:** PRESENTATION, CREATURE (Read-only), GENETICS (Read-only).

### 2.17 QA
- **Responsibility:** Automated regression tests, deterministic replay validation, headless simulation stress tests, and balance verification tools under `/tools`.
- **Dependencies:** All simulation domains.
