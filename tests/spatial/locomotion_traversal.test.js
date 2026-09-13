import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  SpatialWorld,
  createCrawlCapability,
  createBurrowCapability,
  createFlightCapability,
  calculateMovementCost,
  validateTraversal,
  planMovement,
  executeMovementTransaction,
  REASON_CODES,
  K_STEP,
  K_VERTICAL_COST,
  COST_UNIT
} from '../../game/spatial/index.js';

import { ResourcePool } from '../../game/population/resource_pool.js';
import { createOrganismState } from '../../game/lifecycle/organism_state.js';
import { loadSpeciesProfile } from '../../game/lifecycle/profile_loader.js';

describe('Locomotion & Movement Traversal Cost Runtime (TASK 08-C)', () => {

  // TC-LOCO-01: Valid same-z planar movement
  test('TC-LOCO-01: valid same-z planar movement', () => {
    const world = new SpatialWorld({ width: 20, height: 20, z_min: -1, z_max: 2 });
    world.registerEntity({ entity_id: 'org_01', position: { x: 5, y: 5, z: 0 }, facing: 'NORTH' });

    const crawlCap = createCrawlCapability();
    const request = planMovement({
      organism_id: 'org_01',
      from: { x: 5, y: 5, z: 0 },
      to: { x: 6, y: 5, z: 0 },
      locomotion_mode: 'CRAWL',
      capabilities: [crawlCap]
    });

    const result = validateTraversal(request, world);
    assert.equal(result.status, 'VALID');
    assert.equal(result.reason, REASON_CODES.NONE);
    assert.equal(result.target_facing, 'EAST');
    assert.equal(result.cost.grid_distance, 1);
    assert.equal(result.cost.base_cost, 10);
    assert.equal(result.cost.transition_cost, 0);
    assert.equal(result.cost.total_cost, 10);
    assert.equal(result.cost.unit, COST_UNIT);
  });

  // TC-LOCO-02: Invalid coordinate rejection
  test('TC-LOCO-02: invalid coordinate rejection (float, NaN, string)', () => {
    const world = new SpatialWorld({ width: 20, height: 20, z_min: -1, z_max: 2 });
    world.registerEntity({ entity_id: 'org_01', position: { x: 5, y: 5, z: 0 } });

    const crawlCap = createCrawlCapability();
    
    // Float coordinate
    const reqFloat = planMovement({
      organism_id: 'org_01',
      from: { x: 5, y: 5, z: 0 },
      to: { x: 5.5, y: 5, z: 0 },
      locomotion_mode: 'CRAWL',
      capabilities: [crawlCap]
    });
    const resFloat = validateTraversal(reqFloat, world);
    assert.equal(resFloat.status, 'INVALID');
    assert.equal(resFloat.reason, REASON_CODES.INVALID_COORDINATE);

    // NaN coordinate
    const reqNaN = planMovement({
      organism_id: 'org_01',
      from: { x: 5, y: 5, z: 0 },
      to: { x: 5, y: Number.NaN, z: 0 },
      locomotion_mode: 'CRAWL',
      capabilities: [crawlCap]
    });
    const resNaN = validateTraversal(reqNaN, world);
    assert.equal(resNaN.status, 'INVALID');
    assert.equal(resNaN.reason, REASON_CODES.INVALID_COORDINATE);
  });

  // TC-LOCO-03: Out-of-bounds destination
  test('TC-LOCO-03: out-of-bounds destination rejection', () => {
    const world = new SpatialWorld({ width: 20, height: 20, z_min: -1, z_max: 2 });
    world.registerEntity({ entity_id: 'org_edge', position: { x: 0, y: 0, z: 0 } });

    const crawlCap = createCrawlCapability();
    const reqOOB = planMovement({
      organism_id: 'org_edge',
      from: { x: 0, y: 0, z: 0 },
      to: { x: -1, y: 0, z: 0 }, // Out of bounds
      locomotion_mode: 'CRAWL',
      capabilities: [crawlCap]
    });

    const resOOB = validateTraversal(reqOOB, world);
    assert.equal(resOOB.status, 'INVALID');
    assert.equal(resOOB.reason, REASON_CODES.OUT_OF_BOUNDS);
  });

  // TC-LOCO-04: Dead organism rejection
  test('TC-LOCO-04: dead organism rejection (DEAD_ORGANISM)', () => {
    const world = new SpatialWorld({ width: 20, height: 20, z_min: -1, z_max: 2 });
    world.registerEntity({
      entity_id: 'org_dead',
      position: { x: 5, y: 5, z: 0 },
      metadata: { is_alive: false } // Retention flag
    });

    const crawlCap = createCrawlCapability();
    const req = planMovement({
      organism_id: 'org_dead',
      from: { x: 5, y: 5, z: 0 },
      to: { x: 6, y: 5, z: 0 },
      locomotion_mode: 'CRAWL',
      capabilities: [crawlCap]
    });

    const result = validateTraversal(req, world);
    assert.equal(result.status, 'INVALID');
    assert.equal(result.reason, REASON_CODES.DEAD_ORGANISM);

    // Dead entity remains queryable spatially (spatial retention)
    assert.equal(world.hasEntity('org_dead'), true);
    assert.deepEqual(world.getPosition('org_dead'), { x: 5, y: 5, z: 0 });
  });

  // TC-LOCO-05: Capability-required traversal
  test('TC-LOCO-05: capability-required traversal', () => {
    const world = new SpatialWorld({ width: 20, height: 20, z_min: -1, z_max: 2 });
    world.registerEntity({ entity_id: 'org_01', position: { x: 5, y: 5, z: 0 } });

    // Organism only has CRAWL, attempts FLIGHT
    const crawlCap = createCrawlCapability();
    const req = planMovement({
      organism_id: 'org_01',
      from: { x: 5, y: 5, z: 0 },
      to: { x: 5, y: 5, z: 1 },
      locomotion_mode: 'FLIGHT', // Not possessed
      capabilities: [crawlCap]
    });

    const result = validateTraversal(req, world);
    assert.equal(result.status, 'INVALID');
    assert.equal(result.reason, REASON_CODES.CAPABILITY_REQUIRED);
  });

  // TC-LOCO-06 & TC-LOCO-07: Vertical transition and capability compatibility
  test('TC-LOCO-06 & TC-LOCO-07: vertical transition validation and capability compatibility', () => {
    const world = new SpatialWorld({ width: 20, height: 20, z_min: -1, z_max: 2 });
    world.registerEntity({ entity_id: 'org_ground', position: { x: 5, y: 5, z: 0 } });

    const crawlCap = createCrawlCapability();
    const burrowCap = createBurrowCapability();
    const flightCap = createFlightCapability();

    // 1. CRAWL trying to move down into subterranean (z = -1) -> UNSUPPORTED_TRANSITION
    const reqCrawlDown = planMovement({
      organism_id: 'org_ground',
      from: { x: 5, y: 5, z: 0 },
      to: { x: 5, y: 5, z: -1 },
      locomotion_mode: 'CRAWL',
      capabilities: [crawlCap]
    });
    const resCrawlDown = validateTraversal(reqCrawlDown, world);
    assert.equal(resCrawlDown.status, 'INVALID');
    assert.equal(resCrawlDown.reason, REASON_CODES.UNSUPPORTED_TRANSITION);

    // 2. BURROW moving down into subterranean (z = -1) -> VALID
    const reqBurrowDown = planMovement({
      organism_id: 'org_ground',
      from: { x: 5, y: 5, z: 0 },
      to: { x: 5, y: 5, z: -1 },
      locomotion_mode: 'BURROW',
      capabilities: [burrowCap]
    });
    const resBurrowDown = validateTraversal(reqBurrowDown, world);
    assert.equal(resBurrowDown.status, 'VALID');
    assert.equal(resBurrowDown.reason, REASON_CODES.NONE);
    assert.equal(resBurrowDown.cost.transition_cost, K_VERTICAL_COST);

    // 3. FLIGHT moving up into arboreal (z = 1) -> VALID
    const reqFlightUp = planMovement({
      organism_id: 'org_ground',
      from: { x: 5, y: 5, z: 0 },
      to: { x: 5, y: 5, z: 1 },
      locomotion_mode: 'FLIGHT',
      capabilities: [flightCap]
    });
    const resFlightUp = validateTraversal(reqFlightUp, world);
    assert.equal(resFlightUp.status, 'VALID');
    assert.equal(resFlightUp.reason, REASON_CODES.NONE);
    assert.equal(resFlightUp.cost.transition_cost, K_VERTICAL_COST);
  });

  // TC-LOCO-08: Same-position behavior
  test('TC-LOCO-08: same-position behavior (SAME_POSITION)', () => {
    const world = new SpatialWorld({ width: 20, height: 20, z_min: -1, z_max: 2 });
    world.registerEntity({ entity_id: 'org_01', position: { x: 5, y: 5, z: 0 } });

    const crawlCap = createCrawlCapability();
    const req = planMovement({
      organism_id: 'org_01',
      from: { x: 5, y: 5, z: 0 },
      to: { x: 5, y: 5, z: 0 }, // Same position
      locomotion_mode: 'CRAWL',
      capabilities: [crawlCap]
    });

    const result = validateTraversal(req, world);
    assert.equal(result.status, 'INVALID');
    assert.equal(result.reason, REASON_CODES.SAME_POSITION);
  });

  // TC-LOCO-09 & TC-LOCO-10: Deterministic movement cost and non-negativity
  test('TC-LOCO-09 & TC-LOCO-10: deterministic movement cost and non-negativity', () => {
    const p1 = { x: 10, y: 10, z: 0 };
    const p2 = { x: 11, y: 11, z: 0 }; // Diagonal planar step: max(1, 1) = 1
    const costPlanar = calculateMovementCost({ from: p1, to: p2, isVerticalTransition: false });
    assert.equal(costPlanar.grid_distance, 1);
    assert.equal(costPlanar.base_cost, 10);
    assert.equal(costPlanar.transition_cost, 0);
    assert.equal(costPlanar.total_cost, 10);
    assert.ok(costPlanar.total_cost >= 0);

    // Vertical transition step: dz = 1 -> grid_distance = max(0, 0) + 1 * 3 = 3
    const p3 = { x: 10, y: 10, z: 1 };
    const costVertical = calculateMovementCost({ from: p1, to: p3, isVerticalTransition: true });
    assert.equal(costVertical.grid_distance, 3);
    assert.equal(costVertical.base_cost, 30);
    assert.equal(costVertical.transition_cost, 30);
    assert.equal(costVertical.total_cost, 60);
    assert.ok(costVertical.total_cost >= 0);
  });

  // TC-LOCO-11: Movement cost cannot modify biological energy
  test('TC-LOCO-11: movement cost cannot modify biological energy', () => {
    const profile = loadSpeciesProfile('data/species/xylotrupes_rhinoceros_proto.json');
    const mockGenome = {
      species_id: 'xylotrupes_rhinoceros_proto',
      loci: {
        LOCUS_BODY_SCALE: [0.5, 0.5],
        LOCUS_CHITIN_DENSITY: [0.5, 0.5],
        LOCUS_CEPHALIC_HORN: [0.5, 0.5],
        LOCUS_THORACIC_HORN: [0.5, 0.5],
        LOCUS_TARSAL_CLAW: [0.5, 0.5],
        LOCUS_METABOLIC_EFFICIENCY: [0.5, 0.5],
        LOCUS_CUTICLE_PIGMENT: [0.5, 0.5],
        LOCUS_ANTENNAL_CLUB: [0.5, 0.5]
      }
    };
    const org = createOrganismState({
      organismId: 'beetle_test',
      speciesProfile: profile,
      generation: 1,
      sex: 'MALE',
      genome: mockGenome,
      phenotype: {
        body_scale_index: 1.10,
        mass_index: 1.40,
        cuticle_hardness_index: 2.0,
        cephalic_horn_scale: 0.80,
        thoracic_horn_scale: 0.60,
        tarsal_grip_index: 1.65,
        metabolic_drain_index: 1.00,
        stamina_economy_modifier: 1.05,
        sensory_range_units: 37.5,
        cuticle_pigment_ratio: 0.50,
        developmental_realization_factor: 1.00
      },
      derivedStats: {
        max_hp: 210.0,
        clash_power: 81.25,
        armor_reduction: 0.25,
        crawl_speed: 13.15,
        max_stamina: 103.0,
        action_stamina_cost: 9.52,
        stamina_regen_rate: 7.10,
        perception_radius: 37.5,
        starvation_endurance_time: 140.0
      },
      simulationSeed: '0x024aa8a38b63e1b2'
    });

    const energyBefore = org.nutrition_state.current_stored_energy;

    // Calculate movement costs
    calculateMovementCost({ from: { x: 0, y: 0, z: 0 }, to: { x: 1, y: 1, z: 0 } });
    calculateMovementCost({ from: { x: 0, y: 0, z: 0 }, to: { x: 0, y: 0, z: 1 }, isVerticalTransition: true });

    // Biological energy must be 100% untouched
    assert.equal(org.nutrition_state.current_stored_energy, energyBefore);
  });

  // TC-LOCO-12: Movement cannot consume ResourcePool
  test('TC-LOCO-12: movement cannot consume ResourcePool', () => {
    const pool = new ResourcePool(500);
    const foodBefore = pool.quantity;

    calculateMovementCost({ from: { x: 0, y: 0, z: 0 }, to: { x: 1, y: 0, z: 0 } });
    assert.equal(pool.quantity, foodBefore);
  });

  // TC-LOCO-13: Validation purity
  test('TC-LOCO-13: validation purity (validateTraversal causes zero mutations)', () => {
    const world = new SpatialWorld({ width: 20, height: 20, z_min: -1, z_max: 2 });
    world.registerEntity({ entity_id: 'org_01', position: { x: 5, y: 5, z: 0 } });

    const snapshotBefore = JSON.stringify(world.serialize());

    const crawlCap = createCrawlCapability();
    const req = planMovement({
      organism_id: 'org_01',
      from: { x: 5, y: 5, z: 0 },
      to: { x: 6, y: 5, z: 0 },
      locomotion_mode: 'CRAWL',
      capabilities: [crawlCap]
    });

    validateTraversal(req, world);

    const snapshotAfter = JSON.stringify(world.serialize());
    assert.equal(snapshotAfter, snapshotBefore, 'Validation MUST be pure and read-only');
  });

  // TC-LOCO-14: Deterministic serialization
  test('TC-LOCO-14: deterministic serialization', () => {
    const crawlCap = createCrawlCapability();
    const req = planMovement({
      organism_id: 'org_01',
      from: { x: 5, y: 5, z: 0 },
      to: { x: 6, y: 5, z: 0 },
      locomotion_mode: 'CRAWL',
      capabilities: [crawlCap]
    });

    const world = new SpatialWorld({ width: 20, height: 20, z_min: -1, z_max: 2 });
    world.registerEntity({ entity_id: 'org_01', position: { x: 5, y: 5, z: 0 } });

    const res1 = validateTraversal(req, world);
    const res2 = validateTraversal(req, world);

    assert.equal(JSON.stringify(res1), JSON.stringify(res2));
  });

  // TC-LOCO-15: No pathfinding dependency (rejects multi-cell jump)
  test('TC-LOCO-15: no pathfinding dependency (rejects multi-cell jump in single step)', () => {
    const world = new SpatialWorld({ width: 20, height: 20, z_min: -1, z_max: 2 });
    world.registerEntity({ entity_id: 'org_01', position: { x: 5, y: 5, z: 0 } });

    const crawlCap = createCrawlCapability();
    const reqMultiJump = planMovement({
      organism_id: 'org_01',
      from: { x: 5, y: 5, z: 0 },
      to: { x: 8, y: 5, z: 0 }, // dx = 3 > 1
      locomotion_mode: 'CRAWL',
      capabilities: [crawlCap]
    });

    const res = validateTraversal(reqMultiJump, world);
    assert.equal(res.status, 'INVALID');
    assert.equal(res.reason, REASON_CODES.UNSUPPORTED_TRANSITION);
  });

  // TC-LOCO-16: Authority boundary & Atomic Movement Commit
  test('TC-LOCO-16: authority boundary & atomic movement commit', () => {
    const world = new SpatialWorld({ width: 20, height: 20, z_min: -1, z_max: 2 });
    world.registerEntity({ entity_id: 'org_01', position: { x: 5, y: 5, z: 0 }, facing: 'NORTH' });

    const crawlCap = createCrawlCapability();
    const req = planMovement({
      organism_id: 'org_01',
      from: { x: 5, y: 5, z: 0 },
      to: { x: 6, y: 5, z: 0 },
      locomotion_mode: 'CRAWL',
      capabilities: [crawlCap]
    });

    const outcome = executeMovementTransaction(req, world);
    assert.equal(outcome.success, true);
    assert.deepEqual(outcome.position, { x: 6, y: 5, z: 0 });
    assert.equal(outcome.facing, 'EAST');

    // SpatialWorld authoritative position is updated
    assert.deepEqual(world.getPosition('org_01'), { x: 6, y: 5, z: 0 });
    assert.deepEqual(world.getEntitiesAtCell({ x: 5, y: 5, z: 0 }), []);
    assert.deepEqual(world.getEntitiesAtCell({ x: 6, y: 5, z: 0 }), ['org_01']);

    // Failed movement transaction: zero mutation
    const reqInvalid = planMovement({
      organism_id: 'org_01',
      from: { x: 6, y: 5, z: 0 },
      to: { x: 6, y: 5, z: -1 }, // CRAWL cannot enter z=-1
      locomotion_mode: 'CRAWL',
      capabilities: [crawlCap]
    });

    const failOutcome = executeMovementTransaction(reqInvalid, world);
    assert.equal(failOutcome.success, false);
    assert.equal(failOutcome.validation.reason, REASON_CODES.UNSUPPORTED_TRANSITION);

    // Position remains at (6, 5, 0)
    assert.deepEqual(world.getPosition('org_01'), { x: 6, y: 5, z: 0 });
    assert.deepEqual(world.getEntitiesAtCell({ x: 6, y: 5, z: 0 }), ['org_01']);
  });

  // TC-LOCO-17: 100-replay determinism
  test('TC-LOCO-17: 100-replay determinism', () => {
    function runReplay() {
      const world = new SpatialWorld({ width: 20, height: 20, z_min: -1, z_max: 2 });
      world.registerEntity({ entity_id: 'org_01', position: { x: 2, y: 2, z: 0 } });
      const crawlCap = createCrawlCapability();
      const req = planMovement({
        organism_id: 'org_01',
        from: { x: 2, y: 2, z: 0 },
        to: { x: 3, y: 3, z: 0 },
        locomotion_mode: 'CRAWL',
        capabilities: [crawlCap]
      });
      const outcome = executeMovementTransaction(req, world);
      return JSON.stringify({ outcome, snapshot: world.serialize() });
    }

    const baseline = runReplay();
    for (let i = 0; i < 100; i++) {
      assert.equal(runReplay(), baseline, `Replay diverged at iteration ${i}`);
    }
  });

  // Architectural: SpatialIndex consistency after movement
  test('Architectural: SpatialIndex rebuild consistency after locomotion', () => {
    const world = new SpatialWorld({ width: 20, height: 20, z_min: -1, z_max: 2 });
    world.registerEntity({ entity_id: 'e1', position: { x: 5, y: 5, z: 0 } });
    world.registerEntity({ entity_id: 'e2', position: { x: 5, y: 5, z: 0 } });

    const crawlCap = createCrawlCapability();
    const req = planMovement({
      organism_id: 'e1',
      from: { x: 5, y: 5, z: 0 },
      to: { x: 6, y: 5, z: 0 },
      locomotion_mode: 'CRAWL',
      capabilities: [crawlCap]
    });

    executeMovementTransaction(req, world);

    // Verify derived index matches
    assert.deepEqual(world.getEntitiesAtCell({ x: 5, y: 5, z: 0 }), ['e2']);
    assert.deepEqual(world.getEntitiesAtCell({ x: 6, y: 5, z: 0 }), ['e1']);

    // Rebuild index to prove zero divergence
    world.rebuildIndex();
    assert.deepEqual(world.getEntitiesAtCell({ x: 5, y: 5, z: 0 }), ['e2']);
    assert.deepEqual(world.getEntitiesAtCell({ x: 6, y: 5, z: 0 }), ['e1']);
  });
});
