/**
 * LinhSinhVN — Atomic Shelter Transactions
 *
 * TASK 08-D3: Deterministic Shelter Runtime
 *
 * Implements atomic 3-phase PLAN -> VALIDATE -> COMMIT protocol:
 * - ENTER_SHELTER: Validates spatial position, life state, capacity, and locomotion requirement before mutating.
 * - EXIT_SHELTER: Validates canonical occupancy before removing.
 *
 * Failure during validation results in ZERO state mutation.
 */



export const ShelterTransactionResultStatus = Object.freeze({
  SUCCESS: 'SUCCESS',
  REJECTED_MISSING_SHELTER: 'REJECTED_MISSING_SHELTER',
  REJECTED_MISSING_ORGANISM: 'REJECTED_MISSING_ORGANISM',
  REJECTED_DEAD_ORGANISM: 'REJECTED_DEAD_ORGANISM',
  REJECTED_NOT_AT_SHELTER_POSITION: 'REJECTED_NOT_AT_SHELTER_POSITION',
  REJECTED_CAPACITY_FULL: 'REJECTED_CAPACITY_FULL',
  REJECTED_ALREADY_SHELTERED: 'REJECTED_ALREADY_SHELTERED',
  REJECTED_LOCOMOTION_REQUIREMENT: 'REJECTED_LOCOMOTION_REQUIREMENT',
  REJECTED_NOT_AN_OCCUPANT: 'REJECTED_NOT_AN_OCCUPANT'
});

/**
 * Executes an atomic ENTER_SHELTER transaction.
 *
 * @param {object} params
 * @param {import('./shelter_registry.js').ShelterRegistry} params.shelterRegistry
 * @param {import('../spatial_world.js').SpatialWorld|import('../spatial_entity_registry.js').SpatialEntityRegistry} [params.spatialWorld]
 * @param {object} [params.populationRegistry]
 * @param {string} params.organismId
 * @param {string} params.shelterId
 * @param {string[]} [params.locomotionCapabilities=[]]
 * @returns {{ success: boolean, status: string, error?: string }}
 */
export function executeEnterShelter({
  shelterRegistry,
  spatialWorld,
  populationRegistry,
  organismId,
  shelterId,
  locomotionCapabilities = []
}) {
  if (!shelterRegistry) {
    throw new TypeError('[executeEnterShelter] shelterRegistry is required');
  }
  if (typeof organismId !== 'string' || !organismId) {
    throw new TypeError('[executeEnterShelter] organismId must be a non-empty string');
  }
  if (typeof shelterId !== 'string' || !shelterId) {
    throw new TypeError('[executeEnterShelter] shelterId must be a non-empty string');
  }

  // --- PHASE 1: PLAN (No mutation) ---
  const shelter = shelterRegistry.getShelter(shelterId);
  const occupancy = shelterRegistry.getOccupancy(shelterId);

  // --- PHASE 2: VALIDATE ---
  // 1. Shelter exists
  if (!shelter || !occupancy) {
    return {
      success: false,
      status: ShelterTransactionResultStatus.REJECTED_MISSING_SHELTER,
      error: `Shelter '${shelterId}' not found`
    };
  }

  // 2. Spatial existence & position
  let entityPos = null;
  if (spatialWorld) {
    const entity = spatialWorld.getEntity ? spatialWorld.getEntity(organismId) : (spatialWorld.registry?.getEntity(organismId) ?? null);
    if (!entity) {
      return {
        success: false,
        status: ShelterTransactionResultStatus.REJECTED_MISSING_ORGANISM,
        error: `Organism '${organismId}' not registered in spatial world`
      };
    }
    entityPos = entity.position;
  }

  // 3. Demographic life state (if populationRegistry provided)
  if (populationRegistry) {
    const org = populationRegistry.getOrganism ? populationRegistry.getOrganism(organismId) : (populationRegistry.organisms?.get(organismId) ?? null);
    if (org && (org.lifecycle_state === 'DEAD' || org.is_alive === false)) {
      return {
        success: false,
        status: ShelterTransactionResultStatus.REJECTED_DEAD_ORGANISM,
        error: `Organism '${organismId}' is dead`
      };
    }
  }

  // 4. Position match: organism must already be at the shelter coordinate
  if (entityPos && (entityPos.x !== shelter.position.x || entityPos.y !== shelter.position.y || entityPos.z !== shelter.position.z)) {
    return {
      success: false,
      status: ShelterTransactionResultStatus.REJECTED_NOT_AT_SHELTER_POSITION,
      error: `Organism '${organismId}' position (${entityPos.x},${entityPos.y},${entityPos.z}) does not match shelter position (${shelter.position.x},${shelter.position.y},${shelter.position.z})`
    };
  }

  // 5. Already sheltered check (cannot occupy two shelters simultaneously)
  const currentShelter = shelterRegistry.getShelteredIn(organismId);
  if (currentShelter !== null) {
    return {
      success: false,
      status: ShelterTransactionResultStatus.REJECTED_ALREADY_SHELTERED,
      error: `Organism '${organismId}' is already sheltered in '${currentShelter}'`
    };
  }

  // 6. Capacity check
  if (!occupancy.canAcceptOccupant()) {
    return {
      success: false,
      status: ShelterTransactionResultStatus.REJECTED_CAPACITY_FULL,
      error: `Shelter '${shelterId}' is at full capacity (${occupancy.capacity})`
    };
  }

  // 7. Locomotion requirement check
  if (shelter.entry_locomotion_requirement !== null) {
    const caps = Array.isArray(locomotionCapabilities) ? locomotionCapabilities : [];
    if (!caps.includes(shelter.entry_locomotion_requirement)) {
      return {
        success: false,
        status: ShelterTransactionResultStatus.REJECTED_LOCOMOTION_REQUIREMENT,
        error: `Organism '${organismId}' lacks required locomotion capability '${shelter.entry_locomotion_requirement}'`
      };
    }
  }

  // --- PHASE 3: COMMIT ---
  shelterRegistry._commitEnter(shelterId, organismId);

  return {
    success: true,
    status: ShelterTransactionResultStatus.SUCCESS
  };
}

/**
 * Executes an atomic EXIT_SHELTER transaction.
 *
 * @param {object} params
 * @param {import('./shelter_registry.js').ShelterRegistry} params.shelterRegistry
 * @param {string} params.organismId
 * @param {string} [params.shelterId]
 * @returns {{ success: boolean, status: string, error?: string }}
 */
export function executeExitShelter({
  shelterRegistry,
  organismId,
  shelterId
}) {
  if (!shelterRegistry) {
    throw new TypeError('[executeExitShelter] shelterRegistry is required');
  }
  if (typeof organismId !== 'string' || !organismId) {
    throw new TypeError('[executeExitShelter] organismId must be a non-empty string');
  }

  // Resolve target shelter
  const targetShelterId = shelterId || shelterRegistry.getShelteredIn(organismId);
  if (!targetShelterId) {
    return {
      success: false,
      status: ShelterTransactionResultStatus.REJECTED_NOT_AN_OCCUPANT,
      error: `Organism '${organismId}' is not currently sheltered`
    };
  }

  const occupancy = shelterRegistry.getOccupancy(targetShelterId);
  if (!occupancy || !occupancy.hasOccupant(organismId)) {
    return {
      success: false,
      status: ShelterTransactionResultStatus.REJECTED_NOT_AN_OCCUPANT,
      error: `Organism '${organismId}' is not an occupant of shelter '${targetShelterId}'`
    };
  }

  // COMMIT
  shelterRegistry._commitExit(targetShelterId, organismId);

  return {
    success: true,
    status: ShelterTransactionResultStatus.SUCCESS
  };
}
