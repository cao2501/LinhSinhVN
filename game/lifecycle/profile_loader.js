/**
 * LinhSinhVN — Species Profile Loader
 * 
 * Loads, validates, and freezes species profile configuration data.
 * Guarantees defensive immutability so runtime simulation cannot mutate profile definitions.
 * 
 * Conforms to data/species/schema/species_profile.schema.json.
 */

import fs from 'node:fs';

/**
 * Recursively freezes an object to ensure deep immutability.
 * @param {object} obj 
 * @returns {Readonly<object>}
 */
export function deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    const prop = obj[key];
    if (prop !== null && typeof prop === 'object' && !Object.isFrozen(prop)) {
      deepFreeze(prop);
    }
  }
  return obj;
}

/**
 * Validates a species profile object against mandatory structural and business invariants.
 * @param {object} profile 
 * @throws {TypeError|RangeError} If profile is invalid
 */
export function validateProfileContract(profile) {
  if (!profile || typeof profile !== 'object') {
    throw new TypeError('Species profile must be a non-null object');
  }

  // Identity
  if (!profile.species_id || typeof profile.species_id !== 'string' || !/^[a-z0-9_]+$/.test(profile.species_id)) {
    throw new TypeError(`Invalid species_id in profile: '${profile.species_id}'`);
  }
  if (!profile.schema_version || !profile.profile_version) {
    throw new TypeError('Species profile missing schema_version or profile_version');
  }

  // Genetics profile reference
  if (!profile.genetics_profile_reference || !profile.genetics_profile_reference.genetics_species_id) {
    throw new TypeError('Species profile missing genetics_profile_reference.genetics_species_id');
  }

  // Lifecycle profile
  const lc = profile.lifecycle_profile;
  if (!lc || !Array.isArray(lc.stages) || lc.stages.length === 0) {
    throw new TypeError('Species profile must define lifecycle_profile with at least one stage');
  }

  const stageIds = new Set();
  let prevOrder = 0;
  for (const stage of lc.stages) {
    if (!stage.stage_id || typeof stage.stage_id !== 'string') {
      throw new TypeError('Stage must have a valid string stage_id');
    }
    if (stageIds.has(stage.stage_id)) {
      throw new TypeError(`Duplicate stage_id detected: '${stage.stage_id}'`);
    }
    stageIds.add(stage.stage_id);

    if (typeof stage.order !== 'number' || stage.order <= prevOrder) {
      throw new RangeError(`Stage '${stage.stage_id}' order (${stage.order}) must be strictly ascending (prev: ${prevOrder})`);
    }
    prevOrder = stage.order;

    if (typeof stage.min_duration_ticks !== 'number' || stage.min_duration_ticks < 0) {
      throw new RangeError(`Stage '${stage.stage_id}' min_duration_ticks must be a non-negative number`);
    }

    if (Array.isArray(stage.substages)) {
      const subIds = new Set();
      let prevSubOrder = 0;
      for (const sub of stage.substages) {
        if (!sub.substage_id || subIds.has(sub.substage_id)) {
          throw new TypeError(`Duplicate or invalid substage_id in stage '${stage.stage_id}': '${sub.substage_id}'`);
        }
        subIds.add(sub.substage_id);
        if (typeof sub.order !== 'number' || sub.order <= prevSubOrder) {
          throw new RangeError(`Substage '${sub.substage_id}' order must be strictly ascending`);
        }
        prevSubOrder = sub.order;
      }
    }
  }

  if (!stageIds.has(lc.initial_stage_id)) {
    throw new TypeError(`initial_stage_id '${lc.initial_stage_id}' is not present in defined stages`);
  }

  // Development profile
  const dev = profile.development_profile;
  if (!dev) {
    throw new TypeError('Species profile missing development_profile');
  }
  if (dev.initial_eta < 0.60 || dev.initial_eta > 1.00) {
    throw new RangeError(`initial_eta must be in [0.60, 1.00]. Got: ${dev.initial_eta}`);
  }
  if (dev.eta_min !== 0.60 || dev.eta_max !== 1.00) {
    throw new RangeError('development_profile must specify eta_min: 0.60 and eta_max: 1.00');
  }
  if (!stageIds.has(dev.eta_lock_stage)) {
    throw new TypeError(`eta_lock_stage '${dev.eta_lock_stage}' is not a valid stage in lifecycle_profile`);
  }

  // Environment profile
  if (!profile.environment_profile) {
    throw new TypeError('Species profile missing environment_profile');
  }

  // Nutrition profile
  if (!profile.nutrition_profile) {
    throw new TypeError('Species profile missing nutrition_profile');
  }
}

/**
 * Loads a species profile from a file path or an in-memory object, validates it,
 * and returns a deeply frozen immutable configuration object.
 * 
 * @param {string|object} profileOrPath - File path to JSON or already parsed profile object
 * @returns {Readonly<object>} Immutable species profile
 */
export function loadSpeciesProfile(profileOrPath) {
  let profile;
  if (typeof profileOrPath === 'string') {
    const rawContent = fs.readFileSync(profileOrPath, 'utf8');
    profile = JSON.parse(rawContent);
  } else if (profileOrPath && typeof profileOrPath === 'object') {
    // Clone to isolate from caller mutations
    profile = JSON.parse(JSON.stringify(profileOrPath));
  } else {
    throw new TypeError(`Expected file path or object for species profile, got: ${typeof profileOrPath}`);
  }

  validateProfileContract(profile);
  return deepFreeze(profile);
}
