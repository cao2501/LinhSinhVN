/**
 * LinhSinhVN — Spatial Context Composition
 *
 * TASK 08-D4: Resource Zone + Spatial Integration
 *
 * Pure read-only aggregation function that composes outputs from
 * authoritative spatial subsystems (Habitat, Shelter, Micro-climate, Resource Zones)
 * into a single unified SpatialContext snapshot.
 *
 * INVARIANT: Zero recalculation or domain leakage. Pure composition.
 */

import { resolveHabitatAt } from '../habitat/habitat_resolver.js';
import { resolveMicroClimate } from '../micro_climate/micro_climate_resolver.js';

/**
 * Composes authoritative spatial context at a given coordinate.
 *
 * @param {object} params
 * @param {{ x: number, y: number, z: number }} params.coordinate
 * @param {import('../habitat/habitat_registry.js').HabitatRegistry} params.habitatRegistry
 * @param {import('../shelter/shelter_registry.js').ShelterRegistry} [params.shelterRegistry]
 * @param {import('./resource_zone_registry.js').ResourceZoneRegistry} [params.resourceZoneRegistry]
 * @param {object} params.environmentState
 * @param {string} [params.organismId]
 * @returns {Readonly<object>}
 */
export function resolveSpatialContext({
  coordinate,
  habitatRegistry,
  shelterRegistry,
  resourceZoneRegistry,
  environmentState,
  organismId
}) {
  // 1. Primary Habitat Resolution
  const habitat = resolveHabitatAt(coordinate, habitatRegistry);

  // 2. Shelter Context (if sheltered)
  let shelterContext = null;
  if (shelterRegistry && organismId) {
    const shelteredIn = shelterRegistry.getShelteredIn(organismId);
    if (shelteredIn) {
      shelterContext = shelterRegistry.getShelterContext(shelteredIn);
    }
  }

  // 3. Micro-climate Snapshot
  const microClimate = resolveMicroClimate({
    coordinate,
    environmentState,
    habitatRegistry,
    shelterContext
  });

  // 4. Resource Zones at coordinate
  const resourceZones = resourceZoneRegistry
    ? resourceZoneRegistry.getZonesAtCoordinate(coordinate)
    : Object.freeze([]);

  return Object.freeze({
    coordinate: Object.freeze({ x: coordinate.x, y: coordinate.y, z: coordinate.z }),
    habitat_id: habitat.habitat_id,
    habitat_type: habitat.habitat_type,
    is_sheltered: microClimate.is_sheltered,
    shelter_id: microClimate.shelter_id,
    effective_security_factor: microClimate.effective_security_factor,
    micro_climate: microClimate,
    resource_zones: resourceZones
  });
}
