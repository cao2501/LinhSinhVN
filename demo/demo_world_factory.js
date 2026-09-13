/**
 * LinhSinhVN — DEMO-01 World Composition Factory
 *
 * Checkpoint: DEMO-01-A First Playable Headless Simulation Session
 * Assembles SimulationWorld, SpatialWorld, HabitatRegistry, ShelterRegistry,
 * ResourceZoneRegistry, and TelemetryRecorder into a cohesive deterministic world.
 */

import { SpatialWorld } from '../game/spatial/spatial_world.js';
import { SimulationWorld } from '../game/population/simulation_world.js';
import { HabitatRegistry } from '../game/spatial/habitat/habitat_registry.js';
import { HabitatDefinition, HabitatCategory } from '../game/spatial/habitat/habitat_definition.js';
import { HabitatRegion, RegionType } from '../game/spatial/habitat/habitat_region.js';
import { ShelterRegistry } from '../game/spatial/shelter/shelter_registry.js';
import { ShelterDefinition, ShelterType } from '../game/spatial/shelter/shelter_definition.js';
import { ResourceZoneRegistry } from '../game/spatial/resource_zone/resource_zone_registry.js';
import { SpatialResourceZone } from '../game/spatial/resource_zone/resource_zone_definition.js';
import { TelemetryRecorder, TelemetryMode } from '../game/telemetry/index.js';
import { bootstrapDemoPopulation } from './demo_population_bootstrap.js';
import {
  DEMO_SCENARIO_SEED,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  Z_MIN,
  Z_MAX,
  INITIAL_ORGANISM_POSITIONS
} from './demo_constants.js';

/**
 * Builds a deterministic demo world instance.
 *
 * @param {object} params
 * @param {object} params.speciesProfile - Species profile object
 * @param {string} [params.scenarioSeed=DEMO_SCENARIO_SEED]
 * @returns {object} Composed world container
 */
export function createDemoWorld({ speciesProfile, scenarioSeed = DEMO_SCENARIO_SEED }) {
  if (!speciesProfile || typeof speciesProfile !== 'object') {
    throw new TypeError('[createDemoWorld] speciesProfile must be an object');
  }

  // 1. Spatial World (Sole Position Authority)
  const spatialWorld = new SpatialWorld({
    worldId: 'demo_spatial_world',
    width: WORLD_WIDTH,
    height: WORLD_HEIGHT,
    zMin: Z_MIN,
    zMax: Z_MAX
  });

  // 2. Habitat Subsystem with explicit boundary & canonical default open terrain
  const worldBoundary = {
    min_x: 0,
    max_x: WORLD_WIDTH - 1,
    min_y: 0,
    max_y: WORLD_HEIGHT - 1,
    min_z: Z_MIN,
    max_z: Z_MAX
  };
  const habitatRegistry = new HabitatRegistry({ boundary: worldBoundary });

  // 3. Shelter Subsystem (Deterministic shelter structure)
  const shelterRegistry = new ShelterRegistry();
  const demoShelter = new ShelterDefinition({
    shelter_id: 'shelter_log_hollow',
    shelter_type: ShelterType.ROCK_CREVICE,
    position: { x: 22, y: 22, z: 0 },
    capacity: 4,
    security_factor: 0.85,
    micro_climate_offsets: {
      temperature_delta: -2.0,
      humidity_delta: 0.15
    },
    metadata: { description: 'Fallen hollow log shelter' }
  });
  shelterRegistry.registerShelter(demoShelter);

  // 4. Resource Zone Subsystem (Zero quantity fields, purely spatial)
  const resourceZoneRegistry = new ResourceZoneRegistry();
  const demoResourceZone = new SpatialResourceZone({
    zone_id: 'rz_decaying_wood_patch',
    resource_type: 'ORGANIC_DETRITUS',
    region: new HabitatRegion({
      type: RegionType.RECTANGLE,
      bounds: { min_x: 20, max_x: 25, min_y: 20, max_y: 23, min_z: 0, max_z: 0 }
    }),
    metadata: { description: 'Decaying wood substrate resource patch' }
  });
  resourceZoneRegistry.registerZone(demoResourceZone);

  // 5. Telemetry Observer
  const telemetryRecorder = new TelemetryRecorder({
    mode: TelemetryMode.FULL_HISTORY,
    world_seed: scenarioSeed
  });

  // 6. SimulationWorld (Demographic and Biological Authority)
  const simWorld = new SimulationWorld({
    population_id: 'demo_population_01',
    species_id: speciesProfile.species_id,
    species_profile: speciesProfile,
    simulation_seed: scenarioSeed,
    telemetry_recorder: telemetryRecorder
  });

  // 7. Initial Population Bootstrap (10 x STAGE_EGG)
  const initialOrganisms = bootstrapDemoPopulation({ speciesProfile, scenarioSeed });

  // 8. Atomically register each organism into both authorities
  for (let i = 0; i < initialOrganisms.length; i++) {
    const org = initialOrganisms[i];
    const pos = INITIAL_ORGANISM_POSITIONS[i];

    // Authoritative population registry
    simWorld.registry.addOrganism(org);

    // Authoritative spatial world
    spatialWorld.registerEntity({
      entity_id: org.organism_id,
      position: pos
    });
  }

  return {
    spatialWorld,
    simWorld,
    habitatRegistry,
    shelterRegistry,
    resourceZoneRegistry,
    telemetryRecorder,
    speciesProfile,
    scenarioSeed
  };
}
