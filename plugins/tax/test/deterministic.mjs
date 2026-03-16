import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

execFileSync('npm', ['run', 'build'], {
  cwd: root,
  stdio: 'inherit',
});

const {
  parse1099CompositeText,
  parsePropertyTaxBillText,
} = await import(path.join(root, 'dist', 'extraction', 'deterministic.js'));

const fidelity = parse1099CompositeText(
  `
  FIDELITY BROKERAGE SERVICES LLC
  Payer's Name and Address: NATIONAL FINANCIAL SERVICES LLC
  2025 TAX REPORTING STATEMENT
  1a Total Ordinary Dividends ........ 418.26
  1b Qualified Dividends ........ 292.44
  2a Total Capital Gain Distributions ........ 225.53
  3 Nondividend Distributions ........ 0.00
  4 Federal Income Tax Withheld ........ 0.00
  5 Section 199A Dividends ........ 8.89
  7 Foreign Tax Paid ........ 18.97
  12 Exempt Interest Dividends ........ 43.01
  13 Specified Private Activity Bond Interest Dividends ........ 3.62
  2025 Interest Income
  1 Interest Income ........ 0.00
  4 Federal Income Tax Withheld ........ 0.00
  6 Foreign Tax Paid ........ 0.00
  8 Tax-Exempt Interest ........ 0.00
  9 Specified Private Activity Bond Interest ........ 0.00
  Summary of 2025 Proceeds From Broker and Barter Exchange Transactions
  6,744.62 6,784.99 0.00 0.00 -40.37 0.00
  0.00 0.00 0.00 0.00 0.00 0.00
  24,785.66 15,468.30 0.00 0.00 9,317.36 0.00
  0.00 0.00 0.00 0.00 0.00 0.00
  0.00 0.00 0.00 0.00 0.00 0.00
  31,530.28 22,253.29 0.00 0.00 9,276.99 0.00
  1099-B amounts are reported individually to the IRS.
  `,
  'fidelity-composite.pdf'
);

assertEqual(fidelity?.fields.ordinary_dividends, 418.26, 'fidelity ordinary dividends');
assertEqual(fidelity?.fields.long_term_covered_net_gain_loss, 9317.36, 'fidelity long-term net');
assertEqual(
  fidelity?.fields.has_unsupported_brokerage_rows,
  false,
  'fidelity unsupported rows'
);

const pershing = parse1099CompositeText(
  `
  Payer's Information: PERSHING LLC
  2025 1099-DIV
  2025 1099-INT OMB No. 1545-0112 Interest Income Box Amount
  $0.00 $0.00 $0.00 $0.00 $0.00 $0.00 $0.00
  Box 1a
  Dividends and Distributions OMB No. 1545-0110 Amount
  $233.92 $201.16 $0.00 $0.00 $0.00 $0.00 $0.00 $0.00 $1.64 $0.00 $16.80 $0.00 $0.00 $0.00 $0.00 $0.00 $0.00
  Summary of Form 1099-OID
  Short-Term Covered Total $491.93 $547.96 ($56.03)
  Long-Term Covered Total $809.86 $650.13 $159.73
  TAX LOT DEFAULT DISPOSITION METHOD
  `,
  'pershing-composite.pdf'
);

assertEqual(pershing?.fields.qualified_dividends, 201.16, 'pershing qualified dividends');
assertEqual(pershing?.fields.short_term_covered_basis, 547.96, 'pershing short basis');
assertEqual(
  pershing?.fields.long_term_covered_net_gain_loss,
  159.73,
  'pershing long net'
);

const robinhood = parse1099CompositeText(
  `
  Robinhood Markets Inc
  Enclosed is your 2025 Tax Statement.
  2025 1099-DIV
  71.95 71.95 0.00 0.00 0.00 0.00 0.00 0.00 0.00 0.00 0.00 0.00 0.00 0.00 0.00 0.00 0.00
  2025 1099-MISC
  A (basis reported to the IRS)
  B (basis not reported to the IRS) 0.00 0.00 0.00 0.00 0.00
  C (Form 1099-B not received) 0.00 0.00 0.00 0.00 0.00
  Total Short-term 0.00 0.00 0.00 0.00 0.00
  D (basis reported to the IRS)
  E (basis not reported to the IRS) 0.00 0.00 0.00 0.00 0.00
  F (Form 1099-B not received) 0.00 0.00 0.00 0.00 0.00
  Total Long-term 0.00 0.00 0.00 0.00 0.00
  Total Undetermined-term 0.00 0.00 0.00 0.00 0.00
  Grand total
  2025 1099-INT
  0.00 0.00 0.00 0.00 0.00 0.00 0.00 0.00 0.00
  The following amounts are not reported to the IRS
  `,
  'robinhood-composite.pdf'
);

assertEqual(robinhood?.fields.ordinary_dividends, 71.95, 'robinhood ordinary dividends');
assertEqual(
  robinhood?.fields.short_term_covered_net_gain_loss,
  0,
  'robinhood short-term net'
);

const schwab = parse1099CompositeText(
  `
  Charles Schwab & Co., Inc.
  TAX YEAR 2025 FORM 1099 COMPOSITE
  Detail Information of Dividends and Distributions
  META PLATFORMS INC
  Total Qualified Dividends (Box 1b and included in Box 1a)
  $507.15
  $507.15
  Total Ordinary Dividends (Box 1a)
  $507.15
  Detail Information of Interest Income
  DEPOSIT INTEREST
  Total Interest Income (Included in Box 1)
  $0.35
  Total Interest Income (Box 1)
  $0.35
  Terms and Conditions
  `,
  'schwab-composite.pdf'
);

assertEqual(schwab?.fields.ordinary_dividends, 507.15, 'schwab ordinary dividends');
assertEqual(schwab?.fields.qualified_dividends, 507.15, 'schwab qualified dividends');
assertEqual(schwab?.fields.interest_income, 0.35, 'schwab interest income');

const propertyTaxBill = parsePropertyTaxBillText(`
  City & County of San Francisco
  Property Tax Bill (Secured)
  For Fiscal Year July 1, 2025 through June 30, 2026
  Tax Amount $13,280.44
  Total Direct Charges and Special Assessments $875.48
  2nd Installment Due Pay by April 10, 2026 $7,077.96
  1st Installment Due December 10, 2025 $7,077.96 If paid after December 10, 2025 $7,785.75 Pay by Paid 11/29/2025
`);

assertEqual(propertyTaxBill?.fields.property_tax_paid, 6640.22, 'property tax paid');
assertEqual(
  propertyTaxBill?.fields.property_tax_first_installment_paid_date,
  '2025-11-29',
  'property tax paid date'
);

console.log('crab-tax deterministic parsers: all checks passed');

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}
