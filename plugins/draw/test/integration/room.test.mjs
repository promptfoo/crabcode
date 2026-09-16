import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import { test } from 'node:test';
import { createRoomServer } from '../../dist/server/room.js';

// Use the actual UI lockfile's client against the actual Draw room server.
const requireUi = createRequire(new URL('../../ui/package.json', import.meta.url));
const { io } = requireUi('socket.io-client');

function event(socket, name) {
  return once(socket, name, { signal: AbortSignal.timeout(5000) }).then(([data]) => data);
}

for (const transport of ['websocket', 'polling']) {
  test(`room collaboration works over ${transport}`, { timeout: 15000 }, async (t) => {
    const server = http.createServer();
    const room = createRoomServer(server, 'local-fixture-room', []);
    const clients = [];
    t.after(async () => {
      for (const socket of clients) socket.disconnect();
      await new Promise((resolve) => room.io.close(resolve));
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const url = `http://127.0.0.1:${server.address().port}`;
    async function join(username) {
      const socket = io(url, { transports: [transport], reconnection: false, autoConnect: false });
      clients.push(socket);
      const connected = event(socket, 'connect');
      socket.connect();
      await connected;
      const state = event(socket, 'full-state');
      socket.emit('join', { roomId: 'local-fixture-room', username });
      assert.deepEqual((await state).elements, []);
      return socket;
    }

    const alice = await join('Alice fixture');
    const joined = event(alice, 'participant-joined');
    const bob = await join('Bob fixture');
    assert.equal((await joined).username, 'Bob fixture');
    assert.deepEqual(room.getParticipants().sort(), ['Alice fixture', 'Bob fixture']);

    const elements = [{ id: 'fixture-rectangle', type: 'rectangle', version: 1, x: 10, y: 20 }];
    const update = event(bob, 'scene-update');
    alice.emit('scene-update', { elements });
    assert.deepEqual(await update, { type: 'scene-update', elements, from: 'Alice fixture' });
    assert.deepEqual(room.getElements(), elements);

    const cursor = event(bob, 'cursor-update');
    alice.emit('cursor-update', { pointer: { x: 30, y: 40 } });
    const pointer = await cursor;
    assert.deepEqual(pointer.pointer, { x: 30, y: 40 });
    assert.equal(pointer.username, 'Alice fixture');

    const state = event(bob, 'full-state');
    bob.emit('request-state');
    const snapshot = await state;
    assert.deepEqual(snapshot.elements, elements);
    assert.deepEqual(snapshot.participants.map((p) => p.username).sort(), ['Alice fixture', 'Bob fixture']);

    const left = event(alice, 'participant-left');
    bob.disconnect();
    assert.equal((await left).username, 'Bob fixture');
    assert.deepEqual(room.getParticipants(), ['Alice fixture']);
  });
}
