/**
 * LinhSinhVN — SpatialWorld Domain Authority
 *
 * TASK 08-B: Deterministic Spatial Foundation
 *
 * Authoritative owner of:
 * - Spatial Membership
 * - Entity position (x, y, z)
 * - Orientation (facing)
 * - World boundaries
 *
 * Derived data:
 * - SpatialIndex (reconstructible at any time)
 *
 * Guarantees:
 * - Deterministic entity ordering (entity_id ASC)
 * - Atomic position updates (validation before mutation)
 * - Lossless reversible flat grid indexing
 * - Pure canonical serialization & round-trip deserialization
 * - Zero gameplay/locomotion/behavior logic
 */

import { validateCoordinate, formatCellId } from './coordinates.js';
import { SpatialGridBoundary, coordinateToIndex, indexToCoordinate, getPlanarNeighborCoordinates } from './spatial_grid.js';
import { SpatialIndex } from './spatial_index.js';
import { SpatialEntityRegistry } from './spatial_entity_registry.js';

export const SCHEMA_VERSION = '1.0.0';

export class SpatialWorld {
  /**
   * @param {object} [options]
   * @param {number} [options.width=100]
   * @param {number} [options.height=100]
   * @param {number} [options.z_min=-1]
   * @param {number} [options.z_max=2]
   */
  constructor({ width = 100, height = 100, z_min = -1, z_max = 2 } = {}) {
    this.boundary = new SpatialGridBoundary({ width, height, z_min, z_max });
    this.registry = new SpatialEntityRegistry(this.boundary);
    this.index = new SpatialIndex(this.boundary);
  }

  /**
   * Registers an entity into the spatial world.
   * Atomically updates registry and derived spatial index.
   *
   * @param {object} param
   * @param {string} param.entity_id
   * @param {{ x: number, y: number, z: number }} param.position
   * @param {string} [param.facing='NONE']
   * @param {string} [param.entity_type='ORGANISM']
   * @param {object} [param.metadata={}]
   * @returns {Readonly<object>}
   */
  registerEntity({ entity_id, position, facing = 'NONE', entity_type = 'ORGANISM', metadata = {} }) {
    // 1. Validate coordinates against boundary first
    const pos = this.boundary.assertWithinBounds(position, `entity '${entity_id}'`);
    const cellIndex = coordinateToIndex(pos, this.boundary);

    // 2. Register with authoritative registry
    const record = this.registry.register({
      entity_id,
      position: pos,
      facing,
      entity_type,
      metadata
    });

    // 3. Update derived spatial index
    this.index.addEntity(cellIndex, entity_id);

    return record;
  }

  /**
   * Deregisters an entity from the spatial world.
   * Atomically updates registry and derived spatial index.
   *
   * @param {string} entityId
   * @returns {Readonly<object>}
   */
  deregisterEntity(entityId) {
    const record = this.registry.deregister(entityId);
    const cellIndex = coordinateToIndex(record.position, this.boundary);
    this.index.removeEntity(cellIndex, entityId);
    return record;
  }

  /**
   * Updates entity position atomically.
   * Validation-before-mutation guarantees no partial state corruption on failure.
   *
   * @param {string} entityId
   * @param {{ x: number, y: number, z: number }} newPosition
   * @param {string} [newFacing]
   * @returns {Readonly<object>} new entity record
   */
  updateEntityPosition(entityId, newPosition, newFacing) {
    // Validate target position before touching state
    const newPos = this.boundary.assertWithinBounds(newPosition, `updatePosition for '${entityId}'`);
    const newCellIndex = coordinateToIndex(newPos, this.boundary);

    // Registry updates atomically
    const { oldRecord, newRecord } = this.registry.updatePosition(entityId, newPos, newFacing);
    const oldCellIndex = coordinateToIndex(oldRecord.position, this.boundary);

    // Update derived spatial index
    this.index.moveEntity(oldCellIndex, newCellIndex, entityId);

    return newRecord;
  }

  /**
   * Checks if an entity exists in the spatial world.
   * @param {string} entityId
   * @returns {boolean}
   */
  hasEntity(entityId) {
    return this.registry.hasEntity(entityId);
  }

  /**
   * Retrieves an entity record.
   * @param {string} entityId
   * @returns {Readonly<object>|null}
   */
  getEntity(entityId) {
    return this.registry.getEntity(entityId);
  }

  /**
   * Retrieves an entity position.
   * @param {string} entityId
   * @returns {Readonly<{ x: number, y: number, z: number }>|null}
   */
  getPosition(entityId) {
    const entity = this.registry.getEntity(entityId);
    return entity ? entity.position : null;
  }

  /**
   * Checks if a coordinate is valid within the world boundary.
   * @param {{ x: number, y: number, z: number }} pos
   * @returns {boolean}
   */
  hasCell(pos) {
    return this.boundary.contains(pos);
  }

  /**
   * Returns canonical sorted list of entity IDs present at a cell.
   * Ordering: entity_id ASC.
   *
   * @param {{ x: number, y: number, z: number }} pos
   * @returns {ReadonlyArray<string>}
   */
  getEntitiesAtCell(pos) {
    const p = this.boundary.assertWithinBounds(pos, 'pos');
    const cellIndex = coordinateToIndex(p, this.boundary);
    return this.index.getEntitiesAtCellIndex(cellIndex);
  }

  /**
   * Returns canonical sorted list of entity IDs in the planar neighborhood of a cell.
   *
   * @param {{ x: number, y: number, z: number }} pos
   * @param {object} [options]
   * @param {boolean} [options.includeOrigin=false]
   * @returns {ReadonlyArray<string>}
   */
  getEntitiesInNeighborhood(pos, { includeOrigin = false } = {}) {
    const neighbors = getPlanarNeighborCoordinates(pos, this.boundary, { includeOrigin });
    const resultSet = new Set();

    for (const neighborPos of neighbors) {
      const cellIndex = coordinateToIndex(neighborPos, this.boundary);
      const entities = this.index.getEntitiesAtCellIndex(cellIndex);
      for (const id of entities) {
        resultSet.add(id);
      }
    }

    const sorted = Array.from(resultSet).sort();
    return Object.freeze(sorted);
  }

  /**
   * Rebuilds the derived spatial index from authoritative registry records.
   * Used for index consistency verification.
   */
  rebuildIndex() {
    const allEntities = this.registry.getAllEntities();
    const entries = allEntities.map(e => ({
      entity_id: e.entity_id,
      cellIndex: coordinateToIndex(e.position, this.boundary)
    }));
    this.index.rebuild(entries);
  }

  /**
   * Deterministic canonical serialization.
   * Stable property ordering, stable entity ordering (entity_id ASC).
   * JSON-compatible, pure / read-only.
   *
   * @returns {object}
   */
  serialize() {
    const entities = this.registry.getAllEntities().map(e => ({
      entity_id: e.entity_id,
      entity_type: e.entity_type,
      facing: e.facing,
      metadata: JSON.parse(JSON.stringify(e.metadata)),
      position: {
        x: e.position.x,
        y: e.position.y,
        z: e.position.z
      }
    }));

    return {
      boundary: {
        height: this.boundary.height,
        width: this.boundary.width,
        z_max: this.boundary.z_max,
        z_min: this.boundary.z_min
      },
      entities,
      schema_version: SCHEMA_VERSION
    };
  }

  /**
   * Reconstructs a SpatialWorld instance from a canonical snapshot.
   * Round-trip deserialization.
   *
   * @param {object} snapshot
   * @returns {SpatialWorld}
   */
  static deserialize(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') {
      throw new TypeError('[SpatialWorld] Invalid snapshot: must be a non-null object');
    }
    if (snapshot.schema_version !== SCHEMA_VERSION) {
      throw new Error(`[SpatialWorld] Unsupported schema_version: ${snapshot.schema_version}. Expected: ${SCHEMA_VERSION}`);
    }
    const { boundary, entities } = snapshot;
    if (!boundary || !Array.isArray(entities)) {
      throw new Error('[SpatialWorld] Snapshot missing required boundary or entities array');
    }

    const world = new SpatialWorld({
      width: boundary.width,
      height: boundary.height,
      z_min: boundary.z_min,
      z_max: boundary.z_max
    });

    for (const entity of entities) {
      world.registerEntity(entity);
    }

    return world;
  }
}
