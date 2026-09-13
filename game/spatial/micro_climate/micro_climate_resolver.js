/**
 * @file micro_climate_resolver.js
 * @description Pure deterministic Micro-climate derivation runtime (TASK 08-D2).
 * Pipeline: Macro EnvironmentState -> Primary Habitat Delta -> Shelter Delta (if occupied) -> Clamping.
 * Decoupled from biological consequences, lifecycle, and ResourcePool.
 */

import { validateCoordinate } from '../coordinates.js';
import { resolveHabitatAt } from '../habitat/habitat_resolver.js';

/**
 * Pure referentially transparent function to derive local micro-climate conditions.
 *
 * @param {Object} params
 * @param {{x: number, y: number, z: number}} params.coordinate - Spatial location
 * @param {Object} params.environmentState - Macro EnvironmentState snapshot ({ temperature, humidity, ... })
 * @param {import('../habitat/habitat_registry.js').HabitatRegistry} params.habitatRegistry - Habitat registry
 * @param {Object} [params.shelterContext=null] - Optional immutable shelter context ({ is_sheltered, shelter_id, temperature_delta, humidity_delta, security_factor })
 * @param {number} [params.simulationTick=0] - Clock tick
 * @returns {Object} Deeply frozen MicroClimateSnapshot
 */
export function resolveMicroClimate({
  coordinate,
  environmentState,
  habitatRegistry,
  shelterContext = null,
  simulationTick = 0
}) {
  validateCoordinate(coordinate);

  if (!environmentState || typeof environmentState !== 'object') {
    throw new TypeError('resolveMicroClimate requires valid environmentState object');
  }
  if (typeof environmentState.temperature !== 'number' || !Number.isFinite(environmentState.temperature)) {
    throw new TypeError('environmentState.temperature must be a finite number');
  }
  if (typeof environmentState.humidity !== 'number' || !Number.isFinite(environmentState.humidity)) {
    throw new TypeError('environmentState.humidity must be a finite number');
  }

  if (!habitatRegistry || typeof habitatRegistry.listHabitats !== 'function') {
    throw new TypeError('resolveMicroClimate requires valid HabitatRegistry instance');
  }

  if (typeof simulationTick !== 'number' || !Number.isInteger(simulationTick) || simulationTick < 0) {
    throw new TypeError('simulationTick must be a non-negative integer');
  }

  // 1. Resolve primary canonical habitat
  const habitat = resolveHabitatAt(coordinate, habitatRegistry);
  const habitatMods = habitat.micro_climate_modifiers || {};

  // 2. Stage 1: Macro + Primary Habitat Deltas
  let temperature = environmentState.temperature + (habitatMods.temperature_modifier || 0.0);
  let humidity = environmentState.humidity + (habitatMods.humidity_modifier || 0.0);

  // 3. Stage 2: Shelter Delta (IF AND ONLY IF OCCUPIED)
  const isSheltered = Boolean(
    shelterContext &&
    shelterContext.is_sheltered === true &&
    typeof shelterContext.shelter_id === 'string' &&
    shelterContext.shelter_id.length > 0
  );

  const shelterId = isSheltered ? shelterContext.shelter_id : null;
  let effectiveSecurityFactor = 0.1;

  if (isSheltered) {
    if (typeof shelterContext.temperature_delta === 'number' && Number.isFinite(shelterContext.temperature_delta)) {
      temperature += shelterContext.temperature_delta;
    }
    if (typeof shelterContext.humidity_delta === 'number' && Number.isFinite(shelterContext.humidity_delta)) {
      humidity += shelterContext.humidity_delta;
    }
    if (typeof shelterContext.security_factor === 'number' && Number.isFinite(shelterContext.security_factor)) {
      effectiveSecurityFactor = shelterContext.security_factor;
    } else {
      effectiveSecurityFactor = 0.8;
    }
  } else {
    if (typeof habitatMods.shelter_security_baseline === 'number' && Number.isFinite(habitatMods.shelter_security_baseline)) {
      effectiveSecurityFactor = habitatMods.shelter_security_baseline;
    }
  }

  // 4. Stage 3: Field-Specific Clamping & Sanitization
  // - Temperature: finite number (unclamped delta)
  if (!Number.isFinite(temperature)) {
    throw new RangeError('Computed micro-climate temperature is not a finite number');
  }

  // - Humidity: clamp strictly to [0.0, 1.0]
  const clampedHumidity = Math.max(0.0, Math.min(1.0, humidity));

  // - Effective Security Factor: clamp strictly to [0.0, 1.0]
  const clampedSecurity = Math.max(0.0, Math.min(1.0, effectiveSecurityFactor));

  // 5. Output: Deeply frozen MicroClimateSnapshot
  const snapshot = {
    simulation_tick: simulationTick,
    position: Object.freeze({ x: coordinate.x, y: coordinate.y, z: coordinate.z }),
    primary_habitat_id: habitat.habitat_id,
    temperature,
    humidity: clampedHumidity,
    effective_security_factor: clampedSecurity,
    is_sheltered: isSheltered,
    shelter_id: shelterId
  };

  return Object.freeze(snapshot);
}
