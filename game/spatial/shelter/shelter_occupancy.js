/**
 * LinhSinhVN — Canonical Shelter Occupancy Domain Model
 *
 * TASK 08-D3: Deterministic Shelter Runtime
 *
 * Authoritative spatial shelter runtime occupancy state.
 * Invariant: current_occupancy === occupant_ids.length <= capacity.
 * occupant_ids[] is strictly sorted alphabetically for determinism.
 */

export class ShelterOccupancy {
  /**
   * @param {object} params
   * @param {string} params.shelter_id
   * @param {number} params.capacity
   * @param {string[]} [params.occupant_ids=[]]
   */
  constructor({ shelter_id, capacity, occupant_ids = [] }) {
    if (typeof shelter_id !== 'string' || !shelter_id) {
      throw new TypeError('[ShelterOccupancy] shelter_id must be a non-empty string');
    }
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new TypeError(`[ShelterOccupancy] capacity must be an integer >= 1, received: ${capacity}`);
    }
    if (!Array.isArray(occupant_ids)) {
      throw new TypeError('[ShelterOccupancy] occupant_ids must be an array');
    }

    const seen = new Set();
    for (const id of occupant_ids) {
      if (typeof id !== 'string' || !id) {
        throw new TypeError('[ShelterOccupancy] occupant ID must be a non-empty string');
      }
      if (seen.has(id)) {
        throw new Error(`[ShelterOccupancy] Duplicate occupant ID '${id}' rejected`);
      }
      seen.add(id);
    }

    if (occupant_ids.length > capacity) {
      throw new Error(`[ShelterOccupancy] Occupancy length ${occupant_ids.length} exceeds capacity ${capacity}`);
    }

    this.shelter_id = shelter_id;
    this.capacity = capacity;
    /** @type {string[]} */
    this._occupant_ids = [...occupant_ids].sort((a, b) => (a < b ? -1 : (a > b ? 1 : 0)));
  }

  get current_occupancy() {
    return this._occupant_ids.length;
  }

  get occupant_ids() {
    return Object.freeze([...this._occupant_ids]);
  }

  hasOccupant(organismId) {
    return this._occupant_ids.includes(organismId);
  }

  canAcceptOccupant() {
    return this._occupant_ids.length < this.capacity;
  }

  /**
   * Adds an occupant. Enforces capacity and uniqueness.
   * Maintains alphabetical sorting.
   * @param {string} organismId
   */
  addOccupant(organismId) {
    if (typeof organismId !== 'string' || !organismId) {
      throw new TypeError('[ShelterOccupancy] organismId must be a non-empty string');
    }
    if (this._occupant_ids.includes(organismId)) {
      throw new Error(`[ShelterOccupancy] Organism '${organismId}' is already an occupant of shelter '${this.shelter_id}'`);
    }
    if (this._occupant_ids.length >= this.capacity) {
      throw new Error(`[ShelterOccupancy] Shelter '${this.shelter_id}' capacity full (${this.capacity})`);
    }

    this._occupant_ids.push(organismId);
    this._occupant_ids.sort((a, b) => (a < b ? -1 : (a > b ? 1 : 0)));
  }

  /**
   * Removes an occupant.
   * @param {string} organismId
   */
  removeOccupant(organismId) {
    const idx = this._occupant_ids.indexOf(organismId);
    if (idx === -1) {
      throw new Error(`[ShelterOccupancy] Organism '${organismId}' is not an occupant of shelter '${this.shelter_id}'`);
    }
    this._occupant_ids.splice(idx, 1);
  }

  /**
   * Serializes according to shelter_occupancy.schema.json.
   * @returns {object}
   */
  snapshot() {
    return Object.freeze({
      shelter_id: this.shelter_id,
      capacity: this.capacity,
      current_occupancy: this.current_occupancy,
      occupant_ids: Object.freeze([...this._occupant_ids])
    });
  }
}
