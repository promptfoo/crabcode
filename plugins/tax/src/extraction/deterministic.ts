import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import type { DocumentInventoryItem, DocumentType, ExtractedDocument } from '../types.js';

const MAX_PDF_TEXT_BYTES = 4 * 1024 * 1024;

type ParsedValue = number | string | boolean | null;

interface ParsedDeterministicDocument {
  taxYear: number | null;
  payerOrIssuer: string | null;
  confidence: 'high' | 'medium' | 'low';
  fields: Record<string, ParsedValue>;
}

const SUPPORTED_DETERMINISTIC_TYPES = new Set<DocumentType>(['1099-composite', 'property-tax-bill']);

export function canExtractDeterministicDocumentType(documentType: DocumentType): boolean {
  return SUPPORTED_DETERMINISTIC_TYPES.has(documentType);
}

export function extractDeterministicDocument(args: {
  inputDir: string;
  document: DocumentInventoryItem;
}): ExtractedDocument | null {
  const { inputDir, document } = args;
  if (!canExtractDeterministicDocumentType(document.detectedFormType)) {
    return null;
  }

  const absolutePath = path.join(inputDir, document.filePath);
  if (path.extname(absolutePath).toLowerCase() !== '.pdf') {
    return null;
  }

  const text = readPdfText(absolutePath);
  if (!text) {
    return null;
  }

  let parsed: ParsedDeterministicDocument | null = null;
  if (document.detectedFormType === '1099-composite') {
    parsed = parse1099CompositeText(text, document.fileName);
  } else if (document.detectedFormType === 'property-tax-bill') {
    parsed = parsePropertyTaxBillText(text, document.fileName);
  }

  if (!parsed) {
    return null;
  }

  const fields = Object.fromEntries(
    Object.entries(parsed.fields).map(([key, value]) => [
      key,
      {
        value,
        confidence: parsed.confidence,
        sourceFile: document.filePath,
        sourcePage: 1,
      },
    ])
  );

  return {
    schemaVersion: document.schemaVersion,
    documentId: document.id,
    documentType: document.detectedFormType,
    taxYear: parsed.taxYear ?? document.taxYear,
    payerOrIssuer: parsed.payerOrIssuer ?? document.issuerOrPayer,
    extractionMethod: 'deterministic',
    confidence: parsed.confidence,
    fields,
  };
}

export function parse1099CompositeText(
  text: string,
  fileName = 'document.pdf'
): ParsedDeterministicDocument | null {
  const inline = normalizeInline(text);
  const provider = detectCompositeProvider(inline, fileName);

  switch (provider) {
    case 'fidelity':
      return parseFidelityCompositeText(text, inline);
    case 'pershing':
      return parsePershingCompositeText(inline);
    case 'robinhood':
      return parseRobinhoodCompositeText(inline);
    case 'schwab':
      return parseSchwabCompositeText(inline);
    default:
      return null;
  }
}

export function parsePropertyTaxBillText(
  text: string,
  _fileName = 'property-tax-bill.pdf'
): ParsedDeterministicDocument | null {
  const inline = normalizeInline(text);
  const fullYearTaxAmount = extractMoneyAfterLabel(inline, 'tax amount');
  const directChargesTotal = extractMoneyAfterLabel(
    inline,
    'total direct charges and special assessments'
  );
  const firstInstallmentAmount = extractMoneyAfterLooseLabel(inline, '1st installment due');
  const secondInstallmentAmount = extractMoneyAfterLooseLabel(inline, '2nd installment due');
  const paidDate = extractDateAfterLabel(inline, 'paid');

  if (fullYearTaxAmount === null || firstInstallmentAmount === null) {
    return null;
  }

  const firstInstallmentPaid = paidDate !== null;
  const deductiblePropertyTaxPaid = firstInstallmentPaid
    ? roundMoney(fullYearTaxAmount / 2)
    : 0;
  const installmentDirectCharges =
    directChargesTotal !== null ? roundMoney(directChargesTotal / 2) : null;

  return {
    taxYear: extractReportingYear(text),
    payerOrIssuer: inline.includes('city & county of san francisco')
      ? 'CITY & COUNTY OF SAN FRANCISCO'
      : 'LOCAL TAX COLLECTOR',
    confidence: firstInstallmentPaid ? 'high' : 'medium',
    fields: compactFields({
      property_tax_paid: deductiblePropertyTaxPaid,
      property_tax_bill_tax_amount_full_year: fullYearTaxAmount,
      property_tax_bill_direct_charges_total: directChargesTotal,
      property_tax_first_installment_amount: firstInstallmentAmount,
      property_tax_second_installment_amount: secondInstallmentAmount,
      property_tax_first_installment_paid: firstInstallmentPaid,
      property_tax_first_installment_paid_date: paidDate,
      property_tax_first_installment_direct_charges_allocated: installmentDirectCharges,
    }),
  };
}

function parseFidelityCompositeText(
  rawText: string,
  inline: string
): ParsedDeterministicDocument | null {
  const topSection =
    sliceInlineBetween(
      inline,
      '2025 tax reporting statement',
      'summary of 2025 proceeds from broker and barter exchange transactions'
    ) || inline;
  const summarySection = sliceInlineBetween(
    inline,
    'summary of 2025 proceeds from broker and barter exchange transactions',
    '1099-b amounts are reported individually to the irs'
  );

  const summaryValues = summarySection ? extractMoneyValues(summarySection) : [];
  const rows = chunk(summaryValues.slice(0, 36), 6);
  if (rows.length < 5) {
    return null;
  }

  const shortCovered = rows[0];
  const shortNoncovered = rows[1];
  const longCovered = rows[2];
  const longNoncovered = rows[3];
  const unknownTerm = rows[4];

  return {
    taxYear: extractReportingYear(rawText),
    payerOrIssuer: inline.includes('national financial services llc')
      ? 'NATIONAL FINANCIAL SERVICES LLC'
      : 'FIDELITY BROKERAGE SERVICES LLC',
    confidence: 'high',
    fields: compactFields({
      interest_income: extractMoneyAfterLabel(topSection, '1 interest income'),
      ordinary_dividends: extractMoneyAfterLabel(topSection, '1a total ordinary dividends'),
      qualified_dividends: extractMoneyAfterLabel(topSection, '1b qualified dividends'),
      capital_gain_distributions: extractMoneyAfterLabel(
        topSection,
        '2a total capital gain distributions'
      ),
      nondividend_distributions: extractMoneyAfterLabel(topSection, '3 nondividend distributions'),
      section_199a_dividends: extractMoneyAfterLabel(topSection, '5 section 199a dividends'),
      federal_withholding: roundMoney(
        sumValues(extractAllMoneyAfterLabel(topSection, '4 federal income tax withheld'))
      ),
      foreign_tax_paid: roundMoney(
        sumValues([
          ...extractAllMoneyAfterLabel(topSection, '7 foreign tax paid'),
          ...extractAllMoneyAfterLabel(topSection, '6 foreign tax paid'),
        ])
      ),
      tax_exempt_interest: roundMoney(
        sumValues([
          ...extractAllMoneyAfterLabel(topSection, '12 exempt interest dividends'),
          ...extractAllMoneyAfterLabel(topSection, '8 tax-exempt interest'),
        ])
      ),
      specified_private_activity_bond_interest: roundMoney(
        sumValues([
          ...extractAllMoneyAfterLabel(
            topSection,
            '13 specified private activity bond interest dividends'
          ),
          ...extractAllMoneyAfterLabel(topSection, '9 specified private activity bond interest'),
        ])
      ),
      short_term_covered_proceeds: shortCovered[0] ?? null,
      short_term_covered_basis: shortCovered[1] ?? null,
      short_term_wash_sale_adjustments: shortCovered[3] ?? null,
      short_term_covered_net_gain_loss: shortCovered[4] ?? null,
      long_term_covered_proceeds: longCovered[0] ?? null,
      long_term_covered_basis: longCovered[1] ?? null,
      long_term_wash_sale_adjustments: longCovered[3] ?? null,
      long_term_covered_net_gain_loss: longCovered[4] ?? null,
      has_unsupported_brokerage_rows:
        hasNonZeroValues(shortNoncovered) ||
        hasNonZeroValues(longNoncovered) ||
        hasNonZeroValues(unknownTerm),
    }),
  };
}

function parsePershingCompositeText(inline: string): ParsedDeterministicDocument | null {
  const intSection = sliceInlineBetween(inline, '2025 1099-int', 'box 1a');
  const divSection = sliceInlineBetween(inline, 'box 1a', 'summary of form 1099-oid');
  const shortCoveredSection = sliceInlineBetween(
    inline,
    'short-term covered total',
    'long-term covered total'
  );
  const longCoveredSection = sliceInlineBetween(
    inline,
    'long-term covered total',
    'tax lot default disposition method'
  );

  if (!intSection || !divSection || !shortCoveredSection || !longCoveredSection) {
    return null;
  }

  const intValues = extractMoneyValues(intSection);
  const divValues = extractMoneyValues(divSection);
  const shortCovered = extractDollarMoneyValues(shortCoveredSection).slice(0, 3);
  const longCovered = extractDollarMoneyValues(longCoveredSection).slice(0, 3);

  if (intValues.length < 7 || divValues.length < 17 || shortCovered.length < 3 || longCovered.length < 3) {
    return null;
  }

  return {
    taxYear: extractReportingYear(inline),
    payerOrIssuer: 'PERSHING LLC',
    confidence: 'high',
    fields: compactFields({
      interest_income: intValues[0] ?? null,
      federal_withholding: roundMoney((intValues[2] ?? 0) + (divValues[9] ?? 0)),
      foreign_tax_paid: roundMoney((intValues[4] ?? 0) + (divValues[12] ?? 0)),
      tax_exempt_interest: roundMoney((intValues[5] ?? 0) + (divValues[15] ?? 0)),
      specified_private_activity_bond_interest: roundMoney(
        (intValues[6] ?? 0) + (divValues[16] ?? 0)
      ),
      ordinary_dividends: divValues[0] ?? null,
      qualified_dividends: divValues[1] ?? null,
      capital_gain_distributions: divValues[2] ?? null,
      nondividend_distributions: divValues[8] ?? null,
      section_199a_dividends: divValues[10] ?? null,
      short_term_covered_proceeds: shortCovered[0] ?? null,
      short_term_covered_basis: shortCovered[1] ?? null,
      short_term_wash_sale_adjustments: 0,
      short_term_covered_net_gain_loss: shortCovered[2] ?? null,
      long_term_covered_proceeds: longCovered[0] ?? null,
      long_term_covered_basis: longCovered[1] ?? null,
      long_term_wash_sale_adjustments: 0,
      long_term_covered_net_gain_loss: longCovered[2] ?? null,
      has_unsupported_brokerage_rows: false,
    }),
  };
}

function parseRobinhoodCompositeText(inline: string): ParsedDeterministicDocument | null {
  const divSection = sliceInlineBetween(inline, '2025 1099-div', '2025 1099-misc');
  const intSection = sliceInlineBetween(
    inline,
    '2025 1099-int',
    'the following amounts are not reported to the irs'
  );
  const shortCoveredSection = sliceInlineBetween(
    inline,
    'a (basis reported to the irs)',
    'b (basis not reported to the irs)'
  );
  const shortNoncoveredSection = sliceInlineBetween(
    inline,
    'b (basis not reported to the irs)',
    'c (form 1099-b not received)'
  );
  const shortUnknownSection = sliceInlineBetween(
    inline,
    'c (form 1099-b not received)',
    'total short-term'
  );
  const longCoveredSection = sliceInlineBetween(
    inline,
    'd (basis reported to the irs)',
    'e (basis not reported to the irs)'
  );
  const longNoncoveredSection = sliceInlineBetween(
    inline,
    'e (basis not reported to the irs)',
    'f (form 1099-b not received)'
  );
  const longUnknownSection = sliceInlineBetween(
    inline,
    'f (form 1099-b not received)',
    'total long-term'
  );
  const undeterminedSection = sliceInlineBetween(
    inline,
    'total undetermined-term',
    'grand total'
  );
  const shortTotalSection = sliceInlineBetween(
    inline,
    'total short-term',
    'd (basis reported to the irs)'
  );
  const longTotalSection = sliceInlineBetween(
    inline,
    'total long-term',
    'b or e (basis not reported to the irs)'
  );

  if (
    !divSection ||
    !intSection ||
    !shortNoncoveredSection ||
    !shortUnknownSection ||
    !longNoncoveredSection ||
    !longUnknownSection ||
    !undeterminedSection ||
    !shortTotalSection ||
    !longTotalSection
  ) {
    return null;
  }

  const divValues = extractMoneyValues(divSection);
  const intValues = extractMoneyValues(intSection);
  let shortCovered = shortCoveredSection ? extractMoneyValues(shortCoveredSection).slice(0, 5) : [];
  const shortNoncovered = extractMoneyValues(shortNoncoveredSection).slice(0, 5);
  const shortUnknown = extractMoneyValues(shortUnknownSection).slice(0, 5);
  let longCovered = longCoveredSection ? extractMoneyValues(longCoveredSection).slice(0, 5) : [];
  const longNoncovered = extractMoneyValues(longNoncoveredSection).slice(0, 5);
  const longUnknown = extractMoneyValues(longUnknownSection).slice(0, 5);
  const undetermined = extractMoneyValues(undeterminedSection).slice(0, 5);
  const shortTotals = extractMoneyValues(shortTotalSection).slice(0, 5);
  const longTotals = extractMoneyValues(longTotalSection).slice(0, 5);

  if (shortCovered.length === 0 && longCovered.length === 0) {
    if (
      hasNonZeroValues(shortTotals) ||
      hasNonZeroValues(longTotals) ||
      hasNonZeroValues(undetermined)
    ) {
      return null;
    }
    shortCovered = [0, 0, 0, 0, 0];
    longCovered = [0, 0, 0, 0, 0];
  }

  if (divValues.length < 17 || intValues.length < 9 || shortCovered.length < 5 || longCovered.length < 5) {
    return null;
  }

  return {
    taxYear: extractReportingYear(inline),
    payerOrIssuer: 'ROBINHOOD MARKETS INC',
    confidence: 'high',
    fields: compactFields({
      interest_income: intValues[0] ?? null,
      ordinary_dividends: divValues[0] ?? null,
      qualified_dividends: divValues[1] ?? null,
      capital_gain_distributions: divValues[2] ?? null,
      nondividend_distributions: divValues[8] ?? null,
      federal_withholding: roundMoney((divValues[9] ?? 0) + (intValues[3] ?? 0)),
      section_199a_dividends: divValues[10] ?? null,
      foreign_tax_paid: roundMoney((divValues[12] ?? 0) + (intValues[5] ?? 0)),
      tax_exempt_interest: roundMoney((divValues[15] ?? 0) + (intValues[6] ?? 0)),
      specified_private_activity_bond_interest: roundMoney(
        (divValues[16] ?? 0) + (intValues[7] ?? 0)
      ),
      short_term_covered_proceeds: shortCovered[0] ?? null,
      short_term_covered_basis: shortCovered[1] ?? null,
      short_term_wash_sale_adjustments: shortCovered[3] ?? null,
      short_term_covered_net_gain_loss: shortCovered[4] ?? null,
      long_term_covered_proceeds: longCovered[0] ?? null,
      long_term_covered_basis: longCovered[1] ?? null,
      long_term_wash_sale_adjustments: longCovered[3] ?? null,
      long_term_covered_net_gain_loss: longCovered[4] ?? null,
      has_unsupported_brokerage_rows:
        hasNonZeroValues(shortNoncovered) ||
        hasNonZeroValues(shortUnknown) ||
        hasNonZeroValues(longNoncovered) ||
        hasNonZeroValues(longUnknown) ||
        hasNonZeroValues(undetermined),
    }),
  };
}

function parseSchwabCompositeText(inline: string): ParsedDeterministicDocument | null {
  const dividendDetailSection = sliceInlineLastBetween(
    inline,
    'detail information of dividends and distributions',
    'detail information of interest income'
  );
  const interestDetailSection = sliceInlineLastBetween(
    inline,
    'detail information of interest income',
    'terms and conditions'
  );

  const dividendDetailValues = dividendDetailSection ? extractMoneyValues(dividendDetailSection) : [];
  const interestDetailValues = interestDetailSection ? extractMoneyValues(interestDetailSection) : [];
  const ordinaryDividends = dividendDetailValues[0] ?? null;
  const qualifiedDividends = dividendDetailValues[1] ?? null;
  const interestIncome = interestDetailValues[0] ?? null;

  if (ordinaryDividends === null || qualifiedDividends === null || interestIncome === null) {
    return null;
  }

  return {
    taxYear: extractReportingYear(inline),
    payerOrIssuer: 'CHARLES SCHWAB & CO., INC.',
    confidence: 'high',
    fields: compactFields({
      interest_income: interestIncome,
      ordinary_dividends: ordinaryDividends,
      qualified_dividends: qualifiedDividends,
      capital_gain_distributions: extractMoneyAfterLabel(inline, 'total capital gain distributions'),
      nondividend_distributions: extractMoneyAfterLabel(inline, 'nondividend distributions'),
      federal_withholding: roundMoney(
        sumValues([
          ...extractAllMoneyAfterLabel(inline, 'federal income tax withheld'),
        ])
      ),
      section_199a_dividends: extractMoneyAfterLabel(inline, 'section 199a dividends'),
      foreign_tax_paid: roundMoney(sumValues(extractAllMoneyAfterLabel(inline, 'foreign tax paid'))),
      tax_exempt_interest: roundMoney(
        sumValues([
          ...extractAllMoneyAfterLabel(inline, 'exempt-interest dividends'),
          ...extractAllMoneyAfterLabel(inline, 'tax-exempt interest'),
        ])
      ),
      specified_private_activity_bond_interest: roundMoney(
        sumValues([
          ...extractAllMoneyAfterLabel(
            inline,
            'specified private activity bond interest dividends'
          ),
          ...extractAllMoneyAfterLabel(inline, 'specified private activity bond interest'),
        ])
      ),
      short_term_covered_proceeds: 0,
      short_term_covered_basis: 0,
      short_term_wash_sale_adjustments: 0,
      short_term_covered_net_gain_loss: 0,
      long_term_covered_proceeds: 0,
      long_term_covered_basis: 0,
      long_term_wash_sale_adjustments: 0,
      long_term_covered_net_gain_loss: 0,
      has_unsupported_brokerage_rows: false,
    }),
  };
}

function detectCompositeProvider(inline: string, fileName: string): string {
  const lowerFileName = fileName.toLowerCase();
  if (
    inline.includes('fidelity brokerage services llc') ||
    inline.includes('national financial services llc') ||
    lowerFileName.includes('fidelity')
  ) {
    return 'fidelity';
  }
  if (inline.includes("payer's information: pershing llc") || lowerFileName.includes('pershing')) {
    return 'pershing';
  }
  if (inline.includes('robinhood markets inc') || lowerFileName.includes('robinhood')) {
    return 'robinhood';
  }
  if (
    inline.includes('charles schwab & co., inc.') ||
    inline.includes('schwab one account') ||
    lowerFileName.includes('schwab')
  ) {
    return 'schwab';
  }
  return 'unknown';
}

function readPdfText(filePath: string): string | null {
  try {
    return execFileSync('pdftotext', [filePath, '-'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: MAX_PDF_TEXT_BYTES,
    });
  } catch {
    return null;
  }
}

function normalizeInline(text: string): string {
  return text
    .toLowerCase()
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractMoneyAfterLabel(text: string, label: string): number | null {
  const matches = extractAllMoneyAfterLabel(text, label);
  return matches.length > 0 ? matches[0] : null;
}

function extractMoneyAfterLooseLabel(text: string, label: string): number | null {
  const pattern = new RegExp(
    `${escapeRegExp(label.toLowerCase())}.{0,120}?((?:\\(|-)?\\$?\\d[\\d,]*\\.\\d{2}\\)?)`
  );
  const match = text.match(pattern);
  return match ? parseMoneyString(match[1]) : null;
}

function extractAllMoneyAfterLabel(text: string, label: string): number[] {
  const pattern = new RegExp(
    `${escapeRegExp(label.toLowerCase())}[^\\d$()\\-]{0,120}((?:\\(|-)?\\$?\\d[\\d,]*\\.\\d{2}\\)?)`,
    'g'
  );
  const results: number[] = [];
  for (const match of text.matchAll(pattern)) {
    results.push(parseMoneyString(match[1]));
  }
  return results;
}

function extractDateAfterLabel(text: string, label: string): string | null {
  const pattern = new RegExp(
    `${escapeRegExp(label.toLowerCase())}[^0-9]{0,40}(\\d{1,2}/\\d{1,2}/\\d{4})`
  );
  const match = text.match(pattern);
  if (!match) {
    return null;
  }
  const [month, day, year] = match[1].split('/').map(Number);
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day
    .toString()
    .padStart(2, '0')}`;
}

function extractMoneyValues(text: string): number[] {
  const matches = text.match(/(?:\(|-)?\$?\d[\d,]*\.\d{2}\)?/g);
  return matches ? matches.map(parseMoneyString) : [];
}

function extractDollarMoneyValues(text: string): number[] {
  const matches = text.match(/\(?\$-?\d[\d,]*\.\d{2}\)?/g);
  return matches ? matches.map(parseMoneyString) : [];
}

function parseMoneyString(raw: string): number {
  const negative = raw.includes('(') || raw.trim().startsWith('-');
  const cleaned = raw.replace(/[\s$,()]/g, '').replace(/^-/, '');
  const value = Number(cleaned);
  return negative ? -value : value;
}

function sliceInlineBetween(text: string, startMarker: string, endMarker: string): string | null {
  const start = text.indexOf(startMarker.toLowerCase());
  if (start === -1) {
    return null;
  }
  const fromStart = text.slice(start);
  const endRelative = fromStart.indexOf(endMarker.toLowerCase());
  if (endRelative === -1) {
    return fromStart;
  }
  return fromStart.slice(0, endRelative);
}

function sliceInlineLastBetween(text: string, startMarker: string, endMarker: string): string | null {
  const start = text.lastIndexOf(startMarker.toLowerCase());
  if (start === -1) {
    return null;
  }
  const fromStart = text.slice(start);
  const endRelative = fromStart.indexOf(endMarker.toLowerCase());
  if (endRelative === -1) {
    return fromStart;
  }
  return fromStart.slice(0, endRelative);
}

function extractReportingYear(text: string): number | null {
  const patterns = [
    /tax year[^0-9]{0,20}(20\d{2})/i,
    /for tax year[^0-9]{0,20}(20\d{2})/i,
    /(?:^|\s)(20\d{2})\s+tax reporting statement/i,
    /(?:^|\s)(20\d{2})\s+1099-(?:div|int|b|misc|oid|r)\b/i,
    /for fiscal year [a-z]+ \d{1,2}, (20\d{2})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return Number(match[1]);
    }
  }

  const fallback = text.match(/\b(20\d{2})\b/);
  return fallback ? Number(fallback[1]) : null;
}

function chunk(values: number[], size: number): number[][] {
  const result: number[][] = [];
  for (let index = 0; index < values.length; index += size) {
    const slice = values.slice(index, index + size);
    if (slice.length === size) {
      result.push(slice);
    }
  }
  return result;
}

function hasNonZeroValues(values: number[]): boolean {
  return values.some((value) => Math.abs(value) > 0);
}

function sumValues(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0);
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function compactFields(fields: Record<string, ParsedValue>): Record<string, ParsedValue> {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== null && value !== undefined)
  );
}

function firstNonNull<T>(...values: Array<T | null>): T | null {
  for (const value of values) {
    if (value !== null) {
      return value;
    }
  }
  return null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
