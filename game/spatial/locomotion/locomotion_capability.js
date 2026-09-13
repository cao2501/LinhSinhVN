/**
 * LinhSinhVN — Locomotion Capability Model
 *
 * TASK 08-C: Locomotion & Movement Traversal Cost
 *
 * Structured Capability Records (Data-Driven).
 * Capability owns:
 * - locomotion abilities available to the organism
 * - locomotion mode parameters (speed_modifier)
 * - capability compatibility/support data (supported_layers, supported_transitions)
 *
 * IMPORTANT ARCHITECTURAL INVARIANT:
 * Capability MUST NOT own world topology. World topology is owned by SpatialWorld.
 */

export const LOCOMOTION_MODES = Object.freeze(['CRAWL', 'BURROW', 'FLIGHT']);

export class LocomotionCapability {
  /**
   * @param {object} params
   * @param {string} params.capability_id - 'CRAWL' | 'BURROW' | 'FLIGHT'
   * @param {boolean} [params.is_available=true]
   * @param {number[]} params.supported_layers - Z-strata where functional
   * @param {string[]} params.supported_transitions - Transition types capable of attempting
   * @param {number} [params.speed_modifier=100] - Basis points (100 = 1.0x)
   */
  constructor({
    capability_id,
    is_available = true,
    supported_layers,
    supported_transitions,
    speed_modifier = 100
  }) {
    if (!LOCOMOTION_MODES.includes(capability_id)) {
      throw new TypeError(`[LocomotionCapability] Invalid capability_id: ${capability_id}. Allowed: ${LOCOMOTION_MODES.join(', ')}`);
    }
    if (typeof is_available !== 'boolean') {
      throw new TypeError('[LocomotionCapability] is_available must be a boolean');
    }
    if (!Array.isArray(supported_layers) || !supported_layers.every(Number.isInteger)) {
      throw new TypeError('[LocomotionCapability] supported_layers must be an array of integers');
    }
    if (!Array.isArray(supported_transitions) || !supported_transitions.every(t => typeof t === 'string')) {
      throw new TypeError('[LocomotionCapability] supported_transitions must be an array of strings');
    }
    if (!Number.isSafeInteger(speed_modifier) || speed_modifier <= 0) {
      throw new RangeError('[LocomotionCapability] speed_modifier must be a positive safe integer');
    }

    this.capability_id = capability_id;
    this.is_available = is_available;
    this.supported_layers = Object.freeze([...supported_layers]);
    this.supported_transitions = Object.freeze([...supported_transitions]);
    this.speed_modifier = speed_modifier;

    Object.freeze(this);
  }
}

/**
 * Creates prototype CRAWL capability record.
 * Gameplay prototype configuration (not a universal hardcoded rule).
 * @param {object} [options]
 * @returns {LocomotionCapability}
 */
export function createCrawlCapability({ is_available = true, speed_modifier = 100 } = {}) {
  return new LocomotionCapability({
    capability_id: 'CRAWL',
    is_available,
    supported_layers: [0, 1],
    supported_transitions: ['SURFACE_TO_ARBOREAL', 'ARBOREAL_TO_SURFACE'],
    speed_modifier
  });
}

/**
 * Creates prototype BURROW capability record.
 * Gameplay prototype configuration (not a universal hardcoded rule).
 * @param {object} [options]
 * @returns {LocomotionCapability}
 */
export function createBurrowCapability({ is_available = true, speed_modifier = 100 } = {}) {
  return new LocomotionCapability({
    capability_id: 'BURROW',
    is_available,
    supported_layers: [-1, 0],
    supported_transitions: ['SUBTERRANEAN_TO_SURFACE', 'SURFACE_TO_SUBTERRANEAN'],
    speed_modifier
  });
}

/**
 * Creates prototype FLIGHT capability record.
 * Gameplay prototype configuration (not a universal hardcoded rule).
 * @param {object} [options]
 * @returns {LocomotionCapability}
 */
export function createFlightCapability({ is_available = true, speed_modifier = 100 } = {}) {
  return new LocomotionCapability({
    capability_id: 'FLIGHT',
    is_available,
    supported_layers: [0, 1, 2],
    supported_transitions: [
      'SURFACE_TO_ARBOREAL',
      'ARBOREAL_TO_SURFACE',
      'SURFACE_TO_AERIAL',
      'AERIAL_TO_SURFACE',
      'ARBOREAL_TO_AERIAL',
      'AERIAL_TO_ARBOREAL'
    ],
    speed_modifier
  });
}
