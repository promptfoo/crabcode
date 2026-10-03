import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createHttpServer } from '../../dist/server/http.js';

test('built UI serves the Excalidraw stylesheet', async (t) => {
  const server = createHttpServer({ getElements: () => [], saveElements: () => {} });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(origin);
  assert.equal(response.status, 200);
  const html = await response.text();
  const stylesheets = [...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/g)]
    .map(([tag]) => tag.match(/href="([^"]+)"/)?.[1]);
  assert.ok(stylesheets.length > 0, 'the UI must load its canvas stylesheet');

  let css = '';
  for (const href of stylesheets) {
    assert.ok(href, 'stylesheet link must have an href');
    const stylesheet = await fetch(new URL(href, origin));
    assert.equal(stylesheet.status, 200);
    assert.match(stylesheet.headers.get('content-type'), /^text\/css/);
    css += await stylesheet.text();
  }
  assert.match(css, /\.excalidraw\b/, 'the served CSS must include Excalidraw styles');
});
