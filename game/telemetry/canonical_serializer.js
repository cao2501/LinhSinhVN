/**
 * LinhSinhVN — Canonical Serializer
 * 
 * Provides deterministic, lexicographically sorted JSON serialization.
 * Enforces strict finite numbers, normalizes -0 to 0, rejects NaN and Infinities,
 * strips undefined object properties, and strictly preserves array element ordering.
 */

/**
 * Normalizes number according to simulation deterministic contracts.
 * Rejects NaN, Infinity, -Infinity. Normalizes -0 to 0.
 * 
 * @param {number} num
 * @returns {number}
 */
export function normalizeNumber(num) {
  if (typeof num !== 'number') {
    throw new TypeError(`normalizeNumber requires number, received: ${typeof num}`);
  }
  if (!Number.isFinite(num)) {
    throw new TypeError(`Canonical serialization rejects non-finite number: ${num}`);
  }
  return Object.is(num, -0) ? 0 : num;
}

/**
 * Recursively serializes any value into a canonical JSON string.
 * 
 * @param {any} val
 * @returns {string}
 */
export function canonicalSerialize(val) {
  if (val === null) {
    return 'null';
  }
  if (typeof val === 'number') {
    return JSON.stringify(normalizeNumber(val));
  }
  if (typeof val === 'string' || typeof val === 'boolean') {
    return JSON.stringify(val);
  }
  if (typeof val === 'bigint') {
    return JSON.stringify(val.toString());
  }
  if (Array.isArray(val)) {
    // INVARIANT: Preserve existing array ordering strictly. Do NOT sort array elements.
    const items = val.map(item => {
      if (item === undefined || typeof item === 'function' || typeof item === 'symbol') {
        return 'null';
      }
      return canonicalSerialize(item);
    });
    return '[' + items.join(',') + ']';
  }
  if (typeof val === 'object') {
    // Sort keys lexicographically
    const keys = Object.keys(val).sort();
    const entries = [];
    for (const key of keys) {
      const propVal = val[key];
      // Strip undefined, functions, and symbols
      if (propVal === undefined || typeof propVal === 'function' || typeof propVal === 'symbol') {
        continue;
      }
      entries.push(JSON.stringify(key) + ':' + canonicalSerialize(propVal));
    }
    return '{' + entries.join(',') + '}';
  }
  if (typeof val === 'undefined') {
    return undefined;
  }
  throw new TypeError(`Canonical serialization does not support type: ${typeof val}`);
}
