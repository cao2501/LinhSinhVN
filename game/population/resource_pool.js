/**
 * LinhSinhVN — Deterministic Resource Pool & Allocation Foundation
 *
 * Implements the shared resource pool abstraction and the canonical
 * ID-ordered sequential allocation algorithm for population simulation ticks.
 *
 * Guaranteed:
 * - Deterministic, insertion-order invariant allocation
 * - Pure standalone allocation function as single source of truth
 * - Input demand objects and environment state remain strictly immutable
 * - Zero RNG dependencies
 */

import { validateDemandsList } from './resource_demand.js';

/**
 * Pure canonical resource allocation algorithm.
 *
 * Allocates available resources among organism demands using the canonical policy:
 * CANONICAL ID ORDER + SEQUENTIAL ALLOCATION
 *
 * 1. Validates demand list and rejects duplicate organism IDs.
 * 2. Sorts demands strictly by organism_id ascending lexicographically.
 * 3. Allocates allocated = min(requested_amount, remaining_resource).
 * 4. Deducts allocation from remaining resource.
 * 5. Continues until all demands are processed or remaining resource is zero.
 *
 * @param {number} availableResource - Finite non-negative starting resource
 * @param {Array<object>} demands - Array of { organism_id, requested_amount }
 * @returns {Readonly<object>} Frozen AllocationResult conforming to resource_allocation.schema.json
 * @throws {TypeError|RangeError|Error} If inputs are invalid or duplicate IDs exist
 */
export function allocateResourceDemands(availableResource, demands) {
  if (typeof availableResource !== 'number' || !Number.isFinite(availableResource)) {
    throw new TypeError(`availableResource must be a finite number, received: ${availableResource}`);
  }
  if (availableResource < 0) {
    throw new RangeError(`availableResource cannot be negative, received: ${availableResource}`);
  }

  validateDemandsList(demands);

  // Sort demands strictly by organism_id ascending lexicographically (UTF-16 code units)
  // Input demands array and individual demand objects are NOT mutated.
  const sortedDemands = [...demands].sort((a, b) => {
    if (a.organism_id < b.organism_id) return -1;
    if (a.organism_id > b.organism_id) return 1;
    return 0;
  });

  let remaining = availableResource;
  let totalRequested = 0;
  let totalAllocated = 0;
  const allocations = [];

  for (const demand of sortedDemands) {
    const requested = demand.requested_amount;
    totalRequested += requested;

    const allocated = Math.min(requested, remaining);
    const unmet = requested - allocated;

    remaining -= allocated;
    totalAllocated += allocated;

    allocations.push(Object.freeze({
      organism_id: demand.organism_id,
      requested_amount: requested,
      allocated_amount: allocated,
      unmet_amount: unmet
    }));
  }

  return Object.freeze({
    schema_version: '1.0.0',
    initial_resource: availableResource,
    total_requested: totalRequested,
    total_allocated: totalAllocated,
    remaining_resource: remaining,
    allocations: Object.freeze(allocations)
  });
}

/**
 * Headless, deterministic ResourcePool container.
 */
export class ResourcePool {
  /**
   * @param {number} [initialQuantity=0.0] - Finite non-negative initial resource quantity
   */
  constructor(initialQuantity = 0.0) {
    if (typeof initialQuantity !== 'number' || !Number.isFinite(initialQuantity)) {
      throw new TypeError(`initialQuantity must be a finite number, received: ${initialQuantity}`);
    }
    if (initialQuantity < 0) {
      throw new RangeError(`initialQuantity cannot be negative, received: ${initialQuantity}`);
    }

    this._initialQuantity = initialQuantity;
    this._availableQuantity = initialQuantity;
  }

  /**
   * Initial resource quantity configured at creation.
   * @returns {number}
   */
  get initialQuantity() {
    return this._initialQuantity;
  }

  /**
   * Currently available resource quantity.
   * @returns {number}
   */
  get availableQuantity() {
    return this._availableQuantity;
  }

  /**
   * Low-level primitive: directly deducts an explicit quantity.
   * NOTE: This is a low-level primitive, NOT the population allocation policy.
   * Use allocateDemands() for population tick allocation.
   *
   * @param {number} amount
   * @returns {number} The allocated amount
   * @throws {TypeError|RangeError} If amount is invalid or exceeds available
   */
  allocate(amount) {
    if (typeof amount !== 'number' || !Number.isFinite(amount)) {
      throw new TypeError(`amount must be a finite number, received: ${amount}`);
    }
    if (amount < 0) {
      throw new RangeError(`amount cannot be negative, received: ${amount}`);
    }
    if (amount > this._availableQuantity) {
      throw new RangeError(`Requested amount ${amount} exceeds available quantity ${this._availableQuantity}`);
    }

    this._availableQuantity -= amount;
    return amount;
  }

  /**
   * Canonical population allocation API:
   * Allocates available pool resources among organism demands using the canonical algorithm,
   * updates the pool state exactly once, and returns the AllocationResult.
   *
   * @param {Array<object>} demands - Array of { organism_id, requested_amount }
   * @returns {Readonly<object>} Frozen AllocationResult
   */
  allocateDemands(demands) {
    const result = allocateResourceDemands(this._availableQuantity, demands);
    this._availableQuantity = result.remaining_resource;
    return result;
  }

  /**
   * Commits a previously calculated AllocationResult to the pool state.
   * Used by transactional coordinators (Phase E) to ensure atomic commit.
   *
   * @param {object} allocationResult - Result from allocateResourceDemands()
   * @throws {TypeError|RangeError} If invalid
   */
  commitAllocation(allocationResult) {
    if (!allocationResult || typeof allocationResult !== 'object') {
      throw new TypeError('allocationResult must be a non-null object');
    }
    if (typeof allocationResult.remaining_resource !== 'number' || !Number.isFinite(allocationResult.remaining_resource) || allocationResult.remaining_resource < 0) {
      throw new TypeError('allocationResult.remaining_resource must be a finite non-negative number');
    }
    this._availableQuantity = allocationResult.remaining_resource;
  }

  /**
   * Returns a serializable, frozen snapshot of the resource pool.
   * @returns {Readonly<{ schema_version: string, initial_quantity: number, available_quantity: number }>}
   */
  snapshot() {
    return Object.freeze({
      schema_version: '1.0.0',
      initial_quantity: this._initialQuantity,
      available_quantity: this._availableQuantity
    });
  }
}

/**
 * Functional factory for ResourcePool.
 *
 * @param {number} [initialQuantity=0.0]
 * @returns {ResourcePool}
 */
export function createResourcePool(initialQuantity = 0.0) {
  return new ResourcePool(initialQuantity);
}
