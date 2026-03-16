import {
  CALIFORNIA_DEPENDENT_EXEMPTION_CREDIT_2025,
  CALIFORNIA_EXEMPTION_CREDIT_AGI_THRESHOLD_2025,
  CALIFORNIA_ITEMIZED_LIMIT_AGI_THRESHOLD_2025,
  CALIFORNIA_PERSONAL_EXEMPTION_CREDIT_2025,
  CALIFORNIA_STANDARD_DEDUCTION_2025,
  CALIFORNIA_TAX_BRACKETS_2025,
} from '../rules/california-2025.js';
import type { FilingStatus } from '../types.js';

export interface CaliforniaComputationInput {
  filingStatus: FilingStatus;
  federalAgi: number;
  californiaWages: number;
  mortgageInterest: number;
  pointsPaid: number;
  propertyTaxPaid: number;
  californiaWithholding: number;
  californiaEstimatedPayments: number;
  dependents: number;
}

export interface CaliforniaComputationResult {
  californiaAgi: number;
  deductionChoice: 'standard' | 'itemized';
  standardDeduction: number;
  itemizedDeduction: number;
  taxableIncome: number;
  taxBeforeCredits: number;
  exemptionCredits: number;
  taxAfterCredits: number;
  refundOrAmountOwed: number;
  issues: string[];
}

export function computeCaliforniaReturn(
  input: CaliforniaComputationInput
): CaliforniaComputationResult {
  const issues: string[] = [];
  const californiaAgi = input.federalAgi;
  const standardDeduction = CALIFORNIA_STANDARD_DEDUCTION_2025[input.filingStatus];
  const itemizedDeduction = roundMoney(input.mortgageInterest + input.pointsPaid + input.propertyTaxPaid);

  if (californiaAgi > CALIFORNIA_ITEMIZED_LIMIT_AGI_THRESHOLD_2025[input.filingStatus]) {
    issues.push(
      'California itemized deduction limitation above the 2025 AGI threshold is not implemented; using the unreduced itemized amount.'
    );
  }

  const deductionChoice = itemizedDeduction > standardDeduction ? 'itemized' : 'standard';
  const chosenDeduction = deductionChoice === 'itemized' ? itemizedDeduction : standardDeduction;
  const taxableIncome = roundMoney(Math.max(0, californiaAgi - chosenDeduction));
  const taxBeforeCredits = computeCaliforniaTax(taxableIncome, input.filingStatus);
  const exemptionCredits = computeCaliforniaExemptionCredits({
    filingStatus: input.filingStatus,
    agi: californiaAgi,
    dependents: input.dependents,
  });
  const taxAfterCredits = roundMoney(Math.max(0, taxBeforeCredits - exemptionCredits));
  const payments = roundMoney(input.californiaWithholding + input.californiaEstimatedPayments);
  const refundOrAmountOwed = roundMoney(payments - taxAfterCredits);

  return {
    californiaAgi,
    deductionChoice,
    standardDeduction,
    itemizedDeduction,
    taxableIncome,
    taxBeforeCredits,
    exemptionCredits,
    taxAfterCredits,
    refundOrAmountOwed,
    issues,
  };
}

function computeCaliforniaExemptionCredits(args: {
  filingStatus: FilingStatus;
  agi: number;
  dependents: number;
}): number {
  const personalCount = args.filingStatus === 'mfj' ? 2 : 1;
  const baseCredit =
    personalCount * CALIFORNIA_PERSONAL_EXEMPTION_CREDIT_2025 +
    args.dependents * CALIFORNIA_DEPENDENT_EXEMPTION_CREDIT_2025;
  const threshold = CALIFORNIA_EXEMPTION_CREDIT_AGI_THRESHOLD_2025[args.filingStatus];

  if (args.agi <= threshold) {
    return baseCredit;
  }

  const reductionUnits = Math.ceil((args.agi - threshold) / 2500);
  const reduction = reductionUnits * 6 * (personalCount + args.dependents);
  return Math.max(0, baseCredit - reduction);
}

export function computeCaliforniaTax(taxableIncome: number, filingStatus: FilingStatus): number {
  if (taxableIncome <= 0) {
    return 0;
  }

  let remaining = taxableIncome;
  let previousLimit = 0;
  let tax = 0;

  for (const bracket of CALIFORNIA_TAX_BRACKETS_2025[filingStatus]) {
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
