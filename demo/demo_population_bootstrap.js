/**
 * LinhSinhVN — DEMO-01 Population Bootstrap
 *
 * Checkpoint: DEMO-01-A First Playable Headless Simulation Session
 * Instantiates exactly 10 initial organisms in canonical STAGE_EGG.
 * Zero manual property mutation. 100% compliant with lifecycle invariants.
 */

import { createOrganismState, assertStateInvariants } from '../game/lifecycle/organism_state.js';
import { createGenome, calculatePhenotype, calculateDerivedStats } from '../game/genetics/index.js';
import {
  DEMO_SCENARIO_SEED,
  INITIAL_POPULATION_COUNT,
  INITIAL_ORGANISM_PREFIX
} from './demo_constants.js';

/**
 * Derives a deterministic 64-bit hex seed from master scenario seed and index.
 * @param {string} masterSeed
 * @param {number} index
 * @returns {string} 64-bit hex seed ('0x...')
 */
function deriveOrganismSeed(masterSeed, index) {
  const base = BigInt(masterSeed);
  const offset = BigInt(index + 1) * 0x9e3779b97f4a7c15n;
  const combined = (base ^ offset) & 0xffffffffffffffffn;
  return '0x' + combined.toString(16).padStart(16, '0');
}

/**
 * Bootstraps exactly 10 initial organisms for the DEMO-01 session.
 *
 * @param {object} params
 * @param {object} params.speciesProfile - Frozen SpeciesProfile
 * @param {string} [params.scenarioSeed=DEMO_SCENARIO_SEED] - 64-bit hex seed
 * @returns {Array<object>} Array of 10 validated OrganismState objects in STAGE_EGG
 */
export function bootstrapDemoPopulation({ speciesProfile, scenarioSeed = DEMO_SCENARIO_SEED }) {
  if (!speciesProfile || typeof speciesProfile !== 'object') {
    throw new TypeError('[bootstrapDemoPopulation] speciesProfile must be an object');
  }

  const organisms = [];

  for (let i = 0; i < INITIAL_POPULATION_COUNT; i++) {
    const organismId = `${INITIAL_ORGANISM_PREFIX}${String(i + 1).padStart(3, '0')}`;
    const sex = i < 5 ? 'MALE' : 'FEMALE';
    const orgSeed = deriveOrganismSeed(scenarioSeed, i);

    // 1. Authoritative Genetics Pipeline
    const genome = createGenome(speciesProfile.species_id);
    const phenotype = calculatePhenotype(genome, sex, 1.0);
    const derivedStats = calculateDerivedStats(phenotype);

    // 2. Canonical Lifecycle State Factory
    const organismState = createOrganismState({
      organismId,
      speciesProfile,
      generation: 1,
      sex,
      genome,
      phenotype,
      derivedStats,
      simulationSeed: orgSeed
    });

    // 3. Strict Invariant Assertion
    assertStateInvariants(organismState, speciesProfile);

    // 4. Assert canonical stage is STAGE_EGG (no manual stage override)
    if (organismState.current_stage_id !== 'STAGE_EGG' || organismState.current_substage_id !== null) {
      throw new Error(`[bootstrapDemoPopulation] Unexpected initial stage '${organismState.current_stage_id}' on '${organismId}'. Must be STAGE_EGG.`);
    }

    organisms.push(organismState);
  }

  return organisms;
}
