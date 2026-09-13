/**
 * LinhSinhVN — DEMO-01 Presentation Snapshot Builder
 *
 * Checkpoint: DEMO-01-A First Playable Headless Simulation Session
 * Pure read-only presentation adapter. Compiles Tier A (authoritative),
 * Tier B (deterministic derived), and Tier C (presentation-only labels) into
 * a deep-frozen, immutable snapshot conforming to presentation_snapshot.schema.json.
 */

import { resolveSpatialContext } from '../game/spatial/resource_zone/spatial_context_resolver.js';
import {
  CANONICAL_ACTION_LABELS,
  CANONICAL_STAGE_LABELS
} from './demo_constants.js';

/**
 * Deterministic code-point lexical comparator.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function lexicalCompare(a, b) {
  return a < b ? -1 : (a > b ? 1 : 0);
}

/**
 * Deep freezes an object and its nested properties.
 * @param {object} obj
 * @returns {object}
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
 * Builds a pure, read-only presentation snapshot from world subsystems.
 *
 * @param {object} params
 * @param {import('../game/population/simulation_world.js').SimulationWorld} params.simWorld
 * @param {import('../game/spatial/spatial_world.js').SpatialWorld} params.spatialWorld
 * @param {import('../game/spatial/habitat/habitat_registry.js').HabitatRegistry} params.habitatRegistry
 * @param {import('../game/spatial/shelter/shelter_registry.js').ShelterRegistry} params.shelterRegistry
 * @param {import('../game/spatial/resource_zone/resource_zone_registry.js').ResourceZoneRegistry} params.resourceZoneRegistry
 * @param {string} [params.playbackStatus='PAUSED']
 * @param {number} [params.playbackSpeed=1]
 * @param {string} params.scenarioSeed
 * @returns {Readonly<object>} Immutable presentation snapshot
 */
export function buildPresentationSnapshot({
  simWorld,
  spatialWorld,
  habitatRegistry,
  shelterRegistry,
  resourceZoneRegistry,
  playbackStatus = 'PAUSED',
  playbackSpeed = 1,
  scenarioSeed
}) {
  if (!simWorld || !spatialWorld) {
    throw new TypeError('[buildPresentationSnapshot] simWorld and spatialWorld are required');
  }

  // 1. Authoritative Census
  const aliveCount = simWorld.registry.countLiving();
  const deadCount = simWorld.registry.countDead();
  const totalCount = simWorld.registry.totalCount;

  // 2. Fetch and canonically sort all organisms (living + deceased)
  const allOrganisms = simWorld.registry.listOrganisms();
  allOrganisms.sort((a, b) => lexicalCompare(a.organism_id, b.organism_id));

  // 3. Build presentation organism view models
  const organismViews = allOrganisms.map(org => {
    // TIER A — Authoritative Biological State
    const organismId = org.organism_id;
    const speciesId = org.species_id;
    const generation = org.generation;
    const sex = org.sex;
    const isAlive = org.is_alive;
    const currentStageId = org.current_stage_id;
    const currentSubstageId = org.current_substage_id;
    const storedEnergy = org.nutrition_state.stored_energy;
    const structuralBiomass = org.nutrition_state.structural_biomass;
    const etaCurrent = org.developmental_state.eta_current;
    const developmentalProgress = org.developmental_state.developmental_progress || 0.0;

    // TIER A — Authoritative Visual Phenotype (direct 1:1 projection, zero synthetic biology)
    const phenotype = org.genetics?.phenotype;
    if (!phenotype || typeof phenotype !== 'object') {
      throw new TypeError(`[buildPresentationSnapshot] Missing authoritative phenotype for organism '${organismId}'`);
    }
    const bodyScaleIndex = phenotype.body_scale_index;
    const cuticlePigmentRatio = phenotype.cuticle_pigment_ratio;
    const cephalicHornScale = phenotype.cephalic_horn_scale;
    const thoracicHornScale = phenotype.thoracic_horn_scale;
    const tarsalGripIndex = phenotype.tarsal_grip_index;
    if (
      typeof bodyScaleIndex !== 'number' || !Number.isFinite(bodyScaleIndex) ||
      typeof cuticlePigmentRatio !== 'number' || !Number.isFinite(cuticlePigmentRatio) ||
      typeof cephalicHornScale !== 'number' || !Number.isFinite(cephalicHornScale) ||
      typeof thoracicHornScale !== 'number' || !Number.isFinite(thoracicHornScale) ||
      typeof tarsalGripIndex !== 'number' || !Number.isFinite(tarsalGripIndex)
    ) {
      throw new TypeError(`[buildPresentationSnapshot] Invalid or incomplete phenotype fields for organism '${organismId}'`);
    }

    // TIER A — Authoritative Spatial Position (sole authority: SpatialWorld)
    const entityRecord = spatialWorld.getEntity(organismId);
    const position = entityRecord
      ? { x: entityRecord.position.x, y: entityRecord.position.y, z: entityRecord.position.z }
      : { x: 0, y: 0, z: 0 };

    // TIER A — Authoritative Action Intent
    const actionIntent = org.behavior_decision?.action_intent || 'REST';

    // TIER B — Deterministic Derived Spatial Context (pure read-only resolver)
    const rawEnv = org.environment_state || simWorld.environmentState || {};
    const spatialEnv = {
      temperature: rawEnv.ambient_temperature_celsius ?? rawEnv.temperature ?? 25.0,
      humidity: rawEnv.relative_humidity ?? rawEnv.humidity ?? 0.75,
      light_level: rawEnv.light_level ?? 1.0,
      shelter_security_factor: rawEnv.shelter_security_factor ?? 0.90
    };

    const spatialContext = resolveSpatialContext({
      coordinate: position,
      habitatRegistry,
      shelterRegistry,
      resourceZoneRegistry,
      environmentState: spatialEnv,
      organismId
    });

    const habitatId = spatialContext.habitat_id;
    const shelteredIn = shelterRegistry.getShelteredIn(organismId) || null;
    const microClimate = {
      temperature: spatialContext.micro_climate.temperature,
      humidity: spatialContext.micro_climate.humidity,
      effective_security_factor: spatialContext.micro_climate.effective_security_factor,
      is_sheltered: spatialContext.micro_climate.is_sheltered,
      shelter_id: spatialContext.micro_climate.shelter_id
    };
    const resourceZoneIds = spatialContext.resource_zones.map(z => z.zone_id);

    // TIER C — Presentation Display Labels
    const actionDisplayLabel = CANONICAL_ACTION_LABELS[actionIntent] || actionIntent;
    const stageDisplayLabel = CANONICAL_STAGE_LABELS[currentStageId] || currentStageId;

    return {
      organism_id: organismId,
      species_id: speciesId,
      generation,
      sex,
      is_alive: isAlive,
      current_stage_id: currentStageId,
      current_substage_id: currentSubstageId,
      stored_energy: storedEnergy,
      structural_biomass: structuralBiomass,
      eta_current: etaCurrent,
      developmental_progress: developmentalProgress,
      position,
      action_intent: actionIntent,
      habitat_id: habitatId,
      sheltered_in: shelteredIn,
      micro_climate: microClimate,
      resource_zone_ids: resourceZoneIds,
      action_display_label: actionDisplayLabel,
      stage_display_label: stageDisplayLabel,
      body_scale_index: bodyScaleIndex,
      cuticle_pigment_ratio: cuticlePigmentRatio,
      cephalic_horn_scale: cephalicHornScale,
      thoracic_horn_scale: thoracicHornScale,
      tarsal_grip_index: tarsalGripIndex
    };
  });

  const snapshot = {
    schema_version: '1.0.0',
    simulation_tick: simWorld.getSimulationTick(),
    simulation_seed: scenarioSeed,
    playback_status: playbackStatus,
    playback_speed: playbackSpeed,
    census: {
      alive_count: aliveCount,
      dead_count: deadCount,
      total_count: totalCount
    },
    organisms: organismViews,
    metadata: {
      world_width: spatialWorld.width,
      world_height: spatialWorld.height
    }
  };

  return deepFreeze(snapshot);
}
