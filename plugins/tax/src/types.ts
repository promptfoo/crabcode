export type FilingStatus = 'single' | 'mfj';

export interface ScenarioFlags {
  rsu: boolean;
  espp: boolean;
  inheritedShares: boolean;
}

export interface EstimatedPayment {
  jurisdiction: 'federal' | 'california';
  amount: number;
}

export interface IraContribution {
  accountType: 'traditional_ira' | 'roth_ira';
  taxYear: number;
  amount: number;
}

export interface TaxpayerProfile {
  schemaVersion: string;
  taxYear: number;
  filingStatus: FilingStatus;
  state: 'CA';
  fullYearResident: boolean;
  dependents: number;
  estimatedPayments: EstimatedPayment[];
  iraContributions: IraContribution[];
  scenarioFlags: ScenarioFlags;
  reviewAnswers: Record<string, string>;
}

export type DocumentType =
  | 'W-2'
  | '1099-INT'
  | '1099-DIV'
  | '1099-B'
  | '1099-composite'
  | '1098'
  | '5498'
  | '1099-R'
  | 'property-tax-bill'
  | 'prior-year-return'
  | 'unknown';

export interface DocumentInventoryItem {
  schemaVersion: string;
  id: string;
  filePath: string;
  fileName: string;
  detectedFormType: DocumentType;
  issuerOrPayer: string | null;
  taxYear: number | null;
  pageCount: number | null;
  extractionStatus: 'pending' | 'extracted' | 'missing_mock_data' | 'unsupported';
  confidence: 'high' | 'medium' | 'low';
}

export interface ExtractedField<T> {
  value: T;
  confidence: 'high' | 'medium' | 'low';
  sourceFile: string;
  sourcePage: number;
}

export interface ExtractedDocument {
  schemaVersion: string;
  documentId: string;
  documentType: DocumentType;
  taxYear: number | null;
  payerOrIssuer: string | null;
  extractionMethod: 'mock' | 'live-openai' | 'deterministic';
  confidence: 'high' | 'medium' | 'low';
  fields: Record<string, ExtractedField<number | string | boolean | null>>;
}

export interface ReviewIssue {
  schemaVersion: string;
  severity: 'warning' | 'blocking';
  code: string;
  message: string;
  impactedArea: string;
  sourceReferences: string[];
  suggestedNextAction: string;
}

export interface ReconciliationCheck {
  name: string;
  status: 'pass' | 'warning' | 'blocking';
  message: string;
}

export interface ReconciliationReport {
  schemaVersion: string;
  taxYear: number;
  confidence: 'low' | 'medium' | 'high';
  checks: ReconciliationCheck[];
  missingDocumentsLikelyRequired: string[];
  stageDecisionLog: string[];
}

export interface ValueWithMeta {
  value: number | string | boolean | null;
  derivationType: 'copied' | 'normalized' | 'computed' | 'user_provided';
  references: string[];
}

export interface EstimateSummary {
  schemaVersion: string;
  taxYear: number;
  generatedAt: string;
  inputFingerprint: string;
  confidence: 'low' | 'medium' | 'high';
  federalRefundOrAmountOwed: ValueWithMeta;
  caRefundOrAmountOwed: ValueWithMeta;
  deductionChoice: {
    federal: 'unknown' | 'standard' | 'itemized';
    california: 'unknown' | 'standard' | 'itemized';
  };
  optimizations: string[];
  blockingIssueCount: number;
}

export interface RunPipelineOptions {
  inputDir: string;
  outputDir: string;
  profile: TaxpayerProfile;
  preview: boolean;
  verbose: boolean;
}

export interface RunPipelineResult {
  exitCode: 0 | 1 | 2 | 3;
  outputDir: string;
  issues: ReviewIssue[];
}
