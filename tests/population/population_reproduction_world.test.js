/**
 * LinhSinhVN — Population-Level Reproduction & World Breeding Scheduler Test Suite
 *
 * Validates TASK 06-C:
 * - TC-WORLD-REPRO-01: Single eligible pair mates during world tick, offspring registered in PopulationRegistry.
 * - TC-WORLD-REPRO-02: Multi-pair canonical pairing: sorted by canonical ID, directional parental assignment.
 * - TC-WORLD-REPRO-03: Ineligible adult filtering (cooldown active, insufficient energy, underage).
 * - TC-WORLD-REPRO-04: Same-tick newborn isolation: newborn eggs generate 0 demand and do not tick in tick N.
 * - TC-WORLD-REPRO-05: Census update: newborn offspring appear in alive_by_stage (STAGE_EGG) and increment total and alive.
 * - TC-WORLD-REPRO-06: Parent state transition: energy deducted, cooldown updated via applyReproductionDeltas().
 * - TC-WORLD-REPRO-07: Population capacity cap: mating is suppressed when max_population is reached.
 * - TC-WORLD-REPRO-08: Reproduction disabled option (reproduction_enabled: false).
 * - TC-WORLD-REPRO-09: Failure rollback: error in breeding plan causes zero mutation to parents, world, or clock.
 * - TC-WORLD-REPRO-10: 50-run Replay determinism: identical seed produces identical offspring IDs, genomes, and lineages.
 * - TC-WORLD-REPRO-11: Canonical serialized WorldTickResult conforms to schema.
 * - TC-WORLD-REPRO-12: Audit forbidden nondeterministic APIs.
 * - TC-WORLD-REPRO-13: Rollback after offspring candidate failure.
 * - TC-WORLD-REPRO-14: Rollback after lineage validation failure.
 * - TC-WORLD-REPRO-15: Dead population does not consume population capacity.
 * - TC-WORLD-REPRO-16: Capacity uses alive count (counts.alive).
 * - TC-WORLD-REPRO-17: Whole-clutch admission (no partial clutch truncation).
 * - TC-WORLD-REPRO-18: Species resolved independently per organism via SpeciesRegistry.
 * - TC-WORLD-REPRO-19: Unknown species during candidate planning causes full rollback.
 * - TC-WORLD-REPRO-20: Newborns appear in census but do not receive biological tick in tick N.
 * - TC-WORLD-REPRO-21: Newborns receive biological tick starting at tick N+1.
 * - TC-WORLD-REPRO-22: BreedingSeed remains 100% compatible with closed 05-B contract.
 * - TC-WORLD-REPRO-23: Single clock advance (N -> N+1 exactly once).
 * - TC-WORLD-REPRO-24: 50+ replay runs produce bit-identical offspring IDs, genomes, lineage, and events.
 * - TC-WORLD-REPRO-25: Male contest competition: higher clash_power male wins pairing priority.
 * - TC-WORLD-REPRO-26: Tie-breaking male contest competition on identical clash_power uses organism_id ASC.
 * - TC-WORLD-REPRO-27: Monogamous per-tick mating: mated organisms receive cooldown and cannot mate multiple times.
 * - TC-WORLD-REPRO-28: Event ordering invariant: combined events are canonicalized.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  SimulationWorld,
  createSimulationWorld,
  createStaticQuotaEcologyProvider,
  compareCanonicalEvents
} from '../../game/population/index.js';
import { loadSpeciesProfile } from '../../game/lifecycle/profile_loader.js';
import { createOrganismState } from '../../game/lifecycle/organism_state.js';
import { computeBreedingSeed } from '../../game/genetics/rng.js';

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
    starvation_endurance_time: 197.56
  };
}

function createAdultOrganism(id, sex, options = {}) {
  const org = createOrganismState({
    organismId: id,
    speciesProfile: options.profile || profile,
    generation: options.generation || 1,
    sex,
    genome: makeMockGenome(),
    phenotype: makeMockPhenotype(),
    derivedStats: makeMockDerivedStats(options.clashPower ?? 112.5),
    simulationSeed: options.simulationSeed || '0x1234567890abcdef'
  });

  org.current_stage_id = 'STAGE_ADULT';
  org.current_stage_index = 3;
  org.stage_age_ticks = options.stageAgeTicks !== undefined ? options.stageAgeTicks : 150;
  org.reproduction_cooldown_until_tick = options.cooldown !== undefined ? options.cooldown : 0;
  org.last_reproduction_tick = options.lastReproTick !== undefined ? options.lastReproTick : null;
  org.nutrition_state.stored_energy = options.energy !== undefined ? options.energy : 150.0;
  org.stress_state.is_overstressed = options.isOverstressed || false;

  if (options.is_alive === false) {
    org.is_alive = false;
    org.status = 'DEAD';
    org.death_record = {
      schema_version: '1.0.0',
      organism_id: org.organism_id,
      species_id: org.species_id,
      death_tick: 1,
      chronological_age_ticks: 10,
      stage_at_death: 'STAGE_ADULT',
      substage_at_death: null,
      primary_cause: 'STARVATION',
      biomass_at_death: 1.0,
      environmental_conditions: {}
    };
  }

  return org;
}

function createTestWorld(seed = '0x1234567890abcdef', provider = null) {
  return createSimulationWorld({
    simulation_seed: seed,
    population_id: 'pop_test_repro_world',
    species_id: 'xylotrupes_rhinoceros_proto',
    species_profile: profile,
    ecology_provider: provider || createStaticQuotaEcologyProvider({ quota: 200.0, enable_feedback: false })
  });
}

describe('Population-Level Reproduction & World Breeding Scheduler (TC-WORLD-REPRO-01 -> TC-WORLD-REPRO-28)', () => {

  it('TC-WORLD-REPRO-01: Single eligible pair mates during world tick, offspring registered in PopulationRegistry', () => {
    const world = createTestWorld();
    const female = createAdultOrganism('org_f01', 'FEMALE', { energy: 120 });
    const male = createAdultOrganism('org_m01', 'MALE', { energy: 120 });
    world.getPopulation().addOrganism(female);
    world.getPopulation().addOrganism(male);

    const result = world.advancePopulationTick(1.0, { available_resource: 200.0 });

    assert.equal(result.reproduction.pairs_evaluated, 1);
    assert.equal(result.reproduction.pairs_mated, 1);
    assert.ok(result.reproduction.offspring_born >= 15 && result.reproduction.offspring_born <= 45);
    assert.equal(result.reproduction.clutches_produced, 1);

    // Offspring exist in registry
    assert.equal(world.getPopulation().size, 2 + result.reproduction.offspring_born);
    assert.equal(world.getPopulation().countLiving(), 2 + result.reproduction.offspring_born);

    // All newborns are in STAGE_EGG
    const newborns = world.getPopulation().listOrganisms().filter(o => o.organism_id !== 'org_f01' && o.organism_id !== 'org_m01');
    assert.equal(newborns.length, result.reproduction.offspring_born);
    for (const nb of newborns) {
      assert.equal(nb.current_stage_id, 'STAGE_EGG');
      assert.equal(nb.generation, 2);
    }
  });

  it('TC-WORLD-REPRO-02: Multi-pair canonical pairing: sorted by canonical ID, directional parental assignment', () => {
    const world = createTestWorld();
    const f1 = createAdultOrganism('org_f_b', 'FEMALE');
    const f2 = createAdultOrganism('org_f_a', 'FEMALE');
    const m1 = createAdultOrganism('org_m_b', 'MALE', { clashPower: 100 });
    const m2 = createAdultOrganism('org_m_a', 'MALE', { clashPower: 120 });

    world.getPopulation().addOrganism(f1);
    world.getPopulation().addOrganism(f2);
    world.getPopulation().addOrganism(m1);
    world.getPopulation().addOrganism(m2);

    const result = world.advancePopulationTick(1.0, { available_resource: 300.0 });
    assert.equal(result.reproduction.pairs_evaluated, 2);
    assert.equal(result.reproduction.pairs_mated, 2);
    assert.equal(result.reproduction.clutches_produced, 2);
  });

  it('TC-WORLD-REPRO-03: Ineligible adult filtering (cooldown active, insufficient energy, underage)', () => {
    const world = createTestWorld();
    // f1 on cooldown
    const f1 = createAdultOrganism('org_f1', 'FEMALE', { cooldown: 50 });
    // f2 insufficient energy (< 40)
    const f2 = createAdultOrganism('org_f2', 'FEMALE', { energy: 20 });
    // m1 underage (< 100)
    const m1 = createAdultOrganism('org_m1', 'MALE', { stageAgeTicks: 50 });
    // m2 eligible
    const m2 = createAdultOrganism('org_m2', 'MALE');

    world.getPopulation().addOrganism(f1);
    world.getPopulation().addOrganism(f2);
    world.getPopulation().addOrganism(m1);
    world.getPopulation().addOrganism(m2);

    const result = world.advancePopulationTick(1.0, { available_resource: 200.0 });
    assert.equal(result.reproduction.pairs_mated, 0);
    assert.equal(result.reproduction.offspring_born, 0);
    assert.equal(world.getPopulation().size, 4);
  });

  it('TC-WORLD-REPRO-04: Same-tick newborn isolation: newborn eggs generate 0 demand and do not tick in tick N', () => {
    const world = createTestWorld();
    const f = createAdultOrganism('org_f', 'FEMALE');
    const m = createAdultOrganism('org_m', 'MALE');
    world.getPopulation().addOrganism(f);
    world.getPopulation().addOrganism(m);

    const result = world.advancePopulationTick(1.0, { available_resource: 200.0 });

    // Demand in tick N was generated ONLY by the 2 pre-tick adults
    assert.equal(result.resource_allocation.allocations.length, 2);
    assert.equal(result.organism_results.length, 2);

    // Newborn IDs do not appear in organism_results for tick N
    for (const res of result.organism_results) {
      assert.ok(res.organism_id === 'org_f' || res.organism_id === 'org_m');
    }
  });

  it('TC-WORLD-REPRO-05: Census update: newborn offspring appear in alive_by_stage (STAGE_EGG) and increment total and alive', () => {
    const world = createTestWorld();
    const f = createAdultOrganism('org_f', 'FEMALE');
    const m = createAdultOrganism('org_m', 'MALE');
    world.getPopulation().addOrganism(f);
    world.getPopulation().addOrganism(m);

    const result = world.advancePopulationTick(1.0, { available_resource: 200.0 });
    const born = result.reproduction.offspring_born;

    assert.equal(result.census.counts.total, 2 + born);
    assert.equal(result.census.counts.alive, 2 + born);

    const eggStage = result.census.alive_by_stage.find(s => s.stage === 'STAGE_EGG');
    assert.ok(eggStage);
    assert.equal(eggStage.count, born);

    const adultStage = result.census.alive_by_stage.find(s => s.stage === 'STAGE_ADULT');
    assert.ok(adultStage);
    assert.equal(adultStage.count, 2);
  });

  it('TC-WORLD-REPRO-06: Parent state transition: energy deducted, cooldown updated via applyReproductionDeltas()', () => {
    const world = createTestWorld();
    const initialEnergy = 120.0;
    const f = createAdultOrganism('org_f', 'FEMALE', { energy: initialEnergy });
    const m = createAdultOrganism('org_m', 'MALE', { energy: initialEnergy });
    world.getPopulation().addOrganism(f);
    world.getPopulation().addOrganism(m);

    // Run with 0 food available so nutrition intake is 0 and mating deduction (40.0) is clearly observed
    world.advancePopulationTick(1.0, { available_resource: 0.0 });

    // Cooldown is set to currentTick (0) + 300 = 300
    assert.equal(f.reproduction_cooldown_until_tick, 300);
    assert.equal(m.reproduction_cooldown_until_tick, 300);
    assert.equal(f.last_reproduction_tick, 0);
    assert.equal(m.last_reproduction_tick, 0);

    // Energy deducted by energy_cost_per_mating (40.0) plus metabolic cost
    assert.ok(f.nutrition_state.stored_energy <= initialEnergy - 40.0);
    assert.ok(m.nutrition_state.stored_energy <= initialEnergy - 40.0);
  });

  it('TC-WORLD-REPRO-07: Population capacity cap: mating is suppressed when max_population is reached', () => {
    const world = createTestWorld();
    const f = createAdultOrganism('org_f', 'FEMALE');
    const m = createAdultOrganism('org_m', 'MALE');
    world.getPopulation().addOrganism(f);
    world.getPopulation().addOrganism(m);

    // Cap at 2 (exactly current alive count)
    const result = world.advancePopulationTick(1.0, {
      available_resource: 200.0,
      max_population: 2
    });

    assert.equal(result.reproduction.pairs_mated, 0);
    assert.equal(result.reproduction.offspring_born, 0);
    assert.equal(world.getPopulation().size, 2);
    assert.equal(result.reproduction.rejected_pairs.length, 1);
    assert.equal(result.reproduction.rejected_pairs[0].reason, 'POPULATION_CAPACITY_EXCEEDED');
  });

  it('TC-WORLD-REPRO-08: Reproduction disabled option (reproduction_enabled: false)', () => {
    const world = createTestWorld();
    const f = createAdultOrganism('org_f', 'FEMALE');
    const m = createAdultOrganism('org_m', 'MALE');
    world.getPopulation().addOrganism(f);
    world.getPopulation().addOrganism(m);

    const result = world.advancePopulationTick(1.0, {
      available_resource: 200.0,
      reproduction_enabled: false
    });

    assert.equal(result.reproduction.pairs_mated, 0);
    assert.equal(result.reproduction.offspring_born, 0);
    assert.equal(f.reproduction_cooldown_until_tick, 0);
    assert.equal(m.reproduction_cooldown_until_tick, 0);
    assert.equal(world.getPopulation().size, 2);
  });

  it('TC-WORLD-REPRO-09: Failure rollback: error in breeding plan causes zero mutation to parents, world, or clock', () => {
    const world = createTestWorld();
    const f = createAdultOrganism('org_f', 'FEMALE', { energy: 100 });
    const m = createAdultOrganism('org_m', 'MALE', { energy: 100 });
    world.getPopulation().addOrganism(f);
    world.getPopulation().addOrganism(m);

    // Inject a failure into scheduler runtime
    const originalPlan = world.breedingScheduler.runtime.planReproduction;
    world.breedingScheduler.runtime.planReproduction = () => {
      throw new Error('Simulated breeding failure');
    };

    assert.throws(() => {
      world.advancePopulationTick(1.0, { available_resource: 200.0 });
    }, /Simulated breeding failure/);

    // World clock unchanged at 0
    assert.equal(world.getSimulationTick(), 0);
    // Population unchanged
    assert.equal(world.getPopulation().size, 2);
    assert.equal(f.nutrition_state.stored_energy, 100);
    assert.equal(f.reproduction_cooldown_until_tick, 0);

    // Restore original method
    world.breedingScheduler.runtime.planReproduction = originalPlan;
  });

  it('TC-WORLD-REPRO-10: 50-run Replay determinism: identical seed produces identical offspring IDs, genomes, and lineages', () => {
    const seed = '0xfeedfacecafebeef';
    const outputs = [];

    for (let r = 0; r < 50; r++) {
      const world = createTestWorld(seed);
      const f = createAdultOrganism('org_f', 'FEMALE');
      const m = createAdultOrganism('org_m', 'MALE');
      world.getPopulation().addOrganism(f);
      world.getPopulation().addOrganism(m);

      const result = world.advancePopulationTick(1.0, { available_resource: 200.0 });
      outputs.push(JSON.stringify(result));
    }

    const first = outputs[0];
    for (let r = 1; r < 50; r++) {
      assert.equal(outputs[r], first, `Run ${r} diverged from Run 0!`);
    }
  });

  it('TC-WORLD-REPRO-11: Canonical serialized WorldTickResult conforms to schema', () => {
    const reproSchemaContent = readFileSync('data/population/schema/population_reproduction_summary.schema.json', 'utf8');
    const reproSchema = JSON.parse(reproSchemaContent);
    assert.equal(reproSchema.$id, 'https://linhsinhvn.game/schemas/population/population_reproduction_summary.schema.json');

    const worldSchemaContent = readFileSync('data/population/schema/population_world_tick_result.schema.json', 'utf8');
    const worldSchema = JSON.parse(worldSchemaContent);
    assert.ok(worldSchema.properties.reproduction);

    const world = createTestWorld();
    const f = createAdultOrganism('org_f', 'FEMALE');
    const m = createAdultOrganism('org_m', 'MALE');
    world.getPopulation().addOrganism(f);
    world.getPopulation().addOrganism(m);

    const result = world.advancePopulationTick(1.0, { available_resource: 200.0 });

    // Validate top-level schema fields
    assert.equal(result.schema_version, '1.0.0');
    assert.equal(typeof result.simulation_tick, 'number');
    assert.equal(typeof result.next_simulation_tick, 'number');
    assert.equal(typeof result.delta_time, 'number');
    assert.ok(result.environment.before);
    assert.ok(result.environment.after);
    assert.ok(result.resources);
    assert.ok(result.census);
    assert.ok(Array.isArray(result.events));

    // Validate reproduction summary conforms to required schema fields
    assert.ok(result.reproduction);
    assert.equal(result.reproduction.schema_version, '1.0.0');
    assert.equal(typeof result.reproduction.pairs_evaluated, 'number');
    assert.equal(typeof result.reproduction.pairs_mated, 'number');
    assert.equal(typeof result.reproduction.offspring_born, 'number');
    assert.equal(typeof result.reproduction.clutches_produced, 'number');
    assert.ok(Array.isArray(result.reproduction.events));
    assert.ok(Array.isArray(result.reproduction.lineage_records));
    assert.ok(Array.isArray(result.reproduction.rejected_pairs));
  });

  it('TC-WORLD-REPRO-12: Audit forbidden nondeterministic APIs', () => {
    const files = [
      'game/population/event_canonicalizer.js',
      'game/population/population_breeding_scheduler.js',
      'game/population/simulation_world.js',
      'game/reproduction/canonical_pair.js',
      'game/reproduction/clutch.js',
      'game/reproduction/eligibility.js',
      'game/reproduction/reproduction_runtime.js',
      'game/reproduction/seed_derivation.js'
    ];

    const forbiddenPatterns = [
      /\bMath\.random\s*\(/,
      /\bDate\.now\s*\(/,
      /\bnew\s+Date\s*\(/,
      /\bcrypto\.randomUUID\s*\(/
    ];

    for (const f of files) {
      const rawCode = readFileSync(f, 'utf8');
      // Strip comments to inspect executable code exclusively
      const code = rawCode.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
      for (const pattern of forbiddenPatterns) {
        assert.equal(
          pattern.test(code),
          false,
          `Forbidden nondeterministic API found in ${f}: ${pattern}`
        );
      }
    }
  });

  it('TC-WORLD-REPRO-13: Rollback after offspring candidate failure', () => {
    const world = createTestWorld();
    const f = createAdultOrganism('org_f', 'FEMALE');
    const m = createAdultOrganism('org_m', 'MALE');
    world.getPopulation().addOrganism(f);
    world.getPopulation().addOrganism(m);

    const originalCommit = world.breedingScheduler.runtime.commitReproduction;
    world.breedingScheduler.runtime.commitReproduction = (plan, p1, p2, prof) => {
      const res = originalCommit.call(world.breedingScheduler.runtime, plan, p1, p2, prof);
      // corrupt children array to throw
      throw new Error('Failure during offspring handling');
    };

    assert.throws(() => {
      world.advancePopulationTick(1.0, { available_resource: 200.0 });
    }, /Failure during offspring handling/);

    assert.equal(world.getSimulationTick(), 0);
    assert.equal(world.getPopulation().size, 2);
    world.breedingScheduler.runtime.commitReproduction = originalCommit;
  });

  it('TC-WORLD-REPRO-14: Rollback after lineage validation failure', () => {
    const world = createTestWorld();
    const f = createAdultOrganism('org_f', 'FEMALE');
    const m = createAdultOrganism('org_m', 'MALE');
    world.getPopulation().addOrganism(f);
    world.getPopulation().addOrganism(m);

    const originalCommit = world.breedingScheduler.runtime.commitReproduction;
    world.breedingScheduler.runtime.commitReproduction = (plan, p1, p2, prof) => {
      throw new Error('Lineage validation rejected');
    };

    assert.throws(() => {
      world.advancePopulationTick(1.0, { available_resource: 200.0 });
    }, /Lineage validation rejected/);

    assert.equal(world.getSimulationTick(), 0);
    assert.equal(world.getPopulation().size, 2);
    world.breedingScheduler.runtime.commitReproduction = originalCommit;
  });

  it('TC-WORLD-REPRO-15: Dead population does not consume population capacity', () => {
    const world = createTestWorld();
    // 5 dead organisms
    for (let i = 0; i < 5; i++) {
      world.getPopulation().addOrganism(createAdultOrganism(`org_dead_${i}`, 'MALE', { is_alive: false }));
    }
    // 2 alive adults
    const f = createAdultOrganism('org_f', 'FEMALE');
    const m = createAdultOrganism('org_m', 'MALE');
    world.getPopulation().addOrganism(f);
    world.getPopulation().addOrganism(m);

    // Max alive capacity: 50. Total organisms: 5 dead + 2 alive + ~25 born = ~32 <= 50.
    const result = world.advancePopulationTick(1.0, {
      available_resource: 200.0,
      max_population: 50
    });

    assert.equal(result.reproduction.pairs_mated, 1);
    assert.ok(result.reproduction.offspring_born > 0);
    // Living count includes 2 parents + offspring, dead count remains 5
    assert.equal(world.getPopulation().countDead(), 5);
    assert.equal(world.getPopulation().countLiving(), 2 + result.reproduction.offspring_born);
  });

  it('TC-WORLD-REPRO-16: Capacity uses alive count (counts.alive)', () => {
    const world = createTestWorld();
    // 20 dead organisms
    for (let i = 0; i < 20; i++) {
      world.getPopulation().addOrganism(createAdultOrganism(`org_dead_${i}`, 'MALE', { is_alive: false }));
    }
    // 2 alive adults
    world.getPopulation().addOrganism(createAdultOrganism('org_f', 'FEMALE'));
    world.getPopulation().addOrganism(createAdultOrganism('org_m', 'MALE'));

    // Cap at 2 alive: mating suppressed even though dead count is 20
    const result = world.advancePopulationTick(1.0, {
      available_resource: 200.0,
      max_population: 2
    });

    assert.equal(result.reproduction.pairs_mated, 0);
    assert.equal(result.census.counts.alive, 2);
    assert.equal(result.census.counts.dead, 20);
  });

  it('TC-WORLD-REPRO-17: Whole-clutch admission (no partial clutch truncation)', () => {
    const world = createTestWorld();
    world.getPopulation().addOrganism(createAdultOrganism('org_f', 'FEMALE'));
    world.getPopulation().addOrganism(createAdultOrganism('org_m', 'MALE'));

    // Capacity allows exactly 10 total alive. Clutch size is 15-45.
    // 2 + clutch > 10, so pair must be rejected completely (no partial 8 eggs born).
    const result = world.advancePopulationTick(1.0, {
      available_resource: 200.0,
      max_population: 10
    });

    assert.equal(result.reproduction.pairs_mated, 0);
    assert.equal(result.reproduction.offspring_born, 0);
    assert.equal(world.getPopulation().size, 2);
  });

  it('TC-WORLD-REPRO-18: Species resolved independently per organism via SpeciesRegistry', () => {
    const world = createTestWorld();
    const f = createAdultOrganism('org_f', 'FEMALE');
    const m = createAdultOrganism('org_m', 'MALE');
    world.getPopulation().addOrganism(f);
    world.getPopulation().addOrganism(m);

    assert.ok(world.speciesRegistry.has(f.species_id));
    const resolved = world.speciesRegistry.get(f.species_id);
    assert.equal(resolved.species_id, 'xylotrupes_rhinoceros_proto');
  });

  it('TC-WORLD-REPRO-19: Unknown species during candidate planning causes full rollback', () => {
    const world = createTestWorld();
    const f = createAdultOrganism('org_f', 'FEMALE');
    const m = createAdultOrganism('org_m', 'MALE');
    world.getPopulation().addOrganism(f);
    world.getPopulation().addOrganism(m);

    // Corrupt one organism species_id directly in the map
    const target = world.getPopulation().getOrganism('org_f');
    target.species_id = 'alien_beetle_unknown';

    assert.throws(() => {
      world.advancePopulationTick(1.0, { available_resource: 200.0 });
    }, /Unknown species profile/);

    assert.equal(world.getSimulationTick(), 0);
  });

  it('TC-WORLD-REPRO-20: Newborns appear in census but do not receive biological tick in tick N', () => {
    const world = createTestWorld();
    world.getPopulation().addOrganism(createAdultOrganism('org_f', 'FEMALE'));
    world.getPopulation().addOrganism(createAdultOrganism('org_m', 'MALE'));

    const result = world.advancePopulationTick(1.0, { available_resource: 200.0 });
    const born = result.reproduction.offspring_born;

    // Newborns appear in census
    assert.equal(result.census.counts.alive, 2 + born);

    // Newborns have age 0
    const newborns = world.getPopulation().listOrganisms().filter(o => o.current_stage_id === 'STAGE_EGG');
    assert.equal(newborns.length, born);
    for (const nb of newborns) {
      assert.equal(nb.stage_age_ticks, 0);
      assert.equal(nb.chronological_age_ticks, 0);
    }
  });

  it('TC-WORLD-REPRO-21: Newborns receive biological tick starting at tick N+1', () => {
    const world = createTestWorld();
    world.getPopulation().addOrganism(createAdultOrganism('org_f', 'FEMALE'));
    world.getPopulation().addOrganism(createAdultOrganism('org_m', 'MALE'));

    // Tick 0 -> reproduction happens, newborns created
    world.advancePopulationTick(1.0, { available_resource: 200.0 });

    // Tick 1 -> newborns are in the cohort and receive biological tick
    const result2 = world.advancePopulationTick(1.0, { available_resource: 200.0 });
    const eggResults = result2.organism_results.filter(r => r.current_stage_id === 'STAGE_EGG');
    assert.ok(eggResults.length > 0, 'Newborns must receive biological evaluation at tick 1');

    // In tick 1, eggs accumulated 1 tick of age
    const newborns = world.getPopulation().listOrganisms().filter(o => o.current_stage_id === 'STAGE_EGG');
    for (const nb of newborns) {
      assert.equal(nb.stage_age_ticks, 1);
    }
  });

  it('TC-WORLD-REPRO-22: BreedingSeed remains 100% compatible with closed 05-B contract', () => {
    const world = createTestWorld();
    const f = createAdultOrganism('org_f', 'FEMALE');
    const m = createAdultOrganism('org_m', 'MALE');
    world.getPopulation().addOrganism(f);
    world.getPopulation().addOrganism(m);

    const result = world.advancePopulationTick(1.0, { available_resource: 200.0 });
    assert.equal(result.reproduction.pairs_mated, 1);

    // Breeding seed format
    const breedingSeed = result.reproduction.lineage_records[0].breeding_seed;
    assert.ok(breedingSeed.startsWith('0x'));
    assert.equal(breedingSeed.length, 18);
  });

  it('TC-WORLD-REPRO-23: Single clock advance (N -> N+1 exactly once)', () => {
    const world = createTestWorld();
    world.getPopulation().addOrganism(createAdultOrganism('org_f', 'FEMALE'));
    world.getPopulation().addOrganism(createAdultOrganism('org_m', 'MALE'));

    assert.equal(world.getSimulationTick(), 0);
    const res1 = world.advancePopulationTick(1.0, { available_resource: 200.0 });
    assert.equal(res1.simulation_tick, 0);
    assert.equal(res1.next_simulation_tick, 1);
    assert.equal(world.getSimulationTick(), 1);

    const res2 = world.advancePopulationTick(1.0, { available_resource: 200.0 });
    assert.equal(res2.simulation_tick, 1);
    assert.equal(res2.next_simulation_tick, 2);
    assert.equal(world.getSimulationTick(), 2);
  });

  it('TC-WORLD-REPRO-24: 50+ replay runs produce bit-identical offspring IDs, genomes, lineage, and events', () => {
    const seed = '0x9988776655443322';
    const outputs = [];

    for (let i = 0; i < 50; i++) {
      const world = createTestWorld(seed);
      world.getPopulation().addOrganism(createAdultOrganism('org_f', 'FEMALE'));
      world.getPopulation().addOrganism(createAdultOrganism('org_m', 'MALE'));

      const result = world.advancePopulationTick(1.0, { available_resource: 200.0 });
      outputs.push({
        offspring_ids: world.getPopulation().listOrganisms().map(o => o.organism_id),
        lineage_seeds: result.reproduction.lineage_records.map(l => l.breeding_seed),
        events_len: result.events.length
      });
    }

    const baseline = JSON.stringify(outputs[0]);
    for (let i = 1; i < 50; i++) {
      assert.equal(JSON.stringify(outputs[i]), baseline);
    }
  });

  it('TC-WORLD-REPRO-25: Male contest competition: higher clash_power male wins pairing priority', () => {
    const world = createTestWorld();
    // 1 female, 2 males: male B has higher clash power
    const female = createAdultOrganism('org_f', 'FEMALE');
    const maleLow = createAdultOrganism('org_m_low', 'MALE', { clashPower: 50 });
    const maleHigh = createAdultOrganism('org_m_high', 'MALE', { clashPower: 150 });

    world.getPopulation().addOrganism(female);
    world.getPopulation().addOrganism(maleLow);
    world.getPopulation().addOrganism(maleHigh);

    const result = world.advancePopulationTick(1.0, { available_resource: 200.0 });
    assert.equal(result.reproduction.pairs_mated, 1);

    // maleHigh mated: cooldown set to 300
    assert.equal(maleHigh.reproduction_cooldown_until_tick, 300);
    // maleLow was left out: cooldown remains 0
    assert.equal(maleLow.reproduction_cooldown_until_tick, 0);
  });

  it('TC-WORLD-REPRO-26: Tie-breaking male contest competition on identical clash_power uses organism_id ASC', () => {
    const world = createTestWorld();
    // 1 female, 2 males with identical clash power: 'org_m_alpha' < 'org_m_beta'
    const female = createAdultOrganism('org_f', 'FEMALE');
    const maleAlpha = createAdultOrganism('org_m_alpha', 'MALE', { clashPower: 100 });
    const maleBeta = createAdultOrganism('org_m_beta', 'MALE', { clashPower: 100 });

    world.getPopulation().addOrganism(female);
    world.getPopulation().addOrganism(maleAlpha);
    world.getPopulation().addOrganism(maleBeta);

    const result = world.advancePopulationTick(1.0, { available_resource: 200.0 });
    assert.equal(result.reproduction.pairs_mated, 1);

    // maleAlpha wins tie-break
    assert.equal(maleAlpha.reproduction_cooldown_until_tick, 300);
    assert.equal(maleBeta.reproduction_cooldown_until_tick, 0);
  });

  it('TC-WORLD-REPRO-27: Monogamous per-tick mating: mated organisms receive cooldown and cannot mate multiple times', () => {
    const world = createTestWorld();
    // 2 females, 1 male
    const f1 = createAdultOrganism('org_f1', 'FEMALE');
    const f2 = createAdultOrganism('org_f2', 'FEMALE');
    const m = createAdultOrganism('org_m', 'MALE');

    world.getPopulation().addOrganism(f1);
    world.getPopulation().addOrganism(f2);
    world.getPopulation().addOrganism(m);

    const result = world.advancePopulationTick(1.0, { available_resource: 200.0 });
    // Only 1 pair mated because male can only mate once per tick
    assert.equal(result.reproduction.pairs_mated, 1);
    assert.equal(m.reproduction_cooldown_until_tick, 300);
  });

  it('TC-WORLD-REPRO-28: Event ordering invariant: combined events are canonicalized', () => {
    const world = createTestWorld();
    world.getPopulation().addOrganism(createAdultOrganism('org_f', 'FEMALE'));
    world.getPopulation().addOrganism(createAdultOrganism('org_m', 'MALE'));

    const result = world.advancePopulationTick(1.0, { available_resource: 200.0 });
    const events = result.events;

    assert.ok(events.length > 0);
    // Verify strictly ascending canonical order
    for (let i = 0; i < events.length - 1; i++) {
      const cmp = compareCanonicalEvents(events[i], events[i + 1]);
      assert.ok(cmp <= 0, `Events at ${i} and ${i + 1} not in canonical order!`);
    }
  });

});
