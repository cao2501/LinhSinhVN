/**
 * LinhSinhVN — Deterministic Population Seed Contract
 *
 * Implements the canonical 64-bit seed contract for population simulation:
 * PopulationTickSeed = Hash64(SimulationSeed | PopulationId | SimulationTick)
 *
 * Reuses the canonical SHA-256 Hash64 construction established across LinhSinhVN.
 */

import { createHash } from 'node:crypto';

const HEX_64_REGEX = /^0x[0-9a-fA-F]{16}$/;

/**
 * Derives a canonical 64-bit hexadecimal hash string from an arbitrary string payload.
 *
 * @param {string} payload
 * @returns {string} 64-bit hex string, e.g. "0x024aa8a38b63e1b2"
 */
export function hash64(payload) {
  const sha256Buffer = createHash('sha256').update(String(payload), 'utf8').digest();
  const seedBigInt = sha256Buffer.readBigUInt64BE(0);
  return '0x' + seedBigInt.toString(16).padStart(16, '0');
}

/**
 * Computes the deterministic 64-bit hex PopulationTickSeed.
 *
 * @param {string} simulationSeed - Master 64-bit hex simulation seed
 * @param {string} populationId - Unique population identifier
 * @param {number} simulationTick - Current non-negative integer simulation tick
 * @returns {string} 64-bit hex PopulationTickSeed
 * @throws {TypeError} If inputs fail canonical type/format validation
 */
export function computePopulationTickSeed(simulationSeed, populationId, simulationTick) {
  if (typeof simulationSeed !== 'string' || !HEX_64_REGEX.test(simulationSeed)) {
    throw new TypeError(`simulationSeed must be a valid 64-bit hex string (e.g. '0x024aa8a38b63e1b2'), received: ${simulationSeed}`);
  }
  if (typeof populationId !== 'string' || populationId.trim().length === 0) {
    throw new TypeError(`populationId must be a non-empty string, received: ${populationId}`);
  }
  if (typeof simulationTick !== 'number' || !Number.isInteger(simulationTick) || simulationTick < 0) {
    throw new TypeError(`simulationTick must be a non-negative integer, received: ${simulationTick}`);
  }

  const payload = `${simulationSeed}|${populationId}|${simulationTick}`;
  return hash64(payload);
}
