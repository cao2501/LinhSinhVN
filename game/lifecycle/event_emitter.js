/**
 * LinhSinhVN — Deterministic Lifecycle Event Emitter
 * 
 * Implements the deterministic event generation and hashing contract from docs/LIFECYCLE_SPEC.md.
 * 
 * Canonical Event ID Hash:
 * Hash64(simulation_seed | organism_id | simulation_tick | event_domain)
 * 
 * Deterministic order within a tick is tracked via deterministic_order_index.
 */

import { createHash } from 'node:crypto';

/**
 * Derives a 64-bit hexadecimal Event ID string from the canonical simulation parameters.
 * 
 * @param {string} simulationSeed - Hex seed, e.g. "0x024aa8a38b63e1b2"
 * @param {string} organismId - Unique organism ID
 * @param {number} simulationTick - Discrete simulation tick counter
 * @param {string} eventDomain - Logical domain or event type, e.g. "LIFECYCLE", "MOLT", "DEATH"
 * @returns {string} Formatted 64-bit hex string, e.g. "0x3f7a8b1c90e241d6"
 */
export function computeEventId(simulationSeed, organismId, simulationTick, eventDomain) {
  const canonicalPayload = `${String(simulationSeed)}|${String(organismId)}|${String(simulationTick)}|${String(eventDomain)}`;
  const hashBuffer = createHash('sha256').update(canonicalPayload, 'utf8').digest();
  const seedBigInt = hashBuffer.readBigUInt64BE(0);
  return '0x' + seedBigInt.toString(16).padStart(16, '0');
}

/**
 * Event emitter for an organism during lifecycle simulation ticks.
 */
export class LifecycleEventEmitter {
  /**
   * @param {string} simulationSeed 
   * @param {string} organismId 
   * @param {string} speciesId 
   */
  constructor(simulationSeed, organismId, speciesId) {
    this.simulationSeed = simulationSeed;
    this.organismId = organismId;
    this.speciesId = speciesId;
    this.events = [];
    this.orderIndex = 0;
  }

  /**
   * Resets the per-tick order index counter for a new simulation tick.
   */
  beginTick() {
    this.orderIndex = 0;
    this.events = [];
  }

  /**
   * Emits a deterministic lifecycle event adhering to data/lifecycle/schema/lifecycle_event.schema.json.
   * 
   * @param {string} eventType - Event enum, e.g. "STAGE_ENTERED", "MOLT_COMPLETED", "DEATH"
   * @param {number} simulationTick - Current simulation tick
   * @param {string} stageId - Current stage ID
   * @param {string|null} substageId - Current substage ID or null
   * @param {object} payload - Key-value details
   * @param {string} [eventDomain="LIFECYCLE"] - Domain for hash derivation
   * @returns {object} Emitted event object
   */
  emit(eventType, simulationTick, stageId, substageId = null, payload = {}, eventDomain = 'LIFECYCLE') {
    const eventId = computeEventId(this.simulationSeed, this.organismId, simulationTick, eventDomain);

    const event = Object.freeze({
      schema_version: '1.0.0',
      event_id: eventId,
      organism_id: this.organismId,
      species_id: this.speciesId,
      simulation_tick: simulationTick,
      event_type: eventType,
      stage_id: stageId,
      substage_id: substageId,
      deterministic_order_index: this.orderIndex++,
      payload: Object.freeze({ ...payload })
    });

    this.events.push(event);
    return event;
  }

  /**
   * Returns an array of events emitted during the current tick.
   * @returns {Array<object>}
   */
  getEvents() {
    return [...this.events];
  }
}
