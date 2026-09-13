/**
 * LinhSinhVN — Authoritative Spatial Entity Registry
 *
 * TASK 08-B: Deterministic Spatial Foundation
 *
 * Authoritative store for spatial entity membership, position, and orientation.
 * PopulationRegistry owns demographic membership (ALIVE/DEAD).
 * SpatialEntityRegistry owns spatial existence and position.
 *
 * Population Membership != Spatial Membership.
 */

import { validateCoordinate, freezeCoordinate, CANONICAL_FACINGS } from './coordinates.js';
import { SpatialGridBoundary } from './spatial_grid.js';

export class SpatialEntityRegistry {
  /**
   * @param {SpatialGridBoundary} bounds
   */
  constructor(bounds) {
    if (!(bounds instanceof SpatialGridBoundary)) {
      throw new TypeError('[SpatialEntityRegistry] bounds must be an instance of SpatialGridBoundary');
    }
    this.bounds = bounds;
    /** @type {Map<string, object>} */
    this._entities = new Map();
  }

  /**
   * Registers a spatial entity.
   * Rejects duplicate registrations explicitly.
   *
   * @param {object} param
   * @param {string} param.entity_id
   * @param {{ x: number, y: number, z: number }} param.position
   * @param {string} [param.facing='NONE']
   * @param {string} [param.entity_type='ORGANISM']
   * @param {object} [param.metadata={}]
   * @returns {Readonly<object>} registered entity record
   */
  register({ entity_id, position, facing = 'NONE', entity_type = 'ORGANISM', metadata = {} }) {
    if (typeof entity_id !== 'string' || !entity_id.trim()) {
      throw new TypeError('[SpatialEntityRegistry] entity_id must be a non-empty string');
    }
    if (this._entities.has(entity_id)) {
      throw new Error(`[SpatialEntityRegistry] Duplicate registration rejected: entity_id '${entity_id}' is already registered.`);
    }

    const pos = this.bounds.assertWithinBounds(position, `entity '${entity_id}'`);

    if (typeof facing !== 'string' || !CANONICAL_FACINGS.includes(facing)) {
      throw new TypeError(`[SpatialEntityRegistry] Invalid facing: '${facing}'. Allowed: ${CANONICAL_FACINGS.join(', ')}`);
    }

    const record = Object.freeze({
      entity_id,
      position: freezeCoordinate(pos),
      facing,
      entity_type: String(entity_type || 'ORGANISM'),
      metadata: Object.freeze(JSON.parse(JSON.stringify(metadata || {})))
    });

    this._entities.set(entity_id, record);
    return record;
  }

  /**
   * Deregisters a spatial entity.
   * @param {string} entityId
   * @returns {Readonly<object>} the removed record
   */
  deregister(entityId) {
    if (typeof entityId !== 'string' || !entityId) {
      throw new TypeError('[SpatialEntityRegistry] entityId must be a non-empty string');
    }
    const record = this._entities.get(entityId);
    if (!record) {
      throw new Error(`[SpatialEntityRegistry] Cannot deregister: entity_id '${entityId}' not found.`);
    }
    this._entities.delete(entityId);
    return record;
  }

  /**
   * Updates an entity position atomically.
   * Validation-before-mutation: asserts bounds and existence before touching state.
   *
   * @param {string} entityId
   * @param {{ x: number, y: number, z: number }} newPos
   * @param {string} [newFacing]
   * @returns {{ oldRecord: Readonly<object>, newRecord: Readonly<object> }}
   */
  updatePosition(entityId, newPos, newFacing) {
    if (typeof entityId !== 'string' || !entityId) {
      throw new TypeError('[SpatialEntityRegistry] entityId must be a non-empty string');
    }
    const existing = this._entities.get(entityId);
    if (!existing) {
      throw new Error(`[SpatialEntityRegistry] Cannot update position: entity_id '${entityId}' not found.`);
    }

    // Strict validation before mutation
    const validatedPos = this.bounds.assertWithinBounds(newPos, `newPosition for entity '${entityId}'`);

    const facing = newFacing !== undefined ? newFacing : existing.facing;
    if (typeof facing !== 'string' || !CANONICAL_FACINGS.includes(facing)) {
      throw new TypeError(`[SpatialEntityRegistry] Invalid facing: '${facing}'. Allowed: ${CANONICAL_FACINGS.join(', ')}`);
    }

    const newRecord = Object.freeze({
      ...existing,
      position: freezeCoordinate(validatedPos),
      facing
    });

    this._entities.set(entityId, newRecord);
    return { oldRecord: existing, newRecord };
  }

  /**
   * Retrieves an entity record. Returns defensive copy.
   * @param {string} entityId
   * @returns {Readonly<object>|null}
   */
  getEntity(entityId) {
    const record = this._entities.get(entityId);
    return record || null;
  }

  /**
   * Checks if an entity is registered.
   * @param {string} entityId
   * @returns {boolean}
   */
  hasEntity(entityId) {
    return this._entities.has(entityId);
  }

  /**
   * Returns all registered entities in canonical order: entity_id ASC.
   * Never dependent on insertion order.
   * @returns {ReadonlyArray<Readonly<object>>}
   */
  getAllEntities() {
    const sorted = Array.from(this._entities.values()).sort((a, b) => a.entity_id.localeCompare(b.entity_id));
    return Object.freeze(sorted);
  }

  /**
   * Total number of registered entities.
   * @returns {number}
   */
  get size() {
    return this._entities.size;
  }
}
