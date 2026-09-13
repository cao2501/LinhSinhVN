/**
 * LinhSinhVN — Spatial Coordinate Primitives & Geometric Distance Functions
 *
 * TASK 08-B: Deterministic Spatial Foundation
 *
 * Strict integer coordinates P = (x, y, z) in Z^3.
 * Signed 32-bit integer validation.
 * Rejects non-integers, NaN, Infinity.
 * Canonical grid distance & Euclidean distance squared.
 */

export const CANONICAL_FACINGS = Object.freeze([
  'NORTH',
  'EAST',
  'SOUTH',
  'WEST',
  'NORTH_EAST',
  'NORTH_WEST',
  'SOUTH_EAST',
  'SOUTH_WEST',
  'NONE'
]);

export const DEFAULT_K_VERTICAL = 3; // Prototype Spatial Geometric Scaling Constant
export const DEFAULT_K_Z = 2;        // Prototype Spatial Axis Scaling Constant

/**
 * Asserts that a value is a strict finite signed integer.
 * @param {unknown} val
 * @param {string} name
 * @returns {number}
 */
export function validateInteger(val, name = 'value') {
  if (typeof val !== 'number' || !Number.isFinite(val) || !Number.isInteger(val)) {
    throw new TypeError(`[SpatialCoordinates] ${name} must be a strict finite integer. Received: ${val} (${typeof val})`);
  }
  return val;
}

/**
 * Validates a 3D coordinate object P = (x, y, z).
 * @param {unknown} pos
 * @param {string} [name='position']
 * @returns {{ x: number, y: number, z: number }}
 */
export function validateCoordinate(pos, name = 'position') {
  if (!pos || typeof pos !== 'object') {
    throw new TypeError(`[SpatialCoordinates] ${name} must be a non-null object with {x, y, z}.`);
  }
  const x = validateInteger(pos.x, `${name}.x`);
  const y = validateInteger(pos.y, `${name}.y`);
  const z = validateInteger(pos.z, `${name}.z`);
  return { x, y, z };
}

/**
 * Returns an immutable frozen copy of a coordinate.
 * @param {{ x: number, y: number, z: number }} pos
 * @returns {Readonly<{ x: number, y: number, z: number }>}
 */
export function freezeCoordinate(pos) {
  const validated = validateCoordinate(pos);
  return Object.freeze({ x: validated.x, y: validated.y, z: validated.z });
}

/**
 * Deterministic Cell ID formatter.
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @returns {string} e.g. "cell_10_20_0"
 */
export function formatCellId(x, y, z) {
  validateInteger(x, 'x');
  validateInteger(y, 'y');
  validateInteger(z, 'z');
  return `cell_${x}_${y}_${z}`;
}

/**
 * Parses a cell ID back into coordinate components.
 * @param {string} cellId
 * @returns {{ x: number, y: number, z: number }}
 */
export function parseCellId(cellId) {
  if (typeof cellId !== 'string' || !cellId.startsWith('cell_')) {
    throw new Error(`[SpatialCoordinates] Invalid cellId format: ${cellId}`);
  }
  const parts = cellId.split('_');
  if (parts.length !== 4) {
    throw new Error(`[SpatialCoordinates] Invalid cellId format: ${cellId}. Expected cell_x_y_z`);
  }
  const x = Number(parts[1]);
  const y = Number(parts[2]);
  const z = Number(parts[3]);
  return validateCoordinate({ x, y, z }, 'parsedCellId');
}

/**
 * Canonical Grid Distance:
 * D_grid(P1, P2) = max(|dx|, |dy|) + |dz| * K_vertical
 *
 * Note: K_vertical is a PROTOTYPE SPATIAL GEOMETRIC SCALING CONSTANT,
 * NOT a biological energy cost or traversal cost.
 *
 * @param {{ x: number, y: number, z: number }} posA
 * @param {{ x: number, y: number, z: number }} posB
 * @param {number} [kVertical=DEFAULT_K_VERTICAL]
 * @returns {number}
 */
export function canonicalGridDistance(posA, posB, kVertical = DEFAULT_K_VERTICAL) {
  const a = validateCoordinate(posA, 'posA');
  const b = validateCoordinate(posB, 'posB');
  validateInteger(kVertical, 'kVertical');
  if (kVertical < 0) {
    throw new RangeError(`[SpatialCoordinates] kVertical must be non-negative. Received: ${kVertical}`);
  }
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  const dz = Math.abs(a.z - b.z);
  return Math.max(dx, dy) + dz * kVertical;
}

/**
 * Euclidean Distance Squared:
 * D^2_euclid(P1, P2) = dx^2 + dy^2 + (dz * K_z)^2
 *
 * Note: K_z is a PROTOTYPE SPATIAL AXIS SCALING CONSTANT.
 * Returns exact integer without square root floating-point rounding.
 *
 * @param {{ x: number, y: number, z: number }} posA
 * @param {{ x: number, y: number, z: number }} posB
 * @param {number} [kZ=DEFAULT_K_Z]
 * @returns {number}
 */
export function euclideanDistanceSquared(posA, posB, kZ = DEFAULT_K_Z) {
  const a = validateCoordinate(posA, 'posA');
  const b = validateCoordinate(posB, 'posB');
  validateInteger(kZ, 'kZ');
  if (kZ < 0) {
    throw new RangeError(`[SpatialCoordinates] kZ must be non-negative. Received: ${kZ}`);
  }
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dzScaled = (a.z - b.z) * kZ;
  return dx * dx + dy * dy + dzScaled * dzScaled;
}
