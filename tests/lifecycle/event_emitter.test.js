/**
 * LinhSinhVN — Tests for Deterministic Lifecycle Event Emitter
 * 
 * Verifies:
 * 1. Deterministic Event ID derivation: Hash64(seed | organism_id | tick | domain)
 * 2. Order index increments deterministically within a tick
 * 3. Event immutability
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { LifecycleEventEmitter, computeEventId } from '../../game/lifecycle/event_emitter.js';

describe('Lifecycle Event Emitter & Hash64 Contract', () => {
  const seed = '0x024aa8a38b63e1b2';
  const orgId = 'org_beetle_001';
  const speciesId = 'xylotrupes_rhinoceros_proto';

  test('derives identical 64-bit event IDs for identical input parameters', () => {
    const id1 = computeEventId(seed, orgId, 10, 'LIFECYCLE');
    const id2 = computeEventId(seed, orgId, 10, 'LIFECYCLE');

    assert.equal(typeof id1, 'string');
    assert.match(id1, /^0x[0-9a-f]{16}$/);
    assert.equal(id1, id2, 'Event IDs must be bit-for-bit identical for identical inputs');
  });

  test('produces distinct event IDs when simulation tick or domain varies', () => {
    const idTick10 = computeEventId(seed, orgId, 10, 'LIFECYCLE');
    const idTick11 = computeEventId(seed, orgId, 11, 'LIFECYCLE');
    const idDomainMolt = computeEventId(seed, orgId, 10, 'MOLT');

    assert.notEqual(idTick10, idTick11, 'Different ticks must yield different event IDs');
    assert.notEqual(idTick10, idDomainMolt, 'Different domains must yield different event IDs');
  });

  test('tracks monotonic deterministic_order_index within each tick and resets on beginTick', () => {
    const emitter = new LifecycleEventEmitter(seed, orgId, speciesId);
    emitter.beginTick();

    const ev1 = emitter.emit('FEEDING', 1, 'STAGE_LARVA', 'L1', { amount: 5.0 });
    const ev2 = emitter.emit('GROWTH_UPDATED', 1, 'STAGE_LARVA', 'L1', { added: 1.0 });

    assert.equal(ev1.deterministic_order_index, 0);
    assert.equal(ev2.deterministic_order_index, 1);
    assert.equal(emitter.getEvents().length, 2);

    // Next tick
    emitter.beginTick();
    const ev3 = emitter.emit('FEEDING', 2, 'STAGE_LARVA', 'L1', { amount: 5.0 });
    assert.equal(ev3.deterministic_order_index, 0, 'Order index must reset at beginTick');
    assert.equal(emitter.getEvents().length, 1);
  });

  test('emits immutable event objects', () => {
    const emitter = new LifecycleEventEmitter(seed, orgId, speciesId);
    emitter.beginTick();
    const ev = emitter.emit('STAGE_ENTERED', 0, 'STAGE_EGG');

    assert.ok(Object.isFrozen(ev));
    assert.ok(Object.isFrozen(ev.payload));
    assert.throws(() => {
      // @ts-ignore
      ev.stage_id = 'STAGE_ADULT';
    }, TypeError);
  });
});
