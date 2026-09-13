# LinhSinhVN — Population Registry & Simulation World Specification

**Task Checkpoint:** TASK 06-A
**Module Location:** `game/population/`
**Status:** SPECIFICATION + DETERMINISTIC RUNTIME FOUNDATION

---

## 1. Overview & Architectural Boundaries

`SimulationWorld` and `PopulationRegistry` constitute the top-level container and coordinator for large-scale multi-organism simulations. This layer introduces headless population management capable of holding hundreds to thousands of organisms deterministically without wall-clock dependencies, rendering, or premature ecological coupling.

```
SimulationWorld
    │
    ├── SimulationClock (explicit, discrete tick advancement; records deltaTime)
    │
    ├── EnvironmentState (defensively owned; canonical representation; boundary converter)
    │
    ├── PopulationRegistry (headless container: records are source of truth; derived counts; DEATH != REMOVE)
    │       │
    │       └── Organism State Records (Lifecycle + Genetics + Lineage references)
    │
    └── Deterministic Seed Derivations (SimulationSeed -> PopulationTickSeed via Hash64)
```

### System Decoupling & Responsibility Split

| Subsystem | Sole Authority / Responsibilities | Forbidden in Population Layer |
| :--- | :--- | :--- |
| **Genetics Engine** (`game/genetics/`) | Alleles, recombination, mutation, expression, derived stats | Do NOT duplicate genetic formulas or mutate genomes |
| **Lifecycle Engine** (`game/lifecycle/`) | Nutrition, metabolism, growth, stress, development ($\eta$), molting, death | Do NOT calculate or mutate metabolic/developmental state in registry |
| **Reproduction Runtime** (`game/reproduction/`) | Breeding eligibility, mating transactions, child creation, lineage | Do NOT trigger automatic reproduction loops in registry |
| **Population Registry** (`game/population/`) | Organism storage, ID uniqueness, derived counts, canonical iteration & snapshot | Pure container; zero biological calculations |
| **Simulation World** (`game/population/`) | Coordinates clock, environment, population registry, seeds, and snapshots | advanceTick() in TASK 06-A advances clock ONLY |

---

## 2. Population Registry Responsibilities

`PopulationRegistry` is a headless, deterministic container for organisms of a single species.

### Core Guarantees:
1. **Organism Records as Single Source of Truth**:
   The internal map of organism records (`Map<string, object>`) is the authoritative source of truth.
2. **Derived Population Counts**:
   `countLiving()`, `countDead()`, and `size` / `totalCount` are derived directly from the active organism collection. No independent mutable counter variables serve as authoritative state.
3. **Death Is Not Removal (`DEATH != REMOVE`)**:
   When an organism dies (`is_alive = false`, `status = 'DEAD'`), it **remains** in `PopulationRegistry`. Deceased organisms and their `death_record` are preserved for death history, pedigree tracking, lineage analysis, replay verification, and mortality statistics. Organisms are only removed via explicit administrative `removeOrganism(id)`.
4. **Duplicate ID Rejection**:
   Attempting to add an organism whose `organism_id` already exists throws an explicit Error.
5. **Species Identity Enforcement**:
   Adding an organism with a mismatched `species_id` throws an explicit Error.

---

## 3. Deterministic Canonical Ordering

To guarantee bit-for-bit replay determinism and prevent insertion-order variance, all organism lists, iterators, and serialized snapshots enforce canonical lexicographical ordering:

$$\text{Sort Key} = \text{organism\_id ascending (UTF-16 code units)}$$

- `registry.listOrganisms()`: returns organisms sorted by `organism_id` ascending.
- `registry[Symbol.iterator]()`: yields organisms sorted by `organism_id` ascending.
- `registry.snapshot()`: serializes `organisms` sorted by `organism_id` ascending.

Two registries with identical organisms inserted in different orders (e.g. $C \to A \to B$ vs $B \to C \to A$) yield byte-for-byte identical snapshots.

---

## 4. Simulation Clock

`SimulationClock` provides discrete, explicit tick advancement:
- Initialized with a deterministic non-negative integer `initial_tick` (default 0).
- Explicit advancement: `clock.advance(deltaTime)`.
- Validates `deltaTime`: must be a positive finite number ($> 0$). Invalid inputs (zero, negative, NaN, non-number) are rejected with `TypeError`.
- **Discrete increment invariant**: every call to `advance(deltaTime)` increments `simulation_tick` by exactly $+1$. `deltaTime` is recorded for input context reproduction but does **not** scale the number of ticks advanced.
- **Zero wall-clock time**: no access to `Date.now()`, `performance.now()`, or real-world timers.

---

## 5. Canonical Environment State Foundation

### Canonical Representation
To avoid ambiguity, internal environment state strictly maintains a single canonical representation:

| Canonical Field | Type & Range | Description |
| :--- | :--- | :--- |
| `temperature` | `number` [-20.0, 60.0] | Ambient temperature in Celsius |
| `humidity` | `number` [0.0, 1.0] | Atmospheric relative humidity |
| `food_resource` | `number` [0.0, 1.0] | Spatial availability of edible food |
| `hazard_rating` | `number` [0.0, 1.0] | Environmental toxins, mold, or drowning hazard |
| `substrate_moisture` | `number` [0.0, 1.0] | Moisture content of soil or decaying wood |
| `substrate_organic_richness` | `number` [0.0, 1.0] | Organic/fungal nutritional richness |
| `shelter_security_factor` | `number` [0.0, 1.0] | Physical shelter from predation |
| `population_crowding_index` | `number` [0.0, 1.0] | Conspecific interference and density |
| `time_of_day` | `enum` `['DAWN', 'DAY', 'DUSK', 'NIGHT']` | Diurnal cycle phase |
| `season` | `enum` `['DRY', 'MONSOON', 'SPRING', 'SUMMER', 'AUTUMN', 'WINTER']` | Macro-seasonal cycle phase |

### Defensive Ownership Boundary
`SimulationWorld` owns its environment state:
- `setEnvironment(input)` validates and deep-freezes a defensive copy. Modifying the caller's input object after calling `setEnvironment()` has zero effect on world state.
- `getEnvironment()` returns a deep-frozen reference.

### Lifecycle Boundary Converter
Conversion to existing lifecycle field names (`ambient_temperature_celsius`, `food_density`, etc.) occurs solely at the boundary via `toLifecycleEnvironment(env)`.

---

## 6. Seed Contract & Deterministic Derivation

Master simulation seeds are immutable 64-bit hexadecimal strings (`0x...`).

### Population Tick Seed Derivation
For any simulation tick $T$, the deterministic seed for population-level operations is derived via the project's canonical SHA-256 Hash64:

$$\text{PopulationTickSeed} = \text{Hash64}(\text{SimulationSeed} \mid \text{PopulationId} \mid \text{SimulationTick})$$

This contract guarantees that:
- Two simulations with identical seeds, population IDs, and ticks generate identical tick seeds.
- Advancing ticks produces unique, uncorrelated pseudo-random streams for future population dynamics.
- Zero reliance on `Math.random()`, `crypto.randomUUID()`, or system entropy.

---

## 7. Serialization Contract

World snapshots conform to `data/population/schema/simulation_world.schema.json`:

```json
{
  "schema_version": "1.0.0",
  "simulation_seed": "0x024aa8a38b63e1b2",
  "simulation_tick": 1,
  "last_delta_time": 1.0,
  "population_tick_seed": "0x3f7a8b1c90e241d6",
  "environment": {
    "schema_version": "1.0.0",
    "temperature": 25.0,
    "humidity": 0.75,
    "food_resource": 0.50,
    "hazard_rating": 0.0,
    "substrate_moisture": 0.65,
    "substrate_organic_richness": 0.80,
    "shelter_security_factor": 0.80,
    "population_crowding_index": 0.10,
    "time_of_day": "DAY",
    "season": "DRY"
  },
  "population": {
    "schema_version": "1.0.0",
    "population_id": "pop_xylotrupes_01",
    "species_id": "xylotrupes_rhinoceros_proto",
    "simulation_seed": "0x024aa8a38b63e1b2",
    "living_count": 2,
    "dead_count": 1,
    "total_count": 3,
    "organisms": [
      { "organism_id": "org_01", "is_alive": true, "status": "ALIVE" },
      { "organism_id": "org_02", "is_alive": false, "status": "DEAD" },
      { "organism_id": "org_03", "is_alive": true, "status": "ALIVE" }
    ]
  }
}
```

---

## 8. Current Scope & Explicit Limitations (TASK 06-A)

TASK 06-A establishes strictly the **foundation and container**:
- **NO** feeding competition or resource depletion
- **NO** dynamic environmental mutation or seasonal transitions
- **NO** automatic reproduction or mating loops
- **NO** predator-prey or disease interactions
- **NO** spatial partitioning, grid, or quadtree structures
- **NO** UI, Godot scripts, or audio
- **Zero Biology in `advanceTick()`**: Calling `world.advanceTick(deltaTime)` advances only `SimulationClock`.

---

## 9. Future Integration Points (TASK 06-B+)

In subsequent tasks:
1. **Population Tick Pipeline**: Iterating active organisms and dispatching `LifecycleRuntime.tick()` with canonical environmental inputs.
2. **Resource Competition**: Partitioning available food among competing organisms based on developmental stage and motility.
3. **Population Breeding Scheduler**: Querying adult organisms for reproductive eligibility and committing reproduction transactions.
4. **Mortality Pruning Policy**: Explicit administrative archival of dead records when population caps are reached.

---

## 10. Resource Allocation Model — TASK 06-B-01

TASK 06-B-01 introduces the deterministic resource pool and allocation contract required before multi-organism lifecycle ticking.

### Shared Resource Pool Concept
A population cannot allow every organism to consume unbounded food from the environment. `ResourcePool` holds a finite non-negative quantity of food/resource available for consumption during a tick.

```
EnvironmentState.food_resource
    │ (read-only input; environment depletion policy deferred)
    ▼
ResourcePool (finite non-negative resource container)
    │
    ├── Organism Demands: [{ organism_id, requested_amount }]
    │
    ▼
allocateResourceDemands(availableResource, demands)
    │
    ├── 1. Validate demands & reject duplicate organism_ids
    ├── 2. Sort demands strictly by organism_id ascending
    ├── 3. Sequential allocate: min(requested, remaining)
    │
    ▼
AllocationResult (Immutable, deterministic, fully traceable)
```

### Demand Contract & Responsibility Decoupling
- Organism resource demand is represented as `{ organism_id, requested_amount }`.
- The allocator does **not** invent or calculate nutrition formulas. Determining what an organism needs remains the responsibility of the Lifecycle/Species biology system.
- In TASK 06-B-01, demand amounts are explicitly provided by the caller/test coordinator. Future task TASK 06-B-02 will connect lifecycle intake calculations to demand generation.

### Canonical ID Order + Sequential Allocation Policy
To ensure 100% deterministic, replayable, and insertion-order invariant results:
1. Validate demands array and reject duplicate `organism_id` entries with an explicit error.
2. Sort demands strictly by `organism_id` ascending lexicographically (UTF-16 code units).
3. Process each demand sequentially:
   $$\text{allocated\_amount} = \min(\text{requested\_amount}, \text{remaining\_resource})$$
   $$\text{unmet\_amount} = \text{requested\_amount} - \text{allocated\_amount}$$
   $$\text{remaining\_resource} \leftarrow \text{remaining\_resource} - \text{allocated\_amount}$$
4. If resources are exhausted, remaining demands receive `allocated_amount = 0` and `unmet_amount = requested_amount`.

### Fairness Limitation & Future Extension
- Canonical ID ordering is intentionally simple, replayable, and free of floating-point jitter or tie-breaker ambiguity.
- It is **not** claimed to be biologically realistic; it serves as the initial deterministic foundation.
- Future tasks may replace or weight this allocation policy with:
  - Body size / biomass weighting
  - Starvation / hunger priority
  - Motility and developmental stage priority
  - Spatial proximity and foraging traits

### Ownership Boundaries & Environment Non-Mutation
- **Demand Immutability**: Input demand objects are never mutated.
- **State Protection**: Organism records, lifecycle state, genetics, and environment state are untouched.
- **Environment Boundary**: `EnvironmentState.food_resource` is **not** mutated during allocation. The decision of how and when consumed resources permanently deplete the environment is a population ecology policy deferred to subsequent tasks.
- **API Safety**: `allocateResourceDemands()` is the pure single source of truth. `ResourcePool.allocateDemands()` invokes this function and updates pool state exactly once.
- **Zero Biology in TASK 06-B-01**: This task establishes the allocation contract only; it does **not** execute organism lifecycle ticks.

---

## 11. Biological Tick Coordinator (TASK 06-B-02)

### 11.1 Purpose and Architectural Boundaries
The Population Biological Tick Coordinator (`executePopulationBiologicalTick`) serves as the deterministic orchestrator executing biological progression for all registered organisms within a `SimulationWorld`.

It strictly adheres to the following boundaries:
- **No Reproduction**: Child creation, mating, clutch generation, and egg deposition are strictly out of scope and deferred to TASK 06-B-03.
- **Pure Allocation Execution**: Computes resource allocations purely before committing, ensuring total transaction rollback on any biological evaluation failure.
- **Dead Organism Semantics**: Dead organisms (`current_stage === 'DEAD'`) remain registered in `PopulationRegistry`, generate zero demand, consume zero resources, execute no ticks, and emit no events.
- **Data-Driven Intake**: Organism feeding demand is derived exclusively from `speciesProfile.nutrition_profile.base_intake_capacity_per_tick * deltaTime`. No hardcoded fallback constant exists in the coordinator.
- **Explicit Species Inversion**: The `SimulationWorld` remains generic; species profiles are passed explicitly via tick options or organism profile mapping.

### 11.2 Five-Phase Execution Pipeline
Every biological tick progresses through five atomic, sequential phases:

```
PHASE A: Snapshot / Preflight
  │ Validate deltaTime, options, clock, and species profiles.
  │ Snapshot EnvironmentState into LifecycleEnvironment.
  │ Retrieve active organisms sorted lexicographically by organism_id.
  ▼
PHASE B: Demand Generation
  │ For each organism, query lifecycle state and stage.
  │ If DEAD or non-feeding stage or empty diet: demand = 0.
  │ Else: demand = base_intake_capacity_per_tick * deltaTime.
  ▼
PHASE C: Pure Resource Allocation
  │ Resolve resource pool from options.resource_pool or world.getResourcePool().
  │ Execute allocateResourceDemands(availableResource, demands).
  │ Allocation is strictly pure; resource pool is not mutated here.
  ▼
PHASE D: Isolated Biological Evaluation
  │ Deep copy organism state to guarantee same-tick isolation.
  │ Call LifecycleRuntime.tick(orgCopy, lifecycleEnv, deltaTime, { food_intake_amount }).
  │ Collect evaluated candidate states and emitted lifecycle events.
  ▼
PHASE E: Validation + Atomic Commit
  │ Validate all candidate states. If any evaluation fails, abort tick:
  │   - World / Organisms remain untouched
  │   - ResourcePool remains untouched
  │   - SimulationClock remains untouched
  │ If valid:
  │   - Commit candidate states to PopulationRegistry
  │   - Commit allocation to ResourcePool exactly once (commitAllocation)
  │   - Advance SimulationClock exactly once
  │   - Return PopulationTickResult
```

### 11.3 Determinism and Failure Atomicity
- **Replay Determinism**: Canonical lexicographical sorting by `organism_id` guarantees identical allocation and evaluation results across repeated runs from identical initial state.
- **Isolation**: Organisms evaluated in Phase D cannot read or write the state of other organisms within the same tick.
- **Zero Double-Subtraction**: The `ResourcePool` is mutated exclusively during Phase E using `ResourcePool.commitAllocation(allocationResult)`.
