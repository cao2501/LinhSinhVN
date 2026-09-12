/**
 * LinhSinhVN — Headless Deterministic Population Registry
 *
 * Owns organism references and records for a single population.
 * Organism records are the sole source of truth; counts are derived.
 * Death does NOT imply removal (DEATH != REMOVE).
 * Zero biological calculations are performed inside the registry.
 */

const HEX_64_REGEX = /^0x[0-9a-fA-F]{16}$/;

export class PopulationRegistry {
  /**
   * @param {object} config
   * @param {string} config.population_id - Unique population ID
   * @param {string} config.species_id - Species ID for all organisms in this population
   * @param {string} config.simulation_seed - 64-bit hex master simulation seed
   */
  constructor(config = {}) {
    if (!config || typeof config !== 'object') {
      throw new TypeError('PopulationRegistry config must be a non-null object');
    }

    const { population_id, species_id, simulation_seed } = config;

    if (typeof population_id !== 'string' || population_id.trim().length === 0) {
      throw new TypeError(`population_id must be a non-empty string, received: ${population_id}`);
    }
    if (typeof species_id !== 'string' || species_id.trim().length === 0) {
      throw new TypeError(`species_id must be a non-empty string, received: ${species_id}`);
    }
    if (typeof simulation_seed !== 'string' || !HEX_64_REGEX.test(simulation_seed)) {
      throw new TypeError(`simulation_seed must be a 64-bit hex string, received: ${simulation_seed}`);
    }

    this._populationId = population_id;
    this._speciesId = species_id;
    this._simulationSeed = simulation_seed;

    /** @type {Map<string, object>} Organism records keyed by organism_id (Sole Source of Truth) */
    this._organisms = new Map();
  }

  get populationId() {
    return this._populationId;
  }

  get speciesId() {
    return this._speciesId;
  }

  get simulationSeed() {
    return this._simulationSeed;
  }

  /**
   * Total number of organism records (living + dead).
   * @returns {number}
   */
  get size() {
    return this._organisms.size;
  }

  /**
   * Alias for size.
   * @returns {number}
   */
  get totalCount() {
    return this._organisms.size;
  }

  /**
   * Derived count of living organisms (is_alive === true).
   * @returns {number}
   */
  countLiving() {
    let count = 0;
    for (const org of this._organisms.values()) {
      if (org.is_alive === true) {
        count++;
      }
    }
    return count;
  }

  /**
   * Derived count of dead organisms (is_alive === false).
   * @returns {number}
   */
  countDead() {
    let count = 0;
    for (const org of this._organisms.values()) {
      if (org.is_alive === false) {
        count++;
      }
    }
    return count;
  }

  /**
   * Checks whether an organism with the given ID exists in the registry.
   *
   * @param {string} organismId
   * @returns {boolean}
   */
  hasOrganism(organismId) {
    if (typeof organismId !== 'string') {
      return false;
    }
    return this._organisms.has(organismId);
  }

  /**
   * Retrieves an organism record by ID.
   *
   * @param {string} organismId
   * @returns {object|undefined}
   */
  getOrganism(organismId) {
    if (typeof organismId !== 'string') {
      return undefined;
    }
    return this._organisms.get(organismId);
  }

  /**
   * Adds an organism record to the population registry.
   *
   * @param {object} organism - Organism state record
   * @throws {TypeError|Error} If invalid, duplicate ID, or species mismatch
   */
  addOrganism(organism) {
    if (!organism || typeof organism !== 'object') {
      throw new TypeError('organism must be a non-null object');
    }
    const { organism_id, species_id } = organism;

    if (typeof organism_id !== 'string' || organism_id.trim().length === 0) {
      throw new TypeError(`organism must have a non-empty string organism_id, received: ${organism_id}`);
    }

    if (this._organisms.has(organism_id)) {
      throw new Error(`Duplicate organism ID '${organism_id}' rejected`);
    }

    if (species_id !== undefined && species_id !== this._speciesId) {
      throw new Error(`Population identity mismatch: organism species '${species_id}' does not match population species '${this._speciesId}'`);
    }

    if (typeof organism.is_alive !== 'boolean') {
      throw new TypeError(`organism.is_alive must be a boolean, received: ${organism.is_alive}`);
    }

    this._organisms.set(organism_id, organism);
  }

  /**
   * Explicit administrative removal of an organism from the registry.
   * NOTE: An organism dying does NOT remove it (DEATH != REMOVE).
   *
   * @param {string} organismId
   * @returns {boolean} True if removed, false if not found
   */
  removeOrganism(organismId) {
    if (typeof organismId !== 'string') {
      return false;
    }
    return this._organisms.delete(organismId);
  }

  /**
   * Returns an array of organism records, strictly ordered by organism_id ascending lexicographically.
   *
   * @returns {Array<object>}
   */
  listOrganisms() {
    const sortedIds = Array.from(this._organisms.keys()).sort();
    return sortedIds.map(id => this._organisms.get(id));
  }

  /**
   * Deterministic iterator yielding organisms in ascending lexicographical organism_id order.
   */
  *[Symbol.iterator]() {
    const sortedIds = Array.from(this._organisms.keys()).sort();
    for (const id of sortedIds) {
      yield this._organisms.get(id);
    }
  }

  /**
   * Produces a deterministic, canonical snapshot conforming to population_state.schema.json.
   *
   * @returns {object} Canonical population state snapshot
   */
  snapshot() {
    const living = this.countLiving();
    const dead = this.countDead();
    const total = this._organisms.size;

    return {
      schema_version: '1.0.0',
      population_id: this._populationId,
      species_id: this._speciesId,
      simulation_seed: this._simulationSeed,
      living_count: living,
      dead_count: dead,
      total_count: total,
      organisms: this.listOrganisms()
    };
  }
}

/**
 * Functional factory for PopulationRegistry.
 *
 * @param {object} config
 * @returns {PopulationRegistry}
 */
export function createPopulationRegistry(config) {
  return new PopulationRegistry(config);
}
