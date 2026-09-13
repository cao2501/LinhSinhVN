/**
 * LinhSinhVN — Spatial Resource Zone Registry
 *
 * TASK 08-D4: Resource Zone + Spatial Integration
 *
 * Authoritative store for spatial resource zones.
 * Manages spatial resource queries (by type, coordinate, or ID).
 * INVARIANT: Zero resource quantities or inventories stored here.
 */

import { SpatialResourceZone } from './resource_zone_definition.js';
import { RegionType } from '../habitat/habitat_region.js';

export class ResourceZoneRegistry {
  /**
   * @param {object} [options]
   * @param {import('../spatial_grid.js').SpatialGridBoundary} [options.boundary]
   */
  constructor({ boundary } = {}) {
    this.boundary = boundary || null;
    /** @type {Map<string, SpatialResourceZone>} */
    this._zones = new Map();
  }

  /**
   * Registers a spatial resource zone.
   * Rejects duplicates or out-of-world geometries.
   *
   * @param {SpatialResourceZone|object} zoneConfig
   * @returns {SpatialResourceZone}
   */
  registerZone(zoneConfig) {
    const zone = zoneConfig instanceof SpatialResourceZone ? zoneConfig : new SpatialResourceZone(zoneConfig);

    if (this._zones.has(zone.zone_id)) {
      throw new Error(`[ResourceZoneRegistry] Duplicate zone_id rejected: '${zone.zone_id}'`);
    }

    // Boundary validation
    if (this.boundary) {
      if (zone.region.type === RegionType.RECTANGLE) {
        const b = zone.region.bounds;
        this.boundary.assertWithinBounds({ x: b.min_x, y: b.min_y, z: b.min_z }, `zone '${zone.zone_id}' bounds min`);
        this.boundary.assertWithinBounds({ x: b.max_x, y: b.max_y, z: b.max_z }, `zone '${zone.zone_id}' bounds max`);
      } else if (zone.region.type === RegionType.CELL_SET) {
        for (const cell of zone.region.cells) {
          this.boundary.assertWithinBounds(cell, `zone '${zone.zone_id}' cell`);
        }
      }
    }

    this._zones.set(zone.zone_id, zone);
    return zone;
  }

  /**
   * Deregisters a resource zone.
   * @param {string} zoneId
   * @returns {SpatialResourceZone}
   */
  deregisterZone(zoneId) {
    const zone = this._zones.get(zoneId);
    if (!zone) {
      throw new Error(`[ResourceZoneRegistry] Zone '${zoneId}' not found`);
    }
    this._zones.delete(zoneId);
    return zone;
  }

  /**
   * Retrieves a zone by ID.
   * @param {string} zoneId
   * @returns {SpatialResourceZone|null}
   */
  getZone(zoneId) {
    return this._zones.get(zoneId) || null;
  }

  /**
   * Returns all zones sorted by zone_id ASC.
   * Deterministic ordering independent of insertion order.
   * @returns {ReadonlyArray<SpatialResourceZone>}
   */
  getAllZones() {
    const sorted = Array.from(this._zones.values()).sort((a, b) =>
      a.zone_id < b.zone_id ? -1 : (a.zone_id > b.zone_id ? 1 : 0)
    );
    return Object.freeze(sorted);
  }

  /**
   * Returns all zones matching a given resource type, sorted by zone_id ASC.
   * @param {string} resourceType
   * @returns {ReadonlyArray<SpatialResourceZone>}
   */
  getZonesByResourceType(resourceType) {
    if (typeof resourceType !== 'string' || !resourceType) {
      throw new TypeError('[ResourceZoneRegistry] resourceType must be a non-empty string');
    }
    const matched = Array.from(this._zones.values())
      .filter(z => z.resource_type === resourceType)
      .sort((a, b) => (a.zone_id < b.zone_id ? -1 : (a.zone_id > b.zone_id ? 1 : 0)));
    return Object.freeze(matched);
  }

  /**
   * Queries all resource zones containing a given spatial coordinate.
   * Deterministic ordering: zone_id ASC.
   * Supports overlapping zones without merging or discarding.
   *
   * @param {{ x: number, y: number, z: number }} coordinate
   * @returns {ReadonlyArray<SpatialResourceZone>}
   */
  getZonesAtCoordinate(coordinate) {
    const matched = Array.from(this._zones.values())
      .filter(z => z.contains(coordinate))
      .sort((a, b) => (a.zone_id < b.zone_id ? -1 : (a.zone_id > b.zone_id ? 1 : 0)));
    return Object.freeze(matched);
  }

  /**
   * Checks whether a specific zone contains a coordinate.
   * @param {string} zoneId
   * @param {{ x: number, y: number, z: number }} coordinate
   * @returns {boolean}
   */
  containsCoordinate(zoneId, coordinate) {
    const zone = this._zones.get(zoneId);
    if (!zone) return false;
    return zone.contains(coordinate);
  }

  /**
   * Serializes all registered zones canonically.
   * Deterministic ordering: zone_id ASC.
   * @returns {object}
   */
  serialize() {
    const zones = this.getAllZones().map(z => ({
      zone_id: z.zone_id,
      resource_type: z.resource_type,
      region: {
        type: z.region.type,
        ...(z.region.type === RegionType.RECTANGLE ? { bounds: { ...z.region.bounds } } : {}),
        ...(z.region.type === RegionType.CELL_SET ? { cells: z.region.cells.map(c => ({ x: c.x, y: c.y, z: c.z })) } : {})
      },
      accessibility_requirements: [...z.accessibility_requirements],
      metadata: z.metadata
    }));

    return Object.freeze({
      zones: Object.freeze(zones)
    });
  }

  /**
   * Deserializes and validates a snapshot.
   * Fails fast if any zone definition is invalid or duplicated.
   *
   * @param {object} snapshot
   * @param {object} [options]
   * @returns {ResourceZoneRegistry}
   */
  static deserialize(snapshot, options = {}) {
    if (!snapshot || typeof snapshot !== 'object') {
      throw new TypeError('[ResourceZoneRegistry.deserialize] snapshot must be an object');
    }
    if (!Array.isArray(snapshot.zones)) {
      throw new TypeError('[ResourceZoneRegistry.deserialize] snapshot.zones must be an array');
    }

    const registry = new ResourceZoneRegistry(options);
    for (const z of snapshot.zones) {
      registry.registerZone(z);
    }
    return registry;
  }
}
