/**
 * @file habitat_resolver.js
 * @description Pure deterministic spatial habitat resolution.
 */

import { validateCoordinate } from '../coordinates.js';
import { DEFAULT_OPEN_TERRAIN_ID } from './habitat_definition.js';

/**
 * Pure function to resolve the primary canonical habitat at a coordinate.
 * Evaluation order:
 * 1. Find all habitats in registry whose regions contain the coordinate.
 * 2. Sort candidate habitats: priority DESC, then habitat_id ASC.
 * 3. Return the first matching candidate.
 * 4. Fallback: return registered DEFAULT_OPEN_TERRAIN.
 *
 * @param {{x: number, y: number, z: number}} coordinate
 * @param {import('./habitat_registry.js').HabitatRegistry} registry
 * @returns {import('./habitat_definition.js').HabitatDefinition}
 */
export function resolveHabitatAt(coordinate, registry) {
  validateCoordinate(coordinate);

  if (!registry || typeof registry.listHabitats !== 'function') {
    throw new TypeError('resolveHabitatAt requires a valid HabitatRegistry instance');
  }

  // Retrieve sorted list: priority DESC, then habitat_id ASC
  const registered = registry.listHabitats();

  for (const habitat of registered) {
    if (habitat.region.contains(coordinate)) {
      return habitat;
    }
  }

  // If no matching region (e.g. if default open terrain bounds did not cover or was unregistered)
  const defaultFallback = registry.getHabitat(DEFAULT_OPEN_TERRAIN_ID);
  if (defaultFallback) {
    return defaultFallback;
  }

  throw new Error(`Failed to resolve habitat at (${coordinate.x}, ${coordinate.y}, ${coordinate.z}): no matching habitat and no DEFAULT_OPEN_TERRAIN registered.`);
}

/**
 * Pure function to query all habitats covering a coordinate (for future multi-layer queries).
 * @param {{x: number, y: number, z: number}} coordinate
 * @param {import('./habitat_registry.js').HabitatRegistry} registry
 * @returns {import('./habitat_definition.js').HabitatDefinition[]}
 */
export function queryAllHabitatsAt(coordinate, registry) {
  validateCoordinate(coordinate);

  if (!registry || typeof registry.listHabitats !== 'function') {
    throw new TypeError('queryAllHabitatsAt requires a valid HabitatRegistry instance');
  }

  const matching = [];
  for (const habitat of registry.listHabitats()) {
    if (habitat.region.contains(coordinate)) {
      matching.push(habitat);
    }
  }
  return matching;
}
