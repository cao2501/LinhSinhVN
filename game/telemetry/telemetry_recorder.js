/**
 * LinhSinhVN — Telemetry Recorder
 * 
 * Concrete recorder container supporting 4 retention modes:
 * - DISABLED: zero storage, no snapshot computation
 * - SINGLE_TICK: retain strictly 1 most recent record
 * - RING_BUFFER: bounded circular buffer (default max 100)
 * - FULL_HISTORY: unbounded chronological collection for replay and testing
 */

import { createTelemetryTickSnapshot } from './telemetry_snapshot.js';
import {
  getTickRecord,
  getOrganismTrace,
  getResourceArbitrationTrace,
  getReproductionTrace,
  getEventsTrace
} from './telemetry_query.js';

export const TelemetryMode = Object.freeze({
  DISABLED: 'DISABLED',
  SINGLE_TICK: 'SINGLE_TICK',
  RING_BUFFER: 'RING_BUFFER',
  FULL_HISTORY: 'FULL_HISTORY'
});

export class TelemetryRecorder {
  /**
   * @param {object} [options={}]
   * @param {string} [options.mode=TelemetryMode.SINGLE_TICK]
   * @param {number} [options.buffer_size=100]
   */
  constructor(options = {}) {
    const rawMode = options.mode || TelemetryMode.SINGLE_TICK;
    if (!Object.values(TelemetryMode).includes(rawMode)) {
      throw new TypeError(`Invalid TelemetryMode: ${rawMode}`);
    }
    this._mode = rawMode;
    this._bufferSize = typeof options.buffer_size === 'number' && options.buffer_size > 0
      ? Math.floor(options.buffer_size)
      : 100;
    this._records = [];
  }

  get mode() {
    return this._mode;
  }

  set mode(newMode) {
    if (!Object.values(TelemetryMode).includes(newMode)) {
      throw new TypeError(`Invalid TelemetryMode: ${newMode}`);
    }
    this._mode = newMode;
    if (this._mode === TelemetryMode.DISABLED) {
      this._records = [];
    } else if (this._mode === TelemetryMode.SINGLE_TICK && this._records.length > 1) {
      this._records = [this._records[this._records.length - 1]];
    } else if (this._mode === TelemetryMode.RING_BUFFER && this._records.length > this._bufferSize) {
      this._records = this._records.slice(this._records.length - this._bufferSize);
    }
  }

  get bufferSize() {
    return this._bufferSize;
  }

  /**
   * Records a committed PopulationWorldTickResult.
   * 
   * @param {object} result - Authoritative world tick result
   * @param {object} [context={}] - Optional metadata
   * @returns {Readonly<object>|null}
   */
  record(result, context = {}) {
    if (this._mode === TelemetryMode.DISABLED) {
      return null;
    }

    const snapshot = createTelemetryTickSnapshot(result, context);

    if (this._mode === TelemetryMode.SINGLE_TICK) {
      this._records = [snapshot];
    } else if (this._mode === TelemetryMode.RING_BUFFER) {
      this._records.push(snapshot);
      if (this._records.length > this._bufferSize) {
        this._records.shift();
      }
    } else if (this._mode === TelemetryMode.FULL_HISTORY) {
      this._records.push(snapshot);
    }

    return snapshot;
  }

  /**
   * Returns a shallow copy of stored records.
   * @returns {Array<Readonly<object>>}
   */
  getRecords() {
    return [...this._records];
  }

  /**
   * Returns the most recent record, or null.
   * @returns {Readonly<object>|null}
   */
  getLatestRecord() {
    if (this._records.length === 0) return null;
    return this._records[this._records.length - 1];
  }

  /**
   * Clears all recorded telemetry records.
   */
  clear() {
    this._records = [];
  }

  // --- Convenience Query Delegates ---

  getTickRecord(tick) {
    return getTickRecord(this._records, tick);
  }

  getOrganismTrace(organismId) {
    return getOrganismTrace(this._records, organismId);
  }

  getResourceArbitrationTrace(resourceType = null) {
    return getResourceArbitrationTrace(this._records, resourceType);
  }

  getReproductionTrace() {
    return getReproductionTrace(this._records);
  }

  getEventsTrace(filterFn = null) {
    return getEventsTrace(this._records, filterFn);
  }
}

/**
 * Functional factory for TelemetryRecorder.
 * 
 * @param {object} [options={}]
 * @returns {TelemetryRecorder}
 */
export function createTelemetryRecorder(options = {}) {
  return new TelemetryRecorder(options);
}
