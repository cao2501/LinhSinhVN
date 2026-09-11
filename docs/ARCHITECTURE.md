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
- **Responsibility:** Static configuration, species profiles, genetic loci registries, lifecycle stage definitions, environmental thresholds, and localization keys.
- **Form:** Structured files (JSON/YAML) located under `/data`.
- **Dependencies:** None.

### 2.2 CORE
- **Responsibility:** Deterministic pseudo-random number generation (seeded PRNG), simulation ticks, canonical event stream bus, math primitives, and system clocks.
- **Dependencies:** DATA.

### 2.3 GENETICS
- **Responsibility:** Headless genome representation, diploid chromosome pairs, allele segregation, independent assortment, and bounded mutation.
- **Dependencies:** CORE, DATA.
- **Boundary Invariant:** GENETICS has ZERO dependency on development, survival, environment, presentation, or UI. The genome is strictly immutable across an organism's lifespan.

### 2.4 CREATURE / LIFE CYCLE
- **Responsibility:** Aggregate creature identity, generic lifecycle stage state machine (e.g., Egg, Larva, Pupa, Adult), substages/instars, molting/ecdysis resolution, chronological aging, and terminal mortality.
- **Dependencies:** CORE, DATA.

### 2.5 DEVELOPMENT
- **Responsibility:** Tracking larval developmental plasticity, nutritional deficit accumulation, compensatory recovery, and the Developmental Realization Factor ($\eta \in [0.60, 1.00]$). Manages the irreversible morphological locking event at metamorphosis.
- **Dependencies:** CREATURE / LIFE CYCLE, CORE, DATA.

### 2.6 PHENOTYPE
- **Responsibility:** Pure function translation of expressed genetic alleles combined with the locked developmental realization factor ($\eta_{\text{locked}}$) into realized adult anatomical scales (body scale, mass, horns, claws) and base derived gameplay stats.
- **Dependencies:** GENETICS, DEVELOPMENT, DATA.

### 2.7 SURVIVAL / PHYSIOLOGY
- **Responsibility:** Tick-by-tick metabolic simulation: dynamic stored energy, biomass catabolism, hydration, thermal regulation, acute/chronic stress accumulation, starvation state machine, and physiological senescence modifiers (`senescence_metabolic_modifier`).
- **Dependencies:** CREATURE / LIFE CYCLE, PHENOTYPE, CORE, DATA.

### 2.8 ENVIRONMENT
- **Responsibility:** Deterministic per-tick environment snapshots (`EnvironmentState`): ambient temperature, humidity, substrate quality, food density, and crowding index.
- **Dependencies:** CORE, DATA.

### 2.9 EVENT STREAM
- **Responsibility:** Strict, ordered append-only sequence of immutable simulation events emitted by the Life Cycle and Survival engines.
- **Dependencies:** CORE.
- **Boundary Invariant:** The event stream is consumed by presentation, UI, dialogue, and fourth-wall subsystems strictly as passive, read-only observers.

### 2.10 EVOLUTION
- **Responsibility:** Tracking lineage generational history, speciation thresholds, adaptation metrics, and deep-time phylogenetic tree recording.
- **Dependencies:** GENETICS, PHENOTYPE, CREATURE / LIFE CYCLE.

### 2.11 WORLD
- **Responsibility:** Spatial map representation, micro-habitats, obstacles, terrain passability, foraging nodes, and shelter locations.
- **Dependencies:** CORE, DATA.

### 2.12 ECOSYSTEM
- **Responsibility:** Population dynamics, predator-prey food chains, seasonal shifts, local resource regeneration, and environmental carrying capacity.
- **Dependencies:** WORLD, CREATURE / LIFE CYCLE, CORE.

### 2.13 COMBAT
- **Responsibility:** Resolution of physical predation, defense clashes, horn prying leverage, traction slip, and retreat mechanics.
- **Dependencies:** CREATURE / LIFE CYCLE, PHENOTYPE, SURVIVAL / PHYSIOLOGY, CORE.

### 2.14 DIALOGUE
- **Responsibility:** Delivery of spoken lines, text rendering, localized text feeds, and procedural line selection.
- **Dependencies:** EVENT STREAM (Read-only).

### 2.15 FOURTH-WALL
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
