import assert from 'node:assert/strict';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const { classifyTextSnippet } = await import(path.join(root, 'dist', 'ingestion', 'classify-document.js'));

const cases = [
  {
    name: 'composite brokerage',
    text: 'FORM 1099 COMPOSITE & YEAR-END SUMMARY Form 1099-DIV Form 1099-INT Form 1099-B',
    expectedType: '1099-composite',
  },
  {
    name: 'property tax bill',
    text: 'City & County of San Francisco Property Tax Bill (Secured) Tax Collector',
    expectedType: 'property-tax-bill',
  },
  {
    name: 'mortgage 1098',
    text: 'Form 1098 Mortgage Interest Statement mortgage interest received by the recipient/lender',
    expectedType: '1098',
  },
  {
    name: 'retirement 1099-r',
    text: 'FORM 1099-R Distributions From Pensions, Annuities, Retirement or Profit-Sharing Plans',
    expectedType: '1099-R',
  },
];

for (const testCase of cases) {
  const result = classifyTextSnippet(testCase.text);
  assert.equal(
    result.detectedFormType,
    testCase.expectedType,
    `${testCase.name}: expected ${testCase.expectedType}, got ${result.detectedFormType}`
  );
  assert.notEqual(result.confidence, 'low', `${testCase.name}: expected non-low confidence`);
}

console.log('crab-tax classify: all snippet checks passed');
