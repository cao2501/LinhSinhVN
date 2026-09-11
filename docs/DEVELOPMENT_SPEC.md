# LinhSinhVN — Developmental Realization Specification (η)

**Document Version:** 1.0.0  
**Phase:** Phase 0 — Foundation / System Design  
**Domain:** DEVELOPMENT / PHENOTYPE MAPPING  
**Status:** ARCHITECTURALLY LOCKED SPECIFICATION  

---

## 1. Executive Summary & The Genetic Abstraction Chain

In LinhSinhVN, an organism's realized adult morphology is not an unmediated readout of its DNA, nor is it an arbitrary RPG leveling score. It is the causal output of an immutable **Genome** filtered through an environmental **Developmental Realization Factor ($\eta$)**:

```
┌─────────────────────────────────────────────────────────────┐
│                 GENOME (Diploid Alleles)                    │
│                 (100% Immutable across lifespan)            │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                      GENE EXPRESSION                        │
│          V_exp = calculateGeneExpression(genome, sex)       │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                     GENETIC POTENTIAL                       │
│        (Theoretical ideal morphology at optimal η = 1.0)   │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│             DEVELOPMENTAL REALIZATION FACTOR (η)            │
│  (Malleable during larval plasticity; locked at pupation)   │
│                   0.60 <= η <= 1.00                         │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                   REALIZED ADULT PHENOTYPE                  │
│       calculatePhenotype(genome, sex, developmentalFactor)  │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                      BASE DERIVED STATS                     │
│               calculateDerivedStats(phenotype)              │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 CURRENT PHYSIOLOGICAL MODIFIERS             │
│    (stamina, current energy, senescence_metabolic_modifier) │
└─────────────────────────────────────────────────────────────┘
```

### Core Invariants
1. **Genome Protection:** Under no circumstances do developmental deficits, nutritional starvation, environmental freezing, or somatic stunting modify the underlying alleles. Progeny of a stunted adult ($\eta = 0.60$) inherit the full, uncompromised genetic potential of their parents.
2. **Not an RPG Progression Metric:** $\eta$ does **not** function as an experience point (XP) pool or level progression system. Feeding does not give "+10 XP".
3. **Irreversible Morphological Locking:** Once an organism transitions into its sclerotized adult form (eclose from pupa), its morphological dimensions are permanently fixed. Post-emergence starvation affects dynamic physiological stamina and health, never $\eta_{\text{locked}}$ or adult body scale.

---

## 2. State Model of Developmental Realization

The developmental state is maintained in a discrete, fully serializable structure conforming to `data/lifecycle/schema/developmental_state.schema.json`:

```json
{
  "organism_id": "org_01j7x4b9a2k",
  "eta_current": 1.0,
  "eta_min_reached": 1.0,
  "eta_locked": false,
  "eta_lock_stage": "STAGE_PUPA",
  "developmental_progress": 0.45,
  "plasticity_capacity": 1.0,
  "stunting_event_count": 0,
  "eta_history": []
}
```

### 2.1 State Field Definitions
- **`eta_current` ($0.60 \le \eta \le 1.00$):** Real-time developmental realization factor. Initialized to $1.00$ at embryonic origin (zygote/egg).
- **`eta_min_reached` ($0.60 \le \eta_{\min} \le 1.00$):** Historical minimum value reached by $\eta$ during the organism's growth trajectory. Useful for genealogical audit and post-hoc narrative inspection.
- **`eta_locked` (`boolean`):** Indicates whether morphological realization has been permanently sealed.
- **`eta_lock_stage` (`string`):** The lifecycle stage ID that triggers irrevocable locking (for `xylotrupes_rhinoceros_proto`, this is `STAGE_PUPA`).
- **`developmental_progress` ($[0.0, 1.0]$):** Accumulated developmental milestone progress within the current stage.
- **`plasticity_capacity` ($[0.0, 1.0]$):** Remaining responsive capacity of tissues to environmental variation. Declines naturally as the organism approaches metamorphosis.
- **`eta_history` (`array`):** Immutable log recording significant $\Delta \eta$ shifts, citing causal factors (`NUTRITIONAL_DEFICIT`, `THERMAL_STRESS`, `ECDYSIAL_ARREST`, `COMPENSATORY_RECOVERY`).

---

## 3. Causal Mathematical Formulation of η Trajectory

> [!NOTE]
> All formulas, rates, and thresholds in this section are **GAMEPLAY MODEL / PROTOTYPE CONSTANTS**. They provide deterministic simulation balance and are not claimed as empirical laboratory biometrics.

### 3.1 Initial Conditions
Every fertilized egg begins with:
$$\eta(0) = 1.00$$
*(Optimal realization potential granted by maternal embryonic yolk endowment).*

### 3.2 Dynamic Update Law (During Plasticity Window: `!eta_locked`)
Every simulation tick during an active developmental growth stage, $\eta$ is updated via a deterministic balance equation:

$$\eta(t + \Delta t) = \text{clamp}\Big(\eta(t) - \Delta \eta_{\text{deficit}} - \Delta \eta_{\text{stress}} + \Delta \eta_{\text{recovery}}, \, 0.60, \, 1.00\Big)$$

Where:

#### 1. Nutritional Deficit Impact ($\Delta \eta_{\text{deficit}}$):
If the organism experiences nutritional deficit ($\text{DeficitSeverity} > 0.0$):
$$\Delta \eta_{\text{deficit}} = K_{\text{deficit\_rate}} \times (\text{DeficitSeverity})^{1.5} \times \text{plasticity\_capacity} \times \Delta t$$
*(Prototype constant: $K_{\text{deficit\_rate}} = 0.002$ per tick)*.

#### 2. Cumulative Stress Impact ($\Delta \eta_{\text{stress}}$):
If chronic environmental stress exceeds the developmental tolerance threshold ($\text{Stress}_{\text{chronic}} > 0.30$):
$$\Delta \eta_{\text{stress}} = K_{\text{stress\_rate}} \times (\text{Stress}_{\text{chronic}} - 0.30) \times \text{plasticity\_capacity} \times \Delta t$$
*(Prototype constant: $K_{\text{stress\_rate}} = 0.001$ per tick)*.

#### 3. Compensatory Recovery Dynamics ($\Delta \eta_{\text{recovery}}$):
When nutritional conditions are abundant ($Q_{\text{food}} \ge 0.80$, $\text{IntakeRate} \ge \text{BasalFoodDemand}$) and stress is negligible ($\text{Stress}_{\text{chronic}} < 0.10$):
$$\Delta \eta_{\text{recovery}} = K_{\text{recovery\_rate}} \times (1.00 - \eta(t)) \times \text{plasticity\_capacity} \times \Delta t$$
*(Prototype constant: $K_{\text{recovery\_rate}} = 0.0004$ per tick)*.

> [!IMPORTANT]
> **Asymmetric Plasticity Rule:** Recovery rate is substantially slower than degradation rate ($K_{\text{recovery\_rate}} \ll K_{\text{deficit\_rate}}$). Stunting occurs rapidly under starvation, but compensatory growth requires prolonged sustained abundance. Recovery is strictly capped at $1.00$.

---

## 4. The Morphological Locking Event

### 4.1 Trigger Mechanics
When the Lifecycle State Machine signals a transition into the configured `eta_lock_stage`:
1. The transition handler executes:
   ```
   developmental_state.eta_locked = true
   developmental_state.plasticity_capacity = 0.0
   ```
2. A deterministic event `DEVELOPMENTAL_REALIZATION_LOCKED` is pushed to the event stream, recording `final_eta = eta_current`.
3. The Genetics Engine's phenotype mapping function is invoked with this final, immutable $\eta$:
   ```javascript
   const adultPhenotype = calculatePhenotype(genome, sex, developmental_state.eta_current);
   ```

### 4.2 Post-Locking Invariant
Once `eta_locked === true`:
- $\eta$ **never changes again** ($\Delta \eta / \Delta t \equiv 0$).
- Adult feeding abundance or subsequent adult starvation alters `stored_energy`, `stamina`, or `current_hp`, but has **zero impact on body scale, mass index, or horn dimensions**.

---

## 5. Phenotype Cascade Integration

The locked realization factor cascades downstream through the existing, verified Genetics Engine ([`game/genetics/phenotype.js`](file:///d:/LinhSinhVN/game/genetics/phenotype.js)):

1. **Body Scale Realization:**
   $$\text{body\_scale\_index} = [0.70 + (V_{\text{exp\_body}} \times 0.80)] \times \eta$$
2. **Mass Index Cascade:**
   $$\text{mass\_index} = [0.80 + (V_{\text{exp\_body}} \times \eta) \times 1.0] \times (1.0 + V_{\text{exp\_chitin}} \times 0.2)$$
3. **Male Horn Allometry Cascade:**
   $$\text{cephalic\_horn\_scale} = (V_{\text{exp\_horn}}^{1.2}) \times 1.50 \times \text{body\_scale\_index}$$
   $$\text{thoracic\_horn\_scale} = V_{\text{exp\_thoracic}} \times 1.20 \times \text{body\_scale\_index}$$

### Consequences of Stunting ($\eta = 0.60$):
- An adult beetle suffering maximal developmental stunting achieves only $60\%$ of its genetic body scale.
- Because horn growth exhibits hyperallometry with body scale, male horn length is disproportionately reduced, accurately mirroring the major/minor male dimorphism observed in natural coleoptera populations.
- **Crucially:** Its sperm or eggs carry the exact same unmutated alleles as if it had developed at $\eta = 1.00$.
