import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';

import { detectTunnel } from '../dist/server/tunnel.js';

test('detectTunnel checks PATH without invoking a shell', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crabcode-draw-'));
  const originalPath = process.env.PATH;
  const ngrokPath = path.join(tempDir, 'ngrok');

  try {
    fs.writeFileSync(ngrokPath, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    process.env.PATH = tempDir;

    assert.equal(detectTunnel('ngrok'), 'ngrok');
    assert.equal(detectTunnel('cloudflared'), null);
    assert.equal(detectTunnel('ngrok; echo nope'), null);
  } finally {
    process.env.PATH = originalPath;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
