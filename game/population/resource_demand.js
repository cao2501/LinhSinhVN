/**
 * LinhSinhVN — Deterministic Resource Demand Contract
 *
 * Defines the contract and validation for individual organism resource demands.
 * Separates demand representation from biological nutrition calculations.
 */

/**
 * Validates an individual resource demand object.
 *
 * @param {object} demand
 * @throws {TypeError|RangeError} If validation fails
 */
export function validateResourceDemand(demand) {
  if (!demand || typeof demand !== 'object') {
    throw new TypeError('Resource demand must be a non-null object');
  }

  const { organism_id, requested_amount } = demand;

  if (typeof organism_id !== 'string' || organism_id.trim().length === 0) {
    throw new TypeError(`organism_id must be a non-empty string, received: ${organism_id}`);
  }

  if (typeof requested_amount !== 'number' || !Number.isFinite(requested_amount)) {
    throw new TypeError(`requested_amount must be a finite number, received: ${requested_amount}`);
  }

  if (requested_amount < 0) {
    throw new RangeError(`requested_amount cannot be negative, received: ${requested_amount}`);
  }
}

/**
 * Validates a list of resource demands, asserting that all demands are valid
 * and that no duplicate organism_ids exist in the collection.
 *
 * @param {Array<object>} demands
 * @throws {TypeError|RangeError|Error} If validation fails or duplicate organism_id is detected
 */
export function validateDemandsList(demands) {
  if (!Array.isArray(demands)) {
    throw new TypeError(`demands must be an array, received: ${typeof demands}`);
  }

  const seenIds = new Set();

  for (let i = 0; i < demands.length; i++) {
    const demand = demands[i];
    validateResourceDemand(demand);

    if (seenIds.has(demand.organism_id)) {
      throw new Error(`Duplicate organism_id '${demand.organism_id}' detected in resource demand list at index ${i}`);
    }
    seenIds.add(demand.organism_id);
  }
}

/**
 * Creates a validated resource demand object.
 *
 * @param {string} organismId - Unique organism identifier
 * @param {number} requestedAmount - Non-negative resource amount requested
 * @returns {Readonly<{ organism_id: string, requested_amount: number }>}
 */
export function createResourceDemand(organismId, requestedAmount) {
  const demand = {
    organism_id: organismId,
    requested_amount: requestedAmount
  };

  validateResourceDemand(demand);
  return Object.freeze(demand);
}
