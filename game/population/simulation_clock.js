/**
 * LinhSinhVN — Deterministic Simulation Clock
 *
 * Provides discrete, explicit tick advancement for simulation containers.
 * Strictly decoupled from real-world wall clock time (zero Date.now() / setTimeout).
 */

export class SimulationClock {
  /**
   * @param {number} [initialTick=0] - Initial non-negative integer tick counter
   */
  constructor(initialTick = 0) {
    if (typeof initialTick !== 'number' || !Number.isInteger(initialTick) || initialTick < 0) {
      throw new TypeError(`initialTick must be a non-negative integer, received: ${initialTick}`);
    }
    this._tick = initialTick;
    this._lastDeltaTime = null;
  }

  /**
   * Current discrete simulation tick.
   * @returns {number}
   */
  get tick() {
    return this._tick;
  }

  /**
   * Alias for current discrete simulation tick.
   * @returns {number}
   */
  get currentTick() {
    return this._tick;
  }

  /**
   * Most recent delta_time value passed to advance(), or null if not yet advanced.
   * @returns {number|null}
   */
  get lastDeltaTime() {
    return this._lastDeltaTime;
  }

  /**
   * Explicitly advances the clock by exactly +1 tick.
   *
   * @param {number} deltaTime - Explicit positive delta time for this tick
   * @returns {number} The new simulation tick
   * @throws {TypeError} If deltaTime is not a positive finite number
   */
  advance(deltaTime) {
    if (typeof deltaTime !== 'number' || !Number.isFinite(deltaTime) || deltaTime <= 0) {
      throw new TypeError(`deltaTime must be a positive finite number, received: ${deltaTime}`);
    }
    this._tick += 1;
    this._lastDeltaTime = deltaTime;
    return this._tick;
  }

  /**
   * Returns a serializable, frozen snapshot of the clock state.
   * @returns {Readonly<{ simulation_tick: number, last_delta_time: number|null }>}
   */
  snapshot() {
    return Object.freeze({
      simulation_tick: this._tick,
      last_delta_time: this._lastDeltaTime
    });
  }
}

/**
 * Functional factory for SimulationClock.
 *
 * @param {number} [initialTick=0]
 * @returns {SimulationClock}
 */
export function createSimulationClock(initialTick = 0) {
  return new SimulationClock(initialTick);
}
