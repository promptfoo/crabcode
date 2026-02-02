/**
 * Burp Suite Export Parser
 *
 * Parses Burp Suite XML export files containing HTTP requests.
 * Handles base64-encoded request bodies and multiple items.
 */

import type { ParsedArtifact, AuthType, BodyType } from '../types.js';

interface BurpItem {
  url: string;
  host: string;
  port: number;
  protocol: string;
  method: string;
  path: string;
  request: string; // Raw HTTP request
}

/**
 * Parse Burp Suite XML export into ParsedArtifact(s)
 */
export function parseBurp(xml: string): ParsedArtifact[] {
  const items = extractItems(xml);
  return items.map(item => parseItem(item));
}

/**
 * Parse a single Burp item (most common use case)
 */
export function parseBurpSingle(xml: string): ParsedArtifact {
  const items = parseBurp(xml);
  if (items.length === 0) {
    throw new Error('No valid items found in Burp export');
  }
  return items[0];
}

/**
 * Extract items from Burp XML
 */
function extractItems(xml: string): BurpItem[] {
  const items: BurpItem[] = [];

  // Match <item> elements
  const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/gi);

  for (const match of itemMatches) {
    const itemXml = match[1];

    const url = extractTag(itemXml, 'url');
    const host = extractTag(itemXml, 'host');
    const port = parseInt(extractTag(itemXml, 'port') || '80');
    const protocol = extractTag(itemXml, 'protocol') || 'http';
    const method = extractTag(itemXml, 'method') || 'GET';
    const path = extractTag(itemXml, 'path') || '/';
    const request = extractEncodedContent(itemXml, 'request');

    if (url || (host && path)) {
      items.push({
        url: url || `${protocol}://${host}:${port}${path}`,
        host,
        port,
        protocol,
        method,
        path,
        request,
      });
    }
  }

  return items;
}

/**
 * Extract text content from an XML tag
 */
function extractTag(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  if (!match) return '';

  let content = match[1].trim();

  // Handle CDATA sections
  const cdataMatch = content.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  if (cdataMatch) {
    content = cdataMatch[1];
  }

  return decodeXmlEntities(content);
}

/**
 * Extract and decode base64 content from a tag
 */
function extractEncodedContent(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}[^>]*base64="true"[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  if (match) {
    let content = match[1].trim();

    // Handle CDATA sections
    const cdataMatch = content.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
    if (cdataMatch) {
      content = cdataMatch[1];
    }

    try {
      return Buffer.from(content, 'base64').toString('utf-8');
    } catch {
      return content;
    }
  }

  // Try without base64 encoding
  return extractTag(xml, tag);
}

/**
 * Decode XML entities
 */
function decodeXmlEntities(str: string): string {
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/**
 * Parse a single Burp item into ParsedArtifact
 */
function parseItem(item: BurpItem): ParsedArtifact {
  const headers: Record<string, string> = {};
  let body: unknown = undefined;
  let bodyType: BodyType = 'none';
  let method = item.method;

  // Parse raw HTTP request if available
  if (item.request) {
    const parsed = parseRawHttpRequest(item.request);
    Object.assign(headers, parsed.headers);
    body = parsed.body;
    bodyType = parsed.bodyType;
    method = parsed.method || method;
  }

  // Detect auth
  const auth = detectAuth(headers);

  // Parse URL
  const { baseUrl, queryParams } = parseUrl(item.url);

  return {
    source: 'burp',
    method,
    url: baseUrl,
    headers,
    body,
    bodyType,
    queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
    auth: auth.type !== 'none' ? auth : undefined,
    raw: item.request || `${method} ${item.path}`,
  };
}

/**
 * Parse raw HTTP request string
 */
function parseRawHttpRequest(raw: string): {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
  bodyType: BodyType;
} {
  const lines = raw.split(/\r?\n/);
  const headers: Record<string, string> = {};
  let bodyStart = -1;
  let method = 'GET';
  let path = '/';

  // Parse request line
  if (lines[0]) {
    const parts = lines[0].split(' ');
    if (parts.length >= 2) {
      method = parts[0];
      path = parts[1];
    }
  }

  // Parse headers
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];

    if (line === '' || line === '\r') {
      bodyStart = i + 1;
      break;
    }

    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim();
      headers[key] = value;
    }
  }

  // Parse body
  let body: unknown = undefined;
  let bodyType: BodyType = 'none';

  if (bodyStart > 0 && bodyStart < lines.length) {
    const rawBody = lines.slice(bodyStart).join('\n').trim();

    if (rawBody) {
      const contentType = headers['Content-Type'] || headers['content-type'] || '';

      // Try JSON
      if (contentType.includes('application/json') || rawBody.startsWith('{') || rawBody.startsWith('[')) {
        try {
          body = JSON.parse(rawBody);
          bodyType = 'json';
        } catch {
          body = rawBody;
          bodyType = 'raw';
        }
      }
      // Form data
      else if (contentType.includes('application/x-www-form-urlencoded') || rawBody.includes('=')) {
        const formData: Record<string, string> = {};
        const pairs = rawBody.split('&');
        for (const pair of pairs) {
          const [key, value] = pair.split('=').map(s => decodeURIComponent(s));
          if (key) {
            formData[key] = value || '';
          }
        }
        if (Object.keys(formData).length > 0) {
          body = formData;
          bodyType = 'form';
        } else {
          body = rawBody;
          bodyType = 'raw';
        }
      }
      // Raw
      else {
        body = rawBody;
        bodyType = 'raw';
      }
    }
  }

  return { method, path, headers, body, bodyType };
}

/**
 * Parse URL and extract query parameters
 */
function parseUrl(urlString: string): { baseUrl: string; queryParams: Record<string, string> } {
  try {
    const url = new URL(urlString);
    const queryParams: Record<string, string> = {};

    url.searchParams.forEach((value, key) => {
      queryParams[key] = value;
    });

    const baseUrl = `${url.protocol}//${url.host}${url.pathname}`;
    return { baseUrl, queryParams };
  } catch {
    const questionIndex = urlString.indexOf('?');
    return {
      baseUrl: questionIndex > 0 ? urlString.slice(0, questionIndex) : urlString,
      queryParams: {},
    };
  }
}

/**
 * Detect authentication type from headers
 */
function detectAuth(headers: Record<string, string>): { type: AuthType; value?: string; header?: string } {
  const authHeader = headers['Authorization'] || headers['authorization'];

  if (!authHeader) {
    for (const [key, value] of Object.entries(headers)) {
      const lowerKey = key.toLowerCase();
      if (lowerKey.includes('api-key') || lowerKey.includes('apikey') || lowerKey === 'x-api-key') {
        return { type: 'api-key', value, header: key };
      }
    }
    return { type: 'none' };
  }

  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return { type: 'bearer', value: authHeader.slice(7), header: 'Authorization' };
  }

  if (authHeader.toLowerCase().startsWith('basic ')) {
    return { type: 'basic', value: authHeader.slice(6), header: 'Authorization' };
  }

  return { type: 'custom', value: authHeader, header: 'Authorization' };
}
