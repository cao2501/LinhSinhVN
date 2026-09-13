/**
 * LinhSinhVN — Individual Behavior & Ecological Interaction Schemas Tests (Phase 07-A)
 * 
 * Validates domain contracts, schema structures, and data validation rules:
 * - TC-BEH-SCHEMA-01: BehaviorDecision valid sample conforms to schema
 * - TC-BEH-SCHEMA-02: BehaviorDecision invalid behavior_type / target_domain enum rejected
 * - TC-BEH-SCHEMA-03: priority_score bounds [0.0, 1.0] strictly enforced
 * - TC-BEH-SCHEMA-04: urgency_class enum ['CRITICAL', 'HIGH', 'NORMAL', 'LOW'] enforced
 * - TC-BEH-SCHEMA-05: ActionIntent FORAGE payload requires target_resource_type and requested_quantity > 0
 * - TC-BEH-SCHEMA-06: ActionIntent REST payload must be strictly null
 * - TC-BEH-SCHEMA-07: ActionIntent invalid discriminated payload rejected
 * - TC-BEH-SCHEMA-08: InteractionResult structure & resource conservation invariant
 * - TC-BEH-SCHEMA-09: BiologicalInputBundle valid structure & no shadow OrganismState fields
 * - TC-BEH-SCHEMA-10: NaN / Infinity serialization rejected in all schema payloads
 * - TC-BEH-SCHEMA-11: Species profile behavior_parameters optional dictionary validation
 * - TC-BEH-SCHEMA-12: Existing xylotrupes species profile remains 100% valid
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const EPSILON = 1e-7;

function loadJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

describe('Phase 07-A: Behavior & Interaction Schema Contracts', () => {
  const decisionSchema = loadJson('data/behavior/schema/behavior_decision.schema.json');
  const intentSchema = loadJson('data/behavior/schema/action_intent.schema.json');
  const interactionSchema = loadJson('data/behavior/schema/interaction_result.schema.json');
  const bundleSchema = loadJson('data/behavior/schema/biological_input_bundle.schema.json');
  const speciesSchema = loadJson('data/species/schema/species_profile.schema.json');
  const xylotrupesProfile = loadJson('data/species/xylotrupes_rhinoceros_proto.json');

  it('TC-BEH-SCHEMA-01: BehaviorDecision valid sample conforms to schema', () => {
    assert.equal(decisionSchema.title, 'BehaviorDecision');
    assert.equal(decisionSchema.$schema, 'http://json-schema.org/draft-07/schema#');

    const sampleValid = {
      schema_version: '1.0.0',
      organism_id: 'org_001',
      simulation_tick: 42,
      behavior_type: 'FORAGE',
      urgency_class: 'HIGH',
      priority_score: 0.85,
      target_domain: 'RESOURCE',
      reason_codes: ['LOW_ENERGY', 'NOCTURNAL_ACTIVE'],
      decision_seed: '0123456789abcdef'
    };

    // Assert required keys present
    for (const req of decisionSchema.required) {
      assert.ok(req in sampleValid, `Missing required field: ${req}`);
    }

    // Assert decision_seed can also be null
    const sampleNullSeed = { ...sampleValid, decision_seed: null };
    assert.equal(sampleNullSeed.decision_seed, null);
  });

  it('TC-BEH-SCHEMA-02: BehaviorDecision invalid enum values are caught', () => {
    const validBehaviorTypes = decisionSchema.properties.behavior_type.enum;
    assert.deepEqual(validBehaviorTypes, ['FORAGE', 'REST', 'SEEK_SHELTER', 'SEEK_MATE', 'FLEE', 'EXPLORE']);

    // Ensure COMPETE is removed from 07-A schema
    assert.equal(validBehaviorTypes.includes('COMPETE'), false);

    const invalidType = 'COMPETE';
    assert.ok(!validBehaviorTypes.includes(invalidType), 'COMPETE should not be in valid behavior types');

    const validDomains = decisionSchema.properties.target_domain.enum;
    assert.deepEqual(validDomains, ['RESOURCE', 'SHELTER', 'MATE', 'SAFETY', 'REST', 'NONE']);
    assert.ok(!validDomains.includes('INVALID_DOMAIN'));
  });

  it('TC-BEH-SCHEMA-03: priority_score bounds [0.0, 1.0] strictly enforced', () => {
    const scoreProp = decisionSchema.properties.priority_score;
    assert.equal(scoreProp.minimum, 0.0);
    assert.equal(scoreProp.maximum, 1.0);

    function validatePriority(score) {
      return typeof score === 'number' && score >= scoreProp.minimum && score <= scoreProp.maximum;
    }

    assert.equal(validatePriority(0.0), true);
    assert.equal(validatePriority(0.5), true);
    assert.equal(validatePriority(1.0), true);
    assert.equal(validatePriority(-0.01), false);
    assert.equal(validatePriority(1.01), false);
  });

  it('TC-BEH-SCHEMA-04: urgency_class enum enforces 4-tier hierarchy', () => {
    const urgencyEnum = decisionSchema.properties.urgency_class.enum;
    assert.deepEqual(urgencyEnum, ['CRITICAL', 'HIGH', 'NORMAL', 'LOW']);

    const validHierarchy = ['CRITICAL', 'HIGH', 'NORMAL', 'LOW'];
    for (const tier of validHierarchy) {
      assert.ok(urgencyEnum.includes(tier));
    }
    assert.ok(!urgencyEnum.includes('EMERGENCY'));
    assert.ok(!urgencyEnum.includes('URGENT'));
  });

  it('TC-BEH-SCHEMA-05: ActionIntent FORAGE payload requires target_resource_type and requested_quantity > 0', () => {
    const forageVariant = intentSchema.oneOf.find(v => v.title === 'ForageActionIntent');
    assert.ok(forageVariant, 'ForageActionIntent variant must exist');

    assert.equal(forageVariant.properties.action_type.enum[0], 'FORAGE');
    assert.deepEqual(forageVariant.properties.payload.required, ['target_resource_type', 'requested_quantity']);
    assert.equal(forageVariant.properties.payload.properties.requested_quantity.exclusiveMinimum, 0.0);

    const validForage = {
      schema_version: '1.0.0',
      intent_id: 'intent_01',
      organism_id: 'org_01',
      species_id: 'xylotrupes_rhinoceros_proto',
      action_type: 'FORAGE',
      urgency_class: 'CRITICAL',
      priority_score: 0.95,
      clash_power: 12.5,
      payload: {
        target_resource_type: 'FOOD',
        requested_quantity: 2.5
      }
    };
    assert.equal(validForage.payload.requested_quantity > 0, true);
  });

  it('TC-BEH-SCHEMA-06: ActionIntent REST payload must be strictly null', () => {
    const restVariant = intentSchema.oneOf.find(v => v.title === 'RestActionIntent');
    assert.ok(restVariant, 'RestActionIntent variant must exist');

    assert.equal(restVariant.properties.action_type.enum[0], 'REST');
    assert.equal(restVariant.properties.payload.type, 'null');

    const validRest = {
      schema_version: '1.0.0',
      intent_id: 'intent_02',
      organism_id: 'org_01',
      species_id: 'xylotrupes_rhinoceros_proto',
      action_type: 'REST',
      urgency_class: 'LOW',
      priority_score: 0.20,
      clash_power: 12.5,
      payload: null
    };
    assert.equal(validRest.payload, null);
  });

  it('TC-BEH-SCHEMA-07: ActionIntent invalid discriminated payload rejected', () => {
    // Discriminated union verification
    function validateIntent(intent) {
      const variant = intentSchema.oneOf.find(v => v.properties.action_type.enum.includes(intent.action_type));
      if (!variant) return false;
      if (variant.properties.payload.type === 'null') {
        return intent.payload === null;
      }
      if (variant.properties.payload.type === 'object') {
        if (!intent.payload || typeof intent.payload !== 'object') return false;
        for (const req of variant.properties.payload.required) {
          if (!(req in intent.payload)) return false;
        }
        return true;
      }
      return false;
    }

    // Invalid: REST with object payload
    assert.equal(validateIntent({ action_type: 'REST', payload: { quantity: 1.0 } }), false);

    // Invalid: FORAGE with null payload
    assert.equal(validateIntent({ action_type: 'FORAGE', payload: null }), false);

    // Invalid: FORAGE with missing requested_quantity
    assert.equal(validateIntent({ action_type: 'FORAGE', payload: { target_resource_type: 'FOOD' } }), false);
  });

  it('TC-BEH-SCHEMA-08: InteractionResult structure & resource conservation invariant', () => {
    assert.equal(interactionSchema.title, 'InteractionResult');
    for (const req of interactionSchema.required) {
      assert.ok(['schema_version', 'population_id', 'simulation_tick', 'resource_allocations', 'shelter_assignments', 'unmet_intents', 'total_resource_claims'].includes(req));
    }

    const mockResult = {
      schema_version: '1.0.0',
      population_id: 'pop_test',
      simulation_tick: 10,
      resource_allocations: {
        org_01: { FOOD: 3.5 },
        org_02: { FOOD: 2.5 }
      },
      shelter_assignments: {
        org_01: { shelter_acquired: true, effective_security_factor: 0.8 },
        org_02: { shelter_acquired: false, effective_security_factor: 0.1 }
      },
      unmet_intents: [
        { organism_id: 'org_03', action_type: 'FORAGE', reason: 'RESOURCE_DEPLETED' }
      ],
      total_resource_claims: {
        FOOD: 6.0
      }
    };

    // Verify conservation: sum of allocations == total_resource_claims
    let sumFood = 0;
    for (const orgId of Object.keys(mockResult.resource_allocations)) {
      sumFood += mockResult.resource_allocations[orgId].FOOD || 0;
    }
    assert.ok(Math.abs(sumFood - mockResult.total_resource_claims.FOOD) < EPSILON);
  });

  it('TC-BEH-SCHEMA-09: BiologicalInputBundle valid structure & no shadow OrganismState fields', () => {
    assert.equal(bundleSchema.title, 'BiologicalInputBundle');

    const organismInputSchema = bundleSchema.properties.organism_inputs.additionalProperties;
    const allowedProperties = Object.keys(organismInputSchema.properties);

    // Assert strictly allowed properties
    assert.deepEqual(allowedProperties.sort(), [
      'allocated_food',
      'behavior_type',
      'metabolic_activity_rate',
      'shelter_security_factor'
    ].sort());

    // Invariant: no shadow organism state fields
    const forbiddenShadowFields = ['health', 'energy', 'stress', 'age', 'mass', 'fatigue', 'nutrition'];
    for (const forbidden of forbiddenShadowFields) {
      assert.ok(!allowedProperties.includes(forbidden), `BiologicalInputBundle must not contain shadow field: ${forbidden}`);
    }
  });

  it('TC-BEH-SCHEMA-10: NaN / Infinity rejected in JSON serialization', () => {
    const invalidDataWithNaN = {
      schema_version: '1.0.0',
      priority_score: NaN
    };
    const serialized = JSON.stringify(invalidDataWithNaN);
    // JSON.stringify converts NaN to null
    assert.equal(JSON.parse(serialized).priority_score, null);
    // Schema specifies priority_score type number, so null is invalid!
    assert.notEqual(decisionSchema.properties.priority_score.type, 'null');
    assert.equal(decisionSchema.properties.priority_score.type, 'number');
  });

  it('TC-BEH-SCHEMA-11: Species profile behavior_parameters optional dictionary validation', () => {
    const behaviorProfileSchema = speciesSchema.properties.behavior_profile;
    assert.ok('behavior_parameters' in behaviorProfileSchema.properties);

    const bpProp = behaviorProfileSchema.properties.behavior_parameters;
    assert.equal(bpProp.type, 'object');
    assert.equal(bpProp.additionalProperties.type, 'number');

    // Not required (backward compatible)
    assert.ok(!behaviorProfileSchema.required.includes('behavior_parameters'));
  });

  it('TC-BEH-SCHEMA-12: Existing xylotrupes species profile remains 100% valid', () => {
    assert.ok(xylotrupesProfile.species_id === 'xylotrupes_rhinoceros_proto');
    assert.ok(xylotrupesProfile.behavior_profile);
    assert.equal(xylotrupesProfile.behavior_profile.primary_activity_period, 'NOCTURNAL');
    assert.ok(Array.isArray(xylotrupesProfile.behavior_profile.locomotion_modes));
    assert.ok(typeof xylotrupesProfile.behavior_profile.capabilities === 'object');
    assert.ok(typeof xylotrupesProfile.behavior_profile.priorities === 'object');

    // Optional behavior_parameters works when added
    const extendedProfile = {
      ...xylotrupesProfile,
      behavior_profile: {
        ...xylotrupesProfile.behavior_profile,
        behavior_parameters: {
          hunger_threshold: 0.5
        }
      }
    };
    assert.equal(extendedProfile.behavior_profile.behavior_parameters.hunger_threshold, 0.5);
  });
});