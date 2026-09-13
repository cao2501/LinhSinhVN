/**
 * LinhSinhVN — Individual Behavior Decision Engine Tests (TASK 07-B)
 * 
 * Verifies pure deterministic behavior evaluation and strict domain contracts:
 * - TC-BEH-01: Deterministic behavior decision
 * - TC-BEH-02: 100-run replay determinism
 * - TC-BEH-03: Pure evaluation does not mutate OrganismState
 * - TC-BEH-04: Pure evaluation does not mutate SpeciesProfile
 * - TC-BEH-05: Pure evaluation does not mutate EnvironmentSnapshot
 * - TC-BEH-06: Dead organism produces no behavior (null decision & intent)
 * - TC-BEH-07: Egg/pupa stage restrictions (immobile stages only REST)
 * - TC-BEH-08: Survival urgency dominates priority_score
 * - TC-BEH-09: Equal urgency + priority preserves clash_power in ActionIntent
 * - TC-BEH-10: Exact tie uses organism_id ASC canonical ordering
 * - TC-BEH-11: Circadian alignment materially changes decision
 * - TC-BEH-12: decision_seed is null for deterministic branch
 * - TC-BEH-13: Stochastic branch uses exact domain-separated behavior seed
 * - TC-BEH-14: ActionIntent payload matches approved 07-A discriminated schema
 * - TC-BEH-15: No forbidden nondeterministic APIs in game/behavior/**
 * - TC-BEH-16: evaluatePopulationBehavior is insertion-order invariant
 * - TC-BEH-17: Adult reproductive conditions generate SEEK_MATE intent
 * - TC-BEH-18: Critical hazard triggers immediate FLEE intent
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  evaluateOrganismBehavior,
  evaluatePopulationBehavior,
  isCircadianActivePeriod,
  createActionIntentFromDecision
} from '../../game/behavior/behavior_decision_engine.js';

import {
  deriveBehaviorSeed,
  hash64
} from '../../game/behavior/seed_derivation.js';

import {
  BEHAVIOR_TYPES,
  URGENCY_CLASSES,
  TARGET_DOMAINS
} from '../../game/behavior/constants.js';

import { loadSpeciesProfile } from '../../game/lifecycle/profile_loader.js';
import { createOrganismState } from '../../game/lifecycle/organism_state.js';

function makeMockGenome() {
  return {
    species_id: 'xylotrupes_rhinoceros_proto',
    loci: {
      LOCUS_BODY_SCALE: [0.65, 0.70],
      LOCUS_CHITIN_DENSITY: [0.55, 0.60],
      LOCUS_CEPHALIC_HORN: [0.75, 0.80],
      LOCUS_THORACIC_HORN: [0.70, 0.75],
      LOCUS_METABOLIC_RATE: [0.45, 0.50],
      LOCUS_MANDIBLE_SPAN: [0.50, 0.55],
      LOCUS_CUTICLE_PIGMENT: [0.60, 0.65],
      LOCUS_ELYTRA_THICKNESS: [0.55, 0.60]
    }
  };
}

function makeMockPhenotype() {
  return {
    body_mass: 15.0,
    body_length: 50.0,
    chitin_hardness: 6.5,
    cephalic_horn_length: 22.0,
    thoracic_horn_length: 14.0,
    metabolic_efficiency: 0.95,
    mandible_spread: 8.0,
    cuticle_melanism: 0.80,
    elytra_rigidity: 7.0
  };
}

function makeMockDerivedStats(clashPower = 25.0) {
  return {
    clash_power: clashPower,
    crawl_speed: 1.2,
    perception_radius: 5.0,
    starvation_endurance_time: 120.0
  };
}

function createTestOrganism(profile, id = 'org_001', stageId = 'STAGE_ADULT', sex = 'MALE', clashPower = 25.0) {
  const org = createOrganismState({
    organismId: id,
    speciesProfile: profile,
    generation: 1,
    sex,
    genome: makeMockGenome(),
    phenotype: makeMockPhenotype(),
    derivedStats: makeMockDerivedStats(clashPower),
    simulationSeed: '0x1234567890abcdef'
  });
  org.current_stage_id = stageId;
  return org;
}

function createTestEnv(timeOfDay = 'NIGHT', hazard = 0.0) {
  return {
    temperature: 26.0,
    humidity: 0.80,
    food_resource: 50.0,
    hazard_rating: hazard,
    time_of_day: timeOfDay,
    season: 'MONSOON'
  };
}

describe('Phase 07-B: Individual Behavior Decision Engine Tests', () => {
  const profile = loadSpeciesProfile('data/species/xylotrupes_rhinoceros_proto.json');

  it('TC-BEH-01: Deterministic behavior decision with identical inputs', () => {
    const org = createTestOrganism(profile, 'org_001', 'STAGE_ADULT', 'MALE');
    org.nutrition_state.stored_energy = 60.0; // Moderate hunger (ratio 60/200 = 0.30 <= 0.50)
    const env = createTestEnv('NIGHT', 0.0);

    const res1 = evaluateOrganismBehavior({
      organismState: org,
      speciesProfile: profile,
      environmentSnapshot: env,
      simulationTick: 10,
      simulationSeed: '0x1234567890abcdef',
      populationId: 'pop_test'
    });

    const res2 = evaluateOrganismBehavior({
      organismState: org,
      speciesProfile: profile,
      environmentSnapshot: env,
      simulationTick: 10,
      simulationSeed: '0x1234567890abcdef',
      populationId: 'pop_test'
    });

    assert.ok(res1);
    assert.ok(res2);
    assert.deepEqual(res1.decision, res2.decision);
    assert.deepEqual(res1.intent, res2.intent);
  });

  it('TC-BEH-02: 100-run replay determinism', () => {
    const org = createTestOrganism(profile, 'org_replay', 'STAGE_ADULT', 'MALE');
    org.nutrition_state.stored_energy = 50.0;
    const env = createTestEnv('NIGHT', 0.1);

    const baseline = JSON.stringify(evaluateOrganismBehavior({
      organismState: org,
      speciesProfile: profile,
      environmentSnapshot: env,
      simulationTick: 25,
      simulationSeed: '0x1234567890abcdef',
      populationId: 'pop_replay'
    }));

    for (let i = 0; i < 100; i++) {
      const current = JSON.stringify(evaluateOrganismBehavior({
        organismState: org,
        speciesProfile: profile,
        environmentSnapshot: env,
        simulationTick: 25,
        simulationSeed: '0x1234567890abcdef',
        populationId: 'pop_replay'
      }));
      assert.equal(current, baseline, `Run ${i} diverged from baseline!`);
    }
  });

  it('TC-BEH-03: Pure evaluation does not mutate OrganismState', () => {
    const org = createTestOrganism(profile, 'org_pure', 'STAGE_ADULT', 'MALE');
    const snapshotBefore = JSON.stringify(org);
    const env = createTestEnv('NIGHT', 0.2);

    evaluateOrganismBehavior({
      organismState: org,
      speciesProfile: profile,
      environmentSnapshot: env,
      simulationTick: 5,
      simulationSeed: '0x1234567890abcdef',
      populationId: 'pop_pure'
    });

    const snapshotAfter = JSON.stringify(org);
    assert.equal(snapshotAfter, snapshotBefore, 'OrganismState was mutated by behavior evaluation!');
  });

  it('TC-BEH-04: Pure evaluation does not mutate SpeciesProfile', () => {
    const org = createTestOrganism(profile, 'org_pure_prof', 'STAGE_ADULT', 'MALE');
    const profileSnapshotBefore = JSON.stringify(profile);
    const env = createTestEnv('NIGHT', 0.0);

    evaluateOrganismBehavior({
      organismState: org,
      speciesProfile: profile,
      environmentSnapshot: env,
      simulationTick: 5,
      simulationSeed: '0x1234567890abcdef',
      populationId: 'pop_pure'
    });

    const profileSnapshotAfter = JSON.stringify(profile);
    assert.equal(profileSnapshotAfter, profileSnapshotBefore, 'SpeciesProfile was mutated by behavior evaluation!');
  });

  it('TC-BEH-05: Pure evaluation does not mutate EnvironmentSnapshot', () => {
    const org = createTestOrganism(profile, 'org_pure_env', 'STAGE_ADULT', 'MALE');
    const env = createTestEnv('DAY', 0.3);
    const envSnapshotBefore = JSON.stringify(env);

    evaluateOrganismBehavior({
      organismState: org,
      speciesProfile: profile,
      environmentSnapshot: env,
      simulationTick: 5,
      simulationSeed: '0x1234567890abcdef',
      populationId: 'pop_pure'
    });

    const envSnapshotAfter = JSON.stringify(env);
    assert.equal(envSnapshotAfter, envSnapshotBefore, 'EnvironmentSnapshot was mutated by behavior evaluation!');
  });

  it('TC-BEH-06: Dead organism produces no behavior (null decision & intent)', () => {
    const deadOrg = createTestOrganism(profile, 'org_dead', 'STAGE_ADULT', 'MALE');
    deadOrg.is_alive = false;
    deadOrg.status = 'DEAD';
    const env = createTestEnv('NIGHT', 0.0);

    const res = evaluateOrganismBehavior({
      organismState: deadOrg,
      speciesProfile: profile,
      environmentSnapshot: env,
      simulationTick: 1,
      simulationSeed: '0x1234567890abcdef',
      populationId: 'pop_test'
    });

    assert.equal(res, null, 'Dead organism must produce null behavior decision!');
  });

  it('TC-BEH-07: Egg/pupa stage restrictions (immobile stages only REST)', () => {
    const egg = createTestOrganism(profile, 'org_egg', 'STAGE_EGG', 'FEMALE');
    egg.nutrition_state.stored_energy = 10.0; // Even if hungry
    const pupa = createTestOrganism(profile, 'org_pupa', 'STAGE_PUPA', 'MALE');
    const env = createTestEnv('NIGHT', 0.9); // Even in high hazard

    const resEgg = evaluateOrganismBehavior({
      organismState: egg,
      speciesProfile: profile,
      environmentSnapshot: env,
      simulationTick: 1,
      simulationSeed: '0x1234567890abcdef',
      populationId: 'pop_test'
    });

    assert.ok(resEgg);
    assert.equal(resEgg.decision.behavior_type, BEHAVIOR_TYPES.REST);
    assert.equal(resEgg.decision.urgency_class, URGENCY_CLASSES.LOW);
    assert.equal(resEgg.intent.action_type, BEHAVIOR_TYPES.REST);
    assert.equal(resEgg.intent.payload, null);

    const resPupa = evaluateOrganismBehavior({
      organismState: pupa,
      speciesProfile: profile,
      environmentSnapshot: env,
      simulationTick: 1,
      simulationSeed: '0x1234567890abcdef',
      populationId: 'pop_test'
    });

    assert.ok(resPupa);
    assert.equal(resPupa.decision.behavior_type, BEHAVIOR_TYPES.REST);
    assert.equal(resPupa.intent.action_type, BEHAVIOR_TYPES.REST);
  });

  it('TC-BEH-08: Survival urgency dominates priority_score', () => {
    // Organism A: Starving to death (stored_energy 10 / 200 = 0.05 <= 0.15 starvation ratio)
    const orgStarving = createTestOrganism(profile, 'org_starving', 'STAGE_ADULT', 'MALE');
    orgStarving.nutrition_state.stored_energy = 10.0;
    orgStarving.nutrition_state.is_starving = true;

    // Organism B: Healthy adult ready to mate (stored_energy 180 / 200 = 0.90)
    const orgHealthy = createTestOrganism(profile, 'org_healthy', 'STAGE_ADULT', 'MALE');
    orgHealthy.nutrition_state.stored_energy = 180.0;
    orgHealthy.stage_age_ticks = 200; // >= min_mating_age_ticks (100)

    const env = createTestEnv('NIGHT', 0.0);

    const resStarving = evaluateOrganismBehavior({
      organismState: orgStarving,
      speciesProfile: profile,
      environmentSnapshot: env,
      simulationTick: 1,
      simulationSeed: '0x1234567890abcdef',
      populationId: 'pop_test'
    });

    const resHealthy = evaluateOrganismBehavior({
      organismState: orgHealthy,
      speciesProfile: profile,
      environmentSnapshot: env,
      simulationTick: 1,
      simulationSeed: '0x1234567890abcdef',
      populationId: 'pop_test'
    });

    assert.ok(resStarving);
    assert.ok(resHealthy);

    // Starving organism gets CRITICAL urgency
    assert.equal(resStarving.decision.urgency_class, URGENCY_CLASSES.CRITICAL);
    assert.equal(resStarving.decision.behavior_type, BEHAVIOR_TYPES.FORAGE);

    // Healthy organism gets NORMAL urgency
    assert.equal(resHealthy.decision.urgency_class, URGENCY_CLASSES.NORMAL);
    assert.equal(resHealthy.decision.behavior_type, BEHAVIOR_TYPES.SEEK_MATE);

    // INVARIANT: CRITICAL urgency always dominates NORMAL urgency regardless of raw priority scores
    const urgencyHierarchy = { CRITICAL: 4, HIGH: 3, NORMAL: 2, LOW: 1 };
    assert.ok(
      urgencyHierarchy[resStarving.decision.urgency_class] > urgencyHierarchy[resHealthy.decision.urgency_class]
    );
  });

  it('TC-BEH-09: Equal urgency + priority preserves clash_power in ActionIntent', () => {
    const orgWeak = createTestOrganism(profile, 'org_weak', 'STAGE_ADULT', 'MALE', 10.0);
    const orgStrong = createTestOrganism(profile, 'org_strong', 'STAGE_ADULT', 'MALE', 35.0);

    orgWeak.nutrition_state.stored_energy = 60.0;
    orgStrong.nutrition_state.stored_energy = 60.0;

    const env = createTestEnv('NIGHT', 0.0);

    const resWeak = evaluateOrganismBehavior({
      organismState: orgWeak,
      speciesProfile: profile,
      environmentSnapshot: env,
      simulationTick: 1,
      simulationSeed: '0x1234567890abcdef',
      populationId: 'pop_test'
    });

    const resStrong = evaluateOrganismBehavior({
      organismState: orgStrong,
      speciesProfile: profile,
      environmentSnapshot: env,
      simulationTick: 1,
      simulationSeed: '0x1234567890abcdef',
      populationId: 'pop_test'
    });

    assert.ok(resWeak);
    assert.ok(resStrong);

    assert.equal(resWeak.decision.urgency_class, resStrong.decision.urgency_class);
    assert.equal(resWeak.decision.priority_score, resStrong.decision.priority_score);

    // Derived clash_power is accurately propagated to intent
    assert.equal(resWeak.intent.clash_power, 10.0);
    assert.equal(resStrong.intent.clash_power, 35.0);
  });

  it('TC-BEH-10: Exact tie uses organism_id ASC canonical ordering', () => {
    const orgA = createTestOrganism(profile, 'org_alpha', 'STAGE_ADULT', 'MALE', 20.0);
    const orgB = createTestOrganism(profile, 'org_beta', 'STAGE_ADULT', 'MALE', 20.0);

    const env = createTestEnv('NIGHT', 0.0);

    const { decisions } = evaluatePopulationBehavior({
      organisms: [orgB, orgA], // Insert in reverse order
      speciesProfiles: { xylotrupes_rhinoceros_proto: profile },
      environmentSnapshot: env,
      simulationTick: 1,
      simulationSeed: '0x1234567890abcdef',
      populationId: 'pop_test'
    });

    assert.equal(decisions.length, 2);
    // Evaluated in canonical order: org_alpha then org_beta
    assert.equal(decisions[0].organism_id, 'org_alpha');
    assert.equal(decisions[1].organism_id, 'org_beta');
  });

  it('TC-BEH-11: Circadian alignment materially changes decision', () => {
    // Xylotrupes is NOCTURNAL
    const org = createTestOrganism(profile, 'org_circadian', 'STAGE_ADULT', 'MALE');
    org.nutrition_state.stored_energy = 160.0; // Well-fed (ratio 0.80)

    const nightEnv = createTestEnv('NIGHT', 0.0); // Active period
    const dayEnv = createTestEnv('DAY', 0.0);     // Inactive period

    const resNight = evaluateOrganismBehavior({
      organismState: org,
      speciesProfile: profile,
      environmentSnapshot: nightEnv,
      simulationTick: 1,
      simulationSeed: '0x1234567890abcdef',
      populationId: 'pop_test'
    });

    const resDay = evaluateOrganismBehavior({
      organismState: org,
      speciesProfile: profile,
      environmentSnapshot: dayEnv,
      simulationTick: 1,
      simulationSeed: '0x1234567890abcdef',
      populationId: 'pop_test'
    });

    assert.ok(resNight);
    assert.ok(resDay);

    // During NIGHT, active nocturnal insect explores or seeks mate
    assert.ok(resNight.decision.behavior_type !== BEHAVIOR_TYPES.REST || resNight.decision.priority_score < 0.5);

    // During DAY, inactive nocturnal insect prioritizes REST
    assert.equal(resDay.decision.behavior_type, BEHAVIOR_TYPES.REST);
    assert.equal(resDay.decision.urgency_class, URGENCY_CLASSES.NORMAL);
    assert.ok(resDay.decision.reason_codes.includes('CIRCADIAN_REST_PERIOD'));
  });

  it('TC-BEH-12: decision_seed is null for deterministic branch', () => {
    const org = createTestOrganism(profile, 'org_det', 'STAGE_ADULT', 'MALE');
    const env = createTestEnv('NIGHT', 0.0);

    const res = evaluateOrganismBehavior({
      organismState: org,
      speciesProfile: profile,
      environmentSnapshot: env,
      simulationTick: 1,
      simulationSeed: '0x1234567890abcdef',
      populationId: 'pop_test',
      enableStochasticTieBreak: false // Standard deterministic mode
    });

    assert.ok(res);
    assert.equal(res.decision.decision_seed, null);
  });

  it('TC-BEH-13: Stochastic branch uses exact domain-separated behavior seed', () => {
    const org = createTestOrganism(profile, 'org_stoch', 'STAGE_ADULT', 'MALE');
    const env = createTestEnv('NIGHT', 0.0);
    const simSeed = '0x1234567890abcdef';
    const popId = 'pop_stoch';
    const tick = 77;

    const res = evaluateOrganismBehavior({
      organismState: org,
      speciesProfile: profile,
      environmentSnapshot: env,
      simulationTick: tick,
      simulationSeed: simSeed,
      populationId: popId,
      enableStochasticTieBreak: true
    });

    assert.ok(res);
    const expectedSeed = deriveBehaviorSeed(simSeed, popId, tick, 'org_stoch');
    assert.equal(res.decision.decision_seed, expectedSeed);
    assert.ok(/^[0-9a-fA-F]{16}$/.test(res.decision.decision_seed));
  });

  it('TC-BEH-14: ActionIntent payload matches approved 07-A discriminated schema', () => {
    const org = createTestOrganism(profile, 'org_intent_val', 'STAGE_ADULT', 'MALE');
    org.nutrition_state.stored_energy = 50.0;
    const env = createTestEnv('NIGHT', 0.0);

    const res = evaluateOrganismBehavior({
      organismState: org,
      speciesProfile: profile,
      environmentSnapshot: env,
      simulationTick: 1,
      simulationSeed: '0x1234567890abcdef',
      populationId: 'pop_test'
    });

    assert.ok(res);
    const intent = res.intent;

    // Conforms to ForageActionIntent
    assert.equal(intent.action_type, BEHAVIOR_TYPES.FORAGE);
    assert.equal(typeof intent.intent_id, 'string');
    assert.equal(intent.organism_id, 'org_intent_val');
    assert.equal(intent.species_id, 'xylotrupes_rhinoceros_proto');
    assert.ok(intent.payload);
    assert.equal(typeof intent.payload.target_resource_type, 'string');
    assert.ok(intent.payload.requested_quantity > 0);
  });

  it('TC-BEH-15: No forbidden nondeterministic APIs in game/behavior/**', () => {
    const filesToAudit = [
      'game/behavior/constants.js',
      'game/behavior/seed_derivation.js',
      'game/behavior/behavior_decision_engine.js',
      'game/behavior/index.js'
    ];

    const forbiddenPatterns = [
      'Math.random',
      'Date.now',
      'new Date',
      'crypto.randomUUID',
      'crypto.randomBytes',
      'performance.now'
    ];

    for (const file of filesToAudit) {
      const content = readFileSync(file, 'utf8');
      for (const pattern of forbiddenPatterns) {
        assert.ok(
          !content.includes(pattern),
          `Forbidden API '${pattern}' detected in ${file}!`
        );
      }
    }
  });

  it('TC-BEH-16: evaluatePopulationBehavior is insertion-order invariant', () => {
    const org1 = createTestOrganism(profile, 'org_01', 'STAGE_ADULT', 'MALE');
    const org2 = createTestOrganism(profile, 'org_02', 'STAGE_ADULT', 'MALE');
    const org3 = createTestOrganism(profile, 'org_03', 'STAGE_ADULT', 'MALE');

    const env = createTestEnv('NIGHT', 0.0);
    const speciesMap = { xylotrupes_rhinoceros_proto: profile };

    const resForward = evaluatePopulationBehavior({
      organisms: [org1, org2, org3],
      speciesProfiles: speciesMap,
      environmentSnapshot: env,
      simulationTick: 5,
      simulationSeed: '0x1234567890abcdef',
      populationId: 'pop_test'
    });

    const resPermuted = evaluatePopulationBehavior({
      organisms: [org3, org1, org2],
      speciesProfiles: speciesMap,
      environmentSnapshot: env,
      simulationTick: 5,
      simulationSeed: '0x1234567890abcdef',
      populationId: 'pop_test'
    });

    assert.deepEqual(resForward.evaluation_result, resPermuted.evaluation_result);
    assert.deepEqual(resForward.intents, resPermuted.intents);
  });

  it('TC-BEH-17: Adult reproductive conditions generate SEEK_MATE intent', () => {
    const adultMale = createTestOrganism(profile, 'adult_male', 'STAGE_ADULT', 'MALE');
    adultMale.nutrition_state.stored_energy = 180.0;
    adultMale.stage_age_ticks = 150; // >= min_mating_age_ticks (100)
    adultMale.reproduction_cooldown_until_tick = 0;

    const env = createTestEnv('NIGHT', 0.0);

    const res = evaluateOrganismBehavior({
      organismState: adultMale,
      speciesProfile: profile,
      environmentSnapshot: env,
      simulationTick: 10,
      simulationSeed: '0x1234567890abcdef',
      populationId: 'pop_test'
    });

    assert.ok(res);
    assert.equal(res.decision.behavior_type, BEHAVIOR_TYPES.SEEK_MATE);
    assert.equal(res.intent.action_type, BEHAVIOR_TYPES.SEEK_MATE);
    assert.equal(res.intent.payload.target_criteria.compatible_species_id, 'xylotrupes_rhinoceros_proto');
    assert.equal(res.intent.payload.target_criteria.target_sex, 'FEMALE');
  });

  it('TC-BEH-18: Critical hazard triggers immediate FLEE intent', () => {
    const org = createTestOrganism(profile, 'org_flee', 'STAGE_ADULT', 'MALE');
    const envExtremeHazard = createTestEnv('NIGHT', 0.95); // > critical_hazard_threshold (0.80)

    const res = evaluateOrganismBehavior({
      organismState: org,
      speciesProfile: profile,
      environmentSnapshot: envExtremeHazard,
      simulationTick: 10,
      simulationSeed: '0x1234567890abcdef',
      populationId: 'pop_test'
    });

    assert.ok(res);
    assert.equal(res.decision.behavior_type, BEHAVIOR_TYPES.FLEE);
    assert.equal(res.decision.urgency_class, URGENCY_CLASSES.CRITICAL);
    assert.equal(res.intent.action_type, BEHAVIOR_TYPES.FLEE);
    assert.equal(res.intent.payload.threat_source, 'ENVIRONMENTAL_HAZARD');
  });
});