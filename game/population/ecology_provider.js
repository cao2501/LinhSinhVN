/**
 * LinhSinhVN — Deterministic Ecology Resource Provider & Feedback Foundation
 *
 * Enforces:
 * - INVARIANT-POPTICK-02: Environment(t) is immutable input snapshot of tick N.
 * - INVARIANT-POPTICK-03: Ecology feedback creates Environment(t+1) and NEVER mutates Environment(t).
 * - INVARIANT-POPTICK-06: ResourcePool and EnvironmentState are separate domain states;
 *   no implicit conversion without an explicit EcologyResourceProvider.
 * - Rule 7: Policy-driven Ecology ON.
 * - Rule 8: Ecology OFF guarantees Environment(t+1) equals Environment(t).
 * - Clamping of all environmental variables within canonical bounds.
 * - Zero nondeterministic APIs.
 */

import { createEnvironmentState, validateEnvironmentState } from './environment_state.js';

export class EcologyResourceProvider {
  /**
   * Evaluates available resource quantity for ResourcePool(t) at tick t.
   *
   * @param {object} environment - Canonical immutable Environment(t)
   * @param {object} [context] - Optional world context
   * @returns {number} Non-negative finite resource quantity
   */
  provideResource(environment, context = {}) {
    throw new Error('provideResource() must be implemented by subclass');
  }

  /**
   * Pure ecological feedback: generates Environment(t+1) from Environment(t) and consumption.
   * Must NEVER mutate currentEnvironment.
   *
   * @param {object} currentEnvironment - Canonical immutable Environment(t)
   * @param {object} consumptionSummary - { total_allocated, total_requested, initial_resource, remaining_resource }
   * @param {object} [context] - Optional context
   * @returns {Readonly<object>} Frozen canonical Environment(t+1)
   */
  applyFeedback(currentEnvironment, consumptionSummary, context = {}) {
    throw new Error('applyFeedback() must be implemented by subclass');
  }
}

/**
 * Standard deterministic policy: static quota per tick with optional ecological feedback.
 */
export class StaticQuotaEcologyProvider extends EcologyResourceProvider {
  /**
   * @param {object} [config={}]
   * @param {number} [config.quota=100.0] - Fixed resource quota provided per tick
   * @param {boolean} [config.enable_feedback=false] - If false (Ecology OFF), Environment(t+1) == Environment(t)
   * @param {number} [config.depletion_rate=0.005] - Depletion factor per allocated resource unit
   * @param {number} [config.regeneration_rate=0.0] - Bounded regeneration per tick
   * @param {number} [config.carrying_capacity=1.0] - Max food_resource bound
   */
  constructor(config = {}) {
    super();
    const {
      quota = 100.0,
      enable_feedback = false,
      depletion_rate = 0.005,
      regeneration_rate = 0.0,
      carrying_capacity = 1.0
    } = config;

    if (typeof quota !== 'number' || !Number.isFinite(quota) || quota < 0) {
      throw new TypeError(`quota must be a finite non-negative number, received: ${quota}`);
    }
    if (typeof enable_feedback !== 'boolean') {
      throw new TypeError(`enable_feedback must be a boolean, received: ${enable_feedback}`);
    }
    if (typeof depletion_rate !== 'number' || !Number.isFinite(depletion_rate) || depletion_rate < 0) {
      throw new TypeError(`depletion_rate must be a finite non-negative number, received: ${depletion_rate}`);
    }
    if (typeof regeneration_rate !== 'number' || !Number.isFinite(regeneration_rate) || regeneration_rate < 0) {
      throw new TypeError(`regeneration_rate must be a finite non-negative number, received: ${regeneration_rate}`);
    }

    this._quota = quota;
    this._enableFeedback = enable_feedback;
    this._depletionRate = depletion_rate;
    this._regenerationRate = regeneration_rate;
    this._carryingCapacity = Math.min(1.0, Math.max(0.0, carrying_capacity));
  }

  get quota() {
    return this._quota;
  }

  get enableFeedback() {
    return this._enableFeedback;
  }

  provideResource(environment, context = {}) {
    validateEnvironmentState(environment);
    return this._quota;
  }

  applyFeedback(currentEnvironment, consumptionSummary, context = {}) {
    validateEnvironmentState(currentEnvironment);

    // Ecology OFF: Environment(t+1) is equal to Environment(t)
    if (!this._enableFeedback) {
      return currentEnvironment;
    }

    // Ecology ON: compute consumption depletion and optional regeneration
    const allocated = consumptionSummary?.total_allocated || 0.0;
    const currentFood = currentEnvironment.food_resource;

    const depleted = currentFood - (allocated * this._depletionRate);
    const regenerated = depleted + this._regenerationRate;

    // Strict clamping within [0.0, carrying_capacity] and [0.0, 1.0]
    const clampedFood = Math.max(0.0, Math.min(this._carryingCapacity, Math.min(1.0, regenerated)));

    // Return new Environment(t+1); currentEnvironment is NEVER mutated
    return createEnvironmentState({
      ...currentEnvironment,
      food_resource: clampedFood
    });
  }
}

/**
 * Environmental fraction policy: derives pool resource proportionally from environment food_resource.
 */
export class EnvironmentalFractionProvider extends EcologyResourceProvider {
  /**
   * @param {object} [config={}]
   * @param {number} [config.harvest_fraction=0.5] - Fraction of environment food_resource harvested
   * @param {number} [config.resource_scale=100.0] - Scaling factor to pool units
   * @param {boolean} [config.enable_feedback=true] - Ecology feedback enabled
   * @param {number} [config.depletion_factor=0.005] - Food depletion factor
   * @param {number} [config.regeneration_rate=0.01] - Regeneration per tick
   */
  constructor(config = {}) {
    super();
    const {
      harvest_fraction = 0.5,
      resource_scale = 100.0,
      enable_feedback = true,
      depletion_factor = 0.005,
      regeneration_rate = 0.01
    } = config;

    if (typeof harvest_fraction !== 'number' || !Number.isFinite(harvest_fraction) || harvest_fraction < 0 || harvest_fraction > 1.0) {
      throw new RangeError(`harvest_fraction must be within [0.0, 1.0], received: ${harvest_fraction}`);
    }
    if (typeof resource_scale !== 'number' || !Number.isFinite(resource_scale) || resource_scale < 0) {
      throw new TypeError(`resource_scale must be a finite non-negative number, received: ${resource_scale}`);
    }

    this._harvestFraction = harvest_fraction;
    this._resourceScale = resource_scale;
    this._enableFeedback = enable_feedback;
    this._depletionFactor = depletion_factor;
    this._regenerationRate = regeneration_rate;
  }

  provideResource(environment, context = {}) {
    validateEnvironmentState(environment);
    return environment.food_resource * this._harvestFraction * this._resourceScale;
  }

  applyFeedback(currentEnvironment, consumptionSummary, context = {}) {
    validateEnvironmentState(currentEnvironment);

    if (!this._enableFeedback) {
      return currentEnvironment;
    }

    const allocated = consumptionSummary?.total_allocated || 0.0;
    const currentFood = currentEnvironment.food_resource;
    const depleted = currentFood - (allocated * this._depletionFactor);
    const regenerated = depleted + this._regenerationRate;
    const clampedFood = Math.max(0.0, Math.min(1.0, regenerated));

    return createEnvironmentState({
      ...currentEnvironment,
      food_resource: clampedFood
    });
  }
}

/**
 * Functional factory for StaticQuotaEcologyProvider.
 *
 * @param {object} [config]
 * @returns {StaticQuotaEcologyProvider}
 */
export function createStaticQuotaEcologyProvider(config) {
  return new StaticQuotaEcologyProvider(config);
}

/**
 * Functional factory for EnvironmentalFractionProvider.
 *
 * @param {object} [config]
 * @returns {EnvironmentalFractionProvider}
 */
export function createEnvironmentalFractionProvider(config) {
  return new EnvironmentalFractionProvider(config);
}
