/**
 * LinhSinhVN — Deterministic RNG & 64-bit Seed Generator
 * 
 * Implements:
 * 1. Hash64: Cryptographic 64-bit deterministic hash derivation from canonical breeding parameters.
 * 2. DeterministicRNG: SplitMix64 pseudo-random number generator producing uniform floats in [0.0, 1.0).
 * 
 * Strictly decoupled from OS randomness, system time, and global engine state.
 */

import { createHash } from 'node:crypto';

const MASK_64 = 0xffffffffffffffffn;
const GOLDEN_GAMMA = 0x9e3779b97f4a7c15n;
const MIX_CONST_1 = 0xbf58476d1ce4e5b9n;
const MIX_CONST_2 = 0x94d049bb133111ebn;
const DOUBLE_UNIT = 9007199254740992.0; // 2^53

/**
 * Derives a 64-bit deterministic hexadecimal seed string from canonical breeding inputs.
 * Hash64(ParentA.id | ParentB.id | ParentA.generation | BreedingNonce)
 * 
 * @param {string} parentAId 
 * @param {string} parentBId 
 * @param {number|string} generation 
 * @param {number|string} breedingNonce 
 * @returns {string} Formatted 64-bit hex seed, e.g. "0xa8f432b911c840e2"
 */
export function computeBreedingSeed(parentAId, parentBId, generation, breedingNonce) {
  const canonicalPayload = `${String(parentAId)}|${String(parentBId)}|${String(generation)}|${String(breedingNonce)}`;
  const sha256Buffer = createHash('sha256').update(canonicalPayload, 'utf8').digest();
  
  // Read first 8 bytes as a 64-bit unsigned BigInt (big-endian)
  const seedBigInt = sha256Buffer.readBigUInt64BE(0);
  const hexString = '0x' + seedBigInt.toString(16).padStart(16, '0');
  return hexString;
}

/**
 * Fast, robust 64-bit SplitMix64 deterministic PRNG.
 */
export class DeterministicRNG {
  /**
   * @param {string|bigint|number} seedInput - Hex string ("0x..."), BigInt, or integer seed.
   */
  constructor(seedInput) {
    if (typeof seedInput === 'string') {
      const cleanHex = seedInput.trim().toLowerCase();
      this.state = BigInt(cleanHex.startsWith('0x') ? cleanHex : '0x' + cleanHex) & MASK_64;
    } else if (typeof seedInput === 'bigint') {
      this.state = seedInput & MASK_64;
    } else if (typeof seedInput === 'number') {
      this.state = BigInt(Math.floor(seedInput)) & MASK_64;
    } else {
      throw new TypeError(`Invalid seed input type for DeterministicRNG: ${typeof seedInput}`);
    }
    
    // Ensure state is non-zero to avoid initial degenerate cycles
    if (this.state === 0n) {
      this.state = GOLDEN_GAMMA;
    }
  }

  /**
   * Generates the next 64-bit unsigned pseudo-random integer.
   * @returns {bigint}
   */
  nextUInt64() {
    this.state = (this.state + GOLDEN_GAMMA) & MASK_64;
    let z = this.state;
    z = ((z ^ (z >> 30n)) * MIX_CONST_1) & MASK_64;
    z = ((z ^ (z >> 27n)) * MIX_CONST_2) & MASK_64;
    return (z ^ (z >> 31n)) & MASK_64;
  }

  /**
   * Generates a uniform pseudo-random float in [0.0, 1.0) with full 53-bit precision.
   * @returns {number}
   */
  nextFloat() {
    const u64 = this.nextUInt64();
    // Shift down to 53 bits for exact IEEE-754 double precision float
    const u53 = Number(u64 >> 11n);
    return u53 / DOUBLE_UNIT;
  }
}
