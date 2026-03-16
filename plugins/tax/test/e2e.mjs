import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const distCli = path.join(root, 'dist', 'cli.js');

const cases = [
  {
    name: 'basic',
    fixture: path.join(root, 'testdata', 'e2e-basic'),
    expectedExitCode: 0,
    assertions(outputDir) {
      const estimate = readJson(path.join(outputDir, 'estimate_summary.json'));
      if (estimate.blockingIssueCount !== 0) {
        throw new Error(`basic: expected no blocking issues, got ${estimate.blockingIssueCount}`);
      }
      const documents = readJson(path.join(outputDir, 'documents.json'));
      if (documents.length !== 3) {
        throw new Error(`basic: expected 3 documents, got ${documents.length}`);
      }
    },
  },
  {
    name: 'extended',
    fixture: path.join(root, 'testdata', 'e2e-extended'),
    expectedExitCode: 0,
    assertions(outputDir) {
      const federal = readJson(path.join(outputDir, 'federal_return_inputs.json'));
      if (federal.deduction_choice !== 'itemized') {
        throw new Error(`extended: expected federal itemized deduction, got ${federal.deduction_choice}`);
      }
      if (federal.short_term_covered_net_gain_loss_preview.value !== 720) {
        throw new Error('extended: expected short-term covered preview gain/loss of 720');
      }
    },
  },
  {
    name: 'retirement',
    fixture: path.join(root, 'testdata', 'e2e-retirement'),
    expectedExitCode: 0,
    assertions(outputDir) {
      const federal = readJson(path.join(outputDir, 'federal_return_inputs.json'));
      if (federal.traditional_ira_deduction.value !== 7000) {
        throw new Error('retirement: expected traditional IRA deduction of 7000');
      }
      if (federal.retirement_taxable_amount.value !== 5000) {
        throw new Error('retirement: expected taxable retirement amount of 5000');
      }
    },
  },
  {
    name: 'blocking-unsupported',
    fixture: path.join(root, 'testdata', 'e2e-blocking-unsupported'),
    expectedExitCode: 1,
    assertions(outputDir) {
      const estimate = readJson(path.join(outputDir, 'estimate_summary.json'));
      if (estimate.blockingIssueCount < 1) {
        throw new Error('blocking-unsupported: expected at least one blocking issue');
      }
      if (estimate.confidence !== 'low') {
        throw new Error(`blocking-unsupported: expected low confidence, got ${estimate.confidence}`);
      }
      const documents = readJson(path.join(outputDir, 'documents.json'));
      const composite = documents.find((document) => document.fileName === 'brokerage-1099-composite-2025.pdf');
      if (!composite) {
        throw new Error('blocking-unsupported: expected composite brokerage document in inventory');
      }
      if (composite.detectedFormType !== '1099-composite') {
        throw new Error(
          `blocking-unsupported: expected detectedFormType 1099-composite, got ${composite.detectedFormType}`
        );
      }
      const issues = readJson(path.join(outputDir, 'issues_to_review.json'));
      if (!issues.some((issue) => issue.severity === 'blocking')) {
        throw new Error('blocking-unsupported: expected at least one blocking issue entry');
      }
    },
  },
  {
    name: 'tax-year-mismatch',
    fixture: path.join(root, 'testdata', 'e2e-tax-year-mismatch'),
    expectedExitCode: 1,
    assertions(outputDir) {
      const estimate = readJson(path.join(outputDir, 'estimate_summary.json'));
      if (estimate.blockingIssueCount < 1) {
        throw new Error('tax-year-mismatch: expected at least one blocking issue');
      }
      const issues = readJson(path.join(outputDir, 'issues_to_review.json'));
      if (!issues.some((issue) => issue.code === 'DOCUMENT_TAX_YEAR_MISMATCH')) {
        throw new Error('tax-year-mismatch: expected tax-year mismatch issue');
      }
    },
  },
];

execFileSync('npm', ['run', 'build'], {
  cwd: root,
  stdio: 'inherit',
});

for (const testCase of cases) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `crab-tax-${testCase.name}-`));
  copyDir(testCase.fixture, tempDir);
  const profilePath = path.join(tempDir, 'profile.json');
  const outputDir = path.join(tempDir, 'out');

  let exitCode = 0;
  try {
    execFileSync('node', [distCli, tempDir, '--output', outputDir, '--profile', profilePath], {
      cwd: root,
      env: {
        ...process.env,
        OPENAI_API_KEY: '',
        CRAB_TAX_MODEL: '',
        CRAB_TAX_AGENT_MODEL: '',
      },
      stdio: 'inherit',
    });
  } catch (error) {
    exitCode = error.status ?? 1;
  }

  if (exitCode !== testCase.expectedExitCode) {
    throw new Error(
      `${testCase.name}: expected exit code ${testCase.expectedExitCode}, got ${exitCode}`
    );
  }

  testCase.assertions(outputDir);
}

console.log('crab-tax e2e: all fixture checks passed');

function copyDir(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      copyDir(from, to);
    } else {
      fs.copyFileSync(from, to);
    }
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}
