/**
 * LinhSinhVN — Telemetry Digest
 * 
 * Pure mathematical 64-bit FNV-1a digest computation for simulation telemetry.
 * Independent module with ZERO coupling to game/behavior/**.
 */

import { canonicalSerialize } from './canonical_serializer.js';

const FNV_OFFSET_BASIS_64 = 0xcbf29ce484222325n;
const FNV_PRIME_64 = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;

/**
 * Pure mathematical 64-bit FNV-1a hash over UTF-8 bytes.
 * 
 * @param {string} str
 * @returns {string} 16-character lowercase hex string
 */
export function hash64(str) {
  if (typeof str !== 'string') {
    throw new TypeError(`hash64 requires a string, received ${typeof str}`);
  }
  let hash = FNV_OFFSET_BASIS_64;
  const bytes = Buffer.from(str, 'utf8');
  for (let i = 0; i < bytes.length; i++) {
    hash ^= BigInt(bytes[i]);
    hash = (hash * FNV_PRIME_64) & MASK_64;
  }
  return hash.toString(16).padStart(16, '0');
}

/**
 * Computes deterministic 64-bit hex digest for a telemetry record.
 * The digest field itself is excluded from hashing.
 * 
 * @param {object} record
 * @returns {string} 16-char hex digest
 */
export function calculateTelemetryDigest(record) {
  if (!record || typeof record !== 'object') {
    throw new TypeError('calculateTelemetryDigest requires an object record');
  }
  // Create shallow clone omitting 'digest'
  const recordWithoutDigest = {};
  for (const key of Object.keys(record)) {
    if (key !== 'digest') {
      recordWithoutDigest[key] = record[key];
    }
  }
  const serialized = canonicalSerialize(recordWithoutDigest);
  return hash64(serialized);
}

/**
 * Produces a full TelemetryDigest schema-compliant artifact.
 * 
 * @param {object} record
 * @returns {Readonly<object>}
 */
export function createTelemetryDigestArtifact(record) {
  const hash = calculateTelemetryDigest(record);
  return Object.freeze({
    schema_version: '1.0.0',
    simulation_tick: record.simulation_tick,
    algorithm: 'FNV-1a-64',
    hash
  });
}
