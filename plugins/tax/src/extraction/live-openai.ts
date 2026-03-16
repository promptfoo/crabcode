import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DocumentInventoryItem, DocumentType, ExtractedDocument } from '../types.js';

const OPENAI_API_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_MODEL = process.env.CRAB_TAX_MODEL || 'gpt-5.4';

const SUPPORTED_LIVE_TYPES = new Set<DocumentType>([
  'W-2',
  '1099-INT',
  '1099-DIV',
  '1098',
  '1099-B',
  '1099-R',
  '5498',
]);

export function canExtractLiveDocumentType(documentType: DocumentType): boolean {
  return SUPPORTED_LIVE_TYPES.has(documentType);
}

export async function extractLiveDocument(args: {
  inputDir: string;
  document: DocumentInventoryItem;
}): Promise<ExtractedDocument | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }
  if (!canExtractLiveDocumentType(args.document.detectedFormType)) {
    return null;
  }

  const absolutePath = path.join(args.inputDir, args.document.filePath);
  const contentPart = buildContentPart(absolutePath);

  const prompt = buildExtractionPrompt(args.document.detectedFormType);

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      input: [
        {
          role: 'user',
          content: [
            contentPart,
            {
              type: 'input_text',
              text: prompt,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI extraction request failed: ${response.status} ${await response.text()}`);
  }

  const payload = (await response.json()) as {
    output_text?: string;
    output?: Array<{
      content?: Array<{
        type?: string;
        text?: string;
      }>;
    }>;
  };

  const outputText = payload.output_text || flattenOutputText(payload.output || []);
  const parsed = parseJsonObject(outputText);

  return {
    schemaVersion: args.document.schemaVersion,
    documentId: args.document.id,
    documentType: args.document.detectedFormType,
    taxYear: typeof parsed.taxYear === 'number' ? parsed.taxYear : args.document.taxYear,
    payerOrIssuer: typeof parsed.payerOrIssuer === 'string' ? parsed.payerOrIssuer : null,
    extractionMethod: 'live-openai',
    confidence: parsed.confidence === 'low' || parsed.confidence === 'medium' ? parsed.confidence : 'high',
    fields: normalizeFields(args.document.filePath, parsed.fields || {}),
  };
}

export async function reviewLiveDocumentTaxYear(args: {
  inputDir: string;
  document: DocumentInventoryItem;
}): Promise<{
  taxYear: number | null;
  confidence: 'high' | 'medium' | 'low';
  rationale: string;
} | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }

  const absolutePath = path.join(args.inputDir, args.document.filePath);
  const contentPart = buildContentPart(absolutePath);

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      input: [
        {
          role: 'user',
          content: [
            contentPart,
            {
              type: 'input_text',
              text:
                'Determine the reporting tax year of this tax document. Return JSON only with keys taxYear, confidence, and rationale. Do not confuse the form revision date, such as "(Rev. January 2024)", with the reporting tax year. If the reporting year is not visible, return taxYear as null.',
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI tax-year review failed: ${response.status} ${await response.text()}`);
  }

  const payload = (await response.json()) as {
    output_text?: string;
    output?: Array<{
      content?: Array<{
        type?: string;
        text?: string;
      }>;
    }>;
  };
  const outputText = payload.output_text || flattenOutputText(payload.output || []);
  const parsed = parseJsonObject(outputText) as {
    taxYear?: unknown;
    confidence?: unknown;
    rationale?: unknown;
  };

  return {
    taxYear: typeof parsed.taxYear === 'number' ? parsed.taxYear : null,
    confidence: normalizeConfidence(parsed.confidence),
    rationale: typeof parsed.rationale === 'string' ? parsed.rationale : '',
  };
}

function normalizeFields(
  sourceFile: string,
  fields: Record<string, { value: unknown; sourcePage?: unknown; confidence?: unknown }>
) {
  return Object.fromEntries(
    Object.entries(fields).map(([key, field]) => [
      key,
      {
        value: normalizeValue(field.value),
        confidence: normalizeConfidence(field.confidence),
        sourceFile,
        sourcePage: typeof field.sourcePage === 'number' ? field.sourcePage : 1,
      },
    ])
  );
}

function normalizeValue(value: unknown): number | string | boolean | null {
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.replace(/[$,]/g, '').trim();
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      return Number(trimmed);
    }
    return value;
  }
  if (value === null) {
    return null;
  }
  return JSON.stringify(value);
}

function buildContentPart(absolutePath: string) {
  const ext = path.extname(absolutePath).toLowerCase();
  const bytes = fs.readFileSync(absolutePath);
  const base64 = bytes.toString('base64');

  return ext === '.pdf'
    ? {
        type: 'input_file' as const,
        filename: path.basename(absolutePath),
        file_data: `data:application/pdf;base64,${base64}`,
      }
    : {
        type: 'input_image' as const,
        image_url: `data:${detectMimeType(ext)};base64,${base64}`,
      };
}

function flattenOutputText(
  output: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>
): string {
  const parts: string[] = [];
  for (const item of output) {
    for (const content of item.content || []) {
      if (content.type === 'output_text' && content.text) {
        parts.push(content.text);
      }
    }
  }
  return parts.join('\n');
}

function parseJsonObject(raw: string): {
  taxYear?: unknown;
  payerOrIssuer?: unknown;
  confidence?: unknown;
  fields?: Record<string, { value: unknown; sourcePage?: unknown; confidence?: unknown }>;
} {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`OpenAI extraction did not return JSON: ${raw.slice(0, 200)}`);
  }
  return JSON.parse(raw.slice(start, end + 1));
}

function detectMimeType(ext: string): string {
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}

function normalizeConfidence(value: unknown): 'high' | 'medium' | 'low' {
  if (value === 'low' || value === 'medium' || value === 'high') {
    return value;
  }
  return 'high';
}

function buildExtractionPrompt(documentType: DocumentType): string {
  const common =
    'Extract the tax document into JSON only. Do not include markdown fences. Return an object with keys taxYear, payerOrIssuer, confidence, and fields. The fields object must map field names to { value, sourcePage, confidence }.';

  switch (documentType) {
    case 'W-2':
      return `${common} For W-2 include: box1_wages, box2_federal_withholding, box12_code_d if present, state_ca_wages, state_ca_withholding.`;
    case '1099-INT':
      return `${common} For 1099-INT include: interest_income, federal_withholding if present, foreign_tax_paid if present, tax_exempt_interest if present, specified_private_activity_bond_interest if present.`;
    case '1099-DIV':
      return `${common} For 1099-DIV include: ordinary_dividends, qualified_dividends, capital_gain_distributions, federal_withholding if present, foreign_tax_paid if present, tax_exempt_interest if present, specified_private_activity_bond_interest if present, section_199a_dividends if present, nondividend_distributions if present.`;
    case '1098':
      return `${common} For 1098 include: mortgage_interest_received, property_tax_paid if present, points_paid if present.`;
    case '1099-B':
      return `${common} For 1099-B include summary bucket fields when available: short_term_covered_proceeds, short_term_covered_basis, short_term_wash_sale_adjustments, short_term_covered_net_gain_loss if available, long_term_covered_proceeds, long_term_covered_basis, long_term_wash_sale_adjustments, long_term_covered_net_gain_loss if available, federal_withholding if present.`;
    case '1099-R':
      return `${common} For 1099-R include: gross_distribution, taxable_amount, federal_withholding if present, state_withholding if present, distribution_code if present.`;
    case '5498':
      return `${common} For 5498 include: account_type and contribution_amount. Use account_type values traditional_ira or roth_ira when clear.`;
    default:
      return `${common} Extract the most relevant numeric fields for this tax form.`;
  }
}
