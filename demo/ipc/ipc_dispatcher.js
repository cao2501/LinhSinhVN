/**
 * LinhSinhVN — DEMO-01-B IPC Command Dispatcher & Request Validator
 *
 * Validates request envelope, normalizes parameters, executes command-specific validation,
 * and builds canonical response envelopes.
 */

import { PROTOCOL_VERSION, IPC_COMMANDS, IPC_ERROR_CODES } from './ipc_constants.js';

const ALLOWED_COMMANDS = new Set(Object.values(IPC_COMMANDS));

/**
 * Creates canonical successful response envelope.
 */
export function makeSuccessResponse(requestId, command, result) {
  return {
    protocol_version: PROTOCOL_VERSION,
    request_id: requestId,
    success: true,
    command: command,
    result: result
  };
}

/**
 * Creates canonical error response envelope.
 */
export function makeErrorResponse(requestId, command, code, message) {
  return {
    protocol_version: PROTOCOL_VERSION,
    request_id: requestId ?? null,
    success: false,
    command: command ?? null,
    error: {
      code: code,
      message: message
    }
  };
}

/**
 * Validates request envelope and command-specific parameters.
 * Returns { valid: true, command, requestId, params } or { valid: false, response: object }
 */
export function validateRequest(req) {
  if (typeof req !== 'object' || req === null || Array.isArray(req)) {
    return {
      valid: false,
      response: makeErrorResponse(null, null, IPC_ERROR_CODES.INVALID_REQUEST, 'Request must be a JSON object')
    };
  }

  const { protocol_version, request_id, command, params, ...extraEnvelopeKeys } = req;

  if (Object.keys(extraEnvelopeKeys).length > 0) {
    return {
      valid: false,
      response: makeErrorResponse(
        typeof request_id === 'string' ? request_id : null,
        typeof command === 'string' ? command : null,
        IPC_ERROR_CODES.INVALID_REQUEST,
        `Unexpected envelope properties: ${Object.keys(extraEnvelopeKeys).join(', ')}`
      )
    };
  }

  // Check request_id
  if (typeof request_id !== 'string' || request_id.length === 0) {
    return {
      valid: false,
      response: makeErrorResponse(null, typeof command === 'string' ? command : null, IPC_ERROR_CODES.INVALID_REQUEST, 'Missing or invalid request_id (must be non-empty string)')
    };
  }

  // Check protocol_version
  if (typeof protocol_version !== 'string') {
    return {
      valid: false,
      response: makeErrorResponse(request_id, typeof command === 'string' ? command : null, IPC_ERROR_CODES.INVALID_REQUEST, 'Missing or invalid protocol_version')
    };
  }

  if (protocol_version !== PROTOCOL_VERSION) {
    return {
      valid: false,
      response: makeErrorResponse(request_id, typeof command === 'string' ? command : null, IPC_ERROR_CODES.PROTOCOL_VERSION_UNSUPPORTED, `Unsupported protocol version: '${protocol_version}'. Expected '${PROTOCOL_VERSION}'`)
    };
  }

  // Check command
  if (typeof command !== 'string') {
    return {
      valid: false,
      response: makeErrorResponse(request_id, null, IPC_ERROR_CODES.INVALID_REQUEST, 'Missing or invalid command (must be string)')
    };
  }

  if (!ALLOWED_COMMANDS.has(command)) {
    return {
      valid: false,
      response: makeErrorResponse(request_id, command, IPC_ERROR_CODES.UNKNOWN_COMMAND, `Unknown or unsupported command: '${command}'`)
    };
  }

  // Validate params container
  if (params !== undefined && (typeof params !== 'object' || params === null || Array.isArray(params))) {
    return {
      valid: false,
      response: makeErrorResponse(request_id, command, IPC_ERROR_CODES.INVALID_ARGUMENT, 'params must be a JSON object when provided')
    };
  }

  const normalizedParams = params || {};
  const paramKeys = Object.keys(normalizedParams);

  // Command-specific parameter validation
  if (command === IPC_COMMANDS.STEP) {
    for (const key of paramKeys) {
      if (key !== 'ticks') {
        return {
          valid: false,
          response: makeErrorResponse(request_id, command, IPC_ERROR_CODES.INVALID_ARGUMENT, `Unexpected parameter '${key}' for step command`)
        };
      }
    }

    if ('ticks' in normalizedParams) {
      const ticks = normalizedParams.ticks;
      if (typeof ticks !== 'number' || !Number.isInteger(ticks) || ticks < 1 || ticks > 1000) {
        return {
          valid: false,
          response: makeErrorResponse(request_id, command, IPC_ERROR_CODES.INVALID_ARGUMENT, `Parameter 'ticks' must be an integer between 1 and 1000. Received: ${ticks}`)
        };
      }
    }
  } else {
    // play, pause, reset, getSnapshot must have exactly zero parameters
    if (paramKeys.length > 0) {
      return {
        valid: false,
        response: makeErrorResponse(request_id, command, IPC_ERROR_CODES.INVALID_ARGUMENT, `Command '${command}' does not accept parameters. Received: ${paramKeys.join(', ')}`)
      };
    }
  }

  return {
    valid: true,
    requestId: request_id,
    command: command,
    params: normalizedParams
  };
}
