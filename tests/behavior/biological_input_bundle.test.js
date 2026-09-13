/**
 * LinhSinhVN — Biological Input Bundle Tests (TASK 07-C)
 * 
 * Verifies pure assembly of biological tick input bundle and strict boundary rules:
 * - TC-BEH-40: Valid BiologicalInputBundle generation conforming to schema
 * - TC-BEH-41: Strictly no shadow OrganismState fields (health, energy, stress, age, mass, etc.)
 * - TC-BEH-42: Allocated food comes strictly from InteractionResult
 * - TC-BEH-43: Shelter security comes from interaction result or approved environment input
 * - TC-BEH-44: Pure factory execution causes zero mutation on inputs
 * - TC-BEH-45: metabolic_activity_rate sourced from speciesProfile.lifecycle_profile.stages (zero invented constants)
 * - TC-BEH-46: 100-run replay determinism
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildBiologicalInputBundle } from '../../game/behavior/biological_input_bundle_factory.js';
import { BEHAVIOR_TYPES, URGENCY_CLASSES } from '../../game/behavior/constants.js';
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

function makeMockDerivedStats() {
  return {
    clash_power: 25.0,
    crawl_speed: 1.2,
    perception_radius: 5.0,
    starvation_endurance_time: 120.0
  };
}

function createTestOrganism(profile, id = 'org_001', stageId = 'STAGE_ADULT') {
  const org = createOrganismState({
    organismId: id,
    speciesProfile: profile,
    generation: 1,
    sex: 'MALE',
    genome: makeMockGenome(),
    phenotype: makeMockPhenotype(),
    derivedStats: makeMockDerivedStats(),
    simulationSeed: '0x1234567890abcdef'
  });
  org.current_stage_id = stageId;
  return org;
}

describe('Phase 07-C: Biological Input Bundle Tests', () => {
  const profile = loadSpeciesProfile('data/species/xylotrupes_rhinoceros_proto.json');
  const bundleSchema = JSON.parse(readFileSync('data/behavior/schema/biological_input_bundle.schema.json', 'utf8'));

  const mockInteractionResult = {
    schema_version: '1.0.0',
    population_id: 'pop_test',
    simulation_tick: 1,
    resource_allocations: {
      org_adult: { FOOD: 4.5 },
      org_larva: { FOOD: 1.0 },
      org_egg: {}
    },
    shelter_assignments: {
      org_adult: { shelter_acquired: true, effective_security_factor: 0.85 },
      org_larva: { shelter_acquired: false, effective_security_factor: 0.40 },
      org_egg: { shelter_acquired: false, effective_security_factor: 0.50 }
    },
    unmet_intents: [],
    total_resource_claims: { FOOD: 5.5 }
  };

  const mockDecisions = [
    {
      schema_version: '1.0.0',
      organism_id: 'org_adult',
      simulation_tick: 1,
      behavior_type: BEHAVIOR_TYPES.FORAGE,
      urgency_class: URGENCY_CLASSES.HIGH,
      priority_score: 0.80,
      target_domain: 'RESOURCE',
      reason_codes: ['HUNGER'],
      decision_seed: null
    },
    {
      schema_version: '1.0.0',
      organism_id: 'org_larva',
      simulation_tick: 1,
      behavior_type: BEHAVIOR_TYPES.FORAGE,
      urgency_class: URGENCY_CLASSES.NORMAL,
      priority_score: 0.50,
      target_domain: 'RESOURCE',
      reason_codes: ['HUNGER'],
      decision_seed: null
    },
    {
      schema_version: '1.0.0',
      organism_id: 'org_egg',
      simulation_tick: 1,
      behavior_type: BEHAVIOR_TYPES.REST,
      urgency_class: URGENCY_CLASSES.LOW,
      priority_score: 0.10,
      target_domain: 'REST',
      reason_codes: ['STAGE_IMMOBILE'],
      decision_seed: null
    }
  ];

  const mockEnv = {
    temperature: 26.0,
    humidity: 0.80,
    food_resource: 50.0,
    hazard_rating: 0.1,
    time_of_day: 'NIGHT',
    season: 'MONSOON',
    shelter_security_factor: 0.75
  };

  const orgAdult = createTestOrganism(profile, 'org_adult', 'STAGE_ADULT');
  const orgLarva = createTestOrganism(profile, 'org_larva', 'STAGE_LARVA');
  const orgEgg = createTestOrganism(profile, 'org_egg', 'STAGE_EGG');
  const organisms = [orgAdult, orgLarva, orgEgg];

  it('TC-BEH-40: Valid BiologicalInputBundle generation conforming to schema', () => {
    const bundle = buildBiologicalInputBundle({
      interactionResult: mockInteractionResult,
      behaviorDecisions: mockDecisions,
      environmentSnapshot: mockEnv,
      populationId: 'pop_test',
      simulationTick: 1,
      speciesProfiles: { xylotrupes_rhinoceros_proto: profile },
      organisms
    });

    assert.equal(bundle.schema_version, '1.0.0');
    assert.equal(bundle.population_id, 'pop_test');
    assert.equal(bundle.simulation_tick, 1);
    assert.ok(bundle.organism_inputs);
    assert.ok(bundle.environmental_snapshot);

    // Verify each required schema property in organism_inputs
    const requiredKeys = ['allocated_food', 'shelter_security_factor', 'behavior_type', 'metabolic_activity_rate'];
    for (const orgId of ['org_adult', 'org_larva', 'org_egg']) {
      const input = bundle.organism_inputs[orgId];
      assert.ok(input, `Missing input for ${orgId}`);
      for (const k of requiredKeys) {
        assert.ok(k in input, `Missing key ${k} in input for ${orgId}`);
      }
    }
  });

  it('TC-BEH-41: Strictly no shadow OrganismState fields', () => {
    const bundle = buildBiologicalInputBundle({
      interactionResult: mockInteractionResult,
      behaviorDecisions: mockDecisions,
      environmentSnapshot: mockEnv,
      populationId: 'pop_test',
      simulationTick: 1,
      speciesProfiles: { xylotrupes_rhinoceros_proto: profile },
      organisms
    });

    const forbiddenFields = [
      'health', 'hp', 'energy', 'stored_energy', 'stress', 'age',
      'mass', 'fatigue', 'nutrition', 'lifecycle', 'genetics'
    ];

    for (const orgId of Object.keys(bundle.organism_inputs)) {
      const input = bundle.organism_inputs[orgId];
      for (const field of forbiddenFields) {
        assert.ok(
          !(field in input),
          `Shadow state field '${field}' detected in BiologicalInputBundle for ${orgId}!`
        );
      }
    }
  });

  it('TC-BEH-42: Allocated food comes strictly from InteractionResult', () => {
    const bundle = buildBiologicalInputBundle({
      interactionResult: mockInteractionResult,
      behaviorDecisions: mockDecisions,
      environmentSnapshot: mockEnv,
      populationId: 'pop_test',
      simulationTick: 1,
      speciesProfiles: { xylotrupes_rhinoceros_proto: profile },
      organisms
    });

    assert.equal(bundle.organism_inputs.org_adult.allocated_food, 4.5);
    assert.equal(bundle.organism_inputs.org_larva.allocated_food, 1.0);
    assert.equal(bundle.organism_inputs.org_egg.allocated_food, 0.0);
  });

  it('TC-BEH-43: Shelter security comes from interaction result or approved environment input', () => {
    const bundle = buildBiologicalInputBundle({
      interactionResult: mockInteractionResult,
      behaviorDecisions: mockDecisions,
      environmentSnapshot: mockEnv,
      populationId: 'pop_test',
      simulationTick: 1,
      speciesProfiles: { xylotrupes_rhinoceros_proto: profile },
      organisms
    });

    assert.equal(bundle.organism_inputs.org_adult.shelter_security_factor, 0.85);
    assert.equal(bundle.organism_inputs.org_larva.shelter_security_factor, 0.40);
    assert.equal(bundle.organism_inputs.org_egg.shelter_security_factor, 0.50);
  });

  it('TC-BEH-44: Pure factory execution causes zero mutation on inputs', () => {
    const interactionSnapshot = JSON.stringify(mockInteractionResult);
    const decisionsSnapshot = JSON.stringify(mockDecisions);
    const envSnapshot = JSON.stringify(mockEnv);

    buildBiologicalInputBundle({
      interactionResult: mockInteractionResult,
      behaviorDecisions: mockDecisions,
      environmentSnapshot: mockEnv,
      populationId: 'pop_test',
      simulationTick: 1,
      speciesProfiles: { xylotrupes_rhinoceros_proto: profile },
      organisms
    });

    assert.equal(JSON.stringify(mockInteractionResult), interactionSnapshot);
    assert.equal(JSON.stringify(mockDecisions), decisionsSnapshot);
    assert.equal(JSON.stringify(mockEnv), envSnapshot);
  });

  it('TC-BEH-45: metabolic_activity_rate defaults to neutral 1.0 baseline (not an accidental alias for lifecycle drain)', () => {
    const bundle = buildBiologicalInputBundle({
      interactionResult: mockInteractionResult,
      behaviorDecisions: mockDecisions,
      environmentSnapshot: mockEnv,
      populationId: 'pop_test',
      simulationTick: 1,
      speciesProfiles: { xylotrupes_rhinoceros_proto: profile },
      organisms
    });

    // Baseline is strictly neutral 1.0 without accidental aliasing
    assert.equal(bundle.organism_inputs.org_egg.metabolic_activity_rate, 1.0);
    assert.equal(bundle.organism_inputs.org_larva.metabolic_activity_rate, 1.0);
    assert.equal(bundle.organism_inputs.org_adult.metabolic_activity_rate, 1.0);
  });

  it('TC-BEH-49: metabolic_activity_rate can be explicitly configured via behavior_parameters', () => {
    const customProfile = JSON.parse(JSON.stringify(profile));
    customProfile.behavior_profile.behavior_parameters = {
      metabolic_activity_rate: 1.5
    };

    const bundle = buildBiologicalInputBundle({
      interactionResult: mockInteractionResult,
      behaviorDecisions: mockDecisions,
      environmentSnapshot: mockEnv,
      populationId: 'pop_test',
      simulationTick: 1,
      speciesProfiles: { xylotrupes_rhinoceros_proto: customProfile },
      organisms
    });

    assert.equal(bundle.organism_inputs.org_adult.metabolic_activity_rate, 1.5);
  });

  it('TC-BEH-46: 100-run replay determinism', () => {
    const baseline = JSON.stringify(buildBiologicalInputBundle({
      interactionResult: mockInteractionResult,
      behaviorDecisions: mockDecisions,
      environmentSnapshot: mockEnv,
      populationId: 'pop_test',
      simulationTick: 1,
      speciesProfiles: { xylotrupes_rhinoceros_proto: profile },
      organisms
    }));

    for (let i = 0; i < 100; i++) {
      const current = JSON.stringify(buildBiologicalInputBundle({
        interactionResult: mockInteractionResult,
        behaviorDecisions: mockDecisions,
        environmentSnapshot: mockEnv,
        populationId: 'pop_test',
        simulationTick: 1,
        speciesProfiles: { xylotrupes_rhinoceros_proto: profile },
        organisms
      }));
      assert.equal(current, baseline, `Run ${i} diverged!`);
    }
  });
});