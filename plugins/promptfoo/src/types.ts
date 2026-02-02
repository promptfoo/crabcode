/**
 * Core types for target discovery
 */

// Auth types
export type AuthType = 'bearer' | 'basic' | 'api-key' | 'custom' | 'none';

// Body types
export type BodyType = 'json' | 'form' | 'raw' | 'none';

// Transport types
export type TransportType = 'http' | 'websocket' | 'sse' | 'polling';

// Parsed artifact from curl/burp/postman/openapi/txt
export interface ParsedArtifact {
  source: 'curl' | 'burp' | 'postman' | 'openapi' | 'text';
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: unknown;
  bodyType: BodyType;
  queryParams?: Record<string, string>;
  auth?: {
    type: AuthType;
    value?: string;
    header?: string;
  };
  cookies?: Record<string, string>;
  raw: string;
}

// Discovered target profile
export interface TargetProfile {
  name: string;
  transport: TransportType;
  url: string;
  method: string;
  headers: Record<string, string>;
  bodyTemplate: unknown;
  promptField: string; // JSONPath to where prompt goes
  responseField: string; // JSONPath to where response comes from
  auth?: {
    type: AuthType;
    envVar?: string; // e.g., TARGET_API_KEY
    header?: string;
  };
  // For async/polling targets
  polling?: {
    startEndpoint: string;
    pollEndpoint: string;
    idField: string;
    statusField: string;
    resultField: string;
    completedValue: string;
  };
  // For WebSocket targets
  websocket?: {
    messageFormat: 'json' | 'text';
    sendTemplate: unknown;
    responsePath: string;
  };
  verified: boolean;
  verifiedAt?: string;
}

// Generated promptfoo config
export interface PromptfooConfig {
  description: string;
  providers: ProviderConfig[];
  defaultTest?: {
    assert?: AssertConfig[];
  };
  tests?: TestConfig[];
  redteam?: RedteamConfig;
}

export interface ProviderConfig {
  id?: string;
  file?: string;
  config?: Record<string, unknown>;
}

export interface AssertConfig {
  type: string;
  metric?: string;
  value?: unknown;
}

export interface TestConfig {
  vars?: Record<string, string>;
  assert?: AssertConfig[];
}

export interface RedteamConfig {
  plugins: string[];
  strategies: StrategyConfig[];
  numTests?: number;
}

export interface StrategyConfig {
  id: string;
  config?: Record<string, unknown>;
}

// Agent result
export interface DiscoveryResult {
  success: boolean;
  profile?: TargetProfile;
  config?: PromptfooConfig;
  providerFile?: string;
  providerCode?: string;
  error?: string;
  logs: string[];
}
