/**
 * LinhSinhVN — Lifecycle Simulation Runtime
 * 
 * Central coordinator for executing headless, deterministic life cycle simulation ticks.
 * Completely species-agnostic: consumes injected SpeciesProfile data.
 */

import { executeTickPipeline } from './tick_pipeline.js';
import { LifecycleEventEmitter } from './event_emitter.js';
import { serializeStateSnapshot } from './state_snapshot.js';

export class LifecycleRuntime {
  /**
   * @param {object} organismState - Runtime OrganismState
   * @param {object} speciesProfile - Deeply frozen SpeciesProfile
   */
  constructor(organismState, speciesProfile) {
    if (!organismState || typeof organismState !== 'object') {
      throw new TypeError('organismState must be a non-null object');
    }
    if (!speciesProfile || typeof speciesProfile !== 'object') {
      throw new TypeError('speciesProfile must be a non-null object');
    }

    this.state = organismState;
    this.profile = speciesProfile;
    this.emitter = new LifecycleEventEmitter(
      organismState.simulation_seed,
      organismState.organism_id,
      organismState.species_id
    );
  }

  /**
   * Returns whether the organism is currently alive and able to simulate ticks.
   * @returns {boolean}
   */
  isAlive() {
    return this.state.is_alive;
  }

  /**
   * Returns an immutable snapshot of current organism state.
   * @returns {Readonly<object>}
   */
  getSnapshot() {
    return serializeStateSnapshot(this.state);
  }

  /**
   * Executes a single simulation tick.
   * 
   * @param {object} tickInput - Input payload for this tick (deltaTime, environment, resources)
   * @returns {{ snapshot: object, events: Array<object> }}
   * @throws {Error} If organism is dead
   */
  tick(tickInput = {}) {
    if (!this.state.is_alive) {
      throw new Error(`Cannot tick dead organism '${this.state.organism_id}'`);
    }

    return executeTickPipeline(this.state, this.profile, tickInput, this.emitter);
  }
}
