import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DocumentInventoryItem, DocumentType, ExtractedDocument } from '../types.js';

interface MockSidecarFile {
  payerOrIssuer?: string;
  taxYear?: number;
  confidence?: 'high' | 'medium' | 'low';
  fields: Record<
    string,
    {
      value: number | string | boolean | null;
      sourcePage?: number;
      confidence?: 'high' | 'medium' | 'low';
    }
  >;
}

const SUPPORTED_MOCK_TYPES = new Set<DocumentType>([
  'W-2',
  '1099-INT',
  '1099-DIV',
  '1098',
  '1099-B',
  '1099-composite',
  '1099-R',
  '5498',
  'property-tax-bill',
]);

export function canExtractMockDocumentType(documentType: DocumentType): boolean {
  return SUPPORTED_MOCK_TYPES.has(documentType);
}

export function extractMockDocument(args: {
  inputDir: string;
  document: DocumentInventoryItem;
}): ExtractedDocument | null {
  const { inputDir, document } = args;
  if (!canExtractMockDocumentType(document.detectedFormType)) {
    return null;
  }

  const fullPath = path.join(inputDir, document.filePath);
  const sidecarPath = `${fullPath}.mock.json`;
  if (!fs.existsSync(sidecarPath)) {
    return null;
  }

  const sidecar = JSON.parse(fs.readFileSync(sidecarPath, 'utf-8')) as MockSidecarFile;
  const fields = Object.fromEntries(
    Object.entries(sidecar.fields).map(([key, field]) => [
      key,
      {
        value: field.value,
        confidence: field.confidence || sidecar.confidence || 'high',
        sourceFile: document.filePath,
        sourcePage: field.sourcePage || 1,
      },
    ])
  );

  return {
    schemaVersion: document.schemaVersion,
    documentId: document.id,
    documentType: document.detectedFormType,
    taxYear: sidecar.taxYear ?? document.taxYear,
    payerOrIssuer: sidecar.payerOrIssuer ?? document.issuerOrPayer,
    extractionMethod: 'mock',
    confidence: sidecar.confidence || document.confidence,
    fields,
  };
}
