/**
 * LinhSinhVN — Shelter Definition Domain Model
 *
 * TASK 08-D3: Deterministic Shelter Runtime
 *
 * Static spatial definition of a shelter structure.
 * Decoupled from biological regeneration, HP, and vitality.
 */

import { validateCoordinate, freezeCoordinate } from '../coordinates.js';

export const ShelterType = Object.freeze({
  TREE_CAVITY: 'TREE_CAVITY',
  BURROW_NEST: 'BURROW_NEST',
  ROCK_CREVICE: 'ROCK_CREVICE',
  UNDER_BARK: 'UNDER_BARK',
  LEAF_FOLD: 'LEAF_FOLD',
  CUSTOM: 'CUSTOM'
});

export const EntryLocomotionRequirement = Object.freeze({
  CRAWL: 'CRAWL',
  BURROW: 'BURROW',
  FLIGHT: 'FLIGHT'
});

const SHELTER_ID_REGEX = /^[a-z0-9_]+$/;

export class ShelterDefinition {
  /**
   * @param {object} params
   * @param {string} params.shelter_id
   * @param {string} params.shelter_type
   * @param {{ x: number, y: number, z: number }} params.position
   * @param {number} params.capacity
   * @param {number} params.security_factor
   * @param {string|null} [params.entry_locomotion_requirement=null]
   * @param {{ temperature_delta?: number, humidity_delta?: number }} [params.micro_climate_offsets]
   * @param {object} [params.metadata]
   */
  constructor({
    shelter_id,
    shelter_type,
    position,
    capacity,
    security_factor,
    entry_locomotion_requirement = null,
    micro_climate_offsets = {},
    metadata = {}
  }) {
    if (typeof shelter_id !== 'string' || !SHELTER_ID_REGEX.test(shelter_id)) {
      throw new TypeError(`[ShelterDefinition] shelter_id must match /^[a-z0-9_]+$/, received: '${shelter_id}'`);
    }

    if (!Object.values(ShelterType).includes(shelter_type)) {
      throw new TypeError(`[ShelterDefinition] Invalid shelter_type: '${shelter_type}'. Allowed: ${Object.values(ShelterType).join(', ')}`);
    }

    validateCoordinate(position);

    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new TypeError(`[ShelterDefinition] capacity must be an integer >= 1, received: ${capacity}`);
    }

    if (typeof security_factor !== 'number' || !Number.isFinite(security_factor) || security_factor < 0 || security_factor > 1) {
      throw new TypeError(`[ShelterDefinition] security_factor must be a finite number in [0.0, 1.0], received: ${security_factor}`);
    }

    if (entry_locomotion_requirement !== null && !Object.values(EntryLocomotionRequirement).includes(entry_locomotion_requirement)) {
      throw new TypeError(`[ShelterDefinition] Invalid entry_locomotion_requirement: '${entry_locomotion_requirement}'. Allowed: ${Object.values(EntryLocomotionRequirement).join(', ')}, null`);
    }

    const offsets = {
      temperature_delta: 0,
      humidity_delta: 0
    };
    if (micro_climate_offsets && typeof micro_climate_offsets === 'object') {
      if (micro_climate_offsets.temperature_delta !== undefined) {
        if (typeof micro_climate_offsets.temperature_delta !== 'number' || !Number.isFinite(micro_climate_offsets.temperature_delta)) {
          throw new TypeError('[ShelterDefinition] micro_climate_offsets.temperature_delta must be a finite number');
        }
        offsets.temperature_delta = micro_climate_offsets.temperature_delta;
      }
      if (micro_climate_offsets.humidity_delta !== undefined) {
        if (typeof micro_climate_offsets.humidity_delta !== 'number' || !Number.isFinite(micro_climate_offsets.humidity_delta)) {
          throw new TypeError('[ShelterDefinition] micro_climate_offsets.humidity_delta must be a finite number');
        }
        offsets.humidity_delta = micro_climate_offsets.humidity_delta;
      }
    }

    this.shelter_id = shelter_id;
    this.shelter_type = shelter_type;
    this.position = freezeCoordinate(position);
    this.capacity = capacity;
    this.security_factor = security_factor;
    this.entry_locomotion_requirement = entry_locomotion_requirement;
    this.micro_climate_offsets = Object.freeze(offsets);
    this.metadata = Object.freeze(JSON.parse(JSON.stringify(metadata || {})));

    Object.freeze(this);
  }
}
