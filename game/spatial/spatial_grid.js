/**
 * LinhSinhVN — Spatial Grid Boundary & Flat Reversible Indexing
 *
 * TASK 08-B: Deterministic Spatial Foundation
 *
 * Maps 3D coordinate P = (x, y, z) <-> 1D Flat Grid Index.
 * Index = (z - z_min) * width * height + y * width + x.
 * Reversible, lossless, deterministic.
 */

import { validateInteger, validateCoordinate, freezeCoordinate } from './coordinates.js';

export class SpatialGridBoundary {
  /**
   * @param {object} params
   * @param {number} params.width
   * @param {number} params.height
   * @param {number} params.z_min
   * @param {number} params.z_max
   */
  constructor({ width, height, z_min, z_max }) {
    this.width = validateInteger(width, 'width');
    this.height = validateInteger(height, 'height');
    this.z_min = validateInteger(z_min, 'z_min');
    this.z_max = validateInteger(z_max, 'z_max');

    if (this.width <= 0) {
      throw new RangeError(`[SpatialGridBoundary] width must be > 0. Received: ${this.width}`);
    }
    if (this.height <= 0) {
      throw new RangeError(`[SpatialGridBoundary] height must be > 0. Received: ${this.height}`);
    }
    if (this.z_min > this.z_max) {
      throw new RangeError(`[SpatialGridBoundary] z_min (${this.z_min}) must be <= z_max (${this.z_max})`);
    }

    this.strataCount = (this.z_max - this.z_min) + 1;
    this.planeSize = this.width * this.height;
    this.totalCells = this.planeSize * this.strataCount;

    Object.freeze(this);
  }

  /**
   * Checks whether a coordinate lies within world boundaries.
   * @param {{ x: number, y: number, z: number }} pos
   * @returns {boolean}
   */
  contains(pos) {
    if (!pos || typeof pos !== 'object') return false;
    const { x, y, z } = pos;
    if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) return false;
    return (
      x >= 0 && x < this.width &&
      y >= 0 && y < this.height &&
      z >= this.z_min && z <= this.z_max
    );
  }

  /**
   * Asserts coordinate is strictly within world boundaries.
   * Explicitly rejects out-of-bounds without clamping, wrapping, or teleporting.
   * @param {{ x: number, y: number, z: number }} pos
   * @param {string} [context='coordinate']
   */
  assertWithinBounds(pos, context = 'coordinate') {
    const p = validateCoordinate(pos, context);
    if (!this.contains(p)) {
      throw new RangeError(
        `[SpatialGridBoundary] Out-of-bounds ${context}: (${p.x}, ${p.y}, ${p.z}). ` +
        `World boundary is x in [0, ${this.width - 1}], y in [0, ${this.height - 1}], z in [${this.z_min}, ${this.z_max}].`
      );
    }
    return p;
  }
}

/**
 * Converts 3D coordinate to 1D Flat Grid Index.
 * Index = (z - z_min) * (width * height) + y * width + x
 *
 * @param {{ x: number, y: number, z: number }} pos
 * @param {SpatialGridBoundary} bounds
 * @returns {number}
 */
export function coordinateToIndex(pos, bounds) {
  if (!(bounds instanceof SpatialGridBoundary)) {
    throw new TypeError('[SpatialGrid] bounds must be an instance of SpatialGridBoundary');
  }
  const p = bounds.assertWithinBounds(pos, 'pos');
  const zOffset = p.z - bounds.z_min;
  const index = zOffset * bounds.planeSize + p.y * bounds.width + p.x;
  return index;
}

/**
 * Reversibly converts 1D Flat Grid Index back to 3D coordinate.
 *
 * @param {number} index
 * @param {SpatialGridBoundary} bounds
 * @returns {Readonly<{ x: number, y: number, z: number }>}
 */
export function indexToCoordinate(index, bounds) {
  if (!(bounds instanceof SpatialGridBoundary)) {
    throw new TypeError('[SpatialGrid] bounds must be an instance of SpatialGridBoundary');
  }
  validateInteger(index, 'index');
  if (index < 0 || index >= bounds.totalCells) {
    throw new RangeError(`[SpatialGrid] Flat index out of range: ${index}. Valid range: [0, ${bounds.totalCells - 1}]`);
  }

  const zOffset = Math.floor(index / bounds.planeSize);
  const remainder = index % bounds.planeSize;
  const y = Math.floor(remainder / bounds.width);
  const x = remainder % bounds.width;
  const z = bounds.z_min + zOffset;

  return freezeCoordinate({ x, y, z });
}

/**
 * Returns canonical planar neighbor coordinates (Chebyshev distance 1, strictly at same z level).
 *
 * Planar neighborhood:
 * - 8 surrounding cells (or 9 if includeOrigin is true).
 * - Origin cell inclusion must be explicit via includeOrigin option.
 * - Out-of-bounds cells are safely excluded.
 * - Does NOT include vertical strata (vertical transitions are separate).
 * - Canonical ordering: y ASC, then x ASC.
 *
 * @param {{ x: number, y: number, z: number }} pos
 * @param {SpatialGridBoundary} bounds
 * @param {object} [options]
 * @param {boolean} [options.includeOrigin=false]
 * @returns {ReadonlyArray<Readonly<{ x: number, y: number, z: number }>>}
 */
export function getPlanarNeighborCoordinates(pos, bounds, { includeOrigin = false } = {}) {
  const p = bounds.assertWithinBounds(pos, 'pos');
  const neighbors = [];

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0 && !includeOrigin) {
        continue;
      }
      const nx = p.x + dx;
      const ny = p.y + dy;
      const candidate = { x: nx, y: ny, z: p.z };
      if (bounds.contains(candidate)) {
        neighbors.push(freezeCoordinate(candidate));
      }
    }
  }

  return Object.freeze(neighbors);
}

/**
 * Returns declarative vertical layer transition topology data for a given cell.
 * Note: Strictly declarative! Does NOT evaluate locomotion or capability.
 *
 * @param {{ x: number, y: number, z: number }} pos
 * @param {SpatialGridBoundary} bounds
 * @returns {ReadonlyArray<object>}
 */
export function getVerticalTransitions(pos, bounds) {
  const p = bounds.assertWithinBounds(pos, 'pos');
  const transitions = [];

  // Upward transition
  if (p.z + 1 <= bounds.z_max) {
    transitions.push(Object.freeze({
      direction: 'UP',
      from: freezeCoordinate(p),
      to: freezeCoordinate({ x: p.x, y: p.y, z: p.z + 1 }),
      transition_type: p.z === -1 ? 'SUBTERRANEAN_TO_SURFACE' :
                       p.z === 0 ? 'SURFACE_TO_ARBOREAL' :
                       p.z === 1 ? 'ARBOREAL_TO_AERIAL' : 'VERTICAL_ASCENT',
      topology_available: true
    }));
  }

  // Downward transition
  if (p.z - 1 >= bounds.z_min) {
    transitions.push(Object.freeze({
      direction: 'DOWN',
      from: freezeCoordinate(p),
      to: freezeCoordinate({ x: p.x, y: p.y, z: p.z - 1 }),
      transition_type: p.z === 2 ? 'AERIAL_TO_ARBOREAL' :
                       p.z === 1 ? 'ARBOREAL_TO_SURFACE' :
                       p.z === 0 ? 'SURFACE_TO_SUBTERRANEAN' : 'VERTICAL_DESCENT',
      topology_available: true
    }));
  }

  return Object.freeze(transitions);
}
