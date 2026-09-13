/**
 * LinhSinhVN — DEMO-01 Playable Simulation Session
 *
 * Checkpoint: DEMO-01-A First Playable Headless Simulation Session
 * Owns session lifecycle (play, pause, step, reset) and coordinates
 * domain authorities without usurping any domain responsibilities.
 */

import { loadSpeciesProfile } from '../game/lifecycle/profile_loader.js';
import { executePopulationBiologicalTick } from '../game/population/biological_tick_coordinator.js';
import { createDemoWorld } from './demo_world_factory.js';
import { buildPresentationSnapshot } from './demo_snapshot_builder.js';
import {
  DEMO_SCENARIO_SEED,
  FIXED_DELTA_TIME,
  DEFAULT_PLAYBACK_SPEED,
  PLAYBACK_SPEEDS,
  PLAYBACK_STATUS
} from './demo_constants.js';

export class DemoSimulationSession {
  /**
   * @param {object} [config={}]
   * @param {string} [config.scenarioSeed=DEMO_SCENARIO_SEED] - Canonical 64-bit scenario seed
   * @param {object} [config.speciesProfile] - Pre-loaded SpeciesProfile
   * @param {string} [config.speciesId='xylotrupes_rhinoceros_proto'] - Default species id
   */
  constructor(config = {}) {
    this._scenarioSeed = config.scenarioSeed || DEMO_SCENARIO_SEED;
    this._speciesProfile = config.speciesProfile || loadSpeciesProfile(config.speciesPath || 'data/species/xylotrupes_rhinoceros_proto.json');

    this._playbackStatus = PLAYBACK_STATUS.PAUSED;
    this._playbackSpeed = DEFAULT_PLAYBACK_SPEED;

    // Initialize world
    this._initWorld();
  }

  _initWorld() {
    const world = createDemoWorld({
      speciesProfile: this._speciesProfile,
      scenarioSeed: this._scenarioSeed
    });

    this._spatialWorld = world.spatialWorld;
    this._simWorld = world.simWorld;
    this._habitatRegistry = world.habitatRegistry;
    this._shelterRegistry = world.shelterRegistry;
    this._resourceZoneRegistry = world.resourceZoneRegistry;
    this._telemetryRecorder = world.telemetryRecorder;
  }

  get simulationTick() {
    return this._simWorld.getSimulationTick();
  }

  get playbackStatus() {
    return this._playbackStatus;
  }

  get playbackSpeed() {
    return this._playbackSpeed;
  }

  get scenarioSeed() {
    return this._scenarioSeed;
  }

  get simWorld() {
    return this._simWorld;
  }

  get spatialWorld() {
    return this._spatialWorld;
  }

  get habitatRegistry() {
    return this._habitatRegistry;
  }

  get shelterRegistry() {
    return this._shelterRegistry;
  }

  get resourceZoneRegistry() {
    return this._resourceZoneRegistry;
  }

  /**
   * Sets playback speed multiplier.
   * Only influences presentation scheduling cadence; never alters simulation math.
   * @param {number} speed
   */
  setPlaybackSpeed(speed) {
    if (!PLAYBACK_SPEEDS.includes(speed)) {
      throw new RangeError(`[DemoSimulationSession] Invalid playback speed '${speed}'. Supported: ${PLAYBACK_SPEEDS.join(', ')}`);
    }
    this._playbackSpeed = speed;
  }

  /**
   * Transitions playback status to PLAYING.
   */
  play() {
    this._playbackStatus = PLAYBACK_STATUS.PLAYING;
  }

  /**
   * Transitions playback status to PAUSED.
   */
  pause() {
    this._playbackStatus = PLAYBACK_STATUS.PAUSED;
  }

  /**
   * Advances the simulation by exactly N discrete biological ticks.
   * INVARIANT: Organism coordinates remain strictly unchanged during DEMO-01-A.
   *
   * @param {number} [ticks=1] - Number of authoritative discrete ticks to advance
   * @returns {Readonly<object>} Presentation snapshot after stepping
   */
  step(ticks = 1) {
    if (typeof ticks !== 'number' || !Number.isInteger(ticks) || ticks <= 0) {
      throw new RangeError(`[DemoSimulationSession] ticks must be a positive integer, received: ${ticks}`);
    }

    for (let t = 0; t < ticks; t++) {
      // 1. Authoritative Biological Tick
      const tickResult = executePopulationBiologicalTick(this._simWorld, FIXED_DELTA_TIME, {
        species_profile: this._speciesProfile,
        available_resource: 1000
      });

      // 2. Handle newborn events (N -> N+1 rule)
      if (tickResult.events && tickResult.events.length > 0) {
        for (const evt of tickResult.events) {
          if (evt.type === 'ORGANISM_BORN' && evt.child_id) {
            if (!this._spatialWorld.hasEntity(evt.child_id)) {
              // Assign parental or default location
              const parentRecord = evt.parent_id ? this._spatialWorld.getEntity(evt.parent_id) : null;
              const birthPos = parentRecord ? { ...parentRecord.position } : { x: 20, y: 20, z: 0 };
              this._spatialWorld.registerEntity({
                entity_id: evt.child_id,
                position: birthPos
              });
            }
          }
        }
      }

      // INVARIANT CHECK: Position never changes in DEMO-01-A.
      // updatePosition is strictly never called.
    }

    return this.getSnapshot();
  }

  /**
   * Presentation scheduling helper for deterministic discrete playback testing.
   * Simulates a virtual scheduling cycle at the current playback speed.
   * Dispatches exactly playbackSpeed ticks.
   * @returns {Readonly<object>} Presentation snapshot
   */
  dispatchPlaybackCadence() {
    if (this._playbackStatus !== PLAYBACK_STATUS.PLAYING) {
      return this.getSnapshot();
    }
    return this.step(this._playbackSpeed);
  }

  /**
   * Resets the entire simulation session:
   * 1. Stops playback (PAUSED)
   * 2. Destroys and reconstructs world from same scenario seed
   * 3. Tick clock returns to 0
   * @returns {Readonly<object>} Clean initial presentation snapshot
   */
  reset() {
    this._playbackStatus = PLAYBACK_STATUS.PAUSED;
    this._initWorld();
    return this.getSnapshot();
  }

  /**
   * Queries the authoritative presentation snapshot. Pure read-only.
   * @returns {Readonly<object>}
   */
  getSnapshot() {
    return buildPresentationSnapshot({
      simWorld: this._simWorld,
      spatialWorld: this._spatialWorld,
      habitatRegistry: this._habitatRegistry,
      shelterRegistry: this._shelterRegistry,
      resourceZoneRegistry: this._resourceZoneRegistry,
      playbackStatus: this._playbackStatus,
      playbackSpeed: this._playbackSpeed,
      scenarioSeed: this._scenarioSeed
    });
  }
}
