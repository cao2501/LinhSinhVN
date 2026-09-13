import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  TelemetryRecorder,
  TelemetryMode,
  createTelemetryRecorder
} from '../../game/telemetry/telemetry_recorder.js';
import { canonicalSerialize } from '../../game/telemetry/canonical_serializer.js';
import { hash64, calculateTelemetryDigest } from '../../game/telemetry/telemetry_digest.js';
import { createSimulationWorld } from '../../game/population/simulation_world.js';
import { loadSpeciesProfile } from '../../game/lifecycle/profile_loader.js';
import { createOrganismState } from '../../game/lifecycle/organism_state.js';

const profile = loadSpeciesProfile('data/species/xylotrupes_rhinoceros_proto.json');

function makeMockGenome() {
  return {
    species_id: 'xylotrupes_rhinoceros_proto',
    loci: {
      LOCUS_BODY_SCALE: [0.65, 0.70],
      LOCUS_CHITIN_DENSITY: [0.55, 0.60],
      LOCUS_CEPHALIC_HORN: [0.75, 0.80],
      LOCUS_THORACIC_HORN: [0.60, 0.65],
      LOCUS_TARSAL_CLAW: [0.50, 0.55],
      LOCUS_METABOLIC_EFFICIENCY: [0.80, 0.85],
      LOCUS_CUTICLE_PIGMENT: [0.40, 0.45],
      LOCUS_ANTENNAL_CLUB: [0.50, 0.55]
    }
  };
}

function makeMockPhenotype() {
  return {
    body_scale_index: 1.24,
    mass_index: 1.62,
    cuticle_hardness_index: 2.15,
    cephalic_horn_scale: 1.37,
    thoracic_horn_scale: 0.93,
    tarsal_grip_index: 1.76,
    metabolic_drain_index: 0.82,
    stamina_economy_modifier: 1.21,
    sensory_range_units: 39.0,
    cuticle_pigment_ratio: 0.425,
    developmental_realization_factor: 1.00
  };
}

function makeMockDerivedStats(clashPower = 112.5) {
  return {
    max_hp: 224.0,
    clash_power: clashPower,
    armor_reduction: 0.2875,
    crawl_speed: 12.8,
    max_stamina: 100.0,
    action_stamina_cost: 8.26,
    stamina_regen_rate: 7.42,
    perception_radius: 39.0,
    stealth_factor: 0.72,
    thermal_tolerance_min: 15.0,
    thermal_tolerance_max: 35.0,
    humidity_tolerance_min: 0.60,
    humidity_tolerance_max: 0.95
  };
}

function createTestOrganism(id, sex = 'FEMALE', stage = 'STAGE_ADULT', energy = 80, seed = '0x0123456789abcdef') {
  const org = createOrganismState({
    organismId: id,
    speciesId: 'xylotrupes_rhinoceros_proto',
    simulationSeed: seed,
    generation: 1,
    sex,
    genome: makeMockGenome(),
    phenotype: makeMockPhenotype(),
    derivedStats: makeMockDerivedStats(),
    speciesProfile: profile
  });
  org.current_stage_id = stage;
  org.chronological_age_ticks = 30;
  org.nutrition_state.stored_energy = energy;
  org.stress_state.current_stress = 0;
  return org;
}

function getMockWorldTickResult(tick = 0, eventCount = 3) {
  const events = [];
  for (let i = 0; i < eventCount; i++) {
    events.push({
      simulation_tick: tick,
      organism_id: `org_${i}`,
      deterministic_order_index: i,
      event_id: `evt_${tick}_${i}`,
      event_type: i % 2 === 0 ? 'FEED' : 'REST'
    });
  }

  return {
    schema_version: '1.0.0',
    simulation_tick: tick,
    next_simulation_tick: tick + 1,
    delta_time: 1.0,
    environment: { before: { humidity: 0.5 }, after: { humidity: 0.51 } },
    resources: { initial: 100, demanded: 10, allocated: 10, unmet: 0, remaining: 90 },
    behavior: [{ organism_id: 'org_0', intent: { action_type: 'FEED', priority: 1 } }],
    interactions: { interactions: [{ organism_id: 'org_0', interaction_type: 'FEED', resource_type: 'ORGANIC_HUMUS', quantity: 10 }] },
    biological_input_bundle: { organism_bundles: [{ organism_id: 'org_0', allocated_food: 10 }] },
    organism_results: [{ organism_id: 'org_0', is_alive: true, energy: 95 }],
    reproduction: { pairs_evaluated: 0, pairs_mated: 0, offspring_born: 0 },
    census: { total_population: 1, living_count: 1, dead_count: 0 },
    events
  };
}

test('TelemetryRecorder & Observability Test Suite', async (t) => {

  await t.test('TC-TEL-01: DISABLED recorder performs no work and retains 0 records', () => {
    const recorder = createTelemetryRecorder({ mode: TelemetryMode.DISABLED });
    const res = recorder.record(getMockWorldTickResult(0));
    assert.strictEqual(res, null);
    assert.strictEqual(recorder.getRecords().length, 0);
    assert.strictEqual(recorder.getLatestRecord(), null);
  });

  await t.test('TC-TEL-02: SINGLE_TICK recorder retains strictly 1 latest record', () => {
    const recorder = createTelemetryRecorder({ mode: TelemetryMode.SINGLE_TICK });
    recorder.record(getMockWorldTickResult(0));
    assert.strictEqual(recorder.getRecords().length, 1);
    assert.strictEqual(recorder.getLatestRecord().simulation_tick, 0);

    recorder.record(getMockWorldTickResult(1));
    assert.strictEqual(recorder.getRecords().length, 1);
    assert.strictEqual(recorder.getLatestRecord().simulation_tick, 1);
  });

  await t.test('TC-TEL-03: RING_BUFFER recorder bounds memory to N records', () => {
    const recorder = createTelemetryRecorder({
      mode: TelemetryMode.RING_BUFFER,
      buffer_size: 3
    });

    for (let i = 0; i < 5; i++) {
      recorder.record(getMockWorldTickResult(i));
    }

    const records = recorder.getRecords();
    assert.strictEqual(records.length, 3);
    assert.strictEqual(records[0].simulation_tick, 2);
    assert.strictEqual(records[1].simulation_tick, 3);
    assert.strictEqual(records[2].simulation_tick, 4);
  });

  await t.test('TC-TEL-04: FULL_HISTORY recorder retains all records chronologically', () => {
    const recorder = createTelemetryRecorder({ mode: TelemetryMode.FULL_HISTORY });
    for (let i = 0; i < 10; i++) {
      recorder.record(getMockWorldTickResult(i));
    }
    const records = recorder.getRecords();
    assert.strictEqual(records.length, 10);
    assert.strictEqual(records[0].simulation_tick, 0);
    assert.strictEqual(records[9].simulation_tick, 9);
  });

  await t.test('TC-TEL-05: Snapshot immutability (deeply frozen record)', () => {
    const recorder = createTelemetryRecorder({ mode: TelemetryMode.SINGLE_TICK });
    const snapshot = recorder.record(getMockWorldTickResult(0));

    assert.throws(() => {
      snapshot.simulation_tick = 999;
    }, TypeError);

    assert.throws(() => {
      snapshot.resources.allocated = 999;
    }, TypeError);

    assert.throws(() => {
      snapshot.events.push({ fake: true });
    }, TypeError);
  });

  await t.test('TC-TEL-06: Source state isolation (post-record mutations do not alter snapshot)', () => {
    const recorder = createTelemetryRecorder({ mode: TelemetryMode.SINGLE_TICK });
    const sourceResult = getMockWorldTickResult(0);
    const snapshot = recorder.record(sourceResult);

    // Mutate source result object
    sourceResult.resources.initial = 999999;
    sourceResult.events[0].event_type = 'MUTATED';

    assert.strictEqual(snapshot.resources.initial, 100);
    assert.strictEqual(snapshot.events[0].event_type, 'FEED');
  });

  await t.test('TC-TEL-07: Deterministic 64-bit digest (16-char hex string)', () => {
    const res = getMockWorldTickResult(0);
    const digest = calculateTelemetryDigest(res);
    assert.match(digest, /^[0-9a-f]{16}$/);
  });

  await t.test('TC-TEL-08: Replay digest equality across independent executions', () => {
    const resA = getMockWorldTickResult(5);
    const resB = getMockWorldTickResult(5);

    const digestA = calculateTelemetryDigest(resA);
    const digestB = calculateTelemetryDigest(resB);
    assert.strictEqual(digestA, digestB);
  });

  await t.test('TC-TEL-09: Input-order determinism in object serialization', () => {
    const objA = { z: 1, a: 2, m: { y: 10, x: 20 } };
    const objB = { a: 2, z: 1, m: { x: 20, y: 10 } };

    assert.strictEqual(canonicalSerialize(objA), canonicalSerialize(objB));
    assert.strictEqual(hash64(canonicalSerialize(objA)), hash64(canonicalSerialize(objB)));
  });

  await t.test('TC-TEL-18 & TC-TEL-26: Telemetry strictly preserves canonical event ordering without re-sorting', () => {
    const rawEvents = [
      { simulation_tick: 1, organism_id: 'org_A', deterministic_order_index: 0, event_id: 'evt_1', event_type: 'MATE' },
      { simulation_tick: 1, organism_id: 'org_B', deterministic_order_index: 1, event_id: 'evt_2', event_type: 'FEED' },
      { simulation_tick: 1, organism_id: 'org_C', deterministic_order_index: 2, event_id: 'evt_3', event_type: 'DEATH' }
    ];

    const mockResult = getMockWorldTickResult(1);
    mockResult.events = rawEvents;

    const recorder = createTelemetryRecorder({ mode: TelemetryMode.SINGLE_TICK });
    const snapshot = recorder.record(mockResult);

    assert.deepStrictEqual(snapshot.events, rawEvents);
    assert.strictEqual(snapshot.events[0].event_type, 'MATE');
    assert.strictEqual(snapshot.events[1].event_type, 'FEED');
    assert.strictEqual(snapshot.events[2].event_type, 'DEATH');
  });

  await t.test('TC-TEL-19: Failure isolation in SimulationWorld (telemetry error does not abort tick)', () => {
    let errorHandlerCalled = false;
    let errorReceived = null;

    const failingRecorder = {
      record: () => {
        throw new Error('Explosion inside telemetry serialization');
      }
    };

    const world = createSimulationWorld({
      simulation_seed: '0x0123456789abcdef',
      population_id: 'pop_test_telemetry',
      species_id: 'xylotrupes_rhinoceros_proto',
      species_profile: profile,
      telemetry_recorder: failingRecorder,
      on_telemetry_error: (err) => {
        errorHandlerCalled = true;
        errorReceived = err;
      }
    });

    world.getPopulation().addOrganism(createTestOrganism('org_test_fail'));

    // Advance tick: MUST NOT throw, must advance clock and commit state
    const result = world.advancePopulationTick(1.0, { available_resource: 100 });
    assert.ok(result);
    assert.strictEqual(result.simulation_tick, 0);
    assert.strictEqual(result.next_simulation_tick, 1);
    assert.strictEqual(world.getSimulationTick(), 1);
    assert.strictEqual(errorHandlerCalled, true);
    assert.strictEqual(errorReceived.message, 'Explosion inside telemetry serialization');
  });

  await t.test('TC-TEL-20: Forbidden API static scan across game/telemetry', () => {
    const files = fs.readdirSync('D:/LinhSinhVN/game/telemetry');
    for (const file of files) {
      const content = fs.readFileSync(`D:/LinhSinhVN/game/telemetry/${file}`, 'utf8');
      assert.doesNotMatch(content, /Math\.random\(/, `Forbidden Math.random in ${file}`);
      assert.doesNotMatch(content, /Date\.now\(/, `Forbidden Date.now in ${file}`);
      assert.doesNotMatch(content, /randomUUID\(/, `Forbidden randomUUID in ${file}`);
    }
  });

  await t.test('TC-TEL-21: Schema compliance of TelemetryTickRecord snapshot', () => {
    const recorder = createTelemetryRecorder({ mode: TelemetryMode.SINGLE_TICK });
    const snapshot = recorder.record(getMockWorldTickResult(0));

    assert.ok(snapshot.schema_version);
    assert.ok(snapshot.simulation_seed);
    assert.ok(snapshot.population_id);
    assert.strictEqual(typeof snapshot.simulation_tick, 'number');
    assert.strictEqual(typeof snapshot.next_simulation_tick, 'number');
    assert.strictEqual(typeof snapshot.delta_time, 'number');
    assert.ok(snapshot.environment);
    assert.ok(snapshot.resources);
    assert.ok(snapshot.behavior);
    assert.ok(snapshot.interactions);
    assert.ok(snapshot.biological_inputs);
    assert.ok(snapshot.biological_outcomes);
    assert.ok(snapshot.reproduction);
    assert.ok(snapshot.census);
    assert.ok(Array.isArray(snapshot.events));
    assert.match(snapshot.digest, /^[0-9a-f]{16}$/);
  });

  await t.test('TC-TEL-22: Canonical key ordering in serialized string', () => {
    const testObj = { zebra: 1, apple: 2, monkey: 3 };
    const serialized = canonicalSerialize(testObj);
    assert.strictEqual(serialized, '{"apple":2,"monkey":3,"zebra":1}');
  });

  await t.test('TC-TEL-23: Floating point determinism without arbitrary rounding', () => {
    const preciseNum = 0.12345678901234567;
    const serialized = canonicalSerialize({ val: preciseNum });
    assert.strictEqual(serialized, `{"val":${preciseNum}}`);
  });

  await t.test('TC-TEL-24: Zero authoritative state mutation when Telemetry is attached', () => {
    const recorder = createTelemetryRecorder({ mode: TelemetryMode.FULL_HISTORY });
    const world = createSimulationWorld({
      simulation_seed: '0x1123456789abcdef',
      population_id: 'pop_test_mutation',
      species_id: 'xylotrupes_rhinoceros_proto',
      species_profile: profile,
      telemetry_recorder: recorder
    });

    world.getPopulation().addOrganism(createTestOrganism('org_test_mut'));

    world.advancePopulationTick(1.0, { available_resource: 100 });

    // Assert world authoritative objects have no telemetry properties injected
    assert.strictEqual(world.telemetryState, undefined);
    assert.strictEqual(world.getPopulation().telemetryState, undefined);
    for (const org of world.getPopulation().listOrganisms()) {
      assert.strictEqual(org.telemetryState, undefined);
    }
  });

  await t.test('TC-TEL-25: Tick N vs post-commit Clock N+1 semantics', () => {
    const recorder = createTelemetryRecorder({ mode: TelemetryMode.FULL_HISTORY });
    const world = createSimulationWorld({
      simulation_seed: '0x2123456789abcdef',
      population_id: 'pop_test_ticks',
      species_id: 'xylotrupes_rhinoceros_proto',
      species_profile: profile,
      initial_tick: 42,
      telemetry_recorder: recorder
    });

    world.getPopulation().addOrganism(createTestOrganism('org_test_clock'));

    world.advancePopulationTick(1.0, { available_resource: 100 });

    const rec = recorder.getLatestRecord();
    assert.strictEqual(rec.simulation_tick, 42, 'telemetry.simulation_tick must equal 42');
    assert.strictEqual(rec.next_simulation_tick, 43, 'telemetry.next_simulation_tick must equal 43');
    assert.strictEqual(world.getSimulationTick(), 43, 'world clock after commit must equal 43');
  });

  await t.test('TC-TEL-27: Non-finite numeric rejection', () => {
    assert.throws(() => canonicalSerialize({ val: NaN }), TypeError);
    assert.throws(() => canonicalSerialize({ val: Infinity }), TypeError);
    assert.throws(() => canonicalSerialize({ val: -Infinity }), TypeError);
  });

  await t.test('TC-TEL-28: Negative zero canonicalization (-0 becomes 0)', () => {
    const serNegZero = canonicalSerialize({ val: -0 });
    const serZero = canonicalSerialize({ val: 0 });
    assert.strictEqual(serNegZero, serZero);
    assert.strictEqual(serNegZero, '{"val":0}');
  });

  await t.test('TC-TEL-29: Static import audit: game/telemetry/** has zero imports from game/behavior/**', () => {
    const files = fs.readdirSync('D:/LinhSinhVN/game/telemetry');
    for (const file of files) {
      const content = fs.readFileSync(`D:/LinhSinhVN/game/telemetry/${file}`, 'utf8');
      assert.doesNotMatch(
        content,
        /from\s+['"].*\/behavior\/.*['"]/,
        `Module ${file} improperly imports from game/behavior/**`
      );
    }
  });

  await t.test('TC-TEL-30: Simulation equivalence between Telemetry DISABLED and FULL_HISTORY', () => {
    const seed = '0x3123456789abcdef';

    // World A: Telemetry DISABLED
    const worldA = createSimulationWorld({
      simulation_seed: seed,
      population_id: 'pop_equiv',
      species_id: 'xylotrupes_rhinoceros_proto',
      species_profile: profile,
      telemetry_recorder: createTelemetryRecorder({ mode: TelemetryMode.DISABLED })
    });
    worldA.getPopulation().addOrganism(createTestOrganism('org_test_eq1'));

    // World B: Telemetry FULL_HISTORY
    const worldB = createSimulationWorld({
      simulation_seed: seed,
      population_id: 'pop_equiv',
      species_id: 'xylotrupes_rhinoceros_proto',
      species_profile: profile,
      telemetry_recorder: createTelemetryRecorder({ mode: TelemetryMode.FULL_HISTORY })
    });
    worldB.getPopulation().addOrganism(createTestOrganism('org_test_eq1'));

    for (let i = 0; i < 5; i++) {
      worldA.advancePopulationTick(1.0, { available_resource: 200 });
      worldB.advancePopulationTick(1.0, { available_resource: 200 });
    }

    const snapA = worldA.snapshot();
    const snapB = worldB.snapshot();

    // Population id differs by config, normalize for snapshot comparison

    assert.deepStrictEqual(snapA, snapB);
  });
});
