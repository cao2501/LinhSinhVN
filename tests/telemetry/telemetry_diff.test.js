import test from 'node:test';
import assert from 'node:assert/strict';
import { diffTelemetry } from '../../game/telemetry/telemetry_diff.js';

test('TelemetryDiff Test Suite (TC-TEL-10, TC-TEL-11)', async (t) => {

  await t.test('TC-TEL-10: Equal telemetry diff produces equal: true and first_divergence_path: null', () => {
    const recordA = {
      schema_version: '1.0.0',
      simulation_tick: 5,
      resources: { initial: 100, allocated: 50 },
      events: [{ id: 'evt_1', type: 'FEED' }]
    };
    const recordB = JSON.parse(JSON.stringify(recordA));

    const result = diffTelemetry(recordA, recordB);
    assert.strictEqual(result.equal, true);
    assert.strictEqual(result.first_divergence_path, null);
    assert.strictEqual(result.differences.length, 0);
  });

  await t.test('TC-TEL-11: Exact divergence path and deterministic difference reporting', () => {
    const recordA = {
      schema_version: '1.0.0',
      simulation_tick: 5,
      resources: { initial: 100, allocated: 50 },
      events: [{ id: 'evt_1', type: 'FEED' }]
    };
    const recordB = {
      schema_version: '1.0.0',
      simulation_tick: 5,
      resources: { initial: 100, allocated: 45 },
      events: [{ id: 'evt_1', type: 'FLEE' }]
    };

    const result = diffTelemetry(recordA, recordB);
    assert.strictEqual(result.equal, false);
    // Differences sorted by canonical keys: events comes before resources in 'e' vs 'r'
    assert.strictEqual(result.first_divergence_path, '$.events[0].type');
    assert.strictEqual(result.differences.length, 2);
    assert.deepStrictEqual(result.differences[0], {
      path: '$.events[0].type',
      expected: 'FEED',
      actual: 'FLEE'
    });
    assert.deepStrictEqual(result.differences[1], {
      path: '$.resources.allocated',
      expected: 50,
      actual: 45
    });
  });

  await t.test('Diff with missing fields or array length mismatches', () => {
    const objA = { a: 1, b: [10, 20] };
    const objB = { a: 1, b: [10] };

    const diff = diffTelemetry(objA, objB);
    assert.strictEqual(diff.equal, false);
    assert.strictEqual(diff.first_divergence_path, '$.b[1]');
    assert.strictEqual(diff.differences[0].expected, 20);
    assert.strictEqual(diff.differences[0].actual, '<missing>');
  });

  await t.test('Diff normalizes -0 vs 0 as identical', () => {
    const objA = { val: -0 };
    const objB = { val: 0 };

    const diff = diffTelemetry(objA, objB);
    assert.strictEqual(diff.equal, true);
    assert.strictEqual(diff.differences.length, 0);
  });
});
