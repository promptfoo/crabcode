import {
  FEDERAL_ORDINARY_BRACKETS_2025,
  FEDERAL_QD_FIFTEEN_RATE_THRESHOLD_2025,
  FEDERAL_QD_ZERO_RATE_THRESHOLD_2025,
  FEDERAL_SALT_LIMIT_2025,
  FEDERAL_SALT_MIN_FLOOR_2025,
  FEDERAL_SALT_PHASEDOWN_AGI_2025,
  FEDERAL_STANDARD_DEDUCTION_2025,
  TRADITIONAL_IRA_MAX_CONTRIBUTION_UNDER_50_2025,
  TRADITIONAL_IRA_PHASEOUT_START_2025,
  TRADITIONAL_IRA_PHASEOUT_WIDTH_2025,
} from '../rules/federal-2025.js';
import type { FilingStatus } from '../types.js';

export interface FederalComputationInput {
  filingStatus: FilingStatus;
  wages: number;
  taxableInterest: number;
  ordinaryDividends: number;
  qualifiedDividends: number;
  retirementTaxableAmount: number;
  capitalGainDistributions: number;
  shortTermNetGainLoss: number;
  longTermNetGainLoss: number;
  mortgageInterest: number;
  pointsPaid: number;
  propertyTaxPaid: number;
  stateIncomeTaxPaid: number;
  foreignTaxPaid: number;
  federalWithholding: number;
  federalEstimatedPayments: number;
  traditionalIraContributions: number;
  section199aDividends: number;
  workplaceRetirementCovered: boolean;
}

export interface FederalComputationResult {
  agi: number;
  traditionalIraDeduction: number;
  section199aDeduction: number;
  deductionChoice: 'standard' | 'itemized';
  standardDeduction: number;
  itemizedDeduction: number;
  taxableIncome: number;
  netCapitalGain: number;
  taxBeforePayments: number;
  foreignTaxCreditApplied: number;
  refundOrAmountOwed: number;
  saltDeduction: number;
  issues: string[];
}

export function computeFederalReturn(input: FederalComputationInput): FederalComputationResult {
  const issues: string[] = [];

  const capitalNetPreview = roundMoney(
    input.shortTermNetGainLoss + input.longTermNetGainLoss + input.capitalGainDistributions
  );

  const maxAboveLineIra = computeTraditionalIraDeduction({
    filingStatus: input.filingStatus,
    wages: input.wages,
    agiBeforeIra: roundMoney(
      input.wages +
        input.taxableInterest +
        input.ordinaryDividends +
        input.retirementTaxableAmount +
        capitalNetPreview
    ),
    contributionAmount: input.traditionalIraContributions,
    workplaceRetirementCovered: input.workplaceRetirementCovered,
  });

  const agi = roundMoney(
    input.wages +
      input.taxableInterest +
      input.ordinaryDividends +
      input.retirementTaxableAmount +
      capitalNetPreview -
      maxAboveLineIra
  );

  let saltDeduction: number;
  if (agi <= FEDERAL_SALT_PHASEDOWN_AGI_2025[input.filingStatus]) {
    saltDeduction = Math.min(
      roundMoney(input.propertyTaxPaid + input.stateIncomeTaxPaid),
      FEDERAL_SALT_LIMIT_2025[input.filingStatus]
    );
  } else {
    issues.push(
      'Federal SALT phase-down above the 2025 AGI threshold is not implemented; using the minimum floor deduction.'
    );
    saltDeduction = FEDERAL_SALT_MIN_FLOOR_2025[input.filingStatus];
  }

  const itemizedDeduction = roundMoney(input.mortgageInterest + input.pointsPaid + saltDeduction);
  const standardDeduction = FEDERAL_STANDARD_DEDUCTION_2025[input.filingStatus];
  const deductionChoice = itemizedDeduction > standardDeduction ? 'itemized' : 'standard';
  const chosenDeduction = deductionChoice === 'itemized' ? itemizedDeduction : standardDeduction;
  const taxableIncomeBeforeQbi = roundMoney(Math.max(0, agi - chosenDeduction));
  const netCapitalGain = Math.max(0, capitalNetPreview);
  const section199aDeduction = computeSection199aDeduction({
    section199aDividends: input.section199aDividends,
    taxableIncomeBeforeQbi,
    netCapitalGain,
  });
  const taxableIncome = roundMoney(Math.max(0, taxableIncomeBeforeQbi - section199aDeduction));

  const taxBeforeCredits =
    input.qualifiedDividends > 0 || netCapitalGain > 0
      ? computeQualifiedDividendTax({
          filingStatus: input.filingStatus,
          taxableIncome,
          qualifiedDividends: input.qualifiedDividends,
          netCapitalGain,
        })
      : computeOrdinaryTax(taxableIncome, input.filingStatus);
  const foreignTaxCreditApplied = computeDirectForeignTaxCredit(
    input.foreignTaxPaid,
    input.filingStatus
  );
  if (input.foreignTaxPaid > foreignTaxCreditApplied) {
    issues.push(
      'Foreign tax paid exceeds the simplified direct-credit limit used by this estimator; review the foreign tax credit in filing software.'
    );
  }
  const taxBeforePayments = roundMoney(Math.max(0, taxBeforeCredits - foreignTaxCreditApplied));

  const payments = roundMoney(input.federalWithholding + input.federalEstimatedPayments);
  const refundOrAmountOwed = roundMoney(payments - taxBeforePayments);

  return {
    agi,
    traditionalIraDeduction: maxAboveLineIra,
    section199aDeduction,
    deductionChoice,
    standardDeduction,
    itemizedDeduction,
    taxableIncome,
    netCapitalGain,
    taxBeforePayments: roundMoney(taxBeforePayments),
    foreignTaxCreditApplied,
    refundOrAmountOwed,
    saltDeduction,
    issues,
  };
}

function computeTraditionalIraDeduction(args: {
  filingStatus: FilingStatus;
  wages: number;
  agiBeforeIra: number;
  contributionAmount: number;
  workplaceRetirementCovered: boolean;
}): number {
  const earnedIncomeCap = Math.max(0, args.wages);
  const contributionCap = Math.min(
    TRADITIONAL_IRA_MAX_CONTRIBUTION_UNDER_50_2025,
    args.contributionAmount,
    earnedIncomeCap
  );

  if (contributionCap <= 0) {
    return 0;
  }

  if (!args.workplaceRetirementCovered) {
    return contributionCap;
  }

  const start = TRADITIONAL_IRA_PHASEOUT_START_2025[args.filingStatus];
  const width = TRADITIONAL_IRA_PHASEOUT_WIDTH_2025[args.filingStatus];
  const end = start + width;

  if (args.agiBeforeIra >= end) {
    return 0;
  }
  if (args.agiBeforeIra <= start) {
    return contributionCap;
  }

  const ratio = (end - args.agiBeforeIra) / width;
  return roundIraDeduction(contributionCap * ratio);
}

function roundIraDeduction(value: number): number {
  const roundedUpToTen = Math.ceil(value / 10) * 10;
  if (roundedUpToTen < 200) {
    return 200;
  }
  return roundedUpToTen;
}

function computeSection199aDeduction(args: {
  section199aDividends: number;
  taxableIncomeBeforeQbi: number;
  netCapitalGain: number;
}): number {
  if (args.section199aDividends <= 0 || args.taxableIncomeBeforeQbi <= 0) {
    return 0;
  }

  const dividendComponent = args.section199aDividends * 0.2;
  const taxableIncomeLimit = Math.max(0, args.taxableIncomeBeforeQbi - args.netCapitalGain) * 0.2;
  return roundMoney(Math.min(dividendComponent, taxableIncomeLimit));
}

function computeDirectForeignTaxCredit(foreignTaxPaid: number, filingStatus: FilingStatus): number {
  if (foreignTaxPaid <= 0) {
    return 0;
  }

  const limit = filingStatus === 'mfj' ? 600 : 300;
  return roundMoney(Math.min(foreignTaxPaid, limit));
}

function computeQualifiedDividendTax(args: {
  filingStatus: FilingStatus;
  taxableIncome: number;
  qualifiedDividends: number;
  netCapitalGain: number;
}): number {
  const line1 = args.taxableIncome;
  const line2 = args.qualifiedDividends;
  const line3 = args.netCapitalGain;
  const line4 = roundMoney(line2 + line3);
  const line5 = Math.max(0, roundMoney(line1 - line4));
  const zeroThreshold = FEDERAL_QD_ZERO_RATE_THRESHOLD_2025[args.filingStatus];
  const line7 = Math.min(line1, zeroThreshold);
  const line8 = Math.min(line5, line7);
  const line9 = Math.max(0, roundMoney(line7 - line8));
  const line10 = Math.min(line1, line4);
  const line12 = Math.max(0, roundMoney(line10 - line9));
  const fifteenThreshold = FEDERAL_QD_FIFTEEN_RATE_THRESHOLD_2025[args.filingStatus];
  const line14 = Math.min(line1, fifteenThreshold);
  const line15 = roundMoney(line5 + line9);
  const line16 = Math.max(0, roundMoney(line14 - line15));
  const line17 = Math.min(line12, line16);
  const line18 = roundMoney(line17 * 0.15);
  const line19 = roundMoney(line9 + line17);
  const line20 = Math.max(0, roundMoney(line10 - line19));
  const line21 = roundMoney(line20 * 0.2);
  const line22 = computeOrdinaryTax(line5, args.filingStatus);
  const line23 = roundMoney(line18 + line21 + line22);
  const line24 = computeOrdinaryTax(line1, args.filingStatus);
  return Math.min(line23, line24);
}

export function computeOrdinaryTax(taxableIncome: number, filingStatus: FilingStatus): number {
  if (taxableIncome <= 0) {
    return 0;
  }

  let remaining = taxableIncome;
  let previousLimit = 0;
  let tax = 0;

  for (const bracket of FEDERAL_ORDINARY_BRACKETS_2025[filingStatus]) {
    const bracketWidth = bracket.upTo - previousLimit;
    const amountInBracket = Math.min(remaining, bracketWidth);
    if (amountInBracket <= 0) {
      break;
    }
    tax += amountInBracket * bracket.rate;
    remaining -= amountInBracket;
    previousLimit = bracket.upTo;
    if (remaining <= 0) {
      break;
    }
  }

  return roundMoney(tax);
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
