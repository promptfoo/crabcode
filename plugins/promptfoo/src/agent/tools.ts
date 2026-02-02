/**
 * Tool Definitions for Target Discovery Agent
 *
 * JSON schemas that tell the LLM what tools are available.
 */

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
      default?: unknown;
      items?: { type: string };
    }>;
    required?: string[];
  };
}

export const toolDefinitions: ToolDefinition[] = [
  {
    name: 'probe',
    description: 'Send an HTTP request to the target endpoint and get the raw response. Use this to test connectivity and understand the response format.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The target URL to send the request to',
        },
        method: {
          type: 'string',
          description: 'HTTP method',
          enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
          default: 'GET',
        },
        body: {
          type: 'object',
          description: 'Request body as JSON object',
        },
        headers: {
          type: 'object',
          description: 'HTTP headers as key-value pairs',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'probe_ws',
    description: 'Connect to a WebSocket endpoint and send a message. Returns the response message(s).',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'WebSocket URL (ws:// or wss://)',
        },
        message: {
          type: 'string',
          description: 'Message to send (will be JSON.stringify-ed if object)',
        },
        headers: {
          type: 'object',
          description: 'Connection headers',
        },
        timeout: {
          type: 'number',
          description: 'Response timeout in ms (default: 10000)',
        },
      },
      required: ['url', 'message'],
    },
  },
  {
    name: 'write_config',
    description: 'Write the promptfoo YAML configuration file. Call this when you have determined the correct provider configuration.',
    parameters: {
      type: 'object',
      properties: {
        filename: {
          type: 'string',
          description: 'Output filename (default: promptfooconfig.yaml)',
          default: 'promptfooconfig.yaml',
        },
        description: {
          type: 'string',
          description: 'Human-readable description of the target',
        },
        providerType: {
          type: 'string',
          description: 'Provider type: "http" for built-in, or "file:./provider.js" for custom',
          enum: ['http', 'file:./provider.js', 'file:./provider.py'],
        },
        providerConfig: {
          type: 'object',
          description: 'Provider configuration (url, method, headers, body, responseParser, etc.)',
        },
        envVars: {
          type: 'object',
          description: 'Environment variables needed (key: description)',
        },
      },
      required: ['description', 'providerType', 'providerConfig'],
    },
  },
  {
    name: 'write_provider',
    description: 'Write a custom provider file (JavaScript or Python) for complex targets like WebSocket, polling, or session-based.',
    parameters: {
      type: 'object',
      properties: {
        filename: {
          type: 'string',
          description: 'Filename (provider.js or provider.py)',
          enum: ['provider.js', 'provider.py'],
        },
        code: {
          type: 'string',
          description: 'The complete provider code',
        },
        language: {
          type: 'string',
          description: 'Programming language',
          enum: ['javascript', 'python'],
        },
      },
      required: ['filename', 'code', 'language'],
    },
  },
  {
    name: 'verify',
    description: 'Run a mini redteam test to verify the configuration works. This sends a few test prompts through the target.',
    parameters: {
      type: 'object',
      properties: {
        configFile: {
          type: 'string',
          description: 'Path to the config file to verify (default: promptfooconfig.yaml)',
          default: 'promptfooconfig.yaml',
        },
        numTests: {
          type: 'number',
          description: 'Number of test prompts to send (default: 3)',
          default: 3,
        },
      },
    },
  },
  {
    name: 'done',
    description: 'Signal that you have finished target discovery. Call this after successfully writing and verifying the config.',
    parameters: {
      type: 'object',
      properties: {
        summary: {
          type: 'string',
          description: 'Summary of what was discovered and configured',
        },
        configFile: {
          type: 'string',
          description: 'Path to the generated config file',
        },
        providerFile: {
          type: 'string',
          description: 'Path to custom provider file (if created)',
        },
        envVarsNeeded: {
          type: 'object',
          description: 'Environment variables that need to be set before running',
        },
        verified: {
          type: 'boolean',
          description: 'Whether the config was verified to work',
        },
      },
      required: ['summary', 'configFile', 'verified'],
    },
  },
];

/**
 * Convert to OpenAI tool format
 */
export function toOpenAITools() {
  return toolDefinitions.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

/**
 * Convert to Anthropic tool format
 */
export function toAnthropicTools() {
  return toolDefinitions.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters,
  }));
}
