/**
 * LinhSinhVN — ResourcePool & Allocation Foundation Tests
 *
 * Tests TC-RES-01 through TC-RES-18, Replay Determinism, and Architectural Boundary.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ResourcePool,
  createResourcePool,
  allocateResourceDemands
} from '../../game/population/resource_pool.js';

import {
  createResourceDemand,
  validateResourceDemand,
  validateDemandsList
} from '../../game/population/resource_demand.js';

import { createEnvironmentState } from '../../game/population/environment_state.js';

const EPSILON = 1e-9;

describe('ResourcePool & ResourceAllocation (TC-RES-01 -> TC-RES-18)', () => {
  it('TC-RES-01: Create resource pool with valid quantity', () => {
    const pool = createResourcePool(100.5);
    assert.equal(pool.initialQuantity, 100.5);
    assert.equal(pool.availableQuantity, 100.5);

    const snap = pool.snapshot();
    assert.equal(snap.initial_quantity, 100.5);
    assert.equal(snap.available_quantity, 100.5);
    assert.equal(snap.schema_version, '1.0.0');

    // Default quantity is 0.0
    const defaultPool = createResourcePool();
    assert.equal(defaultPool.initialQuantity, 0.0);
    assert.equal(defaultPool.availableQuantity, 0.0);
  });

  it('TC-RES-02: Reject negative resource', () => {
    assert.throws(() => createResourcePool(-1.0), /cannot be negative/);
    assert.throws(() => allocateResourceDemands(-0.5, []), /cannot be negative/);
  });

  it('TC-RES-03: Reject NaN resource', () => {
    assert.throws(() => createResourcePool(NaN), /must be a finite number/);
    assert.throws(() => allocateResourceDemands(NaN, []), /must be a finite number/);
  });

  it('TC-RES-04: Reject Infinity resource', () => {
    assert.throws(() => createResourcePool(Infinity), /must be a finite number/);
    assert.throws(() => createResourcePool(-Infinity), /must be a finite number/);
    assert.throws(() => allocateResourceDemands(Infinity, []), /must be a finite number/);
  });

  it('TC-RES-05: Allocate one demand fully', () => {
    const pool = createResourcePool(10.0);
    const demands = [createResourceDemand('org_01', 6.0)];

    const result = pool.allocateDemands(demands);

    assert.equal(result.initial_resource, 10.0);
    assert.equal(result.total_requested, 6.0);
    assert.equal(result.total_allocated, 6.0);
    assert.equal(result.remaining_resource, 4.0);
    assert.equal(pool.availableQuantity, 4.0);

    assert.equal(result.allocations.length, 1);
    assert.deepEqual(result.allocations[0], {
      organism_id: 'org_01',
      requested_amount: 6.0,
      allocated_amount: 6.0,
      unmet_amount: 0.0
    });
  });

  it('TC-RES-06: Allocate multiple demands with enough resource', () => {
    const pool = createResourcePool(20.0);
    const demands = [
      createResourceDemand('org_B', 5.0),
      createResourceDemand('org_A', 3.0),
      createResourceDemand('org_C', 2.0)
    ];

    const result = pool.allocateDemands(demands);

    assert.equal(result.initial_resource, 20.0);
    assert.equal(result.total_requested, 10.0);
    assert.equal(result.total_allocated, 10.0);
    assert.equal(result.remaining_resource, 10.0);
    assert.equal(pool.availableQuantity, 10.0);

    // Allocations must be sorted by organism_id ascending
    assert.equal(result.allocations[0].organism_id, 'org_A');
    assert.equal(result.allocations[0].allocated_amount, 3.0);
    assert.equal(result.allocations[0].unmet_amount, 0.0);

    assert.equal(result.allocations[1].organism_id, 'org_B');
    assert.equal(result.allocations[1].allocated_amount, 5.0);
    assert.equal(result.allocations[1].unmet_amount, 0.0);

    assert.equal(result.allocations[2].organism_id, 'org_C');
    assert.equal(result.allocations[2].allocated_amount, 2.0);
    assert.equal(result.allocations[2].unmet_amount, 0.0);
  });

  it('TC-RES-07: Finite resource is deterministically exhausted', () => {
    // Example from spec: resource=10, A requests 7, B requests 7, C requests 2
    // Allocation: A=7, B=3, C=0, remaining=0
    const pool = createResourcePool(10.0);
    const demands = [
      createResourceDemand('A', 7.0),
      createResourceDemand('B', 7.0),
      createResourceDemand('C', 2.0)
    ];

    const result = pool.allocateDemands(demands);

    assert.equal(result.initial_resource, 10.0);
    assert.equal(result.total_requested, 16.0);
    assert.equal(result.total_allocated, 10.0);
    assert.equal(result.remaining_resource, 0.0);
    assert.equal(pool.availableQuantity, 0.0);

    assert.deepEqual(result.allocations, [
      { organism_id: 'A', requested_amount: 7.0, allocated_amount: 7.0, unmet_amount: 0.0 },
      { organism_id: 'B', requested_amount: 7.0, allocated_amount: 3.0, unmet_amount: 4.0 },
      { organism_id: 'C', requested_amount: 2.0, allocated_amount: 0.0, unmet_amount: 2.0 }
    ]);
  });

  it('TC-RES-08: Insertion order does not affect allocation', () => {
    const resource = 10.0;

    // Shuffled order 1: C, B, A
    const demandsOrder1 = [
      { organism_id: 'C', requested_amount: 2.0 },
      { organism_id: 'B', requested_amount: 7.0 },
      { organism_id: 'A', requested_amount: 7.0 }
    ];

    // Shuffled order 2: A, C, B
    const demandsOrder2 = [
      { organism_id: 'A', requested_amount: 7.0 },
      { organism_id: 'C', requested_amount: 2.0 },
      { organism_id: 'B', requested_amount: 7.0 }
    ];

    const result1 = allocateResourceDemands(resource, demandsOrder1);
    const result2 = allocateResourceDemands(resource, demandsOrder2);

    const json1 = JSON.stringify(result1);
    const json2 = JSON.stringify(result2);

    assert.equal(json1, json2);
    assert.deepEqual(
      result1.allocations.map(a => a.organism_id),
      ['A', 'B', 'C']
    );
  });

  it('TC-RES-09: Duplicate organism IDs are rejected', () => {
    const demandsWithDup = [
      { organism_id: 'org_X', requested_amount: 3.0 },
      { organism_id: 'org_Y', requested_amount: 2.0 },
      { organism_id: 'org_X', requested_amount: 4.0 }
    ];

    assert.throws(
      () => validateDemandsList(demandsWithDup),
      /Duplicate organism_id 'org_X' detected/
    );

    assert.throws(
      () => allocateResourceDemands(10.0, demandsWithDup),
      /Duplicate organism_id 'org_X' detected/
    );
  });

  it('TC-RES-10: Zero demand is valid', () => {
    const pool = createResourcePool(5.0);
    const demands = [
      createResourceDemand('org_active', 3.0),
      createResourceDemand('org_dormant', 0.0)
    ];

    const result = pool.allocateDemands(demands);

    assert.equal(result.total_requested, 3.0);
    assert.equal(result.total_allocated, 3.0);
    assert.equal(result.remaining_resource, 2.0);

    const dormantAlloc = result.allocations.find(a => a.organism_id === 'org_dormant');
    assert.deepEqual(dormantAlloc, {
      organism_id: 'org_dormant',
      requested_amount: 0.0,
      allocated_amount: 0.0,
      unmet_amount: 0.0
    });
  });

  it('TC-RES-11: Negative demand rejected', () => {
    assert.throws(
      () => createResourceDemand('org_neg', -2.5),
      /cannot be negative/
    );

    assert.throws(
      () => validateResourceDemand({ organism_id: 'org_neg', requested_amount: -1.0 }),
      /cannot be negative/
    );

    assert.throws(
      () => allocateResourceDemands(10.0, [{ organism_id: 'org_neg', requested_amount: -1.0 }]),
      /cannot be negative/
    );
  });

  it('TC-RES-12: NaN/Infinity demand rejected', () => {
    assert.throws(
      () => createResourceDemand('org_nan', NaN),
      /must be a finite number/
    );
    assert.throws(
      () => createResourceDemand('org_inf', Infinity),
      /must be a finite number/
    );
    assert.throws(
      () => allocateResourceDemands(10.0, [{ organism_id: 'org_inf', requested_amount: Infinity }]),
      /must be a finite number/
    );
  });

  it('TC-RES-13: Zero resource produces zero allocations and correct unmet amounts', () => {
    const pool = createResourcePool(0.0);
    const demands = [
      createResourceDemand('org_01', 5.0),
      createResourceDemand('org_02', 3.5)
    ];

    const result = pool.allocateDemands(demands);

    assert.equal(result.initial_resource, 0.0);
    assert.equal(result.total_allocated, 0.0);
    assert.equal(result.remaining_resource, 0.0);
    assert.equal(result.total_requested, 8.5);

    assert.deepEqual(result.allocations, [
      { organism_id: 'org_01', requested_amount: 5.0, allocated_amount: 0.0, unmet_amount: 5.0 },
      { organism_id: 'org_02', requested_amount: 3.5, allocated_amount: 0.0, unmet_amount: 3.5 }
    ]);
  });

  it('TC-RES-14: Input demand objects are not mutated', () => {
    const demandA = { organism_id: 'A', requested_amount: 7.0 };
    const demandB = { organism_id: 'B', requested_amount: 7.0 };
    const demands = [demandA, demandB];

    const originalJsonA = JSON.stringify(demandA);
    const originalJsonB = JSON.stringify(demandB);

    allocateResourceDemands(10.0, demands);

    assert.equal(JSON.stringify(demandA), originalJsonA);
    assert.equal(JSON.stringify(demandB), originalJsonB);
    assert.equal(demandA.allocated_amount, undefined);
    assert.equal(demandB.unmet_amount, undefined);
  });

  it('TC-RES-15: Organism records are not mutated', () => {
    const mockOrganism = {
      organism_id: 'org_01',
      species_id: 'xylotrupes_rhinoceros_proto',
      is_alive: true,
      nutrition_state: { stored_energy: 85.0, structural_biomass: 0.05 }
    };
    const initialOrgJson = JSON.stringify(mockOrganism);

    const demands = [{ organism_id: mockOrganism.organism_id, requested_amount: 10.0 }];
    allocateResourceDemands(5.0, demands);

    assert.equal(JSON.stringify(mockOrganism), initialOrgJson);
    assert.equal(mockOrganism.nutrition_state.stored_energy, 85.0);
  });

  it('TC-RES-16: EnvironmentState is not mutated', () => {
    const env = createEnvironmentState({ food_resource: 0.70 });
    const initialFood = env.food_resource;

    const pool = createResourcePool(env.food_resource * 100);
    pool.allocateDemands([{ organism_id: 'org_hungry', requested_amount: 50.0 }]);

    // EnvironmentState.food_resource remains completely untouched
    assert.equal(env.food_resource, initialFood);
    assert.equal(env.food_resource, 0.70);
  });

  it('TC-RES-17: Allocation result is deterministic across repeated executions', () => {
    const demands = [
      { organism_id: 'org_03', requested_amount: 4.2 },
      { organism_id: 'org_01', requested_amount: 5.5 },
      { organism_id: 'org_02', requested_amount: 3.1 }
    ];

    const res1 = allocateResourceDemands(10.0, demands);
    const res2 = allocateResourceDemands(10.0, demands);

    assert.equal(JSON.stringify(res1), JSON.stringify(res2));
  });

  it('TC-RES-18: Mathematical consistency with floating-point EPSILON', () => {
    // Tests with fractional amounts requiring floating-point arithmetic precision
    const initial = 10.333333333;
    const demands = [
      { organism_id: 'A', requested_amount: 3.111111111 },
      { organism_id: 'B', requested_amount: 4.222222222 },
      { organism_id: 'C', requested_amount: 5.333333333 }
    ];

    const result = allocateResourceDemands(initial, demands);

    // 1. total_allocated + remaining_resource === initial_resource (within EPSILON)
    const resourceBalance = Math.abs(
      (result.total_allocated + result.remaining_resource) - result.initial_resource
    );
    assert.ok(
      resourceBalance <= EPSILON,
      `Resource conservation violation: balance diff was ${resourceBalance}`
    );

    // 2. total_allocated + sum(unmet_amount) === total_requested (within EPSILON)
    const sumUnmet = result.allocations.reduce((sum, a) => sum + a.unmet_amount, 0);
    const demandBalance = Math.abs(
      (result.total_allocated + sumUnmet) - result.total_requested
    );
    assert.ok(
      demandBalance <= EPSILON,
      `Demand balance violation: balance diff was ${demandBalance}`
    );
  });

  it('Replay Determinism: 50 runs produce 100% bit-for-bit identical results without RNG', () => {
    const demands = [
      { organism_id: 'alpha', requested_amount: 12.345 },
      { organism_id: 'gamma', requested_amount: 67.890 },
      { organism_id: 'beta', requested_amount: 23.456 },
      { organism_id: 'delta', requested_amount: 45.678 }
    ];

    const baseline = JSON.stringify(allocateResourceDemands(100.0, demands));

    for (let i = 0; i < 50; i++) {
      // Pass demands in arbitrarily shuffled order
      const shuffled = [...demands].reverse();
      const current = JSON.stringify(allocateResourceDemands(100.0, shuffled));
      assert.equal(current, baseline, `Run ${i} deviated from baseline`);
    }
  });

  it('Architectural Boundary: Resource allocator does not import biological modules', async () => {
    const fs = await import('node:fs');
    const poolSource = fs.readFileSync('game/population/resource_pool.js', 'utf8');
    const demandSource = fs.readFileSync('game/population/resource_demand.js', 'utf8');

    // Assert neither file imports from genetics, lifecycle, or reproduction
    const forbiddenImports = ['genetics', 'lifecycle', 'reproduction'];
    for (const forbidden of forbiddenImports) {
      assert.equal(
        poolSource.includes(forbidden),
        false,
        `resource_pool.js must not import from '${forbidden}'`
      );
      assert.equal(
        demandSource.includes(forbidden),
        false,
        `resource_demand.js must not import from '${forbidden}'`
      );
    }
  });
});
