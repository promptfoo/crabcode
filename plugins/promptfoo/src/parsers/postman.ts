/**
 * Postman Collection Parser
 *
 * Parses Postman collection v2.1 JSON exports.
 * Handles requests, authentication, environments, and variables.
 */

import type { ParsedArtifact, AuthType, BodyType } from '../types.js';

interface PostmanAuth {
  type: 'bearer' | 'basic' | 'apikey' | 'noauth';
  bearer?: Array<{ key: string; value: string }>;
  basic?: Array<{ key: string; value: string }>;
  apikey?: Array<{ key: string; value: string }>;
}

interface PostmanHeader {
  key: string;
  value: string;
  disabled?: boolean;
}

interface PostmanBody {
  mode: 'raw' | 'formdata' | 'urlencoded' | 'file' | 'graphql';
  raw?: string;
  formdata?: Array<{ key: string; value: string; type?: string }>;
  urlencoded?: Array<{ key: string; value: string }>;
  options?: {
    raw?: {
      language?: string;
    };
  };
}

interface PostmanUrl {
  raw: string;
  protocol?: string;
  host?: string[];
  path?: string[];
  query?: Array<{ key: string; value: string; disabled?: boolean }>;
}

interface PostmanRequest {
  method: string;
  header?: PostmanHeader[];
  body?: PostmanBody;
  url: string | PostmanUrl;
  auth?: PostmanAuth;
}

interface PostmanItem {
  name: string;
  request?: PostmanRequest;
  item?: PostmanItem[];
  auth?: PostmanAuth;
}

interface PostmanCollection {
  info: {
    name: string;
    schema: string;
  };
  item: PostmanItem[];
  auth?: PostmanAuth;
  variable?: Array<{ key: string; value: string }>;
}

/**
 * Parse Postman collection JSON into ParsedArtifact(s)
 */
export function parsePostman(json: string): ParsedArtifact[] {
  const collection: PostmanCollection = JSON.parse(json);

  if (!collection.info?.schema?.includes('collection')) {
    throw new Error('Invalid Postman collection format');
  }

  const variables = new Map<string, string>();
  if (collection.variable) {
    for (const v of collection.variable) {
      variables.set(v.key, v.value);
    }
  }

  const results: ParsedArtifact[] = [];
  extractItems(collection.item, results, collection.auth, variables);

  return results;
}

/**
 * Parse a single Postman request (most common use case)
 */
export function parsePostmanSingle(json: string): ParsedArtifact {
  const items = parsePostman(json);
  if (items.length === 0) {
    throw new Error('No valid requests found in Postman collection');
  }
  return items[0];
}

/**
 * Recursively extract items from collection
 */
function extractItems(
  items: PostmanItem[],
  results: ParsedArtifact[],
  parentAuth?: PostmanAuth,
  variables?: Map<string, string>
): void {
  for (const item of items) {
    // Nested folder
    if (item.item) {
      extractItems(item.item, results, item.auth || parentAuth, variables);
      continue;
    }

    // Request
    if (item.request) {
      const artifact = parseRequest(item.request, item.auth || parentAuth, variables);
      results.push(artifact);
    }
  }
}

/**
 * Parse a single Postman request
 */
function parseRequest(
  request: PostmanRequest,
  auth?: PostmanAuth,
  variables?: Map<string, string>
): ParsedArtifact {
  // Parse URL
  const url = resolveUrl(request.url, variables);
  const { baseUrl, queryParams } = parseUrl(url);

  // Parse headers
  const headers: Record<string, string> = {};
  if (request.header) {
    for (const h of request.header) {
      if (!h.disabled) {
        headers[h.key] = resolveVariables(h.value, variables);
      }
    }
  }

  // Parse body
  const { body, bodyType } = parseBody(request.body, variables);

  // Parse auth
  const resolvedAuth = resolveAuth(request.auth || auth, headers, variables);

  // Construct raw representation
  const raw = JSON.stringify(request, null, 2);

  return {
    source: 'postman',
    method: request.method.toUpperCase(),
    url: baseUrl,
    headers,
    body,
    bodyType,
    queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
    auth: resolvedAuth.type !== 'none' ? resolvedAuth : undefined,
    raw,
  };
}

/**
 * Resolve Postman URL to string
 */
function resolveUrl(url: string | PostmanUrl, variables?: Map<string, string>): string {
  if (typeof url === 'string') {
    return resolveVariables(url, variables);
  }

  if (url.raw) {
    return resolveVariables(url.raw, variables);
  }

  const protocol = url.protocol || 'https';
  const host = url.host?.join('.') || 'localhost';
  const path = url.path?.join('/') || '';

  let result = `${protocol}://${host}/${path}`;

  if (url.query?.length) {
    const params = url.query
      .filter(q => !q.disabled)
      .map(q => `${q.key}=${resolveVariables(q.value, variables)}`)
      .join('&');
    if (params) {
      result += `?${params}`;
    }
  }

  return resolveVariables(result, variables);
}

/**
 * Parse Postman body
 */
function parseBody(
  body: PostmanBody | undefined,
  variables?: Map<string, string>
): { body: unknown; bodyType: BodyType } {
  if (!body) {
    return { body: undefined, bodyType: 'none' };
  }

  switch (body.mode) {
    case 'raw': {
      const raw = resolveVariables(body.raw || '', variables);
      const language = body.options?.raw?.language;

      if (language === 'json' || raw.trim().startsWith('{') || raw.trim().startsWith('[')) {
        try {
          return { body: JSON.parse(raw), bodyType: 'json' };
        } catch {
          return { body: raw, bodyType: 'raw' };
        }
      }

      return { body: raw, bodyType: 'raw' };
    }

    case 'urlencoded': {
      const formData: Record<string, string> = {};
      if (body.urlencoded) {
        for (const item of body.urlencoded) {
          formData[item.key] = resolveVariables(item.value, variables);
        }
      }
      return { body: formData, bodyType: 'form' };
    }

    case 'formdata': {
      const formData: Record<string, string> = {};
      if (body.formdata) {
        for (const item of body.formdata) {
          if (item.type !== 'file') {
            formData[item.key] = resolveVariables(item.value, variables);
          }
        }
      }
      return { body: formData, bodyType: 'form' };
    }

    case 'graphql': {
      // GraphQL is typically JSON
      return { body: body.raw ? JSON.parse(body.raw) : {}, bodyType: 'json' };
    }

    default:
      return { body: undefined, bodyType: 'none' };
  }
}

/**
 * Resolve Postman authentication
 */
function resolveAuth(
  auth: PostmanAuth | undefined,
  headers: Record<string, string>,
  variables?: Map<string, string>
): { type: AuthType; value?: string; header?: string } {
  if (!auth || auth.type === 'noauth') {
    // Check headers for API key patterns
    for (const [key, value] of Object.entries(headers)) {
      const lowerKey = key.toLowerCase();
      if (lowerKey.includes('api-key') || lowerKey.includes('apikey') || lowerKey === 'x-api-key') {
        return { type: 'api-key', value, header: key };
      }
    }
    return { type: 'none' };
  }

  switch (auth.type) {
    case 'bearer': {
      const token = auth.bearer?.find(b => b.key === 'token')?.value;
      if (token) {
        const resolved = resolveVariables(token, variables);
        headers['Authorization'] = `Bearer ${resolved}`;
        return { type: 'bearer', value: resolved, header: 'Authorization' };
      }
      break;
    }

    case 'basic': {
      const username = auth.basic?.find(b => b.key === 'username')?.value || '';
      const password = auth.basic?.find(b => b.key === 'password')?.value || '';
      const resolved = Buffer.from(
        `${resolveVariables(username, variables)}:${resolveVariables(password, variables)}`
      ).toString('base64');
      headers['Authorization'] = `Basic ${resolved}`;
      return { type: 'basic', value: resolved, header: 'Authorization' };
    }

    case 'apikey': {
      const key = auth.apikey?.find(a => a.key === 'key')?.value || 'X-API-Key';
      const value = auth.apikey?.find(a => a.key === 'value')?.value || '';
      const resolved = resolveVariables(value, variables);
      headers[key] = resolved;
      return { type: 'api-key', value: resolved, header: key };
    }
  }

  return { type: 'none' };
}

/**
 * Resolve Postman variables in a string
 */
function resolveVariables(str: string, variables?: Map<string, string>): string {
  if (!variables || !str) {
    return str;
  }

  return str.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return variables.get(key) || match;
  });
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
