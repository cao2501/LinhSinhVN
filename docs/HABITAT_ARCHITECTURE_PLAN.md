# HABITAT / MICRO-CLIMATE / SHELTER / SPATIAL RESOURCES ARCHITECTURE PLAN (TASK 08-D)
Version: 1.1 (SPECIFICATION PHASE — PATCHED)
Status: PATCHED / READY FOR FINAL GAME DIRECTOR APPROVAL

================================================================================
1. ARCHITECTURAL OVERVIEW & MOTIVATION
================================================================================
TASK 08-D defines the spatial ecological context layer atop SpatialWorld:
- How spatial coordinates map to ecological habitats.
- How global macro-environment translates into local micro-climates.
- How spatial shelters provide localized security and shelter occupancy.
- How spatial resource zones designate foraging locations.

================================================================================
2. COMPONENT TOPOLOGY & INFORMATION FLOW
================================================================================
```text
       [ EnvironmentState ] (Macro/Global, Immutable Input Snapshot)
               │
               ▼
   [ MicroClimateResolver ] (Pure Calculation Function)
               │
               ├── reads [ HabitatRegistry ] (HabitatDefinitions, Regions, Default Open Terrain)
               ├── reads [ ShelterRegistry ] (ShelterDefinitions, Canonical Occupant IDs)
               └── reads [ SpatialWorld ]    (Coordinates, Entity Spatial State)
               │
               ▼
   [ MicroClimateSnapshot ] (Derived, Read-Only, Transient or Cached Snapshot)
               │
               ▼
   [ HabitatResolutionResult ] (Spatial Context for Spatial Queries)
```

ABSOLUTE SEPARATION OF CONCERNS:
- SpatialResourceZone ──X──> ResourcePool (No quantity, no allocation)
- ShelterOccupancy ──────X──> Biological HP / Energy (No healing, no metabolic pause)
- HabitatDefinition ────X──> Demographic death or birth (No lifecycle mutation)
- MicroClimateSnapshot ─X──> EnvironmentState mutation (No feedback during resolution)
- Shelter Entry ─────────X──> Coordinate Teleportation (Movement remains 100% with 08-C)

================================================================================
3. RESOLVED ARCHITECTURAL DECISIONS (PATCH v1.1)
================================================================================
1. CANONICAL SHELTER OCCUPANCY:
   - Authority: `SpatialWorld.shelter_registry[shelter_id].occupant_ids[]`.
   - `SpatialEntityState.sheltered_in` is purely a derived/read-only reference synchronized from canonical `occupant_ids[]`.
   - Invariant: Dual mutable state is prohibited.

2. SIMPLIFIED MICRO-CLIMATE PIPELINE:
   - Linear 4-stage pipeline: Macro -> Primary Habitat -> Shelter -> Field Clamping.
   - Secondary modifier layers are formally deferred as future extension.

3. REGISTERED DEFAULT HABITAT:
   - `DEFAULT_OPEN_TERRAIN` is an explicit registered data entry with `priority: -1`, avoiding hardcoded algorithm branches.

4. SHELTER ↔ LOCOMOTION BOUNDARY:
   - `ENTER_SHELTER` validates spatial eligibility at the current coordinate. All coordinate movements must execute via 08-C traversal.

5. SPATIAL RESOURCE ZONE PURITY:
   - Contains zero quantity/inventory fields. Sole purpose is geometric location metadata.

================================================================================
4. DATA CONTRACTS & SCHEMAS
================================================================================
All 7 schemas validated under `data/spatial/schema/`:
1. `habitat_region.schema.json`
2. `habitat_definition.schema.json`
3. `micro_climate_snapshot.schema.json`
4. `shelter_definition.schema.json`
5. `shelter_occupancy.schema.json`
6. `spatial_resource_zone.schema.json`
7. `habitat_resolution_result.schema.json`

================================================================================
5. PROHIBITED ANTI-PATTERNS & INTEGRATION GUARDRAILS
================================================================================
- Zero runtime code in 08-D specification phase.
- Zero modification to frozen domains (01-08-C).
- Zero non-deterministic APIs (Math.random, Date.now, randomUUID).
- Zero pathfinding, navmesh, or GIS dependencies.
- Zero biological mutations or ResourcePool overlaps.
