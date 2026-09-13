/**
 * LinhSinhVN — Spatial Resource Zone Domain Model
 *
 * TASK 08-D4: Resource Zone + Spatial Integration
 *
 * Spatial location metadata for where resources exist.
 * INVARIANT: SpatialResourceZone contains ZERO quantity, inventory,
 * capacity, consumption, or regeneration fields (resource pool authority is sole authority for quantity).
 */

import { HabitatRegion } from '../habitat/habitat_region.js';

const ZONE_ID_REGEX = /^[a-z0-9_]+$/;

export class SpatialResourceZone {
  /**
   * @param {object} params
   * @param {string} params.zone_id
   * @param {string} params.resource_type
   * @param {HabitatRegion|object} params.region
   * @param {string[]} [params.accessibility_requirements=[]]
   * @param {object} [params.metadata={}]
   */
  constructor({
    zone_id,
    resource_type,
    region,
    accessibility_requirements = [],
    metadata = {}
  }) {
    if (typeof zone_id !== 'string' || !ZONE_ID_REGEX.test(zone_id)) {
      throw new TypeError(`[SpatialResourceZone] zone_id must match /^[a-z0-9_]+$/, received: '${zone_id}'`);
    }

    if (typeof resource_type !== 'string' || !resource_type.trim()) {
      throw new TypeError('[SpatialResourceZone] resource_type must be a non-empty string');
    }

    let parsedRegion;
    if (region instanceof HabitatRegion) {
      parsedRegion = region;
    } else if (region && typeof region === 'object') {
      parsedRegion = new HabitatRegion(region);
    } else {
      throw new TypeError('[SpatialResourceZone] region must be a valid HabitatRegion or region config object');
    }

    if (!Array.isArray(accessibility_requirements)) {
      throw new TypeError('[SpatialResourceZone] accessibility_requirements must be an array');
    }
    for (const req of accessibility_requirements) {
      if (typeof req !== 'string' || !req) {
        throw new TypeError('[SpatialResourceZone] accessibility requirement must be a non-empty string');
      }
    }

    this.zone_id = zone_id;
    this.resource_type = resource_type;
    this.region = parsedRegion;
    this.accessibility_requirements = Object.freeze([...accessibility_requirements]);
    this.metadata = Object.freeze(JSON.parse(JSON.stringify(metadata || {})));

    Object.freeze(this);
  }

  /**
   * Evaluates if a coordinate falls within this resource zone.
   * Pure geometric evaluation.
   *
   * @param {{ x: number, y: number, z: number }} coord
   * @returns {boolean}
   */
  contains(coord) {
    return this.region.contains(coord);
  }
}
