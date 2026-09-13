/**
 * LinhSinhVN — Species Registry Foundation
 *
 * Provides deterministic registration and lookup of immutable species profiles
 * for simulation worlds and populations.
 *
 * Rules:
 * - species_id -> immutable SpeciesProfile
 * - Validates registration and rejects duplicate species_id
 * - Rejects invalid profiles
 * - Rejects unknown species lookup
 * - Zero runtime filesystem I/O (SimulationWorld remains generic)
 * - Zero nondeterministic APIs
 */

function deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    deepFreeze(obj[key]);
  }
  return obj;
}

export class SpeciesRegistry {
  constructor() {
    /** @type {Map<string, Readonly<object>>} */
    this._profiles = new Map();
  }

  /**
   * Registers an immutable species profile.
   *
   * @param {object} profile - Complete species profile object
   * @returns {Readonly<object>} The registered, deep-frozen profile
   * @throws {TypeError|Error} If profile is invalid or duplicate
   */
  register(profile) {
    if (!profile || typeof profile !== 'object') {
      throw new TypeError('Species profile must be a non-null object');
    }

    const speciesId = profile.species_id;
    if (typeof speciesId !== 'string' || speciesId.trim().length === 0) {
      throw new TypeError(`Species profile must contain a non-empty string species_id, received: ${speciesId}`);
    }

    if (this._profiles.has(speciesId)) {
      throw new Error(`Duplicate species_id '${speciesId}' rejected by SpeciesRegistry`);
    }

    // Basic structural checks: must have lifecycle_profile and stages
    if (!profile.lifecycle_profile || typeof profile.lifecycle_profile !== 'object') {
      throw new TypeError(`Species profile '${speciesId}' missing lifecycle_profile object`);
    }
    if (!Array.isArray(profile.lifecycle_profile.stages) || profile.lifecycle_profile.stages.length === 0) {
      throw new TypeError(`Species profile '${speciesId}' must contain a non-empty lifecycle_profile.stages array`);
    }

    // Defensive deep-clone and freeze
    const cloned = JSON.parse(JSON.stringify(profile));
    const frozen = deepFreeze(cloned);

    this._profiles.set(speciesId, frozen);
    return frozen;
  }

  /**
   * Retrieves a registered species profile by species_id.
   *
   * @param {string} speciesId
   * @returns {Readonly<object>}
   * @throws {TypeError|Error} If speciesId is invalid or unknown
   */
  get(speciesId) {
    if (typeof speciesId !== 'string' || speciesId.trim().length === 0) {
      throw new TypeError(`speciesId must be a non-empty string, received: ${speciesId}`);
    }

    const profile = this._profiles.get(speciesId);
    if (!profile) {
      throw new Error(`Unknown species_id '${speciesId}' in SpeciesRegistry`);
    }

    return profile;
  }

  /**
   * Checks if a species profile is registered.
   *
   * @param {string} speciesId
   * @returns {boolean}
   */
  has(speciesId) {
    if (typeof speciesId !== 'string') {
      return false;
    }
    return this._profiles.has(speciesId);
  }

  /**
   * Lists all registered species IDs in canonical ascending order.
   *
   * @returns {string[]}
   */
  listSpeciesIds() {
    return Array.from(this._profiles.keys()).sort();
  }
}

/**
 * Functional factory for SpeciesRegistry.
 *
 * @returns {SpeciesRegistry}
 */
export function createSpeciesRegistry() {
  return new SpeciesRegistry();
}
