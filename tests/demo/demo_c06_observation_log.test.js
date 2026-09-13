/**
 * LinhSinhVN — DEMO-01-C / C-06 Presentation Observation Log Test Suite
 *
 * Checkpoint: DEMO-01-C / C-06 (Base Commit: 849e93a)
 * Verifies presentation-only observation log contract, Option A raw IPC observer,
 * deterministic batch ordering, global sequence monotonicity, cross-reset diff isolation,
 * and negative capability AST audits.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

// Pure JavaScript behavioral model matching godot/scripts/presentation/observation_log.gd
class ObservationLogModel {
  constructor(options = {}) {
    this.maxEntries = options.maxEntries || 100;
    this.lastDiffedTick = -1;
    this.hasSnapshotBaseline = false;
    this.previousSnapshotMap = new Map();
    this.previousCensus = null;
    this.sessionEpoch = 0;
    this.sequenceId = 0;
    this.observationRing = [];
    this.typeRanks = {
      SIMULATION_RESET: 0,
      ORGANISM_APPEARED: 1,
      STAGE_TRANSITION: 2,
      ACTION_INTENT_CHANGED: 3,
      ORGANISM_DIED: 4,
      CENSUS_UPDATED: 5
    };
  }

  getLastDiffedTick() {
    return this.lastDiffedTick;
  }

  hasSnapshotBaselineState() {
    return this.hasSnapshotBaseline;
  }

  getSessionEpoch() {
    return this.sessionEpoch;
  }

  getSequenceId() {
    return this.sequenceId;
  }

  getObservationCount() {
    return this.observationRing.length;
  }

  getObservations() {
    return [...this.observationRing];
  }

  clearLog() {
    this.observationRing = [];
  }

  onPlaybackStatusChanged(status) {
    this._appendPresentationObservation('PLAYBACK', 'PLAYBACK_STATE_CHANGED', 'system', `Playback status: ${status}`, { status });
  }

  onBridgeStateChanged(state) {
    this._appendPresentationObservation('TRANSPORT', 'BRIDGE_STATE_CHANGED', 'system', `Bridge transport: ${state}`, { state });
  }

  onZLayerChanged(newLayer) {
    this._appendPresentationObservation('VIEW', 'Z_LAYER_CHANGED', 'system', `Active view layer: Z=${newLayer}`, { z: newLayer });
  }

  onIpcResponseReceived(response) {
    if (!response || !response.success) {
      return;
    }

    const command = response.command || '';
    const result = response.result;
    if (!result || typeof result !== 'object') {
      return;
    }

    if (command !== 'step' && command !== 'getSnapshot' && command !== 'reset') {
      return;
    }

    const snapshot = result.snapshot;
    if (!snapshot || typeof snapshot !== 'object') {
      return;
    }

    const tick = snapshot.simulation_tick;
    if (typeof tick !== 'number' || !Number.isInteger(tick) || tick < 0) {
      return;
    }

    if (command === 'reset') {
      this._processResetSnapshot(snapshot, tick);
      return;
    }

    if (tick > this.lastDiffedTick) {
      this._processNewerSnapshot(snapshot, tick);
    } else if (tick === this.lastDiffedTick) {
      // Duplicate ignored
    } else {
      // Stale rejected
    }
  }

  _processResetSnapshot(snapshot, tick) {
    // Cross-reset diff isolation: clear baseline BEFORE seeding
    this.hasSnapshotBaseline = false;
    this.sessionEpoch += 1;
    this.lastDiffedTick = tick;
    this.previousSnapshotMap.clear();
    this.previousCensus = null;
    this.observationRing = []; // presentation UI cleanup

    // Append exactly one SIMULATION_RESET (sequence_id preserved and incremented)
    this._appendObservation({
      category: 'SIMULATION',
      type: 'SIMULATION_RESET',
      simulation_tick: tick,
      entity_id: 'system',
      summary: `Simulation reset to tick ${tick} (Epoch ${this.sessionEpoch})`,
      details: { epoch: this.sessionEpoch, tick }
    });

    // Seed baseline organisms
    const organisms = snapshot.organisms || [];
    const currentMap = this._indexOrganisms(organisms);
    const appearanceBatch = [];

    const orgIds = Array.from(currentMap.keys());
    this._sortStringArray(orgIds);

    for (const id of orgIds) {
      const org = currentMap.get(id);
      appearanceBatch.push({
        category: 'SIMULATION',
        type: 'ORGANISM_APPEARED',
        simulation_tick: tick,
        entity_id: id,
        summary: `Organism ${id} appeared in presentation snapshot as ${org.current_stage_id} at (${org.pos_x}, ${org.pos_y}, ${org.pos_z})`,
        details: { stage_id: org.current_stage_id, pos: { x: org.pos_x, y: org.pos_y, z: org.pos_z } }
      });
    }

    for (const obs of appearanceBatch) {
      this._appendObservation(obs);
    }

    this.previousSnapshotMap = currentMap;

    // Seed reset baseline census (do NOT emit CENSUS_UPDATED)
    if (snapshot.census && typeof snapshot.census === 'object') {
      this.previousCensus = { ...snapshot.census };
    } else {
      this.previousCensus = null;
    }
    this.hasSnapshotBaseline = true;
  }

  _processNewerSnapshot(snapshot, tick) {
    const organisms = snapshot.organisms || [];
    const currentMap = this._indexOrganisms(organisms);
    const candidateBatch = [];

    if (!this.hasSnapshotBaseline) {
      const orgIds = Array.from(currentMap.keys());
      this._sortStringArray(orgIds);

      for (const id of orgIds) {
        const org = currentMap.get(id);
        candidateBatch.push({
          category: 'SIMULATION',
          type: 'ORGANISM_APPEARED',
          simulation_tick: tick,
          entity_id: id,
          summary: `Organism ${id} appeared in presentation snapshot as ${org.current_stage_id} at (${org.pos_x}, ${org.pos_y}, ${org.pos_z})`,
          details: { stage_id: org.current_stage_id, pos: { x: org.pos_x, y: org.pos_y, z: org.pos_z } }
        });
      }

      // Establish census baseline on first snapshot (do NOT emit CENSUS_UPDATED)
      if (snapshot.census && typeof snapshot.census === 'object') {
        this.previousCensus = { ...snapshot.census };
      } else {
        this.previousCensus = null;
      }
      this.hasSnapshotBaseline = true;
    } else {
      const allIdsSet = new Set([...this.previousSnapshotMap.keys(), ...currentMap.keys()]);
      const allIds = Array.from(allIdsSet);
      this._sortStringArray(allIds);

      for (const id of allIds) {
        const inPrev = this.previousSnapshotMap.has(id);
        const inCurr = currentMap.has(id);

        if (!inPrev && inCurr) {
          const org = currentMap.get(id);
          candidateBatch.push({
            category: 'SIMULATION',
            type: 'ORGANISM_APPEARED',
            simulation_tick: tick,
            entity_id: id,
            summary: `Organism ${id} appeared in presentation snapshot as ${org.current_stage_id} at (${org.pos_x}, ${org.pos_y}, ${org.pos_z})`,
            details: { stage_id: org.current_stage_id, pos: { x: org.pos_x, y: org.pos_y, z: org.pos_z } }
          });
        } else if (inPrev && inCurr) {
          const prevOrg = this.previousSnapshotMap.get(id);
          const currOrg = currentMap.get(id);

          if (prevOrg.current_stage_id !== currOrg.current_stage_id) {
            candidateBatch.push({
              category: 'SIMULATION',
              type: 'STAGE_TRANSITION',
              simulation_tick: tick,
              entity_id: id,
              summary: `Organism ${id} transitioned stage: ${prevOrg.current_stage_id} -> ${currOrg.current_stage_id}`,
              details: { from: prevOrg.current_stage_id, to: currOrg.current_stage_id }
            });
          }

          if (prevOrg.action_intent !== currOrg.action_intent) {
            candidateBatch.push({
              category: 'SIMULATION',
              type: 'ACTION_INTENT_CHANGED',
              simulation_tick: tick,
              entity_id: id,
              summary: `Organism ${id} intent changed: ${prevOrg.action_intent} -> ${currOrg.action_intent}`,
              details: { from: prevOrg.action_intent, to: currOrg.action_intent }
            });
          }

          if (prevOrg.is_alive && !currOrg.is_alive) {
            candidateBatch.push({
              category: 'SIMULATION',
              type: 'ORGANISM_DIED',
              simulation_tick: tick,
              entity_id: id,
              summary: `Organism ${id} died at tick ${tick}`,
              details: { tick }
            });
          }
        } else if (inPrev && !inCurr) {
          const prevOrg = this.previousSnapshotMap.get(id);
          if (prevOrg && prevOrg.is_alive) {
            candidateBatch.push({
              category: 'SIMULATION',
              type: 'ORGANISM_DIED',
              simulation_tick: tick,
              entity_id: id,
              summary: `Organism ${id} died at tick ${tick}`,
              details: { tick }
            });
          }
        }
      }

      // Census change check
      if (snapshot.census && typeof snapshot.census === 'object') {
        const currentCensus = { ...snapshot.census };
        const prevAlive = Number(this.previousCensus?.alive_count ?? 0);
        const currAlive = Number(currentCensus.alive_count ?? 0);
        const prevDead = Number(this.previousCensus?.dead_count ?? 0);
        const currDead = Number(currentCensus.dead_count ?? 0);
        const prevTotal = Number(this.previousCensus?.total_count ?? 0);
        const currTotal = Number(currentCensus.total_count ?? 0);

        if (prevAlive !== currAlive || prevDead !== currDead || prevTotal !== currTotal) {
          candidateBatch.push({
            category: 'SIMULATION',
            type: 'CENSUS_UPDATED',
            simulation_tick: tick,
            entity_id: 'system',
            summary: `Census updated at tick ${tick}: ${currAlive} alive, ${currDead} dead, ${currTotal} total`,
            details: {
              alive_count: currAlive,
              dead_count: currDead,
              total_count: currTotal,
              prev_alive_count: prevAlive,
              prev_dead_count: prevDead,
              prev_total_count: prevTotal
            }
          });
        }
        this.previousCensus = currentCensus;
      }
    }

    this._sortObservationBatch(candidateBatch);

    for (const obs of candidateBatch) {
      this._appendObservation(obs);
    }

    this.lastDiffedTick = tick;
    this.previousSnapshotMap = currentMap;
  }

  _indexOrganisms(orgArray) {
    const map = new Map();
    for (const org of orgArray) {
      if (!org || typeof org !== 'object') continue;
      const id = org.organism_id;
      if (!id) continue;
      const pos = org.position || {};
      map.set(id, {
        is_alive: Boolean(org.is_alive),
        current_stage_id: String(org.current_stage_id || ''),
        action_intent: String(org.action_intent || ''),
        pos_x: Number(pos.x || 0),
        pos_y: Number(pos.y || 0),
        pos_z: Number(pos.z || 0)
      });
    }
    return map;
  }

  _appendPresentationObservation(category, type, entityId, summary, details) {
    this._appendObservation({
      category,
      type,
      simulation_tick: null,
      entity_id: entityId,
      summary,
      details
    });
  }

  _appendObservation(rawObs) {
    this.sequenceId += 1;
    const entry = {
      sequence_id: this.sequenceId,
      session_epoch: this.sessionEpoch,
      category: String(rawObs.category || 'SIMULATION'),
      type: String(rawObs.type || ''),
      simulation_tick: rawObs.simulation_tick !== undefined ? rawObs.simulation_tick : null,
      entity_id: String(rawObs.entity_id || 'system'),
      summary: String(rawObs.summary || ''),
      details: rawObs.details || {}
    };

    this.observationRing.push(entry);
    if (this.observationRing.length > this.maxEntries) {
      this.observationRing.shift();
    }
  }

  _compareStrings(a, b) {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }

  _sortStringArray(arr) {
    arr.sort((a, b) => this._compareStrings(String(a), String(b)));
  }

  _sortObservationBatch(batch) {
    batch.sort((a, b) => {
      const rankA = this.typeRanks[a.type] !== undefined ? this.typeRanks[a.type] : 99;
      const rankB = this.typeRanks[b.type] !== undefined ? this.typeRanks[b.type] : 99;
      if (rankA !== rankB) {
        return rankA - rankB;
      }
      return this._compareStrings(String(a.entity_id), String(b.entity_id));
    });
  }
}

// Sample test organism builder
function makeSampleOrg(id, stage = 'STAGE_LARVA', action = 'FORAGE', alive = true, pos = { x: 20, y: 20, z: 0 }) {
  return {
    organism_id: id,
    species_id: 'xylotrupes_rhinoceros_proto',
    generation: 1,
    sex: 'MALE',
    is_alive: alive,
    current_stage_id: stage,
    current_substage_id: null,
    stored_energy: 100,
    structural_biomass: 50,
    eta_current: 0.8,
    developmental_progress: 0.1,
    position: pos,
    action_intent: action,
    habitat_id: 'hab_canopy',
    sheltered_in: null,
    micro_climate: {},
    resource_zone_ids: [],
    action_display_label: action,
    stage_display_label: stage
  };
}

function makeSnapshot(tick, organisms = []) {
  return {
    schema_version: '1.0.0',
    simulation_tick: tick,
    simulation_seed: '0x1234567890abcdef',
    playback_status: 'PAUSED',
    playback_speed: 1,
    census: { alive_count: organisms.filter(o => o.is_alive).length, dead_count: organisms.filter(o => !o.is_alive).length, total_count: organisms.length },
    organisms
  };
}

// ==========================================
// C-06 TEST MATRIX (C06-01 through C06-32)
// ==========================================

test('C06-01: Initialization & Defaults', () => {
  const log = new ObservationLogModel();
  assert.equal(log.getLastDiffedTick(), -1);
  assert.equal(log.getSessionEpoch(), 0);
  assert.equal(log.getSequenceId(), 0);
  assert.equal(log.getObservationCount(), 0);
  assert.deepEqual(log.getObservations(), []);
});

test('C06-02: First Snapshot Processing', () => {
  const log = new ObservationLogModel();
  const orgA = makeSampleOrg('org_0');
  const orgB = makeSampleOrg('org_1');
  log.onIpcResponseReceived({
    success: true,
    command: 'getSnapshot',
    result: { snapshot: makeSnapshot(0, [orgA, orgB]) }
  });

  assert.equal(log.getLastDiffedTick(), 0);
  assert.equal(log.getObservationCount(), 2);
  const obs = log.getObservations();
  assert.equal(obs[0].type, 'ORGANISM_APPEARED');
  assert.equal(obs[0].entity_id, 'org_0');
  assert.equal(obs[1].type, 'ORGANISM_APPEARED');
  assert.equal(obs[1].entity_id, 'org_1');
});

test('C06-03: Presentation-Local Acceptance', () => {
  const log = new ObservationLogModel();
  const orgA = makeSampleOrg('org_0');
  log.onIpcResponseReceived({
    success: true,
    command: 'step',
    result: { snapshot: makeSnapshot(1, [orgA]) }
  });

  assert.equal(log.getLastDiffedTick(), 1);
  assert.equal(log.getObservationCount(), 1);
});

test('C06-04: Duplicate Snapshot Rejection', () => {
  const log = new ObservationLogModel();
  const orgA = makeSampleOrg('org_0');
  log.onIpcResponseReceived({
    success: true,
    command: 'step',
    result: { snapshot: makeSnapshot(1, [orgA]) }
  });
  const countBefore = log.getObservationCount();

  // Duplicate tick 1
  log.onIpcResponseReceived({
    success: true,
    command: 'getSnapshot',
    result: { snapshot: makeSnapshot(1, [orgA]) }
  });

  assert.equal(log.getObservationCount(), countBefore);
  assert.equal(log.getLastDiffedTick(), 1);
});

test('C06-05: Stale Snapshot Rejection', () => {
  const log = new ObservationLogModel();
  const orgA = makeSampleOrg('org_0');
  log.onIpcResponseReceived({
    success: true,
    command: 'step',
    result: { snapshot: makeSnapshot(5, [orgA]) }
  });
  const countBefore = log.getObservationCount();

  // Stale tick 3 < 5
  log.onIpcResponseReceived({
    success: true,
    command: 'step',
    result: { snapshot: makeSnapshot(3, [orgA]) }
  });

  assert.equal(log.getObservationCount(), countBefore);
  assert.equal(log.getLastDiffedTick(), 5);
});

test('C06-06: Reset Command Recognition', () => {
  const log = new ObservationLogModel();
  const orgA = makeSampleOrg('org_0');
  log.onIpcResponseReceived({
    success: true,
    command: 'step',
    result: { snapshot: makeSnapshot(5, [orgA]) }
  });

  log.onIpcResponseReceived({
    success: true,
    command: 'reset',
    result: { snapshot: makeSnapshot(0, [orgA]) }
  });

  assert.equal(log.getSessionEpoch(), 1);
  assert.equal(log.getLastDiffedTick(), 0);
  const obs = log.getObservations();
  assert.equal(obs[0].type, 'SIMULATION_RESET');
  assert.equal(obs[1].type, 'ORGANISM_APPEARED');
});

test('C06-07: Post-Reset Baseline Re-Seed', () => {
  const log = new ObservationLogModel();
  const orgA = makeSampleOrg('org_0');
  log.onIpcResponseReceived({
    success: true,
    command: 'reset',
    result: { snapshot: makeSnapshot(0, [orgA]) }
  });

  // Post-reset step 1
  const orgA_step1 = makeSampleOrg('org_0', 'STAGE_LARVA', 'REST');
  log.onIpcResponseReceived({
    success: true,
    command: 'step',
    result: { snapshot: makeSnapshot(1, [orgA_step1]) }
  });

  const obs = log.getObservations();
  const lastObs = obs[obs.length - 1];
  assert.equal(lastObs.type, 'ACTION_INTENT_CHANGED');
  assert.equal(lastObs.details.from, 'FORAGE');
  assert.equal(lastObs.details.to, 'REST');
});

test('C06-08: Appearance Semantics', () => {
  const log = new ObservationLogModel();
  const orgA = makeSampleOrg('org_0');
  log.onIpcResponseReceived({
    success: true,
    command: 'getSnapshot',
    result: { snapshot: makeSnapshot(0, [orgA]) }
  });

  const entry = log.getObservations()[0];
  assert.equal(entry.type, 'ORGANISM_APPEARED');
  assert.match(entry.summary, /appeared in presentation snapshot/i);
  assert.doesNotMatch(entry.summary, /born/i);
});

test('C06-09: Organism Death Detection', () => {
  const log = new ObservationLogModel();
  const orgAlive = makeSampleOrg('org_0', 'STAGE_ADULT', 'FORAGE', true);
  log.onIpcResponseReceived({
    success: true,
    command: 'step',
    result: { snapshot: makeSnapshot(1, [orgAlive]) }
  });

  const orgDead = makeSampleOrg('org_0', 'STAGE_ADULT', 'NONE', false);
  log.onIpcResponseReceived({
    success: true,
    command: 'step',
    result: { snapshot: makeSnapshot(2, [orgDead]) }
  });

  const obs = log.getObservations();
  const deathObs = obs.find(o => o.type === 'ORGANISM_DIED');
  assert.ok(deathObs);
  assert.equal(deathObs.entity_id, 'org_0');
  assert.equal(deathObs.simulation_tick, 2);
});

test('C06-10: Stage Transition Detection', () => {
  const log = new ObservationLogModel();
  const orgEgg = makeSampleOrg('org_0', 'STAGE_EGG');
  log.onIpcResponseReceived({
    success: true,
    command: 'step',
    result: { snapshot: makeSnapshot(1, [orgEgg]) }
  });

  const orgLarva = makeSampleOrg('org_0', 'STAGE_LARVA');
  log.onIpcResponseReceived({
    success: true,
    command: 'step',
    result: { snapshot: makeSnapshot(2, [orgLarva]) }
  });

  const obs = log.getObservations();
  const stageObs = obs.find(o => o.type === 'STAGE_TRANSITION');
  assert.ok(stageObs);
  assert.equal(stageObs.details.from, 'STAGE_EGG');
  assert.equal(stageObs.details.to, 'STAGE_LARVA');
});

test('C06-11: Action Intent Change Detection', () => {
  const log = new ObservationLogModel();
  const org1 = makeSampleOrg('org_0', 'STAGE_ADULT', 'REST');
  log.onIpcResponseReceived({
    success: true,
    command: 'step',
    result: { snapshot: makeSnapshot(1, [org1]) }
  });

  const org2 = makeSampleOrg('org_0', 'STAGE_ADULT', 'FORAGE');
  log.onIpcResponseReceived({
    success: true,
    command: 'step',
    result: { snapshot: makeSnapshot(2, [org2]) }
  });

  const obs = log.getObservations();
  const actObs = obs.find(o => o.type === 'ACTION_INTENT_CHANGED');
  assert.ok(actObs);
  assert.equal(actObs.details.from, 'REST');
  assert.equal(actObs.details.to, 'FORAGE');
});

test('C06-12: Playback State Observation', () => {
  const log = new ObservationLogModel();
  log.onPlaybackStatusChanged('PLAYING');
  log.onPlaybackStatusChanged('PAUSED');

  const obs = log.getObservations();
  assert.equal(obs.length, 2);
  assert.equal(obs[0].type, 'PLAYBACK_STATE_CHANGED');
  assert.equal(obs[0].simulation_tick, null);
  assert.equal(obs[0].details.status, 'PLAYING');
  assert.equal(obs[1].details.status, 'PAUSED');
});

test('C06-13: Bridge State Observation', () => {
  const log = new ObservationLogModel();
  log.onBridgeStateChanged('CONNECTED');
  log.onBridgeStateChanged('DISCONNECTED');

  const obs = log.getObservations();
  assert.equal(obs.length, 2);
  assert.equal(obs[0].type, 'BRIDGE_STATE_CHANGED');
  assert.equal(obs[0].simulation_tick, null);
  assert.equal(obs[0].details.state, 'CONNECTED');
});

test('C06-14: Z-Layer Change Observation', () => {
  const log = new ObservationLogModel();
  log.onZLayerChanged(1);
  log.onZLayerChanged(-1);

  const obs = log.getObservations();
  assert.equal(obs.length, 2);
  assert.equal(obs[0].type, 'Z_LAYER_CHANGED');
  assert.equal(obs[0].simulation_tick, null);
  assert.equal(obs[0].details.z, 1);
  assert.equal(obs[1].details.z, -1);
});

test('C06-15: Deterministic Batch Ordering', () => {
  const log = new ObservationLogModel();
  // Set initial baseline with org_b and org_a
  log.onIpcResponseReceived({
    success: true,
    command: 'step',
    result: { snapshot: makeSnapshot(1, [
      makeSampleOrg('org_b', 'STAGE_EGG', 'REST', true),
      makeSampleOrg('org_a', 'STAGE_LARVA', 'NONE', true)
    ]) }
  });

  // Step 2:
  // org_b transitions stage (EGG -> LARVA)
  // org_a dies (alive -> dead)
  // org_c appears (newly added)
  log.onIpcResponseReceived({
    success: true,
    command: 'step',
    result: { snapshot: makeSnapshot(2, [
      makeSampleOrg('org_b', 'STAGE_LARVA', 'REST', true),
      makeSampleOrg('org_a', 'STAGE_LARVA', 'NONE', false),
      makeSampleOrg('org_c', 'STAGE_EGG', 'REST', true)
    ]) }
  });

  // Batch for tick 2 should be ordered:
  // Rank 1: ORGANISM_APPEARED (org_c)
  // Rank 2: STAGE_TRANSITION (org_b)
  // Rank 4: ORGANISM_DIED (org_a)
  // Rank 5: CENSUS_UPDATED (system)
  const obs = log.getObservations().filter(o => o.simulation_tick === 2);
  assert.equal(obs.length, 4);
  assert.equal(obs[0].type, 'ORGANISM_APPEARED');
  assert.equal(obs[0].entity_id, 'org_c');
  assert.equal(obs[1].type, 'STAGE_TRANSITION');
  assert.equal(obs[1].entity_id, 'org_b');
  assert.equal(obs[2].type, 'ORGANISM_DIED');
  assert.equal(obs[2].entity_id, 'org_a');
  assert.equal(obs[3].type, 'CENSUS_UPDATED');
  assert.equal(obs[3].entity_id, 'system');
});

test('C06-16: Global Sequence Monotonicity', () => {
  const log = new ObservationLogModel();
  log.onBridgeStateChanged('CONNECTED'); // seq 1
  log.onIpcResponseReceived({
    success: true,
    command: 'step',
    result: { snapshot: makeSnapshot(1, [makeSampleOrg('org_0')]) } // seq 2
  });
  log.onZLayerChanged(1); // seq 3

  const obs = log.getObservations();
  assert.equal(obs[0].sequence_id, 1);
  assert.equal(obs[1].sequence_id, 2);
  assert.equal(obs[2].sequence_id, 3);
});

test('C06-17: Reset Preserves Sequence ID', () => {
  const log = new ObservationLogModel();
  log.onBridgeStateChanged('CONNECTED'); // seq 1
  log.onIpcResponseReceived({
    success: true,
    command: 'step',
    result: { snapshot: makeSnapshot(1, [makeSampleOrg('org_0')]) } // seq 2
  });

  // Reset: ring buffer cleared, but sequence_id continues to 3, 4...
  log.onIpcResponseReceived({
    success: true,
    command: 'reset',
    result: { snapshot: makeSnapshot(0, [makeSampleOrg('org_0')]) }
  });

  const obs = log.getObservations();
  assert.equal(obs[0].type, 'SIMULATION_RESET');
  assert.equal(obs[0].sequence_id, 3);
  assert.equal(obs[0].session_epoch, 1);
  assert.equal(obs[1].type, 'ORGANISM_APPEARED');
  assert.equal(obs[1].sequence_id, 4);
});

test('C06-18: Reset Double-Log Prevention', () => {
  const log = new ObservationLogModel();
  const orgA = makeSampleOrg('org_0');

  // getSnapshot at tick 0 is NOT a reset
  log.onIpcResponseReceived({
    success: true,
    command: 'getSnapshot',
    result: { snapshot: makeSnapshot(0, [orgA]) }
  });

  const obs = log.getObservations();
  assert.equal(obs.filter(o => o.type === 'SIMULATION_RESET').length, 0);
  assert.equal(log.getSessionEpoch(), 0);
});

test('C06-19: Queued Response FIFO Immunity', () => {
  const log = new ObservationLogModel();
  const orgA = makeSampleOrg('org_0');

  // Simulate 5 responses arriving in rapid succession
  for (let t = 1; t <= 5; t++) {
    log.onIpcResponseReceived({
      success: true,
      command: 'step',
      result: { snapshot: makeSnapshot(t, [orgA]) }
    });
  }

  assert.equal(log.getLastDiffedTick(), 5);
  // Only the first snapshot creates ORGANISM_APPEARED; subsequent ticks have no changes
  assert.equal(log.getObservationCount(), 1);
});

test('C06-20: C-04 Acceptance Contract Compatibility', () => {
  // Test matrix of 15 scenarios comparing C-04 decision vs C-06 decision
  const scenarios = [
    { name: 'first_snapshot_0', tick: 0, cmd: 'getSnapshot', expectAccepted: true },
    { name: 'step_1', tick: 1, cmd: 'step', expectAccepted: true },
    { name: 'duplicate_step_1', tick: 1, cmd: 'getSnapshot', expectAccepted: false },
    { name: 'step_2', tick: 2, cmd: 'step', expectAccepted: true },
    { name: 'stale_step_1', tick: 1, cmd: 'step', expectAccepted: false },
    { name: 'step_3', tick: 3, cmd: 'step', expectAccepted: true },
    { name: 'step_4', tick: 4, cmd: 'step', expectAccepted: true },
    { name: 'duplicate_step_4', tick: 4, cmd: 'step', expectAccepted: false },
    { name: 'reset_0', tick: 0, cmd: 'reset', expectAccepted: true, isReset: true },
    { name: 'post_reset_dup_0', tick: 0, cmd: 'getSnapshot', expectAccepted: false },
    { name: 'post_reset_step_1', tick: 1, cmd: 'step', expectAccepted: true },
    { name: 'negative_tick', tick: -5, cmd: 'step', expectAccepted: false },
    { name: 'float_tick', tick: 2.5, cmd: 'step', expectAccepted: false },
    { name: 'stale_pre_reset_attempt', tick: 0, cmd: 'step', expectAccepted: false },
    { name: 'step_2_new_epoch', tick: 2, cmd: 'step', expectAccepted: true }
  ];

  const log = new ObservationLogModel();
  const orgA = makeSampleOrg('org_0');

  for (const sc of scenarios) {
    const prevTick = log.getLastDiffedTick();
    const prevEpoch = log.getSessionEpoch();

    log.onIpcResponseReceived({
      success: true,
      command: sc.cmd,
      result: { snapshot: { ...makeSnapshot(sc.tick, [orgA]), simulation_tick: sc.tick } }
    });

    if (sc.expectAccepted) {
      assert.equal(log.getLastDiffedTick(), sc.tick, 'Scenario ' + sc.name + ' should update tick to ' + sc.tick);
      if (sc.isReset) {
        assert.equal(log.getSessionEpoch(), prevEpoch + 1);
      }
    } else {
      assert.equal(log.getLastDiffedTick(), prevTick, 'Scenario ' + sc.name + ' should NOT update tick');
    }
  }
});

test('C06-21: Disconnect Preservation', () => {
  const log = new ObservationLogModel();
  log.onIpcResponseReceived({
    success: true,
    command: 'step',
    result: { snapshot: makeSnapshot(1, [makeSampleOrg('org_0')]) }
  });

  const countBefore = log.getObservationCount();
  log.onBridgeStateChanged('DISCONNECTED');

  assert.equal(log.getObservationCount(), countBefore + 1);
  assert.equal(log.getLastDiffedTick(), 1);
  assert.equal(log.getObservations()[countBefore].type, 'BRIDGE_STATE_CHANGED');
});

test('C06-22: Ring Buffer Retention Bound', () => {
  const log = new ObservationLogModel({ maxEntries: 5 });
  for (let i = 1; i <= 10; i++) {
    log.onZLayerChanged(i % 3);
  }

  assert.equal(log.getObservationCount(), 5);
  const obs = log.getObservations();
  // Oldest entries 1..5 were popped, remaining are 6..10
  assert.equal(obs[0].sequence_id, 6);
  assert.equal(obs[4].sequence_id, 10);
});

test('C06-23: Deterministic Replay — 100 Runs', () => {
  function runSession() {
    const log = new ObservationLogModel();
    log.onBridgeStateChanged('CONNECTED');
    log.onIpcResponseReceived({
      success: true,
      command: 'getSnapshot',
      result: { snapshot: makeSnapshot(0, [makeSampleOrg('org_b'), makeSampleOrg('org_a')]) }
    });
    log.onIpcResponseReceived({
      success: true,
      command: 'step',
      result: { snapshot: makeSnapshot(1, [makeSampleOrg('org_b', 'STAGE_LARVA'), makeSampleOrg('org_a')]) }
    });
    log.onZLayerChanged(1);
    log.onIpcResponseReceived({
      success: true,
      command: 'reset',
      result: { snapshot: makeSnapshot(0, [makeSampleOrg('org_a')]) }
    });
    log.onIpcResponseReceived({
      success: true,
      command: 'step',
      result: { snapshot: makeSnapshot(1, [makeSampleOrg('org_a', 'STAGE_LARVA')]) }
    });
    return JSON.stringify(log.getObservations());
  }

  const baseline = runSession();
  for (let i = 0; i < 100; i++) {
    assert.equal(runSession(), baseline, 'Run ' + i + ' must produce identical byte output');
  }
});

test('C06-24: Negative Authority Audit', () => {
  const gdPath = 'd:/LinhSinhVN/godot/scripts/presentation/observation_log.gd';
  const content = fs.readFileSync(gdPath, 'utf8');

  const forbidden = [
    'SimulationWorld',
    'DemoSimulationSession',
    'step(',
    'deltaTime',
    'tick +='
  ];

  for (const term of forbidden) {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('#')) continue;
      assert.ok(!line.includes(term), 'Forbidden authority term ' + term + ' found on line ' + (i+1) + ': ' + line);
    }
  }
});

test('C06-25: Negative Biology Audit', () => {
  const gdPath = 'd:/LinhSinhVN/godot/scripts/presentation/observation_log.gd';
  const content = fs.readFileSync(gdPath, 'utf8');

  const forbidden = [
    'stored_energy',
    'structural_biomass',
    'metabolism'
  ];

  for (const term of forbidden) {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('#')) continue;
      assert.ok(!line.includes(term), 'Forbidden biology term ' + term + ' found on line ' + (i+1) + ': ' + line);
    }
  }
});

test('C06-26: Negative Time Audit', () => {
  const gdPath = 'd:/LinhSinhVN/godot/scripts/presentation/observation_log.gd';
  const content = fs.readFileSync(gdPath, 'utf8');

  const forbidden = [
    'Date.now',
    'Time.get_ticks',
    'performance.now',
    'OS.get_system_time'
  ];

  for (const term of forbidden) {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('#')) continue;
      assert.ok(!line.includes(term), 'Forbidden time API ' + term + ' found on line ' + (i+1) + ': ' + line);
    }
  }
});

test('C06-27: Negative Spatial Audit', () => {
  const gdPath = 'd:/LinhSinhVN/godot/scripts/presentation/observation_log.gd';
  const content = fs.readFileSync(gdPath, 'utf8');

  const forbidden = [
    'lerp(',
    'create_tween',
    'position +=',
    'velocity'
  ];

  for (const term of forbidden) {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('#')) continue;
      assert.ok(!line.includes(term), 'Forbidden spatial term ' + term + ' found on line ' + (i+1) + ': ' + line);
    }
  }

  // Also check comparator forbidden APIs
  assert.ok(!content.includes('localeCompare'), 'localeCompare is forbidden');
  assert.ok(!content.includes('Intl.Collator'), 'Intl.Collator is forbidden');
});

test('C06-28: Frozen Domain Audit', () => {
  const status = execSync('git diff --name-status 849e93a..HEAD', { cwd: 'd:/LinhSinhVN', encoding: 'utf8' });
  const lines = status.trim().split('\n').filter(Boolean);

  const allowed = [
    'godot/scripts/presentation/observation_log.gd',
    'tests/demo/demo_c06_observation_log.test.js',
    'godot/scenes/world_view.tscn'
  ];

  for (const line of lines) {
    const parts = line.split('\t');
    const filePath = parts[1] || parts[0];
    const isAllowed = allowed.some(a => filePath.endsWith(a) || filePath.includes(a));
    assert.ok(isAllowed, 'Unpermitted modification in frozen domain: ' + filePath);
  }
});

test('C06-29: Scene Hierarchy Boundary', () => {
  const tscnPath = 'd:/LinhSinhVN/godot/scenes/world_view.tscn';
  const content = fs.readFileSync(tscnPath, 'utf8');

  assert.ok(content.includes('ext_resource type="Script" path="res://scripts/presentation/observation_log.gd"'));
  assert.ok(content.includes('[node name="ObservationLog" type="Control" parent="UI"]'));
  // Ensure existing nodes are intact
  assert.ok(content.includes('[node name="PresentationControls" type="Control" parent="UI"]'));
  assert.ok(content.includes('[node name="SnapshotSynchronizer" type="Node" parent="."]'));
  assert.ok(content.includes('[node name="IpcClient" type="Node" parent="."]'));
});

test('C06-30: Cross-Reset Diff Isolation', () => {
  const log = new ObservationLogModel();

  // Epoch 0, Tick 0: org_0 in egg stage
  log.onIpcResponseReceived({
    success: true,
    command: 'getSnapshot',
    result: { snapshot: makeSnapshot(0, [makeSampleOrg('org_0', 'STAGE_EGG', 'REST', true)]) }
  });

  // Epoch 0, Tick 1: org_0 transitions to larva
  log.onIpcResponseReceived({
    success: true,
    command: 'step',
    result: { snapshot: makeSnapshot(1, [makeSampleOrg('org_0', 'STAGE_LARVA', 'REST', true)]) }
  });

  const obsEpoch0 = log.getObservations();
  assert.ok(obsEpoch0.some(o => o.type === 'STAGE_TRANSITION' && o.session_epoch === 0));

  // RESET occurs: world resets, org_0 is reset to egg stage in Epoch 1
  log.onIpcResponseReceived({
    success: true,
    command: 'reset',
    result: { snapshot: makeSnapshot(0, [makeSampleOrg('org_0', 'STAGE_EGG', 'REST', true)]) }
  });

  // Epoch 1, Tick 1: org_0 remains in egg stage
  log.onIpcResponseReceived({
    success: true,
    command: 'step',
    result: { snapshot: makeSnapshot(1, [makeSampleOrg('org_0', 'STAGE_EGG', 'REST', true)]) }
  });

  const obsEpoch1 = log.getObservations();
  // CRITICAL INVARIANT: In Epoch 1, org_0 was egg at tick 0 and egg at tick 1.
  // There MUST NOT be any STAGE_TRANSITION from larva (Epoch 0) back to egg (Epoch 1)!
  const crossResetTransition = obsEpoch1.find(o => o.type === 'STAGE_TRANSITION' && o.session_epoch === 1);
  assert.equal(crossResetTransition, undefined, 'Must not generate cross-reset diff transition between Epoch 0 and Epoch 1');

  // There MUST NOT be any DEATH event across reset
  const crossResetDeath = obsEpoch1.find(o => o.type === 'ORGANISM_DIED' && o.session_epoch === 1);
  assert.equal(crossResetDeath, undefined, 'Must not generate cross-reset death');
});

test('C06-31: Reset Exactly-Once Semantics', () => {
  const log = new ObservationLogModel();
  const orgA = makeSampleOrg('org_0');

  // Reset 1
  log.onIpcResponseReceived({
    success: true,
    command: 'reset',
    result: { snapshot: makeSnapshot(0, [orgA]) }
  });

  assert.equal(log.getSessionEpoch(), 1);
  const resetEvents = log.getObservations().filter(o => o.type === 'SIMULATION_RESET');
  assert.equal(resetEvents.length, 1);

  // Subsequent duplicate / non-reset tick 0 query
  log.onIpcResponseReceived({
    success: true,
    command: 'getSnapshot',
    result: { snapshot: makeSnapshot(0, [orgA]) }
  });

  assert.equal(log.getSessionEpoch(), 1);
  const resetEventsAfter = log.getObservations().filter(o => o.type === 'SIMULATION_RESET');
  assert.equal(resetEventsAfter.length, 1, 'Exactly one reset event must exist');
});

test('C06-32: Tick-0 Non-Reset Preservation', () => {
  const log = new ObservationLogModel();
  const orgA = makeSampleOrg('org_0');

  // Step to tick 2
  log.onIpcResponseReceived({
    success: true,
    command: 'step',
    result: { snapshot: makeSnapshot(2, [orgA]) }
  });
  log.onZLayerChanged(1); // add a view event

  const epochBefore = log.getSessionEpoch();
  const tickBefore = log.getLastDiffedTick();
  const obsCountBefore = log.getObservationCount();

  // Query getSnapshot returning tick 0 (anomalous or stale)
  log.onIpcResponseReceived({
    success: true,
    command: 'getSnapshot',
    result: { snapshot: makeSnapshot(0, [orgA]) }
  });

  // Must NOT increment epoch, must NOT clear ring buffer, must NOT append SIMULATION_RESET
  assert.equal(log.getSessionEpoch(), epochBefore);
  assert.equal(log.getLastDiffedTick(), tickBefore);
  assert.equal(log.getObservationCount(), obsCountBefore);
  assert.equal(log.getObservations().some(o => o.type === 'SIMULATION_RESET'), false);
});


// ==========================================
// C-06 PATCH-01: CENSUS_UPDATED TESTS (C06-33 through C06-38)
// ==========================================

test('C06-33: Census Baseline Initialization', () => {
  const log = new ObservationLogModel();
  const orgA = makeSampleOrg('org_0');

  log.onIpcResponseReceived({
    success: true,
    command: 'getSnapshot',
    result: {
      snapshot: {
        ...makeSnapshot(0, [orgA]),
        census: { alive_count: 1, dead_count: 0, total_count: 1 }
      }
    }
  });

  const obs = log.getObservations();
  const censusObs = obs.filter(o => o.type === 'CENSUS_UPDATED');
  assert.equal(censusObs.length, 0, 'First snapshot must seed census baseline without emitting CENSUS_UPDATED');
});

test('C06-34: Census Change Detection', () => {
  const log = new ObservationLogModel();
  const orgA = makeSampleOrg('org_0');

  // Baseline
  log.onIpcResponseReceived({
    success: true,
    command: 'step',
    result: {
      snapshot: {
        ...makeSnapshot(1, [orgA]),
        census: { alive_count: 1, dead_count: 0, total_count: 1 }
      }
    }
  });

  // Census change at tick 2
  log.onIpcResponseReceived({
    success: true,
    command: 'step',
    result: {
      snapshot: {
        ...makeSnapshot(2, [orgA]),
        census: { alive_count: 2, dead_count: 0, total_count: 2 }
      }
    }
  });

  const obs = log.getObservations();
  const censusObs = obs.filter(o => o.type === 'CENSUS_UPDATED');
  assert.equal(censusObs.length, 1, 'Changed authoritative census must produce exactly one CENSUS_UPDATED');
  assert.equal(censusObs[0].simulation_tick, 2);
  assert.equal(censusObs[0].entity_id, 'system');
  assert.equal(censusObs[0].details.alive_count, 2);
  assert.equal(censusObs[0].details.prev_alive_count, 1);
});

test('C06-35: Census Unchanged', () => {
  const log = new ObservationLogModel();
  const orgA = makeSampleOrg('org_0');

  // Baseline
  log.onIpcResponseReceived({
    success: true,
    command: 'step',
    result: {
      snapshot: {
        ...makeSnapshot(1, [orgA]),
        census: { alive_count: 1, dead_count: 0, total_count: 1 }
      }
    }
  });

  // Identical census at tick 2
  log.onIpcResponseReceived({
    success: true,
    command: 'step',
    result: {
      snapshot: {
        ...makeSnapshot(2, [orgA]),
        census: { alive_count: 1, dead_count: 0, total_count: 1 }
      }
    }
  });

  const obs = log.getObservations();
  const censusObs = obs.filter(o => o.type === 'CENSUS_UPDATED');
  assert.equal(censusObs.length, 0, 'Identical census must produce zero CENSUS_UPDATED');
});

test('C06-36: Census Cross-Reset Isolation', () => {
  const log = new ObservationLogModel();
  const orgA = makeSampleOrg('org_0');

  // Epoch 0 baseline & step with large census
  log.onIpcResponseReceived({
    success: true,
    command: 'step',
    result: {
      snapshot: {
        ...makeSnapshot(1, [orgA]),
        census: { alive_count: 10, dead_count: 0, total_count: 10 }
      }
    }
  });

  // Authoritative reset arrives with post-reset snapshot census (2 alive)
  log.onIpcResponseReceived({
    success: true,
    command: 'reset',
    result: {
      snapshot: {
        ...makeSnapshot(0, [orgA]),
        census: { alive_count: 2, dead_count: 0, total_count: 2 }
      }
    }
  });

  // Reset MUST NOT emit CENSUS_UPDATED
  const resetObs = log.getObservations();
  assert.equal(resetObs.filter(o => o.type === 'CENSUS_UPDATED').length, 0, 'Reset must not emit CENSUS_UPDATED');

  // Epoch 1 step 1 arrives with identical post-reset census (2 alive)
  log.onIpcResponseReceived({
    success: true,
    command: 'step',
    result: {
      snapshot: {
        ...makeSnapshot(1, [orgA]),
        census: { alive_count: 2, dead_count: 0, total_count: 2 }
      }
    }
  });

  // Invariant: Epoch 0 census (10) was cleared and NEVER compared with Epoch 1 census (2). Zero CENSUS_UPDATED!
  const epoch1CensusObs = log.getObservations().filter(o => o.session_epoch === 1 && o.type === 'CENSUS_UPDATED');
  assert.equal(epoch1CensusObs.length, 0, 'Must not emit phantom CENSUS_UPDATED across reset boundary');
});

test('C06-37: Census Ordering', () => {
  const log = new ObservationLogModel();
  const orgAlive = makeSampleOrg('org_0', 'STAGE_ADULT', 'FORAGE', true);

  // Baseline tick 1
  log.onIpcResponseReceived({
    success: true,
    command: 'step',
    result: {
      snapshot: {
        ...makeSnapshot(1, [orgAlive]),
        census: { alive_count: 1, dead_count: 0, total_count: 1 }
      }
    }
  });

  // Tick 2: org_0 dies, AND census changes (alive: 0, dead: 1)
  const orgDead = makeSampleOrg('org_0', 'STAGE_ADULT', 'NONE', false);
  log.onIpcResponseReceived({
    success: true,
    command: 'step',
    result: {
      snapshot: {
        ...makeSnapshot(2, [orgDead]),
        census: { alive_count: 0, dead_count: 1, total_count: 1 }
      }
    }
  });

  const obs = log.getObservations();
  const tick2Obs = obs.filter(o => o.simulation_tick === 2);
  const deathIdx = tick2Obs.findIndex(o => o.type === 'ORGANISM_DIED');
  const censusIdx = tick2Obs.findIndex(o => o.type === 'CENSUS_UPDATED');

  assert.ok(deathIdx !== -1, 'ORGANISM_DIED must be present');
  assert.ok(censusIdx !== -1, 'CENSUS_UPDATED must be present');
  assert.ok(deathIdx < censusIdx, 'CENSUS_UPDATED (rank 5) must be ordered after ORGANISM_DIED (rank 4)');
});

test('C06-38: Census Sequence ID', () => {
  const log = new ObservationLogModel();
  const orgA = makeSampleOrg('org_0');

  // Step 1 baseline
  log.onIpcResponseReceived({
    success: true,
    command: 'step',
    result: {
      snapshot: {
        ...makeSnapshot(1, [orgA]),
        census: { alive_count: 1, dead_count: 0, total_count: 1 }
      }
    }
  });

  const seqBefore = log.getSequenceId();

  // Step 2: census update only
  log.onIpcResponseReceived({
    success: true,
    command: 'step',
    result: {
      snapshot: {
        ...makeSnapshot(2, [orgA]),
        census: { alive_count: 5, dead_count: 0, total_count: 5 }
      }
    }
  });

  const obs = log.getObservations();
  const censusObs = obs.find(o => o.type === 'CENSUS_UPDATED');
  assert.ok(censusObs);
  assert.equal(censusObs.sequence_id, seqBefore + 1, 'CENSUS_UPDATED must consume exactly one global sequence ID');
  assert.equal(log.getSequenceId(), seqBefore + 1);
});


// ==========================================
// C-06 PATCH-02: EMPTY-POPULATION BASELINE REGRESSION TESTS
// ==========================================

test('C06-39: Empty Organism Baseline', () => {
  const log = new ObservationLogModel();

  log.onIpcResponseReceived({
    success: true,
    command: 'getSnapshot',
    result: {
      snapshot: {
        ...makeSnapshot(0, []),
        census: { alive_count: 0, dead_count: 0, total_count: 0 }
      }
    }
  });

  assert.equal(log.hasSnapshotBaselineState(), true, 'Baseline must be established');
  assert.equal(log.getLastDiffedTick(), 0);
  const obs = log.getObservations();
  assert.equal(obs.filter(o => o.type === 'ORGANISM_APPEARED').length, 0, 'Zero ORGANISM_APPEARED on empty organism baseline');
  assert.equal(obs.filter(o => o.type === 'CENSUS_UPDATED').length, 0, 'Zero CENSUS_UPDATED on baseline initialization');
});

test('C06-40: Empty Baseline Then Population Appears', () => {
  const log = new ObservationLogModel();

  // Tick 0: empty baseline
  log.onIpcResponseReceived({
    success: true,
    command: 'getSnapshot',
    result: {
      snapshot: {
        ...makeSnapshot(0, []),
        census: { alive_count: 0, dead_count: 0, total_count: 0 }
      }
    }
  });

  // Tick 1: population appears (1 organism, census 1/0/1)
  const orgA = makeSampleOrg('org_0');
  log.onIpcResponseReceived({
    success: true,
    command: 'step',
    result: {
      snapshot: {
        ...makeSnapshot(1, [orgA]),
        census: { alive_count: 1, dead_count: 0, total_count: 1 }
      }
    }
  });

  const obs = log.getObservations().filter(o => o.simulation_tick === 1);
  const appeared = obs.filter(o => o.type === 'ORGANISM_APPEARED');
  const census = obs.filter(o => o.type === 'CENSUS_UPDATED');

  assert.equal(appeared.length, 1, 'Exactly one ORGANISM_APPEARED');
  assert.equal(census.length, 1, 'Exactly one CENSUS_UPDATED');
  assert.equal(census[0].simulation_tick, 1);
  assert.equal(census[0].details.prev_alive_count, 0);
  assert.equal(census[0].details.prev_dead_count, 0);
  assert.equal(census[0].details.prev_total_count, 0);
  assert.equal(census[0].details.alive_count, 1);
  assert.equal(census[0].details.dead_count, 0);
  assert.equal(census[0].details.total_count, 1);
});

test('C06-41: Population Disappears To Empty Snapshot', () => {
  const log = new ObservationLogModel();
  const orgA = makeSampleOrg('org_0', 'STAGE_ADULT', 'FORAGE', true);

  // Tick 1: population baseline (1 organism, census 1/0/1)
  log.onIpcResponseReceived({
    success: true,
    command: 'step',
    result: {
      snapshot: {
        ...makeSnapshot(1, [orgA]),
        census: { alive_count: 1, dead_count: 0, total_count: 1 }
      }
    }
  });

  // Tick 2: organism disappears (empty organisms array, census 0/1/1)
  log.onIpcResponseReceived({
    success: true,
    command: 'step',
    result: {
      snapshot: {
        ...makeSnapshot(2, []),
        census: { alive_count: 0, dead_count: 1, total_count: 1 }
      }
    }
  });

  const obs = log.getObservations().filter(o => o.simulation_tick === 2);
  const died = obs.filter(o => o.type === 'ORGANISM_DIED');
  const census = obs.filter(o => o.type === 'CENSUS_UPDATED');

  assert.equal(died.length, 1, 'Exactly one ORGANISM_DIED for organism that disappeared from snapshot');
  assert.equal(died[0].entity_id, 'org_0');
  assert.equal(census.length, 1, 'Exactly one CENSUS_UPDATED');
  assert.equal(census[0].details.prev_alive_count, 1);
  assert.equal(census[0].details.prev_dead_count, 0);
  assert.equal(census[0].details.prev_total_count, 1);
  assert.equal(census[0].details.alive_count, 0);
  assert.equal(census[0].details.dead_count, 1);
  assert.equal(census[0].details.total_count, 1);
});

test('C06-42: Empty Population Across Multiple Ticks', () => {
  const log = new ObservationLogModel();

  // Tick 0: empty
  log.onIpcResponseReceived({
    success: true,
    command: 'getSnapshot',
    result: {
      snapshot: {
        ...makeSnapshot(0, []),
        census: { alive_count: 0, dead_count: 0, total_count: 0 }
      }
    }
  });

  // Tick 1: still empty
  log.onIpcResponseReceived({
    success: true,
    command: 'step',
    result: {
      snapshot: {
        ...makeSnapshot(1, []),
        census: { alive_count: 0, dead_count: 0, total_count: 0 }
      }
    }
  });

  // Tick 2: still empty
  log.onIpcResponseReceived({
    success: true,
    command: 'step',
    result: {
      snapshot: {
        ...makeSnapshot(2, []),
        census: { alive_count: 0, dead_count: 0, total_count: 0 }
      }
    }
  });

  assert.equal(log.getLastDiffedTick(), 2);
  assert.equal(log.hasSnapshotBaselineState(), true);
  const obs = log.getObservations();
  assert.equal(obs.filter(o => o.type === 'CENSUS_UPDATED').length, 0, 'Zero CENSUS_UPDATED across consecutive empty snapshots');
  assert.equal(obs.filter(o => o.type === 'ORGANISM_APPEARED').length, 0);
});

test('C06-43: Empty Baseline Reset Isolation', () => {
  const log = new ObservationLogModel();

  // Epoch 0, Tick 0: empty baseline
  log.onIpcResponseReceived({
    success: true,
    command: 'getSnapshot',
    result: {
      snapshot: {
        ...makeSnapshot(0, []),
        census: { alive_count: 0, dead_count: 0, total_count: 0 }
      }
    }
  });

  // Epoch 0, Tick 1: population grows to 2
  log.onIpcResponseReceived({
    success: true,
    command: 'step',
    result: {
      snapshot: {
        ...makeSnapshot(1, [makeSampleOrg('org_0'), makeSampleOrg('org_1')]),
        census: { alive_count: 2, dead_count: 0, total_count: 2 }
      }
    }
  });

  // Authoritative reset to empty world
  log.onIpcResponseReceived({
    success: true,
    command: 'reset',
    result: {
      snapshot: {
        ...makeSnapshot(0, []),
        census: { alive_count: 0, dead_count: 0, total_count: 0 }
      }
    }
  });

  // Reset itself must emit zero CENSUS_UPDATED
  assert.equal(log.getObservations().filter(o => o.type === 'CENSUS_UPDATED').length, 0, 'Reset itself must emit zero CENSUS_UPDATED');

  // Epoch 1, Tick 1: census becomes 1/0/1
  log.onIpcResponseReceived({
    success: true,
    command: 'step',
    result: {
      snapshot: {
        ...makeSnapshot(1, [makeSampleOrg('org_0')]),
        census: { alive_count: 1, dead_count: 0, total_count: 1 }
      }
    }
  });

  const epoch1Obs = log.getObservations().filter(o => o.session_epoch === 1 && o.type === 'CENSUS_UPDATED');
  assert.equal(epoch1Obs.length, 1, 'Epoch 1 tick 1 produces exactly one CENSUS_UPDATED');
  assert.equal(epoch1Obs[0].details.prev_alive_count, 0, 'Previous census is Epoch 1 baseline (0/0/0), NOT Epoch 0 (2/0/2)');
  assert.equal(epoch1Obs[0].details.alive_count, 1);
});
