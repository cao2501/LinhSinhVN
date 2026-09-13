/**
 * @file habitat_region.js
 * @description Deterministic spatial region geometry for habitats and environmental zones.
 * Strictly integer discrete coordinates; zero float arithmetic or geometry engines.
 */

import { validateCoordinate } from '../coordinates.js';

export const RegionType = Object.freeze({
  RECTANGLE: 'RECTANGLE',
  CELL_SET: 'CELL_SET'
});

export class HabitatRegion {
  /**
   * @param {Object} config
   * @param {string} config.type - 'RECTANGLE' | 'CELL_SET'
   * @param {Object} [config.bounds] - { min_x, max_x, min_y, max_y, min_z, max_z }
   * @param {Array<{x: number, y: number, z: number}>} [config.cells]
   */
  constructor(config = {}) {
    if (!config || typeof config !== 'object') {
      throw new TypeError('HabitatRegion config must be an object');
    }

    if (config.type !== RegionType.RECTANGLE && config.type !== RegionType.CELL_SET) {
      throw new TypeError(`Invalid region type: ${config.type}. Expected RECTANGLE or CELL_SET`);
    }

    this.type = config.type;

    if (this.type === RegionType.RECTANGLE) {
      if (!config.bounds || typeof config.bounds !== 'object') {
        throw new TypeError('RECTANGLE region requires bounds object');
      }
      const { min_x, max_x, min_y, max_y, min_z, max_z } = config.bounds;
      const coords = [min_x, max_x, min_y, max_y, min_z, max_z];
      for (const val of coords) {
        if (typeof val !== 'number' || !Number.isInteger(val)) {
          throw new TypeError(`RECTANGLE bounds must contain discrete integers, received: ${val}`);
        }
      }
      if (min_x > max_x || min_y > max_y || min_z > max_z) {
        throw new RangeError(`Invalid RECTANGLE bounds: min cannot exceed max`);
      }
      this.bounds = Object.freeze({ min_x, max_x, min_y, max_y, min_z, max_z });
      this.cells = null;
    } else {
      // CELL_SET
      if (!Array.isArray(config.cells)) {
        throw new TypeError('CELL_SET region requires cells array');
      }
      const canonicalCells = [];
      const seenKeys = new Set();

      for (const cell of config.cells) {
        validateCoordinate(cell);
        const key = `${cell.x},${cell.y},${cell.z}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          canonicalCells.push(Object.freeze({ x: cell.x, y: cell.y, z: cell.z }));
        }
      }

      // Canonical sort: z ASC -> y ASC -> x ASC
      canonicalCells.sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x);

      this.cells = Object.freeze(canonicalCells);
      this._cellSet = seenKeys;
      this.bounds = null;
    }

    Object.freeze(this);
  }

  /**
   * Pure deterministic containment check.
   * @param {{x: number, y: number, z: number}} coordinate
   * @returns {boolean}
   */
  contains(coordinate) {
    validateCoordinate(coordinate);

    if (this.type === RegionType.RECTANGLE) {
      const b = this.bounds;
      return (
        coordinate.x >= b.min_x &&
        coordinate.x <= b.max_x &&
        coordinate.y >= b.min_y &&
        coordinate.y <= b.max_y &&
        coordinate.z >= b.min_z &&
        coordinate.z <= b.max_z
      );
    }

    if (this.type === RegionType.CELL_SET) {
      const key = `${coordinate.x},${coordinate.y},${coordinate.z}`;
      return this._cellSet.has(key);
    }

    return false;
  }

  /**
   * Canonical serialization.
   * @returns {Object}
   */
  toJSON() {
    if (this.type === RegionType.RECTANGLE) {
      return {
        type: this.type,
        bounds: { ...this.bounds }
      };
    }
    return {
      type: this.type,
      cells: this.cells.map(c => ({ x: c.x, y: c.y, z: c.z }))
    };
  }
}
