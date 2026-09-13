/**
 * LinhSinhVN — DEMO-01 Presentation Constants
 *
 * Checkpoint: DEMO-01-A First Playable Headless Simulation Session
 * Centralizes canonical demo configuration, scenario seed, and presentation mappings.
 */

export const DEMO_SCENARIO_SEED = '0x024aa8a38b63e1b2';

export const WORLD_WIDTH = 50;
export const WORLD_HEIGHT = 50;
export const Z_MIN = -1;
export const Z_MAX = 2;

export const FIXED_DELTA_TIME = 1.0;

export const DEFAULT_PLAYBACK_SPEED = 1;
export const PLAYBACK_SPEEDS = Object.freeze([1, 2, 5, 10]);

export const PLAYBACK_STATUS = Object.freeze({
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED'
});

export const INITIAL_POPULATION_COUNT = 10;
export const INITIAL_ORGANISM_PREFIX = 'demo_beetle_';

/**
 * Deterministic initial spatial coordinates for 10 organisms.
 * Bound within x = 20..24, y = 20..21, z = 0.
 */
export const INITIAL_ORGANISM_POSITIONS = Object.freeze([
  Object.freeze({ x: 20, y: 20, z: 0 }),
  Object.freeze({ x: 21, y: 20, z: 0 }),
  Object.freeze({ x: 22, y: 20, z: 0 }),
  Object.freeze({ x: 23, y: 20, z: 0 }),
  Object.freeze({ x: 24, y: 20, z: 0 }),
  Object.freeze({ x: 20, y: 21, z: 0 }),
  Object.freeze({ x: 21, y: 21, z: 0 }),
  Object.freeze({ x: 22, y: 21, z: 0 }),
  Object.freeze({ x: 23, y: 21, z: 0 }),
  Object.freeze({ x: 24, y: 21, z: 0 })
]);

export const CANONICAL_ACTION_LABELS = Object.freeze({
  FORAGE: 'Foraging',
  REST: 'Resting',
  SEEK_SHELTER: 'Seeking Shelter',
  SEEK_MATE: 'Seeking Mate',
  FLEE: 'Fleeing',
  EXPLORE: 'Exploring',
  NONE: 'None',
  IDLE: 'Idle'
});

export const CANONICAL_STAGE_LABELS = Object.freeze({
  STAGE_EGG: 'Egg',
  STAGE_LARVA: 'Larva',
  STAGE_PUPA: 'Pupa',
  STAGE_ADULT: 'Adult'
});
