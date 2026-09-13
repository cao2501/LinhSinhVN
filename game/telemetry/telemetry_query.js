/**
 * LinhSinhVN — Telemetry Query
 * 
 * Pure functions operating on Array<TelemetryTickRecord> or iterable records collections.
 * Decoupled from concrete TelemetryRecorder class.
 */

/**
 * Retrieves a single tick record matching the given simulation tick.
 * 
 * @param {Array<object>} records
 * @param {number} tick
 * @returns {object|null}
 */
export function getTickRecord(records, tick) {
  if (!Array.isArray(records)) return null;
  for (const rec of records) {
    if (rec && rec.simulation_tick === tick) {
      return rec;
    }
  }
  return null;
}

/**
 * Traces all actions, inputs, outcomes, and events for a specific organism across recorded ticks.
 * 
 * @param {Array<object>} records
 * @param {string} organismId
 * @returns {Array<object>} Chronological list of organism milestone records
 */
export function getOrganismTrace(records, organismId) {
  if (!Array.isArray(records) || !organismId) return [];
  const trace = [];

  for (const rec of records) {
    if (!rec) continue;
    const tick = rec.simulation_tick;

    // Behavior decision
    let behaviorDecision = null;
    if (Array.isArray(rec.behavior)) {
      behaviorDecision = rec.behavior.find(b => b.organism_id === organismId) || null;
    } else if (rec.behavior && typeof rec.behavior === 'object') {
      behaviorDecision = rec.behavior[organismId] || null;
    }

    // Interactions
    let organismInteractions = [];
    if (rec.interactions && Array.isArray(rec.interactions.interactions)) {
      organismInteractions = rec.interactions.interactions.filter(
        i => i.organism_id === organismId || i.target_id === organismId
      );
    }

    // Biological input
    let biologicalInput = null;
    if (rec.biological_inputs && Array.isArray(rec.biological_inputs.organism_bundles)) {
      biologicalInput = rec.biological_inputs.organism_bundles.find(b => b.organism_id === organismId) || null;
    }

    // Biological outcome
    let biologicalOutcome = null;
    if (Array.isArray(rec.biological_outcomes)) {
      biologicalOutcome = rec.biological_outcomes.find(o => o.organism_id === organismId) || null;
    }

    // Events
    let events = [];
    if (Array.isArray(rec.events)) {
      events = rec.events.filter(e => e.organism_id === organismId);
    }

    if (behaviorDecision || organismInteractions.length > 0 || biologicalInput || biologicalOutcome || events.length > 0) {
      trace.push({
        simulation_tick: tick,
        organism_id: organismId,
        behavior: behaviorDecision,
        interactions: organismInteractions,
        biological_input: biologicalInput,
        biological_outcome: biologicalOutcome,
        events
      });
    }
  }

  return trace;
}

/**
 * Traces resource pool demand, allocation, unmet demand, and pool remaining across ticks.
 * 
 * @param {Array<object>} records
 * @param {string} [resourceType=null]
 * @returns {Array<object>}
 */
export function getResourceArbitrationTrace(records, resourceType = null) {
  if (!Array.isArray(records)) return [];
  return records.map(rec => {
    return {
      simulation_tick: rec.simulation_tick,
      resource_type: resourceType || 'ALL',
      initial: rec.resources?.initial ?? 0,
      demanded: rec.resources?.demanded ?? 0,
      allocated: rec.resources?.allocated ?? 0,
      unmet: rec.resources?.unmet ?? 0,
      remaining: rec.resources?.remaining ?? 0
    };
  });
}

/**
 * Traces reproduction evaluations, mated pairs, and newborn offspring across ticks.
 * 
 * @param {Array<object>} records
 * @returns {Array<object>}
 */
export function getReproductionTrace(records) {
  if (!Array.isArray(records)) return [];
  const trace = [];

  for (const rec of records) {
    if (!rec) continue;
    trace.push({
      simulation_tick: rec.simulation_tick,
      reproduction: rec.reproduction || null
    });
  }

  return trace;
}

/**
 * Filters events across recorded ticks with an optional filter predicate.
 * 
 * @param {Array<object>} records
 * @param {Function} [filterFn=null]
 * @returns {Array<object>}
 */
export function getEventsTrace(records, filterFn = null) {
  if (!Array.isArray(records)) return [];
  const allEvents = [];
  for (const rec of records) {
    if (!rec || !Array.isArray(rec.events)) continue;
    for (const evt of rec.events) {
      if (!filterFn || filterFn(evt, rec.simulation_tick)) {
        allEvents.push(evt);
      }
    }
  }
  return allEvents;
}
