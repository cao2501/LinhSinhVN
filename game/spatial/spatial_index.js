/**
 * LinhSinhVN — Derived Spatial Index (Acceleration Structure)
 *
 * TASK 08-B: Deterministic Spatial Foundation
 *
 * IMPORTANT ARCHITECTURAL INVARIANT:
 * SpatialIndex is DERIVED DATA.
 * SpatialIndex is NOT authoritative.
 * SpatialIndex can be completely discarded and reconstructed at any time
 * from SpatialEntityRegistry without loss of information.
 *
 * Entity lists per cell are always returned in canonical order: entity_id ASC.
 * Insertion order cannot alter query results.
 * Internal mutable arrays are never exposed (returns frozen defensive copies).
 */

import { validateInteger } from './coordinates.js';
import { SpatialGridBoundary } from './spatial_grid.js';

export class SpatialIndex {
  /**
   * @param {SpatialGridBoundary} bounds
   */
  constructor(bounds) {
    if (!(bounds instanceof SpatialGridBoundary)) {
      throw new TypeError('[SpatialIndex] bounds must be an instance of SpatialGridBoundary');
    }
    this.bounds = bounds;
    /** @type {Map<number, Set<string>>} */
    this._cellToEntities = new Map();
  }

  /**
   * Adds an entity to a cell index.
   * @param {number} cellIndex
   * @param {string} entityId
   */
  addEntity(cellIndex, entityId) {
    validateInteger(cellIndex, 'cellIndex');
    if (typeof entityId !== 'string' || !entityId) {
      throw new TypeError('[SpatialIndex] entityId must be a non-empty string');
    }
    let set = this._cellToEntities.get(cellIndex);
    if (!set) {
      set = new Set();
      this._cellToEntities.set(cellIndex, set);
    }
    set.add(entityId);
  }

  /**
   * Removes an entity from a cell index.
   * @param {number} cellIndex
   * @param {string} entityId
   * @returns {boolean} true if removed
   */
  removeEntity(cellIndex, entityId) {
    validateInteger(cellIndex, 'cellIndex');
    const set = this._cellToEntities.get(cellIndex);
    if (!set) return false;
    const deleted = set.delete(entityId);
    if (set.size === 0) {
      this._cellToEntities.delete(cellIndex);
    }
    return deleted;
  }

  /**
   * Atomically moves an entity from one cell to another.
   * @param {number} oldCellIndex
   * @param {number} newCellIndex
   * @param {string} entityId
   */
  moveEntity(oldCellIndex, newCellIndex, entityId) {
    this.removeEntity(oldCellIndex, entityId);
    this.addEntity(newCellIndex, entityId);
  }

  /**
   * Returns canonical sorted list of entity IDs at a cell index.
   * Canonical ordering: entity_id ASC.
   * Returns defensive frozen array.
   *
   * @param {number} cellIndex
   * @returns {ReadonlyArray<string>}
   */
  getEntitiesAtCellIndex(cellIndex) {
    validateInteger(cellIndex, 'cellIndex');
    const set = this._cellToEntities.get(cellIndex);
    if (!set || set.size === 0) {
      return Object.freeze([]);
    }
    const sorted = Array.from(set).sort();
    return Object.freeze(sorted);
  }

  /**
   * Clears and completely rebuilds derived index from authoritative entity records.
   * @param {Iterable<{ entity_id: string, cellIndex: number }>} entries
   */
  rebuild(entries) {
    this._cellToEntities.clear();
    for (const { entity_id, cellIndex } of entries) {
      this.addEntity(cellIndex, entity_id);
    }
  }

  /**
   * Total number of occupied cells in the index.
   * @returns {number}
   */
  get occupiedCellCount() {
    return this._cellToEntities.size;
  }
}
