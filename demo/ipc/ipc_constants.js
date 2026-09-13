/**
 * LinhSinhVN — DEMO-01-B IPC Bridge Constants
 *
 * Locked transport definitions, error codes, and limits for Godot 4 TCP bridge.
 */

export const DEFAULT_IPC_HOST = '127.0.0.1';
export const DEFAULT_IPC_PORT = 7777;
export const PROTOCOL_VERSION = '1.0';

/**
 * Maximum TCP frame payload size (1 MiB = 1,048,576 bytes).
 * Exactly 1048576 is valid. Greater than 1048576 triggers MESSAGE_TOO_LARGE and socket closure.
 */
export const MAX_FRAME_SIZE = 1048576;

/**
 * IPC bridge-level health state.
 * Owned strictly by IpcServer. NOT simulation state.
 */
export const BRIDGE_HEALTH = Object.freeze({
  HEALTHY: 'HEALTHY',
  FAILED: 'FAILED'
});

/**
 * Supported protocol v1.0 commands.
 */
export const IPC_COMMANDS = Object.freeze({
  STEP: 'step',
  PLAY: 'play',
  PAUSE: 'pause',
  RESET: 'reset',
  GET_SNAPSHOT: 'getSnapshot'
});

/**
 * Canonical protocol v1.0 error codes.
 */
export const IPC_ERROR_CODES = Object.freeze({
  MALFORMED_JSON: 'MALFORMED_JSON',
  INVALID_REQUEST: 'INVALID_REQUEST',
  PROTOCOL_VERSION_UNSUPPORTED: 'PROTOCOL_VERSION_UNSUPPORTED',
  UNKNOWN_COMMAND: 'UNKNOWN_COMMAND',
  INVALID_ARGUMENT: 'INVALID_ARGUMENT',
  MESSAGE_TOO_LARGE: 'MESSAGE_TOO_LARGE',
  SESSION_ERROR: 'SESSION_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR'
});
