/**
 * LinhSinhVN — Canonical Event Ordering Foundation
 *
 * Implements deterministic, insertion-order invariant sorting for all events
 * emitted during a simulation tick across biological, lifecycle, and reproduction domains.
 *
 * Sorting contract:
 * 1. simulation_tick ASC
 * 2. organism_id ASC (UTF-16 lexicographical order)
 * 3. deterministic_order_index ASC
 * 4. event_id ASC (tie-breaker)
 */

export function compareCanonicalEvents(a, b) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;

  const tickA = typeof a.simulation_tick === 'number' ? a.simulation_tick : 0;
  const tickB = typeof b.simulation_tick === 'number' ? b.simulation_tick : 0;
  if (tickA !== tickB) {
    return tickA - tickB;
  }

  const idA = a.organism_id || '';
  const idB = b.organism_id || '';
  if (idA < idB) return -1;
  if (idA > idB) return 1;

  const orderA = typeof a.deterministic_order_index === 'number' ? a.deterministic_order_index : 0;
  const orderB = typeof b.deterministic_order_index === 'number' ? b.deterministic_order_index : 0;
  if (orderA !== orderB) {
    return orderA - orderB;
  }

  const evtA = a.event_id || '';
  const evtB = b.event_id || '';
  if (evtA < evtB) return -1;
  if (evtA > evtB) return 1;

  return 0;
}

/**
 * Pure function returning a new canonically sorted and frozen array of events.
 *
 * @param {Array<object>} events - Raw events list
 * @returns {ReadonlyArray<object>} Frozen canonical events array
 */
export function canonicalizeEvents(events) {
  if (!Array.isArray(events) || events.length === 0) {
    return Object.freeze([]);
  }
  const sorted = [...events].sort(compareCanonicalEvents);
  return Object.freeze(sorted);
}
