import type { DocumentInventoryItem, ReviewIssue, TaxpayerProfile } from '../types.js';

const OPENAI_API_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_AGENT_MODEL = process.env.CRAB_TAX_AGENT_MODEL || 'gpt-5.4';

interface ResearchStrategy {
  docId: string;
  formTypeGuess: string;
  recommendedHandling: string;
  confidence: 'high' | 'medium' | 'low';
  blocking: boolean;
  sourceSummary: string;
}

interface AgentResult {
  summary: string;
  strategies: ResearchStrategy[];
}

export async function runResearchAgent(args: {
  profile: TaxpayerProfile;
  documents: DocumentInventoryItem[];
  existingIssues: ReviewIssue[];
  onProgress?: (message: string) => void;
}): Promise<AgentResult | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    args.onProgress?.('Research agent skipped because OPENAI_API_KEY is not set.');
    return null;
  }

  const targetDocuments = args.documents.filter(
    (document) =>
      document.detectedFormType === 'unknown' || document.extractionStatus === 'unsupported'
  );
  if (targetDocuments.length === 0) {
    args.onProgress?.('Research agent skipped because there are no unknown or unsupported documents.');
    return null;
  }

  args.onProgress?.(`Research agent starting for ${targetDocuments.length} document(s).`);

  const tools = [
    {
      type: 'function',
      name: 'research_authority',
      description:
        'Research unknown tax documents using official IRS and California FTB sources only.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'A focused research query about the unknown or unsupported tax form.',
          },
        },
        required: ['query'],
        additionalProperties: false,
      },
      strict: true,
    },
    {
      type: 'function',
      name: 'record_strategy',
      description:
        'Record a handling strategy for a specific document after researching authoritative sources.',
      parameters: {
        type: 'object',
        properties: {
          docId: { type: 'string' },
          formTypeGuess: { type: 'string' },
          recommendedHandling: { type: 'string' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          blocking: { type: 'boolean' },
          sourceSummary: { type: 'string' },
        },
        required: [
          'docId',
          'formTypeGuess',
          'recommendedHandling',
          'confidence',
          'blocking',
          'sourceSummary',
        ],
        additionalProperties: false,
      },
      strict: true,
    },
    {
      type: 'function',
      name: 'done',
      description: 'Finish the document research pass once all target documents have strategies.',
      parameters: {
        type: 'object',
        properties: {
          summary: {
            type: 'string',
            description: 'Short summary of the research results.',
          },
        },
        required: ['summary'],
        additionalProperties: false,
      },
      strict: true,
    },
  ];

  const strategies: ResearchStrategy[] = [];
  let summary = '';
  let input = [
    {
      role: 'system',
      content:
        'You are a bounded tax document research agent. Your job is to research unknown or unsupported tax documents using official IRS and California FTB sources only, then propose handling strategies. You must not invent tax law. Use research_authority before record_strategy when the form is unknown. Mark blocking=true when deterministic tax computation should not proceed without new code or human review.',
    },
    {
      role: 'user',
      content: buildAgentContext(args.profile, targetDocuments, args.existingIssues),
    },
  ] as Array<Record<string, unknown>>;

  for (let turn = 0; turn < 8; turn++) {
    args.onProgress?.(`Research agent turn ${turn + 1}: requesting next action.`);
    const response = await fetchWithTimeout(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: DEFAULT_AGENT_MODEL,
        input,
        tools,
        tool_choice: 'auto',
      }),
    }, 45000);

    if (!response.ok) {
      throw new Error(`Research agent failed: ${response.status} ${await response.text()}`);
    }

    const payload = (await response.json()) as {
      output?: Array<{
        type?: string;
        name?: string;
        call_id?: string;
        arguments?: string;
      }>;
      output_text?: string;
    };

    const toolCalls = (payload.output || []).filter((item) => item.type === 'function_call');
    args.onProgress?.(
      `Research agent turn ${turn + 1}: received ${toolCalls.length} tool call(s).`
    );
    if (toolCalls.length === 0) {
      if (payload.output_text) {
        summary = payload.output_text;
        args.onProgress?.(`Research agent turn ${turn + 1}: received final text response.`);
      }
      break;
    }

    const outputs: Array<Record<string, unknown>> = [];

    for (const toolCall of toolCalls) {
      const argsJson = JSON.parse(toolCall.arguments || '{}') as Record<string, unknown>;
      if (toolCall.name === 'research_authority') {
        const query = String(argsJson.query || '');
        args.onProgress?.(`Research agent: researching authority for query "${query}".`);
        const result = await researchAuthority(query);
        outputs.push({
          type: 'function_call_output',
          call_id: toolCall.call_id,
          output: JSON.stringify(result),
        });
      } else if (toolCall.name === 'record_strategy') {
        args.onProgress?.(
          `Research agent: recorded strategy for ${String(argsJson.docId || 'unknown-doc')}.`
        );
        strategies.push({
          docId: String(argsJson.docId || ''),
          formTypeGuess: String(argsJson.formTypeGuess || ''),
          recommendedHandling: String(argsJson.recommendedHandling || ''),
          confidence:
            argsJson.confidence === 'low' || argsJson.confidence === 'medium'
              ? argsJson.confidence
              : 'high',
          blocking: Boolean(argsJson.blocking),
          sourceSummary: String(argsJson.sourceSummary || ''),
        });
        outputs.push({
          type: 'function_call_output',
          call_id: toolCall.call_id,
          output: 'recorded',
        });
      } else if (toolCall.name === 'done') {
        summary = String(argsJson.summary || '');
        args.onProgress?.('Research agent: marked the research pass as done.');
        outputs.push({
          type: 'function_call_output',
          call_id: toolCall.call_id,
          output: 'done',
        });
      }
    }

    input = [...input, ...(payload.output || []), ...outputs];
    if (summary) {
      break;
    }
  }

  return {
    summary,
    strategies,
  };
}

async function researchAuthority(query: string): Promise<{ summary: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { summary: 'No OpenAI API key available for authority research.' };
  }

  const response = await fetchWithTimeout(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: DEFAULT_AGENT_MODEL,
      tools: [{ type: 'web_search' }],
      input: `Research this tax question using official IRS and California FTB sources only. If the document is not California-specific, prefer IRS sources. Summarize the likely form type, what schedule or return area it affects, and whether deterministic code should block until dedicated handling exists.\n\nQuery: ${query}`,
    }),
  }, 45000);

  if (!response.ok) {
    throw new Error(`Authority research failed: ${response.status} ${await response.text()}`);
  }

  const payload = (await response.json()) as { output_text?: string };
  return {
    summary: payload.output_text || '',
  };
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function buildAgentContext(
  profile: TaxpayerProfile,
  documents: DocumentInventoryItem[],
  issues: ReviewIssue[]
): string {
  const documentSummary = documents
    .map(
      (document) =>
        `- ${document.id}: ${document.fileName} (detected=${document.detectedFormType}, extractionStatus=${document.extractionStatus})`
    )
    .join('\n');
  const issueSummary = issues
    .map((issue) => `- ${issue.code}: ${issue.message}`)
    .join('\n');

  return [
    `Tax year: ${profile.taxYear}`,
    `Filing status: ${profile.filingStatus}`,
    'Research these documents and propose handling strategies.',
    '',
    'Documents:',
    documentSummary || '- none',
    '',
    'Existing issues:',
    issueSummary || '- none',
    '',
    'For each target document, record a strategy.',
  ].join('\n');
}
