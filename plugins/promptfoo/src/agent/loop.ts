/**
 * Target Discovery Agent Loop
 *
 * Orchestrates the LLM and tools to discover target communication
 * and generate working promptfoo configs.
 */

import { probe } from '../tools/probe.js';
import { probeWs } from '../tools/probe-ws.js';
import { generateConfig, writeProviderFile } from '../generator/config.js';
import { getDiscoveryPrompt } from './system-prompt.js';
import { toOpenAITools, toAnthropicTools } from './tools.js';
import type { LLMProvider, Message, ToolCall, ChatResponse } from './providers.js';
import type { DiscoveryResult } from '../types.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export interface AgentOptions {
  context: string; // Raw artifact or description
  provider: LLMProvider;
  maxTurns?: number;
  outputDir?: string;
  verbose?: boolean;
  onTurn?: (turn: TurnInfo) => void;
}

export interface TurnInfo {
  turn: number;
  toolCalls: ToolCall[];
  toolResults: ToolResult[];
}

export interface ToolResult {
  toolCallId: string;
  name: string;
  result: unknown;
  error?: string;
}

interface AgentState {
  configFile?: string;
  providerFile?: string;
  envVars: Record<string, string>;
  verified: boolean;
  logs: string[];
}

/**
 * Run the target discovery agent
 */
export async function runDiscoveryAgent(options: AgentOptions): Promise<DiscoveryResult> {
  const { context, provider, maxTurns = 30, outputDir = '.', verbose, onTurn } = options;

  const state: AgentState = {
    envVars: {},
    verified: false,
    logs: [],
  };

  let done = false;
  let summary = '';

  // Build initial messages
  const messages: Message[] = [
    { role: 'system', content: getDiscoveryPrompt() },
    {
      role: 'user',
      content: `Analyze this target and generate a working promptfoo configuration:

---
${context}
---

Steps:
1. Understand the target from the information above
2. Send a probe to verify connectivity
3. Identify the prompt field and response field
4. Generate the config (and provider file if needed)
5. Verify it works
6. Call done() when complete`,
    },
  ];

  // Detect provider type for tool format
  const tools = isAnthropicProvider(provider) ? toAnthropicTools() : toOpenAITools();

  for (let turn = 1; turn <= maxTurns && !done; turn++) {
    if (verbose) {
      console.log(`\n--- Turn ${turn} ---`);
    }

    // 1. Call LLM
    let response: ChatResponse;
    try {
      response = await provider.chat({ messages, tools });
    } catch (error) {
      state.logs.push(`Turn ${turn}: LLM error - ${(error as Error).message}`);
      return {
        success: false,
        error: (error as Error).message,
        logs: state.logs,
      };
    }

    // 2. Handle text response (no tool calls)
    if (response.content && !response.toolCalls.length) {
      if (verbose) {
        console.log('Agent:', response.content);
      }
      state.logs.push(`Turn ${turn}: ${response.content.slice(0, 100)}...`);
      messages.push({ role: 'assistant', content: response.content });

      if (response.finishReason === 'stop') {
        messages.push({
          role: 'user',
          content: 'Continue with the discovery process or call done() if finished.',
        });
      }
      continue;
    }

    // 3. Execute tool calls
    const toolResults: ToolResult[] = [];

    for (const toolCall of response.toolCalls) {
      if (verbose) {
        console.log(`Tool: ${toolCall.name}(${JSON.stringify(toolCall.arguments).slice(0, 100)}...)`);
      }

      const result = await executeTool(toolCall, state, outputDir);
      toolResults.push(result);

      state.logs.push(`Turn ${turn}: ${toolCall.name} -> ${result.error || 'success'}`);

      if (verbose) {
        const resultStr = JSON.stringify(result.result);
        console.log(`Result: ${resultStr.slice(0, 200)}${resultStr.length > 200 ? '...' : ''}`);
      }

      // Check for done signal
      if (toolCall.name === 'done') {
        done = true;
        const args = toolCall.arguments as { summary: string };
        summary = args.summary;
      }
    }

    // 4. Add assistant message with tool calls
    messages.push({
      role: 'assistant',
      content: response.content || '',
      toolCalls: response.toolCalls,
    });

    // 5. Add tool results
    for (const result of toolResults) {
      messages.push({
        role: 'tool',
        content: JSON.stringify(result.result),
        toolCallId: result.toolCallId,
      });
    }

    // 6. Callback
    if (onTurn) {
      onTurn({ turn, toolCalls: response.toolCalls, toolResults });
    }
  }

  // Read generated files if they exist
  let config: string | undefined;
  let providerCode: string | undefined;

  if (state.configFile && fs.existsSync(state.configFile)) {
    config = fs.readFileSync(state.configFile, 'utf-8');
  }
  if (state.providerFile && fs.existsSync(state.providerFile)) {
    providerCode = fs.readFileSync(state.providerFile, 'utf-8');
  }

  return {
    success: done && state.verified,
    config: config ? (JSON.parse(JSON.stringify({ raw: config })) as any) : undefined,
    providerFile: state.providerFile,
    providerCode,
    error: !done ? 'Agent did not complete' : (!state.verified ? 'Config not verified' : undefined),
    logs: state.logs,
  };
}

/**
 * Execute a single tool call
 */
async function executeTool(
  toolCall: ToolCall,
  state: AgentState,
  outputDir: string
): Promise<ToolResult> {
  const { name, arguments: args, id } = toolCall;

  try {
    let result: unknown;

    switch (name) {
      case 'probe': {
        const { url, method, body, headers } = args as {
          url: string;
          method?: string;
          body?: unknown;
          headers?: Record<string, string>;
        };
        result = await probe({ url, method, body, headers });
        break;
      }

      case 'probe_ws': {
        const { url, message, headers, timeout } = args as {
          url: string;
          message: string | object;
          headers?: Record<string, string>;
          timeout?: number;
        };
        result = await probeWs({ url, message, headers, timeout });
        break;
      }

      case 'write_config': {
        const { description, providerType, providerConfig, envVars, filename } = args as {
          description: string;
          providerType: 'http' | 'file:./provider.js' | 'file:./provider.py';
          providerConfig: Record<string, unknown>;
          envVars?: Record<string, string>;
          filename?: string;
        };

        const generated = generateConfig({
          description,
          providerType,
          providerConfig,
          envVars,
          outputDir,
          filename,
        });

        state.configFile = generated.filePath;
        state.envVars = { ...state.envVars, ...generated.envVars };

        result = {
          success: true,
          filePath: generated.filePath,
          envVars: generated.envVars,
        };
        break;
      }

      case 'write_provider': {
        const { code, filename } = args as {
          code: string;
          filename: string;
          language: string;
        };

        const filePath = writeProviderFile({ code, filename, outputDir });
        state.providerFile = filePath;

        result = { success: true, filePath };
        break;
      }

      case 'verify': {
        const { configFile } = args as {
          configFile?: string;
        };

        const configPath = configFile || state.configFile || 'promptfooconfig.yaml';
        const steps: string[] = [];

        // Step 1: Direct provider smoke + session test
        const providerPath = path.join(outputDir, 'provider.js');
        if (fs.existsSync(providerPath)) {
          // Install dependencies first if package.json exists
          const packageJsonPath = path.join(outputDir, 'package.json');
          if (fs.existsSync(packageJsonPath)) {
            try {
              execSync(`cd "${outputDir}" && npm install --silent 2>&1`, {
                timeout: 60000,
                encoding: 'utf-8',
              });
            } catch {
              // Ignore install errors, will surface in import
            }
          }

          const providerUrl = pathToFileURL(path.resolve(providerPath)).href + `?t=${Date.now()}`;
          const mod = await import(providerUrl);
          const ProviderClass = mod.default;
          const instance = new ProviderClass({ config: {} });

          // Smoke test
          const r1 = await instance.callApi('Hello, this is a test message', { vars: {} }, {});
          if (!r1 || !r1.output || r1.error) {
            const err = r1?.error || 'empty output';
            steps.push(`Smoke test FAILED: ${err}`);
            state.verified = false;
            result = { success: false, error: `Provider smoke test failed: ${err}`, steps };
            break;
          }
          steps.push(`Smoke test PASSED: got ${r1.output.length} chars`);

          // Session test — second call, passing sessionId from first response (mimics promptfoo strategy flow)
          const sessionContext = r1.sessionId
            ? { vars: { sessionId: r1.sessionId } }
            : { vars: {} };
          const r2 = await instance.callApi('Follow up question', sessionContext, {});
          if (!r2 || !r2.output || r2.error) {
            const err = r2?.error || 'empty output';
            steps.push(`Session test FAILED: ${err}`);
            state.verified = false;
            result = { success: false, error: `Provider session test failed: ${err}`, steps };
            break;
          }
          steps.push(`Session test PASSED: got ${r2.output.length} chars${r1.sessionId ? `, sessionId: ${r1.sessionId}` : ''}`);
        }

        // Step 2: Run promptfoo eval
        try {
          const output = execSync(
            `cd "${outputDir}" && npx promptfoo eval -c "${configPath}" --no-progress-bar 2>&1`,
            { timeout: 120000, encoding: 'utf-8' }
          );

          const passMatch = output.match(/(\d+) passed/);
          const failMatch = output.match(/(\d+) failed/);
          const errorMatch = output.match(/(\d+) error/);
          const passed = passMatch ? parseInt(passMatch[1]) : 0;
          const failed = failMatch ? parseInt(failMatch[1]) : 0;
          const errors = errorMatch ? parseInt(errorMatch[1]) : 0;

          const hasConfigError = output.includes('Error loading config') || output.includes('Invalid config');

          if (passed === 0 && failed === 0) {
            steps.push('Eval FAILED: zero tests ran');
            state.verified = false;
          } else if (failed > 0 || errors > 0 || hasConfigError) {
            steps.push(`Eval FAILED: ${passed} passed, ${failed} failed, ${errors} errors`);
            state.verified = false;
          } else {
            steps.push(`Eval PASSED: ${passed} passed, ${failed} failed`);
            state.verified = true;
          }

          result = {
            success: state.verified,
            output: output.slice(0, 1000),
            steps,
          };
        } catch (error) {
          const err = error as { message: string; stdout?: string; stderr?: string };
          const stdout = err.stdout || '';

          const passMatch = stdout.match(/(\d+) passed/);
          const passed = passMatch ? parseInt(passMatch[1]) : 0;

          if (passed > 0 && !stdout.includes('failed')) {
            steps.push(`Eval PASSED (non-zero exit): ${passed} passed`);
            state.verified = true;
          } else {
            steps.push(`Eval FAILED: ${err.message.slice(0, 200)}`);
            state.verified = false;
          }

          result = {
            success: state.verified,
            error: state.verified ? undefined : err.message,
            stdout: stdout.slice(0, 1000),
            steps,
          };
        }
        break;
      }

      case 'done': {
        const { summary, configFile, providerFile, envVarsNeeded, verified } = args as {
          summary: string;
          configFile: string;
          providerFile?: string;
          envVarsNeeded?: Record<string, string>;
          verified: boolean;
        };

        state.verified = verified;
        if (envVarsNeeded) {
          state.envVars = { ...state.envVars, ...envVarsNeeded };
        }

        result = {
          success: true,
          summary,
          configFile,
          providerFile,
          verified,
        };
        break;
      }

      default:
        result = { error: `Unknown tool: ${name}` };
    }

    return { toolCallId: id, name, result };
  } catch (error) {
    return {
      toolCallId: id,
      name,
      result: null,
      error: (error as Error).message,
    };
  }
}

/**
 * Check if provider is Anthropic (duck typing)
 */
function isAnthropicProvider(provider: LLMProvider): boolean {
  return provider.constructor.name === 'AnthropicProvider';
}
