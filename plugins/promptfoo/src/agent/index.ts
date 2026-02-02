/**
 * Agent exports
 */

export { runDiscoveryAgent } from './loop.js';
export type { AgentOptions, TurnInfo, ToolResult } from './loop.js';
export { getDiscoveryPrompt, DISCOVERY_SYSTEM_PROMPT } from './system-prompt.js';
export { toolDefinitions, toOpenAITools, toAnthropicTools } from './tools.js';
export { createProvider, OpenAIProvider, AnthropicProvider } from './providers.js';
export type { LLMProvider, Message, ToolCall, ChatOptions, ChatResponse } from './providers.js';
