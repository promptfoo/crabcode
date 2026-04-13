import { describe, expect, it } from 'vitest';

import { parseCurl } from './curl.js';

describe('parseCurl', () => {
  it('ignores unquoted inline comments', () => {
    const parsed = parseCurl("curl https://example.com/api # explain the request");

    expect(parsed.url).toBe('https://example.com/api');
  });

  it('preserves hash characters inside quoted headers', () => {
    const parsed = parseCurl(
      "curl https://example.com/api -H 'Authorization: Bearer abc#123' -H 'X-Trace: keep#me'"
    );

    expect(parsed.headers.Authorization).toBe('Bearer abc#123');
    expect(parsed.headers['X-Trace']).toBe('keep#me');
  });

  it('preserves escaped hash characters outside quotes', () => {
    const parsed = parseCurl('curl https://example.com/api --data token=abc\\#123');

    expect(parsed.body).toEqual({ token: 'abc#123' });
  });
});
