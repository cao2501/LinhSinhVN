/**
 * LinhSinhVN — Authoritative Shelter Registry
 *
 * TASK 08-D3: Deterministic Shelter Runtime
 *
 * Authoritative store for shelter definitions and canonical occupancy state.
 * Manages atomic ENTER/EXIT transactions and derived sheltered_in lookup.
 *
 * Architecture Invariants:
 * - Single source of truth for occupancy: occupant_ids[] on ShelterOccupancy
 * - derived sheltered_in is purely a synchronized reverse mapping
 * - Zero biological or resource pool concepts
 * - Zero coordinate mutation / teleportation
 */

import { ShelterDefinition } from './shelter_definition.js';
import { ShelterOccupancy } from './shelter_occupancy.js';
import { executeEnterShelter, executeExitShelter } from './shelter_transaction.js';

export class ShelterRegistry {
  /**
   * @param {object} [options]
   * @param {import('../spatial_grid.js').SpatialGridBoundary} [options.boundary]
   */
  constructor({ boundary } = {}) {
    this.boundary = boundary || null;
    /** @type {Map<string, ShelterDefinition>} */
    this._shelters = new Map();
    /** @type {Map<string, ShelterOccupancy>} */
    this._occupancies = new Map();
    /** @type {Map<string, string>} derived reverse lookup: organismId -> shelterId */
    this._derivedShelteredIn = new Map();
  }

  /**
   * Registers a shelter definition.
   * @param {ShelterDefinition|object} definition
   * @returns {ShelterDefinition}
   */
  registerShelter(definition) {
    const shelter = definition instanceof ShelterDefinition ? definition : new ShelterDefinition(definition);

    if (this._shelters.has(shelter.shelter_id)) {
      throw new Error(`[ShelterRegistry] Duplicate shelter_id rejected: '${shelter.shelter_id}'`);
    }

    if (this.boundary) {
      this.boundary.assertWithinBounds(shelter.position, `shelter '${shelter.shelter_id}'`);
    }

    this._shelters.set(shelter.shelter_id, shelter);
    this._occupancies.set(shelter.shelter_id, new ShelterOccupancy({
      shelter_id: shelter.shelter_id,
      capacity: shelter.capacity
    }));

    return shelter;
  }

  /**
   * Deregisters a shelter. Rejects if shelter currently has occupants.
   * @param {string} shelterId
   * @returns {ShelterDefinition}
   */
  deregisterShelter(shelterId) {
    const shelter = this._shelters.get(shelterId);
    if (!shelter) {
      throw new Error(`[ShelterRegistry] Shelter '${shelterId}' not found`);
    }

    const occupancy = this._occupancies.get(shelterId);
    if (occupancy && occupancy.current_occupancy > 0) {
      throw new Error(`[ShelterRegistry] Cannot deregister shelter '${shelterId}': still has ${occupancy.current_occupancy} occupants`);
    }

    this._shelters.delete(shelterId);
    this._occupancies.delete(shelterId);
    return shelter;
  }

  /**
   * Retrieves a shelter definition.
   * @param {string} shelterId
   * @returns {ShelterDefinition|null}
   */
  getShelter(shelterId) {
    return this._shelters.get(shelterId) || null;
  }

  /**
   * Retrieves canonical occupancy.
   * @param {string} shelterId
   * @returns {ShelterOccupancy|null}
   */
  getOccupancy(shelterId) {
    return this._occupancies.get(shelterId) || null;
  }

  /**
   * Checks if an organism is sheltered anywhere.
   * @param {string} organismId
   * @returns {string|null} shelter_id or null
   */
  getShelteredIn(organismId) {
    return this._derivedShelteredIn.get(organismId) || null;
  }

  /**
   * Returns sorted list of occupant IDs for a shelter.
   * @param {string} shelterId
   * @returns {ReadonlyArray<string>}
   */
  getOccupants(shelterId) {
    const occ = this._occupancies.get(shelterId);
    return occ ? occ.occupant_ids : Object.freeze([]);
  }

  /**
   * Returns all registered shelters sorted by shelter_id ASC.
   * @returns {ReadonlyArray<ShelterDefinition>}
   */
  getAllShelters() {
    const sorted = Array.from(this._shelters.values()).sort((a, b) => a.shelter_id.localeCompare(b.shelter_id));
    return Object.freeze(sorted);
  }

  /**
   * Generates shelter context for Micro-climate consumption (08-D2).
   * @param {string} shelterId
   * @returns {Readonly<object>|null}
   */
  getShelterContext(shelterId) {
    const shelter = this._shelters.get(shelterId);
    if (!shelter) return null;

    return Object.freeze({
      is_sheltered: true,
      shelter_id: shelter.shelter_id,
      security_factor: shelter.security_factor,
      temperature_delta: shelter.micro_climate_offsets?.temperature_delta ?? 0,
      humidity_delta: shelter.micro_climate_offsets?.humidity_delta ?? 0
    });
  }

  /**
   * High-level ENTER_SHELTER transaction runner.
   */
  enterShelter(params) {
    return executeEnterShelter({
      ...params,
      shelterRegistry: this
    });
  }

  /**
   * High-level EXIT_SHELTER transaction runner.
   */
  exitShelter(params) {
    return executeExitShelter({
      ...params,
      shelterRegistry: this
    });
  }

  /**
   * Internal commit for ENTER transaction.
   * @internal
   */
  _commitEnter(shelterId, organismId) {
    const occ = this._occupancies.get(shelterId);
    occ.addOccupant(organismId);
    this._derivedShelteredIn.set(organismId, shelterId);
  }

  /**
   * Internal commit for EXIT transaction.
   * @internal
   */
  _commitExit(shelterId, organismId) {
    const occ = this._occupancies.get(shelterId);
    occ.removeOccupant(organismId);
    this._derivedShelteredIn.delete(organismId);
  }

  /**
   * Serializes all shelters and occupancies canonically.
   * Deterministic ordering: shelter_id ASC.
   * @returns {object}
   */
  serialize() {
    const shelters = Array.from(this._shelters.values())
      .sort((a, b) => a.shelter_id.localeCompare(b.shelter_id))
      .map(s => ({
        shelter_id: s.shelter_id,
        shelter_type: s.shelter_type,
        position: { x: s.position.x, y: s.position.y, z: s.position.z },
        capacity: s.capacity,
        security_factor: s.security_factor,
        entry_locomotion_requirement: s.entry_locomotion_requirement,
        micro_climate_offsets: s.micro_climate_offsets,
        metadata: s.metadata
      }));

    const occupancies = Array.from(this._occupancies.values())
      .sort((a, b) => a.shelter_id.localeCompare(b.shelter_id))
      .map(o => o.snapshot());

    return Object.freeze({
      shelters: Object.freeze(shelters),
      occupancies: Object.freeze(occupancies)
    });
  }

  /**
   * Deserializes and reconstructs canonical state + derived lookups.
   * Enforces fail-fast validation against inconsistencies.
   * @param {object} snapshot
   * @param {object} [options]
   * @returns {ShelterRegistry}
   */
  static deserialize(snapshot, options = {}) {
    if (!snapshot || typeof snapshot !== 'object') {
      throw new TypeError('[ShelterRegistry.deserialize] snapshot must be an object');
    }
    if (!Array.isArray(snapshot.shelters)) {
      throw new TypeError('[ShelterRegistry.deserialize] snapshot.shelters must be an array');
    }
    if (!Array.isArray(snapshot.occupancies)) {
      throw new TypeError('[ShelterRegistry.deserialize] snapshot.occupancies must be an array');
    }

    const registry = new ShelterRegistry(options);

    // 1. Register shelters
    for (const s of snapshot.shelters) {
      registry.registerShelter(s);
    }

    // 2. Load occupancies & reconstruct derived sheltered_in
    const globalOccupants = new Set();

    for (const occData of snapshot.occupancies) {
      if (!occData || typeof occData !== 'object') {
        throw new TypeError('[ShelterRegistry.deserialize] invalid occupancy entry');
      }
      const shelter = registry.getShelter(occData.shelter_id);
      if (!shelter) {
        throw new Error(`[ShelterRegistry.deserialize] Occupancy references unknown shelter '${occData.shelter_id}'`);
      }
      if (occData.capacity !== shelter.capacity) {
        throw new Error(`[ShelterRegistry.deserialize] Occupancy capacity (${occData.capacity}) does not match definition capacity (${shelter.capacity})`);
      }

      const occupantList = Array.isArray(occData.occupant_ids) ? occData.occupant_ids : [];
      if (occupantList.length > shelter.capacity) {
        throw new Error(`[ShelterRegistry.deserialize] Occupant count ${occupantList.length} exceeds capacity ${shelter.capacity}`);
      }

      // Check current_occupancy match
      if (typeof occData.current_occupancy === 'number' && occData.current_occupancy !== occupantList.length) {
        throw new Error(`[ShelterRegistry.deserialize] current_occupancy ${occData.current_occupancy} !== occupant_ids.length ${occupantList.length}`);
      }

      // Populate occupancy
      const occ = registry.getOccupancy(occData.shelter_id);
      for (const orgId of occupantList) {
        if (globalOccupants.has(orgId)) {
          throw new Error(`[ShelterRegistry.deserialize] Inconsistent snapshot: organism '${orgId}' occupies multiple shelters`);
        }
        globalOccupants.add(orgId);
        occ.addOccupant(orgId);
        registry._derivedShelteredIn.set(orgId, occData.shelter_id);
      }
    }

    return registry;
  }
}
