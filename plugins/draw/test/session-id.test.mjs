import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { nanoid } from 'nanoid';
import {
  createSession,
  deleteSession,
  listSessions,
  loadDrawing,
  loadSession,
  resolveSession,
  saveDrawing,
} from '../dist/storage/sessions.js';

test('six-character session suffixes remain URL-safe across random pool refills', () => {
  // Draw uses the secure Node export with a fixed positive size. Request enough
  // suffixes to exercise refills of Nano ID's random byte pool.
  for (let i = 0; i < 300; i++) {
    const suffix = nanoid(6);
    assert.match(suffix, /^[A-Za-z0-9_-]{6}$/);
    const sessionId = `draw-${suffix}`;
    const url = new URL(`http://localhost/?room=${sessionId}`);
    assert.equal(url.searchParams.get('room'), sessionId);
  }
});

test('generated session IDs round-trip through Draw storage and lookup', (t) => {
  const configDir = mkdtempSync(path.join(tmpdir(), 'crab-draw-test-'));
  const previousConfigDir = process.env.CRAB_CONFIG_DIR;
  process.env.CRAB_CONFIG_DIR = configDir;
  t.after(() => {
    if (previousConfigDir === undefined) delete process.env.CRAB_CONFIG_DIR;
    else process.env.CRAB_CONFIG_DIR = previousConfigDir;
    rmSync(configDir, { recursive: true, force: true });
  });

  const id = `quarterly-plan-${nanoid(6)}`;
  const session = createSession(configDir, { id, title: 'Quarterly plan', creator: 'test-fixture' });
  assert.equal(session.id, id);
  assert.deepEqual(loadSession(configDir, id), session);
  assert.deepEqual(loadDrawing(configDir, id), []);
  assert.deepEqual(resolveSession(configDir, id), { id });
  assert.deepEqual(resolveSession(configDir, 'quarterly-plan-'), { id });
  assert.deepEqual(listSessions(configDir), [session]);

  const elements = [{ id: 'fixture-rectangle', type: 'rectangle', x: 0, y: 0, width: 20, height: 20 }];
  saveDrawing(configDir, id, elements);
  assert.deepEqual(loadDrawing(configDir, id), elements);
  assert.equal(deleteSession(configDir, id), true);
  assert.equal(loadSession(configDir, id), null);
  assert.deepEqual(listSessions(configDir), []);
});
