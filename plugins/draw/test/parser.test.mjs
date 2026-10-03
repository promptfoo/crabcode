import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import * as esmParser from 'socket.io-parser';

const require = createRequire(import.meta.url);

// Socket.IO uses the CommonJS entry; also cover the ESM API used by tooling.
for (const [entry, { Encoder, Decoder, PacketType }] of [
  ['CommonJS', require('socket.io-parser')],
  ['ESM', esmParser],
]) {
  function roundTrip(data) {
    const decoder = new Decoder();
    const decoded = [];
    decoder.on('decoded', (packet) => decoded.push(packet));
    try {
      const encoded = new Encoder().encode({ type: PacketType.EVENT, nsp: '/', data });
      for (const frame of encoded) decoder.add(frame);
      assert.equal(decoded.length, 1);
      assert.equal(decoded[0].type, PacketType.EVENT);
      assert.equal(decoded[0].nsp, '/');
      return decoded[0].data;
    } finally {
      decoder.destroy();
    }
  }

  test(`${entry}: preserves Draw JSON event shapes`, () => {
    for (const event of [
      ['join', { roomId: 'local-room', username: 'fixture' }],
      ['full-state', { type: 'full-state', elements: [], participants: [] }],
      ['scene-update', { elements: [{ id: 'rectangle', version: 1, x: 10, y: 20 }] }],
      ['cursor-update', { pointer: { x: 12, y: 34 } }],
      ['request-state'],
    ]) {
      assert.deepEqual(roundTrip(event), event);
    }
  });

  test(`${entry}: preserves a normal binary event`, () => {
    const event = ['fixture', { bytes: Buffer.from('small local fixture') }];
    assert.deepEqual(roundTrip(event), event);
  });

  test(`${entry}: honors JSON serialization alongside binary data`, () => {
    const bytes = Buffer.from('local drawing fixture');
    class DrawingAttachment {
      constructor(value) {
        this.internalBytes = value;
      }
      toJSON() {
        return { attachment: this.internalBytes, label: 'fixture' };
      }
    }
    assert.deepEqual(roundTrip(['fixture', new DrawingAttachment(bytes)]), ['fixture', { attachment: bytes, label: 'fixture' }]);
  });

  test(`${entry}: rejects a binary header without attachments`, () => {
    const decoder = new Decoder();
    let decoded = false;
    decoder.on('decoded', () => { decoded = true; });
    try {
      // One short local header; no attachments or resource-exhaustion traffic.
      assert.throws(() => decoder.add('50-["fixture"]'), /Illegal attachments/);
      assert.equal(decoded, false);
    } finally {
      decoder.destroy();
    }
  });
}
