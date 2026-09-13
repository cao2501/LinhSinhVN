/**
 * LinhSinhVN — Deterministic Behavior Seed Derivation (TASK 07-B)
 * 
 * Ensures independent RNG domain separation for behavioral decisions:
 * Hash64(SimulationSeed | PopulationId | SimulationTick | OrganismId | "BEHAVIOR")
 * 
 * Complies strictly with zero nondeterminism invariants (Zero nondeterminism).
 */

import { createHash } from 'node:crypto';

/**
 * Derives a canonical 64-bit hexadecimal hash string (16 lowercase hex characters) from a payload.
 *
 * @param {string} payload
 * @returns {string} 16-character lowercase hex string, e.g. "024aa8a38b63e1b2"
 */
export function hash64(payload) {
  const sha256Buffer = createHash('sha256').update(String(payload), 'utf8').digest();
  const seedBigInt = sha256Buffer.readBigUInt64BE(0);
  return seedBigInt.toString(16).padStart(16, '0').toLowerCase();
}

/**
 * Derives a deterministic domain-separated behavior seed for stochastic decision branches.
 *
 * @param {string} simulationSeed - Authoritative world simulation seed (e.g. '0x1234567890abcdef')
 * @param {string} populationId - Unique population identifier
 * @param {number} simulationTick - Current simulation tick integer
 * @param {string} organismId - Unique organism identifier
 * @returns {string} 16-character hex string conforming to ^[0-9a-fA-F]{16}$
 */
export function deriveBehaviorSeed(simulationSeed, populationId, simulationTick, organismId) {
  if (!simulationSeed || typeof simulationSeed !== 'string') {
    throw new TypeError('simulationSeed must be a valid non-empty string');
  }
  if (!populationId || typeof populationId !== 'string') {
    throw new TypeError('populationId must be a valid non-empty string');
  }
  if (typeof simulationTick !== 'number' || !Number.isInteger(simulationTick) || simulationTick < 0) {
    throw new TypeError('simulationTick must be a non-negative integer');
  }
  if (!organismId || typeof organismId !== 'string') {
    throw new TypeError('organismId must be a valid non-empty string');
  }

  const payload = `${simulationSeed}|${populationId}|${simulationTick}|${organismId}|BEHAVIOR`;
  return hash64(payload);
}