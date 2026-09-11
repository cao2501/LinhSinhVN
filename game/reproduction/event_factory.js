/**
 * LinhSinhVN — Deterministic Reproduction Event Factory
 *
 * Generates immutable events conforming to data/lifecycle/schema/lifecycle_event.schema.json.
 * Uses canonical computeEventId: Hash64(simulation_seed | organism_id | simulation_tick | event_domain).
 */

import { computeEventId } from '../lifecycle/event_emitter.js';
import { REPRODUCTION_EVENTS, EVENT_DOMAINS } from './constants.js';

/**
 * Creates a deterministic REPRODUCTION_COMPLETED event for a parent organism.
 *
 * @param {object} params
 * @param {object} params.parent - Parent organism state
 * @param {string} params.mateId - Mate organism ID
 * @param {number} params.clutchSize - Number of offspring generated
 * @param {string} params.breedingSeed - 64-bit hex breeding seed
 * @param {number} params.simulationTick - Current simulation tick
 * @param {number} params.orderIndex - Monotonic deterministic order index
 * @returns {object} Immutable LifecycleEvent conforming to schema
 */
export function createReproductionCompletedEvent({
  parent,
  mateId,
  clutchSize,
  breedingSeed,
  simulationTick,
  orderIndex = 0
}) {
  const eventId = computeEventId(parent.simulation_seed, parent.organism_id, simulationTick, EVENT_DOMAINS.REPRODUCTION);

  return Object.freeze({
    schema_version: '1.0.0',
    event_id: eventId,
    organism_id: parent.organism_id,
    species_id: parent.species_id,
    simulation_tick: simulationTick,
    event_type: REPRODUCTION_EVENTS.REPRODUCTION_COMPLETED,
    stage_id: parent.current_stage_id,
    substage_id: parent.current_substage_id,
    deterministic_order_index: orderIndex,
    payload: Object.freeze({
      mate_id: mateId,
      clutch_size: clutchSize,
      breeding_seed: breedingSeed
    })
  });
}

/**
 * Creates a deterministic ORGANISM_BORN event for a newborn child organism.
 *
 * @param {object} params
 * @param {object} params.childState - Child initial organism state
 * @param {string} params.maternalId - Maternal parent ID
 * @param {string} params.paternalId - Paternal parent ID
 * @param {string} [params.birthHabitat='habitat_default'] - Birth habitat
 * @param {number} params.simulationTick - Current simulation tick
 * @param {number} params.orderIndex - Monotonic deterministic order index
 * @returns {object} Immutable LifecycleEvent conforming to schema
 */
export function createOrganismBornEvent({
  childState,
  maternalId,
  paternalId,
  birthHabitat = 'habitat_default',
  simulationTick,
  orderIndex = 0
}) {
  const eventId = computeEventId(childState.simulation_seed, childState.organism_id, simulationTick, EVENT_DOMAINS.LIFECYCLE);

  return Object.freeze({
    schema_version: '1.0.0',
    event_id: eventId,
    organism_id: childState.organism_id,
    species_id: childState.species_id,
    simulation_tick: simulationTick,
    event_type: REPRODUCTION_EVENTS.ORGANISM_BORN,
    stage_id: childState.current_stage_id,
    substage_id: childState.current_substage_id,
    deterministic_order_index: orderIndex,
    payload: Object.freeze({
      organism_id: childState.organism_id,
      generation: childState.generation,
      sex: childState.sex,
      maternal_id: maternalId,
      paternal_id: paternalId,
      birth_habitat: birthHabitat
    })
  });
}
