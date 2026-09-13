/**
 * LinhSinhVN — Deterministic Shelter Runtime Test Suite (TASK 08-D3)
 *
 * Verifies canonical occupancy, atomic transactions (ENTER/EXIT),
 * capacity constraints, derived reference synchronization, cold-start reconstruction,
 * micro-climate integration context, and absolute domain isolation.
 */

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  ShelterDefinition,
  ShelterType,
  EntryLocomotionRequirement,
  ShelterOccupancy,
  ShelterRegistry,
  executeEnterShelter,
  executeExitShelter,
  ShelterTransactionResultStatus
} from '../../game/spatial/shelter/index.js';

import { SpatialGridBoundary } from '../../game/spatial/spatial_grid.js';
import { SpatialEntityRegistry } from '../../game/spatial/spatial_entity_registry.js';
import { resolveMicroClimate } from '../../game/spatial/micro_climate/index.js';
import { HabitatRegistry } from '../../game/spatial/habitat/index.js';

const boundary = new SpatialGridBoundary({ width: 100, height: 100, z_min: -1, z_max: 2 });

function createMockSpatialWorld() {
  return new SpatialEntityRegistry(boundary);
}

function createMockPopulationRegistry() {
  const organisms = new Map();
  return {
    organisms,
    register(id, state = 'ADULT', isAlive = true) {
      organisms.set(id, { id, lifecycle_state: state, is_alive: isAlive });
    },
    getOrganism(id) {
      return organisms.get(id) || null;
    }
  };
}

describe('Shelter Runtime (TASK 08-D3)', () => {
  // SHELTER-RUNTIME-01: valid ShelterDefinition
  test('SHELTER-RUNTIME-01: valid ShelterDefinition instantiates with frozen properties', () => {
    const shelter = new ShelterDefinition({
      shelter_id: 'tree_hollow_01',
      shelter_type: ShelterType.TREE_CAVITY,
      position: { x: 10, y: 15, z: 1 },
      capacity: 4,
      security_factor: 0.85,
      entry_locomotion_requirement: EntryLocomotionRequirement.CRAWL,
      micro_climate_offsets: { temperature_delta: -2.5, humidity_delta: 0.15 }
    });

    assert.equal(shelter.shelter_id, 'tree_hollow_01');
    assert.equal(shelter.shelter_type, 'TREE_CAVITY');
    assert.deepEqual(shelter.position, { x: 10, y: 15, z: 1 });
    assert.equal(shelter.capacity, 4);
    assert.equal(shelter.security_factor, 0.85);
    assert.equal(shelter.entry_locomotion_requirement, 'CRAWL');
    assert.deepEqual(shelter.micro_climate_offsets, { temperature_delta: -2.5, humidity_delta: 0.15 });
    assert.ok(Object.isFrozen(shelter));
    assert.ok(Object.isFrozen(shelter.position));
    assert.ok(Object.isFrozen(shelter.micro_climate_offsets));
  });

  // SHELTER-RUNTIME-02: invalid ShelterDefinition rejection
  test('SHELTER-RUNTIME-02: invalid ShelterDefinition parameters throw explicit TypeError', () => {
    // Bad id
    assert.throws(() => new ShelterDefinition({
      shelter_id: 'Invalid ID!',
      shelter_type: ShelterType.ROCK_CREVICE,
      position: { x: 0, y: 0, z: 0 },
      capacity: 2,
      security_factor: 0.5
    }), TypeError);

    // Bad type
    assert.throws(() => new ShelterDefinition({
      shelter_id: 'shelter_1',
      shelter_type: 'PALACE',
      position: { x: 0, y: 0, z: 0 },
      capacity: 2,
      security_factor: 0.5
    }), TypeError);

    // Capacity < 1
    assert.throws(() => new ShelterDefinition({
      shelter_id: 'shelter_1',
      shelter_type: ShelterType.ROCK_CREVICE,
      position: { x: 0, y: 0, z: 0 },
      capacity: 0,
      security_factor: 0.5
    }), TypeError);

    // Security factor out of bounds
    assert.throws(() => new ShelterDefinition({
      shelter_id: 'shelter_1',
      shelter_type: ShelterType.ROCK_CREVICE,
      position: { x: 0, y: 0, z: 0 },
      capacity: 2,
      security_factor: 1.5
    }), TypeError);
  });

  // SHELTER-RUNTIME-03: unique shelter_id
  test('SHELTER-RUNTIME-03: unique shelter_id registered successfully in ShelterRegistry', () => {
    const registry = new ShelterRegistry({ boundary });
    const def = registry.registerShelter({
      shelter_id: 'burrow_alpha',
      shelter_type: ShelterType.BURROW_NEST,
      position: { x: 5, y: 5, z: -1 },
      capacity: 3,
      security_factor: 0.9
    });

    assert.equal(registry.getShelter('burrow_alpha'), def);
    assert.equal(registry.getAllShelters().length, 1);
  });

  // SHELTER-RUNTIME-04: duplicate shelter_id rejection
  test('SHELTER-RUNTIME-04: duplicate shelter_id rejection prevents collision', () => {
    const registry = new ShelterRegistry({ boundary });
    registry.registerShelter({
      shelter_id: 'same_id',
      shelter_type: ShelterType.LEAF_FOLD,
      position: { x: 2, y: 2, z: 0 },
      capacity: 1,
      security_factor: 0.3
    });

    assert.throws(() => {
      registry.registerShelter({
        shelter_id: 'same_id',
        shelter_type: ShelterType.LEAF_FOLD,
        position: { x: 3, y: 3, z: 0 },
        capacity: 1,
        security_factor: 0.3
      });
    }, /Duplicate shelter_id/);
  });

  // SHELTER-RUNTIME-05: capacity validation
  test('SHELTER-RUNTIME-05: capacity validation strictly enforced in ShelterOccupancy', () => {
    const occ = new ShelterOccupancy({ shelter_id: 'test_occ', capacity: 2 });
    assert.equal(occ.canAcceptOccupant(), true);
    occ.addOccupant('org_1');
    assert.equal(occ.canAcceptOccupant(), true);
    occ.addOccupant('org_2');
    assert.equal(occ.canAcceptOccupant(), false);

    assert.throws(() => {
      occ.addOccupant('org_3');
    }, /capacity full/);
  });

  // SHELTER-RUNTIME-06: current occupancy derived from occupant_ids.length
  test('SHELTER-RUNTIME-06: current_occupancy is strictly derived from occupant_ids.length', () => {
    const occ = new ShelterOccupancy({ shelter_id: 'test_occ', capacity: 5 });
    assert.equal(occ.current_occupancy, 0);
    assert.equal(occ.current_occupancy, occ.occupant_ids.length);

    occ.addOccupant('org_b');
    assert.equal(occ.current_occupancy, 1);
    assert.equal(occ.current_occupancy, occ.occupant_ids.length);

    occ.addOccupant('org_a');
    assert.equal(occ.current_occupancy, 2);
    assert.equal(occ.current_occupancy, occ.occupant_ids.length);
    // Deterministic sorted order: org_a before org_b
    assert.deepEqual(occ.occupant_ids, ['org_a', 'org_b']);
  });

  // SHELTER-RUNTIME-07: ENTER_SHELTER success
  test('SHELTER-RUNTIME-07: ENTER_SHELTER transaction succeeds when all conditions valid', () => {
    const shelterRegistry = new ShelterRegistry({ boundary });
    const spatialWorld = createMockSpatialWorld();
    const popRegistry = createMockPopulationRegistry();

    shelterRegistry.registerShelter({
      shelter_id: 'rock_cave',
      shelter_type: ShelterType.ROCK_CREVICE,
      position: { x: 20, y: 20, z: 0 },
      capacity: 2,
      security_factor: 0.75
    });

    spatialWorld.register({ entity_id: 'ant_1', position: { x: 20, y: 20, z: 0 } });
    popRegistry.register('ant_1', 'ADULT', true);

    const res = shelterRegistry.enterShelter({
      spatialWorld,
      populationRegistry: popRegistry,
      organismId: 'ant_1',
      shelterId: 'rock_cave'
    });

    assert.equal(res.success, true);
    assert.equal(res.status, ShelterTransactionResultStatus.SUCCESS);
    assert.deepEqual(shelterRegistry.getOccupants('rock_cave'), ['ant_1']);
    assert.equal(shelterRegistry.getShelteredIn('ant_1'), 'rock_cave');
  });

  // SHELTER-RUNTIME-08: ENTER_SHELTER rejects dead organism
  test('SHELTER-RUNTIME-08: ENTER_SHELTER rejects dead organism', () => {
    const shelterRegistry = new ShelterRegistry({ boundary });
    const spatialWorld = createMockSpatialWorld();
    const popRegistry = createMockPopulationRegistry();

    shelterRegistry.registerShelter({
      shelter_id: 'hollow_1',
      shelter_type: ShelterType.TREE_CAVITY,
      position: { x: 10, y: 10, z: 1 },
      capacity: 2,
      security_factor: 0.8
    });

    spatialWorld.register({ entity_id: 'corpse_1', position: { x: 10, y: 10, z: 1 } });
    popRegistry.register('corpse_1', 'DEAD', false);

    const res = shelterRegistry.enterShelter({
      spatialWorld,
      populationRegistry: popRegistry,
      organismId: 'corpse_1',
      shelterId: 'hollow_1'
    });

    assert.equal(res.success, false);
    assert.equal(res.status, ShelterTransactionResultStatus.REJECTED_DEAD_ORGANISM);
    assert.equal(shelterRegistry.getOccupants('hollow_1').length, 0);
  });

  // SHELTER-RUNTIME-09: ENTER_SHELTER rejects missing organism
  test('SHELTER-RUNTIME-09: ENTER_SHELTER rejects organism not registered in spatial world', () => {
    const shelterRegistry = new ShelterRegistry({ boundary });
    const spatialWorld = createMockSpatialWorld();

    shelterRegistry.registerShelter({
      shelter_id: 'hollow_1',
      shelter_type: ShelterType.TREE_CAVITY,
      position: { x: 10, y: 10, z: 1 },
      capacity: 2,
      security_factor: 0.8
    });

    const res = shelterRegistry.enterShelter({
      spatialWorld,
      organismId: 'ghost_ant',
      shelterId: 'hollow_1'
    });

    assert.equal(res.success, false);
    assert.equal(res.status, ShelterTransactionResultStatus.REJECTED_MISSING_ORGANISM);
  });

  // SHELTER-RUNTIME-10: ENTER_SHELTER rejects missing shelter
  test('SHELTER-RUNTIME-10: ENTER_SHELTER rejects missing shelter', () => {
    const shelterRegistry = new ShelterRegistry({ boundary });
    const spatialWorld = createMockSpatialWorld();
    spatialWorld.register({ entity_id: 'ant_1', position: { x: 0, y: 0, z: 0 } });

    const res = shelterRegistry.enterShelter({
      spatialWorld,
      organismId: 'ant_1',
      shelterId: 'non_existent_shelter'
    });

    assert.equal(res.success, false);
    assert.equal(res.status, ShelterTransactionResultStatus.REJECTED_MISSING_SHELTER);
  });

  // SHELTER-RUNTIME-11: ENTER_SHELTER rejects capacity full
  test('SHELTER-RUNTIME-11: ENTER_SHELTER rejects when capacity is full', () => {
    const shelterRegistry = new ShelterRegistry({ boundary });
    const spatialWorld = createMockSpatialWorld();

    shelterRegistry.registerShelter({
      shelter_id: 'solo_leaf',
      shelter_type: ShelterType.LEAF_FOLD,
      position: { x: 12, y: 12, z: 0 },
      capacity: 1,
      security_factor: 0.5
    });

    spatialWorld.register({ entity_id: 'ant_1', position: { x: 12, y: 12, z: 0 } });
    spatialWorld.register({ entity_id: 'ant_2', position: { x: 12, y: 12, z: 0 } });

    const res1 = shelterRegistry.enterShelter({ spatialWorld, organismId: 'ant_1', shelterId: 'solo_leaf' });
    assert.equal(res1.success, true);

    const res2 = shelterRegistry.enterShelter({ spatialWorld, organismId: 'ant_2', shelterId: 'solo_leaf' });
    assert.equal(res2.success, false);
    assert.equal(res2.status, ShelterTransactionResultStatus.REJECTED_CAPACITY_FULL);
    assert.deepEqual(shelterRegistry.getOccupants('solo_leaf'), ['ant_1']);
  });

  // SHELTER-RUNTIME-12: ENTER_SHELTER rejects organism already sheltered
  test('SHELTER-RUNTIME-12: ENTER_SHELTER rejects organism already in another shelter', () => {
    const shelterRegistry = new ShelterRegistry({ boundary });
    const spatialWorld = createMockSpatialWorld();

    shelterRegistry.registerShelter({
      shelter_id: 'shelter_a',
      shelter_type: ShelterType.TREE_CAVITY,
      position: { x: 15, y: 15, z: 0 },
      capacity: 2,
      security_factor: 0.8
    });
    shelterRegistry.registerShelter({
      shelter_id: 'shelter_b',
      shelter_type: ShelterType.TREE_CAVITY,
      position: { x: 15, y: 15, z: 0 },
      capacity: 2,
      security_factor: 0.8
    });

    spatialWorld.register({ entity_id: 'nomad_1', position: { x: 15, y: 15, z: 0 } });

    const res1 = shelterRegistry.enterShelter({ spatialWorld, organismId: 'nomad_1', shelterId: 'shelter_a' });
    assert.equal(res1.success, true);

    const res2 = shelterRegistry.enterShelter({ spatialWorld, organismId: 'nomad_1', shelterId: 'shelter_b' });
    assert.equal(res2.success, false);
    assert.equal(res2.status, ShelterTransactionResultStatus.REJECTED_ALREADY_SHELTERED);
    assert.equal(shelterRegistry.getShelteredIn('nomad_1'), 'shelter_a');
  });

  // SHELTER-RUNTIME-13: ENTER_SHELTER does not mutate coordinate
  test('SHELTER-RUNTIME-13: ENTER_SHELTER requires organism already at coordinate and never mutates coordinate', () => {
    const shelterRegistry = new ShelterRegistry({ boundary });
    const spatialWorld = createMockSpatialWorld();

    shelterRegistry.registerShelter({
      shelter_id: 'burrow_far',
      shelter_type: ShelterType.BURROW_NEST,
      position: { x: 40, y: 40, z: -1 },
      capacity: 2,
      security_factor: 0.9
    });

    // Organism at different coordinate
    spatialWorld.register({ entity_id: 'walker', position: { x: 39, y: 40, z: -1 } });

    const res = shelterRegistry.enterShelter({ spatialWorld, organismId: 'walker', shelterId: 'burrow_far' });
    assert.equal(res.success, false);
    assert.equal(res.status, ShelterTransactionResultStatus.REJECTED_NOT_AT_SHELTER_POSITION);

    // Coordinate strictly unmutated
    const entity = spatialWorld.getEntity('walker');
    assert.deepEqual(entity.position, { x: 39, y: 40, z: -1 });
  });

  // SHELTER-RUNTIME-14: ENTER_SHELTER atomic failure
  test('SHELTER-RUNTIME-14: failed ENTER_SHELTER transaction produces zero state mutation', () => {
    const shelterRegistry = new ShelterRegistry({ boundary });
    const spatialWorld = createMockSpatialWorld();

    shelterRegistry.registerShelter({
      shelter_id: 'crevice',
      shelter_type: ShelterType.ROCK_CREVICE,
      position: { x: 30, y: 30, z: 0 },
      capacity: 1,
      security_factor: 0.85,
      entry_locomotion_requirement: EntryLocomotionRequirement.BURROW
    });

    spatialWorld.register({ entity_id: 'crawler', position: { x: 30, y: 30, z: 0 } });

    // Fails locomotion requirement (crawler lacks BURROW)
    const res = shelterRegistry.enterShelter({
      spatialWorld,
      organismId: 'crawler',
      shelterId: 'crevice',
      locomotionCapabilities: ['CRAWL']
    });

    assert.equal(res.success, false);
    assert.equal(res.status, ShelterTransactionResultStatus.REJECTED_LOCOMOTION_REQUIREMENT);

    assert.equal(shelterRegistry.getOccupants('crevice').length, 0);
    assert.equal(shelterRegistry.getShelteredIn('crawler'), null);
  });

  // SHELTER-RUNTIME-15: EXIT_SHELTER success
  test('SHELTER-RUNTIME-15: EXIT_SHELTER cleanly removes occupant and synchronizes sheltered_in to null', () => {
    const shelterRegistry = new ShelterRegistry({ boundary });
    const spatialWorld = createMockSpatialWorld();

    shelterRegistry.registerShelter({
      shelter_id: 'log',
      shelter_type: ShelterType.UNDER_BARK,
      position: { x: 10, y: 10, z: 0 },
      capacity: 2,
      security_factor: 0.6
    });

    spatialWorld.register({ entity_id: 'beetle', position: { x: 10, y: 10, z: 0 } });
    shelterRegistry.enterShelter({ spatialWorld, organismId: 'beetle', shelterId: 'log' });

    assert.equal(shelterRegistry.getShelteredIn('beetle'), 'log');

    const exitRes = shelterRegistry.exitShelter({ organismId: 'beetle' });
    assert.equal(exitRes.success, true);
    assert.equal(exitRes.status, ShelterTransactionResultStatus.SUCCESS);

    assert.equal(shelterRegistry.getShelteredIn('beetle'), null);
    assert.deepEqual(shelterRegistry.getOccupants('log'), []);
  });

  // SHELTER-RUNTIME-16: EXIT_SHELTER rejects non-occupant
  test('SHELTER-RUNTIME-16: EXIT_SHELTER rejects organism that is not an occupant', () => {
    const shelterRegistry = new ShelterRegistry({ boundary });
    shelterRegistry.registerShelter({
      shelter_id: 'log',
      shelter_type: ShelterType.UNDER_BARK,
      position: { x: 10, y: 10, z: 0 },
      capacity: 2,
      security_factor: 0.6
    });

    const res = shelterRegistry.exitShelter({ organismId: 'stranger_ant' });
    assert.equal(res.success, false);
    assert.equal(res.status, ShelterTransactionResultStatus.REJECTED_NOT_AN_OCCUPANT);
  });

  // SHELTER-RUNTIME-17: EXIT_SHELTER atomic failure
  test('SHELTER-RUNTIME-17: failed EXIT_SHELTER produces zero state mutation', () => {
    const shelterRegistry = new ShelterRegistry({ boundary });
    shelterRegistry.registerShelter({
      shelter_id: 'log',
      shelter_type: ShelterType.UNDER_BARK,
      position: { x: 10, y: 10, z: 0 },
      capacity: 2,
      security_factor: 0.6
    });

    const res = shelterRegistry.exitShelter({ organismId: 'stranger', shelterId: 'log' });
    assert.equal(res.success, false);
    assert.equal(shelterRegistry.getOccupancy('log').current_occupancy, 0);
  });

  // SHELTER-RUNTIME-18: duplicate occupant ID rejected
  test('SHELTER-RUNTIME-18: duplicate occupant ID rejected inside ShelterOccupancy', () => {
    assert.throws(() => {
      new ShelterOccupancy({
        shelter_id: 'bad_occ',
        capacity: 4,
        occupant_ids: ['ant_1', 'ant_1']
      });
    }, /Duplicate occupant ID/);
  });

  // SHELTER-RUNTIME-19: organism cannot occupy two shelters
  test('SHELTER-RUNTIME-19: organism cannot occupy two shelters simultaneously', () => {
    const shelterRegistry = new ShelterRegistry({ boundary });
    const spatialWorld = createMockSpatialWorld();

    shelterRegistry.registerShelter({
      shelter_id: 's1',
      shelter_type: ShelterType.CUSTOM,
      position: { x: 0, y: 0, z: 0 },
      capacity: 2,
      security_factor: 0.5
    });
    shelterRegistry.registerShelter({
      shelter_id: 's2',
      shelter_type: ShelterType.CUSTOM,
      position: { x: 0, y: 0, z: 0 },
      capacity: 2,
      security_factor: 0.5
    });

    spatialWorld.register({ entity_id: 'dual_ant', position: { x: 0, y: 0, z: 0 } });

    shelterRegistry.enterShelter({ spatialWorld, organismId: 'dual_ant', shelterId: 's1' });
    const res = shelterRegistry.enterShelter({ spatialWorld, organismId: 'dual_ant', shelterId: 's2' });

    assert.equal(res.success, false);
    assert.equal(res.status, ShelterTransactionResultStatus.REJECTED_ALREADY_SHELTERED);
  });

  // SHELTER-RUNTIME-20: sheltered_in derived from canonical occupancy
  test('SHELTER-RUNTIME-20: sheltered_in is purely derived and matches occupant_ids membership', () => {
    const shelterRegistry = new ShelterRegistry({ boundary });
    const spatialWorld = createMockSpatialWorld();

    shelterRegistry.registerShelter({
      shelter_id: 's_root',
      shelter_type: ShelterType.TREE_CAVITY,
      position: { x: 5, y: 5, z: 0 },
      capacity: 3,
      security_factor: 0.9
    });

    spatialWorld.register({ entity_id: 'ant_x', position: { x: 5, y: 5, z: 0 } });

    assert.equal(shelterRegistry.getShelteredIn('ant_x'), null);
    shelterRegistry.enterShelter({ spatialWorld, organismId: 'ant_x', shelterId: 's_root' });
    assert.equal(shelterRegistry.getShelteredIn('ant_x'), 's_root');
    assert.ok(shelterRegistry.getOccupants('s_root').includes('ant_x'));

    shelterRegistry.exitShelter({ organismId: 'ant_x' });
    assert.equal(shelterRegistry.getShelteredIn('ant_x'), null);
    assert.ok(!shelterRegistry.getOccupants('s_root').includes('ant_x'));
  });

  // SHELTER-RUNTIME-21: cold-start reconstructs sheltered_in from occupant_ids
  test('SHELTER-RUNTIME-21: cold-start deserialization 100% reconstructs sheltered_in from occupant_ids', () => {
    const snapshot = {
      shelters: [
        {
          shelter_id: 'nest_cold',
          shelter_type: 'BURROW_NEST',
          position: { x: 10, y: 10, z: -1 },
          capacity: 3,
          security_factor: 0.88,
          entry_locomotion_requirement: null,
          micro_climate_offsets: { temperature_delta: 1.0, humidity_delta: 0.2 },
          metadata: {}
        }
      ],
      occupancies: [
        {
          shelter_id: 'nest_cold',
          capacity: 3,
          current_occupancy: 2,
          occupant_ids: ['ant_10', 'ant_20']
        }
      ]
    };

    const restored = ShelterRegistry.deserialize(snapshot, { boundary });
    assert.equal(restored.getShelteredIn('ant_10'), 'nest_cold');
    assert.equal(restored.getShelteredIn('ant_20'), 'nest_cold');
    assert.equal(restored.getShelteredIn('ant_30'), null);
    assert.deepEqual(restored.getOccupants('nest_cold'), ['ant_10', 'ant_20']);
  });

  // SHELTER-RUNTIME-22: inconsistent snapshot rejected
  test('SHELTER-RUNTIME-22: inconsistent snapshot with duplicate occupant across shelters fails fast', () => {
    const badSnapshot = {
      shelters: [
        { shelter_id: 's_a', shelter_type: 'CUSTOM', position: { x: 0, y: 0, z: 0 }, capacity: 2, security_factor: 0.5 },
        { shelter_id: 's_b', shelter_type: 'CUSTOM', position: { x: 1, y: 1, z: 0 }, capacity: 2, security_factor: 0.5 }
      ],
      occupancies: [
        { shelter_id: 's_a', capacity: 2, current_occupancy: 1, occupant_ids: ['ant_shared'] },
        { shelter_id: 's_b', capacity: 2, current_occupancy: 1, occupant_ids: ['ant_shared'] }
      ]
    };

    assert.throws(() => {
      ShelterRegistry.deserialize(badSnapshot, { boundary });
    }, /multiple shelters/);
  });

  // SHELTER-RUNTIME-23: deterministic occupancy serialization
  test('SHELTER-RUNTIME-23: serialize outputs canonical deterministic sorted structure', () => {
    const registry = new ShelterRegistry({ boundary });
    registry.registerShelter({
      shelter_id: 'zeta',
      shelter_type: ShelterType.TREE_CAVITY,
      position: { x: 2, y: 2, z: 0 },
      capacity: 3,
      security_factor: 0.8
    });
    registry.registerShelter({
      shelter_id: 'alpha',
      shelter_type: ShelterType.TREE_CAVITY,
      position: { x: 1, y: 1, z: 0 },
      capacity: 3,
      security_factor: 0.8
    });

    const spatialWorld = createMockSpatialWorld();
    spatialWorld.register({ entity_id: 'z_ant', position: { x: 1, y: 1, z: 0 } });
    spatialWorld.register({ entity_id: 'a_ant', position: { x: 1, y: 1, z: 0 } });

    // Enter in reverse order
    registry.enterShelter({ spatialWorld, organismId: 'z_ant', shelterId: 'alpha' });
    registry.enterShelter({ spatialWorld, organismId: 'a_ant', shelterId: 'alpha' });

    const snap = registry.serialize();

    // Shelters sorted by shelter_id ASC
    assert.equal(snap.shelters[0].shelter_id, 'alpha');
    assert.equal(snap.shelters[1].shelter_id, 'zeta');

    // Occupant IDs sorted ASC regardless of insertion order
    assert.deepEqual(snap.occupancies[0].occupant_ids, ['a_ant', 'z_ant']);
  });

  // SHELTER-RUNTIME-24: deterministic replay
  test('SHELTER-RUNTIME-24: 100 replay runs produce bit-for-bit identical serialization', () => {
    function run() {
      const reg = new ShelterRegistry({ boundary });
      reg.registerShelter({
        shelter_id: 'burrow_rep',
        shelter_type: ShelterType.BURROW_NEST,
        position: { x: 10, y: 10, z: -1 },
        capacity: 5,
        security_factor: 0.95,
        micro_climate_offsets: { temperature_delta: -1.5, humidity_delta: 0.2 }
      });
      const sw = createMockSpatialWorld();
      for (const id of ['org_3', 'org_1', 'org_2']) {
        sw.register({ entity_id: id, position: { x: 10, y: 10, z: -1 } });
        reg.enterShelter({ spatialWorld: sw, organismId: id, shelterId: 'burrow_rep' });
      }
      return JSON.stringify(reg.serialize());
    }

    const baseline = run();
    for (let i = 0; i < 100; i++) {
      assert.equal(run(), baseline);
    }
  });

  // SHELTER-RUNTIME-25: Micro-climate shelter context compatibility
  test('SHELTER-RUNTIME-25: getShelterContext feeds cleanly into frozen resolveMicroClimate', () => {
    const shelterRegistry = new ShelterRegistry({ boundary });
    const habitatRegistry = new HabitatRegistry({ boundary: { min_x: 0, max_x: 100, min_y: 0, max_y: 100, min_z: -1, max_z: 2 } });

    shelterRegistry.registerShelter({
      shelter_id: 'cozy_nest',
      shelter_type: ShelterType.BURROW_NEST,
      position: { x: 15, y: 15, z: 0 },
      capacity: 2,
      security_factor: 0.92,
      micro_climate_offsets: { temperature_delta: -3.0, humidity_delta: 0.25 }
    });

    const context = shelterRegistry.getShelterContext('cozy_nest');
    assert.ok(context);
    assert.equal(context.is_sheltered, true);
    assert.equal(context.shelter_id, 'cozy_nest');
    assert.equal(context.security_factor, 0.92);
    assert.equal(context.temperature_delta, -3.0);
    assert.equal(context.humidity_delta, 0.25);

    // Call frozen 08-D2 micro_climate_resolver
    const microClimate = resolveMicroClimate({
      coordinate: { x: 15, y: 15, z: 0 },
      environmentState: { temperature: 30.0, humidity: 0.4 },
      habitatRegistry,
      shelterContext: context
    });

    // 30 - 3.0 (from shelter) = 27.0
    assert.equal(microClimate.temperature, 27.0);
    // 0.4 + 0.25 (from shelter) = 0.65
    assert.equal(microClimate.humidity, 0.65);
    // Effective security factor matches shelter security factor
    assert.equal(microClimate.effective_security_factor, 0.92);
    assert.equal(microClimate.is_sheltered, true);
    assert.equal(microClimate.shelter_id, 'cozy_nest');
  });

  // SHELTER-RUNTIME-26: no Micro-climate biological calculation duplicated
  test('SHELTER-RUNTIME-26: Shelter modules do not compute effective_temperature or effective_security', async () => {
    const fs = await import('node:fs');
    const files = [
      'D:/LinhSinhVN/game/spatial/shelter/shelter_definition.js',
      'D:/LinhSinhVN/game/spatial/shelter/shelter_occupancy.js',
      'D:/LinhSinhVN/game/spatial/shelter/shelter_transaction.js',
      'D:/LinhSinhVN/game/spatial/shelter/shelter_registry.js'
    ];
    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8');
      assert.equal(src.includes('effective_temperature'), false, `Duplicate micro-climate calculation in ${file}`);
      assert.equal(src.includes('effective_humidity'), false, `Duplicate micro-climate calculation in ${file}`);
      assert.equal(src.includes('effective_security_factor'), false, `Duplicate micro-climate calculation in ${file}`);
    }
  });

  // SHELTER-RUNTIME-27: no ResourcePool interaction
  test('SHELTER-RUNTIME-27: Shelter modules have zero imports or references to ResourcePool', async () => {
    const fs = await import('node:fs');
    const files = fs.readdirSync('D:/LinhSinhVN/game/spatial/shelter').map(f => `D:/LinhSinhVN/game/spatial/shelter/${f}`);
    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8');
      assert.equal(src.includes('ResourcePool'), false, `ResourcePool leak in ${file}`);
      assert.equal(src.includes('resource_pool'), false, `resource_pool leak in ${file}`);
    }
  });

  // SHELTER-RUNTIME-28: no Lifecycle interaction
  test('SHELTER-RUNTIME-28: Shelter modules do not mutate lifecycle or HP', async () => {
    const fs = await import('node:fs');
    const files = fs.readdirSync('D:/LinhSinhVN/game/spatial/shelter').map(f => `D:/LinhSinhVN/game/spatial/shelter/${f}`);
    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8');
      assert.equal(src.includes('hit_points'), false, `HP leak in ${file}`);
      assert.equal(src.includes('health'), false, `health leak in ${file}`);
      assert.equal(src.includes('metabolism'), false, `metabolism leak in ${file}`);
    }
  });

  // SHELTER-RUNTIME-29: no Behavior interaction
  test('SHELTER-RUNTIME-29: Shelter modules have zero imports from game/behavior/**', async () => {
    const fs = await import('node:fs');
    const files = fs.readdirSync('D:/LinhSinhVN/game/spatial/shelter').map(f => `D:/LinhSinhVN/game/spatial/shelter/${f}`);
    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8');
      assert.equal(src.includes('/behavior/'), false, `Behavior import in ${file}`);
      assert.equal(src.includes('DecisionEngine'), false, `DecisionEngine in ${file}`);
    }
  });

  // SHELTER-RUNTIME-30: no coordinate mutation
  test('SHELTER-RUNTIME-30: Shelter transactions never mutate entity coordinates', () => {
    const shelterRegistry = new ShelterRegistry({ boundary });
    const spatialWorld = createMockSpatialWorld();

    shelterRegistry.registerShelter({
      shelter_id: 'fixed_cave',
      shelter_type: ShelterType.ROCK_CREVICE,
      position: { x: 5, y: 5, z: 0 },
      capacity: 2,
      security_factor: 0.8
    });

    const ent = spatialWorld.register({ entity_id: 'stationary_ant', position: { x: 5, y: 5, z: 0 } });
    shelterRegistry.enterShelter({ spatialWorld, organismId: 'stationary_ant', shelterId: 'fixed_cave' });

    assert.deepEqual(spatialWorld.getEntity('stationary_ant').position, { x: 5, y: 5, z: 0 });

    shelterRegistry.exitShelter({ organismId: 'stationary_ant' });
    assert.deepEqual(spatialWorld.getEntity('stationary_ant').position, { x: 5, y: 5, z: 0 });
  });

  // SHELTER-RUNTIME-31: forbidden API audit
  test('SHELTER-RUNTIME-31: forbidden nondeterministic APIs are completely absent in game/spatial/shelter/**', async () => {
    const fs = await import('node:fs');
    const files = fs.readdirSync('D:/LinhSinhVN/game/spatial/shelter').map(f => `D:/LinhSinhVN/game/spatial/shelter/${f}`);
    for (const f of files) {
      const content = fs.readFileSync(f, 'utf8');
      assert.equal(content.includes('Math.random('), false, `Forbidden Math.random in ${f}`);
      assert.equal(content.includes('Date.now('), false, `Forbidden Date.now in ${f}`);
      assert.equal(content.includes('performance.now('), false, `Forbidden performance.now in ${f}`);
      assert.equal(content.includes('randomUUID('), false, `Forbidden randomUUID in ${f}`);
    }
  });
});
