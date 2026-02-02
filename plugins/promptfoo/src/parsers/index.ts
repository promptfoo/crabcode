/**
 * Parser registry with auto-detection
 *
 * Supports:
 * - Curl commands
 * - Burp Suite XML exports
 * - Postman collection JSON
 * - OpenAPI/Swagger specifications
 */

import type { ParsedArtifact } from '../types.js';
import { parseCurl } from './curl.js';
import { parseBurp, parseBurpSingle } from './burp.js';
import { parsePostman, parsePostmanSingle } from './postman.js';
import { parseOpenAPI, parseOpenAPISingle } from './openapi.js';

export { parseCurl } from './curl.js';
export { parseBurp, parseBurpSingle } from './burp.js';
export { parsePostman, parsePostmanSingle } from './postman.js';
export { parseOpenAPI, parseOpenAPISingle } from './openapi.js';

export type ArtifactFormat = 'curl' | 'burp' | 'postman' | 'openapi' | 'unknown';

/**
 * Detect the format of an artifact
 */
export function detectFormat(input: string): ArtifactFormat {
  const trimmed = input.trim();

  // Curl command
  if (trimmed.toLowerCase().startsWith('curl ') || trimmed.toLowerCase().startsWith('curl\n')) {
    return 'curl';
  }

  // Burp Suite XML (contains <items> or <item> with request elements)
  if (trimmed.includes('<item>') && (trimmed.includes('<request') || trimmed.includes('<url>'))) {
    return 'burp';
  }

  // Try parsing as JSON
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);

      // Postman collection
      if (parsed.info?.schema?.includes('collection') || parsed.info?._postman_id) {
        return 'postman';
      }

      // OpenAPI/Swagger
      if (parsed.openapi || parsed.swagger) {
        return 'openapi';
      }
    } catch {
      // Not valid JSON
    }
  }

  return 'unknown';
}

/**
 * Auto-detect artifact type and parse
 */
export function parseArtifact(input: string, options: { baseUrl?: string } = {}): ParsedArtifact {
  const format = detectFormat(input);

  switch (format) {
    case 'curl':
      return parseCurl(input);

    case 'burp':
      return parseBurpSingle(input);

    case 'postman':
      return parsePostmanSingle(input);

    case 'openapi':
      return parseOpenAPISingle(input, options);

    default:
      throw new Error(
        'Unable to detect artifact type. Supported formats:\n' +
        '  - Curl commands (curl -X POST ...)\n' +
        '  - Burp Suite XML exports (<items>...)</items>)\n' +
        '  - Postman collection JSON\n' +
        '  - OpenAPI/Swagger JSON specifications\n' +
        '\nPlease provide input in one of these formats.'
      );
  }
}

/**
 * Parse artifact and return all endpoints (for multi-endpoint formats)
 */
export function parseArtifactAll(input: string, options: { baseUrl?: string } = {}): ParsedArtifact[] {
  const format = detectFormat(input);

  switch (format) {
    case 'curl':
      return [parseCurl(input)];

    case 'burp':
      return parseBurp(input);

    case 'postman':
      return parsePostman(input);

    case 'openapi':
      return parseOpenAPI(input, options);

    default:
      throw new Error('Unable to detect artifact type');
  }
}
