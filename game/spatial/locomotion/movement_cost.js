/**
 * LinhSinhVN — Spatial Movement Traversal Cost
 *
 * TASK 08-C: Locomotion & Movement Traversal Cost
 *
 * IMPORTANT ARCHITECTURAL INVARIANT:
 * MOVEMENT COST != BIOLOGICAL ENERGY EXPENDITURE
 *
 * Movement cost is purely spatial gameplay accounting in SPATIAL_COST_POINTS.
 * It is completely isolated from:
 * - stored_energy
 * - metabolic_drain
 * - starvation
 * - death
 * - ResourcePool
 */

import { canonicalGridDistance } from '../coordinates.js';

export const K_STEP = 10;           // Gameplay prototype spatial constant
export const K_VERTICAL_COST = 30;   // Gameplay prototype spatial constant
export const COST_UNIT = 'SPATIAL_COST_POINTS';

/**
 * Calculates deterministic spatial traversal cost.
 *
 * Formula:
 * base_cost = grid_distance * K_step
 * transition_cost = isVerticalTransition ? K_vertical_cost : 0
 * total_cost = base_cost + transition_cost
 *
 * @param {object} params
 * @param {{ x: number, y: number, z: number }} params.from
 * @param {{ x: number, y: number, z: number }} params.to
 * @param {boolean} [params.isVerticalTransition=false]
 * @param {number} [params.gridDistance=null]
 * @param {number} [params.resistanceModifier=100] - Extension point for future 08-D habitat resistance (100 = 1.0x)
 * @returns {Readonly<object>} MovementCost conforming to movement_cost.schema.json
 */
export function calculateMovementCost({
  from,
  to,
  isVerticalTransition = false,
  gridDistance = null,
  resistanceModifier = 100
}) {
  const distance = gridDistance !== null ? gridDistance : canonicalGridDistance(from, to, 3);

  const base_cost = distance * K_STEP;
  const transition_cost = isVerticalTransition ? K_VERTICAL_COST : 0;
  const total_cost = base_cost + transition_cost;

  if (!Number.isSafeInteger(total_cost) || total_cost < 0) {
    throw new RangeError(`[MovementCost] Invalid calculated cost: ${total_cost}`);
  }

  return Object.freeze({
    grid_distance: distance,
    base_cost,
    transition_cost,
    total_cost,
    unit: COST_UNIT
  });
}
