/**
 * LinhSinhVN — Canonical Environment State Foundation
 *
 * Defines the single canonical internal representation for simulation environments.
 * Conversion to lifecycle schema naming occurs strictly at the boundary via toLifecycleEnvironment().
 */

export const VALID_TIMES_OF_DAY = Object.freeze(['DAWN', 'DAY', 'DUSK', 'NIGHT']);
export const VALID_SEASONS = Object.freeze(['DRY', 'MONSOON', 'SPRING', 'SUMMER', 'AUTUMN', 'WINTER']);

const DEFAULT_ENVIRONMENT = Object.freeze({
  schema_version: '1.0.0',
  temperature: 25.0,
  humidity: 0.75,
  food_resource: 0.50,
  hazard_rating: 0.0,
  substrate_moisture: 0.65,
  substrate_organic_richness: 0.80,
  shelter_security_factor: 0.80,
  population_crowding_index: 0.10,
  time_of_day: 'DAY',
  season: 'DRY'
});

/**
 * Validates a canonical environment state object against strict bounds.
 *
 * @param {object} env
 * @throws {TypeError|RangeError} If validation fails
 */
export function validateEnvironmentState(env) {
  if (!env || typeof env !== 'object') {
    throw new TypeError('Environment state must be a non-null object');
  }

  // temperature [-20.0, 60.0]
  if (typeof env.temperature !== 'number' || !Number.isFinite(env.temperature)) {
    throw new TypeError(`temperature must be a finite number, received: ${env.temperature}`);
  }
  if (env.temperature < -20.0 || env.temperature > 60.0) {
    throw new RangeError(`temperature must be within [-20.0, 60.0], received: ${env.temperature}`);
  }

  // normalized [0.0, 1.0] fields
  const normalizedFields = [
    'humidity',
    'food_resource',
    'hazard_rating',
    'substrate_moisture',
    'substrate_organic_richness',
    'shelter_security_factor',
    'population_crowding_index'
  ];

  for (const field of normalizedFields) {
    const val = env[field];
    if (typeof val !== 'number' || !Number.isFinite(val)) {
      throw new TypeError(`${field} must be a finite number, received: ${val}`);
    }
    if (val < 0.0 || val > 1.0) {
      throw new RangeError(`${field} must be within [0.0, 1.0], received: ${val}`);
    }
  }

  // time_of_day enum
  if (!VALID_TIMES_OF_DAY.includes(env.time_of_day)) {
    throw new RangeError(`time_of_day must be one of [${VALID_TIMES_OF_DAY.join(', ')}], received: '${env.time_of_day}'`);
  }

  // season enum
  if (!VALID_SEASONS.includes(env.season)) {
    throw new RangeError(`season must be one of [${VALID_SEASONS.join(', ')}], received: '${env.season}'`);
  }
}

/**
 * Creates an immutable, canonical environment state.
 *
 * @param {object} [params={}] - Optional partial or full environment parameters
 * @returns {Readonly<object>} Frozen canonical environment state
 */
export function createEnvironmentState(params = {}) {
  if (params === null || typeof params !== 'object') {
    throw new TypeError('Environment input params must be an object');
  }

  // Ingest inputs, accepting incoming aliases at boundary and normalizing to canonical field names
  const rawTemp = params.temperature !== undefined ? params.temperature : params.ambient_temperature_celsius;
  const rawHumidity = params.humidity !== undefined ? params.humidity : params.relative_humidity;
  const rawFood = params.food_resource !== undefined ? params.food_resource : params.food_density;
  const rawHazard = params.hazard_rating !== undefined ? params.hazard_rating : params.environmental_hazard_rating;

  const env = {
    schema_version: '1.0.0',
    temperature: rawTemp !== undefined ? rawTemp : DEFAULT_ENVIRONMENT.temperature,
    humidity: rawHumidity !== undefined ? rawHumidity : DEFAULT_ENVIRONMENT.humidity,
    food_resource: rawFood !== undefined ? rawFood : DEFAULT_ENVIRONMENT.food_resource,
    hazard_rating: rawHazard !== undefined ? rawHazard : DEFAULT_ENVIRONMENT.hazard_rating,
    substrate_moisture: params.substrate_moisture !== undefined ? params.substrate_moisture : DEFAULT_ENVIRONMENT.substrate_moisture,
    substrate_organic_richness: params.substrate_organic_richness !== undefined ? params.substrate_organic_richness : DEFAULT_ENVIRONMENT.substrate_organic_richness,
    shelter_security_factor: params.shelter_security_factor !== undefined ? params.shelter_security_factor : DEFAULT_ENVIRONMENT.shelter_security_factor,
    population_crowding_index: params.population_crowding_index !== undefined ? params.population_crowding_index : DEFAULT_ENVIRONMENT.population_crowding_index,
    time_of_day: params.time_of_day !== undefined ? params.time_of_day : DEFAULT_ENVIRONMENT.time_of_day,
    season: params.season !== undefined ? params.season : DEFAULT_ENVIRONMENT.season
  };

  validateEnvironmentState(env);
  return Object.freeze(env);
}

/**
 * Boundary converter: converts canonical environment state into the exact field structure
 * expected by LifecycleRuntime.tick() and data/lifecycle/schema/environment_state.schema.json.
 *
 * @param {object} env - Canonical environment state
 * @returns {Readonly<object>} Lifecycle-compatible environment snapshot
 */
export function toLifecycleEnvironment(env) {
  validateEnvironmentState(env);

  return Object.freeze({
    schema_version: '1.0.0',
    ambient_temperature_celsius: env.temperature,
    relative_humidity: env.humidity,
    substrate_moisture: env.substrate_moisture,
    substrate_organic_richness: env.substrate_organic_richness,
    food_density: env.food_resource,
    shelter_security_factor: env.shelter_security_factor,
    population_crowding_index: env.population_crowding_index,
    environmental_hazard_rating: env.hazard_rating
  });
}
