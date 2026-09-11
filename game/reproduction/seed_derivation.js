/**
 * LinhSinhVN — Independent RNG Domain Seed Derivations
 *
 * Ensures complete cryptographic decoupling between clutch, sex, genetics, ID, and simulation seeds:
 * BreedingSeed
 *  ├── ClutchSeed
 *  ├── ChildSexSeed(i)
 *  ├── ChildGeneticsSeed(i)
 *  ├── ChildIdHash(i)
 *  └── ChildSimSeed(i)
 */

import { createHash } from 'node:crypto';

/**
 * Derives a canonical 64-bit hexadecimal hash string from an arbitrary payload.
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
 * Derives the independent seed for clutch size determination.
 * @param {string} breedingSeed
 * @returns {string}
 */
export function deriveClutchSeed(breedingSeed) {
  return hash64(`${breedingSeed}|CLUTCH`);
}

/**
 * Derives the independent seed for child sex determination.
 * @param {string} breedingSeed
 * @param {number} childIndex
 * @returns {string}
 */
export function deriveChildSexSeed(breedingSeed, childIndex) {
  return hash64(`${breedingSeed}|SEX|${childIndex}`);
}

/**
 * Derives the independent seed for child genetics execution.
 * @param {string} breedingSeed
 * @param {number} childIndex
 * @returns {string}
 */
export function deriveChildGeneticsSeed(breedingSeed, childIndex) {
  return hash64(`${breedingSeed}|GENETICS|${childIndex}`);
}

/**
 * Derives the deterministic child ID: org_ + Hash64(BreedingSeed | "ID" | child_index)
 * @param {string} breedingSeed
 * @param {number} childIndex
 * @returns {string}
 */
export function deriveChildId(breedingSeed, childIndex) {
  const idHash = hash64(`${breedingSeed}|ID|${childIndex}`);
  return `org_${idHash.slice(2)}`;
}

/**
 * Derives the independent child simulation seed for lifecycle clock ticks.
 * @param {string} breedingSeed
 * @param {number} childIndex
 * @returns {string}
 */
export function deriveChildSimulationSeed(breedingSeed, childIndex) {
  return hash64(`${breedingSeed}|SIM|${childIndex}`);
}
