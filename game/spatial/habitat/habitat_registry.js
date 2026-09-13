/**
 * @file habitat_registry.js
 * @description Authoritative registry of HabitatDefinitions. Zero population or position ownership.
 */

import { HabitatDefinition, DEFAULT_OPEN_TERRAIN_ID } from './habitat_definition.js';

export class HabitatRegistry {
  /**
   * @param {Object} [options]
   * @param {Object} [options.boundary] - Optional SpatialGridBoundary to initialize canonical default open terrain
   * @param {boolean} [options.registerDefault=true] - Whether to automatically register DEFAULT_OPEN_TERRAIN
   */
  constructor(options = {}) {
    this._habitats = new Map();

    const registerDefault = options.registerDefault !== false;
    if (registerDefault) {
      const defaultTerrain = HabitatDefinition.createDefaultOpenTerrain(options.boundary);
      this._habitats.set(defaultTerrain.habitat_id, defaultTerrain);
    }
  }

  /**
   * Register a new habitat definition. Rejects duplicate IDs.
   * @param {HabitatDefinition|Object} definition
   */
  registerHabitat(definition) {
    const habitat = definition instanceof HabitatDefinition ? definition : new HabitatDefinition(definition);

    if (this._habitats.has(habitat.habitat_id)) {
      throw new Error(`Duplicate habitat registration rejected: habitat_id "${habitat.habitat_id}" already exists.`);
    }

    this._habitats.set(habitat.habitat_id, habitat);
  }

  /**
   * Lookup a habitat by ID.
   * @param {string} habitatId
   * @returns {HabitatDefinition|null}
   */
  getHabitat(habitatId) {
    return this._habitats.get(habitatId) || null;
  }

  /**
   * Check if habitat ID is registered.
   * @param {string} habitatId
   * @returns {boolean}
   */
  hasHabitat(habitatId) {
    return this._habitats.has(habitatId);
  }

  /**
   * Returns deterministic array of all registered habitats, sorted by priority DESC, then habitat_id ASC.
   * @returns {HabitatDefinition[]}
   */
  listHabitats() {
    return Array.from(this._habitats.values()).sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      return a.habitat_id.localeCompare(b.habitat_id);
    });
  }

  /**
   * Total registered habitats count.
   * @returns {number}
   */
  get size() {
    return this._habitats.size;
  }

  /**
   * Clear all non-default habitats or everything if specified.
   * @param {boolean} [keepDefault=true]
   * @param {Object} [boundary=null]
   */
  reset(keepDefault = true, boundary = null) {
    this._habitats.clear();
    if (keepDefault) {
      const defaultTerrain = HabitatDefinition.createDefaultOpenTerrain(boundary);
      this._habitats.set(defaultTerrain.habitat_id, defaultTerrain);
    }
  }

  /**
   * Canonical deterministic snapshot.
   * @returns {Object[]}
   */
  serialize() {
    return this.listHabitats().map(h => h.toJSON());
  }

  /**
   * Restore registry from snapshot.
   * @param {Object[]} snapshot
   */
  deserialize(snapshot) {
    if (!Array.isArray(snapshot)) {
      throw new TypeError('HabitatRegistry deserialize requires array of habitat definitions');
    }
    this._habitats.clear();
    for (const item of snapshot) {
      this.registerHabitat(new HabitatDefinition(item));
    }
  }
}
