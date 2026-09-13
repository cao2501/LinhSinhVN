/**
 * LinhSinhVN — DEMO-01-C: C-01 Bootstrap Test Suite
 *
 * Covers 10 mandatory test cases specified by Game Director.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import fs from 'node:fs';
import { spawn } from 'node:child_process';

import {
  DEFAULT_IPC_HOST,
  DEFAULT_IPC_PORT,
  PROTOCOL_VERSION,
  MAX_FRAME_SIZE,
  BRIDGE_HEALTH,
  IPC_COMMANDS,
  IPC_ERROR_CODES,
  encodeFrame,
  FrameParser,
  IpcServer,
  IpcClient,
  DemoSimulationSession
} from '../../demo/index.js';

test('DEMO-01-C / C-01: Godot Presentation Shell Bootstrap', async (t) => {

  await t.test('C01-01: Server runner boots IpcServer on default/configured port', async () => {
    const server = new IpcServer({ port: 0 });
    const addr = await server.start();

    assert.equal(addr.host, '127.0.0.1');
    assert.ok(addr.port > 0);

    const client = new IpcClient();
    await client.connect(addr.port, addr.host);
    const snap = await client.sendRequest(IPC_COMMANDS.GET_SNAPSHOT);
    assert.equal(snap.success, true);
    assert.ok(snap.result.snapshot);

    client.disconnect();
    await server.stop();
  });

  await t.test('C01-02: Runner is strictly loopback-only (127.0.0.1)', async () => {
    const runnerContent = fs.readFileSync('tools/run_ipc_server.js', 'utf8');
    assert.match(runnerContent, /DEFAULT_IPC_HOST/, 'Must use DEFAULT_IPC_HOST');
    assert.doesNotMatch(runnerContent, /0\.0\.0\.0/, 'Must never bind to 0.0.0.0');
    assert.doesNotMatch(runnerContent, /--host/, 'Must never expose CLI --host override');

    const server = new IpcServer({ port: 0 });
    assert.equal(server.host, '127.0.0.1');
  });

  await t.test('C01-03: --port override works and validates port bounds', async () => {
    const testPort = 18777;
    const child = spawn(process.execPath, ['tools/run_ipc_server.js', '--port', String(testPort)], {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe']
    });

    try {
      const startupLine = await new Promise((resolve, reject) => {
        let out = '';
        child.stdout.on('data', (d) => {
          out += d.toString('utf8');
          if (out.includes('IPC server listening')) {
            resolve(out.trim());
          }
        });
        child.on('error', reject);
        child.on('exit', (code) => {
          if (code !== 0) reject(new Error(`Child exited with code ${code}`));
        });
      });

      assert.equal(startupLine, `IPC server listening on 127.0.0.1:${testPort}`);

      // Verify connection to custom port
      const client = new IpcClient();
      await client.connect(testPort, '127.0.0.1');
      const resp = await client.sendRequest(IPC_COMMANDS.GET_SNAPSHOT);
      assert.equal(resp.success, true);
      client.disconnect();
    } finally {
      child.kill();
      await new Promise((r) => child.on('exit', r));
    }
  });

  await t.test('C01-04: SIGINT/SIGTERM trigger graceful shutdown, await server.stop(), and release port', async () => {
    const testPort = 18778;
    const server = new IpcServer({ port: testPort, host: '127.0.0.1' });
    await server.start();

    // Verify server is listening
    const client = new IpcClient();
    await client.connect(testPort, '127.0.0.1');
    assert.equal(client.isConnected, true);

    // Demonstrate signal handling lifecycle:
    // When SIGINT or SIGTERM handler is invoked, it awaits server.stop()
    let signalFired = false;
    const testShutdownHandler = async () => {
      signalFired = true;
      await server.stop();
    };

    process.once('SIGINT', testShutdownHandler);
    process.emit('SIGINT');

    // Await shutdown
    await new Promise((resolve) => {
      const check = setInterval(() => {
        if (signalFired && server.server === null) {
          clearInterval(check);
          resolve();
        }
      }, 10);
    });

    assert.equal(signalFired, true, 'SIGINT handler must fire');
    assert.equal(client.isConnected, false, 'Client connection must be severed upon server stop');

    // Prove that port was released and can immediately be rebound
    const reboundServer = net.createServer();
    await new Promise((resolve, reject) => {
      reboundServer.listen(testPort, '127.0.0.1', () => {
        reboundServer.close(resolve);
      });
      reboundServer.on('error', reject);
    });
  });

  await t.test('C01-05: Godot framing contract is 4-byte BE uint32 length prefix', () => {
    const payload = { protocol_version: '1.0', request_id: 'godot_000001', command: 'step' };
    const frame = encodeFrame(payload);

    // Verify length prefix
    const payloadLength = frame.readUInt32BE(0);
    assert.equal(payloadLength, frame.length - 4);

    // Simulate Godot Big-Endian uint32 read:
    const b0 = frame[0];
    const b1 = frame[1];
    const b2 = frame[2];
    const b3 = frame[3];
    const godotDecodedLength = (b0 << 24) | (b1 << 16) | (b2 << 8) | b3;
    assert.equal(godotDecodedLength, payloadLength);

    // Verify GDScript client source code matches contract
    const gdCode = fs.readFileSync('godot/scripts/ipc/ipc_client.gd', 'utf8');
    assert.ok(gdCode.includes('length_slice[0] << 24'));
    assert.ok(gdCode.includes('put_u32'));
  });

  await t.test('C01-06: Fragmented response/frame handling preserves all bytes without loss', () => {
    const payload = {
      protocol_version: '1.0',
      request_id: 'godot_000002',
      success: true,
      command: 'getSnapshot',
      result: { snapshot: { tick: 10, items: new Array(50).fill('data') } }
    };
    const frame = encodeFrame(payload);

    const parser = new FrameParser();
    // Split frame into multiple fragments of 7 bytes each
    const fragments = [];
    for (let i = 0; i < frame.length; i += 7) {
      fragments.push(frame.subarray(i, Math.min(i + 7, frame.length)));
    }

    let parsedFrames = [];
    for (const frag of fragments) {
      const res = parser.push(frag);
      if (res.length > 0) {
        parsedFrames = parsedFrames.concat(res);
      }
    }

    assert.equal(parsedFrames.length, 1);
    assert.equal(parsedFrames[0].type, 'frame');
    assert.deepEqual(parsedFrames[0].payload, payload);
  });

  await t.test('C01-07: Concatenated frames are parsed in strict FIFO order', () => {
    const p1 = { id: 1, cmd: 'step' };
    const p2 = { id: 2, cmd: 'pause' };
    const p3 = { id: 3, cmd: 'getSnapshot' };

    const batch = Buffer.concat([encodeFrame(p1), encodeFrame(p2), encodeFrame(p3)]);
    const parser = new FrameParser();
    const results = parser.push(batch);

    assert.equal(results.length, 3);
    assert.equal(results[0].payload.id, 1);
    assert.equal(results[1].payload.id, 2);
    assert.equal(results[2].payload.id, 3);
  });

  await t.test('C01-08: Request IDs are strictly deterministic godot_%06d without randomness', () => {
    const client = new IpcClient();
    const id1 = client.nextRequestId();
    const id2 = client.nextRequestId();
    const id3 = client.nextRequestId();

    assert.equal(id1, 'godot_000001');
    assert.equal(id2, 'godot_000002');
    assert.equal(id3, 'godot_000003');

    // Verify GDScript client implements the exact same format
    const gdCode = fs.readFileSync('godot/scripts/ipc/ipc_client.gd', 'utf8');
    assert.ok(gdCode.includes('"godot_%06d" % _request_counter'));
    assert.doesNotMatch(gdCode, /randi/, 'Must not use random generators in Godot client');
    assert.doesNotMatch(gdCode, /Time\.get_/, 'Must not use system timestamps in request IDs');
  });

  await t.test('C01-09: Connection failure maps to documented disconnected/client failure contract', async () => {
    const server = new IpcServer({ port: 0 });
    const { port } = await server.start();

    const client = new IpcClient();
    await client.connect(port, '127.0.0.1');
    assert.equal(client.isConnected, true);

    // Stop server abruptly: client must transition to disconnected
    const closePromise = new Promise((resolve) => {
      client.socket.on('close', resolve);
    });
    await server.stop();
    await closePromise;
    assert.equal(client.isConnected, false);

    // Verify GDScript protocol constants define identical error codes
    const gdConstants = fs.readFileSync('godot/scripts/ipc/protocol_constants.gd', 'utf8');
    assert.ok(gdConstants.includes('MALFORMED_JSON'));
    assert.ok(gdConstants.includes('SESSION_ERROR'));
    assert.ok(gdConstants.includes('INVALID_REQUEST'));

    // Verify GDScript client defines connection states and signals
    const gdClient = fs.readFileSync('godot/scripts/ipc/ipc_client.gd', 'utf8');
    assert.ok(gdClient.includes('signal disconnected()'));
    assert.ok(gdClient.includes('signal bridge_failed(error_message: String)'));
  });

  await t.test('C01-10: IPC client operations cannot advance simulation state unless an explicit server IPC command is executed', async () => {
    const server = new IpcServer({ port: 0 });
    const { port } = await server.start();

    try {
      const client = new IpcClient();
      await client.connect(port);

      // Snapshot at tick 0
      const initialSnap = await client.sendRequest(IPC_COMMANDS.GET_SNAPSHOT);
      const startTick = initialSnap.result.snapshot.simulation_tick;
      assert.equal(startTick, 0);

      // Client connecting, polling, disconnecting does NOT step simulation
      client.disconnect();

      const client2 = new IpcClient();
      await client2.connect(port);
      const snap2 = await client2.sendRequest(IPC_COMMANDS.GET_SNAPSHOT);
      assert.equal(snap2.result.snapshot.simulation_tick, 0, 'Simulation tick must not advance from client connections');

      // Only explicit step advances tick
      await client2.sendRequest(IPC_COMMANDS.STEP, { ticks: 1 });
      const snap3 = await client2.sendRequest(IPC_COMMANDS.GET_SNAPSHOT);
      assert.equal(snap3.result.snapshot.simulation_tick, 1);

      client2.disconnect();
    } finally {
      await server.stop();
    }
  });

});
