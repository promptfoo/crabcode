import type { DocumentInventoryItem, ExtractedDocument, ReviewIssue, ValueWithMeta } from '../types.js';

export interface AggregatedPreview {
  federalReturnInputs: Record<string, ValueWithMeta | string>;
  caReturnInputs: Record<string, ValueWithMeta | string>;
  estimateSummary: {
    confidence: 'low' | 'medium' | 'high';
    federalRefundOrAmountOwed: ValueWithMeta;
    caRefundOrAmountOwed: ValueWithMeta;
    deductionChoice: {
      federal: 'unknown';
      california: 'unknown';
    };
    optimizations: string[];
  };
  reconciliationChecks: Array<{
    name: string;
    status: 'pass' | 'warning' | 'blocking';
    message: string;
  }>;
  issues: ReviewIssue[];
}

export function buildAggregatedPreview(args: {
  schemaVersion: string;
  documents: DocumentInventoryItem[];
  extractedDocuments: ExtractedDocument[];
}): AggregatedPreview {
  const issues: ReviewIssue[] = [];
  const references = args.extractedDocuments.map((doc) => doc.documentId);

  const w2Docs = args.extractedDocuments.filter((doc) => doc.documentType === 'W-2');
  const intDocs = args.extractedDocuments.filter((doc) => doc.documentType === '1099-INT');
  const divDocs = args.extractedDocuments.filter((doc) => doc.documentType === '1099-DIV');
  const mortgageDocs = args.extractedDocuments.filter((doc) => doc.documentType === '1098');
  const brokerageDocs = args.extractedDocuments.filter((doc) => doc.documentType === '1099-B');
  const compositeDocs = args.extractedDocuments.filter((doc) => doc.documentType === '1099-composite');
  const propertyTaxDocs = args.extractedDocuments.filter(
    (doc) => doc.documentType === 'property-tax-bill'
  );
  const retirementDocs = args.extractedDocuments.filter((doc) => doc.documentType === '1099-R');
  const iraContributionDocs = args.extractedDocuments.filter((doc) => doc.documentType === '5498');
  const brokerageLikeDocs = [...brokerageDocs, ...compositeDocs];

  const wages = sumField(w2Docs, 'box1_wages');
  const federalWithholding =
    sumField(w2Docs, 'box2_federal_withholding') +
    sumField(intDocs, 'federal_withholding') +
    sumField(divDocs, 'federal_withholding') +
    sumField(compositeDocs, 'federal_withholding') +
    sumField(retirementDocs, 'federal_withholding');
  const caWages = sumField(w2Docs, 'state_ca_wages');
  const caWithholding =
    sumField(w2Docs, 'state_ca_withholding') + sumField(retirementDocs, 'state_withholding');
  const taxableInterest =
    sumField(intDocs, 'interest_income') + sumField(compositeDocs, 'interest_income');
  const ordinaryDividends =
    sumField(divDocs, 'ordinary_dividends') + sumField(compositeDocs, 'ordinary_dividends');
  const qualifiedDividends =
    sumField(divDocs, 'qualified_dividends') + sumField(compositeDocs, 'qualified_dividends');
  const capitalGainDistributions =
    sumField(divDocs, 'capital_gain_distributions') +
    sumField(compositeDocs, 'capital_gain_distributions');
  const retirementTaxableAmount = sumField(retirementDocs, 'taxable_amount');
  const traditionalIraContributionPreview = sumConditionalField(
    iraContributionDocs,
    'account_type',
    'traditional_ira',
    'contribution_amount'
  );
  const mortgageInterest = sumField(mortgageDocs, 'mortgage_interest_received');
  const propertyTaxPaid =
    sumField(mortgageDocs, 'property_tax_paid') + sumField(propertyTaxDocs, 'property_tax_paid');
  const pointsPaid = sumField(mortgageDocs, 'points_paid');
  const foreignTaxPaid =
    sumField(intDocs, 'foreign_tax_paid') +
    sumField(divDocs, 'foreign_tax_paid') +
    sumField(compositeDocs, 'foreign_tax_paid');
  const taxExemptInterest =
    sumField(intDocs, 'tax_exempt_interest') +
    sumField(divDocs, 'tax_exempt_interest') +
    sumField(compositeDocs, 'tax_exempt_interest');
  const specifiedPrivateActivityBondInterest =
    sumField(intDocs, 'specified_private_activity_bond_interest') +
    sumField(divDocs, 'specified_private_activity_bond_interest') +
    sumField(compositeDocs, 'specified_private_activity_bond_interest');
  const section199aDividends =
    sumField(divDocs, 'section_199a_dividends') + sumField(compositeDocs, 'section_199a_dividends');
  const nondividendDistributions =
    sumField(divDocs, 'nondividend_distributions') +
    sumField(compositeDocs, 'nondividend_distributions');
  const shortTermCoveredProceeds = sumField(brokerageLikeDocs, 'short_term_covered_proceeds');
  const shortTermCoveredBasis = sumField(brokerageLikeDocs, 'short_term_covered_basis');
  const shortTermWashSaleAdjustments = sumField(
    brokerageLikeDocs,
    'short_term_wash_sale_adjustments'
  );
  const longTermCoveredProceeds = sumField(brokerageLikeDocs, 'long_term_covered_proceeds');
  const longTermCoveredBasis = sumField(brokerageLikeDocs, 'long_term_covered_basis');
  const longTermWashSaleAdjustments = sumField(
    brokerageLikeDocs,
    'long_term_wash_sale_adjustments'
  );
  const shortTermNetGainLossPreview = sumNetGainField(
    brokerageLikeDocs,
    'short_term_covered_net_gain_loss',
    'short_term_covered_proceeds',
    'short_term_covered_basis',
    'short_term_wash_sale_adjustments'
  );
  const longTermNetGainLossPreview = sumNetGainField(
    brokerageLikeDocs,
    'long_term_covered_net_gain_loss',
    'long_term_covered_proceeds',
    'long_term_covered_basis',
    'long_term_wash_sale_adjustments'
  );
  const totalIncomePreview = roundMoney(
    wages +
      taxableInterest +
      ordinaryDividends +
      retirementTaxableAmount +
      capitalGainDistributions +
      shortTermNetGainLossPreview +
      longTermNetGainLossPreview
  );

  const reconciliationChecks: AggregatedPreview['reconciliationChecks'] = [
    {
      name: 'w2_present',
      status: w2Docs.length > 0 ? 'pass' : 'blocking',
      message: w2Docs.length > 0 ? 'Found at least one W-2 document.' : 'No W-2 document extracted.',
    },
    {
      name: 'qualified_dividends_not_greater_than_ordinary',
      status: qualifiedDividends <= ordinaryDividends ? 'pass' : 'blocking',
      message:
        qualifiedDividends <= ordinaryDividends
          ? 'Qualified dividends reconcile against ordinary dividends.'
          : 'Qualified dividends exceed ordinary dividends.',
    },
    {
      name: 'ca_wages_match_w2_count',
      status: w2Docs.length === 0 || caWages > 0 ? 'pass' : 'warning',
      message:
        w2Docs.length === 0 || caWages > 0
          ? 'California wage fields are present for extracted W-2 data.'
          : 'California wages are missing from extracted W-2 data.',
    },
    {
      name: 'mortgage_interest_supported_if_1098_present',
      status: mortgageDocs.length === 0 || mortgageInterest > 0 ? 'pass' : 'warning',
      message:
        mortgageDocs.length === 0 || mortgageInterest > 0
          ? 'Mortgage interest preview is populated when a 1098 is present.'
          : '1098 extracted but mortgage interest is missing.',
    },
    {
      name: 'property_tax_payment_supported_if_property_tax_bill_present',
      status: propertyTaxDocs.length === 0 || propertyTaxPaid > 0 ? 'pass' : 'warning',
      message:
        propertyTaxDocs.length === 0 || propertyTaxPaid > 0
          ? 'Property tax preview is populated when a paid property tax bill is present.'
          : 'Property tax bill extracted but no paid deductible property tax amount was derived.',
    },
  ];

  if (w2Docs.length === 0) {
    issues.push({
      schemaVersion: args.schemaVersion,
      severity: 'blocking',
      code: 'MISSING_W2_EXTRACTION',
      message: 'A W-2 is required for this return path but was not extracted.',
      impactedArea: 'reconciliation',
      sourceReferences: [],
      suggestedNextAction: 'Add a W-2 document and its mock sidecar or implement live extraction.',
    });
  }

  if (qualifiedDividends > ordinaryDividends) {
    issues.push({
      schemaVersion: args.schemaVersion,
      severity: 'blocking',
      code: 'DIVIDEND_RECONCILIATION_FAILED',
      message: 'Qualified dividends exceed ordinary dividends.',
      impactedArea: 'reconciliation',
      sourceReferences: [...divDocs, ...compositeDocs].map((doc) => doc.documentId),
      suggestedNextAction: 'Fix the dividend extraction values before continuing.',
    });
  }

  const confidence = issues.some((issue) => issue.severity === 'blocking')
    ? 'low'
    : args.extractedDocuments.length > 0
      ? 'medium'
      : 'low';

  return {
    federalReturnInputs: {
      status: 'preview_aggregated',
      wages: meta(wages, 'normalized', w2Docs.map((doc) => doc.documentId)),
      taxable_interest: meta(
        taxableInterest,
        'normalized',
        [...intDocs, ...compositeDocs].map((doc) => doc.documentId)
      ),
      tax_exempt_interest: meta(
        taxExemptInterest,
        'normalized',
        [...intDocs, ...divDocs, ...compositeDocs].map((doc) => doc.documentId)
      ),
      foreign_tax_paid: meta(
        foreignTaxPaid,
        'normalized',
        [...intDocs, ...divDocs, ...compositeDocs].map((doc) => doc.documentId)
      ),
      ordinary_dividends: meta(
        ordinaryDividends,
        'normalized',
        [...divDocs, ...compositeDocs].map((doc) => doc.documentId)
      ),
      qualified_dividends: meta(
        qualifiedDividends,
        'normalized',
        [...divDocs, ...compositeDocs].map((doc) => doc.documentId)
      ),
      capital_gain_distributions: meta(
        capitalGainDistributions,
        'normalized',
        [...divDocs, ...compositeDocs].map((doc) => doc.documentId)
      ),
      specified_private_activity_bond_interest: meta(
        specifiedPrivateActivityBondInterest,
        'normalized',
        [...intDocs, ...divDocs, ...compositeDocs].map((doc) => doc.documentId)
      ),
      section_199a_dividends: meta(
        section199aDividends,
        'normalized',
        [...divDocs, ...compositeDocs].map((doc) => doc.documentId)
      ),
      nondividend_distributions: meta(
        nondividendDistributions,
        'normalized',
        [...divDocs, ...compositeDocs].map((doc) => doc.documentId)
      ),
      retirement_taxable_amount: meta(
        retirementTaxableAmount,
        'normalized',
        retirementDocs.map((doc) => doc.documentId)
      ),
      short_term_covered_proceeds: meta(
        shortTermCoveredProceeds,
        'normalized',
        brokerageLikeDocs.map((doc) => doc.documentId)
      ),
      short_term_covered_basis: meta(
        shortTermCoveredBasis,
        'normalized',
        brokerageLikeDocs.map((doc) => doc.documentId)
      ),
      short_term_wash_sale_adjustments: meta(
        shortTermWashSaleAdjustments,
        'normalized',
        brokerageLikeDocs.map((doc) => doc.documentId)
      ),
      short_term_covered_net_gain_loss_preview: meta(
        shortTermNetGainLossPreview,
        'computed',
        brokerageLikeDocs.map((doc) => doc.documentId)
      ),
      long_term_covered_proceeds: meta(
        longTermCoveredProceeds,
        'normalized',
        brokerageLikeDocs.map((doc) => doc.documentId)
      ),
      long_term_covered_basis: meta(
        longTermCoveredBasis,
        'normalized',
        brokerageLikeDocs.map((doc) => doc.documentId)
      ),
      long_term_wash_sale_adjustments: meta(
        longTermWashSaleAdjustments,
        'normalized',
        brokerageLikeDocs.map((doc) => doc.documentId)
      ),
      long_term_covered_net_gain_loss_preview: meta(
        longTermNetGainLossPreview,
        'computed',
        brokerageLikeDocs.map((doc) => doc.documentId)
      ),
      mortgage_interest_preview: meta(
        mortgageInterest,
        'normalized',
        mortgageDocs.map((doc) => doc.documentId)
      ),
      property_tax_preview: meta(
        propertyTaxPaid,
        'normalized',
        [...mortgageDocs, ...propertyTaxDocs].map((doc) => doc.documentId)
      ),
      points_paid_preview: meta(pointsPaid, 'normalized', mortgageDocs.map((doc) => doc.documentId)),
      federal_withholding: meta(federalWithholding, 'normalized', references),
      total_income_preview: meta(totalIncomePreview, 'computed', references),
      traditional_ira_contribution_preview: meta(
        traditionalIraContributionPreview,
        'normalized',
        iraContributionDocs.map((doc) => doc.documentId)
      ),
    },
    caReturnInputs: {
      status: 'preview_aggregated',
      california_wages: meta(caWages, 'normalized', w2Docs.map((doc) => doc.documentId)),
      california_withholding: meta(caWithholding, 'normalized', w2Docs.map((doc) => doc.documentId)),
      federal_starting_income_preview: meta(totalIncomePreview, 'computed', references),
    },
    estimateSummary: {
      confidence,
      federalRefundOrAmountOwed: meta(null, 'computed', []),
      caRefundOrAmountOwed: meta(null, 'computed', []),
      deductionChoice: {
        federal: 'unknown',
        california: 'unknown',
      },
      optimizations: [],
    },
    reconciliationChecks,
    issues,
  };
}

function sumField(documents: ExtractedDocument[], fieldName: string): number {
  let total = 0;
  for (const document of documents) {
    const raw = document.fields[fieldName]?.value;
    if (typeof raw === 'number') {
      total += raw;
    }
  }
  return roundMoney(total);
}

function sumConditionalField(
  documents: ExtractedDocument[],
  conditionField: string,
  expectedValue: string,
  valueField: string
): number {
  let total = 0;
  for (const document of documents) {
    const condition = document.fields[conditionField]?.value;
    const raw = document.fields[valueField]?.value;
    if (condition === expectedValue && typeof raw === 'number') {
      total += raw;
    }
  }
  return roundMoney(total);
}

function sumNetGainField(
  documents: ExtractedDocument[],
  netField: string,
  proceedsField: string,
  basisField: string,
  washField: string
): number {
  let total = 0;
  for (const document of documents) {
    const directNet = document.fields[netField]?.value;
    if (typeof directNet === 'number') {
      total += directNet;
      continue;
    }

    const proceeds = document.fields[proceedsField]?.value;
    const basis = document.fields[basisField]?.value;
    const wash = document.fields[washField]?.value;
    if (typeof proceeds === 'number' && typeof basis === 'number') {
      total += proceeds - basis + (typeof wash === 'number' ? wash : 0);
    }
  }
  return roundMoney(total);
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function meta(
  value: number | string | boolean | null,
  derivationType: ValueWithMeta['derivationType'],
  references: string[]
): ValueWithMeta {
  return {
    value,
    derivationType,
    references,
  };
}
