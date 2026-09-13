/**
 * LinhSinhVN — DEMO-01-B Local Loopback TCP IPC Server
 *
 * Implements deterministic multi-client connection management, strict FIFO queue,
 * server-side playback scheduling, and failure recovery.
 */

import net from 'node:net';
import {
  DEFAULT_IPC_HOST,
  DEFAULT_IPC_PORT,
  BRIDGE_HEALTH,
  IPC_COMMANDS,
  IPC_ERROR_CODES
} from './ipc_constants.js';
import { FrameParser, encodeFrame } from './ipc_framing.js';
import { validateRequest, makeSuccessResponse, makeErrorResponse } from './ipc_dispatcher.js';
import { DemoSimulationSession } from '../demo_simulation_session.js';

export class IpcServer {
  /**
   * @param {object} [options]
   * @param {DemoSimulationSession} [options.session]
   * @param {string} [options.host]
   * @param {number} [options.port]
   * @param {number} [options.tickIntervalMs]
   */
  constructor(options = {}) {
    this.session = options.session || new DemoSimulationSession();
    this.host = options.host || DEFAULT_IPC_HOST;
    this.port = options.port !== undefined ? options.port : DEFAULT_IPC_PORT;
    this.tickIntervalMs = options.tickIntervalMs || 100;

    this.bridgeHealth = BRIDGE_HEALTH.HEALTHY;
    this.server = null;
    this.clients = new Set();

    // Strict FIFO queue
    this.commandQueue = [];
    this.isProcessingQueue = false;
    this.queueSequence = 0;

    // Server-side playback scheduler
    this.playbackTimer = null;
  }

  /**
   * Starts TCP listener.
   * @returns {Promise<{ host: string, port: number }>}
   */
  async start() {
    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => this._handleConnection(socket));

      this.server.on('error', (err) => {
        reject(err);
      });

      this.server.listen(this.port, this.host, () => {
        const addr = this.server.address();
        this.port = addr.port;
        this.host = addr.address;
        resolve({ host: this.host, port: this.port });
      });
    });
  }

  /**
   * Stops server, timer, and disconnects all clients cleanly.
   * @returns {Promise<void>}
   */
  async stop() {
    this._stopScheduler();

    // Close all active client connections
    for (const client of this.clients) {
      client.destroy();
    }
    this.clients.clear();

    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          this.server = null;
          resolve();
        });
      });
    }
  }

  /**
   * Handles newly connected TCP socket.
   * @private
   */
  _handleConnection(socket) {
    this.clients.add(socket);
    const parser = new FrameParser();

    socket.on('data', (chunk) => {
      const parseResults = parser.push(chunk);

      for (const res of parseResults) {
        if (res.type === 'error') {
          if (res.fatal) {
            // Fatal framing error (MESSAGE_TOO_LARGE): close socket immediately
            socket.destroy();
            return;
          }

          // Non-fatal framing error (MALFORMED_JSON): emit response, socket remains open
          const errResp = makeErrorResponse(null, null, res.code, res.message);
          this._sendResponse(socket, errResp);
          continue;
        }

        if (res.type === 'frame') {
          this._enqueueRequest(socket, res.payload);
        }
      }
    });

    socket.on('close', () => {
      this.clients.delete(socket);
      // Invariant: Disconnect does NOT pause simulation, does NOT reset simulation, does NOT alter playback!
    });

    socket.on('error', (_err) => {
      this.clients.delete(socket);
      socket.destroy();
    });
  }

  /**
   * Enqueues validated or unvalidated request into global serialized FIFO.
   * @private
   */
  _enqueueRequest(socket, rawRequest) {
    this.queueSequence++;
    const queueItem = {
      seq: this.queueSequence,
      socket: socket,
      rawRequest: rawRequest,
      isScheduler: false
    };

    this.commandQueue.push(queueItem);
    this._drainQueue();
  }

  /**
   * Drains the FIFO command queue serially.
   * @private
   */
  async _drainQueue() {
    if (this.isProcessingQueue) {
      return;
    }

    this.isProcessingQueue = true;

    try {
      while (this.commandQueue.length > 0) {
        const item = this.commandQueue.shift();
        await this._executeItem(item);
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  /**
   * Executes a single serialized queue item.
   * @private
   */
  async _executeItem(item) {
    const { socket, rawRequest, isScheduler } = item;

    // 1. Envelope & parameter validation (happens BEFORE touching session)
    const validation = validateRequest(rawRequest);
    if (!validation.valid) {
      if (socket && socket.writable) {
        this._sendResponse(socket, validation.response);
      }
      return;
    }

    const { requestId, command, params } = validation;

    // 2. Health check gating
    if (this.bridgeHealth === BRIDGE_HEALTH.FAILED) {
      // In FAILED state: allow pause, getSnapshot, reset. Reject step, play.
      if (command === IPC_COMMANDS.STEP || command === IPC_COMMANDS.PLAY) {
        if (socket && socket.writable) {
          const resp = makeErrorResponse(
            requestId,
            command,
            IPC_ERROR_CODES.SESSION_ERROR,
            `Bridge is in FAILED health state. Command '${command}' rejected. Issue 'reset' to recover.`
          );
          this._sendResponse(socket, resp);
        }
        return;
      }
    }

    // 3. Command execution against DemoSimulationSession
    try {
      switch (command) {
        case IPC_COMMANDS.STEP: {
          const ticks = params.ticks !== undefined ? params.ticks : 1;
          this.session.step(ticks);
          const snapshot = this.session.getSnapshot();
          if (socket && socket.writable) {
            const resp = makeSuccessResponse(requestId, command, { snapshot });
            this._sendResponse(socket, resp);
          }
          break;
        }

        case IPC_COMMANDS.PLAY: {
          this.session.play();
          this._startScheduler();
          if (socket && socket.writable) {
            const resp = makeSuccessResponse(requestId, command, {
              playback_status: this.session.getSnapshot().playback_status
            });
            this._sendResponse(socket, resp);
          }
          break;
        }

        case IPC_COMMANDS.PAUSE: {
          this.session.pause();
          this._stopScheduler(); // Invariant: stops future timer enqueueing, but commands already in queue remain!
          if (socket && socket.writable) {
            const resp = makeSuccessResponse(requestId, command, {
              playback_status: this.session.getSnapshot().playback_status
            });
            this._sendResponse(socket, resp);
          }
          break;
        }

        case IPC_COMMANDS.RESET: {
          this._stopScheduler();
          this.session.reset();
          // Successful canonical reset restores bridge health
          this.bridgeHealth = BRIDGE_HEALTH.HEALTHY;
          const snapshot = this.session.getSnapshot();
          if (socket && socket.writable) {
            const resp = makeSuccessResponse(requestId, command, { snapshot });
            this._sendResponse(socket, resp);
          }
          break;
        }

        case IPC_COMMANDS.GET_SNAPSHOT: {
          const snapshot = this.session.getSnapshot();
          if (socket && socket.writable) {
            const resp = makeSuccessResponse(requestId, command, { snapshot });
            this._sendResponse(socket, resp);
          }
          break;
        }

        default:
          // Unreachable due to prior validation
          break;
      }
    } catch (err) {
      // Simulation or session threw an unexpected exception
      this.bridgeHealth = BRIDGE_HEALTH.FAILED;
      this._stopScheduler();

      if (socket && socket.writable) {
        const resp = makeErrorResponse(
          requestId,
          command,
          IPC_ERROR_CODES.SESSION_ERROR,
          err && err.message ? err.message : 'Unexpected simulation session error'
        );
        this._sendResponse(socket, resp);
      }
    }
  }

  /**
   * Starts server-side playback timer.
   * Timer strictly enqueues step(1) requests into global FIFO.
   * @private
   */
  _startScheduler() {
    if (this.playbackTimer) {
      return;
    }

    this.playbackTimer = setInterval(() => {
      this.queueSequence++;
      const schedulerItem = {
        seq: this.queueSequence,
        socket: null,
        rawRequest: {
          protocol_version: '1.0',
          request_id: `internal_sched_${this.queueSequence}`,
          command: IPC_COMMANDS.STEP,
          params: { ticks: 1 }
        },
        isScheduler: true
      };

      this.commandQueue.push(schedulerItem);
      this._drainQueue();
    }, this.tickIntervalMs);
  }

  /**
   * Stops future scheduler timer ticks.
   * Invariant: Does NOT cancel or alter commands already enqueued in commandQueue!
   * @private
   */
  _stopScheduler() {
    if (this.playbackTimer) {
      clearInterval(this.playbackTimer);
      this.playbackTimer = null;
    }
  }

  /**
   * Encodes and writes response to socket.
   * @private
   */
  _sendResponse(socket, responseObj) {
    try {
      const frameBuffer = encodeFrame(responseObj);
      socket.write(frameBuffer);
    } catch (err) {
      // If response itself cannot be framed, socket closes
      socket.destroy();
    }
  }
}
