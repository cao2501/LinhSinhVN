/**
 * LinhSinhVN — Lifecycle Simulation Runtime Package Entry Point
 * 
 * Exposes the headless, deterministic, generic life-cycle simulation runtime.
 */

export { loadSpeciesProfile, validateProfileContract, deepFreeze } from './profile_loader.js';
export { createOrganismState, assertStateInvariants } from './organism_state.js';
export { PIPELINE_STEPS, executeTickPipeline } from './tick_pipeline.js';
export { LifecycleEventEmitter, computeEventId } from './event_emitter.js';
export { serializeStateSnapshot } from './state_snapshot.js';
export { LifecycleRuntime } from './lifecycle_runtime.js';
