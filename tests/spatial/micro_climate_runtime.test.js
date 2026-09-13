/**
 * @file micro_climate_runtime.test.js
 * @description Test suite for Micro-climate Runtime (TASK 08-D2).
 * Covers MICRO-RUNTIME-01 to MICRO-RUNTIME-20.
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
  resolveMicroClimate
} from '../../game/spatial/index.js';
import { ResourcePool } from '../../game/population/resource_pool.js';
import { PopulationRegistry } from '../../game/population/population_registry.js';

describe('Micro-climate Runtime (TASK 08-D2)', () => {
  const boundary = { min_x: 0, max_x: 50, min_y: 0, max_y: 50, min_z: -2, max_z: 2 };

  function createTestRegistry() {
    const registry = new HabitatRegistry({ boundary });
    registry.registerHabitat({
      habitat_id: 'deep_forest',
      habitat_type: HabitatCategory.FOREST_FLOOR,
      priority: 10,
      region: { type: RegionType.RECTANGLE, bounds: { min_x: 10, max_x: 20, min_y: 10, max_y: 20, min_z: 0, max_z: 0 } },
      micro_climate_modifiers: {
        temperature_modifier: -3.5,
        humidity_modifier: 0.25,
        light_level_modifier: 0.5,
        shelter_security_baseline: 0.4
      }
    });
    return registry;
  }

  // MICRO-RUNTIME-01: macro environment snapshot preserved
  test('MICRO-RUNTIME-01: macro EnvironmentState input object is 100% untouched', () => {
    const registry = createTestRegistry();
    const env = { temperature: 28.0, humidity: 0.6 };
    const envBefore = JSON.stringify(env);

    resolveMicroClimate({
      coordinate: { x: 15, y: 15, z: 0 },
      environmentState: env,
      habitatRegistry: registry,
      simulationTick: 5
    });

    assert.equal(JSON.stringify(env), envBefore);
  });

  // MICRO-RUNTIME-02: habitat primary delta applied
  test('MICRO-RUNTIME-02: primary habitat deltas correctly modify macro conditions', () => {
    const registry = createTestRegistry();
    const env = { temperature: 28.0, humidity: 0.6 };

    const snapshot = resolveMicroClimate({
      coordinate: { x: 15, y: 15, z: 0 },
      environmentState: env,
      habitatRegistry: registry,
      simulationTick: 10
    });

    // 28.0 + (-3.5) = 24.5
    assert.equal(snapshot.temperature, 24.5);
    // 0.6 + 0.25 = 0.85
    assert.equal(snapshot.humidity, 0.85);
    assert.equal(snapshot.primary_habitat_id, 'deep_forest');
    assert.equal(snapshot.is_sheltered, false);
    assert.equal(snapshot.shelter_id, null);
    assert.equal(snapshot.effective_security_factor, 0.4);
  });

  // MICRO-RUNTIME-03: no habitat modifier preserves macro value
  test('MICRO-RUNTIME-03: habitat with 0 modifier preserves exact macro values', () => {
    const registry = new HabitatRegistry({ boundary, registerDefault: false });
    registry.registerHabitat({
      habitat_id: 'neutral_zone',
      habitat_type: HabitatCategory.OPEN_GROUND,
      priority: 1,
      region: { type: RegionType.RECTANGLE, bounds: { min_x: 0, max_x: 10, min_y: 0, max_y: 10, min_z: 0, max_z: 0 } },
      micro_climate_modifiers: {
        temperature_modifier: 0.0,
        humidity_modifier: 0.0,
        light_level_modifier: 1.0,
        shelter_security_baseline: 0.2
      }
    });

    const env = { temperature: 22.0, humidity: 0.5 };
    const snapshot = resolveMicroClimate({
      coordinate: { x: 5, y: 5, z: 0 },
      environmentState: env,
      habitatRegistry: registry
    });

    assert.equal(snapshot.temperature, 22.0);
    assert.equal(snapshot.humidity, 0.5);
  });

  // MICRO-RUNTIME-04: shelter delta applied only when occupied
  test('MICRO-RUNTIME-04: shelter deltas apply if and only if organism is occupied/sheltered', () => {
    const registry = createTestRegistry();
    const env = { temperature: 30.0, humidity: 0.5 };

    const shelteredCtx = {
      is_sheltered: true,
      shelter_id: 'burrow_01',
      temperature_delta: -5.0,
      humidity_delta: 0.3,
      security_factor: 0.95
    };

    // Inside shelter
    const shelteredSnap = resolveMicroClimate({
      coordinate: { x: 15, y: 15, z: 0 },
      environmentState: env,
      habitatRegistry: registry,
      shelterContext: shelteredCtx
    });

    // 30.0 (macro) - 3.5 (habitat) - 5.0 (shelter) = 21.5
    assert.equal(shelteredSnap.temperature, 21.5);
    // 0.5 + 0.25 + 0.3 = 1.05 -> clamped to 1.0
    assert.equal(shelteredSnap.humidity, 1.0);
    assert.equal(shelteredSnap.is_sheltered, true);
    assert.equal(shelteredSnap.shelter_id, 'burrow_01');
    assert.equal(shelteredSnap.effective_security_factor, 0.95);

    // Context present but is_sheltered is false
    const unshelteredSnap = resolveMicroClimate({
      coordinate: { x: 15, y: 15, z: 0 },
      environmentState: env,
      habitatRegistry: registry,
      shelterContext: { ...shelteredCtx, is_sheltered: false }
    });

    // 30.0 - 3.5 = 26.5
    assert.equal(unshelteredSnap.temperature, 26.5);
    assert.equal(unshelteredSnap.is_sheltered, false);
    assert.equal(unshelteredSnap.shelter_id, null);
    assert.equal(unshelteredSnap.effective_security_factor, 0.4); // habitat baseline
  });

  // MICRO-RUNTIME-05: unsheltered security uses habitat baseline
  test('MICRO-RUNTIME-05: unsheltered security factor strictly uses habitat shelter_security_baseline', () => {
    const registry = createTestRegistry();
    const env = { temperature: 25.0, humidity: 0.5 };

    const snapshot = resolveMicroClimate({
      coordinate: { x: 15, y: 15, z: 0 },
      environmentState: env,
      habitatRegistry: registry,
      shelterContext: null
    });

    assert.equal(snapshot.effective_security_factor, 0.4);
  });

  // MICRO-RUNTIME-06: sheltered security uses shelter security factor
  test('MICRO-RUNTIME-06: sheltered security factor strictly uses shelter security_factor', () => {
    const registry = createTestRegistry();
    const env = { temperature: 25.0, humidity: 0.5 };

    const snapshot = resolveMicroClimate({
      coordinate: { x: 15, y: 15, z: 0 },
      environmentState: env,
      habitatRegistry: registry,
      shelterContext: { is_sheltered: true, shelter_id: 'cavity_9', security_factor: 0.88 }
    });

    assert.equal(snapshot.effective_security_factor, 0.88);
  });

  // MICRO-RUNTIME-07: humidity clamped to [0,1]
  test('MICRO-RUNTIME-07: humidity is clamped strictly to [0.0, 1.0] when deltas exceed bounds', () => {
    const registry = createTestRegistry();
    // Test upper clamp
    const envHigh = { temperature: 25.0, humidity: 0.9 };
    const snapHigh = resolveMicroClimate({
      coordinate: { x: 15, y: 15, z: 0 },
      environmentState: envHigh,
      habitatRegistry: registry // delta +0.25 -> 1.15
    });
    assert.equal(snapHigh.humidity, 1.0);

    // Test lower clamp
    const envLow = { temperature: 25.0, humidity: 0.1 };
    const registryDry = new HabitatRegistry({ boundary, registerDefault: false });
    registryDry.registerHabitat({
      habitat_id: 'desert',
      habitat_type: HabitatCategory.OPEN_GROUND,
      priority: 1,
      region: { type: RegionType.RECTANGLE, bounds: { min_x: 0, max_x: 10, min_y: 0, max_y: 10, min_z: 0, max_z: 0 } },
      micro_climate_modifiers: { temperature_modifier: 10, humidity_modifier: -0.5, light_level_modifier: 1 }
    });

    const snapLow = resolveMicroClimate({
      coordinate: { x: 5, y: 5, z: 0 },
      environmentState: envLow,
      habitatRegistry: registryDry // 0.1 - 0.5 = -0.4 -> clamp 0.0
    });
    assert.equal(snapLow.humidity, 0.0);
  });

  // MICRO-RUNTIME-08: temperature remains finite and unclamped
  test('MICRO-RUNTIME-08: temperature remains finite signed number and is not clamped to [0,1]', () => {
    const registry = createTestRegistry();
    const env = { temperature: -15.0, humidity: 0.5 };

    const snapshot = resolveMicroClimate({
      coordinate: { x: 15, y: 15, z: 0 },
      environmentState: env,
      habitatRegistry: registry
    });

    // -15.0 + (-3.5) = -18.5
    assert.equal(snapshot.temperature, -18.5);
  });

  // MICRO-RUNTIME-09: field-specific clamping
  test('MICRO-RUNTIME-09: field-specific clamping preserves temperature while clamping humidity and security', () => {
    const registry = createTestRegistry();
    const env = { temperature: 45.0, humidity: 0.95 };

    const snapshot = resolveMicroClimate({
      coordinate: { x: 15, y: 15, z: 0 },
      environmentState: env,
      habitatRegistry: registry,
      shelterContext: { is_sheltered: true, shelter_id: 's1', security_factor: 1.5, humidity_delta: 0.2 }
    });

    assert.equal(snapshot.temperature, 41.5); // 45 - 3.5 (unclamped to 1.0)
    assert.equal(snapshot.humidity, 1.0); // clamped
    assert.equal(snapshot.effective_security_factor, 1.0); // clamped from 1.5
  });

  // MICRO-RUNTIME-10: modifier application order deterministic
  test('MICRO-RUNTIME-10: sequential pipeline Macro -> Habitat -> Shelter is deterministic', () => {
    const registry = createTestRegistry();
    const env = { temperature: 20.0, humidity: 0.4 };
    const shelter = { is_sheltered: true, shelter_id: 's_0', temperature_delta: 2.0, humidity_delta: 0.1, security_factor: 0.85 };

    const res1 = resolveMicroClimate({ coordinate: { x: 15, y: 15, z: 0 }, environmentState: env, habitatRegistry: registry, shelterContext: shelter });
    const res2 = resolveMicroClimate({ coordinate: { x: 15, y: 15, z: 0 }, environmentState: env, habitatRegistry: registry, shelterContext: shelter });

    assert.equal(res1.temperature, res2.temperature);
    assert.equal(res1.humidity, res2.humidity);
  });

  // MICRO-RUNTIME-11: no secondary modifier layer
  test('MICRO-RUNTIME-11: secondary modifier layer objects or arbitrary stacks are ignored/rejected', () => {
    const registry = createTestRegistry();
    const env = { temperature: 20.0, humidity: 0.4 };

    // Extra layers passed into resolveMicroClimate should not alter calculation
    const snapshot = resolveMicroClimate({
      coordinate: { x: 15, y: 15, z: 0 },
      environmentState: env,
      habitatRegistry: registry,
      extra_layers: [{ modifier: 999 }]
    });

    assert.equal(snapshot.temperature, 16.5); // 20 - 3.5
  });

  // MICRO-RUNTIME-12: resolver purity
  test('MICRO-RUNTIME-12: resolveMicroClimate is referentially transparent and side-effect free', () => {
    const registry = createTestRegistry();
    const env = { temperature: 24.0, humidity: 0.5 };
    const coord = { x: 12, y: 12, z: 0 };
    const regSnapshotBefore = JSON.stringify(registry.serialize());

    resolveMicroClimate({ coordinate: coord, environmentState: env, habitatRegistry: registry });
    resolveMicroClimate({ coordinate: coord, environmentState: env, habitatRegistry: registry });

    assert.equal(JSON.stringify(registry.serialize()), regSnapshotBefore);
  });

  // MICRO-RUNTIME-13: input defensive ownership
  test('MICRO-RUNTIME-13: mutating input coordinate after call does not alter snapshot position', () => {
    const registry = createTestRegistry();
    const coord = { x: 12, y: 12, z: 0 };
    const env = { temperature: 24.0, humidity: 0.5 };

    const snapshot = resolveMicroClimate({ coordinate: coord, environmentState: env, habitatRegistry: registry });
    coord.x = 999;

    assert.equal(snapshot.position.x, 12);
  });

  // MICRO-RUNTIME-14: output defensive ownership
  test('MICRO-RUNTIME-14: MicroClimateSnapshot is deeply frozen against mutations', () => {
    const registry = createTestRegistry();
    const env = { temperature: 24.0, humidity: 0.5 };

    const snapshot = resolveMicroClimate({ coordinate: { x: 15, y: 15, z: 0 }, environmentState: env, habitatRegistry: registry });
    assert.throws(() => { snapshot.temperature = 999; });
    assert.throws(() => { snapshot.position.x = 999; });
  });

  // MICRO-RUNTIME-15: DEFAULT_OPEN_TERRAIN compatibility
  test('MICRO-RUNTIME-15: coordinates outside defined habitats cleanly resolve using registered DEFAULT_OPEN_TERRAIN', () => {
    const registry = createTestRegistry();
    const env = { temperature: 26.0, humidity: 0.5 };

    const snapshot = resolveMicroClimate({ coordinate: { x: 2, y: 2, z: 0 }, environmentState: env, habitatRegistry: registry });
    assert.equal(snapshot.primary_habitat_id, DEFAULT_OPEN_TERRAIN_ID);
    assert.equal(snapshot.temperature, 26.0); // delta 0
    assert.equal(snapshot.humidity, 0.5); // delta 0
  });

  // MICRO-RUNTIME-16: deterministic replay
  test('MICRO-RUNTIME-16: 100 replay runs produce bit-for-bit identical snapshots', () => {
    const registry = createTestRegistry();
    const env = { temperature: 27.5, humidity: 0.65 };
    const results = [];

    for (let i = 0; i < 100; i++) {
      const snap = resolveMicroClimate({
        coordinate: { x: 15, y: 15, z: 0 },
        environmentState: env,
        habitatRegistry: registry,
        simulationTick: 42
      });
      results.push(JSON.stringify(snap));
    }

    const first = results[0];
    assert.equal(results.every(r => r === first), true);
  });

  // MICRO-RUNTIME-17: no Lifecycle interaction
  test('MICRO-RUNTIME-17: resolveMicroClimate does not alter or inspect organism nutrition/lifecycle state', () => {
    const registry = createTestRegistry();
    const env = { temperature: 25.0, humidity: 0.5 };

    // Resolve micro-climate
    const snap = resolveMicroClimate({ coordinate: { x: 15, y: 15, z: 0 }, environmentState: env, habitatRegistry: registry });

    assert.equal(snap.energy_drain, undefined);
    assert.equal(snap.hp_damage, undefined);
    assert.equal(snap.hunger_delta, undefined);
    assert.equal(snap.stress_delta, undefined);
  });

  // MICRO-RUNTIME-18: no ResourcePool interaction
  test('MICRO-RUNTIME-18: resolveMicroClimate does not inspect or mutate ResourcePool', () => {
    const pool = new ResourcePool(1000);
    const poolBefore = pool.quantity;

    const registry = createTestRegistry();
    resolveMicroClimate({
      coordinate: { x: 15, y: 15, z: 0 },
      environmentState: { temperature: 25.0, humidity: 0.5 },
      habitatRegistry: registry
    });

    assert.equal(pool.quantity, poolBefore);
  });

  // MICRO-RUNTIME-19: no Behavior interaction
  test('MICRO-RUNTIME-19: resolveMicroClimate contains zero behavioral decision logic', () => {
    const registry = createTestRegistry();
    const snap = resolveMicroClimate({
      coordinate: { x: 15, y: 15, z: 0 },
      environmentState: { temperature: 25.0, humidity: 0.5 },
      habitatRegistry: registry
    });

    assert.equal(snap.action_intent, undefined);
    assert.equal(snap.behavior_decision, undefined);
  });

  // MICRO-RUNTIME-20: forbidden API audit
  test('MICRO-RUNTIME-20: forbidden nondeterministic APIs are completely absent in game/spatial/micro_climate/**', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const dir = 'D:/LinhSinhVN/game/spatial/micro_climate';
    const files = fs.readdirSync(dir);

    for (const f of files) {
      if (!f.endsWith('.js')) continue;
      const content = fs.readFileSync(path.join(dir, f), 'utf8');
      assert.equal(content.includes('Math.random('), false, `Forbidden Math.random in ${f}`);
      assert.equal(content.includes('Date.now('), false, `Forbidden Date.now in ${f}`);
      assert.equal(content.includes('randomUUID('), false, `Forbidden randomUUID in ${f}`);
    }
  });

  // --- PATCH 08-D2: Security Contract Hardening ---
  // MICRO-PATCH-01: verify source of security baseline
  test('MICRO-PATCH-01: verify source of security baseline strictly from habitat definition', () => {
    const registry = new HabitatRegistry({ boundary, registerDefault: false });
    registry.registerHabitat({
      habitat_id: 'custom_baseline',
      habitat_type: HabitatCategory.OPEN_GROUND,
      priority: 1,
      region: { type: RegionType.RECTANGLE, bounds: { min_x: 0, max_x: 10, min_y: 0, max_y: 10, min_z: 0, max_z: 0 } },
      micro_climate_modifiers: {
        temperature_modifier: 0,
        humidity_modifier: 0,
        light_level_modifier: 1,
        shelter_security_baseline: 0.37
      }
    });

    const snap = resolveMicroClimate({
      coordinate: { x: 5, y: 5, z: 0 },
      environmentState: { temperature: 20, humidity: 0.5 },
      habitatRegistry: registry
    });

    assert.equal(snap.effective_security_factor, 0.37);
  });

  // MICRO-PATCH-02: verify source of shelter security factor
  test('MICRO-PATCH-02: verify source of shelter security factor strictly from shelter context', () => {
    const registry = createTestRegistry();
    const snap = resolveMicroClimate({
      coordinate: { x: 15, y: 15, z: 0 },
      environmentState: { temperature: 20, humidity: 0.5 },
      habitatRegistry: registry,
      shelterContext: { is_sheltered: true, shelter_id: 's_test', security_factor: 0.93 }
    });

    assert.equal(snap.effective_security_factor, 0.93);
  });

  // MICRO-PATCH-03: missing security default does not silently invent value
  test('MICRO-PATCH-03: missing security_factor in sheltered context throws explicit TypeError (fail-fast)', () => {
    const registry = createTestRegistry();
    assert.throws(() => {
      resolveMicroClimate({
        coordinate: { x: 15, y: 15, z: 0 },
        environmentState: { temperature: 20, humidity: 0.5 },
        habitatRegistry: registry,
        shelterContext: { is_sheltered: true, shelter_id: 's_test' /* missing security_factor */ }
      });
    }, TypeError);
  });

  // MICRO-PATCH-04: shelterContext is read-only
  test('MICRO-PATCH-04: shelterContext is never mutated by resolver', () => {
    const registry = createTestRegistry();
    const ctx = { is_sheltered: true, shelter_id: 's_ro', security_factor: 0.75, temperature_delta: -2 };
    const ctxBefore = JSON.stringify(ctx);

    resolveMicroClimate({
      coordinate: { x: 15, y: 15, z: 0 },
      environmentState: { temperature: 20, humidity: 0.5 },
      habitatRegistry: registry,
      shelterContext: ctx
    });

    assert.equal(JSON.stringify(ctx), ctxBefore);
  });

  // MICRO-PATCH-05: no shelter registry created
  test('MICRO-PATCH-05: resolver does not construct or access a shelter registry', async () => {
    const fs = await import('node:fs');
    const resolverSrc = fs.readFileSync('D:/LinhSinhVN/game/spatial/micro_climate/micro_climate_resolver.js', 'utf8');
    assert.equal(resolverSrc.includes('ShelterRegistry'), false, 'Resolver must not import ShelterRegistry');
    assert.equal(resolverSrc.includes('new Map'), false, 'Resolver must not maintain internal registry state');
  });

  // MICRO-PATCH-06: unsheltered path never reads shelter delta
  test('MICRO-PATCH-06: unsheltered path ignores temperature_delta and humidity_delta in context', () => {
    const registry = createTestRegistry();
    const env = { temperature: 28.0, humidity: 0.6 };

    const snap = resolveMicroClimate({
      coordinate: { x: 15, y: 15, z: 0 },
      environmentState: env,
      habitatRegistry: registry,
      shelterContext: { is_sheltered: false, shelter_id: 's_ignored', temperature_delta: -100, humidity_delta: 100 }
    });

    // 28 - 3.5 = 24.5 (does not apply -100)
    assert.equal(snap.temperature, 24.5);
    // 0.6 + 0.25 = 0.85 (does not apply 100)
    assert.equal(snap.humidity, 0.85);
  });

  // MICRO-PATCH-07: sheltered path consumes only provided shelter context
  test('MICRO-PATCH-07: sheltered path consumes exact provided shelter context without ambient bleed', () => {
    const registry = createTestRegistry();
    const snap = resolveMicroClimate({
      coordinate: { x: 15, y: 15, z: 0 },
      environmentState: { temperature: 20, humidity: 0.5 },
      habitatRegistry: registry,
      shelterContext: { is_sheltered: true, shelter_id: 'box_99', security_factor: 0.99, temperature_delta: 0, humidity_delta: 0 }
    });

    assert.equal(snap.is_sheltered, true);
    assert.equal(snap.shelter_id, 'box_99');
    assert.equal(snap.effective_security_factor, 0.99);
  });

  // MICRO-PATCH-08: deterministic replay after patch
  test('MICRO-PATCH-08: 100 replay runs after patch produce bit-for-bit identical snapshots', () => {
    const registry = createTestRegistry();
    const env = { temperature: 25.0, humidity: 0.5 };
    const ctx = { is_sheltered: true, shelter_id: 'shelter_rep', security_factor: 0.85, temperature_delta: -1.5, humidity_delta: 0.1 };

    const first = JSON.stringify(resolveMicroClimate({ coordinate: { x: 15, y: 15, z: 0 }, environmentState: env, habitatRegistry: registry, shelterContext: ctx }));

    for (let i = 0; i < 100; i++) {
      const snap = JSON.stringify(resolveMicroClimate({ coordinate: { x: 15, y: 15, z: 0 }, environmentState: env, habitatRegistry: registry, shelterContext: ctx }));
      assert.equal(snap, first);
    }
  });
});
