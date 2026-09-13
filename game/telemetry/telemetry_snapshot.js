/**
 * LinhSinhVN — Telemetry Snapshot
 * 
 * Creates isolated, deeply frozen TelemetryTickRecord snapshots from
 * committed PopulationWorldTickResult instances.
 */

import { canonicalSerialize } from './canonical_serializer.js';
import { calculateTelemetryDigest } from './telemetry_digest.js';

/**
 * Deep freezes an object or array to prevent post-recording mutations.
 * 
 * @param {any} obj
 * @returns {any}
 */
export function deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Object.isFrozen(obj)) {
    return obj;
  }
  Object.freeze(obj);
  if (Array.isArray(obj)) {
    for (const item of obj) {
      deepFreeze(item);
    }
  } else {
    for (const key of Object.keys(obj)) {
      deepFreeze(obj[key]);
    }
  }
  return obj;
}

/**
 * Deep clones data using JSON serialization guarantees.
 * 
 * @param {any} val
 * @returns {any}
 */
export function deepClone(val) {
  if (val === undefined || val === null || typeof val !== 'object') {
    return val;
  }
  return JSON.parse(JSON.stringify(val));
}

/**
 * Constructs a fully isolated TelemetryTickRecord from committed world tick result.
 * 
 * @param {object} result - PopulationWorldTickResult from advancePopulationTick()
 * @param {object} [context={}] - Optional metadata (simulation_seed, population_id)
 * @returns {Readonly<object>} Immutable TelemetryTickRecord
 */
export function createTelemetryTickSnapshot(result, context = {}) {
  if (!result || typeof result !== 'object') {
    throw new TypeError('createTelemetryTickSnapshot requires a valid tick result object');
  }

  // Authoritative tick semantics (INVARIANT 03):
  // simulation_tick MUST be result.simulation_tick (the tick simulated)
  const simulationTick = result.simulation_tick;
  if (typeof simulationTick !== 'number' || !Number.isInteger(simulationTick) || simulationTick < 0) {
    throw new TypeError(`Invalid result.simulation_tick: ${simulationTick}`);
  }

  const nextSimulationTick = result.next_simulation_tick !== undefined
    ? result.next_simulation_tick
    : simulationTick + 1;

  // INVARIANT 04: Canonical event ordering from result.events MUST be preserved.
  // We deep clone without re-sorting.
  const rawEvents = Array.isArray(result.events) ? result.events : [];
  const clonedEvents = deepClone(rawEvents);

  // Preserve resource identity in interactions (INVARIANT 09)
  const clonedInteractions = deepClone(result.interactions || null);

  const rawRecord = {
    schema_version: '1.0.0',
    simulation_seed: String(context.simulation_seed || result.simulation_seed || 'deterministic_seed'),
    population_id: String(context.population_id || result.population_id || 'pop_default'),
    simulation_tick: simulationTick,
    next_simulation_tick: nextSimulationTick,
    delta_time: result.delta_time,
    environment: deepClone(result.environment || { before: {}, after: {} }),
    resources: deepClone(result.resources || { initial: 0, demanded: 0, allocated: 0, unmet: 0, remaining: 0 }),
    behavior: deepClone(result.behavior || []),
    interactions: clonedInteractions,
    biological_inputs: deepClone(result.biological_input_bundle || result.biological_inputs || null),
    biological_outcomes: deepClone(result.organism_results || result.biological_outcomes || null),
    reproduction: deepClone(result.reproduction || null),
    census: deepClone(result.census || {}),
    events: clonedEvents
  };

  // INVARIANT 08: Calculate digest before adding digest field
  const digest = calculateTelemetryDigest(rawRecord);
  rawRecord.digest = digest;

  // INVARIANT 01 & SNAPSHOT ISOLATION: Deep freeze the entire record
  return deepFreeze(rawRecord);
}
