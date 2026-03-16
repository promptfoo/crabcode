import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import type { DocumentType } from '../types.js';

interface ClassificationResult {
  detectedFormType: DocumentType;
  confidence: 'high' | 'medium' | 'low';
}

const MAX_PDF_TEXT_BYTES = 1024 * 1024;

export function classifyDocument(filePath: string): ClassificationResult {
  const filenameResult = classifyByFileName(path.basename(filePath));
  const contentResult = classifyByContent(filePath);

  if (contentResult.detectedFormType !== 'unknown') {
    if (filenameResult.detectedFormType === 'unknown') {
      return contentResult;
    }
    if (contentResult.detectedFormType !== filenameResult.detectedFormType) {
      return contentResult;
    }
    if (contentResult.confidence === 'high') {
      return contentResult;
    }
  }

  return filenameResult.detectedFormType !== 'unknown' ? filenameResult : contentResult;
}

export function classifyTextSnippet(text: string): ClassificationResult {
  const normalized = normalize(text);

  if (!normalized) {
    return unknown();
  }

  if (
    includesAll(normalized, ['property tax bill']) ||
    includesAll(normalized, ['secured', 'bill']) ||
    includesAll(normalized, ['tax collector']) ||
    includesAll(normalized, ['treasurer', 'property location'])
  ) {
    return { detectedFormType: 'property-tax-bill', confidence: 'high' };
  }

  if (
    includesAll(normalized, ['1099 composite']) ||
    includesAll(normalized, ['form 1099 composite']) ||
    includesAll(normalized, ['consolidated form 1099']) ||
    (includesAll(normalized, ['tax reporting statement']) &&
      (includesAll(normalized, ['1099-div']) ||
        includesAll(normalized, ['1099-b']) ||
        includesAll(normalized, ['1099-int']))) ||
    includesAll(normalized, ['year-end statement', '1099-div'])
  ) {
    return { detectedFormType: '1099-composite', confidence: 'high' };
  }

  if (
    includesAll(normalized, ['form w-2']) ||
    includesAll(normalized, ['wages, tips, other compensation'])
  ) {
    return { detectedFormType: 'W-2', confidence: 'high' };
  }

  if (
    includesAll(normalized, ['form 1099-r']) ||
    includesAll(normalized, ['distributions from pensions']) ||
    includesAll(normalized, ['gross distribution', 'taxable amount'])
  ) {
    return { detectedFormType: '1099-R', confidence: 'high' };
  }

  if (
    includesAll(normalized, ['form 1098']) ||
    includesAll(normalized, ['mortgage interest statement']) ||
    includesAll(normalized, ['mortgage interest received'])
  ) {
    return { detectedFormType: '1098', confidence: 'high' };
  }

  if (
    includesAll(normalized, ['form 1099-int']) ||
    (includesAll(normalized, ['1099-int']) && includesAll(normalized, ['interest income']))
  ) {
    return { detectedFormType: '1099-INT', confidence: 'high' };
  }

  if (
    includesAll(normalized, ['form 1099-div']) ||
    includesAll(normalized, ['dividends and distributions'])
  ) {
    return { detectedFormType: '1099-DIV', confidence: 'high' };
  }

  if (
    includesAll(normalized, ['form 1099-b']) ||
    includesAll(normalized, ['proceeds from broker']) ||
    includesAll(normalized, ['sales proceeds'])
  ) {
    return { detectedFormType: '1099-B', confidence: 'high' };
  }

  if (
    includesAll(normalized, ['form 5498']) ||
    includesAll(normalized, ['ira contribution information'])
  ) {
    return { detectedFormType: '5498', confidence: 'high' };
  }

  if (
    includesAll(normalized, ['form 1040']) ||
    includesAll(normalized, ['u.s. individual income tax return'])
  ) {
    return { detectedFormType: 'prior-year-return', confidence: 'high' };
  }

  return unknown();
}

function classifyByFileName(fileName: string): ClassificationResult {
  const lower = fileName.toLowerCase();

  const matches: Array<[DocumentType, RegExp]> = [
    ['property-tax-bill', /(property.*tax.*bill|secured[-_ ]bill|tax[-_ ]bill)/],
    ['1099-composite', /(1099.*(composite|consolidated)|(composite|consolidated).*(1099|tax reporting statement))/],
    ['W-2', /(^|[^0-9])w[\s_-]?2([^0-9]|$)/],
    ['1099-INT', /1099[\s_-]?int/],
    ['1099-DIV', /1099[\s_-]?div/],
    ['1099-B', /1099[\s_-]?b/],
    ['1098', /(^|[^0-9])1098([^0-9]|$)/],
    ['5498', /(^|[^0-9])5498([^0-9]|$)/],
    ['1099-R', /1099[\s_-]?r/],
    ['prior-year-return', /(prior|previous).*(return)|return.*2024|2024.*return/],
  ];

  for (const [type, pattern] of matches) {
    if (pattern.test(lower)) {
      return { detectedFormType: type, confidence: 'medium' };
    }
  }

  return unknown();
}

function classifyByContent(filePath: string): ClassificationResult {
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== '.pdf') {
    return unknown();
  }

  const text = readPdfText(filePath);
  return text ? classifyTextSnippet(text) : unknown();
}

function readPdfText(filePath: string): string | null {
  try {
    const output = execFileSync(
      'pdftotext',
      ['-f', '1', '-l', '3', filePath, '-'],
      {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
        maxBuffer: MAX_PDF_TEXT_BYTES,
      }
    );
    return output.slice(0, MAX_PDF_TEXT_BYTES);
  } catch {
    return null;
  }
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function includesAll(text: string, parts: string[]): boolean {
  return parts.every((part) => text.includes(part));
}

function unknown(): ClassificationResult {
  return { detectedFormType: 'unknown', confidence: 'low' };
}
