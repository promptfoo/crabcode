import { describe, expect, it } from 'vitest';

import { parseBurp } from './burp.js';

describe('parseBurp item extraction', () => {
  it('parses multiple Burp items without regex backtracking', () => {
    const repeatedNoise = '<item>a'.repeat(2000);
    const xml = `
      <items>
        <metadata>${repeatedNoise}</metadata>
        <item>
          <url>https://example.com/one</url>
          <host>example.com</host>
          <port>443</port>
          <protocol>https</protocol>
          <method>GET</method>
          <path>/one</path>
          <request></request>
        </item>
        <item>
          <url>https://example.com/two</url>
          <host>example.com</host>
          <port>443</port>
          <protocol>https</protocol>
          <method>POST</method>
          <path>/two</path>
          <request></request>
        </item>
      </items>
    `;

    const parsed = parseBurp(xml);

    expect(parsed).toHaveLength(2);
    expect(parsed.map((item) => item.url)).toEqual([
      'https://example.com/one',
      'https://example.com/two',
    ]);
  });
});
