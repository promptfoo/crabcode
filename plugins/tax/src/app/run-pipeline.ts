import { execFileSync } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as path from 'node:path';
import { appendText, writeJson, writeText, ensureDir } from './output.js';
import { listInputFiles } from '../ingestion/list-input-files.js';
import { classifyDocument } from '../ingestion/classify-document.js';
import { canExtractMockDocumentType, extractMockDocument } from '../extraction/mock.js';
import {
  canExtractDeterministicDocumentType,
  extractDeterministicDocument,
} from '../extraction/deterministic.js';
import {
  canExtractLiveDocumentType,
  extractLiveDocument,
  reviewLiveDocumentTaxYear,
} from '../extraction/live-openai.js';
import { buildAggregatedPreview } from '../compute/aggregate-preview.js';
import { computeFederalReturn } from '../compute/federal-return.js';
import { computeCaliforniaReturn } from '../compute/california-return.js';
import { runResearchAgent } from '../agent/research-loop.js';
import type {
  DocumentType,
  DocumentInventoryItem,
  EstimateSummary,
  ExtractedDocument,
  ReconciliationReport,
  ReviewIssue,
  RunPipelineOptions,
  RunPipelineResult,
} from '../types.js';

const SCHEMA_VERSION = '0.1.0';

export async function runPipeline(options: RunPipelineOptions): Promise<RunPipelineResult> {
  ensureDir(options.outputDir);
  ensureDir(path.join(options.outputDir, 'extracted'));

  const progressLogPath = path.join(options.outputDir, 'progress.log');
  const progressJsonPath = path.join(options.outputDir, 'progress.json');
  const progress = {
    schemaVersion: SCHEMA_VERSION,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'running' as 'running' | 'completed' | 'failed',
    phase: 'setup',
    completedSteps: [] as string[],
    currentDocument: null as null | {
      id: string;
      fileName: string;
      detectedFormType: string;
      index: number;
      total: number;
      step: string;
    },
    documentCounts: {
      total: 0,
      extracted: 0,
      pending: 0,
    },
    issueCounts: {
      total: 0,
      blocking: 0,
    },
    latestNote: 'Run initialized.',
  };

  writeText(progressLogPath, '');
  writeJson(progressJsonPath, progress);

  function updateProgress(args: {
    note: string;
    phase?: string;
    completedStep?: string;
    currentDocument?: typeof progress.currentDocument;
    status?: typeof progress.status;
  }) {
    progress.updatedAt = new Date().toISOString();
    progress.phase = args.phase || progress.phase;
    progress.status = args.status || progress.status;
    progress.currentDocument =
      args.currentDocument === undefined ? progress.currentDocument : args.currentDocument;
    progress.documentCounts.total = documents.length;
    progress.documentCounts.extracted = extractedDocuments.length;
    progress.documentCounts.pending = documents.filter(
      (document) => document.extractionStatus === 'pending'
    ).length;
    progress.issueCounts.total = issues.length;
    progress.issueCounts.blocking = issues.filter((issue) => issue.severity === 'blocking').length;
    progress.latestNote = args.note;
    if (args.completedStep && !progress.completedSteps.includes(args.completedStep)) {
      progress.completedSteps.push(args.completedStep);
    }

    appendText(progressLogPath, `[${progress.updatedAt}] ${args.note}\n`);
    writeJson(progressJsonPath, progress);
    if (options.verbose) {
      console.log(`[progress] ${args.note}`);
    }
  }

  const files = listInputFiles(options.inputDir);
  const issues: ReviewIssue[] = [];
  const extractedDocuments: ExtractedDocument[] = [];
  const documents: DocumentInventoryItem[] = [];

  updateProgress({
    phase: 'inventory',
    note: `Discovered ${files.length} candidate file(s) in ${options.inputDir}.`,
  });

  try {
    for (const [index, filePath] of files.entries()) {
      const classification = classifyDocument(filePath);
      const relativePath = path.relative(options.inputDir, filePath);

      updateProgress({
        phase: 'inventory',
        currentDocument: {
          id: `doc-${index + 1}`,
          fileName: path.basename(filePath),
          detectedFormType: classification.detectedFormType,
          index: index + 1,
          total: files.length,
          step: 'classified',
        },
        note: `Classified ${path.basename(filePath)} as ${classification.detectedFormType}.`,
      });

      if (classification.detectedFormType === 'unknown') {
        issues.push({
          schemaVersion: SCHEMA_VERSION,
          severity: 'blocking',
          code: 'UNKNOWN_DOCUMENT_TYPE',
          message: `Could not confidently classify ${relativePath}.`,
          impactedArea: 'document-inventory',
          sourceReferences: [relativePath],
          suggestedNextAction:
            'Review the document classification before trusting the estimate. Material unknown documents must be resolved.',
        });
      }

      documents.push({
        schemaVersion: SCHEMA_VERSION,
        id: `doc-${index + 1}`,
        filePath: relativePath,
        fileName: path.basename(filePath),
        detectedFormType: classification.detectedFormType,
        issuerOrPayer: null,
        taxYear: inferTaxYear(relativePath),
        pageCount: null,
        extractionStatus: 'pending',
        confidence: classification.confidence,
      });
    }

    updateProgress({
      phase: 'inventory',
      completedStep: 'inventory',
      currentDocument: null,
      note: `Inventory complete. ${documents.length} document(s) queued for extraction.`,
    });

    for (const [index, document] of documents.entries()) {
      updateProgress({
        phase: 'extraction',
        currentDocument: {
          id: document.id,
          fileName: document.fileName,
          detectedFormType: document.detectedFormType,
          index: index + 1,
          total: documents.length,
          step: 'extracting',
        },
        note: `Starting extraction ${index + 1}/${documents.length}: ${document.fileName} (${document.detectedFormType}).`,
      });

      const canUseMock = canExtractMockDocumentType(document.detectedFormType);
      const canUseDeterministic = canExtractDeterministicDocumentType(document.detectedFormType);
      const canUseLive = canExtractLiveDocumentType(document.detectedFormType);
      let extracted = canUseMock
        ? extractMockDocument({
            inputDir: options.inputDir,
            document,
          })
        : null;

      if (extracted) {
        updateProgress({
          phase: 'extraction',
          currentDocument: {
            id: document.id,
            fileName: document.fileName,
            detectedFormType: document.detectedFormType,
            index: index + 1,
            total: documents.length,
            step: 'using-mock',
          },
          note: `Using mock extraction sidecar for ${document.fileName}.`,
        });
      }

      if (!extracted && canUseDeterministic) {
        updateProgress({
          phase: 'extraction',
          currentDocument: {
            id: document.id,
            fileName: document.fileName,
            detectedFormType: document.detectedFormType,
            index: index + 1,
            total: documents.length,
            step: 'deterministic',
          },
          note: `Running deterministic text extraction for ${document.fileName}.`,
        });
        extracted = extractDeterministicDocument({
          inputDir: options.inputDir,
          document,
        });
      }

      if (!extracted && canUseLive) {
        try {
          updateProgress({
            phase: 'extraction',
            currentDocument: {
              id: document.id,
              fileName: document.fileName,
              detectedFormType: document.detectedFormType,
              index: index + 1,
              total: documents.length,
              step: 'live-openai',
            },
            note: `Calling live extraction for ${document.fileName}.`,
          });
          extracted = await extractLiveDocument({
            inputDir: options.inputDir,
            document,
          });
        } catch (error) {
          issues.push({
            schemaVersion: SCHEMA_VERSION,
            severity: 'blocking',
            code: 'LIVE_EXTRACTION_FAILED',
            message: `Live extraction failed for ${document.filePath}: ${(error as Error).message}`,
            impactedArea: 'extraction',
            sourceReferences: [document.filePath],
            suggestedNextAction: 'Fix the document input, provide a mock sidecar, or retry live extraction.',
          });
          updateProgress({
            phase: 'extraction',
            currentDocument: {
              id: document.id,
              fileName: document.fileName,
              detectedFormType: document.detectedFormType,
              index: index + 1,
              total: documents.length,
              step: 'failed',
            },
            note: `Live extraction failed for ${document.fileName}: ${(error as Error).message}`,
          });
        }
      }

      if (extracted) {
        const taxYearReconciliation = await reconcileExtractedTaxYear({
          inputDir: options.inputDir,
          document,
          extracted,
          targetTaxYear: options.profile.taxYear,
        });
        extracted = taxYearReconciliation.extracted;
        issues.push(...taxYearReconciliation.issues);
        extractedDocuments.push(extracted);
        document.extractionStatus = 'extracted';
        document.issuerOrPayer = extracted.payerOrIssuer;
        document.taxYear = extracted.taxYear;
        document.confidence = extracted.confidence;
        writeJson(path.join(options.outputDir, 'extracted', `${document.id}.json`), extracted);
        issues.push(...validateExtractedDocument(extracted, options.profile.taxYear));
        updateProgress({
          phase: 'extraction',
          currentDocument: {
            id: document.id,
            fileName: document.fileName,
            detectedFormType: document.detectedFormType,
            index: index + 1,
            total: documents.length,
            step: 'extracted',
          },
          note: `Extracted ${document.fileName} via ${extracted.extractionMethod}.`,
        });
        continue;
      }

      if (canUseMock || canUseDeterministic || canUseLive) {
        document.extractionStatus = 'missing_mock_data';
        issues.push({
          schemaVersion: SCHEMA_VERSION,
          severity: 'blocking',
          code: 'SUPPORTED_DOCUMENT_NOT_EXTRACTED',
          message: `Could not extract supported document ${document.filePath}.`,
          impactedArea: 'extraction',
          sourceReferences: [document.filePath],
          suggestedNextAction:
            'Provide a mock sidecar, retry live extraction, or tighten the extraction logic before trusting this run.',
        });
        updateProgress({
          phase: 'extraction',
          currentDocument: {
            id: document.id,
            fileName: document.fileName,
            detectedFormType: document.detectedFormType,
            index: index + 1,
            total: documents.length,
            step: 'blocked',
          },
          note: `No extraction path available for supported form ${document.fileName}.`,
        });
        continue;
      }

      document.extractionStatus = 'unsupported';
      issues.push({
        schemaVersion: SCHEMA_VERSION,
        severity: unsupportedDocumentSeverity(document.detectedFormType),
        code: 'DOCUMENT_TYPE_NOT_YET_SUPPORTED',
        message: `${document.filePath} is not supported in this slice.`,
        impactedArea: 'extraction',
        sourceReferences: [document.filePath],
        suggestedNextAction:
          'Treat this estimate as incomplete until deterministic support exists for this document type.',
      });
      updateProgress({
        phase: 'extraction',
        currentDocument: {
          id: document.id,
          fileName: document.fileName,
          detectedFormType: document.detectedFormType,
          index: index + 1,
          total: documents.length,
          step: 'unsupported',
        },
        note: `Marked ${document.fileName} as unsupported for deterministic extraction.`,
      });
    }

    updateProgress({
      phase: 'extraction',
      completedStep: 'extraction',
      currentDocument: null,
      note: `Extraction complete. ${extractedDocuments.length}/${documents.length} document(s) extracted.`,
    });

    const missingDocuments = inferLikelyMissingDocuments(documents);
    for (const missing of missingDocuments) {
      issues.push({
        schemaVersion: SCHEMA_VERSION,
        severity: 'warning',
        code: 'LIKELY_MISSING_DOCUMENT',
        message: `Expected but did not detect ${missing}.`,
        impactedArea: 'document-inventory',
        sourceReferences: [],
        suggestedNextAction: `Add the ${missing} document if it applies to this return.`,
      });
    }

    updateProgress({
      phase: 'research',
      note: 'Starting unknown/unsupported document research pass.',
    });
    let researchResult: Awaited<ReturnType<typeof runResearchAgent>> = null;
    try {
      researchResult = await runResearchAgent({
        profile: options.profile,
        documents,
        existingIssues: issues,
        onProgress(message) {
          updateProgress({
            phase: 'research',
            note: message,
          });
        },
      });
    } catch (error) {
      issues.push({
        schemaVersion: SCHEMA_VERSION,
        severity: 'warning',
        code: 'RESEARCH_AGENT_FAILED',
        message: `Research agent failed: ${(error as Error).message}`,
        impactedArea: 'document-research',
        sourceReferences: [],
        suggestedNextAction: 'Review unknown documents manually or rerun after improving research instrumentation.',
      });
      updateProgress({
        phase: 'research',
        note: `Research agent failed: ${(error as Error).message}`,
      });
    }
    if (researchResult) {
      for (const strategy of researchResult.strategies) {
        issues.push({
          schemaVersion: SCHEMA_VERSION,
          severity: strategy.blocking ? 'blocking' : 'warning',
          code: 'AGENT_DOCUMENT_STRATEGY',
          message: `Agent strategy for ${strategy.docId} (${strategy.formTypeGuess}): ${strategy.recommendedHandling}`,
          impactedArea: 'document-research',
          sourceReferences: [strategy.docId],
          suggestedNextAction: strategy.sourceSummary || 'Review the researched strategy before filing.',
        });
      }
      updateProgress({
        phase: 'research',
        completedStep: 'research',
        note: `Research pass complete. Generated ${researchResult.strategies.length} strategy note(s).`,
      });
    } else {
      updateProgress({
        phase: 'research',
        completedStep: 'research',
        note: 'Research pass ended without strategy output.',
      });
    }

    updateProgress({
      phase: 'preview',
      note: 'Building aggregated preview from extracted documents.',
    });
    const preview = buildAggregatedPreview({
      schemaVersion: SCHEMA_VERSION,
      documents,
      extractedDocuments,
    });
    issues.push(...preview.issues);
    issues.push(...collectComputationCoverageIssues(preview.federalReturnInputs));

    issues.push(...collectUnsupportedScenarioIssues(options, documents, extractedDocuments));

  const federalEstimatedPayments = roundMoney(
    options.profile.estimatedPayments
      .filter((payment) => payment.jurisdiction === 'federal')
      .reduce((sum, payment) => sum + payment.amount, 0)
  );
  const californiaEstimatedPayments = roundMoney(
    options.profile.estimatedPayments
      .filter((payment) => payment.jurisdiction === 'california')
      .reduce((sum, payment) => sum + payment.amount, 0)
  );
  const traditionalIraContributions = roundMoney(
    Math.max(
      options.profile.iraContributions
        .filter((contribution) => contribution.accountType === 'traditional_ira')
        .reduce((sum, contribution) => sum + contribution.amount, 0),
      numericMetaValue(preview.federalReturnInputs.traditional_ira_contribution_preview)
    )
  );

    updateProgress({
      phase: 'compute_federal',
      note: 'Computing deterministic federal return estimate.',
    });
    const federalComputation = computeFederalReturn({
    filingStatus: options.profile.filingStatus,
    wages: numericMetaValue(preview.federalReturnInputs.wages),
    taxableInterest: numericMetaValue(preview.federalReturnInputs.taxable_interest),
    ordinaryDividends: numericMetaValue(preview.federalReturnInputs.ordinary_dividends),
    qualifiedDividends: numericMetaValue(preview.federalReturnInputs.qualified_dividends),
    retirementTaxableAmount: numericMetaValue(preview.federalReturnInputs.retirement_taxable_amount),
    capitalGainDistributions: numericMetaValue(
      preview.federalReturnInputs.capital_gain_distributions
    ),
    shortTermNetGainLoss: numericMetaValue(
      preview.federalReturnInputs.short_term_covered_net_gain_loss_preview
    ),
    longTermNetGainLoss: numericMetaValue(
      preview.federalReturnInputs.long_term_covered_net_gain_loss_preview
    ),
    mortgageInterest: numericMetaValue(preview.federalReturnInputs.mortgage_interest_preview),
    pointsPaid: numericMetaValue(preview.federalReturnInputs.points_paid_preview),
    propertyTaxPaid: numericMetaValue(preview.federalReturnInputs.property_tax_preview),
    stateIncomeTaxPaid:
      numericMetaValue(preview.caReturnInputs.california_withholding) + californiaEstimatedPayments,
    foreignTaxPaid: numericMetaValue(preview.federalReturnInputs.foreign_tax_paid),
    federalWithholding: numericMetaValue(preview.federalReturnInputs.federal_withholding),
    federalEstimatedPayments,
    traditionalIraContributions,
    section199aDividends: numericMetaValue(preview.federalReturnInputs.section_199a_dividends),
    workplaceRetirementCovered: hasPositiveField(extractedDocuments, 'box12_code_d'),
  });
    for (const message of federalComputation.issues) {
      issues.push({
        schemaVersion: SCHEMA_VERSION,
        severity: 'warning',
        code: 'FEDERAL_COMPUTATION_WARNING',
        message,
        impactedArea: 'federal-computation',
        sourceReferences: [],
        suggestedNextAction: 'Review this assumption before filing.',
      });
    }

    updateProgress({
      phase: 'compute_california',
      note: 'Computing deterministic California return estimate.',
    });
    const californiaComputation = computeCaliforniaReturn({
    filingStatus: options.profile.filingStatus,
    federalAgi: federalComputation.agi,
    californiaWages: numericMetaValue(preview.caReturnInputs.california_wages),
    mortgageInterest: numericMetaValue(preview.federalReturnInputs.mortgage_interest_preview),
    pointsPaid: numericMetaValue(preview.federalReturnInputs.points_paid_preview),
    propertyTaxPaid: numericMetaValue(preview.federalReturnInputs.property_tax_preview),
    californiaWithholding: numericMetaValue(preview.caReturnInputs.california_withholding),
    californiaEstimatedPayments,
    dependents: options.profile.dependents,
  });
    for (const message of californiaComputation.issues) {
      issues.push({
        schemaVersion: SCHEMA_VERSION,
        severity: 'warning',
        code: 'CALIFORNIA_COMPUTATION_WARNING',
        message,
        impactedArea: 'california-computation',
        sourceReferences: [],
        suggestedNextAction: 'Review this assumption before filing.',
      });
    }

    updateProgress({
      phase: 'reconciliation',
      note: 'Building reconciliation report and handoff artifacts.',
    });
    const reconciliation: ReconciliationReport = {
    schemaVersion: SCHEMA_VERSION,
    taxYear: options.profile.taxYear,
    confidence: issues.some((issue) => issue.severity === 'blocking') ? 'low' : 'medium',
    checks: [
      {
        name: 'document_inventory_completed',
        status: 'pass',
        message: `Discovered ${documents.length} supported input file(s).`,
      },
      ...preview.reconciliationChecks,
      {
        name: 'supported_scenario_check',
        status: issues.some((issue) => issue.code === 'UNSUPPORTED_SCENARIO') ? 'blocking' : 'pass',
        message: issues.some((issue) => issue.code === 'UNSUPPORTED_SCENARIO')
          ? 'One or more unsupported scenario flags were detected.'
          : 'Current run stays within the supported deterministic scenario.',
      },
    ],
    missingDocumentsLikelyRequired: missingDocuments,
    stageDecisionLog: [
      'Completed document inventory.',
      'Ran mock, deterministic, and live extraction across the supported document set.',
      'Built deterministic preview aggregates for extracted documents.',
      'Computed deterministic federal and California estimates for the supported scenario.',
      'Material unsupported document types are treated as blocking until deterministic support exists.',
    ],
  };

    const extractionBlocking = documents.length === 0;
    if (extractionBlocking) {
      issues.push({
        schemaVersion: SCHEMA_VERSION,
        severity: 'blocking',
        code: 'NO_INPUT_DOCUMENTS',
        message: 'No supported tax documents were found in the input directory.',
        impactedArea: 'document-inventory',
        sourceReferences: [],
        suggestedNextAction: 'Add PDFs or images for the relevant tax forms and rerun the command.',
      });
    } else if (extractedDocuments.length === 0) {
      issues.push({
        schemaVersion: SCHEMA_VERSION,
        severity: 'blocking',
        code: 'NO_DOCUMENTS_EXTRACTED',
        message: 'No documents were successfully extracted in this run.',
        impactedArea: 'pipeline',
        sourceReferences: [],
        suggestedNextAction: 'Add mock sidecars for supported documents or continue implementing extraction.',
      });
    }

    const inputFingerprint = crypto
    .createHash('sha256')
    .update(JSON.stringify({
      files: documents.map((doc) => doc.filePath),
      profile: options.profile,
    }))
    .digest('hex')
    .slice(0, 16);

    const estimateSummary: EstimateSummary = {
    schemaVersion: SCHEMA_VERSION,
    taxYear: options.profile.taxYear,
    generatedAt: new Date().toISOString(),
    inputFingerprint,
    confidence: issues.some((issue) => issue.severity === 'blocking') ? 'low' : 'medium',
    federalRefundOrAmountOwed: {
      value: federalComputation.refundOrAmountOwed,
      derivationType: 'computed',
      references: extractedDocuments.map((document) => document.documentId),
    },
    caRefundOrAmountOwed: {
      value: californiaComputation.refundOrAmountOwed,
      derivationType: 'computed',
      references: extractedDocuments.map((document) => document.documentId),
    },
    deductionChoice: {
      federal: federalComputation.deductionChoice,
      california: californiaComputation.deductionChoice,
    },
    optimizations: buildOptimizationNotes(federalComputation, californiaComputation),
    blockingIssueCount: issues.filter((issue) => issue.severity === 'blocking').length,
  };

    const federalReturnInputs = {
    schemaVersion: SCHEMA_VERSION,
    taxYear: options.profile.taxYear,
    generatedAt: new Date().toISOString(),
    inputFingerprint,
    confidence: estimateSummary.confidence,
    ...preview.federalReturnInputs,
    traditional_ira_deduction: {
      value: federalComputation.traditionalIraDeduction,
      derivationType: 'computed',
      references: extractedDocuments.map((document) => document.documentId),
    },
    section_199a_deduction: {
      value: federalComputation.section199aDeduction,
      derivationType: 'computed',
      references: extractedDocuments.map((document) => document.documentId),
    },
    agi: {
      value: federalComputation.agi,
      derivationType: 'computed',
      references: extractedDocuments.map((document) => document.documentId),
    },
    deduction_choice: federalComputation.deductionChoice,
    chosen_deduction: {
      value:
        federalComputation.deductionChoice === 'itemized'
          ? federalComputation.itemizedDeduction
          : federalComputation.standardDeduction,
      derivationType: 'computed',
      references: extractedDocuments.map((document) => document.documentId),
    },
    taxable_income: {
      value: federalComputation.taxableIncome,
      derivationType: 'computed',
      references: extractedDocuments.map((document) => document.documentId),
    },
    tax_before_payments: {
      value: federalComputation.taxBeforePayments,
      derivationType: 'computed',
      references: extractedDocuments.map((document) => document.documentId),
    },
    foreign_tax_credit_applied: {
      value: federalComputation.foreignTaxCreditApplied,
      derivationType: 'computed',
      references: extractedDocuments.map((document) => document.documentId),
    },
    federal_refund_or_amount_owed: {
      value: federalComputation.refundOrAmountOwed,
      derivationType: 'computed',
      references: extractedDocuments.map((document) => document.documentId),
    },
    status: 'computed_supported_scenario',
  };

    const caReturnInputs = {
    schemaVersion: SCHEMA_VERSION,
    taxYear: options.profile.taxYear,
    generatedAt: new Date().toISOString(),
    inputFingerprint,
    confidence: estimateSummary.confidence,
    ...preview.caReturnInputs,
    california_agi: {
      value: californiaComputation.californiaAgi,
      derivationType: 'computed',
      references: extractedDocuments.map((document) => document.documentId),
    },
    deduction_choice: californiaComputation.deductionChoice,
    chosen_deduction: {
      value:
        californiaComputation.deductionChoice === 'itemized'
          ? californiaComputation.itemizedDeduction
          : californiaComputation.standardDeduction,
      derivationType: 'computed',
      references: extractedDocuments.map((document) => document.documentId),
    },
    taxable_income: {
      value: californiaComputation.taxableIncome,
      derivationType: 'computed',
      references: extractedDocuments.map((document) => document.documentId),
    },
    tax_after_credits: {
      value: californiaComputation.taxAfterCredits,
      derivationType: 'computed',
      references: extractedDocuments.map((document) => document.documentId),
    },
    california_refund_or_amount_owed: {
      value: californiaComputation.refundOrAmountOwed,
      derivationType: 'computed',
      references: extractedDocuments.map((document) => document.documentId),
    },
    status: 'computed_supported_scenario',
  };

    const handoff = renderHandoff({
      inputDir: options.inputDir,
      profile: options.profile,
      documents,
      extractedDocuments,
      federalReturnInputs,
      caReturnInputs,
      issues,
    });

    writeJson(path.join(options.outputDir, 'taxpayer_profile.json'), options.profile);
    writeJson(path.join(options.outputDir, 'documents.json'), documents);
    writeJson(path.join(options.outputDir, 'reconciliation.json'), reconciliation);
    writeJson(path.join(options.outputDir, 'issues_to_review.json'), issues);
    writeJson(path.join(options.outputDir, 'federal_return_inputs.json'), federalReturnInputs);
    writeJson(path.join(options.outputDir, 'ca_return_inputs.json'), caReturnInputs);
    writeJson(path.join(options.outputDir, 'estimate_summary.json'), estimateSummary);
    writeText(path.join(options.outputDir, 'turbotax_handoff.md'), handoff);

    updateProgress({
      phase: 'done',
      status: 'completed',
      completedStep: 'artifacts',
      currentDocument: null,
      note: `Run complete. Wrote final outputs with ${issues.filter((issue) => issue.severity === 'blocking').length} blocking issue(s).`,
    });

    return {
      exitCode: issues.some((issue) => issue.severity === 'blocking') ? 1 : 0,
      outputDir: options.outputDir,
      issues,
    };
  } catch (error) {
    updateProgress({
      phase: 'error',
      status: 'failed',
      currentDocument: progress.currentDocument,
      note: `Run failed: ${(error as Error).message}`,
    });
    throw error;
  }
}

function inferTaxYear(filePath: string): number | null {
  const match = filePath.match(/\b(20\d{2})\b/);
  if (!match) {
    return null;
  }
  return Number(match[1]);
}

function inferLikelyMissingDocuments(documents: DocumentInventoryItem[]): string[] {
  const types = new Set(documents.map((doc) => doc.detectedFormType));
  const missing: string[] = [];

  if (!types.has('W-2')) {
    missing.push('W-2');
  }

  return missing;
}

function renderHandoff(args: {
  inputDir: string;
  profile: RunPipelineOptions['profile'];
  documents: DocumentInventoryItem[];
  extractedDocuments: ExtractedDocument[];
  federalReturnInputs: Record<string, unknown>;
  caReturnInputs: Record<string, unknown>;
  issues: ReviewIssue[];
}): string {
  const lines: string[] = [
    '# TurboTax Handoff',
    '',
    'This output is generated from deterministic computations for the currently supported scenario.',
    '',
    '## Taxpayer Profile',
    `- Tax year: ${args.profile.taxYear}`,
    `- Filing status: ${args.profile.filingStatus}`,
    `- State: ${args.profile.state}`,
    `- Full-year resident: ${args.profile.fullYearResident ? 'yes' : 'no'}`,
    `- Dependents: ${args.profile.dependents}`,
    '',
    '## Document Inventory',
  ];

  if (args.issues.some((issue) => issue.severity === 'blocking')) {
    lines.splice(
      4,
      0,
      '**Status:** Incomplete estimate. One or more blocking issues remain, so these totals should not be used for filing as-is.',
      ''
    );
  }

  if (args.documents.length === 0) {
    lines.push('- No supported documents found.');
  } else {
    for (const document of args.documents) {
      lines.push(
        `- ${document.fileName}: ${document.detectedFormType} (confidence: ${document.confidence})`
      );
    }
  }

  lines.push('', '## W-2 Entries');
  lines.push(`- Wages: ${renderMetaValue(args.federalReturnInputs.wages)}`);
  lines.push(`- Federal withholding: ${renderMetaValue(args.federalReturnInputs.federal_withholding)}`);
  lines.push(`- California wages: ${renderMetaValue(args.caReturnInputs.california_wages)}`);
  lines.push(`- California withholding: ${renderMetaValue(args.caReturnInputs.california_withholding)}`);

  lines.push('', '## Interest And Dividends');
  lines.push(`- Taxable interest: ${renderMetaValue(args.federalReturnInputs.taxable_interest)}`);
  lines.push(`- Tax-exempt interest: ${renderMetaValue(args.federalReturnInputs.tax_exempt_interest)}`);
  lines.push(`- Foreign tax paid: ${renderMetaValue(args.federalReturnInputs.foreign_tax_paid)}`);
  lines.push(`- Ordinary dividends: ${renderMetaValue(args.federalReturnInputs.ordinary_dividends)}`);
  lines.push(`- Qualified dividends: ${renderMetaValue(args.federalReturnInputs.qualified_dividends)}`);
  lines.push(`- Section 199A dividends: ${renderMetaValue(args.federalReturnInputs.section_199a_dividends)}`);
  lines.push(
    `- Specified private activity bond interest: ${renderMetaValue(args.federalReturnInputs.specified_private_activity_bond_interest)}`
  );
  lines.push(
    `- Nondividend distributions: ${renderMetaValue(args.federalReturnInputs.nondividend_distributions)}`
  );

  lines.push('', '## Investments');
  lines.push(`- Short-term covered proceeds: ${renderMetaValue(args.federalReturnInputs.short_term_covered_proceeds)}`);
  lines.push(`- Short-term covered basis: ${renderMetaValue(args.federalReturnInputs.short_term_covered_basis)}`);
  lines.push(
    `- Short-term wash sale adjustments: ${renderMetaValue(args.federalReturnInputs.short_term_wash_sale_adjustments)}`
  );
  lines.push(`- Short-term covered net gain/loss preview: ${renderMetaValue(args.federalReturnInputs.short_term_covered_net_gain_loss_preview)}`);
  lines.push(`- Long-term covered proceeds: ${renderMetaValue(args.federalReturnInputs.long_term_covered_proceeds)}`);
  lines.push(`- Long-term covered basis: ${renderMetaValue(args.federalReturnInputs.long_term_covered_basis)}`);
  lines.push(
    `- Long-term wash sale adjustments: ${renderMetaValue(args.federalReturnInputs.long_term_wash_sale_adjustments)}`
  );
  lines.push(`- Long-term covered net gain/loss preview: ${renderMetaValue(args.federalReturnInputs.long_term_covered_net_gain_loss_preview)}`);
  lines.push(`- Capital gain distributions: ${renderMetaValue(args.federalReturnInputs.capital_gain_distributions)}`);

  lines.push('', '## Retirement And IRA');
  lines.push(`- Taxable retirement distributions: ${renderMetaValue(args.federalReturnInputs.retirement_taxable_amount)}`);
  lines.push(`- Traditional IRA contribution preview: ${renderMetaValue(args.federalReturnInputs.traditional_ira_contribution_preview)}`);
  lines.push(`- Traditional IRA deduction applied: ${renderMetaValue(args.federalReturnInputs.traditional_ira_deduction)}`);
  lines.push(`- Section 199A deduction applied: ${renderMetaValue(args.federalReturnInputs.section_199a_deduction)}`);

  lines.push('', '## Mortgage And Property Tax');
  lines.push(`- Mortgage interest preview: ${renderMetaValue(args.federalReturnInputs.mortgage_interest_preview)}`);
  lines.push(`- Property tax preview: ${renderMetaValue(args.federalReturnInputs.property_tax_preview)}`);
  lines.push(`- Points paid preview: ${renderMetaValue(args.federalReturnInputs.points_paid_preview)}`);

  lines.push('', '## Estimated Outcome');
  lines.push(`- Federal deduction choice: ${String(args.federalReturnInputs.deduction_choice || 'n/a')}`);
  lines.push(`- Federal AGI: ${renderMetaValue(args.federalReturnInputs.agi)}`);
  lines.push(`- Federal taxable income: ${renderMetaValue(args.federalReturnInputs.taxable_income)}`);
  lines.push(
    `- Foreign tax credit applied in estimate: ${renderMetaValue(args.federalReturnInputs.foreign_tax_credit_applied)}`
  );
  lines.push(`- Estimated federal refund/(owed): ${renderMetaValue(args.federalReturnInputs.federal_refund_or_amount_owed)}`);
  lines.push(`- California deduction choice: ${String(args.caReturnInputs.deduction_choice || 'n/a')}`);
  lines.push(`- California taxable income: ${renderMetaValue(args.caReturnInputs.taxable_income)}`);
  lines.push(`- Estimated California refund/(owed): ${renderMetaValue(args.caReturnInputs.california_refund_or_amount_owed)}`);

  lines.push('', '## Review Issues');
  if (args.issues.length === 0) {
    lines.push('- No current issues.');
  } else {
    for (const issue of args.issues) {
      lines.push(`- [${issue.severity}] ${issue.message} Next: ${issue.suggestedNextAction}`);
    }
  }

  lines.push('', '## Status', '- Deterministic estimation is implemented for the supported scenario. Live extraction is available for supported forms when mock sidecars are absent and `OPENAI_API_KEY` is set.');
  if (args.issues.some((issue) => issue.code === 'AGENT_DOCUMENT_STRATEGY')) {
    lines.push('- Agent research strategies were generated for unknown or unsupported documents.');
  }
  if (args.issues.some((issue) => issue.severity === 'blocking')) {
    lines.push('- Blocking issues remain. The estimate is incomplete until those issues are resolved.');
  }
  return `${lines.join('\n')}\n`;
}

function renderMetaValue(value: unknown): string {
  if (!value || typeof value !== 'object' || !('value' in value)) {
    return 'n/a';
  }
  const maybeValue = (value as { value: unknown }).value;
  return maybeValue === null ? 'n/a' : String(maybeValue);
}

function numericMetaValue(value: unknown): number {
  if (!value || typeof value !== 'object' || !('value' in value)) {
    return 0;
  }
  const raw = (value as { value: unknown }).value;
  return typeof raw === 'number' ? raw : 0;
}

function hasPositiveField(documents: ExtractedDocument[], fieldName: string): boolean {
  return documents.some((document) => {
    const raw = document.fields[fieldName]?.value;
    return typeof raw === 'number' && raw > 0;
  });
}

function collectUnsupportedScenarioIssues(
  options: RunPipelineOptions,
  documents: DocumentInventoryItem[],
  extractedDocuments: ExtractedDocument[]
): ReviewIssue[] {
  const issues: ReviewIssue[] = [];

  if (!options.profile.fullYearResident) {
    issues.push(unsupportedIssue('Full-year California residency is required for the current deterministic flow.'));
  }
  if (options.profile.dependents > 0) {
    issues.push(
      unsupportedIssue('Federal dependent-related credits are not implemented in the current deterministic flow.')
    );
  }
  if (
    options.profile.scenarioFlags.rsu ||
    options.profile.scenarioFlags.espp ||
    options.profile.scenarioFlags.inheritedShares
  ) {
    issues.push(
      unsupportedIssue('RSU, ESPP, or inherited-share scenarios are not implemented in the current deterministic flow.')
    );
  }
  return issues;
}

function validateExtractedDocument(
  document: ExtractedDocument,
  targetTaxYear: number
): ReviewIssue[] {
  const issues: ReviewIssue[] = [];

  if (document.taxYear !== null && document.taxYear !== targetTaxYear) {
    issues.push({
      schemaVersion: SCHEMA_VERSION,
      severity: 'blocking',
      code: 'DOCUMENT_TAX_YEAR_MISMATCH',
      message: `${document.documentType} ${document.documentId} appears to be for tax year ${document.taxYear}, expected ${targetTaxYear}.`,
      impactedArea: 'extraction-validation',
      sourceReferences: [document.documentId],
      suggestedNextAction:
        'Verify whether the extractor picked up the form revision year instead of the reporting year, then correct the extraction before relying on this run.',
    });
  }

  if (document.fields.has_unsupported_brokerage_rows?.value === true) {
    issues.push({
      schemaVersion: SCHEMA_VERSION,
      severity: 'blocking',
      code: 'UNSUPPORTED_BROKERAGE_BASIS_CATEGORY',
      message: `${document.documentType} ${document.documentId} includes noncovered or unknown-term brokerage rows that are not yet mapped into the deterministic return path.`,
      impactedArea: 'extraction-validation',
      sourceReferences: [document.documentId],
      suggestedNextAction:
        'Review the brokerage statement manually or extend the parser to capture the unsupported basis categories before relying on this run.',
    });
  }

  if (
    document.documentType === 'property-tax-bill' &&
    document.fields.property_tax_first_installment_paid?.value !== true
  ) {
    issues.push({
      schemaVersion: SCHEMA_VERSION,
      severity: 'warning',
      code: 'PROPERTY_TAX_PAYMENT_NOT_CONFIRMED',
      message: `Property tax bill ${document.documentId} did not include clear evidence of payment during the tax year.`,
      impactedArea: 'extraction-validation',
      sourceReferences: [document.documentId],
      suggestedNextAction:
        'Confirm the actual payment date and amount before claiming the property tax deduction.',
    });
  }

  return issues;
}

async function reconcileExtractedTaxYear(args: {
  inputDir: string;
  document: DocumentInventoryItem;
  extracted: ExtractedDocument;
  targetTaxYear: number;
}): Promise<{
  extracted: ExtractedDocument;
  issues: ReviewIssue[];
}> {
  const sourceTextYear = detectSourceDocumentTaxYear(args.inputDir, args.document);
  if (
    sourceTextYear !== null &&
    sourceTextYear === args.targetTaxYear &&
    args.extracted.taxYear !== sourceTextYear
  ) {
    return {
      extracted: {
        ...args.extracted,
        taxYear: sourceTextYear,
      },
      issues: [
        {
          schemaVersion: SCHEMA_VERSION,
          severity: 'warning',
          code: 'DOCUMENT_TAX_YEAR_CORRECTED_FROM_SOURCE_TEXT',
          message: `${args.document.fileName} extraction returned tax year ${args.extracted.taxYear}, but source text clearly indicates tax year ${sourceTextYear}; the pipeline corrected it.`,
          impactedArea: 'extraction-validation',
          sourceReferences: [args.document.filePath],
          suggestedNextAction:
            'Review the corrected tax year if the form is unusual, but this no longer blocks the run.',
        },
      ],
    };
  }

  if (
    args.extracted.taxYear !== null &&
    args.extracted.taxYear !== args.targetTaxYear &&
    sourceTextYear === null
  ) {
    try {
      const review = await reviewLiveDocumentTaxYear({
        inputDir: args.inputDir,
        document: args.document,
      });
      if (review && review.taxYear === args.targetTaxYear) {
        return {
          extracted: {
            ...args.extracted,
            taxYear: review.taxYear,
          },
          issues: [
            {
              schemaVersion: SCHEMA_VERSION,
              severity: 'warning',
              code: 'DOCUMENT_TAX_YEAR_CORRECTED_BY_LIVE_REVIEW',
              message: `${args.document.fileName} extraction returned tax year ${args.extracted.taxYear}, but a targeted live review determined the reporting tax year is ${review.taxYear}.`,
              impactedArea: 'extraction-validation',
              sourceReferences: [args.document.filePath],
              suggestedNextAction:
                review.rationale || 'Review the live tax-year correction if the document is unusual.',
            },
          ],
        };
      }
    } catch {
      return {
        extracted: args.extracted,
        issues: [],
      };
    }
  }

  return {
    extracted: args.extracted,
    issues: [],
  };
}

function detectSourceDocumentTaxYear(
  inputDir: string,
  document: DocumentInventoryItem
): number | null {
  const absolutePath = path.join(inputDir, document.filePath);
  if (path.extname(absolutePath).toLowerCase() !== '.pdf') {
    return null;
  }

  try {
    const text = execFileSync('pdftotext', ['-f', '1', '-l', '2', absolutePath, '-'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 1024 * 1024,
    });
    const patterns = [
      /for calendar year\s*(20\d{2})/i,
      /tax year[^0-9]{0,20}(20\d{2})/i,
      /for tax year[^0-9]{0,20}(20\d{2})/i,
      /(?:^|\s)(20\d{2})\s+tax reporting statement/i,
      /(?:^|\s)(20\d{2})\s+1099-(?:div|int|b|misc|oid|r)\b/i,
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return Number(match[1]);
      }
    }
  } catch {
    return null;
  }

  return null;
}

function collectComputationCoverageIssues(
  federalReturnInputs: Record<string, unknown>
): ReviewIssue[] {
  const issues: ReviewIssue[] = [];

  if (numericMetaValue(federalReturnInputs.nondividend_distributions) > 0) {
    issues.push({
      schemaVersion: SCHEMA_VERSION,
      severity: 'warning',
      code: 'NONDIVIDEND_DISTRIBUTION_REVIEW',
      message:
        'Nondividend distributions were detected. They usually reduce basis rather than current-year taxable income.',
      impactedArea: 'federal-computation',
      sourceReferences: [],
      suggestedNextAction:
        'Enter the nondividend distribution values in filing software and confirm basis tracking for the affected holdings.',
    });
  }

  return issues;
}

function unsupportedDocumentSeverity(documentType: DocumentType): ReviewIssue['severity'] {
  return isMaterialDocumentType(documentType) ? 'blocking' : 'warning';
}

function isMaterialDocumentType(documentType: DocumentType): boolean {
  switch (documentType) {
    case 'prior-year-return':
      return false;
    case 'unknown':
    case 'W-2':
    case '1099-INT':
    case '1099-DIV':
    case '1099-B':
    case '1099-composite':
    case '1098':
    case '5498':
    case '1099-R':
    case 'property-tax-bill':
      return true;
  }
}

function unsupportedIssue(message: string): ReviewIssue {
  return {
    schemaVersion: SCHEMA_VERSION,
    severity: 'blocking',
    code: 'UNSUPPORTED_SCENARIO',
    message,
    impactedArea: 'scenario-support',
    sourceReferences: [],
    suggestedNextAction: 'Narrow the scenario or implement the missing tax logic before relying on this result.',
  };
}

function buildOptimizationNotes(
  federalComputation: ReturnType<typeof computeFederalReturn>,
  californiaComputation: ReturnType<typeof computeCaliforniaReturn>
): string[] {
  const notes: string[] = [];

  notes.push(
    federalComputation.deductionChoice === 'itemized'
      ? 'Federal itemized deduction beats the federal standard deduction for this input set.'
      : 'Federal standard deduction beats or matches federal itemized deductions for this input set.'
  );
  notes.push(
    californiaComputation.deductionChoice === 'itemized'
      ? 'California itemized deduction beats the California standard deduction for this input set.'
      : 'California standard deduction beats or matches California itemized deductions for this input set.'
  );
  if (federalComputation.traditionalIraDeduction > 0) {
    notes.push(`Traditional IRA deduction applied: ${federalComputation.traditionalIraDeduction}.`);
  }
  if (federalComputation.section199aDeduction > 0) {
    notes.push(`Section 199A deduction applied: ${federalComputation.section199aDeduction}.`);
  }
  if (federalComputation.foreignTaxCreditApplied > 0) {
    notes.push(
      `Simplified foreign tax credit applied in the estimate: ${federalComputation.foreignTaxCreditApplied}.`
    );
  }

  return notes;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
