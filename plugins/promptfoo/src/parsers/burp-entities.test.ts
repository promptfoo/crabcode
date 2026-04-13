import { describe, expect, it } from 'vitest';

import { parseBurpSingle } from './burp.js';

describe('parseBurpSingle XML entity decoding', () => {
  it('decodes ampersands after other entities', () => {
    const parsed = parseBurpSingle(`
      <items>
        <item>
          <url>https://example.com/search?note=&amp;quot;</url>
          <host>example.com</host>
          <port>443</port>
          <protocol>https</protocol>
          <method>GET</method>
          <path>/search?note=&amp;quot;</path>
          <request></request>
        </item>
      </items>
    `);

    expect(parsed.raw).toContain('note=&quot;');
  });
});
