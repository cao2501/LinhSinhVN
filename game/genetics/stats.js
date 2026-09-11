/**
 * LinhSinhVN — Derived Gameplay Stats Layer
 * 
 * Derives combat and survival gameplay values strictly from phenotype properties.
 * Adheres to docs/GENETICS_SPEC.md Section 7.
 * Conforms to data/genetics/schema/derived_stats.schema.json.
 */

import { SCHEMA_VERSION, BASE_ACTION_COST } from './constants.js';

/**
 * Derives gameplay stats from a computed phenotype object.
 * Pure function: GENOME != STATS.
 * 
 * @param {object} phenotype - Conforming OrganismPhenotype object
 * @returns {object} Conforming DerivedGameplayStats object
 */
export function calculateDerivedStats(phenotype) {
  if (!phenotype || typeof phenotype !== 'object') {
    throw new TypeError('calculateDerivedStats requires a valid phenotype object');
  }

  const {
    mass_index,
    cuticle_hardness_index,
    cephalic_horn_scale,
    tarsal_grip_index,
    stamina_economy_modifier,
    metabolic_drain_index,
    sensory_range_units
  } = phenotype;

  // 1. Max Health
  const maxHp = 100.0 + (mass_index * 50.0) + (cuticle_hardness_index * 20.0);

  // 2. Clash Power (horn leverage + leg claw push force)
  const clashPower = (cephalic_horn_scale * 50.0) + (tarsal_grip_index * 25.0);

  // 3. Armor Damage Reduction (0.0 to 0.50 soak)
  const armorReduction = ((cuticle_hardness_index - 1.0) / 2.0) * 0.50;

  // 4. Crawl Speed (traction vs mass resistance)
  const crawlSpeed = (10.0 + tarsal_grip_index * 3.0) * Math.pow(1.0 / mass_index, 0.35);

  // 5. Max Stamina (mass capacity minus horn mass penalty)
  const maxStamina = 80.0 + (mass_index * 25.0) - (cephalic_horn_scale * 15.0);

  // 6. Action Stamina Cost (standard combat clash baseline divided by economy modifier)
  const actionStaminaCost = BASE_ACTION_COST / stamina_economy_modifier;

  // 7. Stamina Recovery Rate
  const staminaRegenRate = 5.0 + (stamina_economy_modifier * 2.0);

  // 8. Perception Radius
  const perceptionRadius = sensory_range_units;

  // 9. Starvation Endurance Time
  const starvationEnduranceTime = (mass_index * 100.0) / metabolic_drain_index;

  return {
    schema_version: SCHEMA_VERSION,
    max_hp: maxHp,
    clash_power: clashPower,
    armor_reduction: armorReduction,
    crawl_speed: crawlSpeed,
    max_stamina: maxStamina,
    action_stamina_cost: actionStaminaCost,
    stamina_regen_rate: staminaRegenRate,
    perception_radius: perceptionRadius,
    starvation_endurance_time: starvationEnduranceTime
  };
}
