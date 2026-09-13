# BEHAVIOR & ECOLOGICAL INTERACTION ENGINE SPECIFICATION (TASK 07)

## 1. Executive Summary & Purpose
Tai lieu nay dac ta kien truc, hop dong du lieu (domain contracts), quy trinh thuc thi va cac bat bien sinh hoc cua lop **Individual Behavior & Ecological Interaction Engine** trong du an `LinhSinhVN`.

He thong bien quan the sinh vat tu cac doi tuong thu dong thanh cac thuc the tu chu (autonomous biological agents) co kha nang:
1. Danh gia trang thai sinh hoc ca the ket hop voi trang thai sinh canh tuc thoi de ra quyet dinh hanh vi toi uu hoa sinh ton.
2. Phat sinh y dinh hanh dong (`ActionIntent`) gui den bo phan xu tuong tac sinh thai (`InteractionResolver`).
3. Canh tranh va chia se tai nguyen han che (thuc an, noi tru an) mot cach tat dinh (deterministic), bao toan vat chat va ton trong thu bac sinh ton.
4. Chuyen hoa ket qua tuong tac thanh goi dau vao sinh hoc (`BiologicalInputBundle`) de cap cho chu trinh sinh hoc (`BiologicalTickCoordinator`), ngan ngua triet de hien tuong tru trung tai nguyen (double-consumption).

---

## 2. Architectural Invariants (Khoa Bat Bien)

- **INV-07-01 (Pure Decision Mapping)**:
  $$\text{OrganismState}(t) + \text{EnvironmentState}(t) + \text{SpeciesProfile} \xrightarrow{\text{PURE}} \text{BehaviorDecision} \xrightarrow{\text{PURE}} \text{ActionIntent}$$
  Quy trinh ra quyet dinh hanh vi la ham thuan tuy khong gay tac dung phu (zero side-effect). Tuyet doi khong thay doi trang thai cua `OrganismState`, `PopulationRegistry`, `ResourcePool`, `EnvironmentState` hay `SimulationClock`.

- **INV-07-02 (Pure Interaction Arbitration)**:
  $$\text{ActionIntent}[] + \text{ResourcePoolSnapshot}(t) + \text{EnvironmentState}(t) \xrightarrow{\text{PURE}} \text{InteractionResult}$$
  Bo phan giai tuong tac phan dinh quyen tiep can tai nguyen va noi tru an ma khong tru truc tiep vao `ResourcePool`.

- **INV-07-03 (Single Source of Resource Consumption)**:
  Tai nguyen trong `ResourcePool` chi bi tru dung mot lan duy nhat tai buoc **Atomic Commit** cua World Tick, dua tren truong `InteractionResult.total_resource_claims`. `BiologicalTickCoordinator` chi tieu thu nang luong tu `BiologicalInputBundle.allocated_food`, tuyet doi khong doc hay tru truc tiep `ResourcePool`.

- **INV-07-04 (Survival Priority Inviolability)**:
  Thu tu uu tien phan bo tai nguyen tuan thu nghiem ngat he thong 4 cap:
  1. `urgency_class` (`CRITICAL` > `HIGH` > `NORMAL` > `LOW`)
  2. `priority_score` DESC ($[0.0, 1.0]$)
  3. `clash_power` DESC (Chi so canh tranh hinh thai/di truyen)
  4. `organism_id` ASC (Lexicographical canonical tie-breaker)
  Ca the dang gap nguy hiem sinh mang (`CRITICAL` - vi du doi kiet que) luon nhan tai nguyen truoc ca the khoe manh (`NORMAL`), bat ke ca the khoe manh co `clash_power` vuot troi.

- **INV-07-05 (Seed Domain Separation & Nullability)**:
  Neu quyet dinh hanh vi khong kich hoat nhanh ngau nhien nao thi `decision_seed = null`.
  Neu co stochastic tie-break hoac random exploration:
  $$\text{decision\_seed} = \text{Hash64}(\text{SimulationSeed} \mid \text{PopulationId} \mid \text{SimulationTick} \mid \text{OrganismId} \mid \text{"BEHAVIOR"})$$
  Tuyet doi cam: `Math.random()`, `Date.now()`, `crypto.randomUUID()`.

- **INV-07-06 (Zero Duplicate State in OrganismState)**:
  Khong luu tru truong hanh vi thuong truc trong `OrganismState`. Moi tinh toan hanh vi la phan ung tuc thoi theo tick. `BiologicalInputBundle` chi chua du lieu delta cua tick, khong chua cac truong sinh hoc da co trong `OrganismState`.

- **INV-07-07 (Circadian & Ecological Alignment)**:
  Hanh vi bat buoc phai phan anh nhip dieu sinh hoc ngay/dem (`primary_activity_period` tu profile va `time_of_day` tu moi truong).

- **INV-07-08 (Resource Conservation Law)**:
  Trong `InteractionResult`, tong tai nguyen yeu cau cam ket phai bang chinh xac tong luong phan bo cho tung ca the (trong gioi han sai so floating-point $\epsilon = 10^{-7}$):
  $$\text{total\_resource\_claims}[R] = \sum_{i} \text{resource\_allocations}[i][R]$$

---

## 3. World Tick Integration Pipeline

Quy trinh 9 buoc trong `SimulationWorld.advancePopulationTick`:

```
WORLD TICK N
   │
   ├─► Step 1: Environment(t) Snapshot (Bat bien)
   │
   ├─► Step 2: Behavior Evaluation (PURE) [TASK 07-B]
   │     ├─ Input: OrganismState(t) + Environment(t) + SpeciesProfile
   │     └─ Output: BehaviorEvaluationResult & ActionIntent[]
   │
   ├─► Step 3: Interaction Resolution (PURE) [TASK 07-C]
   │     ├─ Input: ActionIntent[] + ResourcePoolSnapshot(t) + Environment(t)
   │     └─ Output: InteractionResult
   │
   ├─► Step 4: Assemble BiologicalInputBundle (PURE) [TASK 07-C]
   │     ├─ Ghep noi InteractionResult + BehaviorDecisions + Environment(t)
   │     └─ Output: BiologicalInputBundle
   │
   ├─► Step 5: Biological Tick Evaluation (PURE) [TASK 06-B-03]
   │     ├─ Input: OrganismState(t) + BiologicalInputBundle
   │     └─ Output: Candidate OrganismState(t+1)
   │
   ├─► Step 6: Reproduction Planning (PURE) [TASK 06-C]
   │     ├─ Input: Candidate OrganismState(t+1)
   │     └─ Output: BreedingPlan
   │
   ├─► Step 7: Ecology Feedback Candidate (PURE) [TASK 06-B-03]
   │     ├─ Input: InteractionResult claims + Sinh khoi bai tiet
   │     └─ Output: Candidate Environment(t+1)
   │
   ├─► Step 8: Full Preflight Validation
   │     └─ Kiem tra toan ven candidate states & invariants; ABORT neu loi
   │
   └─► Step 9: SINGLE ATOMIC COMMIT
         ├─ PopulationRegistry: Commit cap nhat candidate states & them offspring
         ├─ ResourcePool: Tru tai nguyen theo InteractionResult.total_resource_claims
         ├─ EnvironmentState: Commit candidate Environment(t+1)
         └─ SimulationClock: N -> N+1
```

---

## 4. Individual Behavior Decision Algorithm (Phase 07-B)

### 4.1 Decision Hierarchy & Urgency Classes
Hanh vi duoc danh gia qua 4 cap do khan cap sinh ton (`urgency_class`):
- `CRITICAL` (Trong so 4): Nguy hiem chet nguoi truc tiep (doi kiet que, moi truong cuc ky doc hai / thien tai, stress qua tai suy kiet sinh luc). Luon thang the moi hanh vi o cac cap duoi.
- `HIGH` (Trong so 3): Thieu hut nang luong ro ret (doi), moi truong co nguy co dang ke, stress cao.
- `NORMAL` (Trong so 2): Hoat dong binh thuong (sinh san khi du nang luong, nghi ngoi theo nhip sinh hoc ngay/dem).
- `LOW` (Trong so 1): Kham pha moi truong khi no du, nghi ngoi duong suc co ban, giai doan bat dong.

Trong cung cap `urgency_class`, quyet dinh duoc phan dinh theo `priority_score` giam dan ($[0.0, 1.0]$).

### 4.2 Behavior Parameters & Defaults
Moi loai co the tuy bien tham so hanh vi qua `SpeciesProfile.behavior_profile.behavior_parameters`. Neu khong co, he thong su dung cac gia tri mac dinh khoa hoc:
- `starvation_critical_ratio` (0.15): Ti le nang luong du tru / dung luong toi da gay nguy co chet doi (`CRITICAL` FORAGE).
- `hunger_forage_ratio` (0.50): Ti le nang luong bat dau kich hoat uu tien tim kiem thuc an.
- `critical_hazard_threshold` (0.80): Chi so nguy hiem moi truong kich hoat chay tron khan cap (`CRITICAL` FLEE).
- `high_hazard_threshold` (0.50): Chi so nguy hiem moi truong kich hoat tim noi tru an (`HIGH` SEEK_SHELTER).
- `critical_stress_threshold` (0.85): Muc do stress kich hoat tru an cap cuu (`CRITICAL` SEEK_SHELTER).
- `high_stress_threshold` (0.60): Muc do stress nang cao.
- `mating_energy_ratio` (0.70): Ti le nang luong toi thieu de ca the xem xet sinh san.
- `circadian_rest_bias` (0.40): He so tang cuong nghi ngoi trong khung gio thu dong sinh hoc.
- `forage_intake_capacity` (1.0): Luong thuc an co so yeu cau moi lan kiem an.

### 4.3 Circadian Alignment
- Loai `NOCTURNAL`: Khung gio hoat dong la `NIGHT` va `DUSK`. Trong gio `DAY` va `DAWN`, thien huong nghi ngoi (`REST`) duoc day len muc `NORMAL` uu tien cao.
- Loai `DIURNAL`: Khung gio hoat dong la `DAY` va `DAWN`. Gio `NIGHT` va `DUSK` uu tien `REST`.
- Loai `CREPUSCULAR`: Hoat dong tich cuc luc `DAWN` va `DUSK`.
- Loai `CATHEMERAL`: Hoat dong deu dan ca ngay lan dem.

### 4.4 Stage & Motility Restrictions
- Ca the o giai doan bat dong (`is_motile_stage === false`, vi du `STAGE_EGG`, `STAGE_PUPA`) chi co the phat sinh hanh vi `REST` (`urgency: LOW`, `priority: 0.1`).
- Ca the khong o giai doan an (`is_feeding_stage === false`) khong the phat sinh `FORAGE`.
- Ca the khong o giai doan sinh san (`is_reproductive_stage === false`) khong the phat sinh `SEEK_MATE`.
- Ca the da chet (`is_alive === false` hoac `status === 'DEAD'`) tra ve `null` (khong co quyet dinh hay intent nao).

### 4.5 Fact Ownership vs Recalculation
- `clash_power`: Doc truc tiep tu `organismState.genetics.derived_stats.clash_power`.
- `nutrition`: Doc tu `organismState.nutrition_state`.
- `stress`: Doc tu `organismState.stress_state`.
- `development`: Doc tu `organismState.current_stage_id`.
Engine hanh vi tuyet doi khong tinh toan lai cac chi so sinh hoc tren.

### 4.6 Seed Derivation & Nullability
- Truong hop thuan tat dinh: `decision_seed = null`.
- Truong hop stochastic tie-break / exploration:
  $$\text{decision\_seed} = \text{Hash64}(\text{SimulationSeed} \mid \text{PopulationId} \mid \text{SimulationTick} \mid \text{OrganismId} \mid \text{"BEHAVIOR"})$$
  Chuoi hex 16 ky tu dap ung regex `^[0-9a-fA-F]{16}$`.

---

## 5. Domain Data Contracts

### 5.1 Behavior Decision (`behavior_decision.schema.json`)
- `schema_version`: `"1.0.0"`
- `organism_id`: Ma dinh danh ca the (`^[a-zA-Z0-9_-]+$`)
- `simulation_tick`: So hieu tick hien tai ($\ge 0$)
- `behavior_type`: Enum `['FORAGE', 'REST', 'SEEK_SHELTER', 'SEEK_MATE', 'FLEE', 'EXPLORE']`
- `urgency_class`: Enum `['CRITICAL', 'HIGH', 'NORMAL', 'LOW']`
- `priority_score`: So thuc trong $[0.0, 1.0]$
- `target_domain`: Enum `['RESOURCE', 'SHELTER', 'MATE', 'SAFETY', 'REST', 'NONE']`
- `reason_codes`: Danh sach chuoi ma ly do sinh hoc giai thich quyet dinh
- `decision_seed`: Chuoi hex 64-bit hoac `null`

### 5.2 Action Intent (`action_intent.schema.json`)
Cau truc Discriminated Union theo `action_type`:
- Cac truong chung:
  * `schema_version`: `"1.0.0"`
  * `intent_id`: Ma dinh danh intent
  * `organism_id`, `species_id`: Ma ca the va loai
  * `urgency_class`: Cap do khan cap sinh ton
  * `priority_score`: Trong so uu tien $[0.0, 1.0]$
  * `clash_power`: Chi so suc manh tranh chap ($\ge 0.0$)
- Bien the payload:
  * `FORAGE`: `payload: { target_resource_type: string, requested_quantity: number > 0 }`
  * `SEEK_SHELTER`: `payload: { target_shelter_type: string, minimum_security_factor: number [0, 1] }`
  * `SEEK_MATE`: `payload: { target_criteria: { compatible_species_id: string, target_sex: "MALE" | "FEMALE" } }`
  * `FLEE`: `payload: { threat_source: "ENVIRONMENTAL_HAZARD" | "PREDATOR" | "OVERCROWDING" }`
  * `REST`: `payload: null`
  * `EXPLORE`: `payload: null`

### 5.3 Interaction Result (`interaction_result.schema.json`)
- `schema_version`: `"1.0.0"`
- `population_id`: Ma quan the
- `simulation_tick`: So hieu tick
- `resource_allocations`: Ban do phan bo `organism_id -> { resource_type: allocated_amount }`
- `shelter_assignments`: Ban do tru an `organism_id -> { shelter_acquired: boolean, effective_security_factor: number }`
- `unmet_intents`: Mang cac y dinh khong duoc thoa man kem ly do
- `total_resource_claims`: Tong luong tai nguyen yeu cau cam ket tru tu `ResourcePool`

### 5.4 Biological Input Bundle (`biological_input_bundle.schema.json`)
- `schema_version`: `"1.0.0"`
- `population_id`: Ma quan the
- `simulation_tick`: So hieu tick
- `organism_inputs`: Ban do `organism_id -> { allocated_food, shelter_security_factor, behavior_type, metabolic_activity_rate }`
- `environmental_snapshot`: Snapshot bat bien cua `EnvironmentState` dau tick

---

## 6. Phan Dinh Scope & Lo Trinh
- **Phase 07-A (CLOSED - Commit 552bb03)**: Specifications, Schemas, Domain Contracts, Tests Schema Validation.
- **Phase 07-B (COMPLETED)**: Individual Behavior Decision Engine (Pure evaluation mapping, Seed derivation, Urgency classification, Circadian alignment, Stage restrictions).
- **Phase 07-C (LOCKED - Pending Audit)**: Interaction Resolver & Biological Input Bundle Factory (Deterministic arbitration, Conservation law).
- **Phase 07-D (LOCKED)**: SimulationWorld Integration (Ghep noi vao pipeline 9 buoc cua World Tick, kiem chung toan dien qua integration tests).