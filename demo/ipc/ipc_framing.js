/**
 * LinhSinhVN — DEMO-01-B TCP Framing & Strict UTF-8 Stream Parser
 *
 * Frame Format: [4-byte uint32 Big-Endian length][UTF-8 JSON payload]
 * Invariant: Uses fatal TextDecoder to reject malformed UTF-8 without crashing or closing socket.
 */

import { MAX_FRAME_SIZE, IPC_ERROR_CODES } from './ipc_constants.js';

// Strict fatal UTF-8 decoder as mandated by Game Director
const fatalUtf8Decoder = new TextDecoder('utf-8', { fatal: true });

/**
 * Encodes a JSON payload (or pre-encoded string) into a framed Buffer.
 * @param {object|string} payload
 * @returns {Buffer} [4-byte BE length][UTF-8 payload]
 */
export function encodeFrame(payload) {
  const jsonStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const payloadBuffer = Buffer.from(jsonStr, 'utf8');

  if (payloadBuffer.length > MAX_FRAME_SIZE) {
    const err = new Error(`Frame payload exceeds MAX_FRAME_SIZE (${payloadBuffer.length} > ${MAX_FRAME_SIZE})`);
    err.code = IPC_ERROR_CODES.MESSAGE_TOO_LARGE;
    throw err;
  }

  const frameBuffer = Buffer.allocUnsafe(4 + payloadBuffer.length);
  frameBuffer.writeUInt32BE(payloadBuffer.length, 0);
  payloadBuffer.copy(frameBuffer, 4);
  return frameBuffer;
}

/**
 * Streaming parser for 4-byte BE length-prefixed TCP frames with strict UTF-8 validation.
 */
export class FrameParser {
  constructor() {
    this._buffer = Buffer.alloc(0);
  }

  /**
   * Push incoming raw TCP chunk and parse all available complete frames.
   * @param {Buffer} chunk
   * @returns {Array<{ type: 'frame', payload: any } | { type: 'error', code: string, message: string, fatal: boolean }>}
   */
  push(chunk) {
    if (chunk && chunk.length > 0) {
      this._buffer = Buffer.concat([this._buffer, chunk]);
    }

    const results = [];

    while (this._buffer.length >= 4) {
      const payloadLength = this._buffer.readUInt32BE(0);

      // Oversized frame check
      if (payloadLength > MAX_FRAME_SIZE) {
        // Reset buffer and emit fatal error (caller must close socket)
        this._buffer = Buffer.alloc(0);
        results.push({
          type: 'error',
          code: IPC_ERROR_CODES.MESSAGE_TOO_LARGE,
          message: `Frame payload size ${payloadLength} exceeds maximum limit of ${MAX_FRAME_SIZE} bytes`,
          fatal: true
        });
        break;
      }

      // Check if complete frame is buffered
      if (this._buffer.length < 4 + payloadLength) {
        // Partial frame, await more chunks
        break;
      }

      // Frame is completely received: extract payload slice and advance buffer
      const frameSlice = this._buffer.subarray(4, 4 + payloadLength);
      this._buffer = this._buffer.subarray(4 + payloadLength);

      // Handle zero-length payload
      if (payloadLength === 0) {
        results.push({
          type: 'error',
          code: IPC_ERROR_CODES.MALFORMED_JSON,
          message: 'Zero-length payload received',
          fatal: false
        });
        continue;
      }

      // Strict UTF-8 decode
      let decodedText;
      try {
        decodedText = fatalUtf8Decoder.decode(frameSlice);
      } catch (_err) {
        results.push({
          type: 'error',
          code: IPC_ERROR_CODES.MALFORMED_JSON,
          message: 'Malformed UTF-8 byte sequence in frame payload',
          fatal: false
        });
        continue;
      }

      // Strict JSON parse
      let parsedJson;
      try {
        parsedJson = JSON.parse(decodedText);
      } catch (_err) {
        results.push({
          type: 'error',
          code: IPC_ERROR_CODES.MALFORMED_JSON,
          message: 'Invalid JSON syntax in frame payload',
          fatal: false
        });
        continue;
      }

      results.push({
        type: 'frame',
        payload: parsedJson
      });
    }

    return results;
  }

  /**
   * Reset parser state.
   */
  reset() {
    this._buffer = Buffer.alloc(0);
  }
}
