# LinhSinhVN — Life Cycle Simulation Engine Specification

**Document Version:** 1.0.0  
**Phase:** Phase 0 — Foundation / System Design  
**Domain:** CREATURE / LIFE CYCLE / SURVIVAL  
**Status:** ARCHITECTURALLY LOCKED SPECIFICATION  

---

## 1. Architectural Philosophy & Separation of Concerns

The Life Cycle Engine models the temporal existence, physiological survival, and developmental progression of an individual organism. It enforces a strict separation between the organism's immutable genetic heritage, its plastic developmental realization, and its dynamic, real-time physiological status:

```
┌─────────────────────────────────────────────────────────────┐
│                 GENOME (Diploid Allele Pairs)               │
│                 (Immutable across lifespan)                 │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                  GENE EXPRESSION & POTENTIAL                │
│                 (Pure function of genotypes)                │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│             DEVELOPMENTAL REALIZATION FACTOR (η)            │
│  (Malleable during larval plasticity; locked at pupation)   │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                   REALIZED ADULT PHENOTYPE                  │
│       (Fixed morphology: body scale, mass, horns, claws)    │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                      BASE DERIVED STATS                     │
│    (max_hp, clash_power, crawl_speed, starvation_endurance) │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 CURRENT PHYSIOLOGICAL STATE                 │
│ (Dynamic: stored energy, hydration, acute stress, stamina)  │
└─────────────────────────────────────────────────────────────┘
```

### Core Invariants
1. **Genome Immutability:** Environmental conditions, nutritional abundance or starvation, temperature shocks, injuries, and molting events **never mutate the underlying genome**.
2. **Generic Engine vs. Species Profile:** The Life Cycle Engine is stage-agnostic and substage-agnostic. It does **not** hardcode beetle-specific instars (`L1/L2/L3`). All developmental stage topologies, durations, thresholds, and consumption rates are supplied via data-driven Species Profiles.
3. **Deterministic Execution:** Given identical initial state snapshots, inputs, and simulation seeds, the engine produces bit-for-bit identical physiological states and lifecycle trajectories.
4. **Observer Decoupling:** The simulation emits read-only, immutable events to an event stream. Presentation, UI, dialogue, and fourth-wall commentary subscribe to this stream as passive observers with zero ability to mutate authoritative simulation state.

---

## 2. Generic Lifecycle State Machine

### 2.1 Stage & Substage Abstraction
A species' life cycle is defined as a directed sequence of discrete stages, each capable of housing hierarchical substages.

```
Stage Definition Structure:
  stage_id: string                 (e.g., "EGG", "LARVA", "PUPA", "ADULT")
  is_feeding_stage: boolean        (whether active ingestion occurs)
  is_motile_stage: boolean         (whether autonomous movement/foraging occurs)
  substages: list[SubstageDef]     (optional: e.g., ["L1", "L2", "L3"])
  prerequisites: StagePrereqs      (accumulated biomass, stage age, environmental triggers)
  transition_cost: ResourceCost    (energy and hydration required to execute transition)
  risk_profile: RiskProfile        (failure conditions, shock vulnerabilities)
```

### 2.2 Species Configuration Mapping: `xylotrupes_rhinoceros_proto`
The vertical slice prototype maps this generic engine to the rhinoceros beetle life cycle (*Xylotrupes gideon* complex). 

> [!NOTE]
> All numerical values listed below are **GAMEPLAY MODEL / PROTOTYPE CONSTANTS** and represent simulated balance benchmarks rather than verified entomological absolutes.

```
┌─────────────────┬───────────┬────────────┬─────────────────────────────┬───────────────────────────┐
│ Stage ID        │ Feeding?  │ Motile?    │ Substages (Instars)         │ Primary Physiological Role│
├─────────────────┼───────────┼────────────┼─────────────────────────────┼───────────────────────────┤
│ STAGE_EGG       │ False     │ False      │ None                        │ Embryogenesis & Yolk Res. │
│ STAGE_LARVA     │ True      │ True (Slow)│ INSTAR_1, INSTAR_2, INSTAR_3│ Biomass Accumulation & η  │
│ STAGE_PUPA      │ False     │ False      │ None                        │ Metamorphic Remodeling    │
│ STAGE_ADULT     │ True      │ True (Fast)│ None                        │ Dispersal & Reproduction  │
└─────────────────┴───────────┴────────────┴─────────────────────────────┴───────────────────────────┘
```

#### Detailed Stage Profiles (Prototype Gameplay Constants):

1. **`STAGE_EGG` (Embryonic Incubation)**
   - **Entry Condition:** Successful fertilization and oviposition.
   - **Metabolic Engine:** Non-feeding. Relies entirely on maternal initial yolk energy endowment ($E_{\text{egg}} = 100.0\text{ EU}$).
   - **Duration Model:** Thermal sum requirement ($\text{ThermalUnits} \ge 250.0$).
   - **Risk/Failure:** Severe desiccation (ambient moisture $< 0.20$) or temperature extremes ($T < 15^\circ\text{C}$ or $T > 38^\circ\text{C}$) triggers embryonic mortality.
   - **Transition:** Hatching event upon thermal completion $\rightarrow$ transitions to `STAGE_LARVA` (`INSTAR_1`).

2. **`STAGE_LARVA` (Somatic Growth & Primary Plasticity Window)**
   - **Entry Condition:** Eclosion from egg.
   - **Substages:** Configured with 3 sequential instars (`INSTAR_1`, `INSTAR_2`, `INSTAR_3`).
   - **Metabolic Engine:** High active ingestion of decomposing organic substrate/humus.
   - **Developmental Window:** **This is the primary window governing the Developmental Realization Factor ($\eta$).** Prolonged nutritional deficits or thermal stress depress $\eta$.
   - **Substage Transition (Molting / Ecdysis):** Each instar boundary requires accumulating a minimum biomass index and passing a quiescent apolysis phase.
   - **Transition to Pupa:** Upon reaching mature L3 biomass ($B \ge 1.0$) and clearing wandering gut-purge stage $\rightarrow$ constructs pupal chamber $\rightarrow$ transitions to `STAGE_PUPA`.

3. **`STAGE_PUPA` (Histolysis, Histogenesis & Morphological Locking)**
   - **Entry Condition:** Successful construction of pupal cell and completion of prepupal phase.
   - **Metabolic Engine:** Complete non-feeding. Basal metabolic maintenance drawn strictly from larval energy stores.
   - **Morphological Locking Event:** **Upon transition entry, $\eta$ is irrevocably locked.** Morphological body scale, horn allometry, and cuticle potential become immutable.
   - **Risk/Failure:** Physical disruption, parasite invasion, or energy exhaustion prior to eclosion results in lethal pupal failure (`DEVELOPMENTAL_FAILURE`).
   - **Transition:** Completion of metamorphic duration $\rightarrow$ adult emergence (eclosion).

4. **`STAGE_ADULT` (Imago — Dispersal, Combat & Reproduction)**
   - **Entry Condition:** Successful eclosion and cuticle hardening (teneral period).
   - **Metabolic Engine:** Active carbohydrate feeding (tree sap, decaying fruit) to fuel flight and combat stamina.
   - **Somatic Status:** Body dimensions and horn dimensions are 100% fixed. Somatic growth is zero ($dB/dt = 0$).
   - **Senescence:** Progressive accumulation of physiological wear, elevating baseline metabolic upkeep and initiating terminal decline.

---

## 3. Nutrition & Assimilation Model

The nutrition model tracks the ingestion, digestion, and assimilation of external resources into somatic physiological reserves. It uses normalized gameplay abstractions rather than complex biochemical pathways.

### 3.1 Resource Categories
1. **`stored_energy` ($E_{\text{stored}}$):** High-turnover fuel currency. Utilized for basal metabolic maintenance, locomotion, combat, and molting.
2. **`structural_biomass` ($B_{\text{structural}}$):** Somatic tissue mass. Bounded by genetic potential. Accumulates during larval feeding; acts as emergency catabolic reserve during prolonged starvation.
3. **`hydration` ($H$):** Fluid balance index $\in [0.0, 1.0]$. Influences metabolic rate and molting success.
4. **`nutrition_quality` ($Q_{\text{food}}$):** Quality rating of ingested substrate $\in [0.0, 1.0]$. Higher quality accelerates biomass synthesis and protects $\eta$.

### 3.2 Assimilation Pipeline
For each simulation tick where the organism is in a feeding stage and food is available:

1. **Intake Determination:**
   $$\text{IntakeRate} = \min(\text{AvailableFood}, \text{MaxIngestionCapacity}) \times \text{ForagingActivity}$$
2. **Metabolic Digestion & Conversion (Gameplay Model Constants):**
   $$\Delta E_{\text{assimilated}} = \text{IntakeRate} \times Q_{\text{food}} \times K_{\text{energy\_yield}}$$
   $$\Delta B_{\text{synthesis}} = \text{IntakeRate} \times Q_{\text{food}} \times K_{\text{biomass\_yield}} \times [1.0 - \text{MaturityFraction}]$$
   *(Where $K_{\text{energy\_yield}} = 1.20$, $K_{\text{biomass\_yield}} = 0.80$)*
3. **Nutrient Deficit Tracking:**
   If $\text{IntakeRate} < \text{BasalFoodDemand}$, the organism incurs a nutritional deficit:
   $$\text{DeficitSeverity} = \frac{\text{BasalFoodDemand} - \text{IntakeRate}}{\text{BasalFoodDemand}} \in [0.0, 1.0]$$

---

## 4. Energy Budget & Starvation

### 4.1 Energy Accounting
Energy flows through an explicit budget equation evaluated every tick:
$$\Delta E = \Delta E_{\text{assimilated}} - E_{\text{basal}} - E_{\text{activity}} - E_{\text{growth}} - E_{\text{molt}}$$

```
┌───────────────────────────┐
│     Energy Inflow         │
│  (Assimilated Food/Yolk)  │
└─────────────┬─────────────┘
              ▼
┌───────────────────────────┐      ┌─────────────────────────────┐
│       stored_energy       │─────►│ Basal Metabolic Expenditure │
└─────────────┬─────────────┘      └─────────────────────────────┘
              │                    ┌─────────────────────────────┐
              ├───────────────────►│ Activity & Movement Cost    │
              │                    └─────────────────────────────┘
              │                    ┌─────────────────────────────┐
              ├───────────────────►│ Tissue Growth & Synthesis   │
              │                    └─────────────────────────────┘
              │                    ┌─────────────────────────────┐
              └───────────────────►│ Molting & Metamorphosis Cost│
                                   └─────────────────────────────┘
```

### 4.2 Basal Metabolic Expenditure Formula
Basal metabolic cost scales with mass, genetic metabolic efficiency, and environmental temperature:
$$E_{\text{basal}} = E_{\text{base\_rate}} \times \text{metabolic\_drain\_index} \times (\text{mass\_index})^{0.75} \times \phi(T) \times \psi_{\text{senescence}} \times \Delta t$$

- **`metabolic_drain_index`:** Genetic derived stat $\in [0.60, 1.40]$. High efficiency lowers baseline drain.
- **$\phi(T)$ (Thermal Multiplier — Gameplay Constant):**
  $$\phi(T) = Q_{10}^{\frac{T - 25.0}{10.0}} \quad (\text{with } Q_{10} = 2.0, \text{ clamped to } [0.40, 2.50])$$
- **$\psi_{\text{senescence}}$:** Current physiological modifier ($1.00 \to 1.50$ in elder adults).

### 4.3 Starvation Decoupling & Endurance Baseline
`starvation_endurance_time` is a **genetically derived reference capacity**, representing theoretical endurance under zero food intake. **It is NOT subtracted from energy every tick.**

#### Starvation Physiological State Machine:
1. **Normal State:** $E_{\text{stored}} > 0.0$. Basal and active needs met directly from stored energy.
2. **Acute Starvation State:** Entered when $E_{\text{stored}} = 0.0$.
   - The organism begins emergency catabolism of `structural_biomass`:
     $$\Delta B_{\text{catabolized}} = \frac{E_{\text{basal}}}{K_{\text{catabolic\_efficiency}}}$$
   - Starvation timer accumulates: $\tau_{\text{starve}} += \Delta t$.
   - Normalized starvation ratio:
     $$S_{\text{ratio}} = \frac{\tau_{\text{starve}}}{\text{starvation\_endurance\_time}}$$
3. **Starvation Consequences:**
   - If $S_{\text{ratio}} > 0.20$ during larval stages: severe downward drag on $\eta$ ($\Delta \eta_{\text{deficit}}$).
   - If $S_{\text{ratio}} \ge 1.00$ or structural biomass drops below minimum viable threshold ($B < B_{\text{lethal\_min}}$): **immediate death by starvation** (`DEATH_CAUSE: STARVATION`).

---

## 5. Biomass & Growth Model

### 5.1 Growth Separation
- **`genetic_growth_potential`:** Maximum theoretical body scale governed by `LOCUS_BODY_SCALE`.
- **`developmental_growth_capacity`:** Current realized growth ceiling modified by $\eta(t)$.
- **`structural_biomass`:** Current accumulated tissue mass (normalized index).
- Somatic growth occurs **exclusively during designated feeding stages** (`STAGE_LARVA`). Adults possess a rigid exoskeleton and cannot increase structural biomass.

---

## 6. Molting & Transition Mechanics

Molting (ecdysis) is the biological mechanism of shedding the rigid cuticle to enable expansion into the next instar or life stage. It is treated as a high-stakes physiological transition, **never as an RPG level-up**.

```
┌─────────────────────────────────────────────────────────────┐
│                    PREREQUISITE CHECK                       │
│    (Accumulated Biomass ≥ Threshold && Stage Age ≥ Min)     │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                    QUIESCENT PRE-MOLT                       │
│       (Feeding ceases, high vulnerability, apolysis)        │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                     ECDYSIAL RESOLUTION                     │
│    (Energy Deducted, Hydration Checked, Stress Evaluated)   │
└──────────────┬──────────────────────────────┬───────────────┘
               ▼ (Pass)                       ▼ (Fail)
┌─────────────────────────────┐ ┌─────────────────────────────┐
│       MOLT_COMPLETED        │ │         MOLT_FAILED         │
│ (New Cuticle, Next Substage)│ │(Lethal Ecdysis or Stunting) │
└─────────────────────────────┘ └─────────────────────────────┘
```

### 6.1 Molt Evaluation Criteria (Prototype Constants)
1. **Prerequisites:**
   - Biomass threshold: $B \ge B_{\text{instar\_target}}$.
   - Minimum stage duration elapsed: $\tau_{\text{stage}} \ge \tau_{\text{min\_molt\_interval}}$.
   - Acute stress below abort threshold: $\text{Stress}_{\text{acute}} < 0.70$.
2. **Transition Energy Cost:**
   $$\text{MoltCost} = 30.0 \times \text{mass\_index} \quad (\text{deducted from } E_{\text{stored}})$$
3. **Success / Failure Resolution:**
   - If $E_{\text{stored}} < \text{MoltCost}$: Molt fails due to metabolic exhaustion.
   - If $\text{Hydration} < 0.40$: Incomplete ecdysis due to cuticle adherence.
   - Outcome:
     - Critical failure $\rightarrow$ `DEATH` (`CAUSE: DEVELOPMENTAL_FAILURE`).
     - Subcritical failure $\rightarrow$ Severe permanent penalty to $\eta$ ($\Delta \eta = -0.15$), heavy stress, and delayed growth.

---

## 7. Environmental Snapshot Model

The environment represents the external matrix surrounding the organism during a given simulation tick. To guarantee determinism, the engine receives an immutable, fully serializable **`EnvironmentState`** snapshot each tick:

```json
{
  "ambient_temperature_celsius": 26.5,
  "relative_humidity": 0.75,
  "substrate_moisture": 0.65,
  "substrate_organic_richness": 0.80,
  "food_density": 0.70,
  "shelter_security_factor": 0.90,
  "population_crowding_index": 0.15,
  "environmental_hazard_rating": 0.0
}
```

> [!IMPORTANT]
> The environment state must **never** contain live game engine handles, Node pointers, scene references, or async timers. All parameters are pure numerical scalars.

---

## 8. Developmental Stress Model

Stress quantifies the cumulative physiological burden imposed by suboptimal conditions.

### 8.1 Stress Vectors
1. **Nutritional Stress ($S_{\text{nutr}}$):** Driven by starvation and low food quality.
2. **Thermal Stress ($S_{\text{therm}}$):** Driven by deviation from the species' optimal thermal comfort window ($T_{\text{opt}} \in [24^\circ\text{C}, 28^\circ\text{C}]$).
3. **Moisture / Desiccation Stress ($S_{\text{moist}}$):** Arises when relative humidity drops below $0.50$ or exceeds saturation causing hypoxia.
4. **Crowding Stress ($S_{\text{crowd}}$):** Elevated competition and interference in high-density environments.

### 8.2 Stress Dynamics
- **Acute Stress ($\text{Stress}_{\text{acute}}$):** Fast-acting, responsive to immediate trauma or shock. Decays rapidly under calm conditions.
- **Chronic Stress ($\text{Stress}_{\text{chronic}}$):** Slow-moving exponential moving average of acute stress. Chronic stress directly penalizes $\eta$ trajectory and immune resistance.
- **Stress Invariant:** **Stress never damages the genome.**

---

## 9. Aging & Senescence

### 9.1 Temporal Progression
Time is tracked in explicit, deterministic simulation units:
- `simulation_tick`: Global discrete simulation clock counter.
- `chronological_age_ticks`: Total lifespan ticks elapsed since oviposition.
- `stage_age_ticks`: Ticks spent in current lifecycle stage.

### 9.2 Adult Senescence Mechanics
Adult beetles exhibit determinate growth and finite adult lifespans.
- During early adult life: $\psi_{\text{senescence}} = 1.00$.
- Upon passing peak reproductive age:
  $$\psi_{\text{senescence}} = 1.00 + 0.50 \times \left(\frac{\text{Age} - \text{Age}_{\text{peak}}}{\text{Lifespan}_{\text{max}} - \text{Age}_{\text{peak}}}\right)^2$$
- This physiological multiplier increases basal metabolic drain and slows stamina recovery, modeling biological senescence **without altering genetic derived stats or genome data**.

---

## 10. Mortality & Death Model

Death marks the terminal, irreversible conclusion of an organism's lifecycle simulation.

### 10.1 Separation of Death Concerns
1. **Death Trigger / Cause (`DeathCause`):** Primary biological category terminating existence.
2. **Death Event (`LIFECYCLE_EVENT: DEATH`):** Simulation event broadcast across the event stream.
3. **Death Record (`DeathRecord`):** Immutable historical archive payload persisted for lineage records.

### 10.2 Supported Death Causes
- **`STARVATION`:** Stored energy depleted to 0 and structural biomass exhausted below viable threshold.
- **`DEVELOPMENTAL_FAILURE`:** Lethal ecdysial arrest during molting or pupation failure.
- **`ENVIRONMENTAL_FAILURE`:** Lethal thermal freezing, desiccation, or fatal oxygen depletion.
- **`OLD_AGE`:** Complete somatic senescence exhaustion in the adult stage.
- **`CATASTROPHIC_EVENT`:** Overwhelming external trauma or severe physical destruction.

### 10.3 Terminal State Invariant
Once `status === "DEAD"`:
- The organism is marked `is_alive = false`.
- **No further simulation ticks are executed for this entity.**
- The terminal state and death record are locked permanently.

---

## 11. Canonical Deterministic Tick Contract

To eliminate any divergence across platforms or JavaScript runtimes, every tick must execute the simulation phases in this exact invariant order:

```
 1. INPUT_INGESTION
    └── Read player actions, external environmental conditions, and available food.

 2. ENVIRONMENT_SNAPSHOT_RECORDING
    └── Capture immutable, serialized EnvironmentState snapshot for this tick.

 3. RESOURCE_INTAKE_AND_ASSIMILATION
    └── Calculate food ingestion, digestion, and conversion into energy, biomass, hydration.

 4. METABOLIC_EXPENDITURE
    └── Deduct basal metabolic upkeep, thermal adjustments, and active movement drain.

 5. STRESS_ACCUMULATION_AND_RECOVERY
    └── Compute nutritional, thermal, and crowding stress vectors; apply recovery damping.

 6. DEVELOPMENT_TRAJECTORY_EVALUATION
    └── Assess developmental progress; calculate delta-eta gradient.

 7. ETA_UPDATE
    └── If !eta_locked, update eta_current and track eta_min_reached.

 8. BIOMASS_GROWTH_EVALUATION
    └── If in somatic growth stage, allocate surplus resources to structural biomass.

 9. LIFECYCLE_TRANSITION_CHECK
    └── Check molt prerequisites or stage transitions; trigger lock if entering locking stage.

10. SURVIVAL_AND_DEATH_EVALUATION
    └── Verify vital signs; trigger terminal death sequence if failure criteria met.

11. DETERMINISTIC_EVENT_EMISSION
    └── Push immutable event records to simulation event stream in strict sequence.

12. STATE_SNAPSHOT_SERIALIZATION
    └── Generate serializable state record representing the end-of-tick state.
```

---

## 12. Deterministic Randomness Contract

The Life Cycle Engine is deterministic by default. When stochastic checks are required (e.g., molt failure risk under high stress, catastrophic hazard rolls), randomness is derived strictly via a seeded PRNG pipeline:

$$\text{EventSeed} = \text{Hash64}(\text{simulation\_seed} \,\|\, \text{organism\_id} \,\|\, \text{simulation\_tick} \,\|\, \text{event\_domain})$$

- **No `Math.random()`:** Forbidden in all simulation paths.
- **No `Date.now()`:** System timestamps are never used for simulation state.
- **No Live RNG Storage:** The `LifecycleState` serializes only numerical seeds and tick counts, never live engine RNG objects.

---

## 13. Event Stream & Save/Replay Contract

### 13.1 Event Stream
The engine produces an immutable sequence of simulation events conforming to `data/lifecycle/schema/lifecycle_event.schema.json`. UI, camera controllers, dialogue triggers, and the Fourth-Wall Commentary subsystem subscribe to this stream in a strictly read-only capacity.

### 13.2 Save / Replay Contract
- All simulation states are 100% pure JSON-serializable.
- Replaying a recorded sequence of environmental inputs against the initial organism state and seed reproduces identical lifecycle trajectories bit-for-bit.
