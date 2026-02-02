/**
 * Curl Command Parser
 *
 * Parses curl commands into structured ParsedArtifact objects.
 * Handles common flags: -X, -H, -d, --data, -b, --cookie, etc.
 */

import type { ParsedArtifact, AuthType, BodyType } from '../types.js';

interface ParseState {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  cookies: Record<string, string>;
}

/**
 * Parse a curl command string into a ParsedArtifact
 */
export function parseCurl(command: string): ParsedArtifact {
  const raw = command.trim();

  // Remove comments and normalize whitespace
  const cleaned = raw
    .split('\n')
    .map((line) => line.replace(/#.*$/, '').trim())
    .join(' ')
    .replace(/\\\s+/g, ' ') // Handle line continuations
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned.toLowerCase().startsWith('curl')) {
    throw new Error('Invalid curl command: must start with "curl"');
  }

  const state: ParseState = {
    method: 'GET',
    url: '',
    headers: {},
    cookies: {},
  };

  const tokens = tokenize(cleaned);
  parseTokens(tokens, state);

  if (!state.url) {
    throw new Error('Invalid curl command: no URL found');
  }

  // Parse URL and extract query params
  const { baseUrl, queryParams } = parseUrl(state.url);

  // Detect auth from headers
  const auth = detectAuth(state.headers);

  // Detect body type
  const { body, bodyType } = parseBody(state.body, state.headers);

  // If body exists and method is GET, default to POST
  if (body && state.method === 'GET') {
    state.method = 'POST';
  }

  return {
    source: 'curl',
    method: state.method,
    url: baseUrl,
    headers: state.headers,
    body,
    bodyType,
    queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
    auth: auth.type !== 'none' ? auth : undefined,
    cookies: Object.keys(state.cookies).length > 0 ? state.cookies : undefined,
    raw,
  };
}

/**
 * Tokenize a curl command, handling quoted strings
 */
function tokenize(command: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inQuote: string | null = null;
  let escape = false;

  for (let i = 0; i < command.length; i++) {
    const char = command[i];

    if (escape) {
      current += char;
      escape = false;
      continue;
    }

    if (char === '\\') {
      escape = true;
      continue;
    }

    if (inQuote) {
      if (char === inQuote) {
        inQuote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inQuote = char;
      continue;
    }

    if (char === ' ') {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

/**
 * Parse tokens into state
 */
function parseTokens(tokens: string[], state: ParseState): void {
  let i = 0;

  // Skip 'curl'
  if (tokens[i]?.toLowerCase() === 'curl') {
    i++;
  }

  while (i < tokens.length) {
    const token = tokens[i];

    // Method
    if (token === '-X' || token === '--request') {
      i++;
      if (tokens[i]) {
        state.method = tokens[i].toUpperCase();
      }
      i++;
      continue;
    }

    // Header
    if (token === '-H' || token === '--header') {
      i++;
      if (tokens[i]) {
        const header = tokens[i];
        const colonIndex = header.indexOf(':');
        if (colonIndex > 0) {
          const key = header.slice(0, colonIndex).trim();
          const value = header.slice(colonIndex + 1).trim();
          state.headers[key] = value;
        }
      }
      i++;
      continue;
    }

    // Data
    if (token === '-d' || token === '--data' || token === '--data-raw' || token === '--data-binary') {
      i++;
      if (tokens[i]) {
        state.body = tokens[i];
      }
      i++;
      continue;
    }

    // Data from file
    if (token === '--data-urlencode') {
      i++;
      if (tokens[i]) {
        // Append to body as form data
        if (state.body) {
          state.body += '&' + tokens[i];
        } else {
          state.body = tokens[i];
        }
      }
      i++;
      continue;
    }

    // Cookie
    if (token === '-b' || token === '--cookie') {
      i++;
      if (tokens[i]) {
        const cookiePairs = tokens[i].split(';');
        for (const pair of cookiePairs) {
          const [key, value] = pair.split('=').map((s) => s.trim());
          if (key && value !== undefined) {
            state.cookies[key] = value;
          }
        }
      }
      i++;
      continue;
    }

    // User (Basic auth)
    if (token === '-u' || token === '--user') {
      i++;
      if (tokens[i]) {
        const encoded = Buffer.from(tokens[i]).toString('base64');
        state.headers['Authorization'] = `Basic ${encoded}`;
      }
      i++;
      continue;
    }

    // Form data
    if (token === '-F' || token === '--form') {
      i++;
      if (tokens[i]) {
        // Handle form data - set content type if not set
        if (!state.headers['Content-Type']) {
          state.headers['Content-Type'] = 'multipart/form-data';
        }
        // Append to body
        if (state.body) {
          state.body += '&' + tokens[i];
        } else {
          state.body = tokens[i];
        }
      }
      i++;
      continue;
    }

    // Skip other flags with values
    if (token.startsWith('-') && !token.startsWith('--')) {
      // Single letter flags that take values
      if ('-o-O-e-w-T-K-c-D-A-U-E'.includes(token)) {
        i += 2;
        continue;
      }
      // Flags without values
      i++;
      continue;
    }

    if (token.startsWith('--')) {
      // Long flags that might take values
      const skipFlags = [
        '--output',
        '--remote-name',
        '--stderr',
        '--write-out',
        '--upload-file',
        '--config',
        '--cookie-jar',
        '--dump-header',
        '--user-agent',
        '--proxy-user',
        '--cert',
        '--connect-timeout',
        '--max-time',
      ];
      if (skipFlags.includes(token)) {
        i += 2;
        continue;
      }
      // Flags without values
      i++;
      continue;
    }

    // URL (anything else that's not a flag)
    if (!token.startsWith('-')) {
      state.url = token;
    }

    i++;
  }
}

/**
 * Parse URL and extract query parameters
 */
function parseUrl(urlString: string): { baseUrl: string; queryParams: Record<string, string> } {
  try {
    // Handle URLs with environment variables
    const cleanUrl = urlString.replace(/\$\{?\w+\}?/g, 'placeholder');
    const url = new URL(cleanUrl);

    const queryParams: Record<string, string> = {};
    url.searchParams.forEach((value, key) => {
      queryParams[key] = value;
    });

    // Reconstruct base URL without query params, using original URL
    const questionIndex = urlString.indexOf('?');
    const baseUrl = questionIndex > 0 ? urlString.slice(0, questionIndex) : urlString;

    return { baseUrl, queryParams };
  } catch {
    // If URL parsing fails, return as-is
    return { baseUrl: urlString, queryParams: {} };
  }
}

/**
 * Detect authentication type from headers
 */
function detectAuth(headers: Record<string, string>): { type: AuthType; value?: string; header?: string } {
  const authHeader = headers['Authorization'] || headers['authorization'];

  if (!authHeader) {
    // Check for API key patterns
    for (const [key, value] of Object.entries(headers)) {
      const lowerKey = key.toLowerCase();
      if (lowerKey.includes('api-key') || lowerKey.includes('apikey') || lowerKey === 'x-api-key') {
        return { type: 'api-key', value, header: key };
      }
    }
    return { type: 'none' };
  }

  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return {
      type: 'bearer',
      value: authHeader.slice(7),
      header: 'Authorization',
    };
  }

  if (authHeader.toLowerCase().startsWith('basic ')) {
    return {
      type: 'basic',
      value: authHeader.slice(6),
      header: 'Authorization',
    };
  }

  return {
    type: 'custom',
    value: authHeader,
    header: 'Authorization',
  };
}

/**
 * Parse body and detect type
 */
function parseBody(
  rawBody: string | undefined,
  headers: Record<string, string>
): { body: unknown | undefined; bodyType: BodyType } {
  if (!rawBody) {
    return { body: undefined, bodyType: 'none' };
  }

  const contentType = headers['Content-Type'] || headers['content-type'] || '';

  // Try JSON first
  if (contentType.includes('application/json') || rawBody.trim().startsWith('{') || rawBody.trim().startsWith('[')) {
    try {
      return { body: JSON.parse(rawBody), bodyType: 'json' };
    } catch {
      // Not valid JSON, continue
    }
  }

  // Check for form data
  if (contentType.includes('application/x-www-form-urlencoded') || rawBody.includes('=')) {
    const formData: Record<string, string> = {};
    const pairs = rawBody.split('&');
    let isForm = true;

    for (const pair of pairs) {
      const eqIndex = pair.indexOf('=');
      if (eqIndex > 0) {
        const key = decodeURIComponent(pair.slice(0, eqIndex));
        const value = decodeURIComponent(pair.slice(eqIndex + 1));
        formData[key] = value;
      } else {
        isForm = false;
        break;
      }
    }

    if (isForm && Object.keys(formData).length > 0) {
      return { body: formData, bodyType: 'form' };
    }
  }

  // Raw body
  return { body: rawBody, bodyType: 'raw' };
}
