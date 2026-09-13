# TASK 08-C — LOCOMOTION & MOVEMENT TRAVERSAL COST SPECIFICATION
**LinhSinhVN — Deterministic Spatial, Habitat & Locomotion Foundation**
**Status: SPECIFICATION ONLY (PATCH v1.1 — PROPOSED TO GAME DIRECTOR)**

---

## I. Architectural Principles & Position Authority (Patch 01)
1. **Core Invariant: Isolation of Movement Cost**:
   $$\mathbf{MOVEMENT\ COST \neq BIOLOGICAL\ ENERGY\ EXPENDITURE}$$
   - **Spatial Traversal Cost**: Đo lường độ trở ngại không gian thuần túy bằng điểm chi phí gameplay (`SPATIAL_COST_POINTS`). Thuộc thẩm quyền độc quyền của Spatial / Locomotion Domain.
   - **Biological Energy Expenditure**: Lượng năng lượng tiêu hao cho sự sống và trao đổi chất. Thuộc thẩm quyền độc quyền của Lifecycle Domain.
   - **Zero Translation in 08-C**: TASK 08-C tuyệt đối KHÔNG chuyển đổi traversal cost thành hao hụt năng lượng sinh học, đói khát hay tử vong.
   - **Zero ResourcePool Mutation**: TASK 08-C tuyệt đối KHÔNG tiêu thụ hoặc tương tác với tài nguyên toàn cục trong `ResourcePool`.

2. **Position Authority (Single Source of Truth)**:
   - **SpatialWorld** là **chủ sở hữu chuẩn tắc duy nhất (Sole Authoritative Owner)** của trạng thái không gian:
     - Tư cách thành viên không gian (`Spatial Membership`).
     - Tọa độ vị trí thực tế của sinh vật (`actual position: P = (x, y, z)`).
     - Hướng quay (`facing`).
     - Trạng thái trú ẩn / vị trí (`shelter / spatial state`).
   - **SpatialEntityRegistry** là **cơ chế lưu trữ / sổ bộ nội bộ (Internal Storage / Registry Mechanism)** bên trong miền của `SpatialWorld`. Nó tuyệt đối KHÔNG PHẢI là nguồn sự thật thứ hai độc lập.
   - **SpatialIndex** là **cấu trúc gia tốc thứ cấp thuần túy (Derived Acceleration Structure)**, có thể tái tạo tức thì từ `SpatialEntityRegistry` mà không làm thay đổi ngữ nghĩa.
   - **Bất biến kiến trúc tuyệt đối**:
     $$\text{Mỗi sinh vật có duy nhất MỘT vị trí không gian chuẩn tắc (Exactly one canonical spatial position).}$$
   - `Locomotion Domain` là miền quyết định và thẩm định (`Decision / Validation / Traversal Domain`), không sở hữu tọa độ và không trở thành nguồn sự thật thứ hai.

---

## II. Topology vs Capability Separation (Patch 02)
Phân định rạch ròi giữa quyền sở hữu cấu trúc thế giới (`Topology`) và năng lực của sinh vật (`Capability`):

1. **Topology sở hữu (SpatialWorld / Habitat Domain)**:
   - Danh mục các liên kết chuyển dịch không gian khả dụng (`available spatial transitions`).
   - Các liên kết bị chặn hoặc không thể đi qua (`blocked transitions`).
   - Yêu cầu năng lực để vượt qua liên kết (`transition requirements`).
2. **Capability sở hữu (Organism / Species Domain)**:
   - Các năng lực vận động hiện có của sinh vật (`locomotion abilities available to the organism`).
   - Tham số chế độ vận động (`locomotion mode parameters`, ví dụ: `speed_modifier`).
   - Hệ số điều chỉnh riêng của từng năng lực (`capability-specific modifiers`).
   - **Lưu ý**: Các trường `supported_layers` và `supported_transitions` trong hồ sơ năng lực chỉ là **dữ liệu tương thích giải phẫu (capability compatibility / support data)** của sinh vật; chúng tuyệt đối KHÔNG PHẢI là nguồn cấu hình thế giới (authoritative world topology).
3. **Traversal Validation (Miền tương tác)**:
   - Đọc dữ liệu địa hình (`Topology`).
   - Đọc năng lực của sinh vật (`Capability`).
   - Đánh giá xem năng lực của sinh vật có đáp ứng yêu cầu của địa hình hay không.
   - Tuyệt đối không để dữ liệu Capability tự suy diễn ra Topology của thế giới.

Mô hình năng lực: Dạng bản ghi cấu trúc data-driven (`Structured Capability Records` — Phương án C), không hardcode species ID, schema: `data/spatial/schema/locomotion_capability.schema.json`.

---

## III. Traversal Contract
Hợp đồng thẩm định di chuyển là hàm thuần túy (**Pure Traversal-Validation Contract**):
$$\text{validateTraversal}(\text{request}, \text{spatialWorld}) \to \text{TraversalResult}$$

### 1. Đầu vào (TraversalRequest)
- `organism_id`: Mã định danh sinh vật.
- `from`: Tọa độ nguồn $(x_1, y_1, z_1)$.
- `to`: Tọa độ đích $(x_2, y_2, z_2)$.
- `locomotion_mode`: Năng lực được chọn cho bước di chuyển này (`CRAWL`, `BURROW`, `FLIGHT`).
- `capabilities`: Danh sách năng lực vận động hiện có của sinh vật.

### 2. Đầu ra (TraversalResult)
- `status`: `VALID` hoặc `INVALID`.
- `reason`: Mã lý do tất định khi `INVALID` (xem bảng dưới).
- `cost`: Bản ghi chi phí di chuyển không gian (`MovementCost`).
- `target_facing`: Hướng quay kết quả (`NORTH`, `EAST`, v.v.).

### 3. Bảng mã lý do tất định (Deterministic Reason Codes)
| Reason Code | Thứ tự ưu tiên | Điều kiện kích hoạt |
| :--- | :--- | :--- |
| **INVALID_COORDINATE** | 1 | Tọa độ đích không phải số nguyên có dấu 32-bit hợp lệ (float, NaN, ngoài Int32) |
| **OUT_OF_BOUNDS** | 2 | Tọa độ đích nằm ngoài biên giới thế giới ($x, y$ ngoài $[0, W-1] \times [0, H-1]$, $z$ ngoài $[z_{\min}, z_{\max}]$) |
| **DEAD_ORGANISM** | 3 | Sinh vật đã chết theo hồ sơ nhân khẩu hoặc có cờ spatial retention |
| **SAME_POSITION** | 4 | Tọa độ đích trùng hoàn toàn với tọa độ nguồn ($dx = 0, dy = 0, dz = 0$) |
| **CAPABILITY_REQUIRED** | 5 | Chế độ vận động yêu cầu không có hoặc không kích hoạt trên sinh vật |
| **UNSUPPORTED_TRANSITION** | 6 | Năng lực vận động không hỗ trợ loại chuyển tầng tương ứng |
| **TOPOLOGY_BLOCKED** | 7 | Địa hình thế giới không có liên kết hợp lệ tại tọa độ yêu cầu |

---

## IV. Movement Cost Formula & Constants (Patch 04)
Chi phí di chuyển không gian được tính toán theo công thức chuẩn tắc, hoàn toàn độc lập với năng lượng sinh học:

### 1. Công thức chi phí chuẩn tắc
$$\text{base\_cost} = \text{grid\_distance} \times K_{\text{step}}$$
$$\text{transition\_cost} = \begin{cases} K_{\text{vertical\_cost}} & \text{khi di chuyển vượt qua một liên kết chuyển tầng đứng (vertical transition)} \\ 0 & \text{khi di chuyển planar trên cùng một tầng Z} \end{cases}$$
$$\mathbf{total\_cost} = \text{base\_cost} + \text{transition\_cost}$$

### 2. Gameplay Prototype Spatial Constants
- $K_{\text{step}} = 10$ (Hằng số chi phí bước di chuyển planar prototype).
- $K_{\text{vertical\_cost}} = 30$ (Hằng số chi phí chuyển tầng đứng prototype).
- Cả hai hằng số trên được định danh rõ ràng là:
  $$\mathbf{"gameplay\ prototype\ spatial\ constants"}$$
- **Đơn vị chi phí**: `SPATIAL_COST_POINTS`.
- **Nghiêm cấm tuyệt đối**:
  - Không sửa đổi `stored_energy` của sinh vật.
  - Không tính toán tiêu hao trao đổi chất (`metabolic expenditure`).
  - Không tương tác với nạn đói (`starvation`) hay kích hoạt tử vong (`death`).
  - Không tiêu thụ tài nguyên trong `ResourcePool`.
  - Movement cost thuần túy là hạch toán không gian gameplay (`spatial gameplay accounting only`).

---

## V. Vertical Movement & Declarative Topology (Patch 03)
1. **Bảo toàn hằng số hình học đã đóng băng (08-A & 08-B)**:
   - $z$ là trục tọa độ hình học (Discrete Vertical Coordinate), **KHÔNG PHẢI là Habitat** hay độ sâu sinh học.
   - Chuyển tầng đứng là topology riêng biệt, tách rời khỏi láng giềng planar 8 hướng.
   - $K_{\text{vertical}} = 3$ cho Canonical Grid Distance: $D_{\text{grid}} = \max(|dx|, |dy|) + |dz| \times 3$.
   - $K_z = 2$ cho Euclidean Distance Squared: $D^2_{\text{euclid}} = dx^2 + dy^2 + (dz \times 2)^2$.

2. **Tính khai báo của Vertical Topology**:
   - Topology chuyển tầng đứng là **khai báo (Declarative Topology)**: mỗi liên kết tầng đứng công bố danh mục năng lực vận động cần thiết (`required locomotion capabilities`).
   - Mối liên hệ cụ thể giữa chuyển tầng và năng lực (ví dụ $z=-1 \leftrightarrow 0$ cần BURROW, $z=0 \leftrightarrow 1$ cần CRAWL, $z=1 \leftrightarrow 2$ cần FLIGHT) là:
     $$\mathbf{"gameplay\ prototype\ configuration"}$$
   - **Tuyệt đối không biến các cấu hình prototype này thành quy tắc không gian phổ quát bất biến**. Trong tương lai, các liên kết đứng có thể do cấu hình dữ liệu địa hình (hang đào nhân tạo, dây leo, cầu treo) quyết định.

3. **Nguyên tắc FLIGHT không dịch chuyển tức thời (No Teleportation)**:
   - Năng lực `FLIGHT` tuân thủ nghiêm ngặt hợp đồng di chuyển từng bước (`single-step traversal`).
   - Không cho phép nhảy tức thời qua nhiều ô planar ($(x, y) \to (x+20, y+20)$) trong một bước đơn lẻ chỉ vì có `FLIGHT`.
   - `FLIGHT` cho phép thực hiện chuyển tầng trực tiếp từ mặt đất lên không trung ($z = 0 \to 2$ hoặc $z = 1 \to 2$) nếu topology thế giới mở, và di chuyển tự do giữa các ô láng giềng ở tầng $z = 2$.

---

## VI. Habitat Resistance Boundary (Patch 05)
1. **Điểm mở rộng không gian (Spatial Extension Point)**:
   - TASK 08-C thiết lập một điểm mở rộng tùy chọn cho hệ số cản trở không gian:
     $$\text{optional spatial resistance modifier}$$
2. **Phân định ranh giới sở hữu với TASK 08-D**:
   - Thẩm quyền sở hữu, ngữ nghĩa sinh thái, và công thức chi tiết của hệ số cản trở theo sinh cảnh thuộc về độc quyền của **TASK 08-D (Habitat & Spatial Ecology)**.
   - **Khẳng định**:
     $$\mathbf{TASK\ 08-C\ does\ not\ own\ habitat\ resistance\ semantics.}$$

---

## VII. Future Runtime Movement Transaction Model
Khi được cấp quyền triển khai runtime, luồng giao dịch di chuyển tuân thủ chu trình 3 pha nghiêm ngặt:
$$\mathbf{PLAN} \longrightarrow \mathbf{VALIDATE\ (Pure\ Read-Only)} \longrightarrow \mathbf{COMMIT\ (Atomic\ Execution)}$$

1. **PLAN Phase (Pure Read-Only)**:
   - Nhận ý định di chuyển từ Behavior hoặc Script.
   - Xác định tọa độ đích mong muốn và năng lực vận động.
2. **VALIDATE Phase (Pure Read-Only)**:
   - Gọi `validateTraversal(request, spatialWorld)`.
   - Đọc topology, đọc năng lực, tính toán chi phí không gian `MovementCost`.
   - **Không làm thay đổi bất kỳ byte nào trong SpatialWorld**.
3. **COMMIT Phase (Atomic Execution)**:
   - Nếu `status === 'VALID'`: Gọi `spatialWorld.updateEntityPosition(entity_id, to, target_facing)`. Cả registry và derived index cập nhật đồng thời.
   - Nếu `status === 'INVALID'`: Hủy bỏ giao dịch, không có cập nhật nào xảy ra (`SpatialWorld` giữ nguyên $100\%$).
   - **Khẳng định**: TASK 08-C chỉ đặc tả hợp đồng, **KHÔNG triển khai runtime này**.

---

## VIII. Pathfinding Boundary
Xác lập ranh giới rõ ràng giữa Locomotion và Pathfinding:
- **Locomotion (TASK 08-C)**: Thẩm định tính hợp lệ của **một bước di chuyển trực tiếp (single-step traversal)** giữa ô hiện tại và ô đích láng giềng / liên kết tầng, tính toán chi phí không gian cho bước đi đó.
- **Pathfinding (Future Task)**: Thuật toán tìm chuỗi các bước di chuyển (A*, Dijkstra) từ điểm xuất phát đến mục tiêu xa.
- **Quy tắc phân tầng**: Pathfinding tiêu thụ các quy tắc hợp lệ của Locomotion; Locomotion hoàn toàn độc lập và **KHÔNG phụ thuộc vào Pathfinding**.

---

## IX. Required Authority & Ownership Matrix (Patch 06)
| Domain / Khái niệm | Authoritative Owner | Readers | May Mutate | FORBIDDEN MUTATORS |
| :--- | :--- | :--- | :--- | :--- |
| **POSITION** | SpatialWorld | Locomotion, Behavior, Telemetry | Locomotion (future commit phase) | OrganismState, Behavior, PopRegistry, SpatialIndex |
| **CAPABILITY** | Locomotion / Species Profile | SpatialWorld, Behavior | Data Loader | SpatialWorld, Lifecycle, ResourcePool |
| **TOPOLOGY** | SpatialWorld / Habitat | Locomotion, Query | SpatialWorld | Organism Capability, Behavior, Locomotion |
| **MOVEMENT COST** | Locomotion | World Tick, Telemetry | Locomotion | Lifecycle, ResourcePool, Genetics |
| **BIOLOGICAL ENERGY** | Lifecycle Domain | Biological Tick | Lifecycle Runtime | SpatialWorld, Locomotion, Behavior |
| **RESOURCE QUANTITY** | ResourcePool | Ecology, PopTick | Coordinator, ResourcePool | SpatialWorld, Locomotion, Movement Cost |
| **SPATIAL INDEX** | SpatialWorld (Derived) | Locomotion, Spatial Query | SpatialWorld | Locomotion, External callers |
| **MACRO ENVIRONMENT** | EnvironmentState | Biology, Spatial | EcologyProvider | Locomotion, SpatialWorld |

---

## X. Determinism Rules
1. **Loại trừ tuyệt đối các API phi tất định**: Không `Math.random()`, không `Date.now()`, không `new Date()`, không `crypto.randomUUID()`, không `crypto.getRandomValues()`.
2. **Không dùng PRNG Seed ngẫu nhiên**: Thẩm định di chuyển và tính chi phí là các hàm toán học tất định $100\%$, không có yếu tố xác suất.
3. **Thứ tự mã lỗi cố định (Reason-code ordering)**: Tuân thủ thứ tự ưu tiên bất biến:
   1. `INVALID_COORDINATE` $\to$ 2. `OUT_OF_BOUNDS` $\to$ 3. `DEAD_ORGANISM` $\to$ 4. `SAME_POSITION` $\to$ 5. `CAPABILITY_REQUIRED` $\to$ 6. `UNSUPPORTED_TRANSITION` $\to$ 7. `TOPOLOGY_BLOCKED`.

---

## XI. Schema Specifications
4 JSON schemas chuẩn Draft-07 dưới thư mục `data/spatial/schema/`:
1. `locomotion_capability.schema.json`: Cấu trúc năng lực vận động (capability-owned compatibility list).
2. `movement_cost.schema.json`: Cấu trúc chi phí không gian (`grid_distance`, `base_cost`, `transition_cost`, `total_cost`, unit: `SPATIAL_COST_POINTS`).
3. `traversal_request.schema.json`: Cấu trúc yêu cầu thẩm định di chuyển đơn bước.
4. `traversal_result.schema.json`: Cấu trúc kết quả thẩm định (`status`, `reason`, `cost`, `target_facing`).

---

## XII. Future Test Matrix
Khi được cấp quyền triển khai, bộ test suite 08-C bắt buộc bao phủ ít nhất 17 test cases cốt lõi:
1. `TC-LOCO-01`: Valid same-z planar movement.
2. `TC-LOCO-02`: Invalid coordinate rejection (float, NaN, out of Int32 range).
3. `TC-LOCO-03`: Out-of-bounds destination rejection.
4. `TC-LOCO-04`: Dead organism rejection (`DEAD_ORGANISM`).
5. `TC-LOCO-05`: Capability-required traversal.
6. `TC-LOCO-06`: Blocked topology rejection.
7. `TC-LOCO-07`: Unsupported vertical transition rejection.
8. `TC-LOCO-08`: Same-position rejection (`SAME_POSITION`).
9. `TC-LOCO-09`: Deterministic movement cost calculation ($K_{\text{step}} = 10, K_{\text{vertical\_cost}} = 30$).
10. `TC-LOCO-10`: Cost non-negativity (chi phí luôn $\ge 0$).
11. `TC-LOCO-11`: Zero biological-energy coupling (không trừ năng lượng sinh học).
12. `TC-LOCO-12`: Zero ResourcePool mutation.
13. `TC-LOCO-13`: Pure validation (thẩm định không làm đổi SpatialWorld).
14. `TC-LOCO-14`: Deterministic serialization của `TraversalResult`.
15. `TC-LOCO-15`: Pathfinding independence (không có module tìm đường).
16. `TC-LOCO-16`: Authority boundary (SpatialWorld giữ độc quyền vị trí).
17. `TC-LOCO-17`: 100-replay determinism.

---

## XIII. Architecture Traceability (Patch 08)
Phân định rạch ròi giữa 3 cấp độ kiến trúc:

| Hạng mục kiến trúc | 08-A / 08-B LOCKED INVARIANT | 08-C EXTENSION | PROTOTYPE CONFIGURATION |
| :--- | :--- | :--- | :--- |
| **Coordinate Model** | Signed 32-bit Integer ($x, y, z \in \mathbb{Z}^3$) | Kiểm tra tại `TraversalRequest` | Boundary $100 \times 100 \times [-1, 2]$ |
| **Z-Strata Semantics** | $z$ là hình học, không phải habitat | Topology tách rời khỏi capability | $z \in \{-1, 0, 1, 2\}$ dải tầng prototype |
| **Planar Adjacency** | Chebyshev khoảng cách 1 trên cùng tầng $z$ | Thẩm định bước đi 1 ô planar | Hướng quay `facing` 8 hướng |
| **Vertical Topology** | Khai báo topology chuyển tầng riêng | Thẩm định điều kiện vượt tầng | $z=-1 \leftrightarrow 0, 0 \leftrightarrow 1, 1 \leftrightarrow 2$ |
| **Grid Distance** | $D_{\text{grid}} = \max(|dx|, |dy|) + |dz| \times K_v$ | Dùng tính `grid_distance` | $K_{\text{vertical}} = 3$ |
| **Euclidean Squared** | $D^2_{\text{euclid}} = dx^2 + dy^2 + (dz \cdot K_z)^2$ | Giữ nguyên cho cảm giác/âm thanh | $K_z = 2$ |
| **Position Authority** | SpatialWorld sở hữu độc quyền vị trí | Locomotion chỉ thẩm định, không sở hữu | SpatialEntityRegistry lưu trữ nội bộ |
| **Spatial Index** | Derived Acceleration Structure | Locomotion không can thiệp index | Tái tạo qua `rebuildIndex` |
| **Membership Separation** | PopMembership $\neq$ SpatialMembership | Traversal yêu cầu spatial entity hợp lệ | Retention khi cá thể chết |
| **Dead Spatial Retention** | Cá thể chết lưu vết không gian | Từ chối di chuyển (`DEAD_ORGANISM`) | Không xử lý carcass/phân hủy |
| **Movement Cost** | Tách rời khỏi chi phí sinh học | Hạch toán `SPATIAL_COST_POINTS` | $K_{\text{step}} = 10, K_{\text{vertical\_cost}} = 30$ |
| **Habitat Resistance** | Local microclimate & terrain multiplier | Extension point tùy chọn | Chi tiết thuộc về TASK 08-D |

---

## XIV. Explicit Answers to the 10 Review Questions (Patch 07)
1. **Who owns the organism's actual position?**
   - **SpatialWorld** là chủ sở hữu thẩm quyền duy nhất (`sole authoritative owner`) của vị trí thực tế $(x, y, z)$. `SpatialEntityRegistry` chỉ là cơ chế lưu trữ nội bộ của SpatialWorld, không phải nguồn độc lập.
2. **Can Locomotion mutate SpatialWorld during validation?**
   - **Tuyệt đối KHÔNG**. Pha thẩm định (`validateTraversal`) là hàm thuần túy read-only.
3. **Can Movement Cost modify biological energy?**
   - **Tuyệt đối KHÔNG**. $\mathbf{MOVEMENT\ COST \neq BIOLOGICAL\ ENERGY\ EXPENDITURE}$. Chi phí chỉ là điểm không gian gameplay (`SPATIAL_COST_POINTS`).
4. **Can Movement Cost consume ResourcePool?**
   - **Tuyệt đối KHÔNG**. Zero tương tác với `ResourcePool`.
5. **Can Behavior directly modify coordinates?**
   - **Tuyệt đối KHÔNG**. Behavior chỉ phát sinh `ActionIntent`.
6. **Can SpatialIndex become a source of truth?**
   - **Tuyệt đối KHÔNG**. `SpatialIndex` thuần túy là Derived Data, tái tạo từ registry.
7. **Does vertical movement require a locomotion capability?**
   - **CÓ, nhưng không có ánh xạ phổ quát cứng**. Topology thế giới khai báo yêu cầu năng lực; sinh vật phải sở hữu năng lực thỏa mãn yêu cầu đó.
8. **Is BURROW a topology transition, a locomotion capability, or both?**
   - **Là CẢ HAI một cách độc lập**: Là `LocomotionCapability` ở tầng sinh vật; và là điều kiện cần được cấu hình trên `VerticalTransitionRequirement` ở tầng topology ($z = -1 \leftrightarrow 0$). Hai bên không tự ngầm định nhau.
9. **Is FLIGHT allowed to bypass planar adjacency?**
   - **KHÔNG cho phép dịch chuyển tức thời (teleport)**. Di chuyển planar của FLIGHT vẫn tuân thủ láng giềng từng bước; FLIGHT cho phép vượt tầng đứng mở không cần giá đỡ leo trèo.
10. **Where is terrain/habitat resistance represented, if at all?**
    - 08-C chỉ định nghĩa điểm mở rộng tùy chọn (`optional spatial resistance modifier`). Ngữ nghĩa và thẩm quyền của hệ số cản trở sinh cảnh **hoàn toàn thuộc về TASK 08-D**.

---

## XV. Self-Audit for Architectural Contradictions (Patch 09)
Rà soát toàn diện đối chiếu với `docs/SPATIAL_ARCHITECTURE_PLAN.md` và baseline `48742a0`:
- **Dual position authority**: KHÔNG có. Đã khóa duy nhất `SpatialWorld`.
- **Capability owning topology**: KHÔNG có. Đã phân tách rạch ròi.
- **Topology owning organism capability**: KHÔNG có.
- **Z interpreted as habitat**: KHÔNG có. $z$ được xác nhận là hình học.
- **Movement cost coupled to energy**: KHÔNG có. Khóa chặt `SPATIAL_COST_POINTS`.
- **ResourcePool consumption**: KHÔNG có.
- **Hidden pathfinding**: KHÔNG có. Xác nhận chỉ có single-step traversal.
- **Hidden World Tick integration**: KHÔNG có.
- **Hardcoded species IDs**: KHÔNG có. Mô hình hoàn toàn data-driven.
- **Hardcoded vertical capability mappings as universal rules**: ĐÃ GỠ BỎ. Được dán nhãn chính xác là "gameplay prototype configuration".
- **Kết luận**: **0 mâu thuẫn kiến trúc (0 contradictions found)**.

---

## XVI. Explicit Non-Goals & Boundaries
- **NO runtime locomotion code** (không tạo code mới trong `game/spatial/`).
- **NO pathfinding** (không A*, không Dijkstra).
- **NO movement execution** (chưa thực thi di chuyển trong world tick).
- **NO World Tick integration**.
- **NO biological effects / energy coupling**.
- **NO commit** cho đến khi Game Director phê duyệt Specification.
