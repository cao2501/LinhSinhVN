/**
 * @file habitat_definition.js
 * @description Data-driven semantic habitat definition. Decoupled from biological consequences.
 */

import { HabitatRegion, RegionType } from './habitat_region.js';

export const HabitatCategory = Object.freeze({
  FOREST_FLOOR: 'FOREST_FLOOR',
  UNDER_LEAF_LITTER: 'UNDER_LEAF_LITTER',
  ROTTING_WOOD: 'ROTTING_WOOD',
  TREE_TRUNK: 'TREE_TRUNK',
  OPEN_GROUND: 'OPEN_GROUND',
  BURROW_INTERIOR: 'BURROW_INTERIOR',
  WATER_MARGIN: 'WATER_MARGIN',
  CUSTOM: 'CUSTOM'
});

export const DEFAULT_OPEN_TERRAIN_ID = 'DEFAULT_OPEN_TERRAIN';

export class HabitatDefinition {
  /**
   * @param {Object} config
   * @param {string} config.habitat_id
   * @param {string} config.habitat_type
   * @param {HabitatRegion|Object} config.region
   * @param {number} config.priority
   * @param {Object} config.micro_climate_modifiers
   * @param {number} config.micro_climate_modifiers.temperature_modifier
   * @param {number} config.micro_climate_modifiers.humidity_modifier
   * @param {number} config.micro_climate_modifiers.light_level_modifier
   * @param {number} [config.micro_climate_modifiers.shelter_security_baseline=0.1]
   * @param {Object} [config.metadata]
   */
  constructor(config = {}) {
    if (!config || typeof config !== 'object') {
      throw new TypeError('HabitatDefinition config must be an object');
    }

    if (typeof config.habitat_id !== 'string' || !/^[A-Za-z0-9_]+$/.test(config.habitat_id)) {
      throw new TypeError(`Invalid habitat_id: "${config.habitat_id}". Must be non-empty alphanumeric lowercase string with underscores.`);
    }

    if (!Object.values(HabitatCategory).includes(config.habitat_type)) {
      throw new TypeError(`Invalid habitat_type: "${config.habitat_type}". Must match HabitatCategory enum.`);
    }

    if (typeof config.priority !== 'number' || !Number.isInteger(config.priority)) {
      throw new TypeError(`priority must be an integer, received: ${config.priority}`);
    }

    if (!config.region) {
      throw new TypeError('HabitatDefinition requires a region');
    }
    this.region = config.region instanceof HabitatRegion ? config.region : new HabitatRegion(config.region);

    if (!config.micro_climate_modifiers || typeof config.micro_climate_modifiers !== 'object') {
      throw new TypeError('micro_climate_modifiers must be an object');
    }
    const {
      temperature_modifier,
      humidity_modifier,
      light_level_modifier,
      shelter_security_baseline = 0.1
    } = config.micro_climate_modifiers;

    if (typeof temperature_modifier !== 'number' || !Number.isFinite(temperature_modifier)) {
      throw new TypeError('temperature_modifier must be a finite number');
    }
    if (typeof humidity_modifier !== 'number' || !Number.isFinite(humidity_modifier)) {
      throw new TypeError('humidity_modifier must be a finite number');
    }
    if (typeof light_level_modifier !== 'number' || !Number.isFinite(light_level_modifier)) {
      throw new TypeError('light_level_modifier must be a finite number');
    }
    if (typeof shelter_security_baseline !== 'number' || shelter_security_baseline < 0.0 || shelter_security_baseline > 1.0) {
      throw new RangeError('shelter_security_baseline must be in range [0.0, 1.0]');
    }

    this.habitat_id = config.habitat_id;
    this.habitat_type = config.habitat_type;
    this.priority = config.priority;
    this.micro_climate_modifiers = Object.freeze({
      temperature_modifier,
      humidity_modifier,
      light_level_modifier,
      shelter_security_baseline
    });
    this.metadata = config.metadata ? Object.freeze({ ...config.metadata }) : Object.freeze({});

    Object.freeze(this);
  }

  /**
   * Factory for creating the canonical registered DEFAULT_OPEN_TERRAIN definition.
   * @param {Object} [boundary] - Optional world boundary to bound the default terrain.
   * @returns {HabitatDefinition}
   */
  static createDefaultOpenTerrain(boundary) {
    if (!boundary || typeof boundary !== 'object') {
      throw new TypeError('createDefaultOpenTerrain requires an explicit world boundary object');
    }
    const { min_x, max_x, min_y, max_y, min_z, max_z } = boundary;
    for (const v of [min_x, max_x, min_y, max_y, min_z, max_z]) {
      if (typeof v !== 'number' || !Number.isInteger(v)) {
        throw new TypeError(`world boundary coordinate must be a discrete integer, received: ${v}`);
      }
    }
    const bounds = { min_x, max_x, min_y, max_y, min_z, max_z };

    return new HabitatDefinition({
      habitat_id: DEFAULT_OPEN_TERRAIN_ID,
      habitat_type: HabitatCategory.OPEN_GROUND,
      priority: -1,
      region: new HabitatRegion({
        type: RegionType.RECTANGLE,
        bounds
      }),
      micro_climate_modifiers: {
        temperature_modifier: 0.0,
        humidity_modifier: 0.0,
        light_level_modifier: 1.0,
        shelter_security_baseline: 0.1
      },
      metadata: {
        description: 'Canonical default open terrain fallback'
      }
    });
  }

  toJSON() {
    return {
      habitat_id: this.habitat_id,
      habitat_type: this.habitat_type,
      priority: this.priority,
      region: this.region.toJSON(),
      micro_climate_modifiers: { ...this.micro_climate_modifiers },
      metadata: { ...this.metadata }
    };
  }
}
