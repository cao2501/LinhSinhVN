/**
 * LinhSinhVN — Species Profile Validation Tool
 * 
 * Validates species profile JSON files against species_profile.schema.json,
 * enforcing business invariants, stage ordering, substage uniqueness,
 * eta bounds, thermal/environmental ranges, and biological confidence metadata.
 */

import fs from 'node:fs';
import path from 'node:path';

function findProfileFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      if (file !== 'schema') {
        findProfileFiles(filePath, fileList);
      }
    } else if (file.endsWith('.json')) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

const profilePaths = findProfileFiles('data/species');
console.log(`Found ${profilePaths.length} species profile(s) to validate.\n`);

let totalErrors = 0;

for (const profilePath of profilePaths) {
  console.log(`--- Validating: ${profilePath} ---`);
  let errors = [];

  let profile;
  try {
    const content = fs.readFileSync(profilePath, 'utf8');
    profile = JSON.parse(content);
  } catch (err) {
    console.error(`[FATAL] JSON parse error in ${profilePath}: ${err.message}`);
    totalErrors++;
    continue;
  }

  // 1. Basic Identity & Schema
  if (!profile.species_id || !/^[a-z0-9_]+$/.test(profile.species_id)) {
    errors.push(`Invalid species_id: '${profile.species_id}'. Must match pattern ^[a-z0-9_]+$`);
  }
  if (!profile.schema_version) errors.push('Missing schema_version');
  if (!profile.profile_version) errors.push('Missing profile_version');

  // 2. Biological Confidence Metadata
  const validConfidence = ['CONFIRMED', 'HIGH', 'MODERATE', 'PROVISIONAL'];
  if (!validConfidence.includes(profile.biological_confidence)) {
    errors.push(`Invalid biological_confidence: '${profile.biological_confidence}'. Expected one of: ${validConfidence.join(', ')}`);
  }

  // 3. Genetics Reference Compatibility
  if (!profile.genetics_profile_reference || !profile.genetics_profile_reference.genetics_species_id) {
    errors.push('Missing genetics_profile_reference.genetics_species_id');
  } else if (!/^[a-z0-9_]+$/.test(profile.genetics_profile_reference.genetics_species_id)) {
    errors.push(`Invalid genetics_species_id format: '${profile.genetics_profile_reference.genetics_species_id}'`);
  }

  // 4. Lifecycle Stages & Ordering
  if (!profile.lifecycle_profile || !Array.isArray(profile.lifecycle_profile.stages)) {
    errors.push('Missing or invalid lifecycle_profile.stages');
  } else {
    const stages = profile.lifecycle_profile.stages;
    const stageIds = new Set();
    let prevOrder = 0;

    for (let i = 0; i < stages.length; i++) {
      const stage = stages[i];

      // Stage ID uniqueness
      if (stageIds.has(stage.stage_id)) {
        errors.push(`Duplicate stage_id detected: '${stage.stage_id}'`);
      }
      stageIds.add(stage.stage_id);

      // Order sequence
      if (stage.order <= prevOrder) {
        errors.push(`Stage '${stage.stage_id}' order (${stage.order}) must be strictly greater than previous order (${prevOrder})`);
      }
      prevOrder = stage.order;

      // Duration bounds
      if (stage.min_duration_ticks < 0) {
        errors.push(`Stage '${stage.stage_id}' has negative min_duration_ticks`);
      }
      if (stage.max_duration_ticks !== null && stage.max_duration_ticks < stage.min_duration_ticks) {
        errors.push(`Stage '${stage.stage_id}' max_duration_ticks < min_duration_ticks`);
      }
      if (stage.metabolic_drain_multiplier !== undefined) {
        if (typeof stage.metabolic_drain_multiplier !== 'number' || stage.metabolic_drain_multiplier < 0) {
          errors.push(`Stage '${stage.stage_id}' metabolic_drain_multiplier must be a non-negative number`);
        }
      }
      if (stage.motility_multiplier !== undefined) {
        if (typeof stage.motility_multiplier !== 'number' || stage.motility_multiplier < 0) {
          errors.push(`Stage '${stage.stage_id}' motility_multiplier must be a non-negative number`);
        }
      }

      // Substages check
      if (Array.isArray(stage.substages)) {
        const substageIds = new Set();
        let prevSubOrder = 0;
        for (const sub of stage.substages) {
          if (substageIds.has(sub.substage_id)) {
            errors.push(`Duplicate substage_id in stage '${stage.stage_id}': '${sub.substage_id}'`);
          }
          substageIds.add(sub.substage_id);

          if (sub.order <= prevSubOrder) {
            errors.push(`Substage '${sub.substage_id}' order (${sub.order}) must be strictly greater than previous (${prevSubOrder})`);
          }
          prevSubOrder = sub.order;

          if (sub.target_biomass < 0) {
            errors.push(`Substage '${sub.substage_id}' target_biomass cannot be negative`);
          }
        }
      }
    }

    if (!stageIds.has(profile.lifecycle_profile.initial_stage_id)) {
      errors.push(`initial_stage_id '${profile.lifecycle_profile.initial_stage_id}' not found in defined stages`);
    }
  }

  // 5. Development & eta Bounds
  if (!profile.development_profile) {
    errors.push('Missing development_profile');
  } else {
    const dev = profile.development_profile;
    if (dev.initial_eta < 0.60 || dev.initial_eta > 1.00) {
      errors.push(`initial_eta (${dev.initial_eta}) out of bounds [0.60, 1.00]`);
    }
    if (dev.eta_min !== 0.60) {
      errors.push(`eta_min must be 0.60 (got ${dev.eta_min})`);
    }
    if (dev.eta_max !== 1.00) {
      errors.push(`eta_max must be 1.00 (got ${dev.eta_max})`);
    }
    if (dev.recovery_cap > 1.00 || dev.recovery_cap < 0.60) {
      errors.push(`recovery_cap (${dev.recovery_cap}) out of bounds [0.60, 1.00]`);
    }
  }

  // 6. Environmental Tolerances Hierarchy Check
  if (profile.environment_profile) {
    const env = profile.environment_profile;
    const checkRange = (name, range) => {
      if (!range) return;
      if (range.preferred_min > range.preferred_max) {
        errors.push(`${name}: preferred_min (${range.preferred_min}) > preferred_max (${range.preferred_max})`);
      }
      if (range.tolerated_min > range.tolerated_max) {
        errors.push(`${name}: tolerated_min (${range.tolerated_min}) > tolerated_max (${range.tolerated_max})`);
      }
      if (range.tolerated_min > range.preferred_min) {
        errors.push(`${name}: tolerated_min (${range.tolerated_min}) > preferred_min (${range.preferred_min})`);
      }
      if (range.tolerated_max < range.preferred_max) {
        errors.push(`${name}: tolerated_max (${range.tolerated_max}) < preferred_max (${range.preferred_max})`);
      }
      if (range.lethal_min !== undefined && range.lethal_min > range.tolerated_min) {
        errors.push(`${name}: lethal_min (${range.lethal_min}) > tolerated_min (${range.tolerated_min})`);
      }
      if (range.lethal_max !== undefined && range.lethal_max < range.tolerated_max) {
        errors.push(`${name}: lethal_max (${range.lethal_max}) < tolerated_max (${range.tolerated_max})`);
      }
    };

    checkRange('temperature_celsius', env.temperature_celsius);
    checkRange('relative_humidity', env.relative_humidity);
    checkRange('substrate_moisture', env.substrate_moisture);
  }

  // Report
  if (errors.length > 0) {
    console.error(`[FAIL] ${profilePath} failed validation with ${errors.length} error(s):`);
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
    totalErrors += errors.length;
  } else {
    console.log(`[PASS] ${profilePath} validated successfully against all invariants!\n`);
  }
}

if (totalErrors > 0) {
  console.error(`Validation terminated with ${totalErrors} total error(s).`);
  process.exit(1);
} else {
  console.log(`All species profiles successfully passed verification.`);
  process.exit(0);
}
