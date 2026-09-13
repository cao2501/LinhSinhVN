# SPATIAL WORLD & HABITAT DOMAIN ARCHITECTURE PLAN (TASK 08-A v1.2)
**LinhSinhVN — Deterministic Spatial, Habitat & Locomotion Foundation**

---

## 1. Executive Summary
Tài liệu này xác lập bản thiết kế kiến trúc chuẩn tắc (Contract-First Architectural Plan v1.2) cho domain **Spatial World & Habitat** trong dự án `LinhSinhVN`.
Mục tiêu cốt lõi của TASK 08-A v1.2:
- Phân định rạch ròi ranh giới sở hữu (ownership boundaries): SpatialWorld sở hữu không gian & vị trí; PopulationRegistry sở hữu nhân khẩu & trạng thái sống/chết.
- Hệ tọa độ nguyên tất định 100% (Signed 32-bit Integer Coordinates).
- Tách biệt rõ ràng giữa hình học không gian và sinh cảnh sinh thái (Coordinate vs Spatial Layer vs Habitat).
- Phân định rạch ròi khoảng cách hình học thuần túy (Spatial Geometric Distance) khỏi chi phí di chuyển (Movement Traversal Cost) và chi phí sinh học (Biological Energy Cost).
- Chuẩn hóa Vertical Transition Requirement và tách rời khỏi locomotion runtime.
- Định nghĩa chính xác độ phức tạp của Spatial Index $O(K \times C)$ không hardcode giới hạn gameplay $C \le 4$.
- **Tuyệt đối không can thiệp hay làm biến đổi các domain đã đóng băng (Milestones 01 -> 07-E)**.

---

## 2. Existing Architecture Audit
Rà soát toàn diện codebase tại commit `492241e`:
- **Genetics (01-03)**: Thuần túy tính toán bộ gen diploid, locus alen, kiểu hình phenotype và derived stats. Hoàn toàn phi không gian.
- **Lifecycle (04)**: Quản lý trạng thái sinh học cá thể (`OrganismState`: tuổi, giai đoạn `current_stage_id`, năng lượng `nutrition_state`, stress `stress_state`). Tuyệt đối không chứa tọa độ.
- **Reproduction (05, 06-C)**: Ghép đôi và sinh sản hạt nhân dựa trên điều kiện sinh học tương thích và scheduler. Không quản lý tọa độ spawn của con non.
- **Population & World Tick (06-A, 06-B, 07-D)**: `SimulationWorld` điều phối chu trình tick nguyên tử 4 giai đoạn (Derivation, Preflight, Commit, Telemetry).
- **Behavior & Interaction (07-A -> 07-D)**: `BehaviorDecisionEngine` phát sinh các ý định: `FORAGE`, `REST`, `SEEK_SHELTER`, `SEEK_MATE`, `FLEE`, `EXPLORE`. `InteractionResolver` cố tình không có chuyển động vật lý.
- **Telemetry & Observability (07-E)**: Quan sát thụ động sau atomic commit, deep freeze snapshot, hash digest FNV-1a 64-bit, zero simulation authority.

---

## 3. Spatial Domain Boundary
Spatial Domain được thiết kế như một hệ thống độc lập:
```
       ┌────────────────────────┐
       │   SimulationClock (t)  │
       └───────────┬────────────┘
                   │
       ┌───────────▼────────────┐
       │      SpatialWorld      │ ◄── [SPATIAL DOMAIN - TASK 08]
       │ (Grid, Habitats, Zones)│     - Sở hữu Spatial State & Coordinates
       └───────────┬────────────┘     - KHÔNG sửa đổi OrganismState
                   │                  - KHÔNG can thiệp Population membership
       ┌───────────▼────────────┐
       │ Behavior / Interaction │ ◄── [07-B / 07-C] Query vị trí & sinh cảnh
       └───────────┬────────────┘
                   │
       ┌───────────▼────────────┐
       │  Biological Simulation │ ◄── [06-B / Lifecycle] Tiêu thụ & Chuyển hóa
       └────────────────────────┘
```
- **Behavior**: Phát sinh ý định (`ActionIntent`).
- **Spatial Domain**: Cung cấp thông tin không gian (`where`), cấu trúc sinh thái (`habitat`), hình học không gian, và thực thi cập nhật vị trí trong pha Locomotion tương lai.

---

## 4. Coordinate System (ADR-08-01)
### 4.1. Dimension: Pure Integer Coordinates
$$\mathbf{P} = (x, y, z) \in \mathbb{Z}^3$$
- $x, y \in [0, W - 1] \times [0, H - 1]$: Tọa độ lưới mặt phẳng 2D.
- $z \in \mathbb{Z}$: Cao độ số nguyên (Discrete Elevation / Vertical Coordinate).
- **100% Signed 32-bit Integer**: Tuyệt đối không dùng số thực (`float`). Loại bỏ hoàn toàn sai số làm tròn floating-point giữa các CPU architectures.

### 4.2. Prototype Spatial Constraint: Stratified 4-Layer Bound (ADR-08-07)
Trong phạm vi prototype hiện tại, $z$ được ràng buộc trong miền:
$$z \in \{-1, 0, 1, 2\}$$
- $z = -1$: Tầng sâu dưới đất (`SUBTERRANEAN`)
- $z = 0$: Tầng mặt đất (`SURFACE`)
- $z = 1$: Tầng thân/cành cây (`ARBOREAL`)
- $z = 2$: Tầng không trung/tán rừng (`AERIAL`)
*Lưu ý kiến trúc cốt lõi*: Đây là **Prototype Spatial Constraint**, KHÔNG PHẢI là định nghĩa ngữ nghĩa của Habitat.

### 4.3. Origin & Axis
- Gốc $(0, 0, 0)$ đặt tại góc Tây Nam (South-West) mặt đất. Trục $+X$ hướng Đông, $+Y$ hướng Bắc, $+Z$ hướng lên trên.

---

## 5. Separation: Coordinate vs Spatial Layer vs Habitat (ADR-08-07)
Nhằm triệt tiêu hoàn toàn sự nhầm lẫn giữa "ở đâu" (`where`) và "thuộc sinh cảnh nào" (`what habitat`):
1. **SpatialCoordinate** $(x, y, z)$: Vị trí hình học thuần túy trong không gian toán học.
2. **SpatialLayer**: Phân loại hình học theo trục đứng (ví dụ $z=0$ là mặt đất, $z=1$ là trên cao).
3. **Habitat**: Khái niệm sinh thái độc lập mô tả điều kiện sinh cảnh, vật liệu nền và đặc tính thảm thực vật (`habitat_id`, `habitat_type`, `properties`). Một sinh cảnh (ví dụ: `ROTTING_WOOD`) có thể phân bố ở nhiều tọa độ và nhiều tầng $z$ khác nhau. Không đồng nhất $z$ với Habitat.
4. **Location**: Thực thể địa lý cụ thể có danh tính (`LocationId`).

---

## 6. Spatial Identity
Mọi đối tượng không gian đều sở hữu định danh xác định (Deterministic Replay-Safe Identity):
- **CellId**: `cell_<x>_<y>_<z>`
- **HabitatId**: Chuỗi định danh sinh cảnh chuẩn (`hab_decaying_wood`, `hab_soil_humus`).
- **LocationId**: `loc_<hash64(seed | x | y | z)>`.
- **ShelterId**: `shl_<hash64(seed | loc_id | index)>`.
- **ResourceZoneId**: `rzn_<hash64(seed | loc_id | res_type)>`.
Tuyệt đối không dùng UUID ngẫu nhiên, con trỏ bộ nhớ hay chỉ số mảng runtime.

---

## 7. Spatial Ownership & Synchronization Contract (ADR-08-02, ADR-08-09)
### 7.1. Phân định rạch ròi quyền sở hữu
- **PopulationRegistry (Authoritative Truth)**:
  - Sở hữu độc quyền **Tư cách thành viên nhân khẩu** (`Population Membership`).
  - Sở hữu độc quyền **Trạng thái sống/chết sinh học** (`Demographic Status: ALIVE / DEAD`).
  - Hoàn toàn KHÔNG biết về tọa độ `x, y, z`.
- **SpatialWorld (Authoritative Truth)**:
  - Sở hữu độc quyền **Tư cách thành viên không gian** (`Spatial Membership`).
  - Sở hữu độc quyền **Tọa độ thực tế** (`position: {x, y, z}`), hướng quay (`facing`), và liên kết nơi trú ẩn (`shelter_id`).
- **Khẳng định nguyên lý cốt lõi**:
  $$\text{Population Membership} \neq \text{Spatial Membership}$$

### 7.2. Synchronization Bridge Contract
- **Dòng thông tin**: Đơn chiều từ `PopulationRegistry` sang `SpatialWorld` vào giai đoạn tiền xử lý của Tick (Pre-Tick Sync Phase).
- **Cá thể chết (`DEAD`)**: SpatialWorld duy trì bản ghi vị trí của cá thể đã chết theo chính sách lưu giữ không gian (`Spatial Retention Policy`). SpatialWorld KHÔNG tự ý xóa cá thể khi phát hiện cờ `is_alive === false`. Ngữ nghĩa về xác sinh học (carcass) hay phân hủy sinh thái hoàn toàn thuộc về hợp đồng sinh thái trong tương lai (`Future Ecology / Decomposition Contract`).
- **Cá thể mới sinh (`NEWBORN`)**: Xác lập rõ đây là **Unresolved Future Spatial Spawn Contract** (thuộc Phase 08-D/08-E). Reproduction Engine trong 06-C tuyệt đối KHÔNG tự ý mutate hay gán tọa độ vào SpatialWorld. Trong Phase 08-D/08-E, một Spawn Resolver chuyên biệt sẽ nhận danh sách newborn và tính toán tọa độ ban đầu một cách tất định (ví dụ kế thừa vị trí cá thể mẹ hoặc khu vực tổ).

---

## 8. World Boundary
- **Clamped Finite Bounded Box**:
  - $x \in [0, W - 1]$, $y \in [0, H - 1]$, $z \in [-1, 2]$.
  - Tọa độ vượt biên sẽ bị chặn đứng (`clamped`) tại biên gần nhất.
- Kích thước mặc định: $W = 100, H = 100$ cells (10,000 cột, 40,000 ô không gian lập thể).

---

## 9. Habitat Model
Mỗi Habitat định nghĩa:
- `habitat_id`: Mã sinh cảnh.
- `habitat_type`: Enum (`SOIL_ORGANIC`, `FOREST_FLOOR`, `ROTTING_WOOD`, `TREE_TRUNK`, `CANOPY_AIR`).
- `traversal_cost_multiplier`: Hệ số cản trở vận động (dành cho Movement Engine).
- `shelter_security_factor`: Độ che chắn tự nhiên của nền sinh thái.
- `microclimate_modifiers`: Các độ lệch nhiệt độ/độ ẩm cục bộ.

---

## 10. Environment Relationship (ADR-08-04)
- **EnvironmentState (Task 06-B)**: Là **Global Macro-Environment** (chu kỳ ngày/đêm, mùa, khí hậu chung).
- **Habitat**: Cung cấp **Local Micro-Climate Modifiers**:
  $$\text{LocalTemp} = \text{GlobalTemp} + \Delta T_{\text{habitat}}$$
  $$\text{LocalHumidity} = \text{GlobalHumidity} \times f_{\text{humidity}}(\text{habitat})$$
- Giá trị môi trường cục bộ là **Derived On-Demand**, tuyệt đối không sao chép hay lưu trữ trùng lặp các trường của `EnvironmentState` vào Habitat.

---

## 11. Resource Zone Model (ADR-08-05)
- `ResourcePool` (Task 06-B): Giữ nguyên 100% thẩm quyền về số lượng và giải ngân hạn ngạch tài nguyên toàn cục.
- `SpatialResourceZone`: Chỉ xác định vị trí không gian $(x, y, z)$, bán kính hiện diện và loại tài nguyên (`resource_type`).
- Khi cá thể thực hiện `FORAGE`, hệ thống kiểm tra sự trùng khớp vị trí với `SpatialResourceZone` trước khi gửi nhu cầu đến `InteractionResolver` và `ResourcePool`.

---

## 12. Shelter Model
- Nơi trú ẩn (`Shelter`) là một thực thể không gian:
  - `shelter_id`: Định danh.
  - `position`: $(x, y, z)$.
  - `capacity`: Số lượng cá thể tối đa.
  - `security_factor`: Hệ số an toàn sinh học.
  - `occupants`: Danh sách cá thể đang trú ẩn.
- SpatialWorld quản lý việc ra/vào nơi trú ẩn. Tuyệt đối KHÔNG tự ý tính toán giảm stress hay giảm trao đổi chất trong Spatial Domain.

---

## 13. Occupancy Model
- **Multi-Occupancy per Cell**:
  - Mỗi ô $(x, y, z)$ có thể chứa nhiều cá thể.
  - Sức chứa cụ thể hoặc giới hạn mật độ nếu có sẽ do một Occupancy Contract chuyên biệt trong tương lai quy định; Spatial Domain 08-A không tự ý hardcode giới hạn số lượng cá thể.

---

## 14. Spatial Index Complexity (ADR-08-03)
Xác định chính xác và khoa học về độ phức tạp thuật toán:
- **Cell Lookup** (Lấy danh sách cá thể tại tọa độ chính xác $(x,y,z)$): **$O(1)$** thông qua mảng 1D phẳng:
  $$\text{Index}(x, y, z) = (z - z_{\min}) \times (W \times H) + (y \times W + x)$$
- **Neighborhood Lookup**: **$O(K \times C)$**
  - Trong đó $K$ là số cell thuộc neighborhood kernel ($K = 8$ ô lân cận nếu không tính ô tâm, hoặc $K = 9$ nếu tính cả ô tâm; quy ước mặc định trong SpatialWorld là $K = 8$).
  - $C$ là số spatial entities cần kiểm tra trong mỗi cell.
  - Độ phức tạp chỉ được coi là bounded nếu một Occupancy Contract riêng trong tương lai chính thức giới hạn $C$. Spatial 08-A không tự ý hardcode $C \le 4$.
- **Radius Query** (Tìm kiếm cá thể trong bán kính $R$): **$O(R^2 \times C)$**, phụ thuộc vào số lượng ô trong diện tích quét $\pi R^2$.
- **Nearest Entity Query** (Tìm cá thể gần nhất): **$O(N_{\text{local}})$**, tìm kiếm theo các vòng mở rộng từ tâm.

---

## 15. Adjacency & Vertical Transition Model (ADR-08-08)
Tách biệt rõ ràng giữa liên kết hình học và điều kiện vận động:
1. **Planar Adjacency (Láng giềng mặt phẳng)**:
   - Hai ô $(x_1, y_1, z)$ và $(x_2, y_2, z)$ cùng tầng là láng giềng nếu:
     $$\max(|x_1 - x_2|, |y_1 - y_2|) = 1$$
     (Mô hình 8 hướng Chebyshev).
2. **Vertical Layer Transition (Chuyển tầng đứng)**:
   - Chuyển đổi giữa $(x, y, z)$ và $(x, y, z \pm 1)$ là một loại liên kết không gian riêng biệt (`Vertical Layer Transition`), có topology riêng:
     - $z = -1 \leftrightarrow z = 0$: Subterranean $\leftrightarrow$ Surface transition
     - $z = 0 \leftrightarrow z = 1$: Surface $\leftrightarrow$ Arboreal transition
     - $z = 1 \leftrightarrow z = 2$: Arboreal $\leftrightarrow$ Aerial transition
   - **Hợp đồng trừu tượng `VerticalTransitionRequirement`**:
     - `transition_type`: Enum định nghĩa loại chuyển tầng
     - `required_capability`: Yêu cầu năng lực vận động (ví dụ: `can_burrow`, `can_climb`, `can_fly`)
     - `directionality`: Hai chiều (`BIDIRECTIONAL`) hoặc một chiều (`UNIDIRECTIONAL`)
     - `topology_availability`: Phụ thuộc vào vật thể tại tọa độ (ví dụ phải có cây/vách để leo $0 \to 1$).
   - **Phân định quyền hạn**:
     - SpatialWorld chỉ trả lời: *"Hai vị trí không gian có liên kết chuyển tầng hay không, và liên kết này yêu cầu năng lực gì"*.
     - SpatialWorld KHÔNG tự quyết định cá thể có thực hiện được hay không dựa trên sinh học, năng lượng hay tốc độ; mapping chi tiết năng lực loài là **Provisional / Future Locomotion Contract** thuộc Movement Domain (08-C).
3. **Topological Adjacency**: Liên kết ra/vào giữa Cell và Shelter/Location.

---

## 16. Distance Model (ADR-08-08)
Phân định rạch ròi khoảng cách hình học thuần túy khỏi chi phí thể lực sinh học:
1. **Canonical Geometric Grid Distance**:
   - Khoảng cách hình học không gian chuẩn tắc giữa 2 điểm $\mathbf{P}_1$ và $\mathbf{P}_2$:
     $$D_{\text{grid}}(\mathbf{P}_1, \mathbf{P}_2) = \max(|x_1 - x_2|, |y_1 - y_2|) + |z_1 - z_2| \times K_{\text{vertical}}$$
   - Trong đó $K_{\text{vertical}} = 3$ là **PROTOTYPE SPATIAL GEOMETRIC SCALING CONSTANT** (hằng số tỷ lệ hình học trục đứng prototype), KHÔNG PHẢI là biological energy coefficient hay species locomotion cost.
   - **Quy tắc phân định ba tầng**:
     - **Spatial Distance**: Thuần túy hình học do Spatial Domain sở hữu.
     - **Movement Traversal Cost**: Độ khó/thời gian di chuyển do future Locomotion Domain sở hữu (08-C).
     - **Biological Energy Cost**: Lượng calo/năng lượng tiêu hao do Lifecycle Domain sở hữu.
2. **Euclidean Distance Squared**:
   - Dùng cho bán kính nhận thức cảm giác (`perception_radius`) và âm thanh (`stridulation`):
     $$D^2_{\text{euclid}}(\mathbf{P}_1, \mathbf{P}_2) = (x_1 - x_2)^2 + (y_1 - y_2)^2 + [(z_1 - z_2) \times K_z]^2$$
   - $K_z = 2$ là **PROTOTYPE SPATIAL AXIS SCALING CONSTANT**, không phải biological coefficient. So sánh trực tiếp theo bình phương khoảng cách để bảo đảm 100% số nguyên, không dùng căn bậc hai dấu phẩy động.

---

## 17. Movement Readiness (Chuẩn bị cho Phase 08-C)
Spatial Domain thiết lập đầy đủ các giao diện chuẩn để Phase 08-C (Movement Runtime) hoạt động:
- Cung cấp tọa độ hiện tại (`position`), hướng quay (`facing`).
- Cung cấp danh sách ô láng giềng hợp lệ và yêu cầu chuyển tầng (`VerticalTransitionRequirement`).
- Nhận kết quả cập nhật vị trí sau khi Locomotion Engine đã giải quyết xong va chạm và chi phí thể lực.

---

## 18. Spatial Events
Các sự kiện không gian phát sinh trong chu trình tick được định nghĩa độc lập (không tiêm vào Lifecycle Events):
- `SPATIAL_ORGANISM_MOVED`: `{ organism_id, from, to, distance }`
- `SPATIAL_SHELTER_ENTERED`: `{ organism_id, shelter_id }`
- `SPATIAL_SHELTER_EXITED`: `{ organism_id, shelter_id }`
- `SPATIAL_HABITAT_TRANSITION`: `{ organism_id, from_habitat, to_habitat }`
Được đóng gói riêng vào trường `spatial_events` của tick result.

---

## 19. Deterministic Ordering (ADR-08-06)
- Danh sách cá thể trong cùng một cell: Sắp xếp theo `organism_id ASC`.
- Danh sách cells: $z$ ASC $\to y$ ASC $\to x$ ASC.
- Danh sách sự kiện không gian: `simulation_tick ASC \to organism_id ASC \to order_index ASC \to event_id ASC`.

---

## 20. Seed Contracts
Khi không gian cần yếu tố xác suất tất định (phát tán tài nguyên hoặc sinh cảnh ngẫu nhiên):
$$\text{SpatialSeed} = \text{Hash64}(\text{SimulationSeed} \parallel \text{PopulationId} \parallel \text{SimulationTick} \parallel \text{"SPATIAL"} \parallel \text{EntityId})$$
Tách rời hoàn toàn khỏi Behavior PRNG seed domain.

---

## 21. Serialization
Toàn bộ trạng thái `SpatialWorld` có thể serialize thành JSON chuẩn tắc:
- `schema_version`: '1.0.0'
- `dimensions`: `{ width, height, strata: [-1, 0, 1, 2] }`
- `habitats`: Danh mục sinh cảnh.
- `entities`: Mảng vị trí cá thể `{ organism_id, position, facing }` sort theo `organism_id ASC`.
- `shelters`: Danh sách nơi trú ẩn.
- `resource_zones`: Danh sách vùng tài nguyên.

---

## 22. Telemetry Compatibility
- Telemetry Subsystem (07-E) là post-commit observer.
- Trong Phase 08-F, kết quả `spatial_world_tick_result` sẽ được snapshot thụ động qua trường `result.spatial`, không tạo quan hệ phụ thuộc ngược (`Telemetry \to Spatial`).

---

## 23. Transaction Boundary
Vị trí tích hợp đề xuất trong chu trình World Tick (Phase 08-E):
$$\text{Macro Env} \to \mathbf{Spatial\ Locomotion\ Phase} \to \text{Behavior} \to \text{Interaction} \to \text{Biology} \to \text{Repro} \to \text{Ecology} \to \text{Commit} \to \text{Telemetry}$$
Cá thể cập nhật vị trí không gian trước khi Behavior Engine đánh giá môi trường xung quanh để đưa ra quyết định hành vi.

---

## 24. Ownership Matrix
| Đối tượng / Khái niệm | Authoritative Owner | Readers | Mutators | Quyền hạn bị cấm |
| :--- | :--- | :--- | :--- | :--- |
| **Organism Identity** | PopulationRegistry | Mọi domain | PopulationRegistry | Spatial không tạo organism_id |
| **Population Membership** | PopulationRegistry | Spatial, Behavior | PopulationRegistry | Spatial KHÔNG tự xóa cá thể chết |
| **Alive / Dead State** | Lifecycle / PopRegistry | Spatial, Ecology | Lifecycle Runtime | Spatial KHÔNG quyết định tử vong |
| **Organism Position** | SpatialWorld | Behavior, Telemetry | Locomotion (08-C) | OrganismState KHÔNG lưu position |
| **Spatial Membership** | SpatialWorld | Query Engine | SpatialWorld | PopRegistry KHÔNG quản lý spatial membership |
| **Spatial Index** | SpatialWorld (Derived) | Spatial Query | SpatialWorld | Không tạo index ngoài SpatialWorld |
| **Habitat Definitions** | Data / HabitatRegistry | Spatial, Behavior | Data Loader | Không hardcode loài vào habitat |
| **Macro Environment** | EnvironmentState | Spatial, Biology | EcologyProvider | Spatial KHÔNG ghi đè Environment |
| **Resource Quota** | ResourcePool | Ecology, PopTick | Coordinator, Pool | Spatial KHÔNG quản lý tổng quota |
| **Resource Location** | SpatialResourceZone | Behavior, Spatial | SpatialWorld | ResourcePool KHÔNG lưu tọa độ |
| **Shelter Entity** | ShelterRegistry | Behavior, Spatial | SpatialWorld | Không tính toán sinh học trong shelter |
| **Movement Intent** | BehaviorDecisionEngine | Locomotion (08-C) | Behavior Engine | Behavior KHÔNG teleport cá thể |
| **Movement Execution** | LocomotionRuntime (08-C)| SpatialWorld | Locomotion | Spatial 08-A KHÔNG chạy movement |
| **Spatial Events** | SpatialWorld | Telemetry | SpatialWorld | Không tiêm vào Lifecycle Events |

---

## 25. Architecture Decision Records (ADR Summary)
- **ADR-08-01**: 2.5D Stratified Discrete Integer Grid $(x, y, z) \in \mathbb{Z}^3$.
- **ADR-08-02**: Tách biệt quyền sở hữu không gian: SpatialWorld sở hữu position; PopulationRegistry sở hữu membership.
- **ADR-08-03**: Uniform Grid Flat Array Index với độ phức tạp $O(K \times C)$ không hardcode $C \le 4$.
- **ADR-08-04**: Macro Environment toàn cục kết hợp Micro Habitat Modifiers dẫn xuất on-demand.
- **ADR-08-05**: Hạn ngạch tài nguyên toàn cục (ResourcePool) kết hợp vị trí phát tán (SpatialResourceZone).
- **ADR-08-06**: Trật tự sắp xếp chuẩn tắc theo `organism_id ASC` trên mọi cấu trúc dữ liệu không gian.
- **ADR-08-07**: Tách biệt rõ ràng Coordinate hình học vs Phân tầng không gian prototype vs Ngữ nghĩa sinh cảnh (Habitat).
- **ADR-08-08**: Tách bạch khoảng cách hình học khỏi chi phí vận động/sinh học; chuẩn hóa Vertical Transition Requirement.
- **ADR-08-09**: Quản lý độc lập cá thể chết và xác lập Unresolved Future Contract cho việc định vị con non mới sinh.

---

## 26. Traceability Matrix đối chiếu 30 yêu cầu của Game Director
| STT | Yêu cầu gốc của Game Director | Section trong Plan v1.2 | Trạng thái | Quyết định kiến trúc chính |
| :---: | :--- | :--- | :---: | :--- |
| 1 | Mission & Scope (Contract-First) | Section 1, 3 | ✅ Đạt | Chỉ định nghĩa contract, 0 runtime code |
| 2 | Frozen Architecture (01 -> 07-E) | Section 2, 30 | ✅ Đạt | Giữ nguyên 100% các domain đóng băng |
| 3 | Core Boundary (Spatial != Behavior) | Section 3 | ✅ Đạt | Spatial là domain độc lập ngang hàng |
| 4 | Spatial State != Biological State | Section 5, 7, 24 | ✅ Đạt | OrganismState không chứa tọa độ |
| 5 | Coordinate System (Dimension/Type) | Section 4 (ADR-08-01) | ✅ Đạt | 2.5D Pure Signed Integer Grid |
| 6 | Coordinate Determinism & Precision | Section 4 (ADR-08-01) | ✅ Đạt | Số nguyên thuần túy, 0 float drift |
| 7 | Coordinate Origin & Axis | Section 4.3 | ✅ Đạt | Gốc SW (0,0,0), +X Đông, +Y Bắc, +Z Lên |
| 8 | Spatial Identity Contracts | Section 6 | ✅ Đạt | Định danh tất định dựa trên hash và tọa độ |
| 9 | Organism Spatial State Fields | Section 7.1 | ✅ Đạt | position, facing, shelter_id, cooldown |
| 10 | World Boundary (Finite vs Unbounded) | Section 8 | ✅ Đạt | Finite Clamped Box $W \times H \times Z$ |
| 11 | Habitat Contract (Species Decoupled)| Section 9 | ✅ Đạt | Habitat độc lập, không hardcode loài |
| 12 | Habitat <-> Environment Relationship| Section 10 (ADR-08-04)| ✅ Đạt | Macro Environment + On-Demand Micro Delta |
| 13 | Spatial Resource Zones | Section 11 (ADR-08-05)| ✅ Đạt | ResourcePool giữ quota, Zone giữ vị trí |
| 14 | Shelter Spatial Contract | Section 12 | ✅ Đạt | Shelter có tọa độ/capacity, 0 gameplay math |
| 15 | Spatial Occupancy Model | Section 13 | ✅ Đạt | Multi-occupancy, không hardcode giới hạn |
| 16 | Spatial Index (Grid vs Hash vs Tree)| Section 14 (ADR-08-03)| ✅ Đạt | Uniform Grid 1D Flat Array |
| 17 | Spatial Index Complexity Claims | Section 14 | ✅ Đạt | O(1) cell lookup, O(K*C) neighbor, O(R^2*C) radius |
| 18 | Adjacency Model | Section 15 (ADR-08-08)| ✅ Đạt | Tách Planar 8-neighbor và Vertical Transition |
| 19 | Distance Semantics | Section 16 (ADR-08-08)| ✅ Đạt | Tách geometric distance khỏi traversal/energy cost |
| 20 | Movement Readiness (Phase 08-C) | Section 17 | ✅ Đạt | Chuẩn bị đầy đủ locomotion inputs |
| 21 | Spatial Events Contract | Section 18 | ✅ Đạt | Namespace riêng, không tiêm vào Lifecycle |
| 22 | Deterministic Ordering | Section 19 (ADR-08-06)| ✅ Đạt | Sắp xếp chuẩn tắc theo organism_id ASC |
| 23 | Spatial Seed Domain | Section 20 | ✅ Đạt | Tách rời PRNG seed domain bằng hash64 |
| 24 | Serialization Contract | Section 21 | ✅ Đạt | JSON Schema round-trip khép kín |
| 25 | Telemetry Compatibility | Section 22 | ✅ Đạt | Post-commit observation qua result.spatial |
| 26 | Transaction Boundary in World Tick | Section 23 | ✅ Đạt | Spatial Locomotion trước Behavior Evaluation |
| 27 | Ownership Matrix | Section 24 | ✅ Đạt | Ma trận phân định thẩm quyền chi tiết |
| 28 | Proposed Schemas & Modules | Section 27, 28 | ✅ Đạt | Đề xuất danh sách file cho 08-B+ |
| 29 | Test Architecture Matrix | Section 29 | ✅ Đạt | 18 Test cases bao phủ toàn diện |
| 30 | Mandatory ADRs | Section 25 | ✅ Đạt | 9 ADR đầy đủ Context, Options, Decision |

---

## 27. Proposed Schemas (Dự kiến cho các Phase tiếp theo)
1. `data/spatial/schema/spatial_coordinate.schema.json`
2. `data/spatial/schema/spatial_entity_state.schema.json`
3. `data/spatial/schema/habitat_definition.schema.json`
4. `data/spatial/schema/spatial_location.schema.json`
5. `data/spatial/schema/shelter_definition.schema.json`
6. `data/spatial/schema/spatial_world_snapshot.schema.json`

---

## 28. Proposed Runtime Modules (Dự kiến cho Phase 08-B+)
- `game/spatial/coordinates.js`
- `game/spatial/spatial_grid.js`
- `game/spatial/habitat_registry.js`
- `game/spatial/shelter_registry.js`
- `game/spatial/spatial_world.js`
- `game/spatial/index.js`

---

## 29. Test Architecture Matrix (Dự kiến cho Task 08)
- `TC-SPATIAL-01`: Tọa độ nguyên hợp lệ $(x, y, z)$
- `TC-SPATIAL-02`: Serialize tọa độ tất định
- `TC-SPATIAL-03`: Định danh không gian tất định từ seed
- `TC-SPATIAL-04`: Giới hạn biên bản đồ thế giới
- `TC-SPATIAL-05`: Ràng buộc thuộc tính Habitat
- `TC-SPATIAL-06`: Trọng tải cư trú của ô (Multi-occupancy consistency)
- `TC-SPATIAL-07`: Tính tất định của Spatial Index
- `TC-SPATIAL-08`: Tính láng giềng 8-neighbor và vertical transition contract
- `TC-SPATIAL-09`: Khoảng cách Chebyshev hình học và Euclidean squared
- `TC-SPATIAL-10`: Sắp xếp chuẩn tắc `organism_id ASC`
- `TC-SPATIAL-11`: Giữ lại cá thể chết trên không gian
- `TC-SPATIAL-12`: Không xâm lấn `PopulationRegistry`
- `TC-SPATIAL-13`: Không làm biến tính `EnvironmentState`
- `TC-SPATIAL-14`: Không làm biến tính `ResourcePool`
- `TC-SPATIAL-15`: Tái lập tất định 100 lần chạy độc lập
- `TC-SPATIAL-16`: Round-trip snapshot serialization
- `TC-SPATIAL-17`: Quét cấm API ngẫu nhiên không hạt giống
- `TC-SPATIAL-18`: Cô lập hoàn toàn các frozen domains

---

## 30. Frozen Domain Impact Audit
- **Milestones 01 -> 07-E**: **100% UNTOUCHED**.
- Working tree: Clean 100% (chỉ cập nhật tài liệu thiết kế `docs/SPATIAL_ARCHITECTURE_PLAN.md`).
- Không có bất kỳ dòng code nào trong `game/` hay `tests/` bị thay đổi.
