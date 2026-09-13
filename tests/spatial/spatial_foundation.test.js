import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  validateInteger,
  validateCoordinate,
  formatCellId,
  parseCellId,
  canonicalGridDistance,
  euclideanDistanceSquared,
  SpatialGridBoundary,
  coordinateToIndex,
  indexToCoordinate,
  getPlanarNeighborCoordinates,
  getVerticalTransitions,
  SpatialIndex,
  SpatialEntityRegistry,
  SpatialWorld,
  CANONICAL_FACINGS,
  DEFAULT_K_VERTICAL,
  DEFAULT_K_Z,
  INT32_MIN,
  INT32_MAX
} from '../../game/spatial/index.js';

import { PopulationRegistry } from '../../game/population/population_registry.js';
import { createOrganismState } from '../../game/lifecycle/organism_state.js';
import { loadSpeciesProfile } from '../../game/lifecycle/profile_loader.js';

describe('Deterministic Spatial Foundation (TASK 08-B)', () => {

  // TC-SPATIAL-01
  test('TC-SPATIAL-01: coordinate validation (strict finite signed integers only)', () => {
    assert.doesNotThrow(() => validateCoordinate({ x: 0, y: 0, z: 0 }));
    assert.doesNotThrow(() => validateCoordinate({ x: -10, y: 50, z: -1 }));
    assert.doesNotThrow(() => validateCoordinate({ x: 99, y: 99, z: 2 }));

    // Rejection of floats, NaN, Infinity, strings, null, undefined
    assert.throws(() => validateCoordinate({ x: 1.5, y: 0, z: 0 }), TypeError);
    assert.throws(() => validateCoordinate({ x: 0, y: Number.NaN, z: 0 }), TypeError);
    assert.throws(() => validateCoordinate({ x: 0, y: 0, z: Number.POSITIVE_INFINITY }), TypeError);
    assert.throws(() => validateCoordinate({ x: '0', y: 0, z: 0 }), TypeError);
    assert.throws(() => validateCoordinate(null), TypeError);
    assert.throws(() => validateCoordinate({ x: 10, y: 20 }), TypeError); // missing z
  });

  // TC-SPATIAL-02
  test('TC-SPATIAL-02: boundary validation (explicit out-of-bounds rejection, no silent clamping or wrapping)', () => {
    const boundary = new SpatialGridBoundary({ width: 100, height: 100, z_min: -1, z_max: 2 });
    assert.equal(boundary.width, 100);
    assert.equal(boundary.height, 100);
    assert.equal(boundary.z_min, -1);
    assert.equal(boundary.z_max, 2);
    assert.equal(boundary.planeSize, 10000);
    assert.equal(boundary.strataCount, 4);
    assert.equal(boundary.totalCells, 40000);

    // In-bounds checks
    assert.equal(boundary.contains({ x: 0, y: 0, z: -1 }), true);
    assert.equal(boundary.contains({ x: 99, y: 99, z: 2 }), true);

    // Out-of-bounds checks: negative x, exceeding width, negative y, exceeding height, z out of bounds
    assert.equal(boundary.contains({ x: -1, y: 0, z: 0 }), false);
    assert.equal(boundary.contains({ x: 100, y: 0, z: 0 }), false);
    assert.equal(boundary.contains({ x: 0, y: -1, z: 0 }), false);
    assert.equal(boundary.contains({ x: 0, y: 100, z: 0 }), false);
    assert.equal(boundary.contains({ x: 0, y: 0, z: -2 }), false);
    assert.equal(boundary.contains({ x: 0, y: 0, z: 3 }), false);

    // assertWithinBounds throws RangeError on invalid, never silently clamps
    assert.throws(() => boundary.assertWithinBounds({ x: 100, y: 50, z: 0 }), RangeError);
    assert.throws(() => boundary.assertWithinBounds({ x: 50, y: -1, z: 0 }), RangeError);
    assert.throws(() => boundary.assertWithinBounds({ x: 50, y: 50, z: 3 }), RangeError);
    assert.throws(() => boundary.assertWithinBounds({ x: 50, y: 50, z: -2 }), RangeError);

    // Boundary constructor invalidation
    assert.throws(() => new SpatialGridBoundary({ width: 0, height: 10, z_min: 0, z_max: 1 }), RangeError);
    assert.throws(() => new SpatialGridBoundary({ width: 10, height: -1, z_min: 0, z_max: 1 }), RangeError);
    assert.throws(() => new SpatialGridBoundary({ width: 10, height: 10, z_min: 2, z_max: 1 }), RangeError);
  });

  // TC-SPATIAL-03
  test('TC-SPATIAL-03: coordinate/index round-trip is 100% lossless and reversible', () => {
    const boundary = new SpatialGridBoundary({ width: 10, height: 20, z_min: -1, z_max: 2 });
    // Total cells = 10 * 20 * 4 = 800
    assert.equal(boundary.totalCells, 800);

    // Test extreme corners and arbitrary points
    const testPoints = [
      { x: 0, y: 0, z: -1 },
      { x: 9, y: 0, z: -1 },
      { x: 0, y: 19, z: -1 },
      { x: 9, y: 19, z: -1 },
      { x: 0, y: 0, z: 0 },
      { x: 5, y: 12, z: 0 },
      { x: 9, y: 19, z: 2 },
      { x: 3, y: 7, z: 1 }
    ];

    for (const pt of testPoints) {
      const idx = coordinateToIndex(pt, boundary);
      assert.ok(idx >= 0 && idx < boundary.totalCells);
      const recovered = indexToCoordinate(idx, boundary);
      assert.deepEqual(recovered, pt, `Lossless round-trip failed for point ${JSON.stringify(pt)}`);
    }

    // Comprehensive round-trip check across all 800 indices
    for (let idx = 0; idx < boundary.totalCells; idx++) {
      const coord = indexToCoordinate(idx, boundary);
      const recomputedIdx = coordinateToIndex(coord, boundary);
      assert.equal(recomputedIdx, idx);
    }

    // Invalid index rejection
    assert.throws(() => indexToCoordinate(-1, boundary), RangeError);
    assert.throws(() => indexToCoordinate(800, boundary), RangeError);
    assert.throws(() => indexToCoordinate(1.5, boundary), TypeError);
  });

  // TC-SPATIAL-04
  test('TC-SPATIAL-04: deterministic cell identity (formatCellId and parseCellId)', () => {
    const cellId = formatCellId(12, 34, -1);
    assert.equal(cellId, 'cell_12_34_-1');
    const parsed = parseCellId(cellId);
    assert.deepEqual(parsed, { x: 12, y: 34, z: -1 });

    assert.throws(() => formatCellId(1.5, 2, 0), TypeError);
    assert.throws(() => parseCellId('invalid_id'), Error);
    assert.throws(() => parseCellId('cell_12_34'), Error);
  });

  // TC-SPATIAL-05 & TC-SPATIAL-06
  test('TC-SPATIAL-05 & TC-SPATIAL-06: entity registration and duplicate registration rejection', () => {
    const world = new SpatialWorld({ width: 50, height: 50, z_min: -1, z_max: 2 });

    const record = world.registerEntity({
      entity_id: 'org_001',
      position: { x: 10, y: 20, z: 0 },
      facing: 'NORTH',
      entity_type: 'ORGANISM',
      metadata: { species_id: 'spec_termite' }
    });

    assert.equal(record.entity_id, 'org_001');
    assert.deepEqual(record.position, { x: 10, y: 20, z: 0 });
    assert.equal(record.facing, 'NORTH');
    assert.equal(record.entity_type, 'ORGANISM');
    assert.equal(record.metadata.species_id, 'spec_termite');

    assert.equal(world.hasEntity('org_001'), true);
    assert.deepEqual(world.getPosition('org_001'), { x: 10, y: 20, z: 0 });

    // TC-SPATIAL-06: Duplicate registration rejection
    assert.throws(() => {
      world.registerEntity({
        entity_id: 'org_001',
        position: { x: 15, y: 25, z: 0 }
      });
    }, /Duplicate registration rejected/);

    // Invalid coordinate registration rejection
    assert.throws(() => {
      world.registerEntity({
        entity_id: 'org_002',
        position: { x: 100, y: 20, z: 0 }
      });
    }, RangeError);
  });

  // TC-SPATIAL-07
  test('TC-SPATIAL-07: entity deregistration cleans both registry and derived index', () => {
    const world = new SpatialWorld({ width: 50, height: 50, z_min: -1, z_max: 2 });
    world.registerEntity({ entity_id: 'org_001', position: { x: 10, y: 20, z: 0 } });

    assert.equal(world.hasEntity('org_001'), true);
    assert.deepEqual(world.getEntitiesAtCell({ x: 10, y: 20, z: 0 }), ['org_001']);

    const removed = world.deregisterEntity('org_001');
    assert.equal(removed.entity_id, 'org_001');

    assert.equal(world.hasEntity('org_001'), false);
    assert.equal(world.getPosition('org_001'), null);
    assert.deepEqual(world.getEntitiesAtCell({ x: 10, y: 20, z: 0 }), []);

    // Deregistering nonexistent throws
    assert.throws(() => world.deregisterEntity('org_001'), /not found/);
  });

  // TC-SPATIAL-08
  test('TC-SPATIAL-08: position ownership separation (SpatialWorld owns position; PopulationRegistry does not)', () => {
    const world = new SpatialWorld({ width: 50, height: 50, z_min: -1, z_max: 2 });
    const popRegistry = new PopulationRegistry({ population_id: 'pop_test_01', species_id: 'xylotrupes_rhinoceros_proto', simulation_seed: '0x0123456789abcdef' });

    world.registerEntity({ entity_id: 'org_alpha', position: { x: 5, y: 5, z: 0 } });

    // PopulationRegistry must NOT have coordinates
    assert.equal('position' in popRegistry, false);
    assert.equal('coordinates' in popRegistry, false);

    // OrganismState must NOT have coordinate fields injected
    const profile = loadSpeciesProfile('data/species/xylotrupes_rhinoceros_proto.json');
    const mockGenome = {
      species_id: 'xylotrupes_rhinoceros_proto',
      loci: {
        LOCUS_BODY_SCALE: [0.5, 0.5],
        LOCUS_CHITIN_DENSITY: [0.5, 0.5],
        LOCUS_CEPHALIC_HORN: [0.5, 0.5],
        LOCUS_THORACIC_HORN: [0.5, 0.5],
        LOCUS_TARSAL_CLAW: [0.5, 0.5],
        LOCUS_METABOLIC_EFFICIENCY: [0.5, 0.5],
        LOCUS_CUTICLE_PIGMENT: [0.5, 0.5],
        LOCUS_ANTENNAL_CLUB: [0.5, 0.5]
      }
    };
    const org = createOrganismState({
      organismId: 'org_alpha',
      speciesProfile: profile,
      generation: 1,
      sex: 'MALE',
      genome: mockGenome,
      phenotype: {
        body_scale_index: 1.10,
        mass_index: 1.40,
        cuticle_hardness_index: 2.0,
        cephalic_horn_scale: 0.80,
        thoracic_horn_scale: 0.60,
        tarsal_grip_index: 1.65,
        metabolic_drain_index: 1.00,
        stamina_economy_modifier: 1.05,
        sensory_range_units: 37.5,
        cuticle_pigment_ratio: 0.50,
        developmental_realization_factor: 1.00
      },
      derivedStats: {
        max_hp: 210.0,
        clash_power: 81.25,
        armor_reduction: 0.25,
        crawl_speed: 13.15,
        max_stamina: 103.0,
        action_stamina_cost: 9.52,
        stamina_regen_rate: 7.10,
        perception_radius: 37.5,
        starvation_endurance_time: 140.0
      },
      simulationSeed: '0x024aa8a38b63e1b2'
    });

    assert.equal('position' in org, false);
    assert.equal('x' in org, false);
    assert.equal('y' in org, false);
    assert.equal('z' in org, false);

    // SpatialWorld is the sole authority for position
    assert.deepEqual(world.getPosition('org_alpha'), { x: 5, y: 5, z: 0 });
  });

  // TC-SPATIAL-09
  test('TC-SPATIAL-09: atomic position update (validation-before-mutation prevents corruption)', () => {
    const world = new SpatialWorld({ width: 50, height: 50, z_min: -1, z_max: 2 });
    world.registerEntity({ entity_id: 'org_001', position: { x: 10, y: 20, z: 0 }, facing: 'NORTH' });

    // Successful atomic update
    const updated = world.updateEntityPosition('org_001', { x: 11, y: 20, z: 0 }, 'EAST');
    assert.deepEqual(updated.position, { x: 11, y: 20, z: 0 });
    assert.equal(updated.facing, 'EAST');

    // Index reflects the move
    assert.deepEqual(world.getEntitiesAtCell({ x: 10, y: 20, z: 0 }), []);
    assert.deepEqual(world.getEntitiesAtCell({ x: 11, y: 20, z: 0 }), ['org_001']);

    // Failed update: target out of bounds
    assert.throws(() => {
      world.updateEntityPosition('org_001', { x: 50, y: 20, z: 0 }); // x=50 is out of bounds [0, 49]
    }, RangeError);

    // State remains unmutated at { x: 11, y: 20, z: 0 }
    assert.deepEqual(world.getPosition('org_001'), { x: 11, y: 20, z: 0 });
    assert.deepEqual(world.getEntitiesAtCell({ x: 11, y: 20, z: 0 }), ['org_001']);

    // Failed update: invalid facing
    assert.throws(() => {
      world.updateEntityPosition('org_001', { x: 12, y: 20, z: 0 }, 'INVALID_FACING');
    }, TypeError);

    assert.deepEqual(world.getPosition('org_001'), { x: 11, y: 20, z: 0 });
    assert.deepEqual(world.getEntitiesAtCell({ x: 11, y: 20, z: 0 }), ['org_001']);
  });

  // TC-SPATIAL-10 & TC-SPATIAL-11
  test('TC-SPATIAL-10 & TC-SPATIAL-11: cell lookup and deterministic entity ordering (entity_id ASC)', () => {
    const world = new SpatialWorld({ width: 50, height: 50, z_min: -1, z_max: 2 });

    // Register entities out of alphabetical order
    world.registerEntity({ entity_id: 'org_zeta', position: { x: 5, y: 5, z: 0 } });
    world.registerEntity({ entity_id: 'org_alpha', position: { x: 5, y: 5, z: 0 } });
    world.registerEntity({ entity_id: 'org_gamma', position: { x: 5, y: 5, z: 0 } });
    world.registerEntity({ entity_id: 'org_beta', position: { x: 5, y: 5, z: 0 } });

    const occupants = world.getEntitiesAtCell({ x: 5, y: 5, z: 0 });
    assert.deepEqual(occupants, ['org_alpha', 'org_beta', 'org_gamma', 'org_zeta']);

    // Empty cell returns empty array
    assert.deepEqual(world.getEntitiesAtCell({ x: 6, y: 5, z: 0 }), []);
  });

  // TC-SPATIAL-12 & TC-SPATIAL-13
  test('TC-SPATIAL-12 & TC-SPATIAL-13: planar neighborhood lookup and planar vs vertical separation', () => {
    const boundary = new SpatialGridBoundary({ width: 10, height: 10, z_min: -1, z_max: 2 });

    // Interior cell: exactly 8 neighbors
    const interiorNeighbors = getPlanarNeighborCoordinates({ x: 5, y: 5, z: 0 }, boundary);
    assert.equal(interiorNeighbors.length, 8);
    for (const n of interiorNeighbors) {
      assert.equal(n.z, 0, 'Planar neighbors must strictly remain on the same z-level');
      assert.ok(Math.abs(n.x - 5) <= 1 && Math.abs(n.y - 5) <= 1);
      assert.ok(!(n.x === 5 && n.y === 5), 'Origin cell must be excluded by default');
    }

    // Interior cell with includeOrigin = true: 9 cells
    const withOrigin = getPlanarNeighborCoordinates({ x: 5, y: 5, z: 0 }, boundary, { includeOrigin: true });
    assert.equal(withOrigin.length, 9);
    assert.ok(withOrigin.some(p => p.x === 5 && p.y === 5 && p.z === 0));

    // Corner cell (0, 0, 0): exactly 3 neighbors without origin
    const cornerNeighbors = getPlanarNeighborCoordinates({ x: 0, y: 0, z: 0 }, boundary);
    assert.equal(cornerNeighbors.length, 3);
    assert.deepEqual(cornerNeighbors, [
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: 1, y: 1, z: 0 }
    ]);

    // TC-SPATIAL-13: Vertical strata separation
    const world = new SpatialWorld({ width: 10, height: 10, z_min: -1, z_max: 2 });
    world.registerEntity({ entity_id: 'org_ground', position: { x: 5, y: 5, z: 0 } });
    world.registerEntity({ entity_id: 'org_air', position: { x: 5, y: 5, z: 1 } });
    world.registerEntity({ entity_id: 'org_sub', position: { x: 5, y: 5, z: -1 } });
    world.registerEntity({ entity_id: 'org_neighbor', position: { x: 6, y: 5, z: 0 } });

    // Query planar neighborhood around (5, 5, 0) without origin
    const nEntities = world.getEntitiesInNeighborhood({ x: 5, y: 5, z: 0 }, { includeOrigin: false });
    assert.deepEqual(nEntities, ['org_neighbor']); // air and sub are excluded!

    // Query with origin
    const nEntitiesWithOrigin = world.getEntitiesInNeighborhood({ x: 5, y: 5, z: 0 }, { includeOrigin: true });
    assert.deepEqual(nEntitiesWithOrigin, ['org_ground', 'org_neighbor']);

    // Declarative vertical transitions topology check
    const vertTransitions = getVerticalTransitions({ x: 5, y: 5, z: 0 }, boundary);
    assert.equal(vertTransitions.length, 2);
    assert.equal(vertTransitions[0].direction, 'UP');
    assert.equal(vertTransitions[0].to.z, 1);
    assert.equal(vertTransitions[1].direction, 'DOWN');
    assert.equal(vertTransitions[1].to.z, -1);
  });

  // TC-SPATIAL-14
  test('TC-SPATIAL-14: canonical grid distance (K_vertical = 3, prototype geometric scaling constant)', () => {
    assert.equal(DEFAULT_K_VERTICAL, 3);

    const p1 = { x: 0, y: 0, z: 0 };
    const p2 = { x: 3, y: 4, z: 0 };
    // Same z: max(|3|, |4|) = 4
    assert.equal(canonicalGridDistance(p1, p2), 4);

    // Vertical delta: dz = 1 -> max(3, 4) + 1 * 3 = 4 + 3 = 7
    const p3 = { x: 3, y: 4, z: 1 };
    assert.equal(canonicalGridDistance(p1, p3), 7);

    // dz = 2 -> 4 + 2 * 3 = 10
    const p4 = { x: 3, y: 4, z: 2 };
    assert.equal(canonicalGridDistance(p1, p4), 10);

    // Pure vertical distance: dz = 3 -> 0 + 3 * 3 = 9
    const p5 = { x: 0, y: 0, z: -1 };
    const p6 = { x: 0, y: 0, z: 2 };
    assert.equal(canonicalGridDistance(p5, p6), 9);
  });

  // TC-SPATIAL-15
  test('TC-SPATIAL-15: Euclidean distance squared (K_z = 2, exact integer without float sqrt)', () => {
    assert.equal(DEFAULT_K_Z, 2);

    const p1 = { x: 0, y: 0, z: 0 };
    const p2 = { x: 3, y: 4, z: 0 };
    // dx^2 + dy^2 = 9 + 16 = 25
    assert.equal(euclideanDistanceSquared(p1, p2), 25);

    // dz = 1 -> dx^2 + dy^2 + (1 * 2)^2 = 25 + 4 = 29
    const p3 = { x: 3, y: 4, z: 1 };
    assert.equal(euclideanDistanceSquared(p1, p3), 29);

    // dz = 2 -> 25 + (2 * 2)^2 = 25 + 16 = 41
    const p4 = { x: 3, y: 4, z: 2 };
    assert.equal(euclideanDistanceSquared(p1, p4), 41);
  });

  // TC-SPATIAL-16
  test('TC-SPATIAL-16: dead spatial retention (dead organisms retained as spatial records without decomposition)', () => {
    const world = new SpatialWorld({ width: 50, height: 50, z_min: -1, z_max: 2 });
    world.registerEntity({
      entity_id: 'org_corpse_sim',
      position: { x: 10, y: 10, z: 0 },
      metadata: { is_alive: false } // Retention flag only
    });

    // Remains queryable spatially
    assert.equal(world.hasEntity('org_corpse_sim'), true);
    assert.deepEqual(world.getPosition('org_corpse_sim'), { x: 10, y: 10, z: 0 });
    assert.deepEqual(world.getEntitiesAtCell({ x: 10, y: 10, z: 0 }), ['org_corpse_sim']);
  });

  // TC-SPATIAL-17 & TC-SPATIAL-18
  test('TC-SPATIAL-17 & TC-SPATIAL-18: canonical serialization and round-trip deserialization', () => {
    const world = new SpatialWorld({ width: 30, height: 30, z_min: -1, z_max: 2 });
    world.registerEntity({ entity_id: 'org_003', position: { x: 2, y: 3, z: 1 }, facing: 'SOUTH' });
    world.registerEntity({ entity_id: 'org_001', position: { x: 0, y: 0, z: 0 }, facing: 'NORTH' });
    world.registerEntity({ entity_id: 'org_002', position: { x: 10, y: 10, z: -1 }, facing: 'EAST' });

    const snapshot = world.serialize();

    // Stable schema version & property ordering
    assert.equal(snapshot.schema_version, '1.0.0');
    assert.equal(snapshot.boundary.width, 30);
    assert.equal(snapshot.boundary.height, 30);
    assert.equal(snapshot.boundary.z_min, -1);
    assert.equal(snapshot.boundary.z_max, 2);

    // Entities must be sorted entity_id ASC
    assert.equal(snapshot.entities.length, 3);
    assert.equal(snapshot.entities[0].entity_id, 'org_001');
    assert.equal(snapshot.entities[1].entity_id, 'org_002');
    assert.equal(snapshot.entities[2].entity_id, 'org_003');

    // TC-SPATIAL-18: Round-trip deserialization
    const restoredWorld = SpatialWorld.deserialize(snapshot);
    assert.equal(restoredWorld.boundary.width, 30);
    assert.equal(restoredWorld.boundary.height, 30);
    assert.equal(restoredWorld.hasEntity('org_001'), true);
    assert.equal(restoredWorld.hasEntity('org_002'), true);
    assert.equal(restoredWorld.hasEntity('org_003'), true);
    assert.deepEqual(restoredWorld.getPosition('org_001'), { x: 0, y: 0, z: 0 });
    assert.deepEqual(restoredWorld.getPosition('org_002'), { x: 10, y: 10, z: -1 });
    assert.deepEqual(restoredWorld.getPosition('org_003'), { x: 2, y: 3, z: 1 });

    const reserialized = restoredWorld.serialize();
    assert.deepEqual(reserialized, snapshot);
    assert.equal(JSON.stringify(reserialized), JSON.stringify(snapshot));
  });

  // TC-SPATIAL-19
  test('TC-SPATIAL-19: spatial index consistency (rebuild produces identical index state)', () => {
    const world = new SpatialWorld({ width: 20, height: 20, z_min: -1, z_max: 2 });
    world.registerEntity({ entity_id: 'e3', position: { x: 5, y: 5, z: 0 } });
    world.registerEntity({ entity_id: 'e1', position: { x: 5, y: 5, z: 0 } });
    world.registerEntity({ entity_id: 'e2', position: { x: 5, y: 5, z: 0 } });
    world.registerEntity({ entity_id: 'e4', position: { x: 10, y: 10, z: 1 } });

    const before = world.getEntitiesAtCell({ x: 5, y: 5, z: 0 });
    assert.deepEqual(before, ['e1', 'e2', 'e3']);

    // Rebuild index from authoritative registry
    world.rebuildIndex();
    const after = world.getEntitiesAtCell({ x: 5, y: 5, z: 0 });
    assert.deepEqual(after, ['e1', 'e2', 'e3']);
    assert.deepEqual(world.getEntitiesAtCell({ x: 10, y: 10, z: 1 }), ['e4']);
  });

  // TC-SPATIAL-20
  test('TC-SPATIAL-20: defensive ownership / immutability (returned lists cannot mutate internal index)', () => {
    const world = new SpatialWorld({ width: 20, height: 20, z_min: -1, z_max: 2 });
    world.registerEntity({ entity_id: 'org_01', position: { x: 5, y: 5, z: 0 } });

    const occupants = world.getEntitiesAtCell({ x: 5, y: 5, z: 0 });
    assert.throws(() => {
      occupants.push('malicious_entity');
    }, TypeError);

    // Internal index remains untouched
    assert.deepEqual(world.getEntitiesAtCell({ x: 5, y: 5, z: 0 }), ['org_01']);
  });

  // TC-SPATIAL-21
  test('TC-SPATIAL-21: replay determinism (100 independent identical runs produce bit-for-bit identical snapshots)', () => {
    function runSimulation() {
      const world = new SpatialWorld({ width: 50, height: 50, z_min: -1, z_max: 2 });
      world.registerEntity({ entity_id: 'org_03', position: { x: 12, y: 14, z: 0 }, facing: 'NORTH' });
      world.registerEntity({ entity_id: 'org_01', position: { x: 2, y: 4, z: -1 }, facing: 'EAST' });
      world.registerEntity({ entity_id: 'org_02', position: { x: 45, y: 40, z: 2 }, facing: 'SOUTH' });

      world.updateEntityPosition('org_03', { x: 13, y: 14, z: 0 }, 'NORTH_EAST');
      world.updateEntityPosition('org_01', { x: 2, y: 5, z: -1 }, 'SOUTH_WEST');

      return JSON.stringify(world.serialize());
    }

    const baseline = runSimulation();
    for (let i = 0; i < 100; i++) {
      const run = runSimulation();
      assert.equal(run, baseline, `Replay divergence at iteration ${i}`);
    }
  });

  // TC-SPATIAL-22
  test('TC-SPATIAL-22: forbidden nondeterministic APIs scan across game/spatial/**', () => {
    const spatialDir = path.resolve('game/spatial');
    const files = fs.readdirSync(spatialDir).filter(f => f.endsWith('.js'));
    const forbiddenPatterns = [
      /Math\.random\s*\(/,
      /Date\.now\s*\(/,
      /new\s+Date\s*\(/,
      /crypto\.randomUUID\s*\(/,
      /crypto\.getRandomValues\s*\(/
    ];

    for (const file of files) {
      const content = fs.readFileSync(path.join(spatialDir, file), 'utf8');
      for (const pattern of forbiddenPatterns) {
        assert.equal(
          pattern.test(content),
          false,
          `Forbidden nondeterministic pattern ${pattern} found in game/spatial/${file}`
        );
      }
    }
  });

  // Architectural Invariants Suite
  describe('Architectural Invariants Verification', () => {
    test('PopulationRegistry does not own position', () => {
      const popRegistry = new PopulationRegistry({
        population_id: 'pop_test_arch',
        species_id: 'xylotrupes_rhinoceros_proto',
        simulation_seed: '0x0123456789abcdef'
      });
      assert.equal('position' in popRegistry, false);
      assert.equal('coordinates' in popRegistry, false);
      assert.equal('x' in popRegistry, false);
    });

    test('SpatialIndex is not authoritative (reconstructible from registry at any time)', () => {
      const world = new SpatialWorld({ width: 20, height: 20, z_min: -1, z_max: 2 });
      world.registerEntity({ entity_id: 'ent_1', position: { x: 2, y: 3, z: 0 } });
      world.registerEntity({ entity_id: 'ent_2', position: { x: 2, y: 3, z: 0 } });
      world.registerEntity({ entity_id: 'ent_3', position: { x: 5, y: 5, z: 1 } });

      // Clear internal derived index manually to prove it is non-authoritative
      world.index._cellToEntities.clear();
      assert.deepEqual(world.getEntitiesAtCell({ x: 2, y: 3, z: 0 }), []);

      // Rebuild restores 100% correct index from authoritative registry
      world.rebuildIndex();
      assert.deepEqual(world.getEntitiesAtCell({ x: 2, y: 3, z: 0 }), ['ent_1', 'ent_2']);
      assert.deepEqual(world.getEntitiesAtCell({ x: 5, y: 5, z: 1 }), ['ent_3']);
    });

    test('Insertion order cannot change query ordering', () => {
      const world1 = new SpatialWorld({ width: 20, height: 20, z_min: -1, z_max: 2 });
      world1.registerEntity({ entity_id: 'c', position: { x: 5, y: 5, z: 0 } });
      world1.registerEntity({ entity_id: 'a', position: { x: 5, y: 5, z: 0 } });
      world1.registerEntity({ entity_id: 'b', position: { x: 5, y: 5, z: 0 } });

      const world2 = new SpatialWorld({ width: 20, height: 20, z_min: -1, z_max: 2 });
      world2.registerEntity({ entity_id: 'a', position: { x: 5, y: 5, z: 0 } });
      world2.registerEntity({ entity_id: 'b', position: { x: 5, y: 5, z: 0 } });
      world2.registerEntity({ entity_id: 'c', position: { x: 5, y: 5, z: 0 } });

      assert.deepEqual(
        world1.getEntitiesAtCell({ x: 5, y: 5, z: 0 }),
        world2.getEntitiesAtCell({ x: 5, y: 5, z: 0 })
      );
      assert.deepEqual(world1.serialize(), world2.serialize());
    });

    test('Invalid coordinate cannot partially mutate state', () => {
      const world = new SpatialWorld({ width: 20, height: 20, z_min: -1, z_max: 2 });
      world.registerEntity({ entity_id: 'e1', position: { x: 5, y: 5, z: 0 } });

      assert.throws(() => {
        world.updateEntityPosition('e1', { x: 999, y: 5, z: 0 });
      }, RangeError);

      assert.deepEqual(world.getPosition('e1'), { x: 5, y: 5, z: 0 });
      assert.deepEqual(world.getEntitiesAtCell({ x: 5, y: 5, z: 0 }), ['e1']);
    });

    test('Failed position update cannot corrupt index', () => {
      const world = new SpatialWorld({ width: 20, height: 20, z_min: -1, z_max: 2 });
      world.registerEntity({ entity_id: 'e1', position: { x: 5, y: 5, z: 0 } });

      // Target out of bounds
      assert.throws(() => {
        world.updateEntityPosition('e1', { x: 5, y: 5, z: 99 });
      }, RangeError);

      // Old cell still contains e1, new cell does not exist
      assert.deepEqual(world.getEntitiesAtCell({ x: 5, y: 5, z: 0 }), ['e1']);
    });

    test('Deregistration removes entity from index completely', () => {
      const world = new SpatialWorld({ width: 20, height: 20, z_min: -1, z_max: 2 });
      world.registerEntity({ entity_id: 'e1', position: { x: 5, y: 5, z: 0 } });
      assert.equal(world.index.occupiedCellCount, 1);

      world.deregisterEntity('e1');
      assert.equal(world.index.occupiedCellCount, 0);
      assert.deepEqual(world.getEntitiesAtCell({ x: 5, y: 5, z: 0 }), []);
    });

    test('Entity ID is independent of array index', () => {
      const world = new SpatialWorld({ width: 20, height: 20, z_min: -1, z_max: 2 });
      world.registerEntity({ entity_id: 'ent_999', position: { x: 0, y: 0, z: 0 } });
      world.registerEntity({ entity_id: 'ent_001', position: { x: 1, y: 1, z: 0 } });

      // Deleting first added entity does not shift or invalidate other entity
      world.deregisterEntity('ent_999');
      assert.equal(world.hasEntity('ent_001'), true);
      assert.deepEqual(world.getPosition('ent_001'), { x: 1, y: 1, z: 0 });
    });

    test('Repeated identical operations produce identical snapshots', () => {
      function runOps() {
        const world = new SpatialWorld({ width: 30, height: 30, z_min: -1, z_max: 2 });
        world.registerEntity({ entity_id: 'e2', position: { x: 10, y: 10, z: 0 } });
        world.registerEntity({ entity_id: 'e1', position: { x: 2, y: 2, z: -1 } });
        world.updateEntityPosition('e2', { x: 11, y: 10, z: 0 });
        return world.serialize();
      }

      const s1 = runOps();
      const s2 = runOps();
      assert.deepEqual(s1, s2);
      assert.equal(JSON.stringify(s1), JSON.stringify(s2));
    });
  });

  // =========================================================================
  // TASK 08-B PATCH — INTEGER SAFETY & SPATIAL INDEX AUTHORITY AUDIT SUITE
  // =========================================================================
  describe('TASK 08-B Patch: Integer Safety & Index Authority Hardening', () => {

    test('PATCH-01: True signed 32-bit boundary enforcement (INT32_MIN and INT32_MAX)', () => {
      // INT32_MIN and INT32_MAX imported at top level
      assert.equal(INT32_MIN, -2147483648);
      assert.equal(INT32_MAX, 2147483647);

      // Boundary values are accepted where in-bounds
      assert.doesNotThrow(() => validateInteger(INT32_MIN, 'test_min'));
      assert.doesNotThrow(() => validateInteger(INT32_MAX, 'test_max'));
      assert.doesNotThrow(() => validateInteger(0, 'test_zero'));

      // Outside Int32 range must throw RangeError
      assert.throws(() => validateInteger(INT32_MAX + 1, 'overflow'), RangeError);
      assert.throws(() => validateInteger(INT32_MIN - 1, 'underflow'), RangeError);
      assert.throws(() => validateInteger(Number.MAX_SAFE_INTEGER, 'max_safe'), RangeError);
      assert.throws(() => validateInteger(Number.MIN_SAFE_INTEGER, 'min_safe'), RangeError);

      // Coordinate validation enforces Int32 bounds
      assert.throws(() => validateCoordinate({ x: INT32_MAX + 1, y: 0, z: 0 }), RangeError);
      assert.throws(() => validateCoordinate({ x: 0, y: INT32_MIN - 1, z: 0 }), RangeError);
      assert.throws(() => validateCoordinate({ x: 0, y: 0, z: 2147483648 }), RangeError);
    });

    test('PATCH-02: SpatialGridBoundary safe-integer invariants', () => {
      // Non-safe width/height rejected
      assert.throws(() => new SpatialGridBoundary({ width: Number.MAX_SAFE_INTEGER + 1, height: 10, z_min: 0, z_max: 1 }), TypeError);
      assert.throws(() => new SpatialGridBoundary({ width: 10, height: Number.MAX_SAFE_INTEGER + 1, z_min: 0, z_max: 1 }), TypeError);

      // Width/height <= 0 rejected
      assert.throws(() => new SpatialGridBoundary({ width: 0, height: 10, z_min: 0, z_max: 1 }), RangeError);
      assert.throws(() => new SpatialGridBoundary({ width: 10, height: -5, z_min: 0, z_max: 1 }), RangeError);

      // Unsafe totalCells rejected (width * height * strata > Number.MAX_SAFE_INTEGER)
      // Number.MAX_SAFE_INTEGER = 9007199254740991
      // If planeSize or totalCells exceeds safe integer, throws RangeError
      assert.throws(() => new SpatialGridBoundary({ width: 1000000000, height: 1000000000, z_min: 0, z_max: 10 }), RangeError);

      // TotalCells is strictly a safe integer on valid boundary
      const boundary = new SpatialGridBoundary({ width: 100, height: 100, z_min: -1, z_max: 2 });
      assert.equal(Number.isSafeInteger(boundary.totalCells), true);
      assert.equal(boundary.totalCells, 40000);
    });

    test('PATCH-03: Flat index safe-integer & invalid decode rejection', () => {
      const boundary = new SpatialGridBoundary({ width: 50, height: 50, z_min: -1, z_max: 2 });

      // Valid index conversion
      const idx = coordinateToIndex({ x: 10, y: 10, z: 0 }, boundary);
      assert.equal(Number.isSafeInteger(idx), true);

      // Invalid decode index rejected
      assert.throws(() => indexToCoordinate(-1, boundary), RangeError);
      assert.throws(() => indexToCoordinate(boundary.totalCells, boundary), RangeError);
      assert.throws(() => indexToCoordinate(Number.MAX_SAFE_INTEGER, boundary), RangeError);
      assert.throws(() => indexToCoordinate(Number.NaN, boundary), TypeError);
      assert.throws(() => indexToCoordinate('100', boundary), TypeError);

      // Lossless exact round-trip both ways
      // coordinate -> index -> coordinate
      const pOrig = { x: 25, y: 35, z: 1 };
      const computedIndex = coordinateToIndex(pOrig, boundary);
      const pRecovered = indexToCoordinate(computedIndex, boundary);
      assert.deepEqual(pRecovered, pOrig);

      // index -> coordinate -> index
      const targetIndex = 1234;
      const coordFromIndex = indexToCoordinate(targetIndex, boundary);
      const recomputedIndex = coordinateToIndex(coordFromIndex, boundary);
      assert.equal(recomputedIndex, targetIndex);
    });

    test('PATCH-04: SpatialIndex cannot independently act as authority', () => {
      const world = new SpatialWorld({ width: 20, height: 20, z_min: -1, z_max: 2 });
      world.registerEntity({ entity_id: 'legit_01', position: { x: 5, y: 5, z: 0 } });

      // 1. SpatialIndex cannot independently create an authoritative entity
      // Directly mutating index._cellToEntities does NOT add entity to registry
      const cellIndex = coordinateToIndex({ x: 5, y: 5, z: 0 }, world.boundary);
      world.index.addEntity(cellIndex, 'ghost_entity');

      assert.equal(world.hasEntity('ghost_entity'), false);
      assert.equal(world.getPosition('ghost_entity'), null);
      assert.equal(world.getEntity('ghost_entity'), null);

      // 2. Rebuilding index purges any phantom entities not in authoritative registry
      world.rebuildIndex();
      assert.deepEqual(world.getEntitiesAtCell({ x: 5, y: 5, z: 0 }), ['legit_01']);
      assert.equal(world.hasEntity('ghost_entity'), false);

      // 3. Serialized snapshot derives strictly from authoritative registry, NOT index
      const snapshot = world.serialize();
      assert.equal(snapshot.entities.some(e => e.entity_id === 'ghost_entity'), false);
      assert.equal(snapshot.entities.length, 1);
      assert.equal(snapshot.entities[0].entity_id, 'legit_01');
    });

    test('PATCH-05: Registry state can 100% regenerate index state losslessly', () => {
      const world = new SpatialWorld({ width: 30, height: 30, z_min: -1, z_max: 2 });
      world.registerEntity({ entity_id: 'org_z', position: { x: 10, y: 10, z: -1 } });
      world.registerEntity({ entity_id: 'org_a', position: { x: 10, y: 10, z: -1 } });
      world.registerEntity({ entity_id: 'org_m', position: { x: 10, y: 10, z: -1 } });
      world.registerEntity({ entity_id: 'org_top', position: { x: 15, y: 15, z: 2 } });

      const stateBefore = {
        cell_10_10: world.getEntitiesAtCell({ x: 10, y: 10, z: -1 }),
        cell_15_15: world.getEntitiesAtCell({ x: 15, y: 15, z: 2 })
      };

      // Wipe index completely
      world.index._cellToEntities.clear();
      assert.deepEqual(world.getEntitiesAtCell({ x: 10, y: 10, z: -1 }), []);

      // Regenerate from registry
      world.rebuildIndex();
      const stateAfter = {
        cell_10_10: world.getEntitiesAtCell({ x: 10, y: 10, z: -1 }),
        cell_15_15: world.getEntitiesAtCell({ x: 15, y: 15, z: 2 })
      };

      assert.deepEqual(stateAfter, stateBefore);
      assert.deepEqual(stateAfter.cell_10_10, ['org_a', 'org_m', 'org_z']);
    });
  });
});
