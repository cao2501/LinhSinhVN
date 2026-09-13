# BEHAVIOR & ECOLOGICAL INTERACTION ENGINE SPECIFICATION (TASK 07)

## 1. Executive Summary & Purpose
Tài liệu này đặc tả kiến trúc, hợp đồng dữ liệu (domain contracts), quy trình thực thi và các bất biến sinh học của lớp **Individual Behavior & Ecological Interaction Engine** trong dự án `LinhSinhVN`.

Hệ thống biến quần thể sinh vật từ các đối tượng thụ động thành các thực thể tự chủ (autonomous biological agents) có khả năng:
1. Đánh giá trạng thái sinh học cá thể kết hợp với trạng thái sinh cảnh tức thời để ra quyết định hành vi tối ưu hóa sinh tồn.
2. Phát sinh ý định hành động (`ActionIntent`) gửi đến bộ phân xử tương tác sinh thái (`InteractionResolver`).
3. Cạnh tranh và chia sẻ tài nguyên hạn chế (thức ăn, nơi trú ẩn) một cách tất định (deterministic), bảo toàn vật chất và tôn trọng thứ bậc sinh tồn.
4. Chuyển hóa kết quả tương tác thành gói đầu vào sinh học (`BiologicalInputBundle`) để cấp cho chu trình sinh học (`BiologicalTickCoordinator`), ngăn ngừa triệt để hiện tượng trừ trùng tài nguyên (double-consumption).

---

## 2. Architectural Invariants (Khóa Bất Biến)

- **INV-07-01 (Pure Decision Mapping)**:
  $$\text{OrganismState}(t) + \text{EnvironmentState}(t) + \text{SpeciesProfile} \xrightarrow{\text{PURE}} \text{BehaviorDecision} \xrightarrow{\text{PURE}} \text{ActionIntent}$$
  Quá trình ra quyết định hành vi là hàm thuần túy không gây tác dụng phụ (zero side-effect). Tuyệt đối không thay đổi trạng thái của `OrganismState`, `PopulationRegistry`, `ResourcePool`, `EnvironmentState` hay `SimulationClock`.

- **INV-07-02 (Pure Interaction Arbitration)**:
  $$\text{ActionIntent}[] + \text{ResourcePoolSnapshot}(t) + \text{EnvironmentState}(t) \xrightarrow{\text{PURE}} \text{InteractionResult}$$
  Bộ phân giải tương tác phân định quyền tiếp cận tài nguyên và nơi trú ẩn mà không trừ trực tiếp vào `ResourcePool`.

- **INV-07-03 (Single Source of Resource Consumption)**:
  Tài nguyên trong `ResourcePool` chỉ bị trừ đúng một lần duy nhất tại bước **Atomic Commit** của World Tick, dựa trên trường `InteractionResult.total_resource_claims`. `BiologicalTickCoordinator` chỉ tiêu thụ năng lượng từ `BiologicalInputBundle.allocated_food`, tuyệt đối không đọc hay trừ trực tiếp `ResourcePool`.

- **INV-07-04 (Survival Priority Inviolability)**:
  Thứ tự ưu tiên phân bổ tài nguyên tuân thủ nghiêm ngặt hệ thống 4 cấp:
  1. `urgency_class` (`CRITICAL` > `HIGH` > `NORMAL` > `LOW`)
  2. `priority_score` DESC ($[0.0, 1.0]$)
  3. `clash_power` DESC (Chỉ số cạnh tranh hình thái/di truyền)
  4. `organism_id` ASC (Lexicographical canonical tie-breaker)
  Cá thể đang gặp nguy hiểm sinh mạng (`CRITICAL` - ví dụ đói kiệt quệ) luôn nhận tài nguyên trước cá thể khỏe mạnh (`NORMAL`), bất kể cá thể khỏe mạnh có `clash_power` vượt trội.

- **INV-07-05 (Seed Domain Separation & Nullability)**:
  Nếu quyết định hành vi không kích hoạt nhánh ngẫu nhiên nào thì `decision_seed = null`.
  Nếu có stochastic tie-break hoặc random exploration:
  $$\text{decision\_seed} = \text{Hash64}(\text{SimulationSeed} \mid \text{PopulationId} \mid \text{SimulationTick} \mid \text{OrganismId} \mid \text{"BEHAVIOR"})$$
  Tuyệt đối cấm: `Math.random()`, `Date.now()`, `crypto.randomUUID()`.

- **INV-07-06 (Zero Duplicate State in OrganismState)**:
  Không lưu trữ trường hành vi thường trực trong `OrganismState`. Mọi tính toán hành vi là phản ứng tức thời theo tick. `BiologicalInputBundle` chỉ chứa dữ liệu delta của tick, không chứa các trường sinh học đã có trong `OrganismState`.

- **INV-07-07 (Circadian & Ecological Alignment)**:
  Hành vi bắt buộc phải phản ánh nhịp điệu sinh học ngày/đêm (`primary_activity_period` từ profile và `time_of_day` từ môi trường).

- **INV-07-08 (Resource Conservation Law)**:
  Trong `InteractionResult`, tổng tài nguyên yêu cầu cam kết phải bằng chính xác tổng lượng phân bổ cho từng cá thể (trong giới hạn sai số floating-point $\epsilon = 10^{-7}$):
  $$\text{total\_resource\_claims}[R] = \sum_{i} \text{resource\_allocations}[i][R]$$

---

## 3. World Tick Integration Pipeline

Quy trình 9 bước trong `SimulationWorld.advancePopulationTick`:

```
WORLD TICK N
   │
   ├─► Step 1: Environment(t) Snapshot (Bất biến)
   │
   ├─► Step 2: Behavior Evaluation (PURE)
   │     ├─ Input: OrganismState(t) + Environment(t) + SpeciesProfile
   │     └─ Output: BehaviorEvaluationResult & ActionIntent[]
   │
   ├─► Step 3: Interaction Resolution (PURE)
   │     ├─ Input: ActionIntent[] + ResourcePoolSnapshot(t) + Environment(t)
   │     └─ Output: InteractionResult
   │
   ├─► Step 4: Assemble BiologicalInputBundle (PURE)
   │     ├─ Ghép nối InteractionResult + BehaviorDecisions + Environment(t)
   │     └─ Output: BiologicalInputBundle
   │
   ├─► Step 5: Biological Tick Evaluation (PURE)
   │     ├─ Input: OrganismState(t) + BiologicalInputBundle
   │     └─ Output: Candidate OrganismState(t+1)
   │
   ├─► Step 6: Reproduction Planning (PURE)
   │     ├─ Input: Candidate OrganismState(t+1)
   │     └─ Output: BreedingPlan
   │
   ├─► Step 7: Ecology Feedback Candidate (PURE)
   │     ├─ Input: InteractionResult claims + Sinh khối bài tiết
   │     └─ Output: Candidate Environment(t+1)
   │
   ├─► Step 8: Full Preflight Validation
   │     └─ Kiểm tra toàn vẹn candidate states & invariants; ABORT nếu lỗi
   │
   └─► Step 9: SINGLE ATOMIC COMMIT
         ├─ PopulationRegistry: Commit cập nhật candidate states & thêm offspring
         ├─ ResourcePool: Trừ tài nguyên theo InteractionResult.total_resource_claims
         ├─ EnvironmentState: Commit candidate Environment(t+1)
         └─ SimulationClock: N -> N+1
```

---

## 4. Domain Data Contracts

### 4.1 Behavior Decision (`behavior_decision.schema.json`)
- `schema_version`: `"1.0.0"`
- `organism_id`: Mã định danh cá thể (`^[a-zA-Z0-9_-]+$`)
- `simulation_tick`: Số hiệu tick hiện tại ($\ge 0$)
- `behavior_type`: Enum `['FORAGE', 'REST', 'SEEK_SHELTER', 'SEEK_MATE', 'FLEE', 'EXPLORE']`
- `urgency_class`: Enum `['CRITICAL', 'HIGH', 'NORMAL', 'LOW']`
- `priority_score`: Số thực trong $[0.0, 1.0]$
- `target_domain`: Enum `['RESOURCE', 'SHELTER', 'MATE', 'SAFETY', 'REST', 'NONE']`
- `reason_codes`: Danh sách chuỗi mã lý do sinh học giải thích quyết định
- `decision_seed`: Chuỗi hex 64-bit hoặc `null` (nếu hoàn toàn deterministic không dùng nhánh stochastic)

### 4.2 Action Intent (`action_intent.schema.json`)
Cấu trúc Discriminated Union theo `action_type`:
- Các trường chung:
  * `schema_version`: `"1.0.0"`
  * `intent_id`: Mã định danh intent
  * `organism_id`, `species_id`: Mã cá thể và loài
  * `urgency_class`: Cấp độ khẩn cấp sinh tồn
  * `priority_score`: Trọng số ưu tiên $[0.0, 1.0]$
  * `clash_power`: Chỉ số sức mạnh tranh chấp ($\ge 0.0$)
- Biến thể payload:
  * `FORAGE`: `payload: { target_resource_type: string, requested_quantity: number > 0 }`
  * `SEEK_SHELTER`: `payload: { target_shelter_type: string, minimum_security_factor: number [0, 1] }`
  * `SEEK_MATE`: `payload: { target_criteria: { compatible_species_id: string, target_sex: "MALE" | "FEMALE" } }`
  * `FLEE`: `payload: { threat_source: "ENVIRONMENTAL_HAZARD" | "PREDATOR" | "OVERCROWDING" }`
  * `REST`: `payload: null`
  * `EXPLORE`: `payload: null`

### 4.3 Interaction Result (`interaction_result.schema.json`)
- `schema_version`: `"1.0.0"`
- `population_id`: Mã quần thể
- `simulation_tick`: Số hiệu tick
- `resource_allocations`: Bản đồ phân bổ `organism_id -> { resource_type: allocated_amount }`
- `shelter_assignments`: Bản đồ trú ẩn `organism_id -> { shelter_acquired: boolean, effective_security_factor: number }`
- `unmet_intents`: Mảng các ý định không được thỏa mãn kèm lý do (`RESOURCE_DEPLETED`, `SHELTER_FULL`, `COMPETITION_LOST`,...)
- `total_resource_claims`: Tổng lượng tài nguyên yêu cầu cam kết trừ từ `ResourcePool`

### 4.4 Biological Input Bundle (`biological_input_bundle.schema.json`)
- `schema_version`: `"1.0.0"`
- `population_id`: Mã quần thể
- `simulation_tick`: Số hiệu tick
- `organism_inputs`: Bản đồ `organism_id -> { allocated_food, shelter_security_factor, behavior_type, metabolic_activity_rate }`
- `environmental_snapshot`: Snapshot bất biến của `EnvironmentState` đầu tick

---

## 5. Phân Định Scope & Lộ Trình
- **Phase 07-A (Current)**: Specifications, Schemas, Domain Contracts, Tests Schema Validation. Tuyệt đối không viết runtime code.
- **Phase 07-B**: Behavior Decision Engine (Pure evaluation mapping, Seed derivation, Urgency classification).
- **Phase 07-C**: Interaction Resolver & Biological Input Bundle Factory (Deterministic arbitration, Conservation law).
- **Phase 07-D**: SimulationWorld Integration (Ghép nối vào pipeline 9 bước của World Tick, kiểm chứng toàn diện qua integration tests).