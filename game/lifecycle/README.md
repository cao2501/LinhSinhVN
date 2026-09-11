# LinhSinhVN — Life Cycle Simulation Runtime

**Domain:** `CREATURE / LIFE CYCLE / SURVIVAL`  
**Status:** HEADLESS DETERMINISTIC RUNTIME FOUNDATION  

---

## 1. Overview & Responsibility
The `game/lifecycle` package implements the authoritative, generic, deterministic life-cycle simulation runtime for LinhSinhVN. It executes an organism's survival, feeding, metabolic expenditure, multi-factorial stress, somatic growth, molting transitions, senescence, and developmental realization ($\eta \in [0.60, 1.00]$).

### Architectural Invariant
The runtime is **completely species-agnostic**. It contains **zero** hardcoded species branches (`no if (species_id === ...)`). All lifecycle stages, substages, transition thresholds, consumable diets, and environmental tolerance bands are injected purely as data via validated **Species Profiles** ([`data/species/schema/species_profile.schema.json`](file:///d:/LinhSinhVN/data/species/schema/species_profile.schema.json)).

---

## 2. Canonical 12-Step Tick Pipeline
Every simulation tick executes in this exact sequential order:
```
 1. INPUT_INGESTION                     (Read tick input: deltaTime, environment, resources)
 2. ENVIRONMENT_SNAPSHOT_RECORDING      (Capture immutable environment snapshot on state)
 3. RESOURCE_INTAKE_AND_ASSIMILATION    (Consume available diet; assimilate energy, biomass, hydration)
 4. METABOLIC_EXPENDITURE               (Apply basal metabolic drain; trigger starvation if energy = 0)
 5. STRESS_ACCUMULATION_AND_RECOVERY    (Update thermal, desiccation, nutritional, crowding stress)
 6. DEVELOPMENT_TRAJECTORY_EVALUATION   (Compute developmental progress and deficit gradient)
 7. ETA_UPDATE                          (If !eta_locked, update eta_current and track eta_min_reached)
 8. BIOMASS_GROWTH_EVALUATION           (If in growth-enabled stage, allocate surplus biomass)
 9. LIFECYCLE_TRANSITION_CHECK          (Check substage molt or stage transition; lock eta if configured)
10. SURVIVAL_AND_DEATH_EVALUATION      (Evaluate lethal thresholds; seal terminal death_record if dead)
11. DETERMINISTIC_EVENT_EMISSION       (Emit accumulated events with Hash64 deterministic IDs)
12. STATE_SNAPSHOT_SERIALIZATION       (Produce pure JSON-serializable snapshot conforming to schema)
```

---

## 3. State Ownership & Invariant Boundaries
The `OrganismState` holds only state owned by the lifecycle, development, and survival subsystems:
- **Owned State:** `chronological_age_ticks`, `stage_age_ticks`, `current_stage_id`, `current_substage_id`, `developmental_state` ($\eta$), `nutrition_state`, `stress_state`, `environment_state`, `senescence_metabolic_modifier`, `death_record`.
- **Excluded State:** Combat HP and active combat stamina are strictly excluded and belong to future combat runtimes.
- **Immutable Inputs:** `genome`, `phenotype`, `derived_stats`, and `speciesProfile` are treated as frozen, read-only reference data.

---

## 4. Deterministic Randomness & Event Hash Contract
- Zero usage of `Math.random()` or `Date.now()`.
- Event IDs are derived deterministically:
  $$\text{EventId} = \text{Hash64}(\text{simulation\_seed} \,\|\, \text{organism\_id} \,\|\, \text{simulation\_tick} \,\|\, \text{event\_domain})$$
- Deterministic event ordering within a tick is tracked via `deterministic_order_index`.
- Two independent runs initialized with identical state, seed, and input sequences produce bit-for-bit identical state snapshots and event logs.
