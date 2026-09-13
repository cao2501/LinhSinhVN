/**
 * LinhSinhVN — Telemetry Diff
 * 
 * Recursively and deterministically compares two telemetry records to detect divergence.
 */

import { normalizeNumber } from './canonical_serializer.js';

/**
 * Deterministically compares two telemetry records or objects.
 * 
 * @param {any} expected
 * @param {any} actual
 * @param {string} [path='']
 * @param {Array<object>} [differences=[]]
 * @returns {{ equal: boolean, first_divergence_path: string|null, differences: Array<object> }}
 */
export function diffTelemetry(expected, actual, path = '', differences = []) {
  if (path === '') {
    differences = [];
  }

  // Identical reference or primitives
  if (Object.is(expected, actual)) {
    return finalizeDiff(differences);
  }

  // Type mismatch
  if (typeof expected !== typeof actual || expected === null || actual === null) {
    differences.push({
      path: path || '$',
      expected,
      actual
    });
    return finalizeDiff(differences);
  }

  // Numbers: handle -0 and finite numbers
  if (typeof expected === 'number') {
    const normExpected = normalizeNumber(expected);
    const normActual = normalizeNumber(actual);
    if (!Object.is(normExpected, normActual)) {
      differences.push({
        path: path || '$',
        expected: normExpected,
        actual: normActual
      });
    }
    return finalizeDiff(differences);
  }

  // Arrays
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) {
      differences.push({ path: path || '$', expected, actual });
      return finalizeDiff(differences);
    }
    const maxLen = Math.max(expected.length, actual.length);
    for (let i = 0; i < maxLen; i++) {
      const currentPath = path ? `${path}[${i}]` : `$[${i}]`;
      if (i >= expected.length || i >= actual.length) {
        differences.push({
          path: currentPath,
          expected: expected[i] !== undefined ? expected[i] : '<missing>',
          actual: actual[i] !== undefined ? actual[i] : '<missing>'
        });
      } else {
        diffTelemetry(expected[i], actual[i], currentPath, differences);
      }
    }
    return finalizeDiff(differences);
  }

  // Objects
  if (typeof expected === 'object') {
    const expectedKeys = Object.keys(expected).sort();
    const actualKeys = Object.keys(actual).sort();
    const allKeys = Array.from(new Set([...expectedKeys, ...actualKeys])).sort();

    for (const key of allKeys) {
      const currentPath = path ? `${path}.${key}` : `$.${key}`;
      if (!(key in expected)) {
        differences.push({
          path: currentPath,
          expected: '<missing>',
          actual: actual[key]
        });
      } else if (!(key in actual)) {
        differences.push({
          path: currentPath,
          expected: expected[key],
          actual: '<missing>'
        });
      } else {
        diffTelemetry(expected[key], actual[key], currentPath, differences);
      }
    }
    return finalizeDiff(differences);
  }

  // Other primitives (string, boolean)
  if (expected !== actual) {
    differences.push({
      path: path || '$',
      expected,
      actual
    });
  }

  return finalizeDiff(differences);
}

function finalizeDiff(differences) {
  const equal = differences.length === 0;
  return {
    equal,
    first_divergence_path: equal ? null : differences[0].path,
    differences
  };
}
