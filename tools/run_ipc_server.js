/**
 * LinhSinhVN — DEMO-01-C Server Runner CLI
 *
 * Standalone entrypoint for running the local loopback TCP IPC bridge.
 * Invariants:
 * - Strictly binds to 127.0.0.1 (loopback only).
 * - Supports --port <number> override.
 * - Handles SIGINT and SIGTERM gracefully via await server.stop().
 * - Deterministic console output without timestamps or random IDs.
 */

import { IpcServer, DEFAULT_IPC_HOST, DEFAULT_IPC_PORT } from '../demo/index.js';

function parsePortArg(args) {
  let port = DEFAULT_IPC_PORT;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && i + 1 < args.length) {
      const parsed = Number(args[i + 1]);
      if (!Number.isInteger(parsed) || (parsed !== 0 && (parsed < 1024 || parsed > 65535))) {
        console.error(`Invalid port: '${args[i + 1]}'. Port must be 0 or an integer between 1024 and 65535.`);
        process.exit(1);
      }
      port = parsed;
      break;
    }
  }
  return port;
}

const port = parsePortArg(process.argv.slice(2));
const host = DEFAULT_IPC_HOST; // Strictly locked to 127.0.0.1

const server = new IpcServer({ host, port });

let isShuttingDown = false;

export async function handleShutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  try {
    await server.stop();
    console.log('IPC server stopped.');
    process.exit(0);
  } catch (err) {
    console.error('Error during shutdown:', err);
    process.exit(1);
  }
}

process.on('SIGINT', handleShutdown);
process.on('SIGTERM', handleShutdown);
// Handle stdin closure (pipe close) for clean cross-platform shutdown
if (process.stdin.isTTY === false) {
  process.stdin.resume();
  process.stdin.on('data', () => {});
  process.stdin.on('end', handleShutdown);
}

server.start().then((addr) => {
  console.log(`IPC server listening on ${addr.host}:${addr.port}`);
}).catch((err) => {
  console.error('Failed to start IPC server:', err);
  process.exit(1);
});
