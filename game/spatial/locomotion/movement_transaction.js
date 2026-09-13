/**
 * LinhSinhVN — Movement Transaction Execution
 *
 * TASK 08-C: Locomotion & Movement Traversal Cost
 *
 * Implements 3-phase atomic movement:
 * PLAN -> VALIDATE -> COMMIT
 *
 * Guarantees:
 * - VALID movement atomically updates SpatialWorld position and derived index.
 * - INVALID movement leaves SpatialWorld 100% untouched (no partial mutations).
 * - SpatialWorld is the sole authority for position mutation.
 */

import { validateTraversal } from './traversal_validator.js';

/**
 * Phase 1: PLAN (Create immutable movement request)
 * @param {object} params
 * @param {string} params.organism_id
 * @param {{ x: number, y: number, z: number }} params.from
 * @param {{ x: number, y: number, z: number }} params.to
 * @param {string} params.locomotion_mode
 * @param {Array<object>} params.capabilities
 * @returns {Readonly<object>}
 */
export function planMovement({ organism_id, from, to, locomotion_mode, capabilities }) {
  if (typeof organism_id !== 'string' || !organism_id.trim()) {
    throw new TypeError('[MovementTransaction] organism_id must be a non-empty string');
  }
  return Object.freeze({
    organism_id,
    from: Object.freeze({ x: from.x, y: from.y, z: from.z }),
    to: Object.freeze({ x: to.x, y: to.y, z: to.z }),
    locomotion_mode,
    capabilities: Object.freeze([...(capabilities || [])])
  });
}

/**
 * Phase 2 & 3: Execute Movement Transaction (VALIDATE -> COMMIT)
 *
 * @param {object} request - Planned movement request
 * @param {import('../spatial_world.js').SpatialWorld} spatialWorld - Sole authoritative world
 * @param {object} [options]
 * @returns {Readonly<object>} Transaction outcome report
 */
export function executeMovementTransaction(request, spatialWorld, options = {}) {
  // Phase 2: VALIDATE (Pure read-only evaluation)
  const validation = validateTraversal(request, spatialWorld, options);

  // Phase 3: COMMIT or ABORT
  if (validation.status === 'VALID') {
    // Authoritative mutation strictly through SpatialWorld
    const newRecord = spatialWorld.updateEntityPosition(
      request.organism_id,
      request.to,
      validation.target_facing
    );

    return Object.freeze({
      success: true,
      validation,
      newRecord,
      position: newRecord.position,
      facing: newRecord.facing,
      cost: validation.cost
    });
  }

  // INVALID: Zero mutation on SpatialWorld
  const currentEntity = spatialWorld.getEntity(request.organism_id);
  return Object.freeze({
    success: false,
    validation,
    newRecord: currentEntity,
    position: currentEntity ? currentEntity.position : request.from,
    facing: currentEntity ? currentEntity.facing : 'NONE',
    cost: validation.cost
  });
}
