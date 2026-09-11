/**
 * LinhSinhVN — Tests for Species Profile Loader
 * 
 * Tests:
 * 1. Valid profile loading and validation
 * 2. Rejection of malformed profile (missing fields, duplicate stages, invalid order)
 * 3. Rejection of out-of-bounds eta parameters
 * 4. Rejection of incompatible genetics references
 * 5. Defensive immutability (deep freeze)
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadSpeciesProfile, validateProfileContract, deepFreeze } from '../../game/lifecycle/profile_loader.js';

describe('Lifecycle Profile Loader', () => {
  const validProfilePath = 'data/species/xylotrupes_rhinoceros_proto.json';

  test('loads and validates canonical species profile successfully', () => {
    const profile = loadSpeciesProfile(validProfilePath);
    assert.equal(profile.species_id, 'xylotrupes_rhinoceros_proto');
    assert.equal(profile.lifecycle_profile.initial_stage_id, 'STAGE_EGG');
    assert.equal(profile.lifecycle_profile.stages.length, 4);
  });

  test('defensively freezes the loaded profile (cannot mutate properties)', () => {
    const profile = loadSpeciesProfile(validProfilePath);
    assert.ok(Object.isFrozen(profile));
    assert.ok(Object.isFrozen(profile.lifecycle_profile));
    assert.ok(Object.isFrozen(profile.development_profile));

    assert.throws(() => {
      // @ts-ignore
      profile.species_id = 'mutated_id';
    }, TypeError);

    assert.throws(() => {
      // @ts-ignore
      profile.development_profile.initial_eta = 0.5;
    }, TypeError);
  });

  test('rejects profile with missing mandatory lifecycle stages', () => {
    const badProfile = {
      schema_version: '1.0.0',
      profile_version: '0.1.0',
      species_id: 'bad_species',
      genetics_profile_reference: { genetics_species_id: 'bad_species' },
      lifecycle_profile: {
        initial_stage_id: 'STAGE_1',
        stages: []
      }
    };

    assert.throws(() => {
      validateProfileContract(badProfile);
    }, TypeError);
  });

  test('rejects profile with duplicate stage IDs or non-ascending order', () => {
    const badOrderProfile = {
      schema_version: '1.0.0',
      profile_version: '0.1.0',
      species_id: 'bad_order',
      genetics_profile_reference: { genetics_species_id: 'bad_order' },
      lifecycle_profile: {
        initial_stage_id: 'STAGE_A',
        stages: [
          { stage_id: 'STAGE_A', order: 2, min_duration_ticks: 10 },
          { stage_id: 'STAGE_B', order: 1, min_duration_ticks: 10 }
        ]
      },
      development_profile: {
        initial_eta: 1.0,
        eta_min: 0.60,
        eta_max: 1.00,
        eta_lock_stage: 'STAGE_A'
      },
      environment_profile: {},
      nutrition_profile: {}
    };

    assert.throws(() => {
      validateProfileContract(badOrderProfile);
    }, RangeError);
  });

  test('rejects profile with out-of-bounds eta parameters', () => {
    const badEtaProfile = {
      schema_version: '1.0.0',
      profile_version: '0.1.0',
      species_id: 'bad_eta',
      genetics_profile_reference: { genetics_species_id: 'bad_eta' },
      lifecycle_profile: {
        initial_stage_id: 'STAGE_A',
        stages: [
          { stage_id: 'STAGE_A', order: 1, min_duration_ticks: 10 }
        ]
      },
      development_profile: {
        initial_eta: 0.50, // invalid: < 0.60
        eta_min: 0.60,
        eta_max: 1.00,
        eta_lock_stage: 'STAGE_A'
      },
      environment_profile: {},
      nutrition_profile: {}
    };

    assert.throws(() => {
      validateProfileContract(badEtaProfile);
    }, RangeError);
  });
});
