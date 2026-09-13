/**
 * LinhSinhVN — Population Breeding Scheduler
 *
 * Implements deterministic population-level reproduction coordination:
 * 1. Filter eligible adult candidates from post-biological candidate states.
 * 2. Form deterministic mating pairs (Contest & Scramble competition semantics:
 *    males sorted by derivedStats.clash_power DESC then organism_id ASC;
 *    females sorted by organism_id ASC).
 * 3. Enforce Whole-Clutch Admission against ALIVE-based population capacity (counts.alive).
 * 4. Coordinate atomic plan and commit with ReproductionRuntime.
 *
 * Zero nondeterministic APIs (pure deterministic hash-based derivations).
 */

import { ReproductionRuntime } from '../reproduction/reproduction_runtime.js';
import { hash64 } from '../reproduction/seed_derivation.js';
import { canonicalizeEvents } from './event_canonicalizer.js';

/**
 * Pure candidate filter for reproduction eligibility.
 * Evaluates candidates against post-biological evaluation state.
 *
 * @param {Array<object>|Map<string, object>} organisms - Organisms list or Map
 * @param {object} speciesRegistry - SpeciesRegistry instance
 * @param {number} currentTick - Current global simulation tick
 * @returns {Array<object>} Array of eligible candidate organism states
 */
export function filterReproductionCandidates(organisms, speciesRegistry, currentTick) {
  if (!speciesRegistry || typeof speciesRegistry.get !== 'function') {
    throw new TypeError('speciesRegistry must be provided with a get() method');
  }

  const list = organisms instanceof Map ? Array.from(organisms.values()) : (Array.isArray(organisms) ? organisms : []);
  const eligibleCandidates = [];

  for (const org of list) {
    if (!org || typeof org !== 'object') continue;

    // Must be alive
    if (org.is_alive !== true || org.status !== 'ALIVE') {
      continue;
    }

    const speciesId = org.species_id;
    if (!speciesId || !speciesRegistry.has(speciesId)) {
      throw new Error(`Unknown species profile for species_id '${speciesId}' on organism '${org.organism_id}'`);
    }

    const speciesProfile = speciesRegistry.get(speciesId);
    const repProf = speciesProfile?.reproduction_profile;
    if (!repProf) {
      throw new Error(`Species profile '${speciesId}' is missing reproduction_profile`);
    }

    // Lifecycle stage check
    const requiredStage = repProf.reproductive_stage_id || 'stage_adult';
    if (org.current_stage_id !== requiredStage) {
      continue;
    }

    // Minimum mating age check
    const minAge = repProf.min_mating_age_ticks || 0;
    if ((org.stage_age_ticks || 0) < minAge) {
      continue;
    }

    // Cooldown check
    const cooldown = typeof org.reproduction_cooldown_until_tick === 'number'
      ? org.reproduction_cooldown_until_tick
      : ((org.last_reproduction_tick ?? -Infinity) + (repProf.breeding_cooldown_ticks || 0));
    if (currentTick < cooldown) {
      continue;
    }

    // Energy cost check
    const energyCost = repProf.energy_cost_per_mating || 0.0;
    const currentEnergy = org.nutrition_state?.stored_energy ?? 0.0;
    if (currentEnergy < energyCost) {
      continue;
    }

    // Stress block check
    if (org.stress_state?.is_overstressed) {
      continue;
    }

    eligibleCandidates.push(org);
  }

  return eligibleCandidates;
}

/**
 * Forms deterministic mating pairs from eligible candidates.
 *
 * Sorting rules:
 * - Grouped by species_id.
 * - Males: sorted by derivedStats.clash_power DESC, tie-break organism_id ASC.
 * - Females: sorted by organism_id ASC.
 * - Paired 1-1 up to min(females.length, males.length).
 *
 * @param {Array<object>} candidates - Array of eligible candidate organisms
 * @param {object} speciesRegistry - SpeciesRegistry instance
 * @param {string} tickSeed - Deterministic 64-bit tick seed
 * @returns {Array<{ female: object, male: object, species_id: string }>} Deterministic pairs
 */
export function formDeterministicPairs(candidates, speciesRegistry, tickSeed) {
  const speciesGroups = new Map();

  for (const org of candidates) {
    if (!speciesGroups.has(org.species_id)) {
      speciesGroups.set(org.species_id, []);
    }
    speciesGroups.get(org.species_id).push(org);
  }

  const sortedSpeciesIds = Array.from(speciesGroups.keys()).sort();
  const pairs = [];

  for (const spId of sortedSpeciesIds) {
    const group = speciesGroups.get(spId);
    const females = group.filter(org => org.sex === 'FEMALE');
    const males = group.filter(org => org.sex === 'MALE');

    // Sort males: clash_power DESC, organism_id ASC
    males.sort((a, b) => {
      const powerA = typeof a.derivedStats?.clash_power === 'number' ? a.derivedStats.clash_power : 0;
      const powerB = typeof b.derivedStats?.clash_power === 'number' ? b.derivedStats.clash_power : 0;
      if (powerB !== powerA) {
        return powerB - powerA;
      }
      const idA = String(a.organism_id || '');
      const idB = String(b.organism_id || '');
      if (idA < idB) return -1;
      if (idA > idB) return 1;
      return 0;
    });

    // Sort females: organism_id ASC
    females.sort((a, b) => {
      const idA = String(a.organism_id || '');
      const idB = String(b.organism_id || '');
      if (idA < idB) return -1;
      if (idA > idB) return 1;
      return 0;
    });

    const pairCount = Math.min(females.length, males.length);
    for (let i = 0; i < pairCount; i++) {
      pairs.push({
        female: females[i],
        male: males[i],
        species_id: spId
      });
    }
  }

  return pairs;
}

/**
 * Plans reproduction for all deterministic pairs with Whole-Clutch Admission.
 * Strictly read-only; does not mutate candidate states.
 *
 * @param {Array<object>} pairs - Mating pairs
 * @param {object} options
 * @param {object} options.speciesRegistry - SpeciesRegistry instance
 * @param {number} options.currentTick - Global simulation tick
 * @param {string} options.tickSeed - 64-bit tick seed
 * @param {number} options.currentAliveCount - Number of alive organisms in population
 * @param {number|null} [options.maxPopulation=null] - Maximum alive population capacity
 * @param {ReproductionRuntime} [options.runtime] - ReproductionRuntime instance
 * @param {string} [options.birthHabitat='habitat_default'] - Birth habitat identifier
 * @returns {{
 *   admittedPlans: Array<{ pair: object, speciesProfile: object, plan: object }>,
 *   rejectedPairs: Array<object>,
 *   cumulativeNewborns: number
 * }}
 */
export function planPopulationReproduction(pairs, options = {}) {
  const {
    speciesRegistry,
    currentTick = 0,
    tickSeed,
    currentAliveCount = 0,
    maxPopulation = null,
    runtime = new ReproductionRuntime(),
    birthHabitat = 'habitat_default'
  } = options;

  if (!speciesRegistry) {
    throw new TypeError('speciesRegistry is required in options');
  }
  if (typeof tickSeed !== 'string') {
    throw new TypeError('tickSeed must be a string');
  }

  const admittedPlans = [];
  const rejectedPairs = [];
  let cumulativeNewborns = 0;

  for (let pairIndex = 0; pairIndex < pairs.length; pairIndex++) {
    const pair = pairs[pairIndex];
    const speciesProfile = speciesRegistry.get(pair.species_id);
    if (!speciesProfile) {
      throw new Error(`Unknown species profile for species_id '${pair.species_id}'`);
    }

    // Deterministic breeding nonce derived from tickSeed and pair identities
    const breedingNonce = hash64(`${tickSeed}|${currentTick}|${pairIndex}|${pair.female.organism_id}|${pair.male.organism_id}`);

    const plan = runtime.planReproduction(pair.female, pair.male, speciesProfile, currentTick, {
      breedingNonce,
      birthHabitat
    });

    if (!plan.eligible) {
      rejectedPairs.push({
        female_id: pair.female.organism_id,
        male_id: pair.male.organism_id,
        reason: 'INELIGIBLE',
        reasons: plan.ineligibility_reasons
      });
      continue;
    }

    const clutchSize = plan.clutch_size;

    // Enforce Whole-Clutch Admission against ALIVE-based population capacity
    if (maxPopulation !== null && maxPopulation !== undefined && Number.isFinite(maxPopulation)) {
      if (currentAliveCount + cumulativeNewborns + clutchSize > maxPopulation) {
        rejectedPairs.push({
          female_id: pair.female.organism_id,
          male_id: pair.male.organism_id,
          clutch_size: clutchSize,
          reason: 'POPULATION_CAPACITY_EXCEEDED',
          reasons: ['POPULATION_CAPACITY_EXCEEDED']
        });
        continue;
      }
    }

    cumulativeNewborns += clutchSize;
    admittedPlans.push({
      pair,
      speciesProfile,
      plan
    });
  }

  return {
    admittedPlans,
    rejectedPairs,
    cumulativeNewborns
  };
}

export class PopulationBreedingScheduler {
  constructor(options = {}) {
    this._runtime = options.runtime || new ReproductionRuntime();
  }

  get runtime() {
    return this._runtime;
  }

  /**
   * Orchestrates the complete reproduction phase for a simulation world tick.
   *
   * @param {object} world - SimulationWorld instance
   * @param {number} currentTick - Current simulation tick
   * @param {string} tickSeed - Deterministic tick seed
   * @param {object} [options={}] - Options (max_population, reproduction_enabled, birth_habitat)
   * @returns {{
   *   summary: object,
   *   children: Array<object>,
   *   lineageRecords: Array<object>,
   *   events: Array<object>
   * }}
   */
  executeBreedingPhase(world, currentTick, tickSeed, options = {}) {
    if (options.reproduction_enabled === false) {
      return {
        summary: Object.freeze({
          schema_version: '1.0.0',
          pairs_evaluated: 0,
          pairs_mated: 0,
          offspring_born: 0,
          clutches_produced: 0,
          events: Object.freeze([]),
          lineage_records: Object.freeze([]),
          rejected_pairs: Object.freeze([])
        }),
        children: [],
        lineageRecords: [],
        events: []
      };
    }

    const registry = world.getPopulation();
    const speciesRegistry = world.speciesRegistry;
    const currentAliveCount = registry.countLiving();
    const maxPopulation = options.max_population !== undefined ? options.max_population : null;
    const birthHabitat = options.birth_habitat || 'habitat_default';

    // 1. Filter candidates from current post-biological registry states
    const candidates = filterReproductionCandidates(registry.listOrganisms(), speciesRegistry, currentTick);

    // 2. Form deterministic pairs
    const pairs = formDeterministicPairs(candidates, speciesRegistry, tickSeed);

    // 3. Plan reproduction with Whole-Clutch Admission
    const { admittedPlans, rejectedPairs, cumulativeNewborns } = planPopulationReproduction(pairs, {
      speciesRegistry,
      currentTick,
      tickSeed,
      currentAliveCount,
      maxPopulation,
      runtime: this._runtime,
      birthHabitat
    });

    // 4. Commit admitted plans
    const allChildren = [];
    const allLineages = [];
    const allEvents = [];

    for (const item of admittedPlans) {
      const { pair, speciesProfile, plan } = item;
      const commitResult = this._runtime.commitReproduction(plan, pair.female, pair.male, speciesProfile);

      for (const child of commitResult.children) {
        registry.addOrganism(child);
        allChildren.push(child);
      }
      for (const lin of commitResult.lineage_records) {
        allLineages.push(lin);
      }
      for (const ev of commitResult.events) {
        allEvents.push(ev);
      }
    }

    const canonicalReproEvents = canonicalizeEvents(allEvents);

    const summary = Object.freeze({
      schema_version: '1.0.0',
      pairs_evaluated: pairs.length,
      pairs_mated: admittedPlans.length,
      offspring_born: cumulativeNewborns,
      clutches_produced: admittedPlans.length,
      events: canonicalReproEvents,
      lineage_records: Object.freeze(allLineages),
      rejected_pairs: Object.freeze(rejectedPairs)
    });

    return {
      summary,
      children: allChildren,
      lineageRecords: allLineages,
      events: allEvents
    };
  }
}

export function createPopulationBreedingScheduler(options) {
  return new PopulationBreedingScheduler(options);
}
