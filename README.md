# LinhSinhVN

A Vietnamese creature evolution RPG focused on genetics, survival, exploration and emergent evolution.

**Status:** PHASE 0 — FOUNDATION

---

## 1. Overview

**LinhSinhVN** is a 2D RPG / life-simulation / evolution game set in the rich ecological landscapes of Vietnam. In LinhSinhVN, the player **is the creature**—not a human trainer commanding monsters. Through survival, exploration, metabolic development, breeding, genetic recombination, and mutation, players cultivate a resilient, player-driven biological lineage across generations.

The game is deeply grounded in Vietnamese biodiversity—spotlighting native insects, arachnids, and small animals—infused with sharp fourth-wall self-awareness and contemporary Vietnamese Gen-Z humor.

---

## 2. Project Pillars

1. **Vietnamese Biodiversity:** Celebrating indigenous fauna, flora, and micro-ecosystems of Vietnam.
2. **Genetics & Deterministic Inheritance:** Biological traits driven by an underlying genome, alleles, and expression rules.
3. **Emergent Evolution:** Adaptation arises naturally through generational pressure and mutation rather than scripted, linear branches.
4. **Creature-as-Player:** Embodying the organism directly, experiencing survival from its sensory scale.
5. **Ecosystem Survival:** Dynamic predator-prey dynamics, environmental hazards, and foraging competition.
6. **Fourth-Wall Humor:** A self-aware creature conscious of being played within a computer program.
7. **Vietnamese Gen-Z Comedy:** Chaotic, satirical, and culturally nuanced humor.
8. **Player-Created Lineage:** Every run leaves a permanent genetic footprint across a generational family tree.

---

## 3. Development Philosophy

- **Deterministic Core Simulation:** Simulation outcomes (genetics, combat math, survival checks, mutations) must remain reproducible from seed and state.
- **AI as Enhancer, Not Arbiter:** Generative models and AI assist with narrative, dialogue generation, and tooling; they do not dictate core simulation state.
- **Data-Driven Architecture:** Species parameters, genetic tables, traits, and encounters live in structured data formats decoupled from engine code.
- **Loop Before Scale:** The core biological and survival loop must be proven engaging before generating large volumes of assets or species.
- **Non-Derivative Identity:** LinhSinhVN is strictly not a Pokémon clone, generic monster battler, fantasy RPG, or pet simulator.

---

## 4. Directory Structure

```
LinhSinhVN/
├── .agents/          # Antigravity agent workflows and custom skills
│   ├── agents/
│   └── skills/
├── docs/             # Architecture, design rules, vision, and project tracking
├── game/             # Game engine source files and scripts
├── data/             # Data-driven definitions (JSON / YAML / Resources)
│   ├── species/      # Species profiles and biological parameters
│   ├── genetics/     # Genome schemas, allele libraries, mutation rates
│   ├── abilities/    # Trait expressions and functional abilities
│   ├── evolution/    # Evolutionary milestones and adaptation thresholds
│   ├── habitats/     # Micro-climate, biome, and ecosystem tables
│   └── encounters/   # Ecological encounter matrices and events
├── assets/           # Visual assets
│   ├── creatures/    # Sprites, animations, phenotype layers
│   ├── environments/ # Tilesets, backgrounds, foliage
│   ├── props/        # Interactive objects, food sources, debris
│   ├── ui/           # User interface textures, fonts, icons
│   └── fx/           # Visual effects and particle systems
├── audio/            # Audio assets
│   ├── music/        # Ambient scores and dynamic music stems
│   ├── ambience/     # Environmental background soundscapes
│   └── sfx/          # Action, creature vocalization, UI audio
├── tools/            # Build pipelines, validation scripts, data converters
└── README.md
```

---

## 5. Technology Direction

- **Target Engine:** Godot Engine (Evaluated for 2D node hierarchy, deterministic data handling, and lightweight packaging).
- **Core Architecture:** Decoupled Data -> Simulation -> Presentation layers.
- **Data Format:** Structured human-readable data (JSON / Godot Resource files).
- **Platform Focus:** Desktop PC initially (Windows/Linux/macOS), keeping input paradigms compatible with eventual portable platforms.
