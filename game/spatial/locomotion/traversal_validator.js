/**
 * LinhSinhVN — Pure Traversal Validator
 *
 * TASK 08-C: Locomotion & Movement Traversal Cost
 *
 * Pure read-only validation of single-step traversal requests.
 * Evaluates: TOPOLOGY x ORGANISM CAPABILITY.
 * Zero mutations to SpatialWorld, ResourcePool, or Lifecycle state.
 *
 * Deterministic Reason Codes:
 * 1. INVALID_COORDINATE
 * 2. OUT_OF_BOUNDS
 * 3. DEAD_ORGANISM
 * 4. SAME_POSITION
 * 5. CAPABILITY_REQUIRED
 * 6. UNSUPPORTED_TRANSITION
 * 7. TOPOLOGY_BLOCKED
 * 8. NONE
 */

import { validateCoordinate } from '../coordinates.js';
import { getVerticalTransitions } from '../spatial_grid.js';
import { calculateMovementCost } from './movement_cost.js';

export const REASON_CODES = Object.freeze({
  NONE: 'NONE',
  INVALID_COORDINATE: 'INVALID_COORDINATE',
  OUT_OF_BOUNDS: 'OUT_OF_BOUNDS',
  DEAD_ORGANISM: 'DEAD_ORGANISM',
  SAME_POSITION: 'SAME_POSITION',
  CAPABILITY_REQUIRED: 'CAPABILITY_REQUIRED',
  UNSUPPORTED_TRANSITION: 'UNSUPPORTED_TRANSITION',
  TOPOLOGY_BLOCKED: 'TOPOLOGY_BLOCKED'
});

/**
 * Determines resulting facing direction from coordinate displacement.
 * @param {{ x: number, y: number }} from
 * @param {{ x: number, y: number }} to
 * @returns {string}
 */
export function computeDisplacementFacing(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return 'NONE';
  if (dx === 0 && dy > 0) return 'NORTH';
  if (dx === 0 && dy < 0) return 'SOUTH';
  if (dx > 0 && dy === 0) return 'EAST';
  if (dx < 0 && dy === 0) return 'WEST';
  if (dx > 0 && dy > 0) return 'NORTH_EAST';
  if (dx < 0 && dy > 0) return 'NORTH_WEST';
  if (dx > 0 && dy < 0) return 'SOUTH_EAST';
  return 'SOUTH_WEST';
}

/**
 * Resolves vertical transition type identifier between two z layers.
 * @param {number} fromZ
 * @param {number} toZ
 * @returns {string}
 */
function resolveTransitionType(fromZ, toZ) {
  if (fromZ === -1 && toZ === 0) return 'SUBTERRANEAN_TO_SURFACE';
  if (fromZ === 0 && toZ === -1) return 'SURFACE_TO_SUBTERRANEAN';
  if (fromZ === 0 && toZ === 1) return 'SURFACE_TO_ARBOREAL';
  if (fromZ === 1 && toZ === 0) return 'ARBOREAL_TO_SURFACE';
  if (fromZ === 1 && toZ === 2) return 'ARBOREAL_TO_AERIAL';
  if (fromZ === 2 && toZ === 1) return 'AERIAL_TO_ARBOREAL';
  if (fromZ === 0 && toZ === 2) return 'SURFACE_TO_AERIAL';
  if (fromZ === 2 && toZ === 0) return 'AERIAL_TO_SURFACE';
  return 'VERTICAL_TRANSITION';
}

/**
 * Creates an invalid TraversalResult helper.
 * @param {string} reason
 * @param {object} from
 * @returns {Readonly<object>}
 */
function createInvalidResult(reason, from) {
  return Object.freeze({
    status: 'INVALID',
    reason,
    cost: calculateMovementCost({ from, to: from }),
    target_facing: 'NONE'
  });
}

/**
 * Purely validates a single-step traversal request without modifying world state.
 *
 * @param {object} request
 * @param {string} request.organism_id
 * @param {{ x: number, y: number, z: number }} request.from
 * @param {{ x: number, y: number, z: number }} request.to
 * @param {string} request.locomotion_mode - 'CRAWL' | 'BURROW' | 'FLIGHT'
 * @param {Array<object>} request.capabilities
 * @param {import('../spatial_world.js').SpatialWorld} spatialWorld
 * @param {object} [options]
 * @param {boolean} [options.isDead=false]
 * @returns {Readonly<object>} TraversalResult conforming to traversal_result.schema.json
 */
export function validateTraversal(request, spatialWorld, options = {}) {
  const { organism_id, from, to, locomotion_mode, capabilities } = request || {};

  // 1. INVALID_COORDINATE check
  let pFrom, pTo;
  try {
    pFrom = validateCoordinate(from, 'from');
    pTo = validateCoordinate(to, 'to');
  } catch {
    const fallbackFrom = { x: 0, y: 0, z: 0 };
    return createInvalidResult(REASON_CODES.INVALID_COORDINATE, fallbackFrom);
  }

  // 2. OUT_OF_BOUNDS check
  if (!spatialWorld.hasCell(pFrom) || !spatialWorld.hasCell(pTo)) {
    return createInvalidResult(REASON_CODES.OUT_OF_BOUNDS, pFrom);
  }

  // 3. DEAD_ORGANISM check
  if (options.isDead === true) {
    return createInvalidResult(REASON_CODES.DEAD_ORGANISM, pFrom);
  }
  const entity = spatialWorld.getEntity(organism_id);
  if (entity && entity.metadata && entity.metadata.is_alive === false) {
    return createInvalidResult(REASON_CODES.DEAD_ORGANISM, pFrom);
  }

  // 4. SAME_POSITION check
  if (pFrom.x === pTo.x && pFrom.y === pTo.y && pFrom.z === pTo.z) {
    return createInvalidResult(REASON_CODES.SAME_POSITION, pFrom);
  }

  // 5. Single-step adjacency constraint (NO pathfinding, NO teleportation)
  const dx = Math.abs(pTo.x - pFrom.x);
  const dy = Math.abs(pTo.y - pFrom.y);
  const dz = Math.abs(pTo.z - pFrom.z);

  // Planar movement (same Z): Chebyshev distance must be strictly 1
  if (pFrom.z === pTo.z) {
    if (Math.max(dx, dy) > 1) {
      return createInvalidResult(REASON_CODES.UNSUPPORTED_TRANSITION, pFrom);
    }
  } else {
    // Vertical movement: dz must be <= 2 (for direct aerial takeoff/landing), planar shift <= 1
    if (dz > 2 || Math.max(dx, dy) > 1) {
      return createInvalidResult(REASON_CODES.UNSUPPORTED_TRANSITION, pFrom);
    }
  }

  // 6. CAPABILITY_REQUIRED check
  const cap = (capabilities || []).find(c => c.capability_id === locomotion_mode);
  if (!cap || cap.is_available !== true) {
    return createInvalidResult(REASON_CODES.CAPABILITY_REQUIRED, pFrom);
  }

  // 7. UNSUPPORTED_TRANSITION check (Capability compatibility)
  if (!cap.supported_layers || !cap.supported_layers.includes(pTo.z)) {
    return createInvalidResult(REASON_CODES.UNSUPPORTED_TRANSITION, pFrom);
  }

  const isVertical = pFrom.z !== pTo.z;
  if (isVertical) {
    const transitionType = resolveTransitionType(pFrom.z, pTo.z);
    if (!cap.supported_transitions || !cap.supported_transitions.includes(transitionType)) {
      return createInvalidResult(REASON_CODES.UNSUPPORTED_TRANSITION, pFrom);
    }
  }

  // 8. TOPOLOGY_BLOCKED check (World topology declaration)
  if (isVertical) {
    const topologyTransitions = getVerticalTransitions(pFrom, spatialWorld.boundary);
    const available = topologyTransitions.some(t => t.to.z === pTo.z && t.topology_available === true);
    // Note: direct surface-to-aerial (dz = 2) is a specialized open-air takeoff if allowed by world
    if (!available && dz === 1) {
      return createInvalidResult(REASON_CODES.TOPOLOGY_BLOCKED, pFrom);
    }
  }

  // 9. All checks pass -> VALID TraversalResult
  const cost = calculateMovementCost({ from: pFrom, to: pTo, isVerticalTransition: isVertical });
  const target_facing = computeDisplacementFacing(pFrom, pTo);

  return Object.freeze({
    status: 'VALID',
    reason: REASON_CODES.NONE,
    cost,
    target_facing
  });
}
