/**
 * LinhSinhVN — Deterministic Reproduction Runtime
 *
 * Orchestrates atomic two-phase reproduction transactions:
 * PLAN (read-only pre-calculation) -> PREFLIGHT (zero-mutation validation) -> APPLY (Lifecycle state mutation)
 *
 * Delegates genome inheritance exclusively to Genetics Engine.
 * Delegates organism state mutation exclusively to Lifecycle Engine.
 */

import { computeBreedingSeed } from '../genetics/rng.js';
import { executeBreeding } from '../genetics/breeding.js';
import { createOrganismState, validateReproductionDeltas, applyReproductionDeltas } from '../lifecycle/organism_state.js';
import { canonicalizeParentPair } from './canonical_pair.js';
import { evaluateReproductionEligibility } from './eligibility.js';
import {
  deriveClutchSeed,
  deriveChildSexSeed,
  deriveChildGeneticsSeed,
  deriveChildId,
  deriveChildSimulationSeed,
  hash64
} from './seed_derivation.js';
import { determineClutchSize, determineChildSex } from './clutch.js';
import { createReproductionCompletedEvent, createOrganismBornEvent } from './event_factory.js';

export class ReproductionRuntime {
  /**
   * Plans a reproduction event between two candidate parents.
   * STRICTLY READ-ONLY: performs ZERO mutation on parent states.
   *
   * @param {object} parent1 - Candidate parent 1
   * @param {object} parent2 - Candidate parent 2
   * @param {object} speciesProfile - Deeply frozen SpeciesProfile
   * @param {number} currentTick - Current global simulation tick
   * @param {object} [options={}] - Optional reproduction parameters
   * @param {string|number} [options.breedingNonce=0] - Nonce distinguishing reproduction attempts
   * @param {string} [options.birthHabitat='habitat_default'] - Habitat for lineage/events
   * @returns {Readonly<object>} Deterministic frozen ReproductionPlan
   */
  planReproduction(parent1, parent2, speciesProfile, currentTick = 0, options = {}) {
    if (!parent1 || !parent2) {
      throw new TypeError('planReproduction requires two valid parent organisms');
    }
    if (!speciesProfile?.species_id || !speciesProfile?.reproduction_profile) {
      throw new TypeError('planReproduction requires a valid speciesProfile with reproduction_profile');
    }

    // 1. Canonicalize parent pair for order-independent determinism
    const { parentA, parentB } = canonicalizeParentPair(parent1, parent2, speciesProfile);

    // 2. Evaluate biological eligibility (pure read-only check)
    const eligibility = evaluateReproductionEligibility(parentA, parentB, speciesProfile, currentTick);
    const nonce = options.breedingNonce !== undefined ? options.breedingNonce : 0;

    if (!eligibility.eligible) {
      return Object.freeze({
        plan_id: `plan_${hash64(`${parentA.organism_id}|${parentB.organism_id}|${currentTick}|${nonce}`)}`,
        created_tick: currentTick,
        species_id: speciesProfile.species_id,
        eligible: false,
        ineligibility_reasons: Object.freeze([...eligibility.reasons]),
        parent_a_id: parentA.organism_id,
        parent_b_id: parentB.organism_id,
        clutch_size: 0,
        children_plans: Object.freeze([]),
        parent_deltas: null,
        events: Object.freeze([])
      });
    }

    const repProf = speciesProfile.reproduction_profile;

    // 3. Derive canonical 64-bit BreedingSeed
    // Formula: Hash64(ParentA.id | ParentB.id | ParentA.generation | BreedingNonce)
    const breedingSeed = computeBreedingSeed(parentA.organism_id, parentB.organism_id, parentA.generation || 0, nonce);

    // 4. Derive independent ClutchSeed and determine clutch size
    const clutchSeed = deriveClutchSeed(breedingSeed);
    const clutchSize = determineClutchSize(repProf.clutch_size_min, repProf.clutch_size_max, clutchSeed);

    // 5. Calculate generational depth: max(genA, genB) + 1
    const childGen = Math.max(Number(parentA.generation || 0), Number(parentB.generation || 0)) + 1;
    const birthHabitat = options.birthHabitat || 'habitat_default';

    const childrenPlans = [];
    const events = [];
    let orderIndex = 0;

    // 6. Pre-generate each child plan independently
    for (let i = 0; i < clutchSize; i++) {
      // Independent domain seeds
      const childSexSeed = deriveChildSexSeed(breedingSeed, i);
      const childGeneticsSeed = deriveChildGeneticsSeed(breedingSeed, i);
      const childId = deriveChildId(breedingSeed, i);
      const childSimSeed = deriveChildSimulationSeed(breedingSeed, i);

      // Determine child sex BEFORE genetics phenotype/stats construction
      const childSex = determineChildSex(repProf.sex_determination, childSexSeed);

      // Authoritative Genetics Engine call
      const geneticsResult = executeBreeding(
        {
          id: parentA.organism_id,
          genome: parentA.genetics.genome,
          generation: parentA.generation
        },
        {
          id: parentB.organism_id,
          genome: parentB.genetics.genome,
          generation: parentB.generation
        },
        {
          breedingNonce: `${nonce}_c${i}`,
          childId,
          childSex,
          developmentalFactor: speciesProfile.development_profile.initial_eta,
          mutationRate: speciesProfile.genetics_profile?.base_mutation_rate ?? 0.05,
          birthHabitat,
          explicitSeed: childGeneticsSeed
        }
      );

      // Construct newborn child OrganismState at profile initial_stage_id
      const initialOrganismState = createOrganismState({
        organismId: childId,
        speciesProfile,
        generation: childGen,
        sex: childSex,
        genome: geneticsResult.childGenome,
        phenotype: geneticsResult.phenotype,
        derivedStats: geneticsResult.derivedStats,
        simulationSeed: childSimSeed
      });

      // Child birth event
      const bornEvent = createOrganismBornEvent({
        childState: initialOrganismState,
        maternalId: parentA.organism_id,
        paternalId: parentB.organism_id,
        birthHabitat,
        simulationTick: currentTick,
        orderIndex: orderIndex++
      });

      events.push(bornEvent);

      childrenPlans.push(Object.freeze({
        child_id: childId,
        child_index: i,
        child_sex: childSex,
        child_simulation_seed: childSimSeed,
        genetics_result: Object.freeze(geneticsResult),
        lineage_record: Object.freeze(geneticsResult.lineageRecord),
        initial_organism_state: initialOrganismState,
        born_event: bornEvent
      }));
    }

    // 7. Calculate state deltas for parents
    const energyCost = repProf.energy_cost_per_mating || 0.0;
    const cooldownTicks = repProf.breeding_cooldown_ticks || 0;
    const cooldownUntil = currentTick + cooldownTicks;

    const parentDeltas = Object.freeze({
      parent_a: Object.freeze({
        organism_id: parentA.organism_id,
        energy_cost: energyCost,
        reproduction_cooldown_until_tick: cooldownUntil,
        last_reproduction_tick: currentTick
      }),
      parent_b: Object.freeze({
        organism_id: parentB.organism_id,
        energy_cost: energyCost,
        reproduction_cooldown_until_tick: cooldownUntil,
        last_reproduction_tick: currentTick
      })
    });

    // 8. Generate parent reproduction completed events
    const parentAEvent = createReproductionCompletedEvent({
      parent: parentA,
      mateId: parentB.organism_id,
      clutchSize,
      breedingSeed,
      simulationTick: currentTick,
      orderIndex: orderIndex++
    });
    const parentBEvent = createReproductionCompletedEvent({
      parent: parentB,
      mateId: parentA.organism_id,
      clutchSize,
      breedingSeed,
      simulationTick: currentTick,
      orderIndex: orderIndex++
    });

    events.push(parentAEvent, parentBEvent);

    return Object.freeze({
      plan_id: `plan_${hash64(`${breedingSeed}|${currentTick}`)}`,
      created_tick: currentTick,
      species_id: speciesProfile.species_id,
      eligible: true,
      ineligibility_reasons: Object.freeze([]),
      parent_a_id: parentA.organism_id,
      parent_b_id: parentB.organism_id,
      breeding_seed: breedingSeed,
      clutch_size: clutchSize,
      children_plans: Object.freeze(childrenPlans),
      parent_deltas: parentDeltas,
      events: Object.freeze(events)
    });
  }

  /**
   * Commits a pre-planned reproduction transaction atomically.
   *
   * Preflight validates BOTH parents before applying ANY mutation.
   * If any validation fails: strictly ZERO parent state mutation occurs.
   *
   * @param {object} plan - Pre-calculated ReproductionPlan
   * @param {object} parent1 - Candidate parent 1
   * @param {object} parent2 - Candidate parent 2
   * @param {object} speciesProfile - Deeply frozen SpeciesProfile
   * @returns {Readonly<object>} Committed reproduction result
   */
  commitReproduction(plan, parent1, parent2, speciesProfile) {
    if (!plan || !plan.eligible) {
      throw new Error(`Cannot commit reproduction: plan is invalid or ineligible (reasons: ${(plan?.ineligibility_reasons || []).join(', ')})`);
    }

    // Resolve canonical pairing
    const { parentA, parentB } = canonicalizeParentPair(parent1, parent2, speciesProfile);

    // =========================================================
    // PHASE 2 — PREFLIGHT VALIDATION (STRICTLY ZERO MUTATION)
    // =========================================================
    if (parentA.organism_id !== plan.parent_a_id) {
      throw new Error(`Parent A identity mismatch: expected '${plan.parent_a_id}', got '${parentA.organism_id}'`);
    }
    if (parentB.organism_id !== plan.parent_b_id) {
      throw new Error(`Parent B identity mismatch: expected '${plan.parent_b_id}', got '${parentB.organism_id}'`);
    }
    if (!Array.isArray(plan.children_plans) || plan.children_plans.length !== plan.clutch_size) {
      throw new Error(`Plan children count (${plan.children_plans?.length}) does not match clutch size (${plan.clutch_size})`);
    }

    // Preflight validate Parent A and Parent B via Lifecycle boundary
    // If either fails, throws before any mutation can occur!
    validateReproductionDeltas(parentA, plan.parent_deltas.parent_a, speciesProfile);
    validateReproductionDeltas(parentB, plan.parent_deltas.parent_b, speciesProfile);

    // =========================================================
    // PHASE 3 — APPLY (ALL PREFLIGHT CHECKS PASSED)
    // =========================================================
    applyReproductionDeltas(parentA, plan.parent_deltas.parent_a, speciesProfile);
    applyReproductionDeltas(parentB, plan.parent_deltas.parent_b, speciesProfile);

    const children = plan.children_plans.map(cp => cp.initial_organism_state);
    const lineageRecords = plan.children_plans.map(cp => cp.lineage_record);

    return Object.freeze({
      success: true,
      clutch_size: plan.clutch_size,
      breeding_seed: plan.breeding_seed,
      children: Object.freeze(children),
      lineage_records: Object.freeze(lineageRecords),
      events: plan.events,
      parent_a_id: parentA.organism_id,
      parent_b_id: parentB.organism_id,
      parent_a_post_energy: parentA.nutrition_state.stored_energy,
      parent_b_post_energy: parentB.nutrition_state.stored_energy
    });
  }

  /**
   * High-level atomic reproduction transaction:
   * Plans reproduction and, if eligible, immediately commits.
   * If ineligible, returns clean failure result without throwing.
   *
   * @param {object} parent1 - First parent organism state
   * @param {object} parent2 - Second parent organism state
   * @param {object} speciesProfile - Deeply frozen SpeciesProfile
   * @param {number} currentTick - Current global simulation tick
   * @param {object} [options={}] - Optional parameters (breedingNonce, birthHabitat)
   * @returns {Readonly<object>}
   */
  executeReproductionTransaction(parent1, parent2, speciesProfile, currentTick = 0, options = {}) {
    const plan = this.planReproduction(parent1, parent2, speciesProfile, currentTick, options);
    if (!plan.eligible) {
      return Object.freeze({
        success: false,
        reasons: plan.ineligibility_reasons,
        plan,
        result: null
      });
    }

    const result = this.commitReproduction(plan, parent1, parent2, speciesProfile);
    return Object.freeze({
      success: true,
      reasons: Object.freeze([]),
      plan,
      result
    });
  }
}
