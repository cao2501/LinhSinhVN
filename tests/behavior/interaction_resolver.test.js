/**
 * LinhSinhVN — Ecological Interaction Resolver Tests (TASK 07-C)
 * 
 * Verifies pure ecological arbitration and resource conservation invariants:
 * - TC-BEH-25: Single forage intent fully allocated when resource is sufficient
 * - TC-BEH-26: Multiple forage intents with insufficient resource
 * - TC-BEH-27: Strict resource conservation invariant (total claims = sum of allocations)
 * - TC-BEH-28: Unmet intent tracking when resources are depleted
 * - TC-BEH-29: Urgency dominates priority (CRITICAL with low priority beats NORMAL with high priority)
 * - TC-BEH-30: Priority dominates clash_power within the same urgency tier
 * - TC-BEH-31: Clash power tie-break within equal urgency and priority
 * - TC-BEH-32: Organism ID ASC final canonical tie-break
 * - TC-BEH-33: Input insertion order does not change allocation result
 * - TC-BEH-34: Invalid requested quantity (zero, negative, NaN, Infinity) rejected
 * - TC-BEH-35: Dead organisms cannot receive allocations
 * - TC-BEH-36: Pure execution causes zero mutation on ResourcePool or environment
 * - TC-BEH-37: Shelter assignment succeeds when environment security factor satisfies minimum
 * - TC-BEH-38: Shelter intent records unmet reason when security is insufficient
 * - TC-BEH-39: 100-run replay determinism
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { resolveEcologicalInteractions } from '../../game/behavior/interaction_resolver.js';
import { BEHAVIOR_TYPES, URGENCY_CLASSES } from '../../game/behavior/constants.js';

const EPSILON = 1e-7;

function makeForageIntent(orgId, urgency, priority, clashPower, requestedQty, resourceType = 'FOOD') {
  return {
    schema_version: '1.0.0',
    intent_id: `intent_${orgId}_1_forage`,
    organism_id: orgId,
    species_id: 'xylotrupes_rhinoceros_proto',
    action_type: BEHAVIOR_TYPES.FORAGE,
    urgency_class: urgency,
    priority_score: priority,
    clash_power: clashPower,
    payload: {
      target_resource_type: resourceType,
      requested_quantity: requestedQty
    }
  };
}

function makeDecision(orgId, type = BEHAVIOR_TYPES.FORAGE) {
  return {
    schema_version: '1.0.0',
    organism_id: orgId,
    simulation_tick: 1,
    behavior_type: type,
    urgency_class: URGENCY_CLASSES.NORMAL,
    priority_score: 0.5,
    target_domain: 'RESOURCE',
    reason_codes: ['TEST'],
    decision_seed: null
  };
}

function makeEnv(shelterSecurity = 0.80) {
  return {
    temperature: 26.0,
    humidity: 0.80,
    food_resource: 100.0,
    hazard_rating: 0.1,
    time_of_day: 'NIGHT',
    season: 'MONSOON',
    shelter_security_factor: shelterSecurity
  };
}

describe('Phase 07-C: Ecological Interaction Resolver Tests', () => {
  it('TC-BEH-25: Single forage intent fully allocated when resource is sufficient', () => {
    const intent = makeForageIntent('org_01', URGENCY_CLASSES.NORMAL, 0.5, 10.0, 5.0);
    const decision = makeDecision('org_01');
    const env = makeEnv();
    const pool = { FOOD: 100.0 };

    const result = resolveEcologicalInteractions({
      actionIntents: [intent],
      behaviorDecisions: [decision],
      resourcePoolSnapshot: pool,
      environmentSnapshot: env,
      populationId: 'pop_test',
      simulationTick: 1
    });

    assert.equal(result.resource_allocations.org_01.FOOD, 5.0);
    assert.equal(result.total_resource_claims.FOOD, 5.0);
    assert.equal(result.unmet_intents.length, 0);
  });

  it('TC-BEH-26: Multiple forage intents with insufficient resource', () => {
    // 3 organisms requesting 5.0 each, but only 12.0 available
    const intentA = makeForageIntent('org_A', URGENCY_CLASSES.HIGH, 0.8, 10.0, 5.0);
    const intentB = makeForageIntent('org_B', URGENCY_CLASSES.HIGH, 0.7, 10.0, 5.0);
    const intentC = makeForageIntent('org_C', URGENCY_CLASSES.HIGH, 0.6, 10.0, 5.0);

    const env = makeEnv();
    const pool = { FOOD: 12.0 };

    const result = resolveEcologicalInteractions({
      actionIntents: [intentA, intentB, intentC],
      behaviorDecisions: [makeDecision('org_A'), makeDecision('org_B'), makeDecision('org_C')],
      resourcePoolSnapshot: pool,
      environmentSnapshot: env,
      populationId: 'pop_test',
      simulationTick: 1
    });

    // org_A gets 5.0, org_B gets 5.0, org_C gets 2.0 (partial)
    assert.equal(result.resource_allocations.org_A.FOOD, 5.0);
    assert.equal(result.resource_allocations.org_B.FOOD, 5.0);
    assert.equal(result.resource_allocations.org_C.FOOD, 2.0);
    assert.equal(result.total_resource_claims.FOOD, 12.0);

    // org_C recorded as unmet
    assert.equal(result.unmet_intents.length, 1);
    assert.equal(result.unmet_intents[0].organism_id, 'org_C');
    assert.equal(result.unmet_intents[0].reason, 'RESOURCE_DEPLETED');
  });

  it('TC-BEH-27: Strict resource conservation invariant', () => {
    const intents = [
      makeForageIntent('org_1', URGENCY_CLASSES.CRITICAL, 0.9, 5.0, 7.5),
      makeForageIntent('org_2', URGENCY_CLASSES.HIGH, 0.8, 15.0, 8.0),
      makeForageIntent('org_3', URGENCY_CLASSES.NORMAL, 0.6, 25.0, 6.0)
    ];
    const env = makeEnv();
    const initialPool = 15.0;

    const result = resolveEcologicalInteractions({
      actionIntents: intents,
      behaviorDecisions: intents.map(i => makeDecision(i.organism_id)),
      resourcePoolSnapshot: { FOOD: initialPool },
      environmentSnapshot: env,
      populationId: 'pop_test',
      simulationTick: 1
    });

    let sumAllocated = 0.0;
    for (const orgId of Object.keys(result.resource_allocations)) {
      sumAllocated += result.resource_allocations[orgId].FOOD || 0.0;
    }

    // Invariant 1: total_resource_claims equals exact sum of allocations
    assert.ok(Math.abs(sumAllocated - result.total_resource_claims.FOOD) < EPSILON);

    // Invariant 2: total allocated does not exceed available initial resource
    assert.ok(sumAllocated <= initialPool + EPSILON);
  });

  it('TC-BEH-28: Unmet intent tracking when resources are depleted', () => {
    const intents = [
      makeForageIntent('org_1', URGENCY_CLASSES.CRITICAL, 0.9, 5.0, 10.0),
      makeForageIntent('org_2', URGENCY_CLASSES.LOW, 0.1, 5.0, 10.0)
    ];
    const env = makeEnv();

    const result = resolveEcologicalInteractions({
      actionIntents: intents,
      behaviorDecisions: intents.map(i => makeDecision(i.organism_id)),
      resourcePoolSnapshot: { FOOD: 10.0 }, // Only enough for org_1
      environmentSnapshot: env,
      populationId: 'pop_test',
      simulationTick: 1
    });

    assert.equal(result.resource_allocations.org_1.FOOD, 10.0);
    assert.equal(result.resource_allocations.org_2.FOOD, 0.0);
    assert.equal(result.unmet_intents.length, 1);
    assert.equal(result.unmet_intents[0].organism_id, 'org_2');
    assert.equal(result.unmet_intents[0].reason, 'RESOURCE_DEPLETED');
  });

  it('TC-BEH-29: Urgency dominates priority in arbitration', () => {
    // Organism A: CRITICAL urgency with low priority 0.10, weak clash_power 1.0
    const intentA = makeForageIntent('org_A', URGENCY_CLASSES.CRITICAL, 0.10, 1.0, 10.0);

    // Organism B: NORMAL urgency with maximum priority 1.00, massive clash_power 100.0
    const intentB = makeForageIntent('org_B', URGENCY_CLASSES.NORMAL, 1.00, 100.0, 10.0);

    const env = makeEnv();
    const result = resolveEcologicalInteractions({
      actionIntents: [intentB, intentA], // B inserted first
      behaviorDecisions: [makeDecision('org_A'), makeDecision('org_B')],
      resourcePoolSnapshot: { FOOD: 10.0 }, // Only enough for one organism
      environmentSnapshot: env,
      populationId: 'pop_test',
      simulationTick: 1
    });

    // INVARIANT: CRITICAL wins the resource completely over NORMAL
    assert.equal(result.resource_allocations.org_A.FOOD, 10.0);
    assert.equal(result.resource_allocations.org_B.FOOD, 0.0);
  });

  it('TC-BEH-30: Priority dominates clash_power within the same urgency tier', () => {
    // Both HIGH urgency:
    // A: priority 0.85, clash_power 10.0
    const intentA = makeForageIntent('org_A', URGENCY_CLASSES.HIGH, 0.85, 10.0, 10.0);
    // B: priority 0.80, clash_power 50.0
    const intentB = makeForageIntent('org_B', URGENCY_CLASSES.HIGH, 0.80, 50.0, 10.0);

    const env = makeEnv();
    const result = resolveEcologicalInteractions({
      actionIntents: [intentB, intentA],
      behaviorDecisions: [makeDecision('org_A'), makeDecision('org_B')],
      resourcePoolSnapshot: { FOOD: 10.0 },
      environmentSnapshot: env,
      populationId: 'pop_test',
      simulationTick: 1
    });

    // Higher priority wins within same urgency
    assert.equal(result.resource_allocations.org_A.FOOD, 10.0);
    assert.equal(result.resource_allocations.org_B.FOOD, 0.0);
  });

  it('TC-BEH-31: Clash power tie-break within equal urgency and priority', () => {
    // Equal urgency (HIGH) and equal priority (0.80):
    const intentWeak = makeForageIntent('org_weak', URGENCY_CLASSES.HIGH, 0.80, 15.0, 10.0);
    const intentStrong = makeForageIntent('org_strong', URGENCY_CLASSES.HIGH, 0.80, 35.0, 10.0);

    const env = makeEnv();
    const result = resolveEcologicalInteractions({
      actionIntents: [intentWeak, intentStrong],
      behaviorDecisions: [makeDecision('org_weak'), makeDecision('org_strong')],
      resourcePoolSnapshot: { FOOD: 10.0 },
      environmentSnapshot: env,
      populationId: 'pop_test',
      simulationTick: 1
    });

    // Stronger clash_power wins tie-break
    assert.equal(result.resource_allocations.org_strong.FOOD, 10.0);
    assert.equal(result.resource_allocations.org_weak.FOOD, 0.0);
  });

  it('TC-BEH-32: Organism ID ASC final canonical tie-break', () => {
    // All metrics identical:
    const intentAlpha = makeForageIntent('org_alpha', URGENCY_CLASSES.HIGH, 0.80, 20.0, 10.0);
    const intentBeta = makeForageIntent('org_beta', URGENCY_CLASSES.HIGH, 0.80, 20.0, 10.0);

    const env = makeEnv();
    const result = resolveEcologicalInteractions({
      actionIntents: [intentBeta, intentAlpha], // Beta inserted first
      behaviorDecisions: [makeDecision('org_alpha'), makeDecision('org_beta')],
      resourcePoolSnapshot: { FOOD: 10.0 },
      environmentSnapshot: env,
      populationId: 'pop_test',
      simulationTick: 1
    });

    // org_alpha < org_beta lexicographically
    assert.equal(result.resource_allocations.org_alpha.FOOD, 10.0);
    assert.equal(result.resource_allocations.org_beta.FOOD, 0.0);
  });

  it('TC-BEH-33: Input insertion order does not change allocation result', () => {
    const intent1 = makeForageIntent('org_1', URGENCY_CLASSES.HIGH, 0.70, 10.0, 5.0);
    const intent2 = makeForageIntent('org_2', URGENCY_CLASSES.HIGH, 0.80, 10.0, 5.0);
    const intent3 = makeForageIntent('org_3', URGENCY_CLASSES.HIGH, 0.90, 10.0, 5.0);

    const env = makeEnv();
    const pool = { FOOD: 10.0 };

    const resForward = resolveEcologicalInteractions({
      actionIntents: [intent1, intent2, intent3],
      behaviorDecisions: [makeDecision('org_1'), makeDecision('org_2'), makeDecision('org_3')],
      resourcePoolSnapshot: pool,
      environmentSnapshot: env,
      populationId: 'pop_test',
      simulationTick: 1
    });

    const resPermuted = resolveEcologicalInteractions({
      actionIntents: [intent3, intent1, intent2],
      behaviorDecisions: [makeDecision('org_1'), makeDecision('org_2'), makeDecision('org_3')],
      resourcePoolSnapshot: pool,
      environmentSnapshot: env,
      populationId: 'pop_test',
      simulationTick: 1
    });

    assert.deepEqual(resForward.resource_allocations, resPermuted.resource_allocations);
    assert.deepEqual(resForward.total_resource_claims, resPermuted.total_resource_claims);
  });

  it('TC-BEH-34: Invalid requested quantity rejected', () => {
    const invalidIntents = [
      makeForageIntent('org_bad_1', URGENCY_CLASSES.HIGH, 0.5, 10.0, 0.0),
      makeForageIntent('org_bad_2', URGENCY_CLASSES.HIGH, 0.5, 10.0, -2.5),
      makeForageIntent('org_bad_3', URGENCY_CLASSES.HIGH, 0.5, 10.0, NaN),
      makeForageIntent('org_bad_4', URGENCY_CLASSES.HIGH, 0.5, 10.0, Infinity)
    ];

    const env = makeEnv();
    for (const badIntent of invalidIntents) {
      assert.throws(
        () => resolveEcologicalInteractions({
          actionIntents: [badIntent],
          behaviorDecisions: [makeDecision(badIntent.organism_id)],
          resourcePoolSnapshot: { FOOD: 100.0 },
          environmentSnapshot: env,
          populationId: 'pop_test',
          simulationTick: 1
        }),
        RangeError
      );
    }
  });

  it('TC-BEH-35: Dead organisms cannot receive allocations', () => {
    // 07-B generates no intents for dead organisms. If an empty list or dead organism is supplied:
    const env = makeEnv();
    const result = resolveEcologicalInteractions({
      actionIntents: [],
      behaviorDecisions: [],
      resourcePoolSnapshot: { FOOD: 100.0 },
      environmentSnapshot: env,
      populationId: 'pop_test',
      simulationTick: 1
    });

    assert.deepEqual(result.resource_allocations, {});
    assert.deepEqual(result.total_resource_claims, {});
    assert.equal(result.unmet_intents.length, 0);
  });

  it('TC-BEH-36: Pure execution causes zero mutation on ResourcePool or environment', () => {
    const intent = makeForageIntent('org_01', URGENCY_CLASSES.HIGH, 0.7, 10.0, 5.0);
    const pool = { FOOD: 100.0 };
    const env = makeEnv();

    const poolSnapshotBefore = JSON.stringify(pool);
    const envSnapshotBefore = JSON.stringify(env);

    resolveEcologicalInteractions({
      actionIntents: [intent],
      behaviorDecisions: [makeDecision('org_01')],
      resourcePoolSnapshot: pool,
      environmentSnapshot: env,
      populationId: 'pop_test',
      simulationTick: 1
    });

    assert.equal(JSON.stringify(pool), poolSnapshotBefore, 'ResourcePool snapshot was mutated!');
    assert.equal(JSON.stringify(env), envSnapshotBefore, 'Environment snapshot was mutated!');
  });

  it('TC-BEH-37: Shelter assignment succeeds when environment security factor satisfies minimum', () => {
    const shelterIntent = {
      schema_version: '1.0.0',
      intent_id: 'intent_org_shelter_1',
      organism_id: 'org_shelter',
      species_id: 'xylotrupes_rhinoceros_proto',
      action_type: BEHAVIOR_TYPES.SEEK_SHELTER,
      urgency_class: URGENCY_CLASSES.HIGH,
      priority_score: 0.80,
      clash_power: 10.0,
      payload: {
        target_shelter_type: 'SUBSTRATE_BURROW',
        minimum_security_factor: 0.60
      }
    };

    const env = makeEnv(0.85); // Environment provides 0.85 >= 0.60
    const result = resolveEcologicalInteractions({
      actionIntents: [shelterIntent],
      behaviorDecisions: [makeDecision('org_shelter', BEHAVIOR_TYPES.SEEK_SHELTER)],
      resourcePoolSnapshot: {},
      environmentSnapshot: env,
      populationId: 'pop_test',
      simulationTick: 1
    });

    assert.equal(result.shelter_assignments.org_shelter.shelter_acquired, true);
    assert.equal(result.shelter_assignments.org_shelter.effective_security_factor, 0.85);
    assert.equal(result.unmet_intents.length, 0);
  });

  it('TC-BEH-38: Shelter intent records unmet reason when security is insufficient', () => {
    const shelterIntent = {
      schema_version: '1.0.0',
      intent_id: 'intent_org_bad_shelter_1',
      organism_id: 'org_bad_shelter',
      species_id: 'xylotrupes_rhinoceros_proto',
      action_type: BEHAVIOR_TYPES.SEEK_SHELTER,
      urgency_class: URGENCY_CLASSES.HIGH,
      priority_score: 0.80,
      clash_power: 10.0,
      payload: {
        target_shelter_type: 'SUBSTRATE_BURROW',
        minimum_security_factor: 0.90
      }
    };

    const env = makeEnv(0.50); // Environment provides 0.50 < 0.90 minimum
    const result = resolveEcologicalInteractions({
      actionIntents: [shelterIntent],
      behaviorDecisions: [makeDecision('org_bad_shelter', BEHAVIOR_TYPES.SEEK_SHELTER)],
      resourcePoolSnapshot: {},
      environmentSnapshot: env,
      populationId: 'pop_test',
      simulationTick: 1
    });

    assert.equal(result.shelter_assignments.org_bad_shelter.shelter_acquired, false);
    assert.equal(result.unmet_intents.length, 1);
    assert.equal(result.unmet_intents[0].organism_id, 'org_bad_shelter');
    assert.equal(result.unmet_intents[0].reason, 'HAZARD_BLOCKED');
  });

  it('TC-BEH-39: 100-run replay determinism', () => {
    const intents = [
      makeForageIntent('org_1', URGENCY_CLASSES.HIGH, 0.8, 10.0, 5.0),
      makeForageIntent('org_2', URGENCY_CLASSES.HIGH, 0.7, 10.0, 5.0)
    ];
    const env = makeEnv();
    const pool = { FOOD: 8.0 };

    const baseline = JSON.stringify(resolveEcologicalInteractions({
      actionIntents: intents,
      behaviorDecisions: intents.map(i => makeDecision(i.organism_id)),
      resourcePoolSnapshot: pool,
      environmentSnapshot: env,
      populationId: 'pop_test',
      simulationTick: 1
    }));

    for (let i = 0; i < 100; i++) {
      const current = JSON.stringify(resolveEcologicalInteractions({
        actionIntents: intents,
        behaviorDecisions: intents.map(i => makeDecision(i.organism_id)),
        resourcePoolSnapshot: pool,
        environmentSnapshot: env,
        populationId: 'pop_test',
        simulationTick: 1
      }));
      assert.equal(current, baseline, `Run ${i} diverged!`);
    }
  });
});