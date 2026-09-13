# HABITAT / MICRO-CLIMATE / SHELTER / SPATIAL RESOURCES SPECIFICATION (TASK 08-D)
Version: 1.1 (SPECIFICATION PHASE — PATCHED)
Status: PATCHED / READY FOR FINAL GAME DIRECTOR APPROVAL

================================================================================
1. SCOPE & PURPOSE
================================================================================
TASK 08-D defines the spatial ecological context layer atop SpatialWorld:
1. Habitat: Spatial ecological semantic regions ("What habitat does this cell belong to?").
2. Micro-climate: Pure derived local environmental conditions at a spatial coordinate.
3. Shelter: Spatial structure ownership, capacity, occupancy, and entry validation.
4. Spatial Resource Zones: Location metadata for where resources exist ("Where are the food/resource zones?").

CRITICAL ARCHITECTURAL BOUNDARIES:
- 08-D is SPECIFICATION ONLY. No runtime implementation is authorized at this checkpoint.
- 08-D does NOT integrate into World Tick or Behavior.
- 08-D does NOT evaluate biological consequences (hunger, metabolism, HP, damage, stress, death).
- All frozen domain semantics from milestones 01 through 08-C remain strictly unmodified.

================================================================================
2. AUTHORITATIVE OWNERSHIP MATRIX & CANONICAL TRUTH
================================================================================
| Domain / State Property | Authoritative Owner | Canonical Representation | Non-Authoritative / Derived | Forbidden Antipatterns |
|---|---|---|---|---|
| Organism Position | SpatialWorld | `SpatialWorld.entities[id].position` | SpatialEntityRegistry (internal storage), SpatialIndex (acceleration) | HabitatPosition, ShelterPosition, ResourcePosition |
| Population Membership | PopulationRegistry | `PopulationRegistry.organisms` | None | Habitat maintaining population lists |
| Demographic State | Lifecycle / Population | `Organism.lifecycle_state` | None | Spatial/Habitat claiming demographic authority |
| Macro Environment | EnvironmentState | `EnvironmentState` | None | Habitat mutating EnvironmentState |
| Micro-climate Conditions | Derived pure resolver | None (Transient Snapshot) | MicroClimateSnapshot (read-only snapshot) | Persistent mutable MicroClimate state in cell |
| Shelter State & Capacity | SpatialWorld | `SpatialWorld.shelters[shelter_id]` | SpatialIndex | Lifecycle managing shelter structures |
| Shelter Occupancy | SpatialWorld | `ShelterOccupancy.occupant_ids[]` | `SpatialEntityState.sheltered_in` (derived reference) | Dual mutable occupancy states; exceeding capacity |
| Resource Location / Zone | SpatialResourceZone | `SpatialResourceZone.region` | None | Storing quantity in SpatialResourceZone |
| Resource Quantity / Allocation | ResourcePool | `ResourcePool.quantity` | None | Spatial duplicate of ResourcePool inventory |
| Biological Energy / HP / Death | Lifecycle Domain | `Organism.nutrition_state` | None | Shelter healing HP; Habitat causing death |

================================================================================
3. CANONICAL SHELTER OCCUPANCY & ATOMIC TRANSACTIONS (BLOCKER 01 RESOLUTION)
================================================================================
3.1 Single Source of Truth
SpatialWorld owns a single canonical representation of shelter occupancy:
```text
SpatialWorld.shelters[shelter_id].occupant_ids: string[] (canonical sorted array)
```
Invariant: `current_occupancy === occupant_ids.length <= capacity`.

3.2 Reference Synchronization & Reconstruction Rule
If `SpatialEntityState.sheltered_in` is exposed, it is strictly a read-only derived reference.
- Synchronization Direction: `occupant_ids[] -> entity.sheltered_in`.
- Invariant: An organism ID `org_A` is in `shelter.occupant_ids` IF AND ONLY IF `SpatialWorld.getEntity(org_A).sheltered_in === shelter_id`.
- Reconstruction: In any cold-start or deserialization sequence, `sheltered_in` references are 100% reconstructed from canonical `ShelterOccupancy.occupant_ids[]`. Dual mutable representations are strictly impossible.

3.3 Atomic 3-Phase Execution Protocol
Shelter entry and exit MUST follow atomic PLAN -> VALIDATE -> COMMIT semantics:
1. PLAN: Construct `ShelterEntryRequest(organism_id, shelter_id)`.
2. VALIDATE:
   - Does shelter exist in `SpatialWorld`?
   - Is `occupant_ids.length < capacity`? (If full, reject with `SHELTER_FULL`).
   - Is organism currently at the shelter coordinate? (See Section 5 for locomotion boundary).
   - Does organism meet `entry_locomotion_requirement`?
   - Is organism alive in `PopulationRegistry`? (If dead, reject with `DEAD_ORGANISM`).
3. COMMIT:
   - Append `organism_id` to canonical `occupant_ids` and sort alphabetically.
   - Synchronize derived reference `entity.sheltered_in = shelter_id`.
Failure during validation results in ZERO state mutation (canonical array and entity reference remain identical to before).

================================================================================
4. HABITAT DOMAIN & DEFAULT OPEN TERRAIN (CLARIFICATION 03 RESOLUTION)
================================================================================
4.1 Data-Driven Model
A Habitat is a spatial ecological semantic region defined via `HabitatDefinition`.
- Categories: `FOREST_FLOOR`, `UNDER_LEAF_LITTER`, `ROTTING_WOOD`, `TREE_TRUNK`, `OPEN_GROUND`, `BURROW_INTERIOR`, `WATER_MARGIN`, `CUSTOM`.
- Z-Axis Orthogonality: Elevation `z` is strictly spatial geometry. Prohibited: `if (z === -1) habitat = "BURROW"`.

4.2 Region Geometry Abstraction
- `RECTANGLE`: Discrete integer bounding box `[min_x, max_x, min_y, max_y, min_z, max_z]`.
- `CELL_SET`: Canonical sorted array of discrete integer `SpatialCoordinate` objects.

4.3 Explicit Default Open Terrain Data Entry
`DEFAULT_OPEN_TERRAIN` is NOT a hardcoded pseudo-habitat inside algorithm code.
It is an explicit canonical `HabitatDefinition` data object registered in `HabitatRegistry` with:
```json
{
  "habitat_id": "default_open_terrain",
  "habitat_type": "OPEN_GROUND",
  "region": { "type": "RECTANGLE", "bounds": { "min_x": -2147483648, "max_x": 2147483647, "min_y": -2147483648, "max_y": 2147483647, "min_z": -2147483648, "max_z": 2147483647 } },
  "priority": -1,
  "micro_climate_modifiers": {
    "temperature_modifier": 0.0,
    "humidity_modifier": 0.0,
    "light_level_modifier": 1.0,
    "shelter_security_baseline": 0.1
  }
}
```
Resolver behavior: If no higher-priority habitat region matches the coordinate, it resolves to this registered default habitat definition.

4.4 Overlapping Habitat Precedence
When multiple registered habitat regions cover coordinate (x, y, z):
1. Evaluate `priority DESC` (higher integer takes precedence).
2. If priorities tie, evaluate canonical `habitat_id ASC` (deterministic ASCII collation).
Exactly ONE primary canonical habitat is resolved per coordinate.

================================================================================
5. SHELTER ENTRY VS LOCOMOTION BOUNDARY (CLARIFICATION 04 RESOLUTION)
================================================================================
CRITICAL INVARIANT: `ENTER_SHELTER` IS NOT A SECOND MOVEMENT SYSTEM.
- Locomotion 08-C:
  * Sole authority for coordinate transitions, traversal validation, and movement cost.
  * Organisms move step-by-step to reach a destination.
- Shelter 08-D:
  * Sole authority for shelter eligibility, capacity, and occupancy.
  * `ENTER_SHELTER` requires that the organism is ALREADY located at the shelter's spatial coordinate:
    `organism.position === shelter.position`.
  * If organism is at an adjacent cell, it MUST execute a valid single-step traversal under 08-C to reach the shelter coordinate before entering.
  * `ENTER_SHELTER` never teleports, offsets, or arbitrarily mutates coordinates.

================================================================================
6. MICRO-CLIMATE DERIVATION PIPELINE (BLOCKER 02 RESOLUTION)
================================================================================
6.1 Simplified v1.0 Linear Pipeline
In v1.0, micro-climate derivation is strictly a 4-stage sequential, referentially transparent calculation:
```text
   [ Macro EnvironmentState ] (global temperature, humidity)
                │
                ▼
   [ + Primary Habitat Modifiers ] (temperature_modifier, humidity_modifier)
                │
                ▼
   [ + Shelter Modifiers (if occupied) ] (temperature_delta, humidity_delta)
                │
                ▼
   [ Field-Specific Clamping & Sanitization ]
   - temperature: finite number (unclamped delta)
   - humidity: clamp(calculated_humidity, 0.0, 1.0)
   - effective_security_factor: is_sheltered ? shelter.security_factor : habitat.shelter_security_baseline
                │
                ▼
   [ MicroClimateSnapshot ] (read-only, deeply frozen)
```
6.2 Future Extensibility Notice
Secondary modifier layers, dynamic weather fronts, and localized field equations are formally classified as FUTURE EXTENSION / OPEN FUTURE CONTRACT. They are NOT part of the v1.0 runtime specification.

================================================================================
7. SPATIAL RESOURCE ZONE SEMANTICS (CLARIFICATION 05 RESOLUTION)
================================================================================
- `SpatialResourceZone = WHERE`: Designates the spatial region and type of resource available for foraging.
- `ResourcePool = HOW MUCH`: Sole authority for inventory, quantity, allocation, and depletion.
- INVARIANT: `SpatialResourceZone` contains ZERO quantity, inventory, capacity, or remaining units fields.
- Permitted Schema Properties: `zone_id`, `resource_type`, `region`, `accessibility_requirements`, `metadata`.
- All quantity-like fields are explicitly forbidden by schema (`additionalProperties: false`).

================================================================================
8. TEST MATRIX DESIGN (32 SPECIFICATION TEST CASES)
================================================================================
The future runtime implementation must implement and pass the following 32 test cases:

Habitat Resolution Suite:
- TC-HAB-01: Deterministic habitat resolution (identical query returns identical definition).
- TC-HAB-02: Same position consistency (repeated resolution returns bit-for-bit identical result).
- TC-HAB-03: Region boundary enforcement (discrete inside/outside evaluation for RECTANGLE and CELL_SET).
- TC-HAB-04: Overlapping habitat precedence (priority DESC, tie-breaking by habitat_id ASC).
- TC-HAB-05: Fallback habitat resolution for unassigned coordinates.
- TC-HAB-06: Default habitat is explicit registered data/configuration, not pseudo-hardcoded algorithm behavior.

Micro-Climate Resolution Suite:
- TC-MICRO-01: Deterministic snapshot derivation.
- TC-MICRO-02: Macro -> micro derivation correctness (temperature and humidity deltas).
- TC-MICRO-03: Humidity bounds clamping (strictly within [0.0, 1.0]).
- TC-MICRO-04: Temperature additive semantics (no invalid multiplier corruption).
- TC-MICRO-05: Snapshot immutability (MicroClimateSnapshot is deeply frozen, mutations fail).
- TC-MICRO-06: v1.0 modifier pipeline is strictly Macro -> Primary Habitat -> Shelter -> Field-specific clamp.
- TC-MICRO-07: Secondary modifier layers are not part of v1.0 runtime contract.

Shelter Management & Occupancy Suite:
- TC-SHELTER-01: Capacity invariant (0 <= current_occupancy <= capacity strictly enforced).
- TC-SHELTER-02: Valid shelter entry (atomic commit, occupancy increments, occupant registered).
- TC-SHELTER-03: Full shelter rejection (returns SHELTER_FULL, zero state change).
- TC-SHELTER-04: Valid shelter exit (occupancy decrements, entity reference cleared).
- TC-SHELTER-05: Atomic failed entry rollback (invalid locomotion leaves state pristine).
- TC-SHELTER-06: Deterministic occupancy listing (occupant_ids sorted alphabetically).
- TC-SHELTER-07: Canonical occupancy representation cannot diverge from sheltered_in reference state.
- TC-SHELTER-08: Failed enter/exit produces zero occupancy/reference mutation.
- TC-SHELTER-09: Shelter entry cannot mutate coordinates independently of 08-C.

Spatial Resource Zones Suite:
- TC-RESZONE-01: Resource location resolution (correct zone identified at coordinate).
- TC-RESZONE-02: Resource type identity matches ResourcePool registry categories.
- TC-RESZONE-03: Invariant: SpatialResourceZone contains zero quantity fields.
- TC-RESZONE-04: Deterministic spatial resource lookup (sorted by zone_id ASC).
- TC-RESZONE-05: SpatialResourceZone contains no resource quantity/inventory semantics.

Cross-Domain Boundary Isolation Suite:
- TC-CROSS-01: Habitat != Shelter (habitat contains shelter references, but does not own occupancy).
- TC-CROSS-02: Habitat != ResourcePool (habitat has zero knowledge of resource quantities).
- TC-CROSS-03: ResourceZone != ResourcePool (spatial zones cannot dispense or consume resources).
- TC-CROSS-04: MicroClimate != EnvironmentState (resolution never mutates input EnvironmentState).
- TC-CROSS-05: SpatialWorld remains sole authoritative position owner (no second coordinate authority).
