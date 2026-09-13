/**
 * LinhSinhVN — DEMO-01-B IPC Bridge Test Suite
 *
 * Covers 20 mandatory test cases specified by Game Director.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';

import {
  DEFAULT_IPC_HOST,
  PROTOCOL_VERSION,
  MAX_FRAME_SIZE,
  BRIDGE_HEALTH,
  IPC_COMMANDS,
  IPC_ERROR_CODES,
  encodeFrame,
  FrameParser,
  validateRequest,
  makeSuccessResponse,
  makeErrorResponse,
  IpcServer,
  IpcClient,
  DemoSimulationSession
} from '../../demo/index.js';

test('DEMO-01-B: Local Loopback TCP IPC Bridge', async (t) => {

  await t.test('IPC-01: 4-byte BE length-prefix round-trip', () => {
    const payload = { test: 'hello world', value: 42 };
    const frame = encodeFrame(payload);

    assert.ok(frame.length > 4);
    const declaredLength = frame.readUInt32BE(0);
    assert.equal(declaredLength, frame.length - 4);

    const parser = new FrameParser();
    const results = parser.push(frame);
    assert.equal(results.length, 1);
    assert.equal(results[0].type, 'frame');
    assert.deepEqual(results[0].payload, payload);
  });

  await t.test('IPC-02: Fragmented prefix', () => {
    const payload = { command: 'getSnapshot' };
    const frame = encodeFrame(payload);

    const parser = new FrameParser();
    // Feed 1 byte at a time for the prefix
    assert.deepEqual(parser.push(frame.subarray(0, 1)), []);
    assert.deepEqual(parser.push(frame.subarray(1, 2)), []);
    assert.deepEqual(parser.push(frame.subarray(2, 3)), []);
    assert.deepEqual(parser.push(frame.subarray(3, 4)), []);

    // Feed remaining payload
    const results = parser.push(frame.subarray(4));
    assert.equal(results.length, 1);
    assert.equal(results[0].type, 'frame');
    assert.deepEqual(results[0].payload, payload);
  });

  await t.test('IPC-03: Fragmented payload', () => {
    const payload = { message: 'fragmented_payload_test', list: [1, 2, 3] };
    const frame = encodeFrame(payload);

    const mid = Math.floor(frame.length / 2);
    const chunk1 = frame.subarray(0, mid);
    const chunk2 = frame.subarray(mid);

    const parser = new FrameParser();
    const r1 = parser.push(chunk1);
    assert.equal(r1.length, 0);

    const r2 = parser.push(chunk2);
    assert.equal(r2.length, 1);
    assert.equal(r2[0].type, 'frame');
    assert.deepEqual(r2[0].payload, payload);
  });

  await t.test('IPC-04: Multiple concatenated frames in a single chunk', () => {
    const p1 = { id: 1 };
    const p2 = { id: 2 };
    const p3 = { id: 3 };

    const chunk = Buffer.concat([encodeFrame(p1), encodeFrame(p2), encodeFrame(p3)]);

    const parser = new FrameParser();
    const results = parser.push(chunk);

    assert.equal(results.length, 3);
    assert.deepEqual(results.map(r => r.payload), [p1, p2, p3]);
  });

  await t.test('IPC-05: Payload > 1 MiB closes connection', async () => {
    const server = new IpcServer({ port: 0 });
    const { port } = await server.start();

    try {
      await new Promise((resolve) => {
        const socket = net.createConnection({ port, host: '127.0.0.1' }, () => {
          // Send oversized frame prefix: length = 1048577 (> MAX_FRAME_SIZE)
          const badPrefix = Buffer.alloc(4);
          badPrefix.writeUInt32BE(MAX_FRAME_SIZE + 1, 0);
          socket.write(badPrefix);
        });

        socket.on('close', () => {
          assert.ok(true, 'Socket closed due to MESSAGE_TOO_LARGE');
          resolve();
        });
      });
    } finally {
      await server.stop();
    }
  });

  await t.test('IPC-06: Malformed UTF-8 returns MALFORMED_JSON and keeps socket open', async () => {
    const server = new IpcServer({ port: 0 });
    const { port } = await server.start();

    try {
      const client = new IpcClient();
      await client.connect(port);

      // Build frame with invalid UTF-8 bytes (0xFF, 0xFE are invalid UTF-8 sequences)
      const invalidBytes = Buffer.from([0xFF, 0xFE, 0xC0, 0xAF]);
      const frame = Buffer.alloc(4 + invalidBytes.length);
      frame.writeUInt32BE(invalidBytes.length, 0);
      invalidBytes.copy(frame, 4);

      const resp = await client.sendRaw(frame);
      assert.equal(resp.success, false);
      assert.equal(resp.error.code, IPC_ERROR_CODES.MALFORMED_JSON);
      assert.ok(client.isConnected, 'Socket must remain open after malformed UTF-8');

      client.disconnect();
    } finally {
      await server.stop();
    }
  });

  await t.test('IPC-07: Malformed UTF-8 followed by valid frame succeeds', async () => {
    const server = new IpcServer({ port: 0 });
    const { port } = await server.start();

    try {
      const client = new IpcClient();
      await client.connect(port);

      // 1. Send malformed UTF-8
      const invalidBytes = Buffer.from([0xFF, 0xFD]);
      const badFrame = Buffer.alloc(4 + invalidBytes.length);
      badFrame.writeUInt32BE(invalidBytes.length, 0);
      invalidBytes.copy(badFrame, 4);
      const resp1 = await client.sendRaw(badFrame);
      assert.equal(resp1.error.code, IPC_ERROR_CODES.MALFORMED_JSON);

      // 2. Immediately send valid frame
      const resp2 = await client.sendRequest(IPC_COMMANDS.GET_SNAPSHOT);
      assert.equal(resp2.success, true);
      assert.equal(resp2.command, 'getSnapshot');
      assert.ok(resp2.result.snapshot);

      client.disconnect();
    } finally {
      await server.stop();
    }
  });

  await t.test('IPC-08: Zero-length payload returns MALFORMED_JSON', async () => {
    const server = new IpcServer({ port: 0 });
    const { port } = await server.start();

    try {
      const client = new IpcClient();
      await client.connect(port);

      // Frame with length 0
      const emptyFrame = Buffer.alloc(4);
      emptyFrame.writeUInt32BE(0, 0);

      const resp = await client.sendRaw(emptyFrame);
      assert.equal(resp.success, false);
      assert.equal(resp.error.code, IPC_ERROR_CODES.MALFORMED_JSON);

      client.disconnect();
    } finally {
      await server.stop();
    }
  });

  await t.test('IPC-09: {} returns INVALID_REQUEST', async () => {
    const server = new IpcServer({ port: 0 });
    const { port } = await server.start();

    try {
      const client = new IpcClient();
      await client.connect(port);

      const frame = encodeFrame({});
      const resp = await client.sendRaw(frame);
      assert.equal(resp.success, false);
      assert.equal(resp.error.code, IPC_ERROR_CODES.INVALID_REQUEST);

      client.disconnect();
    } finally {
      await server.stop();
    }
  });

  await t.test('IPC-10: Unsupported protocol version returns PROTOCOL_VERSION_UNSUPPORTED', async () => {
    const server = new IpcServer({ port: 0 });
    const { port } = await server.start();

    try {
      const client = new IpcClient();
      await client.connect(port);

      const req = {
        protocol_version: '2.0',
        request_id: 'godot_000001',
        command: 'getSnapshot'
      };
      const frame = encodeFrame(req);
      const resp = await client.sendRaw(frame);

      assert.equal(resp.success, false);
      assert.equal(resp.error.code, IPC_ERROR_CODES.PROTOCOL_VERSION_UNSUPPORTED);
      assert.equal(resp.request_id, 'godot_000001');

      client.disconnect();
    } finally {
      await server.stop();
    }
  });

  await t.test('IPC-11: Unknown command returns UNKNOWN_COMMAND', async () => {
    const server = new IpcServer({ port: 0 });
    const { port } = await server.start();

    try {
      const client = new IpcClient();
      await client.connect(port);

      const resp = await client.sendRequest('setSpeed');
      assert.equal(resp.success, false);
      assert.equal(resp.error.code, IPC_ERROR_CODES.UNKNOWN_COMMAND);

      client.disconnect();
    } finally {
      await server.stop();
    }
  });

  await t.test('IPC-12: Unexpected params rejected for play/pause/reset/getSnapshot', async () => {
    const server = new IpcServer({ port: 0 });
    const { port } = await server.start();

    try {
      const client = new IpcClient();
      await client.connect(port);

      for (const cmd of ['play', 'pause', 'reset', 'getSnapshot']) {
        const resp = await client.sendRequest(cmd, { speed: 2 });
        assert.equal(resp.success, false, `Command ${cmd} with params must fail`);
        assert.equal(resp.error.code, IPC_ERROR_CODES.INVALID_ARGUMENT);
      }

      client.disconnect();
    } finally {
      await server.stop();
    }
  });

  await t.test('IPC-13: step ticks validation including lower/upper bounds and invalid types', async () => {
    const server = new IpcServer({ port: 0 });
    const { port } = await server.start();

    try {
      const client = new IpcClient();
      await client.connect(port);

      const invalidParams = [
        { ticks: 0 },
        { ticks: -1 },
        { ticks: 1.5 },
        { ticks: 1001 },
        { foo: 'bar' },
        { ticks: 1, foo: 'bar' }
      ];

      for (const params of invalidParams) {
        const resp = await client.sendRequest('step', params);
        assert.equal(resp.success, false, `step with ${JSON.stringify(params)} must fail`);
        assert.equal(resp.error.code, IPC_ERROR_CODES.INVALID_ARGUMENT);
      }

      // Valid variations
      const validResp1 = await client.sendRequest('step', {});
      assert.equal(validResp1.success, true);

      const validResp2 = await client.sendRequest('step', { ticks: 2 });
      assert.equal(validResp2.success, true);

      client.disconnect();
    } finally {
      await server.stop();
    }
  });

  await t.test('IPC-14: getSnapshot returns valid snapshot and exact request_id', async () => {
    const server = new IpcServer({ port: 0 });
    const { port } = await server.start();

    try {
      const client = new IpcClient();
      await client.connect(port);

      const customId = 'godot_custom_999';
      const resp = await client.sendRequest('getSnapshot', undefined, customId);

      assert.equal(resp.success, true);
      assert.equal(resp.request_id, customId);
      assert.equal(resp.command, 'getSnapshot');
      assert.ok(resp.result.snapshot);
      assert.equal(resp.result.snapshot.schema_version, '1.0.0');
      assert.equal(typeof resp.result.snapshot.simulation_tick, 'number');

      client.disconnect();
    } finally {
      await server.stop();
    }
  });

  await t.test('IPC-15: step(10) advances exactly 10 ticks', async () => {
    const server = new IpcServer({ port: 0 });
    const { port } = await server.start();

    try {
      const client = new IpcClient();
      await client.connect(port);

      const initialResp = await client.sendRequest('getSnapshot');
      const startTick = initialResp.result.snapshot.simulation_tick;

      const stepResp = await client.sendRequest('step', { ticks: 10 });
      assert.equal(stepResp.success, true);
      assert.equal(stepResp.result.snapshot.simulation_tick, startTick + 10);

      client.disconnect();
    } finally {
      await server.stop();
    }
  });

  await t.test('IPC-16: Multiple clients; disconnect client 1 does not affect client 2/session', async () => {
    const server = new IpcServer({ port: 0 });
    const { port } = await server.start();

    try {
      const client1 = new IpcClient();
      const client2 = new IpcClient();

      await client1.connect(port);
      await client2.connect(port);

      await client1.sendRequest('step', { ticks: 5 });

      // Disconnect client 1
      client1.disconnect();

      // Client 2 continues normally
      const resp2 = await client2.sendRequest('step', { ticks: 5 });
      assert.equal(resp2.success, true);
      assert.equal(resp2.result.snapshot.simulation_tick, 10);

      client2.disconnect();
    } finally {
      await server.stop();
    }
  });

  await t.test('IPC-17: Disconnect while PLAYING does not pause session', async () => {
    const server = new IpcServer({ port: 0, tickIntervalMs: 20 });
    const { port } = await server.start();

    try {
      const client1 = new IpcClient();
      await client1.connect(port);

      await client1.sendRequest('play');
      assert.equal(server.session.playbackStatus, 'PLAYING');

      // Disconnect client
      client1.disconnect();

      // Verify session is still playing
      assert.equal(server.session.playbackStatus, 'PLAYING');

      // Reconnect client 2 to inspect
      const client2 = new IpcClient();
      await client2.connect(port);

      const snap = await client2.sendRequest('getSnapshot');
      assert.equal(snap.result.snapshot.playback_status, 'PLAYING');

      await client2.sendRequest('pause');
      client2.disconnect();
    } finally {
      await server.stop();
    }
  });

  await t.test('IPC-18: Stopping playback does not cancel already queued step', async () => {
    const server = new IpcServer({ port: 0 });
    const { port } = await server.start();

    try {
      const client = new IpcClient();
      await client.connect(port);

      // Directly enqueue step followed by pause in FIFO queue
      const pStep = client.sendRequest('step', { ticks: 3 });
      const pPause = client.sendRequest('pause');
      const pSnap = client.sendRequest('getSnapshot');

      const [rStep, rPause, rSnap] = await Promise.all([pStep, pPause, pSnap]);

      assert.equal(rStep.success, true);
      assert.equal(rPause.success, true);
      assert.equal(rSnap.success, true);
      assert.equal(rSnap.result.snapshot.simulation_tick, 3);
      assert.equal(rSnap.result.snapshot.playback_status, 'PAUSED');

      client.disconnect();
    } finally {
      await server.stop();
    }
  });

  await t.test('IPC-19: Simulation failure -> bridge FAILED -> SESSION_ERROR -> reset recovery', async () => {
    const server = new IpcServer({ port: 0 });
    const { port } = await server.start();

    try {
      const client = new IpcClient();
      await client.connect(port);

      // Force simulated session error by sabotaging session.step
      const originalStep = server.session.step.bind(server.session);
      server.session.step = () => {
        throw new Error('Simulated biological mutation fault');
      };

      const failResp = await client.sendRequest('step', { ticks: 1 });
      assert.equal(failResp.success, false);
      assert.equal(failResp.error.code, IPC_ERROR_CODES.SESSION_ERROR);
      assert.equal(server.bridgeHealth, BRIDGE_HEALTH.FAILED);

      // Further step commands must be rejected in FAILED state
      const rejectedResp = await client.sendRequest('step', { ticks: 1 });
      assert.equal(rejectedResp.success, false);
      assert.equal(rejectedResp.error.code, IPC_ERROR_CODES.SESSION_ERROR);

      // Restore original step method before reset
      server.session.step = originalStep;

      // Issue reset to recover
      const resetResp = await client.sendRequest('reset');
      assert.equal(resetResp.success, true);
      assert.equal(server.bridgeHealth, BRIDGE_HEALTH.HEALTHY);

      // Verify normal operation restored
      const afterResetStep = await client.sendRequest('step', { ticks: 1 });
      assert.equal(afterResetStep.success, true);
      assert.equal(afterResetStep.result.snapshot.simulation_tick, 1);

      client.disconnect();
    } finally {
      await server.stop();
    }
  });

  await t.test('IPC-20: Replay determinism: Two independent sessions produce bit-for-bit identical snapshots', async () => {
    const server1 = new IpcServer({ port: 0 });
    const server2 = new IpcServer({ port: 0 });

    const [addr1, addr2] = await Promise.all([server1.start(), server2.start()]);

    try {
      const client1 = new IpcClient();
      const client2 = new IpcClient();

      await Promise.all([client1.connect(addr1.port), client2.connect(addr2.port)]);

      // Execute exact identical discrete command sequence
      const commandSequence = [
        { cmd: 'step', params: { ticks: 5 } },
        { cmd: 'step', params: { ticks: 10 } },
        { cmd: 'pause', params: {} },
        { cmd: 'step', params: { ticks: 2 } },
        { cmd: 'getSnapshot', params: {} }
      ];

      for (const item of commandSequence) {
        const [res1, res2] = await Promise.all([
          client1.sendRequest(item.cmd, item.params),
          client2.sendRequest(item.cmd, item.params)
        ]);

        assert.equal(res1.success, true);
        assert.equal(res2.success, true);
      }

      const snap1 = (await client1.sendRequest('getSnapshot')).result.snapshot;
      const snap2 = (await client2.sendRequest('getSnapshot')).result.snapshot;

      const str1 = JSON.stringify(snap1);
      const str2 = JSON.stringify(snap2);

      assert.equal(str1, str2, 'Independent sessions receiving identical command sequence must produce bit-for-bit identical snapshots');

      client1.disconnect();
      client2.disconnect();
    } finally {
      await Promise.all([server1.stop(), server2.stop()]);
    }
  });
});
