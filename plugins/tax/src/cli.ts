#!/usr/bin/env node
import * as fs from 'node:fs';
import * as path from 'node:path';
import { runPipeline } from './app/run-pipeline.js';
import type { FilingStatus, TaxpayerProfile } from './types.js';

const args = process.argv.slice(2);

async function main() {
  const inputDir = getPositionalInputDir();
  if (!inputDir) {
    printHelp();
    process.exit(1);
  }

  const resolvedInputDir = path.resolve(inputDir);
  if (!fs.existsSync(resolvedInputDir) || !fs.statSync(resolvedInputDir).isDirectory()) {
    console.error(`Input directory not found: ${resolvedInputDir}`);
    process.exit(1);
  }

  const outputDir = path.resolve(getArg('--output') || './tax-bot-output');
  const profile = loadProfile();
  const verbose = hasFlag('--verbose') || hasFlag('-v');
  const preview = hasFlag('--preview');

  console.log('crab-tax');
  console.log(`Input: ${resolvedInputDir}`);
  console.log(`Output: ${outputDir}`);
  console.log(`Tax year: ${profile.taxYear}`);
  console.log(`Filing status: ${profile.filingStatus}`);
  console.log('');

  const result = await runPipeline({
    inputDir: resolvedInputDir,
    outputDir,
    profile,
    preview,
    verbose,
  });

  console.log('Outputs written:');
  console.log(`  ${path.join(outputDir, 'taxpayer_profile.json')}`);
  console.log(`  ${path.join(outputDir, 'documents.json')}`);
  console.log(`  ${path.join(outputDir, 'reconciliation.json')}`);
  console.log(`  ${path.join(outputDir, 'issues_to_review.json')}`);
  console.log(`  ${path.join(outputDir, 'turbotax_handoff.md')}`);
  console.log('');
  console.log(`Blocking issues: ${result.issues.filter((issue) => issue.severity === 'blocking').length}`);

  process.exit(result.exitCode);
}

function loadProfile(): TaxpayerProfile {
  const profilePath = getArg('--profile');
  if (profilePath) {
    const resolvedProfile = path.resolve(profilePath);
    return JSON.parse(fs.readFileSync(resolvedProfile, 'utf-8')) as TaxpayerProfile;
  }

  const filingStatus = (getArg('--filing-status') || 'single') as FilingStatus;
  if (filingStatus !== 'single' && filingStatus !== 'mfj') {
    console.error(`Unsupported filing status: ${filingStatus}`);
    process.exit(1);
  }

  const taxYear = parseInt(getArg('--tax-year') || '2025', 10);
  const dependents = parseInt(getArg('--dependents') || '0', 10);

  return {
    schemaVersion: '0.1.0',
    taxYear,
    filingStatus,
    state: 'CA',
    fullYearResident: !hasFlag('--not-full-year-resident'),
    dependents,
    estimatedPayments: [],
    iraContributions: [],
    scenarioFlags: {
      rsu: hasFlag('--rsu'),
      espp: hasFlag('--espp'),
      inheritedShares: hasFlag('--inherited-shares'),
    },
    reviewAnswers: {},
  };
}

function getPositionalInputDir(): string | undefined {
  const positional = args.filter((arg, index) => {
    if (index > 0 && isFlag(args[index - 1])) {
      return false;
    }
    return !isFlag(arg);
  });
  return positional[0];
}

function getArg(flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  const value = args[index + 1];
  if (!value || isFlag(value)) {
    return undefined;
  }
  return value;
}

function hasFlag(flag: string): boolean {
  return args.includes(flag);
}

function isFlag(value: string): boolean {
  return value.startsWith('-');
}

function printHelp() {
  console.log(`
crab-tax - Tax document organizer and TurboTax handoff generator

Usage:
  crab tax ./my-tax-docs
  crab tax ./my-tax-docs --output ./tax-bot-output
  crab tax ./my-tax-docs --filing-status mfj --tax-year 2025
  crab tax ./my-tax-docs --profile ./profile.json

Options:
  --output <dir>                 Output directory (default: ./tax-bot-output)
  --profile <path>               Path to taxpayer profile JSON
  --tax-year <year>              Tax year (default: 2025)
  --filing-status <single|mfj>   Filing status (default: single)
  --dependents <n>               Number of dependents (default: 0)
  --preview                      Allow preview-mode outputs
  --verbose, -v                  Show additional output

Scenario flags:
  --rsu
  --espp
  --inherited-shares
  --not-full-year-resident
`);
}

main().catch((error) => {
  console.error('Error:', (error as Error).message);
  process.exit(1);
});
