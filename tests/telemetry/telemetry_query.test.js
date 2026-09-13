import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getTickRecord,
  getOrganismTrace,
  getResourceArbitrationTrace,
  getReproductionTrace,
  getEventsTrace
} from '../../game/telemetry/telemetry_query.js';

test('TelemetryQuery Test Suite (TC-TEL-12 -> TC-TEL-17)', async (t) => {

  const sampleRecords = [
    {
      schema_version: '1.0.0',
      simulation_tick: 0,
      environment: { before: { temp: 25 }, after: { temp: 25 } },
      resources: { initial: 100, demanded: 20, allocated: 20, unmet: 0, remaining: 80 },
      behavior: [
        { organism_id: 'org_1', intent: { action_type: 'FEED', priority: 1 } },
        { organism_id: 'org_2', intent: { action_type: 'REST', priority: 3 } }
      ],
      interactions: {
        interactions: [
          { organism_id: 'org_1', interaction_type: 'FEED_RESOURCE', resource_type: 'ORGANIC_HUMUS', quantity: 20 }
        ]
      },
      biological_inputs: {
        organism_bundles: [
          { organism_id: 'org_1', allocated_food: 20 }
        ]
      },
      biological_outcomes: [
        { organism_id: 'org_1', is_alive: true, energy: 90 },
        { organism_id: 'org_2', is_alive: true, energy: 70 }
      ],
      reproduction: { pairs_evaluated: 0, pairs_mated: 0, offspring_born: 0 },
      events: [
        { event_id: 'evt_1', organism_id: 'org_1', event_type: 'FEED' }
      ],
      digest: '0123456789abcdef'
    },
    {
      schema_version: '1.0.0',
      simulation_tick: 1,
      environment: { before: { temp: 25 }, after: { temp: 26 } },
      resources: { initial: 80, demanded: 10, allocated: 10, unmet: 0, remaining: 70 },
      behavior: [
        { organism_id: 'org_1', intent: { action_type: 'SEEK_MATE', priority: 2 } },
        { organism_id: 'org_2', intent: { action_type: 'SEEK_MATE', priority: 2 } }
      ],
      interactions: {
        interactions: [
          { organism_id: 'org_1', target_id: 'org_2', interaction_type: 'COURTSHIP' }
        ]
      },
      biological_inputs: {
        organism_bundles: []
      },
      biological_outcomes: [
        { organism_id: 'org_1', is_alive: true, energy: 85 },
        { organism_id: 'org_2', is_alive: true, energy: 65 }
      ],
      reproduction: {
        pairs_evaluated: 1,
        pairs_mated: 1,
        offspring_born: 1,
        offspring_ids: ['org_child_1']
      },
      events: [
        { event_id: 'evt_2', organism_id: 'org_1', event_type: 'MATE' },
        { event_id: 'evt_3', organism_id: 'org_2', event_type: 'MATE' },
        { event_id: 'evt_4', organism_id: 'org_child_1', event_type: 'BORN' }
      ],
      digest: 'fedcba9876543210'
    }
  ];

  await t.test('TC-TEL-13: getTickRecord retrieves exact tick record or null', () => {
    const rec0 = getTickRecord(sampleRecords, 0);
    assert.strictEqual(rec0.simulation_tick, 0);
    assert.strictEqual(rec0.digest, '0123456789abcdef');

    const rec1 = getTickRecord(sampleRecords, 1);
    assert.strictEqual(rec1.simulation_tick, 1);

    const recNone = getTickRecord(sampleRecords, 999);
    assert.strictEqual(recNone, null);
  });

  await t.test('TC-TEL-12 & TC-TEL-15: getOrganismTrace provides full behavior -> interaction -> biology timeline', () => {
    const trace = getOrganismTrace(sampleRecords, 'org_1');
    assert.strictEqual(trace.length, 2);

    // Tick 0 milestone
    assert.strictEqual(trace[0].simulation_tick, 0);
    assert.strictEqual(trace[0].behavior.intent.action_type, 'FEED');
    assert.strictEqual(trace[0].interactions[0].resource_type, 'ORGANIC_HUMUS');
    assert.strictEqual(trace[0].biological_input.allocated_food, 20);
    assert.strictEqual(trace[0].biological_outcome.energy, 90);
    assert.strictEqual(trace[0].events.length, 1);

    // Tick 1 milestone
    assert.strictEqual(trace[1].simulation_tick, 1);
    assert.strictEqual(trace[1].behavior.intent.action_type, 'SEEK_MATE');
    assert.strictEqual(trace[1].interactions[0].interaction_type, 'COURTSHIP');
    assert.strictEqual(trace[1].biological_outcome.energy, 85);
  });

  await t.test('TC-TEL-14: getResourceArbitrationTrace captures resource timeline', () => {
    const trace = getResourceArbitrationTrace(sampleRecords);
    assert.strictEqual(trace.length, 2);
    assert.strictEqual(trace[0].simulation_tick, 0);
    assert.strictEqual(trace[0].initial, 100);
    assert.strictEqual(trace[0].allocated, 20);
    assert.strictEqual(trace[0].remaining, 80);

    assert.strictEqual(trace[1].simulation_tick, 1);
    assert.strictEqual(trace[1].initial, 80);
    assert.strictEqual(trace[1].allocated, 10);
    assert.strictEqual(trace[1].remaining, 70);
  });

  await t.test('TC-TEL-16: getReproductionTrace tracks reproductive events', () => {
    const trace = getReproductionTrace(sampleRecords);
    assert.strictEqual(trace.length, 2);
    assert.strictEqual(trace[0].reproduction.offspring_born, 0);
    assert.strictEqual(trace[1].reproduction.offspring_born, 1);
    assert.deepStrictEqual(trace[1].reproduction.offspring_ids, ['org_child_1']);
  });

  await t.test('TC-TEL-17: Ecology trace via record environment snapshots', () => {
    const rec0 = getTickRecord(sampleRecords, 0);
    const rec1 = getTickRecord(sampleRecords, 1);
    assert.strictEqual(rec0.environment.before.temp, 25);
    assert.strictEqual(rec0.environment.after.temp, 25);
    assert.strictEqual(rec1.environment.before.temp, 25);
    assert.strictEqual(rec1.environment.after.temp, 26);
  });

  await t.test('getEventsTrace filters events accurately', () => {
    const mateEvents = getEventsTrace(sampleRecords, e => e.event_type === 'MATE');
    assert.strictEqual(mateEvents.length, 2);
    assert.strictEqual(mateEvents[0].organism_id, 'org_1');
    assert.strictEqual(mateEvents[1].organism_id, 'org_2');
  });
});
