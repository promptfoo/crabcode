/**
 * LLM Provider Abstraction
 *
 * Allows the agent to work with OpenAI or Anthropic.
 */

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ChatOptions {
  messages: Message[];
  tools: unknown[];
  maxTokens?: number;
  temperature?: number;
}

export interface ChatResponse {
  content: string | null;
  toolCalls: ToolCall[];
  finishReason: 'stop' | 'tool_calls' | 'length' | 'error';
}

export interface LLMProvider {
  chat(options: ChatOptions): Promise<ChatResponse>;
}

/**
 * OpenAI Provider
 */
export class OpenAIProvider implements LLMProvider {
  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor(options: { apiKey?: string; model?: string; baseUrl?: string }) {
    this.apiKey = options.apiKey || process.env.OPENAI_API_KEY || '';
    this.model = options.model || 'gpt-4o';
    this.baseUrl = options.baseUrl || 'https://api.openai.com/v1';

    if (!this.apiKey) {
      throw new Error('OpenAI API key required. Set OPENAI_API_KEY env var.');
    }
  }

  async chat(options: ChatOptions): Promise<ChatResponse> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: options.messages.map((m) => this.toOpenAIMessage(m)),
        tools: options.tools,
        ...(this.model.startsWith('gpt-5') || this.model.startsWith('o1') || this.model.startsWith('o3')
          ? { max_completion_tokens: options.maxTokens || 4096 }
          : { max_tokens: options.maxTokens || 4096 }),
        ...(this.model.startsWith('gpt-5') || this.model.startsWith('o1') || this.model.startsWith('o3')
          ? {}
          : { temperature: options.temperature ?? 0.7 }),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const data = (await response.json()) as {
      choices: Array<{
        message: {
          content: string | null;
          tool_calls?: Array<{
            id: string;
            function: { name: string; arguments: string };
          }>;
        };
        finish_reason: string;
      }>;
    };
    const choice = data.choices[0];

    return {
      content: choice.message.content,
      toolCalls:
        choice.message.tool_calls?.map((tc) => ({
          id: tc.id,
          name: tc.function.name,
          arguments: JSON.parse(tc.function.arguments),
        })) || [],
      finishReason: this.mapFinishReason(choice.finish_reason),
    };
  }

  private toOpenAIMessage(m: Message): Record<string, unknown> {
    if (m.role === 'tool') {
      return {
        role: 'tool',
        content: m.content,
        tool_call_id: m.toolCallId,
      };
    }
    if (m.role === 'assistant' && m.toolCalls?.length) {
      return {
        role: 'assistant',
        content: m.content,
        tool_calls: m.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
        })),
      };
    }
    return { role: m.role, content: m.content };
  }

  private mapFinishReason(reason: string): ChatResponse['finishReason'] {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'tool_calls':
        return 'tool_calls';
      case 'length':
        return 'length';
      default:
        return 'error';
    }
  }
}

/**
 * Anthropic Provider
 */
export class AnthropicProvider implements LLMProvider {
  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor(options: { apiKey?: string; model?: string; baseUrl?: string }) {
    this.apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY || '';
    this.model = options.model || 'claude-sonnet-4-20250514';
    this.baseUrl = options.baseUrl || 'https://api.anthropic.com/v1';

    if (!this.apiKey) {
      throw new Error('Anthropic API key required. Set ANTHROPIC_API_KEY env var.');
    }
  }

  async chat(options: ChatOptions): Promise<ChatResponse> {
    const systemMessage = options.messages.find((m) => m.role === 'system');
    const nonSystemMessages = options.messages.filter((m) => m.role !== 'system');

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        system: systemMessage?.content || '',
        messages: nonSystemMessages.map((m) => this.toAnthropicMessage(m)),
        tools: options.tools,
        max_tokens: options.maxTokens || 4096,
        temperature: options.temperature ?? 0.7,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${error}`);
    }

    const data = (await response.json()) as {
      content: Array<
        | { type: 'text'; text: string }
        | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
      >;
      stop_reason: string;
    };

    const textContent = data.content
      .filter((c) => c.type === 'text')
      .map((c) => ('text' in c ? c.text : ''))
      .join('');

    const toolCalls = data.content
      .filter((c) => c.type === 'tool_use')
      .map((c) => {
        if (c.type === 'tool_use') {
          return { id: c.id, name: c.name, arguments: c.input };
        }
        return null;
      })
      .filter((tc): tc is ToolCall => tc !== null);

    return {
      content: textContent || null,
      toolCalls,
      finishReason: this.mapFinishReason(data.stop_reason),
    };
  }

  private toAnthropicMessage(m: Message): Record<string, unknown> {
    if (m.role === 'tool') {
      return {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: m.toolCallId,
            content: m.content,
          },
        ],
      };
    }
    if (m.role === 'assistant' && m.toolCalls?.length) {
      return {
        role: 'assistant',
        content: m.toolCalls.map((tc) => ({
          type: 'tool_use',
          id: tc.id,
          name: tc.name,
          input: tc.arguments,
        })),
      };
    }
    return { role: m.role, content: m.content };
  }

  private mapFinishReason(reason: string): ChatResponse['finishReason'] {
    switch (reason) {
      case 'end_turn':
        return 'stop';
      case 'tool_use':
        return 'tool_calls';
      case 'max_tokens':
        return 'length';
      default:
        return 'error';
    }
  }
}

/**
 * Create provider from string identifier
 */
export function createProvider(provider: string): LLMProvider {
  const [type, model] = provider.split(':');

  switch (type) {
    case 'openai':
      return new OpenAIProvider({ model: model || 'gpt-4o' });
    case 'anthropic':
      return new AnthropicProvider({ model: model || 'claude-sonnet-4-20250514' });
    default:
      throw new Error(`Unknown provider: ${type}. Supported: openai, anthropic`);
  }
}
