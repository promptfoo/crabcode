#!/usr/bin/env node
/**
 * crab-pf CLI
 *
 * Target discovery agent for promptfoo.
 *
 * Usage:
 *   crab pf "curl -X POST ..."         # Discover from curl command
 *   crab pf --file target.txt          # Discover from file
 *   crab pf --url http://localhost:8080  # Probe a URL directly
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseArtifact, detectFormat } from './parsers/index.js';
import { runDiscoveryAgent } from './agent/loop.js';
import { createProvider } from './agent/providers.js';

const args = process.argv.slice(2);

async function main() {
  try {
    // Parse arguments
    const filePath = getArg('--file') || getArg('-f');
    const urlArg = getArg('--url');
    const providerStr = getArg('--provider') || process.env.DISCOVERY_PROVIDER || 'openai:gpt-4o';
    const outputDir = getArg('--output') || getArg('-o') || '.';
    const verbose = args.includes('--verbose') || args.includes('-v');
    const maxTurns = parseInt(getArg('--max-turns') || '30', 10);

    let context: string;

    if (filePath) {
      // Read from file
      if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        process.exit(1);
      }
      context = fs.readFileSync(filePath, 'utf-8');
      console.log(`Loaded: ${filePath} (${context.length} chars)`);
    } else if (urlArg) {
      // Generate a simple curl command for the URL
      context = `curl ${urlArg}`;
    } else if (args[0] && !args[0].startsWith('-')) {
      // First positional arg is the artifact
      context = args[0];
    } else {
      printHelp();
      process.exit(1);
    }

    // Detect format
    const format = detectFormat(context);
    console.log(`Detected format: ${format === 'unknown' ? 'text/description' : format}`);
    console.log(`Provider: ${providerStr}`);
    console.log(`Output: ${outputDir}`);
    console.log('');

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Create provider
    const provider = createProvider(providerStr);

    // Run discovery agent
    console.log('Starting target discovery agent...');
    console.log('='.repeat(50));

    const result = await runDiscoveryAgent({
      context,
      provider,
      maxTurns,
      outputDir,
      verbose,
      onTurn: (turn) => {
        if (!verbose) {
          process.stdout.write('.');
        }
      },
    });

    console.log('\n');
    console.log('='.repeat(50));
    console.log('RESULT');
    console.log('='.repeat(50));

    if (result.success) {
      console.log('Status: SUCCESS');
      console.log(`Config: ${path.join(outputDir, 'promptfooconfig.yaml')}`);
      if (result.providerFile) {
        console.log(`Provider: ${result.providerFile}`);
      }
      console.log('\nNext steps:');
      console.log(`  cd ${outputDir}`);
      console.log('  # Set any required environment variables');
      console.log('  promptfoo eval');
    } else {
      console.log('Status: FAILED');
      console.log(`Error: ${result.error}`);
      console.log('\nLogs:');
      for (const log of result.logs.slice(-10)) {
        console.log(`  ${log}`);
      }
      process.exit(1);
    }
  } catch (error) {
    console.error('Error:', (error as Error).message);
    process.exit(1);
  }
}

function getArg(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith('-')) {
    return args[idx + 1];
  }
  return undefined;
}

function printHelp() {
  console.log(`
crab-pf - Promptfoo Target Discovery Agent

Usage:
  crab pf "curl -X POST http://localhost:8080/chat -d '{\"message\":\"hi\"}'"
  crab pf --file target.txt
  crab pf --url http://localhost:8080/api/chat

Options:
  --file, -f <path>      Read target specification from file
  --url <url>            Probe a URL directly
  --output, -o <dir>     Output directory (default: current dir)
  --provider <provider>  LLM provider (default: openai:gpt-4o)
  --max-turns <n>        Max agent turns (default: 30)
  --verbose, -v          Show detailed output

Supported input formats:
  - Curl commands
  - OpenAPI/Swagger specs
  - Postman collections
  - Burp Suite exports
  - Plain text descriptions

Environment variables:
  OPENAI_API_KEY         OpenAI API key
  ANTHROPIC_API_KEY      Anthropic API key
  DISCOVERY_PROVIDER     Default provider (e.g., anthropic:claude-sonnet-4-20250514)

Examples:
  # From curl command
  crab pf "curl -X POST http://localhost:8080/chat -H 'Content-Type: application/json' -d '{\"message\":\"hello\"}'"

  # From file with target description
  crab pf --file betty-api.txt --output ./betty-config

  # Using Anthropic
  crab pf --file target.txt --provider anthropic:claude-sonnet-4-20250514

Output:
  The agent will create:
  - promptfooconfig.yaml (promptfoo configuration)
  - provider.js (optional, for complex targets)
`);
}

main();
