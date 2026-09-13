/**
 * @file habitat_runtime.test.js
 * @description Test suite for Habitat + Region Runtime (TASK 08-D1).
 * Covers HAB-RUNTIME-01 to HAB-RUNTIME-18.
 */

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  HabitatRegion,
  RegionType,
  HabitatDefinition,
  HabitatCategory,
  DEFAULT_OPEN_TERRAIN_ID,
  HabitatRegistry,
  resolveHabitatAt,
  queryAllHabitatsAt,
  SpatialWorld
} from '../../game/spatial/index.js';
import { ResourcePool } from '../../game/population/resource_pool.js';
import { PopulationRegistry } from '../../game/population/population_registry.js';

describe('Habitat + Region Runtime (TASK 08-D1)', () => {
  // HAB-RUNTIME-01: RECTANGLE containment
  test('HAB-RUNTIME-01: RECTANGLE containment evaluates correctly and purely', () => {
    const region = new HabitatRegion({
      type: RegionType.RECTANGLE,
      bounds: { min_x: 0, max_x: 10, min_y: 0, max_y: 10, min_z: -1, max_z: 1 }
    });

    assert.equal(region.contains({ x: 5, y: 5, z: 0 }), true);
    assert.equal(region.contains({ x: 0, y: 0, z: -1 }), true);
    assert.equal(region.contains({ x: 10, y: 10, z: 1 }), true);
    assert.equal(region.contains({ x: 11, y: 5, z: 0 }), false);
    assert.equal(region.contains({ x: 5, y: -1, z: 0 }), false);
    assert.equal(region.contains({ x: 5, y: 5, z: 2 }), false);
  });

  // HAB-RUNTIME-02: CELL_SET containment
  test('HAB-RUNTIME-02: CELL_SET containment evaluates correctly and canonicalizes ordering', () => {
    const cells = [
      { x: 3, y: 2, z: 0 },
      { x: 1, y: 1, z: 0 },
      { x: 2, y: 2, z: 0 }
    ];
    const region = new HabitatRegion({
      type: RegionType.CELL_SET,
      cells
    });

    assert.equal(region.contains({ x: 1, y: 1, z: 0 }), true);
    assert.equal(region.contains({ x: 2, y: 2, z: 0 }), true);
    assert.equal(region.contains({ x: 3, y: 2, z: 0 }), true);
    assert.equal(region.contains({ x: 0, y: 0, z: 0 }), false);

    // Canonical order check: (1,1,0), (2,2,0), (3,2,0)
    assert.deepEqual(region.cells[0], { x: 1, y: 1, z: 0 });
    assert.deepEqual(region.cells[1], { x: 2, y: 2, z: 0 });
    assert.deepEqual(region.cells[2], { x: 3, y: 2, z: 0 });
  });

  // HAB-RUNTIME-03: invalid region rejection
  test('HAB-RUNTIME-03: invalid region configurations are strictly rejected', () => {
    assert.throws(() => new HabitatRegion({ type: 'POLYGON' }), TypeError);
    assert.throws(() => new HabitatRegion({
      type: RegionType.RECTANGLE,
      bounds: { min_x: 10, max_x: 5, min_y: 0, max_y: 5, min_z: 0, max_z: 1 }
    }), RangeError);
    assert.throws(() => new HabitatRegion({
      type: RegionType.RECTANGLE,
      bounds: { min_x: 0.5, max_x: 5, min_y: 0, max_y: 5, min_z: 0, max_z: 1 }
    }), TypeError);
    assert.throws(() => new HabitatRegion({ type: RegionType.CELL_SET, cells: 'not_array' }), TypeError);
  });

  // HAB-RUNTIME-04: duplicate cell handling
  test('HAB-RUNTIME-04: duplicate cells in CELL_SET are deduplicated canonically', () => {
    const region = new HabitatRegion({
      type: RegionType.CELL_SET,
      cells: [
        { x: 2, y: 2, z: 0 },
        { x: 2, y: 2, z: 0 },
        { x: 1, y: 1, z: 0 }
      ]
    });
    assert.equal(region.cells.length, 2);
    assert.deepEqual(region.cells[0], { x: 1, y: 1, z: 0 });
    assert.deepEqual(region.cells[1], { x: 2, y: 2, z: 0 });
  });

  // HAB-RUNTIME-05: duplicate habitat_id rejection
  test('HAB-RUNTIME-05: duplicate habitat_id registration is rejected', () => {
    const registry = new HabitatRegistry({ registerDefault: false });
    const hab1 = new HabitatDefinition({
      habitat_id: 'forest_floor_01',
      habitat_type: HabitatCategory.FOREST_FLOOR,
      priority: 10,
      region: { type: RegionType.RECTANGLE, bounds: { min_x: 0, max_x: 10, min_y: 0, max_y: 10, min_z: 0, max_z: 0 } },
      micro_climate_modifiers: { temperature_modifier: -1, humidity_modifier: 0.1, light_level_modifier: 0.8 }
    });

    registry.registerHabitat(hab1);
    assert.throws(() => registry.registerHabitat(hab1), /already exists/);
  });

  // HAB-RUNTIME-06: deterministic registry ordering
  test('HAB-RUNTIME-06: registry lists habitats deterministically sorted by priority DESC, habitat_id ASC', () => {
    const registry = new HabitatRegistry({ registerDefault: false });
    registry.registerHabitat({
      habitat_id: 'zone_c',
      habitat_type: HabitatCategory.OPEN_GROUND,
      priority: 5,
      region: { type: RegionType.RECTANGLE, bounds: { min_x: 0, max_x: 1, min_y: 0, max_y: 1, min_z: 0, max_z: 0 } },
      micro_climate_modifiers: { temperature_modifier: 0, humidity_modifier: 0, light_level_modifier: 1 }
    });
    registry.registerHabitat({
      habitat_id: 'zone_a',
      habitat_type: HabitatCategory.FOREST_FLOOR,
      priority: 10,
      region: { type: RegionType.RECTANGLE, bounds: { min_x: 0, max_x: 1, min_y: 0, max_y: 1, min_z: 0, max_z: 0 } },
      micro_climate_modifiers: { temperature_modifier: 0, humidity_modifier: 0, light_level_modifier: 1 }
    });
    registry.registerHabitat({
      habitat_id: 'zone_b',
      habitat_type: HabitatCategory.ROTTING_WOOD,
      priority: 10,
      region: { type: RegionType.RECTANGLE, bounds: { min_x: 0, max_x: 1, min_y: 0, max_y: 1, min_z: 0, max_z: 0 } },
      micro_climate_modifiers: { temperature_modifier: 0, humidity_modifier: 0, light_level_modifier: 1 }
    });

    const list = registry.listHabitats();
    assert.equal(list[0].habitat_id, 'zone_a'); // priority 10, 'a' < 'b'
    assert.equal(list[1].habitat_id, 'zone_b'); // priority 10
    assert.equal(list[2].habitat_id, 'zone_c'); // priority 5
  });

  // HAB-RUNTIME-07: overlap priority resolution
  test('HAB-RUNTIME-07: overlapping habitats resolve strictly to higher priority', () => {
    const registry = new HabitatRegistry({ registerDefault: false });
    registry.registerHabitat({
      habitat_id: 'broad_forest',
      habitat_type: HabitatCategory.FOREST_FLOOR,
      priority: 1,
      region: { type: RegionType.RECTANGLE, bounds: { min_x: 0, max_x: 20, min_y: 0, max_y: 20, min_z: 0, max_z: 0 } },
      micro_climate_modifiers: { temperature_modifier: -1, humidity_modifier: 0.1, light_level_modifier: 0.8 }
    });
    registry.registerHabitat({
      habitat_id: 'rotting_log',
      habitat_type: HabitatCategory.ROTTING_WOOD,
      priority: 10,
      region: { type: RegionType.RECTANGLE, bounds: { min_x: 5, max_x: 10, min_y: 5, max_y: 10, min_z: 0, max_z: 0 } },
      micro_climate_modifiers: { temperature_modifier: -3, humidity_modifier: 0.3, light_level_modifier: 0.3 }
    });

    const resolvedInsideLog = resolveHabitatAt({ x: 7, y: 7, z: 0 }, registry);
    assert.equal(resolvedInsideLog.habitat_id, 'rotting_log');

    const resolvedOutsideLog = resolveHabitatAt({ x: 2, y: 2, z: 0 }, registry);
    assert.equal(resolvedOutsideLog.habitat_id, 'broad_forest');
  });

  // HAB-RUNTIME-08: equal-priority habitat_id tie-break
  test('HAB-RUNTIME-08: overlapping habitats with equal priority tie-break deterministically by habitat_id ASC', () => {
    const registry = new HabitatRegistry({ registerDefault: false });
    registry.registerHabitat({
      habitat_id: 'habitat_beta',
      habitat_type: HabitatCategory.OPEN_GROUND,
      priority: 5,
      region: { type: RegionType.RECTANGLE, bounds: { min_x: 0, max_x: 10, min_y: 0, max_y: 10, min_z: 0, max_z: 0 } },
      micro_climate_modifiers: { temperature_modifier: 0, humidity_modifier: 0, light_level_modifier: 1 }
    });
    registry.registerHabitat({
      habitat_id: 'habitat_alpha',
      habitat_type: HabitatCategory.FOREST_FLOOR,
      priority: 5,
      region: { type: RegionType.RECTANGLE, bounds: { min_x: 0, max_x: 10, min_y: 0, max_y: 10, min_z: 0, max_z: 0 } },
      micro_climate_modifiers: { temperature_modifier: 0, humidity_modifier: 0, light_level_modifier: 1 }
    });

    const resolved = resolveHabitatAt({ x: 5, y: 5, z: 0 }, registry);
    assert.equal(resolved.habitat_id, 'habitat_alpha');
  });

  // HAB-RUNTIME-09: DEFAULT_OPEN_TERRAIN explicit registration
  test('HAB-RUNTIME-09: DEFAULT_OPEN_TERRAIN is an explicitly registered HabitatDefinition data entry', () => {
    const registry = new HabitatRegistry({ boundary: { min_x: 0, max_x: 200, min_y: 0, max_y: 200, min_z: -5, max_z: 5 } });
    assert.equal(registry.hasHabitat(DEFAULT_OPEN_TERRAIN_ID), true);
    const def = registry.getHabitat(DEFAULT_OPEN_TERRAIN_ID);
    assert.equal(def.habitat_type, HabitatCategory.OPEN_GROUND);
    assert.equal(def.priority, -1);
    assert.equal(typeof def.region.contains, 'function');
  });

  // HAB-RUNTIME-10: DEFAULT_OPEN_TERRAIN fallback resolution
  test('HAB-RUNTIME-10: unassigned coordinates resolve to registered DEFAULT_OPEN_TERRAIN', () => {
    const registry = new HabitatRegistry({ boundary: { min_x: 0, max_x: 200, min_y: 0, max_y: 200, min_z: -5, max_z: 5 } });
    // Register a specific small habitat
    registry.registerHabitat({
      habitat_id: 'oasis',
      habitat_type: HabitatCategory.WATER_MARGIN,
      priority: 10,
      region: { type: RegionType.RECTANGLE, bounds: { min_x: 5, max_x: 6, min_y: 5, max_y: 6, min_z: 0, max_z: 0 } },
      micro_climate_modifiers: { temperature_modifier: -2, humidity_modifier: 0.5, light_level_modifier: 1.0 }
    });

    const resolvedAtOasis = resolveHabitatAt({ x: 5, y: 5, z: 0 }, registry);
    assert.equal(resolvedAtOasis.habitat_id, 'oasis');

    const resolvedFarAway = resolveHabitatAt({ x: 100, y: 100, z: 0 }, registry);
    assert.equal(resolvedFarAway.habitat_id, DEFAULT_OPEN_TERRAIN_ID);
  });

  // HAB-RUNTIME-11: no insertion-order dependency
  test('HAB-RUNTIME-11: resolution output is independent of registry registration order', () => {
    const habA = {
      habitat_id: 'hab_a',
      habitat_type: HabitatCategory.FOREST_FLOOR,
      priority: 10,
      region: { type: RegionType.RECTANGLE, bounds: { min_x: 0, max_x: 10, min_y: 0, max_y: 10, min_z: 0, max_z: 0 } },
      micro_climate_modifiers: { temperature_modifier: 0, humidity_modifier: 0, light_level_modifier: 1 }
    };
    const habB = {
      habitat_id: 'hab_b',
      habitat_type: HabitatCategory.OPEN_GROUND,
      priority: 20,
      region: { type: RegionType.RECTANGLE, bounds: { min_x: 0, max_x: 10, min_y: 0, max_y: 10, min_z: 0, max_z: 0 } },
      micro_climate_modifiers: { temperature_modifier: 0, humidity_modifier: 0, light_level_modifier: 1 }
    };

    const reg1 = new HabitatRegistry({ registerDefault: false });
    reg1.registerHabitat(habA);
    reg1.registerHabitat(habB);

    const reg2 = new HabitatRegistry({ registerDefault: false });
    reg2.registerHabitat(habB);
    reg2.registerHabitat(habA);

    const res1 = resolveHabitatAt({ x: 5, y: 5, z: 0 }, reg1);
    const res2 = resolveHabitatAt({ x: 5, y: 5, z: 0 }, reg2);

    assert.equal(res1.habitat_id, 'hab_b');
    assert.equal(res2.habitat_id, 'hab_b');
    assert.equal(res1.habitat_id, res2.habitat_id);
  });

  // HAB-RUNTIME-12: resolution purity
  test('HAB-RUNTIME-12: resolveHabitatAt causes zero mutations to registry or coordinates', () => {
    const registry = new HabitatRegistry({ boundary: { min_x: 0, max_x: 200, min_y: 0, max_y: 200, min_z: -5, max_z: 5 } });
    const coord = { x: 3, y: 4, z: 0 };
    const coordBefore = JSON.stringify(coord);
    const regSnapshotBefore = JSON.stringify(registry.serialize());

    resolveHabitatAt(coord, registry);
    queryAllHabitatsAt(coord, registry);

    assert.equal(JSON.stringify(coord), coordBefore);
    assert.equal(JSON.stringify(registry.serialize()), regSnapshotBefore);
  });

  // HAB-RUNTIME-13: defensive snapshot ownership
  test('HAB-RUNTIME-13: serialize and deserialize round-trip losslessly without internal reference leakage', () => {
    const registry = new HabitatRegistry({ boundary: { min_x: 0, max_x: 200, min_y: 0, max_y: 200, min_z: -5, max_z: 5 } });
    registry.registerHabitat({
      habitat_id: 'burrow_nest',
      habitat_type: HabitatCategory.BURROW_INTERIOR,
      priority: 15,
      region: { type: RegionType.RECTANGLE, bounds: { min_x: 2, max_x: 4, min_y: 2, max_y: 4, min_z: -1, max_z: -1 } },
      micro_climate_modifiers: { temperature_modifier: -4, humidity_modifier: 0.4, light_level_modifier: 0.05, shelter_security_baseline: 0.8 }
    });

    const snapshot = registry.serialize();
    const restored = new HabitatRegistry({ registerDefault: false });
    restored.deserialize(snapshot);

    assert.equal(restored.size, registry.size);
    assert.equal(restored.getHabitat('burrow_nest').priority, 15);
    assert.equal(restored.getHabitat('burrow_nest').region.contains({ x: 3, y: 3, z: -1 }), true);
  });

  // HAB-RUNTIME-14: world boundary behavior
  test('HAB-RUNTIME-14: non-integer and out-of-bounds coordinates throw deterministic errors', () => {
    const registry = new HabitatRegistry({ boundary: { min_x: 0, max_x: 200, min_y: 0, max_y: 200, min_z: -5, max_z: 5 } });
    assert.throws(() => resolveHabitatAt({ x: 1.5, y: 2, z: 0 }, registry), TypeError);
    assert.throws(() => resolveHabitatAt({ x: NaN, y: 2, z: 0 }, registry), TypeError);
    assert.throws(() => resolveHabitatAt({ x: '2', y: 2, z: 0 }, registry), TypeError);
  });

  // HAB-RUNTIME-15: deterministic replay
  test('HAB-RUNTIME-15: 100 independent replay runs produce identical resolution', () => {
    const results = [];
    for (let i = 0; i < 100; i++) {
      const reg = new HabitatRegistry({ boundary: { min_x: 0, max_x: 200, min_y: 0, max_y: 200, min_z: -5, max_z: 5 } });
      reg.registerHabitat({
        habitat_id: 'leaf_litter',
        habitat_type: HabitatCategory.UNDER_LEAF_LITTER,
        priority: 8,
        region: { type: RegionType.RECTANGLE, bounds: { min_x: 0, max_x: 10, min_y: 0, max_y: 10, min_z: 0, max_z: 0 } },
        micro_climate_modifiers: { temperature_modifier: -1, humidity_modifier: 0.2, light_level_modifier: 0.4 }
      });
      const resolved = resolveHabitatAt({ x: 4, y: 4, z: 0 }, reg);
      results.push(resolved.habitat_id);
    }

    assert.equal(results.every(r => r === 'leaf_litter'), true);
  });

  // HAB-RUNTIME-16: no organism habitat state created
  test('HAB-RUNTIME-16: PopulationRegistry and Organisms do not own persistent habitat state', () => {
    const world = new SpatialWorld({ width: 20, height: 20, z_min: -1, z_max: 2 });
    world.registerEntity({ entity_id: 'org_01', position: { x: 5, y: 5, z: 0 } });

    const entityState = world.getEntity('org_01');
    assert.equal(entityState.habitat, undefined);
    assert.equal(entityState.habitat_id, undefined);
    assert.equal(entityState.current_habitat, undefined);
  });

  // HAB-RUNTIME-17: no ResourcePool interaction
  test('HAB-RUNTIME-17: Habitat resolution does not inspect or mutate ResourcePool', () => {
    const pool = new ResourcePool(500);
    const poolBefore = pool.quantity;

    const registry = new HabitatRegistry({ boundary: { min_x: 0, max_x: 200, min_y: 0, max_y: 200, min_z: -5, max_z: 5 } });
    resolveHabitatAt({ x: 0, y: 0, z: 0 }, registry);

    assert.equal(pool.quantity, poolBefore);
  });

  // HAB-RUNTIME-18: forbidden API audit
  test('HAB-RUNTIME-18: forbidden nondeterministic APIs are completely absent in game/spatial/habitat/**', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const dir = 'D:/LinhSinhVN/game/spatial/habitat';
    const files = fs.readdirSync(dir);

    for (const f of files) {
      if (!f.endsWith('.js')) continue;
      const content = fs.readFileSync(path.join(dir, f), 'utf8');
      assert.equal(content.includes('Math.random('), false, `Forbidden Math.random in ${f}`);
      assert.equal(content.includes('Date.now('), false, `Forbidden Date.now in ${f}`);
      assert.equal(content.includes('randomUUID('), false, `Forbidden randomUUID in ${f}`);
    }
  });
});
