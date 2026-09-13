/**
 * LinhSinhVN — Pure Derived Population Census
 *
 * Implements:
 * - INVARIANT-POPTICK-01: PopulationRegistry is the ONLY authoritative source of demographic state.
 * - INVARIANT-POPTICK-05: PopulationCensus is PURE-DERIVED.
 *   No persistent demographic counters. No second source of truth.
 * - Rule 10: Dead organisms remain in PopulationRegistry, count toward total_dead.
 * - Rule 11: deaths_this_tick strictly derived from preTick.is_alive === true && postTick.is_alive === false.
 * - Rule 12: death_causes derived from actual death transitions.
 * - Rule 13: Generic lifecycle stages: alive_by_stage is derived dynamically (never hardcoding EGG/LARVA...).
 *   DEAD is not a developmental stage.
 * - Zero nondeterministic APIs.
 */

function deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    deepFreeze(obj[key]);
  }
  return obj;
}

/**
 * Pure function deriving demographic census from post-tick registry and pre-tick state snapshot.
 *
 * @param {Map<string, object>|object[]} preTickOrganisms - Pre-tick organism state lookup or array
 * @param {object} populationRegistry - PopulationRegistry instance (or object with listOrganisms())
 * @param {number} simulationTick - Discrete simulation tick
 * @returns {Readonly<object>} Frozen canonical PopulationCensus
 */
export function derivePopulationCensus(preTickOrganisms, populationRegistry, simulationTick) {
  if (typeof simulationTick !== 'number' || !Number.isInteger(simulationTick) || simulationTick < 0) {
    throw new TypeError(`simulationTick must be a non-negative integer, received: ${simulationTick}`);
  }
  if (!populationRegistry || typeof populationRegistry !== 'object') {
    throw new TypeError('populationRegistry must be a non-null object');
  }

  // Normalize preTick map for canonical lookup
  const preMap = preTickOrganisms instanceof Map
    ? preTickOrganisms
    : new Map(
        (Array.isArray(preTickOrganisms) ? preTickOrganisms : []).map(o => [o.organism_id, o])
      );

  const organisms = typeof populationRegistry.listOrganisms === 'function'
    ? populationRegistry.listOrganisms()
    : (Array.isArray(populationRegistry.organisms) ? populationRegistry.organisms : []);

  let totalLiving = 0;
  let totalDead = 0;
  let totalBiomass = 0.0;
  const stageCounts = new Map();

  let deathsThisTick = 0;
  const deathCauses = {};

  for (const org of organisms) {
    if (org.is_alive === true) {
      totalLiving++;

      // Developmental stage is completely generic (Rule 13)
      const stage = org.current_stage_id || org.current_stage || 'UNKNOWN_STAGE';
      stageCounts.set(stage, (stageCounts.get(stage) || 0) + 1);

      // Total living biomass
      let bm = 0.0;
      if (typeof org.nutrition_state?.structural_biomass === 'number') {
        bm = org.nutrition_state.structural_biomass;
      } else if (typeof org.biomass === 'number') {
        bm = org.biomass;
      } else if (typeof org.biomass_index === 'number') {
        bm = org.biomass_index;
      }
      totalBiomass += bm;
    } else {
      totalDead++;
    }

    // Rule 11 & 12: Transition-level death derivation
    const preOrg = preMap.get(org.organism_id);
    if (preOrg && preOrg.is_alive === true && org.is_alive === false) {
      deathsThisTick++;
      const cause = org.death_record?.primary_cause || 'UNKNOWN_CAUSE';
      deathCauses[cause] = (deathCauses[cause] || 0) + 1;
    }
  }

  // Canonical stage distribution array, sorted ascending by stage string
  const sortedStages = Array.from(stageCounts.keys()).sort();
  const aliveByStage = sortedStages.map(stage => Object.freeze({
    stage,
    count: stageCounts.get(stage)
  }));

  // Sort death causes alphabetically for deterministic serialization
  const sortedDeathCauses = {};
  const causeKeys = Object.keys(deathCauses).sort();
  for (const key of causeKeys) {
    sortedDeathCauses[key] = deathCauses[key];
  }

  const census = {
    schema_version: '1.0.0',
    simulation_tick: simulationTick,
    counts: {
      total: organisms.length,
      alive: totalLiving,
      dead: totalDead
    },
    alive_by_stage: Object.freeze(aliveByStage),
    mortality: {
      deaths_this_tick: deathsThisTick,
      death_causes: Object.freeze(sortedDeathCauses)
    },
    total_biomass: Number(totalBiomass.toFixed(4))
  };

  return deepFreeze(census);
}
