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
  Tuyet doi cam: unseeded random / date / time APIs.

- **INV-07-06 (Zero Duplicate State in OrganismState)**:
  Khong luu tru truong hanh vi thuong truc trong `OrganismState`. Moi tinh toan hanh vi la phan ung tuc thoi theo tick. `BiologicalInputBundle` chi chua du lieu delta cua tick, khong chua cac truong sinh hoc da co trong `OrganismState`.

- **INV-07-07 (Circadian & Ecological Alignment)**:
  Hanh vi bat buoc phai phan anh nhip dieu sinh hoc ngay/dem (`primary_activity_period` tu profile va `time_of_day` tu moi truong).

- **INV-07-08 (Resource Conservation Law)**:
  Trong `InteractionResult`, tong tai nguyen yeu cau cam ket phai bang chinh xac tong luong phan bo cho tung ca the (trong gioi han sai so floating-point $\epsilon = 10^{-7}$):
  $$\text{total\_resource\_claims}[R] = \sum_{i} \text{resource\_allocations}[i][R]$$

---

## 3. Parameter Classification & Ownership Architecture

Moi thong so trong he thong hanh vi duoc phan loai ro rang vao 4 nhom de ngan ngua nhat quan cac gia tri hardcode:

| Ten Thong So | Nhom Phan Loai | Quyen So Huu (Ownership) | Y Nghia / Fallback Policy |
|---|---|---|---|
| `BEHAVIOR_TYPES` | A. Universal Engine Invariant | Engine Core (`constants.js`) | Enum cac loai hanh vi hop le (`FORAGE`, `REST`, `SEEK_SHELTER`, `SEEK_MATE`, `FLEE`, `EXPLORE`). |
| `URGENCY_CLASSES` | A. Universal Engine Invariant | Engine Core (`constants.js`) | Enum 4 cap do khan cap sinh ton (`CRITICAL`, `HIGH`, `NORMAL`, `LOW`). |
| `URGENCY_WEIGHTS` | A. Universal Engine Invariant | Engine Core (`constants.js`) | Trong so phan cap uu tien bat bien (`CRITICAL: 4` > `HIGH: 3` > `NORMAL: 2` > `LOW: 1`). |
| `TARGET_DOMAINS` | A. Universal Engine Invariant | Engine Core (`constants.js`) | Enum mien muc tieu hanh vi (`RESOURCE`, `SHELTER`, `MATE`, `SAFETY`, `REST`, `NONE`). |
| `THREAT_SOURCES` | A. Universal Engine Invariant | Engine Core (`constants.js`) | Enum nguon de doa cho hanh vi chay tron (`ENVIRONMENTAL_HAZARD`, `PREDATOR`, `OVERCROWDING`). |
| `starvation_critical_ratio` | C. Species-Specific (Fallback B) | `SpeciesProfile.behavior_profile.behavior_parameters` | Nguong ti le nang luong kich hoat doi nguy cap (`CRITICAL`). Fallback prototype: `0.15`. |
| `hunger_forage_ratio` | C. Species-Specific (Fallback B) | `SpeciesProfile.behavior_profile.behavior_parameters` | Nguong ti le nang luong bat dau uu tien kiem an. Fallback prototype: `0.50`. |
| `critical_hazard_threshold` | C. Species-Specific (Fallback B) | `SpeciesProfile.behavior_profile.behavior_parameters` | Nguong nguy co moi truong kich hoat tron chay (`CRITICAL`). Fallback prototype: `0.80`. |
| `high_hazard_threshold` | C. Species-Specific (Fallback B) | `SpeciesProfile.behavior_profile.behavior_parameters` | Nguong nguy co moi truong can tim noi tru an (`HIGH`). Fallback prototype: `0.50`. |
| `critical_stress_threshold` | C. Species-Specific (Fallback B) | `SpeciesProfile.behavior_profile.behavior_parameters` | Nguong stress qua tai can tru an khan cap (`CRITICAL`). Fallback prototype: `0.85`. |
| `high_stress_threshold` | C. Species-Specific (Fallback B) | `SpeciesProfile.behavior_profile.behavior_parameters` | Nguong stress cao. Fallback prototype: `0.60`. |
| `mating_energy_ratio` | C. Species-Specific (Fallback B) | `SpeciesProfile.behavior_profile.behavior_parameters` | Ti le nang luong toi thieu de giao phoi. Fallback prototype: `0.70`. |
| `circadian_rest_bias` | C. Species-Specific (Fallback B) | `SpeciesProfile.behavior_profile.behavior_parameters` | He so tang uu tien nghi ngoi ngoai gio sinh hoc. Fallback prototype: `0.40`. |
| `forage_intake_capacity` | D. Not a Behavior Parameter | `SpeciesProfile.nutrition_profile.base_intake_capacity_per_tick` | **DA BI LOAI BO HOAN TOAN KHOI BEHAVIOR ENGINE**. Luong thuc an yeu cau doc truc tiep tu `nutrition_profile`. |

---

## 4. Semantics & Boundaries

### 4.1 Quyen So Huu Yeu Cau Thuc An (`requested_quantity`)
- `ActionIntent` cua hanh vi `FORAGE` mang theo truong `requested_quantity`.
- **Y nghia hop dong**: Day la **y dinh / de nghi xin cap phat** cua ca the, phan anh nhu cau tieu thu dinh ky dua tren `nutrition_profile.base_intake_capacity_per_tick`.
- **Ranh gioi nghiem ngat**:
  * Behavior Engine KHONG tru tai nguyen trong `ResourcePool`.
  * Behavior Engine KHONG thay doi nang luong trong `NutritionState`.
  * Interaction Engine (Phase 07-C) se phan bo luong thuc an thuc te (`allocated_quantity`) dua tren tai nguyen kha dung.
  * Biological Tick (Phase 06-B-03) moi thuc su dong hoa luong thuc an nay vao sinh khoi va nang luong cua sinh vat.

### 4.2 Ranh Gioi Phan Dinh Tuong Tac (Arbitration Boundary)
- **Phase 07-B la INDIVIDUAL Behavior Decision Engine**:
  * Chi danh gia va lua chon 1 hanh vi toi uu cho **tung ca the rieng le**.
  * `candidates.sort` ben trong `evaluateOrganismBehavior` chi nham muc dich chon ra y dinh hanh dong tot nhat cho ban than sinh vat do dua tren cap do khan cap sinh ton (`urgency_class`) va diem uu tien (`priority_score`).
  * `clash_power` duoc dong goi vao `ActionIntent` duoi dang mot **su kien di truyen (genetic fact)** da tinh toan san tu `derivedStats`.
- **Phase 07-C la ECOLOGICAL Interaction Resolver**:
  * Day moi la noi dien ra cuoc canh tranh tai nguyen giua **nhieu ca the voi nhau** (population-level contest).
  * Thuat toan arbitration `urgency_class` -> `priority_score` -> `clash_power` -> `organism_id` duoc thuc thi tai 07-C de phan chia thuc an va noi tru an. 07-B tuyet doi khong giai quyet tranh chap quan the.

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
- **Phase 07-B (COMPLETED - Commit fafaa4e + corrective patch)**: Individual Behavior Decision Engine (Pure evaluation mapping, Seed derivation, Urgency classification, Circadian alignment, Stage restrictions, Parameter classification).
- **Phase 07-C (LOCKED - Pending Audit)**: Interaction Resolver & Biological Input Bundle Factory (Deterministic arbitration, Conservation law).
- **Phase 07-D (LOCKED)**: SimulationWorld Integration (Ghep noi vao pipeline 9 buoc cua World Tick, kiem chung toan dien qua integration tests).

### 4.3 FLEE Semantics & Safety Isolation (Phase 07-C Corrected)
- `FLEE` bieu dien y dinh tron tranh moi nguy cap bach (`threat_source: ENVIRONMENTAL_HAZARD | PREDATOR | OVERCROWDING`).
- **Khong tao effect an ninh gia**: FLEE khong tu tao bat ky he so an ninh gia nao (nhu 0.3 hay 0.5 baseline).
- Ca the khong thuc hien `SEEK_SHELTER` (bao gom FLEE, REST, FORAGE, EXPLORE) huong nguyen ven muc an toan tu nhien cua sinh canh `environmentSnapshot.shelter_security_factor`.
- Tuyet doi khong co movement, pathfinding, combat hay dot bien chi so sinh hoc trong 07-C.

### 4.4 Metabolic Activity Rate Ownership vs Lifecycle Drain (Phase 07-C Corrected)
- `metabolic_activity_rate` trong `BiologicalInputBundle`:
  * Dai dien cho he so gia tang / giam bot tieu hao nang luong tu hanh vi trong tick do.
  * **KHONG PHAI LA ALIAS** cua `metabolic_drain_multiplier` trong lifecycle stage. `metabolic_drain_multiplier` la he so tieu hao chuyen hoa co so (basal expenditure) cua giai doan phat trien (Egg/Pupa = 0.2, Larva/Adult = 1.0 trong `tick_pipeline.js`).
  * Trong Phase 07-C, `metabolic_activity_rate` mac dinh mang gia tri trung tinh tuyet doi `1.0` (zero invented constants, khong lam bien dang cong thuc chuyen hoa co so cua lifecycle engine). Neu loai co cau hinh ro rang trong `speciesProfile.behavior_profile.behavior_parameters.metabolic_activity_rate` thi moi nap tu do.