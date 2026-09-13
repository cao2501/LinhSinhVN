/**
 * LinhSinhVN — DEMO-01-B Reference TCP IPC Client
 *
 * Provides deterministic request IDs, 4-byte BE length prefix framing,
 * fragmented delivery for test suites, and Promise-based request/response correlation.
 */

import net from 'node:net';
import { DEFAULT_IPC_HOST, DEFAULT_IPC_PORT, PROTOCOL_VERSION } from './ipc_constants.js';
import { FrameParser, encodeFrame } from './ipc_framing.js';

export class IpcClient {
  constructor() {
    this.socket = null;
    this.parser = new FrameParser();
    this.requestIdCounter = 0;
    this.pendingResolvers = [];
    this.isConnected = false;
  }

  /**
   * Connects to the IPC server.
   * @param {number} port
   * @param {string} [host]
   * @returns {Promise<void>}
   */
  async connect(port = DEFAULT_IPC_PORT, host = DEFAULT_IPC_HOST) {
    return new Promise((resolve, reject) => {
      this.socket = net.createConnection({ port, host }, () => {
        this.isConnected = true;
        resolve();
      });

      this.socket.on('data', (chunk) => {
        const results = this.parser.push(chunk);
        for (const res of results) {
          if (this.pendingResolvers.length > 0) {
            const resolveNext = this.pendingResolvers.shift();
            if (res.type === 'frame') {
              resolveNext(res.payload);
            } else if (res.type === 'error') {
              resolveNext({
                protocol_version: PROTOCOL_VERSION,
                request_id: null,
                success: false,
                command: null,
                error: { code: res.code, message: res.message }
              });
            }
          }
        }
      });

      this.socket.on('error', (err) => {
        this.isConnected = false;
        if (this.pendingResolvers.length > 0) {
          const resolveNext = this.pendingResolvers.shift();
          resolveNext({
            protocol_version: PROTOCOL_VERSION,
            request_id: null,
            success: false,
            command: null,
            error: { code: 'INTERNAL_ERROR', message: err.message }
          });
        }
      });

      this.socket.on('close', () => {
        this.isConnected = false;
      });
    });
  }

  /**
   * Generates deterministic monotonic request identifier.
   * Format: godot_000001
   * @returns {string}
   */
  nextRequestId() {
    this.requestIdCounter++;
    return `godot_${String(this.requestIdCounter).padStart(6, '0')}`;
  }

  /**
   * Sends an authoritative command and waits for response.
   * @param {string} command
   * @param {object} [params]
   * @param {string} [explicitRequestId]
   * @returns {Promise<object>}
   */
  async sendRequest(command, params = undefined, explicitRequestId = null) {
    const reqId = explicitRequestId || this.nextRequestId();
    const envelope = {
      protocol_version: PROTOCOL_VERSION,
      request_id: reqId,
      command: command
    };
    if (params !== undefined) {
      envelope.params = params;
    }

    const frame = encodeFrame(envelope);

    return new Promise((resolve) => {
      this.pendingResolvers.push(resolve);
      this.socket.write(frame);
    });
  }

  /**
   * Sends raw Buffer without client framing transformation.
   * @param {Buffer} buffer
   * @returns {Promise<object>}
   */
  async sendRaw(buffer) {
    return new Promise((resolve) => {
      this.pendingResolvers.push(resolve);
      this.socket.write(buffer);
    });
  }

  /**
   * Disconnects socket cleanly.
   */
  disconnect() {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
      this.isConnected = false;
    }
  }
}
