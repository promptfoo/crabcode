/**
 * OpenAPI/Swagger Parser
 *
 * Parses OpenAPI 3.x and Swagger 2.0 specifications.
 * Extracts endpoints with request schemas and examples.
 */

import type { ParsedArtifact, AuthType, BodyType } from '../types.js';

interface OpenAPISpec {
  openapi?: string;
  swagger?: string;
  info: {
    title: string;
    version: string;
  };
  servers?: Array<{ url: string }>;
  host?: string; // Swagger 2.0
  basePath?: string; // Swagger 2.0
  schemes?: string[]; // Swagger 2.0
  paths: Record<string, PathItem>;
  components?: {
    securitySchemes?: Record<string, SecurityScheme>;
    schemas?: Record<string, SchemaObject>;
  };
  securityDefinitions?: Record<string, SecurityScheme>; // Swagger 2.0
  security?: Array<Record<string, string[]>>;
}

interface PathItem {
  get?: Operation;
  post?: Operation;
  put?: Operation;
  patch?: Operation;
  delete?: Operation;
  options?: Operation;
  head?: Operation;
}

interface Operation {
  operationId?: string;
  summary?: string;
  description?: string;
  parameters?: Parameter[];
  requestBody?: RequestBody;
  responses?: Record<string, Response>;
  security?: Array<Record<string, string[]>>;
}

interface Parameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie' | 'body'; // 'body' is Swagger 2.0
  required?: boolean;
  schema?: SchemaObject;
  type?: string; // Swagger 2.0
  example?: unknown;
}

interface RequestBody {
  required?: boolean;
  content: Record<string, MediaType>;
}

interface MediaType {
  schema?: SchemaObject;
  example?: unknown;
  examples?: Record<string, { value: unknown }>;
}

interface SchemaObject {
  type?: string;
  properties?: Record<string, SchemaObject>;
  items?: SchemaObject;
  example?: unknown;
  default?: unknown;
  enum?: unknown[];
  $ref?: string;
  required?: string[];
}

interface SecurityScheme {
  type: 'apiKey' | 'http' | 'oauth2' | 'openIdConnect' | 'basic'; // 'basic' is Swagger 2.0
  scheme?: string; // 'bearer', 'basic'
  in?: 'header' | 'query' | 'cookie';
  name?: string;
}

interface Response {
  description: string;
  content?: Record<string, MediaType>;
}

interface ExtractedEndpoint {
  method: string;
  path: string;
  operation: Operation;
  security?: Array<Record<string, string[]>>;
}

/**
 * Parse OpenAPI spec JSON/YAML into ParsedArtifact(s)
 */
export function parseOpenAPI(content: string, options: { baseUrl?: string } = {}): ParsedArtifact[] {
  const spec: OpenAPISpec = JSON.parse(content);

  // Validate spec
  if (!spec.openapi && !spec.swagger) {
    throw new Error('Invalid OpenAPI/Swagger specification');
  }

  if (!spec.paths) {
    throw new Error('No paths found in OpenAPI specification');
  }

  // Determine base URL
  const baseUrl = options.baseUrl || getBaseUrl(spec);

  // Extract security schemes
  const securitySchemes = spec.components?.securitySchemes || spec.securityDefinitions || {};
  const globalSecurity = spec.security || [];

  // Extract endpoints
  const endpoints = extractEndpoints(spec.paths);
  const results: ParsedArtifact[] = [];

  for (const endpoint of endpoints) {
    const artifact = parseEndpoint(endpoint, baseUrl, securitySchemes, globalSecurity, spec);
    results.push(artifact);
  }

  return results;
}

/**
 * Parse a single OpenAPI endpoint (first one found)
 */
export function parseOpenAPISingle(content: string, options: { baseUrl?: string } = {}): ParsedArtifact {
  const items = parseOpenAPI(content, options);
  if (items.length === 0) {
    throw new Error('No valid endpoints found in OpenAPI specification');
  }
  return items[0];
}

/**
 * Get base URL from spec
 */
function getBaseUrl(spec: OpenAPISpec): string {
  // OpenAPI 3.x
  if (spec.servers?.length) {
    return spec.servers[0].url;
  }

  // Swagger 2.0
  if (spec.host) {
    const scheme = spec.schemes?.[0] || 'https';
    const basePath = spec.basePath || '';
    return `${scheme}://${spec.host}${basePath}`;
  }

  return 'http://localhost';
}

/**
 * Extract all endpoints from paths
 */
function extractEndpoints(paths: Record<string, PathItem>): ExtractedEndpoint[] {
  const endpoints: ExtractedEndpoint[] = [];
  const methods: (keyof PathItem)[] = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'];

  for (const [path, pathItem] of Object.entries(paths)) {
    for (const method of methods) {
      const operation = pathItem[method];
      if (operation) {
        endpoints.push({
          method: method.toUpperCase(),
          path,
          operation,
          security: operation.security,
        });
      }
    }
  }

  return endpoints;
}

/**
 * Parse a single endpoint into ParsedArtifact
 */
function parseEndpoint(
  endpoint: ExtractedEndpoint,
  baseUrl: string,
  securitySchemes: Record<string, SecurityScheme>,
  globalSecurity: Array<Record<string, string[]>>,
  spec: OpenAPISpec
): ParsedArtifact {
  const { method, path, operation, security } = endpoint;

  // Resolve URL with path parameters
  let resolvedPath = path;
  const pathParams = operation.parameters?.filter(p => p.in === 'path') || [];
  for (const param of pathParams) {
    const value = param.example || param.schema?.example || param.schema?.default || `{${param.name}}`;
    resolvedPath = resolvedPath.replace(`{${param.name}}`, String(value));
  }

  const fullUrl = `${baseUrl.replace(/\/$/, '')}${resolvedPath}`;

  // Parse headers from parameters
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const headerParams = operation.parameters?.filter(p => p.in === 'header') || [];
  for (const param of headerParams) {
    const value = param.example || param.schema?.example || param.schema?.default;
    if (value) {
      headers[param.name] = String(value);
    }
  }

  // Parse query parameters
  const queryParams: Record<string, string> = {};
  const queryParamDefs = operation.parameters?.filter(p => p.in === 'query') || [];
  for (const param of queryParamDefs) {
    const value = param.example || param.schema?.example || param.schema?.default;
    if (value !== undefined) {
      queryParams[param.name] = String(value);
    }
  }

  // Parse body
  const { body, bodyType } = parseRequestBody(operation, spec);

  // Parse auth
  const auth = resolveAuth(security || globalSecurity, securitySchemes, headers);

  // Build raw representation
  const raw = JSON.stringify({
    operationId: operation.operationId,
    summary: operation.summary,
    method,
    path,
  }, null, 2);

  return {
    source: 'openapi',
    method,
    url: fullUrl,
    headers,
    body,
    bodyType,
    queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
    auth: auth.type !== 'none' ? auth : undefined,
    raw,
  };
}

/**
 * Parse request body from operation
 */
function parseRequestBody(
  operation: Operation,
  spec: OpenAPISpec
): { body: unknown; bodyType: BodyType } {
  // OpenAPI 3.x requestBody
  if (operation.requestBody?.content) {
    const content = operation.requestBody.content;

    // Prefer JSON
    const jsonContent = content['application/json'];
    if (jsonContent) {
      const body = jsonContent.example
        || Object.values(jsonContent.examples || {})[0]?.value
        || generateExampleFromSchema(jsonContent.schema, spec);

      return { body, bodyType: 'json' };
    }

    // Form data
    const formContent = content['application/x-www-form-urlencoded'];
    if (formContent) {
      const body = generateExampleFromSchema(formContent.schema, spec);
      return { body, bodyType: 'form' };
    }
  }

  // Swagger 2.0 body parameter
  const bodyParam = operation.parameters?.find(p => p.in === 'body');
  if (bodyParam) {
    const body = bodyParam.example
      || bodyParam.schema?.example
      || generateExampleFromSchema(bodyParam.schema, spec);

    return { body, bodyType: 'json' };
  }

  return { body: undefined, bodyType: 'none' };
}

/**
 * Generate example from schema
 */
function generateExampleFromSchema(
  schema: SchemaObject | undefined,
  spec: OpenAPISpec,
  depth = 0
): unknown {
  if (!schema || depth > 5) {
    return undefined;
  }

  // Handle $ref
  if (schema.$ref) {
    const refPath = schema.$ref.replace('#/components/schemas/', '').replace('#/definitions/', '');
    const refSchema = spec.components?.schemas?.[refPath];
    if (refSchema) {
      return generateExampleFromSchema(refSchema, spec, depth + 1);
    }
    return {};
  }

  // Use example if provided
  if (schema.example !== undefined) {
    return schema.example;
  }

  // Use default if provided
  if (schema.default !== undefined) {
    return schema.default;
  }

  // Use first enum value
  if (schema.enum?.length) {
    return schema.enum[0];
  }

  // Generate based on type
  switch (schema.type) {
    case 'string':
      return 'example';
    case 'number':
    case 'integer':
      return 0;
    case 'boolean':
      return true;
    case 'array':
      if (schema.items) {
        const item = generateExampleFromSchema(schema.items, spec, depth + 1);
        return item !== undefined ? [item] : [];
      }
      return [];
    case 'object':
      if (schema.properties) {
        const obj: Record<string, unknown> = {};
        for (const [key, propSchema] of Object.entries(schema.properties)) {
          const value = generateExampleFromSchema(propSchema, spec, depth + 1);
          if (value !== undefined) {
            obj[key] = value;
          }
        }
        return obj;
      }
      return {};
    default:
      return undefined;
  }
}

/**
 * Resolve authentication from security requirements
 */
function resolveAuth(
  security: Array<Record<string, string[]>>,
  securitySchemes: Record<string, SecurityScheme>,
  headers: Record<string, string>
): { type: AuthType; value?: string; header?: string } {
  if (!security.length) {
    return { type: 'none' };
  }

  // Use first security requirement
  const firstReq = security[0];
  const schemeName = Object.keys(firstReq)[0];
  const scheme = securitySchemes[schemeName];

  if (!scheme) {
    return { type: 'none' };
  }

  switch (scheme.type) {
    case 'http':
      if (scheme.scheme === 'bearer') {
        headers['Authorization'] = 'Bearer <token>';
        return { type: 'bearer', value: '<token>', header: 'Authorization' };
      }
      if (scheme.scheme === 'basic') {
        headers['Authorization'] = 'Basic <credentials>';
        return { type: 'basic', value: '<credentials>', header: 'Authorization' };
      }
      break;

    case 'basic': // Swagger 2.0
      headers['Authorization'] = 'Basic <credentials>';
      return { type: 'basic', value: '<credentials>', header: 'Authorization' };

    case 'apiKey':
      const headerName = scheme.name || 'X-API-Key';
      if (scheme.in === 'header') {
        headers[headerName] = '<api-key>';
        return { type: 'api-key', value: '<api-key>', header: headerName };
      }
      break;
  }

  return { type: 'none' };
}
