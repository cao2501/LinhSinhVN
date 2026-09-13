/**
 * LinhSinhVN — Deterministic Resource Zone Runtime Test Suite (TASK 08-D4)
 *
 * Verifies spatial resource zones, region geometry, deterministic queries,
 * serialization, cold-start reconstruction, overlapping zones, and domain isolation.
 */

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  SpatialResourceZone,
  ResourceZoneRegistry,
  resolveSpatialContext
} from '../../game/spatial/resource_zone/index.js';

import { HabitatRegion, RegionType, HabitatRegistry } from '../../game/spatial/habitat/index.js';
import { ShelterRegistry } from '../../game/spatial/shelter/index.js';
import { SpatialGridBoundary } from '../../game/spatial/spatial_grid.js';
import { SpatialEntityRegistry } from '../../game/spatial/spatial_entity_registry.js';

const boundary = new SpatialGridBoundary({ width: 100, height: 100, z_min: -1, z_max: 2 });

describe('Resource Zone Runtime (TASK 08-D4)', () => {
  // RESOURCE-ZONE-01: valid zone definition
  test('RESOURCE-ZONE-01: valid SpatialResourceZone instantiates with frozen properties', () => {
    const zone = new SpatialResourceZone({
      zone_id: 'aphid_colony_north',
      resource_type: 'HONEYDEW',
      region: {
        type: RegionType.RECTANGLE,
        bounds: { min_x: 10, max_x: 20, min_y: 10, max_y: 20, min_z: 0, max_z: 1 }
      },
      accessibility_requirements: ['CRAWL'],
      metadata: { flora: 'oak_leaves' }
    });

    assert.equal(zone.zone_id, 'aphid_colony_north');
    assert.equal(zone.resource_type, 'HONEYDEW');
    assert.equal(zone.region.type, 'RECTANGLE');
    assert.deepEqual(zone.accessibility_requirements, ['CRAWL']);
    assert.deepEqual(zone.metadata, { flora: 'oak_leaves' });
    assert.ok(Object.isFrozen(zone));
    assert.ok(Object.isFrozen(zone.accessibility_requirements));
    assert.ok(Object.isFrozen(zone.metadata));
  });

  // RESOURCE-ZONE-02: invalid zone definition rejected
  test('RESOURCE-ZONE-02: invalid zone definition rejected', () => {
    // Bad ID
    assert.throws(() => new SpatialResourceZone({
      zone_id: 'BAD-ID!',
      resource_type: 'SEEDS',
      region: { type: RegionType.RECTANGLE, bounds: { min_x: 0, max_x: 5, min_y: 0, max_y: 5, min_z: 0, max_z: 0 } }
    }), TypeError);

    // Missing region
    assert.throws(() => new SpatialResourceZone({
      zone_id: 'zone_bad',
      resource_type: 'SEEDS',
      region: null
    }), TypeError);

    // Bad accessibility
    assert.throws(() => new SpatialResourceZone({
      zone_id: 'zone_bad',
      resource_type: 'SEEDS',
      region: { type: RegionType.RECTANGLE, bounds: { min_x: 0, max_x: 5, min_y: 0, max_y: 5, min_z: 0, max_z: 0 } },
      accessibility_requirements: 'NOT_ARRAY'
    }), TypeError);
  });

  // RESOURCE-ZONE-03: duplicate zone ID rejected
  test('RESOURCE-ZONE-03: duplicate zone ID rejected by registry', () => {
    const reg = new ResourceZoneRegistry({ boundary });
    reg.registerZone({
      zone_id: 'dup_zone',
      resource_type: 'SEEDS',
      region: { type: RegionType.RECTANGLE, bounds: { min_x: 0, max_x: 5, min_y: 0, max_y: 5, min_z: 0, max_z: 0 } }
    });

    assert.throws(() => {
      reg.registerZone({
        zone_id: 'dup_zone',
        resource_type: 'WATER',
        region: { type: RegionType.RECTANGLE, bounds: { min_x: 0, max_x: 5, min_y: 0, max_y: 5, min_z: 0, max_z: 0 } }
      });
    }, /Duplicate zone_id/);
  });

  // RESOURCE-ZONE-04: invalid resource type rejected
  test('RESOURCE-ZONE-04: invalid or empty resource type rejected', () => {
    assert.throws(() => new SpatialResourceZone({
      zone_id: 'zone_empty_res',
      resource_type: '',
      region: { type: RegionType.RECTANGLE, bounds: { min_x: 0, max_x: 5, min_y: 0, max_y: 5, min_z: 0, max_z: 0 } }
    }), TypeError);

    assert.throws(() => new SpatialResourceZone({
      zone_id: 'zone_null_res',
      resource_type: null,
      region: { type: RegionType.RECTANGLE, bounds: { min_x: 0, max_x: 5, min_y: 0, max_y: 5, min_z: 0, max_z: 0 } }
    }), TypeError);
  });

  // RESOURCE-ZONE-05: invalid geometry rejected
  test('RESOURCE-ZONE-05: invalid geometry rejected', () => {
    assert.throws(() => new SpatialResourceZone({
      zone_id: 'bad_geom',
      resource_type: 'NECTAR',
      region: { type: 'TRIANGLE' }
    }), TypeError);
  });

  // RESOURCE-ZONE-06: out-of-world geometry rejected
  test('RESOURCE-ZONE-06: out-of-world geometry rejected by boundary validation', () => {
    const reg = new ResourceZoneRegistry({ boundary });
    assert.throws(() => {
      reg.registerZone({
        zone_id: 'out_of_bounds',
        resource_type: 'NECTAR',
        region: {
          type: RegionType.RECTANGLE,
          bounds: { min_x: 0, max_x: 150, min_y: 0, max_y: 50, min_z: 0, max_z: 0 } // max_x 150 > width 100
        }
      });
    });
  });

  // RESOURCE-ZONE-07: canonical CELL_SET ordering
  test('RESOURCE-ZONE-07: canonical CELL_SET ordering is deterministic code-point ordering', () => {
    const region = new HabitatRegion({
      type: RegionType.CELL_SET,
      cells: [
        { x: 5, y: 5, z: 0 },
        { x: 2, y: 3, z: 0 },
        { x: 2, y: 2, z: 0 }
      ]
    });

    const zone = new SpatialResourceZone({
      zone_id: 'patch_cells',
      resource_type: 'MUSHROOM',
      region
    });

    // Sorted by cell_id ascending: cell_2_2_0, cell_2_3_0, cell_5_5_0
    assert.equal(zone.region.cells[0].x, 2);
    assert.equal(zone.region.cells[0].y, 2);
    assert.equal(zone.region.cells[1].x, 2);
    assert.equal(zone.region.cells[1].y, 3);
    assert.equal(zone.region.cells[2].x, 5);
    assert.equal(zone.region.cells[2].y, 5);
  });

  // RESOURCE-ZONE-08: deterministic serialization
  test('RESOURCE-ZONE-08: serialize produces canonical deterministic sorted structure', () => {
    const reg = new ResourceZoneRegistry({ boundary });
    reg.registerZone({
      zone_id: 'zone_z',
      resource_type: 'SEEDS',
      region: { type: RegionType.RECTANGLE, bounds: { min_x: 10, max_x: 20, min_y: 10, max_y: 20, min_z: 0, max_z: 0 } }
    });
    reg.registerZone({
      zone_id: 'zone_a',
      resource_type: 'SEEDS',
      region: { type: RegionType.RECTANGLE, bounds: { min_x: 30, max_x: 40, min_y: 30, max_y: 40, min_z: 0, max_z: 0 } }
    });

    const snap = reg.serialize();
    assert.equal(snap.zones[0].zone_id, 'zone_a');
    assert.equal(snap.zones[1].zone_id, 'zone_z');
  });

  // RESOURCE-ZONE-09: same input different insertion order produces same snapshot
  test('RESOURCE-ZONE-09: different insertion orders produce identical canonical snapshots', () => {
    function create(order) {
      const reg = new ResourceZoneRegistry({ boundary });
      for (const id of order) {
        reg.registerZone({
          zone_id: id,
          resource_type: 'SAP',
          region: { type: RegionType.RECTANGLE, bounds: { min_x: 0, max_x: 5, min_y: 0, max_y: 5, min_z: 0, max_z: 0 } }
        });
      }
      return JSON.stringify(reg.serialize());
    }

    const s1 = create(['zone_c', 'zone_a', 'zone_b']);
    const s2 = create(['zone_b', 'zone_c', 'zone_a']);
    const s3 = create(['zone_a', 'zone_b', 'zone_c']);

    assert.equal(s1, s2);
    assert.equal(s2, s3);
  });

  // RESOURCE-ZONE-10: getZone deterministic
  test('RESOURCE-ZONE-10: getZone retrieves exact zone or null', () => {
    const reg = new ResourceZoneRegistry({ boundary });
    reg.registerZone({
      zone_id: 'sap_1',
      resource_type: 'TREE_SAP',
      region: { type: RegionType.RECTANGLE, bounds: { min_x: 5, max_x: 8, min_y: 5, max_y: 8, min_z: 1, max_z: 2 } }
    });

    assert.ok(reg.getZone('sap_1'));
    assert.equal(reg.getZone('sap_1').resource_type, 'TREE_SAP');
    assert.equal(reg.getZone('missing_zone'), null);
  });

  // RESOURCE-ZONE-11: getZonesByResourceType deterministic
  test('RESOURCE-ZONE-11: getZonesByResourceType filters and returns zones sorted by zone_id ASC', () => {
    const reg = new ResourceZoneRegistry({ boundary });
    reg.registerZone({
      zone_id: 'honeydew_2',
      resource_type: 'HONEYDEW',
      region: { type: RegionType.RECTANGLE, bounds: { min_x: 0, max_x: 5, min_y: 0, max_y: 5, min_z: 0, max_z: 0 } }
    });
    reg.registerZone({
      zone_id: 'honeydew_1',
      resource_type: 'HONEYDEW',
      region: { type: RegionType.RECTANGLE, bounds: { min_x: 10, max_x: 15, min_y: 10, max_y: 15, min_z: 0, max_z: 0 } }
    });
    reg.registerZone({
      zone_id: 'nectar_1',
      resource_type: 'NECTAR',
      region: { type: RegionType.RECTANGLE, bounds: { min_x: 20, max_x: 25, min_y: 20, max_y: 25, min_z: 0, max_z: 0 } }
    });

    const honeydews = reg.getZonesByResourceType('HONEYDEW');
    assert.equal(honeydews.length, 2);
    assert.equal(honeydews[0].zone_id, 'honeydew_1');
    assert.equal(honeydews[1].zone_id, 'honeydew_2');

    const empty = reg.getZonesByResourceType('MEAT');
    assert.equal(empty.length, 0);
  });

  // RESOURCE-ZONE-12: getZonesAtCoordinate deterministic
  test('RESOURCE-ZONE-12: getZonesAtCoordinate queries all containing zones sorted by zone_id ASC', () => {
    const reg = new ResourceZoneRegistry({ boundary });
    reg.registerZone({
      zone_id: 'zone_outer',
      resource_type: 'WATER',
      region: { type: RegionType.RECTANGLE, bounds: { min_x: 0, max_x: 30, min_y: 0, max_y: 30, min_z: 0, max_z: 0 } }
    });
    reg.registerZone({
      zone_id: 'zone_inner',
      resource_type: 'NECTAR',
      region: { type: RegionType.RECTANGLE, bounds: { min_x: 10, max_x: 20, min_y: 10, max_y: 20, min_z: 0, max_z: 0 } }
    });

    // At (15, 15, 0): both match, sorted 'zone_inner', 'zone_outer'
    const at15 = reg.getZonesAtCoordinate({ x: 15, y: 15, z: 0 });
    assert.equal(at15.length, 2);
    assert.equal(at15[0].zone_id, 'zone_inner');
    assert.equal(at15[1].zone_id, 'zone_outer');

    // At (2, 2, 0): only outer matches
    const at2 = reg.getZonesAtCoordinate({ x: 2, y: 2, z: 0 });
    assert.equal(at2.length, 1);
    assert.equal(at2[0].zone_id, 'zone_outer');

    // At (50, 50, 0): neither matches
    const at50 = reg.getZonesAtCoordinate({ x: 50, y: 50, z: 0 });
    assert.equal(at50.length, 0);
  });

  // RESOURCE-ZONE-13: containsCoordinate deterministic
  test('RESOURCE-ZONE-13: containsCoordinate returns deterministic boolean', () => {
    const reg = new ResourceZoneRegistry({ boundary });
    reg.registerZone({
      zone_id: 'patch_1',
      resource_type: 'MUSHROOM',
      region: { type: RegionType.RECTANGLE, bounds: { min_x: 5, max_x: 10, min_y: 5, max_y: 10, min_z: 0, max_z: 0 } }
    });

    assert.equal(reg.containsCoordinate('patch_1', { x: 7, y: 7, z: 0 }), true);
    assert.equal(reg.containsCoordinate('patch_1', { x: 20, y: 20, z: 0 }), false);
    assert.equal(reg.containsCoordinate('non_existent', { x: 7, y: 7, z: 0 }), false);
  });

  // RESOURCE-ZONE-14: no ResourcePool quantity stored in zone
  test('RESOURCE-ZONE-14: SpatialResourceZone contains zero quantity or inventory fields', () => {
    const zone = new SpatialResourceZone({
      zone_id: 'zone_pure',
      resource_type: 'SEEDS',
      region: { type: RegionType.RECTANGLE, bounds: { min_x: 0, max_x: 5, min_y: 0, max_y: 5, min_z: 0, max_z: 0 } }
    });

    assert.equal(zone.quantity, undefined);
    assert.equal(zone.available_quantity, undefined);
    assert.equal(zone.remaining_quantity, undefined);
    assert.equal(zone.inventory, undefined);
    assert.equal(zone.capacity, undefined);
    assert.equal(zone.regeneration_rate, undefined);
  });

  // RESOURCE-ZONE-15: no ResourcePool mutation
  test('RESOURCE-ZONE-15: ResourceZone modules have zero imports or mutation of ResourcePool', async () => {
    const fs = await import('node:fs');
    const files = fs.readdirSync('D:/LinhSinhVN/game/spatial/resource_zone').map(f => `D:/LinhSinhVN/game/spatial/resource_zone/${f}`);
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      assert.equal(src.includes('ResourcePool'), false, `ResourcePool import/leak in ${f}`);
      assert.equal(src.includes('allocateResourceDemands'), false, `Allocation leak in ${f}`);
    }
  });

  // RESOURCE-ZONE-16: no organism position mutation
  test('RESOURCE-ZONE-16: ResourceZone queries never mutate organism positions', () => {
    const spatialWorld = new SpatialEntityRegistry(boundary);
    spatialWorld.register({ entity_id: 'forager_1', position: { x: 12, y: 12, z: 0 } });

    const reg = new ResourceZoneRegistry({ boundary });
    reg.registerZone({
      zone_id: 'seed_patch',
      resource_type: 'SEEDS',
      region: { type: RegionType.RECTANGLE, bounds: { min_x: 10, max_x: 20, min_y: 10, max_y: 20, min_z: 0, max_z: 0 } }
    });

    reg.getZonesAtCoordinate(spatialWorld.getEntity('forager_1').position);
    assert.deepEqual(spatialWorld.getEntity('forager_1').position, { x: 12, y: 12, z: 0 });
  });

  // RESOURCE-ZONE-17: no Habitat ownership leakage
  test('RESOURCE-ZONE-17: ResourceZone does not mutate or claim Habitat authority', async () => {
    const fs = await import('node:fs');
    const defSrc = fs.readFileSync('D:/LinhSinhVN/game/spatial/resource_zone/resource_zone_definition.js', 'utf8');
    assert.equal(defSrc.includes('HabitatDefinition'), false);
  });

  // RESOURCE-ZONE-18: no Shelter ownership leakage
  test('RESOURCE-ZONE-18: ResourceZone does not manage shelter occupancy', async () => {
    const fs = await import('node:fs');
    const regSrc = fs.readFileSync('D:/LinhSinhVN/game/spatial/resource_zone/resource_zone_registry.js', 'utf8');
    assert.equal(regSrc.includes('occupant_ids'), false);
    assert.equal(regSrc.includes('sheltered_in'), false);
  });

  // RESOURCE-ZONE-19: no MicroClimate calculation duplication
  test('RESOURCE-ZONE-19: ResourceZone modules do not duplicate micro-climate calculation', async () => {
    const fs = await import('node:fs');
    for (const f of ['resource_zone_definition.js', 'resource_zone_registry.js']) {
      const src = fs.readFileSync(`D:/LinhSinhVN/game/spatial/resource_zone/${f}`, 'utf8');
      assert.equal(src.includes('effective_temperature'), false);
      assert.equal(src.includes('effective_humidity'), false);
      assert.equal(src.includes('effective_security_factor'), false);
    }
  });

  // RESOURCE-ZONE-20: no Lifecycle interaction
  test('RESOURCE-ZONE-20: ResourceZone does not alter HP, energy, or hunger', async () => {
    const fs = await import('node:fs');
    const files = fs.readdirSync('D:/LinhSinhVN/game/spatial/resource_zone').map(f => `D:/LinhSinhVN/game/spatial/resource_zone/${f}`);
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      assert.equal(src.includes('nutrition_state'), false);
      assert.equal(src.includes('hunger'), false);
      assert.equal(src.includes('health'), false);
    }
  });

  // RESOURCE-ZONE-21: no Behavior interaction
  test('RESOURCE-ZONE-21: ResourceZone does not implement pathfinding or AI decisions', async () => {
    const fs = await import('node:fs');
    const files = fs.readdirSync('D:/LinhSinhVN/game/spatial/resource_zone').map(f => `D:/LinhSinhVN/game/spatial/resource_zone/${f}`);
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      assert.equal(src.includes('/behavior/'), false);
      assert.equal(src.includes('DecisionEngine'), false);
    }
  });

  // RESOURCE-ZONE-22: atomic registration failure
  test('RESOURCE-ZONE-22: invalid zone registration produces zero partial state mutation', () => {
    const reg = new ResourceZoneRegistry({ boundary });
    reg.registerZone({
      zone_id: 'z_valid',
      resource_type: 'SEEDS',
      region: { type: RegionType.RECTANGLE, bounds: { min_x: 0, max_x: 5, min_y: 0, max_y: 5, min_z: 0, max_z: 0 } }
    });

    assert.equal(reg.getAllZones().length, 1);

    // Attempt invalid registration (out of bounds)
    assert.throws(() => {
      reg.registerZone({
        zone_id: 'z_invalid',
        resource_type: 'SEEDS',
        region: { type: RegionType.RECTANGLE, bounds: { min_x: 0, max_x: 500, min_y: 0, max_y: 5, min_z: 0, max_z: 0 } }
      });
    });

    assert.equal(reg.getAllZones().length, 1);
    assert.equal(reg.getZone('z_invalid'), null);
  });

  // RESOURCE-ZONE-23: cold-start reconstruction
  test('RESOURCE-ZONE-23: cold-start deserialization reconstructs registry losslessly', () => {
    const raw = {
      zones: [
        {
          zone_id: 'cold_zone',
          resource_type: 'HONEYDEW',
          region: {
            type: 'RECTANGLE',
            bounds: { min_x: 5, max_x: 10, min_y: 5, max_y: 10, min_z: 0, max_z: 0 }
          },
          accessibility_requirements: ['CRAWL'],
          metadata: { notes: 'cold start' }
        }
      ]
    };

    const restored = ResourceZoneRegistry.deserialize(raw, { boundary });
    assert.equal(restored.getAllZones().length, 1);
    const z = restored.getZone('cold_zone');
    assert.ok(z);
    assert.equal(z.resource_type, 'HONEYDEW');
    assert.deepEqual(z.accessibility_requirements, ['CRAWL']);
    assert.equal(z.contains({ x: 7, y: 7, z: 0 }), true);
  });

  // RESOURCE-ZONE-24: invalid snapshot rejected
  test('RESOURCE-ZONE-24: invalid snapshot fails fast upon deserialization', () => {
    assert.throws(() => ResourceZoneRegistry.deserialize(null), TypeError);
    assert.throws(() => ResourceZoneRegistry.deserialize({ zones: 'NOT_ARRAY' }), TypeError);
    // Duplicate zone in snapshot
    const dupe = {
      zones: [
        { zone_id: 'same', resource_type: 'A', region: { type: 'RECTANGLE', bounds: { min_x: 0, max_x: 1, min_y: 0, max_y: 1, min_z: 0, max_z: 0 } } },
        { zone_id: 'same', resource_type: 'B', region: { type: 'RECTANGLE', bounds: { min_x: 2, max_x: 3, min_y: 2, max_y: 3, min_z: 0, max_z: 0 } } }
      ]
    };
    assert.throws(() => ResourceZoneRegistry.deserialize(dupe, { boundary }), /Duplicate zone_id/);
  });

  // RESOURCE-ZONE-25: overlap semantics match frozen specification
  test('RESOURCE-ZONE-25: overlapping zones coexist cleanly without merging or dropping', () => {
    const reg = new ResourceZoneRegistry({ boundary });
    reg.registerZone({
      zone_id: 'zone_seeds',
      resource_type: 'SEEDS',
      region: { type: RegionType.RECTANGLE, bounds: { min_x: 10, max_x: 20, min_y: 10, max_y: 20, min_z: 0, max_z: 0 } }
    });
    reg.registerZone({
      zone_id: 'zone_water',
      resource_type: 'WATER',
      region: { type: RegionType.RECTANGLE, bounds: { min_x: 15, max_x: 25, min_y: 15, max_y: 25, min_z: 0, max_z: 0 } }
    });

    // In overlap region (17, 17, 0)
    const matched = reg.getZonesAtCoordinate({ x: 17, y: 17, z: 0 });
    assert.equal(matched.length, 2);
    assert.equal(matched[0].zone_id, 'zone_seeds');
    assert.equal(matched[1].zone_id, 'zone_water');
  });

  // RESOURCE-ZONE-26: deterministic replay
  test('RESOURCE-ZONE-26: 100 replay runs produce bit-for-bit identical serialization', () => {
    function run() {
      const reg = new ResourceZoneRegistry({ boundary });
      const ids = ['zone_3', 'zone_1', 'zone_2'];
      for (const id of ids) {
        reg.registerZone({
          zone_id: id,
          resource_type: 'RES_' + id,
          region: { type: RegionType.RECTANGLE, bounds: { min_x: 0, max_x: 10, min_y: 0, max_y: 10, min_z: 0, max_z: 0 } }
        });
      }
      return JSON.stringify(reg.serialize());
    }

    const first = run();
    for (let i = 0; i < 100; i++) {
      assert.equal(run(), first);
    }
  });

  // RESOURCE-ZONE-27: forbidden API audit
  test('RESOURCE-ZONE-27: forbidden nondeterministic APIs are absent across game/spatial/resource_zone/**', async () => {
    const fs = await import('node:fs');
    const files = fs.readdirSync('D:/LinhSinhVN/game/spatial/resource_zone').map(f => `D:/LinhSinhVN/game/spatial/resource_zone/${f}`);
    for (const f of files) {
      const content = fs.readFileSync(f, 'utf8');
      assert.equal(content.includes('Math.random('), false, `Forbidden Math.random in ${f}`);
      assert.equal(content.includes('Date.now('), false, `Forbidden Date.now in ${f}`);
      assert.equal(content.includes('performance.now('), false, `Forbidden performance.now in ${f}`);
      assert.equal(content.includes('randomUUID('), false, `Forbidden randomUUID in ${f}`);
      assert.equal(content.includes('localeCompare('), false, `Forbidden localeCompare in ${f}`);
      assert.equal(content.includes('Intl.Collator'), false, `Forbidden Intl.Collator in ${f}`);
    }
  });

  // INTEGRATION TEST: Full Spatial Context Composition
  test('INTEGRATION: resolveSpatialContext composes Habitat + Shelter + Micro-climate + Resource Zones cleanly', () => {
    const habitatRegistry = new HabitatRegistry({ boundary: { min_x: 0, max_x: 100, min_y: 0, max_y: 100, min_z: -1, max_z: 2 } });
    const shelterRegistry = new ShelterRegistry({ boundary });
    const resourceZoneRegistry = new ResourceZoneRegistry({ boundary });

    // Register a shelter
    shelterRegistry.registerShelter({
      shelter_id: 'hollow_main',
      shelter_type: 'TREE_CAVITY',
      position: { x: 15, y: 15, z: 0 },
      capacity: 2,
      security_factor: 0.85,
      micro_climate_offsets: { temperature_delta: -2.0, humidity_delta: 0.1 }
    });

    // Register a resource zone
    resourceZoneRegistry.registerZone({
      zone_id: 'sap_grove',
      resource_type: 'TREE_SAP',
      region: { type: RegionType.RECTANGLE, bounds: { min_x: 10, max_x: 20, min_y: 10, max_y: 20, min_z: 0, max_z: 0 } }
    });

    // Organism enters shelter
    const spatialWorld = new SpatialEntityRegistry(boundary);
    spatialWorld.register({ entity_id: 'beetle_x', position: { x: 15, y: 15, z: 0 } });
    shelterRegistry.enterShelter({ spatialWorld, organismId: 'beetle_x', shelterId: 'hollow_main' });

    // Resolve unified spatial context
    const ctx = resolveSpatialContext({
      coordinate: { x: 15, y: 15, z: 0 },
      habitatRegistry,
      shelterRegistry,
      resourceZoneRegistry,
      environmentState: { temperature: 28.0, humidity: 0.4 },
      organismId: 'beetle_x'
    });

    assert.equal(ctx.is_sheltered, true);
    assert.equal(ctx.shelter_id, 'hollow_main');
    assert.equal(ctx.effective_security_factor, 0.85);
    // 28 - 2.0 (shelter delta) = 26.0
    assert.equal(ctx.micro_climate.temperature, 26.0);
    // Resource zones at coordinate
    assert.equal(ctx.resource_zones.length, 1);
    assert.equal(ctx.resource_zones[0].zone_id, 'sap_grove');
    assert.equal(ctx.resource_zones[0].resource_type, 'TREE_SAP');
    assert.ok(Object.isFrozen(ctx));
  });
});
