import { afterEach, expect, test, vi } from 'vitest';
import { AnthropicProvider, createProvider } from '../src/agent/providers.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function sentBody(chat: () => Promise<unknown>, fetchMock: ReturnType<typeof vi.fn>) {
  await chat();
  return JSON.parse(fetchMock.mock.calls[0][1].body);
}

function stubAnthropic() {
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify({ content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' })),
  );
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('ANTHROPIC_API_KEY', 'fixture-key');
  return fetchMock;
}

test.each([
  ['createProvider', () => createProvider('anthropic')],
  ['AnthropicProvider', () => new AnthropicProvider({})],
])('%s defaults to a supported model without sampling parameters', async (_name, build) => {
  const fetchMock = stubAnthropic();
  const body = await sentBody(() => build().chat({ messages: [], tools: [] }), fetchMock);
  expect(body.model).toBe('claude-sonnet-5-5');
  expect(body).not.toHaveProperty('temperature');
});

test('forwards an explicit temperature to Anthropic', async () => {
  const fetchMock = stubAnthropic();
  const body = await sentBody(
    () => createProvider('anthropic:claude-sonnet-4-6').chat({ messages: [], tools: [], temperature: 0 }),
    fetchMock,
  );
  expect(body.temperature).toBe(0);
});
