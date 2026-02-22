/**
 * crab pf serve — Slack polling daemon
 *
 * Watches for DMs to the Crab bot and runs the promptfoo
 * discovery agent locally for each incoming request.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as readline from 'node:readline/promises';
import { runDiscoveryAgent } from './agent/loop.js';
import { createProvider } from './agent/providers.js';
import {
  getSlackToken,
  getBotUserId,
  getUserId,
  openDm,
  getHistory,
  postMessage,
  addReaction,
  downloadFile,
  uploadFile,
  type SlackMessage,
} from './slack.js';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const CONFIG_DIR = path.join(os.homedir(), '.crabcode');
const SERVE_CONFIG = path.join(CONFIG_DIR, 'pf-serve.json');
const SERVE_STATE = path.join(CONFIG_DIR, 'pf-serve.state');
const JOBS_DIR = path.join(CONFIG_DIR, 'pf-serve', 'jobs');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ServeConfig {
  slackUsername: string;
  provider: string;
  reasoning?: string;
}

interface ServeState {
  lastTs: string;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function runServe(args: string[]): Promise<void> {
  if (args.includes('--help') || args.includes('-h')) {
    printServeHelp();
    return;
  }

  if (args.includes('--setup')) {
    await runSetup();
    return;
  }

  const providerOverride = getArg(args, '--provider');
  const reasoningOverride = getArg(args, '--reasoning');
  const interval = parseInt(getArg(args, '--interval') || '5000', 10);
  const verbose = args.includes('--verbose') || args.includes('-v');

  await runDaemon({ providerOverride, reasoningOverride, interval, verbose });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

async function runSetup(): Promise<void> {
  console.log('\ncrab pf serve — Setup\n');

  // 1. Check token
  let token: string;
  try {
    token = getSlackToken();
    console.log('Slack token: found');
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }

  // 2. Prompt for username
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const username = await rl.question('Your Slack username (e.g., jsmith): ');
  if (!username.trim()) {
    console.error('Username is required.');
    rl.close();
    process.exit(1);
  }

  // 3. Validate
  try {
    const userId = await getUserId(token, username.trim());
    console.log(`Resolved: ${username.trim()} → ${userId}`);
  } catch (err) {
    console.error(`Could not find Slack user "${username.trim()}": ${(err as Error).message}`);
    rl.close();
    process.exit(1);
  }

  // 4. Provider preference
  const provider = await rl.question('LLM provider (default: openai:gpt-5): ');
  const reasoning = await rl.question('Reasoning effort for GPT-5 (low/medium/high, default: low): ');
  rl.close();

  const config: ServeConfig = {
    slackUsername: username.trim(),
    provider: provider.trim() || 'openai:gpt-5',
    reasoning: reasoning.trim() || 'low',
  };

  // 5. Save
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(SERVE_CONFIG, JSON.stringify(config, null, 2) + '\n');

  console.log(`\nSaved to ${SERVE_CONFIG}`);
  console.log('\nNext: run  crab pf serve  to start the daemon.\n');
}

// ---------------------------------------------------------------------------
// Daemon
// ---------------------------------------------------------------------------

async function runDaemon(opts: {
  providerOverride?: string;
  reasoningOverride?: string;
  interval: number;
  verbose: boolean;
}): Promise<void> {
  // Load config
  if (!fs.existsSync(SERVE_CONFIG)) {
    console.error('Not configured. Run: crab pf serve --setup');
    process.exit(1);
  }

  const config: ServeConfig = JSON.parse(fs.readFileSync(SERVE_CONFIG, 'utf-8'));
  const providerStr = opts.providerOverride || config.provider;
  const reasoning = opts.reasoningOverride || config.reasoning;

  // Load state
  let lastTs = '0';
  if (fs.existsSync(SERVE_STATE)) {
    try {
      const state: ServeState = JSON.parse(fs.readFileSync(SERVE_STATE, 'utf-8'));
      lastTs = state.lastTs;
    } catch {
      // corrupted state, start fresh
    }
  }

  // Resolve Slack identity
  const token = getSlackToken();
  console.log('Resolving Slack identity...');

  const botUserId = await getBotUserId(token);
  const userId = await getUserId(token, config.slackUsername);
  const channelId = await openDm(token, userId);

  console.log(`\ncrab pf serve — running`);
  console.log(`  User:     ${config.slackUsername} (${userId})`);
  console.log(`  Channel:  ${channelId}`);
  console.log(`  Provider: ${providerStr}${reasoning ? ` (reasoning: ${reasoning})` : ''}`);
  console.log(`  Interval: ${opts.interval}ms`);
  console.log(`  Verbose:  ${opts.verbose}`);
  console.log(`  Trigger: pf: <message>`);
  console.log(`\nListening for DMs... (Ctrl-C to stop)\n`);

  // Signal handling
  let running = true;
  const shutdown = () => {
    console.log('\nShutting down...');
    running = false;
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Track consecutive errors for health warnings
  let consecutiveErrors = 0;

  // Poll loop
  while (running) {
    await sleep(opts.interval);
    if (!running) break;

    try {
      const messages = await getHistory(token, channelId, lastTs);

      // Filter: only messages from the user (not bot, not subtypes like channel_join)
      const userMessages = messages
        .filter((m) => m.user === userId && !m.subtype && !m.bot_id)
        .sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts)); // oldest first

      for (const msg of userMessages) {
        if (!running) break;

        // Skip empty messages
        if (!msg.text?.trim() && (!msg.files || msg.files.length === 0)) {
          if (opts.verbose) console.log(`[skip] Empty message ${msg.ts}`);
          lastTs = msg.ts;
          continue;
        }

        // Trigger: message must start with "pf:" (case-insensitive)
        const text = msg.text?.trim() || '';
        const hasTrigger = /^pf:/i.test(text);

        if (!hasTrigger && (!msg.files || msg.files.length === 0)) {
          // No trigger and no files — reply with help once
          if (opts.verbose) console.log(`[skip] No pf: trigger in message ${msg.ts}`);
          await postMessage(
            token,
            channelId,
            'Start your message with `pf:` to run the discovery agent.\n\nExample:\n```\npf: My API is at http://localhost:8080/chat\nPOST with JSON { "message": "the prompt" }\n```\nYou can also attach files with target specs.',
            msg.ts,
          );
          lastTs = msg.ts;
          continue;
        }

        if (!hasTrigger && msg.files && msg.files.length > 0) {
          // Has files but no trigger — also skip with help
          if (opts.verbose) console.log(`[skip] Files without pf: trigger ${msg.ts}`);
          await postMessage(
            token,
            channelId,
            'Got your file, but start the message with `pf:` to trigger the agent.\n\nExample: `pf: see attached target spec`',
            msg.ts,
          );
          lastTs = msg.ts;
          continue;
        }

        // Strip the "pf:" prefix from the text
        msg.text = text.replace(/^pf:\s*/i, '');

        console.log(`[new] Message from ${config.slackUsername}: ${msg.text?.slice(0, 80)}...`);

        await processMessage({
          token,
          channelId,
          message: msg,
          providerStr,
          reasoning,
          verbose: opts.verbose,
        });

        lastTs = msg.ts;
      }

      // Persist state
      saveState({ lastTs });
      consecutiveErrors = 0;
    } catch (err) {
      consecutiveErrors++;
      const msg = (err as Error).message;
      console.error(`[error] Poll failed: ${msg}`);

      if (msg.includes('invalid_auth') && consecutiveErrors >= 3) {
        console.error('\n[warning] Repeated auth failures. Check your Slack bot token.\n');
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Message processing
// ---------------------------------------------------------------------------

async function processMessage(opts: {
  token: string;
  channelId: string;
  message: SlackMessage;
  providerStr: string;
  reasoning?: string;
  verbose: boolean;
}): Promise<void> {
  const { token, channelId, message, providerStr, reasoning, verbose } = opts;

  try {
    // 1. Acknowledge
    const reacted = await addReaction(token, channelId, message.ts, 'hourglass_flowing_sand');
    if (!reacted) {
      await postMessage(token, channelId, 'Processing your request...', message.ts);
    }

    // 2. Build context from text + file attachments
    let context = message.text || '';

    if (message.files && message.files.length > 0) {
      for (const file of message.files) {
        try {
          const { content, filename } = await downloadFile(token, file);
          context += `\n\n--- File: ${filename} ---\n${content}\n`;
          if (verbose) console.log(`  Downloaded: ${filename} (${content.length} chars)`);
        } catch (err) {
          const errMsg = (err as Error).message;
          context += `\n\n--- File: ${file.name} (download failed: ${errMsg}) ---\n`;
          console.error(`  File download failed: ${errMsg}`);
        }
      }
    }

    if (!context.trim()) {
      await postMessage(token, channelId, 'Empty message — nothing to process.', message.ts);
      return;
    }

    // 3. Create job directory
    const jobDir = path.join(JOBS_DIR, Date.now().toString());
    fs.mkdirSync(jobDir, { recursive: true });

    // 4. Create provider
    let provider;
    try {
      provider = createProvider(providerStr, reasoning ? { reasoningEffort: reasoning } : undefined);
    } catch (err) {
      await postMessage(
        token,
        channelId,
        `Provider error: ${(err as Error).message}\n\nMake sure your API key is set in the environment.`,
        message.ts,
      );
      return;
    }

    // 5. Run agent
    if (verbose) console.log(`  Running agent (provider: ${providerStr}, output: ${jobDir})`);

    const result = await runDiscoveryAgent({
      context,
      provider,
      outputDir: jobDir,
      verbose,
      maxTurns: 30,
      onTurn: (turn) => {
        if (verbose) {
          process.stdout.write('.');
        }
      },
    });

    if (verbose) console.log('');

    // 6. Post results
    if (result.success) {
      // Upload config file
      const configPath = path.join(jobDir, 'promptfooconfig.yaml');
      if (fs.existsSync(configPath)) {
        const configContent = fs.readFileSync(configPath, 'utf-8');
        const uploaded = await uploadFile(token, channelId, 'promptfooconfig.yaml', configContent, message.ts);

        if (!uploaded) {
          // Fallback: post as code block
          const truncated = configContent.length > 3000
            ? configContent.slice(0, 3000) + '\n...(truncated)'
            : configContent;
          await postMessage(token, channelId, '```\n' + truncated + '\n```', message.ts);
        }
      }

      // Upload provider file if it exists
      if (result.providerFile) {
        const providerPath = result.providerFile;
        if (fs.existsSync(providerPath)) {
          const providerContent = fs.readFileSync(providerPath, 'utf-8');
          await uploadFile(token, channelId, path.basename(providerPath), providerContent, message.ts);
        }
      }

      // Post summary
      const summary = [
        'Discovery complete!',
        '',
        'Generated files:',
        `  - promptfooconfig.yaml`,
        result.providerFile ? `  - ${path.basename(result.providerFile)}` : '',
        '',
        'Next steps:',
        '  1. Download the config file above',
        '  2. Place it in your project directory',
        '  3. Run: `promptfoo eval`',
      ]
        .filter(Boolean)
        .join('\n');

      await postMessage(token, channelId, summary, message.ts);
      await addReaction(token, channelId, message.ts, 'white_check_mark');

      console.log(`[done] Success — config at ${configPath}`);
    } else {
      // Post error
      const logs = result.logs.slice(-5).join('\n');
      const errorMsg = [
        `Discovery failed: ${result.error || 'unknown error'}`,
        '',
        'Recent logs:',
        '```',
        logs,
        '```',
      ].join('\n');

      await postMessage(token, channelId, errorMsg, message.ts);
      await addReaction(token, channelId, message.ts, 'x');

      console.log(`[done] Failed — ${result.error}`);
    }
  } catch (err) {
    console.error(`[error] Processing failed: ${(err as Error).message}`);
    try {
      await postMessage(
        token,
        channelId,
        `Internal error: ${(err as Error).message}`,
        message.ts,
      );
    } catch {
      // Can't even post error — give up
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function saveState(state: ServeState): void {
  try {
    fs.writeFileSync(SERVE_STATE, JSON.stringify(state) + '\n');
  } catch {
    // non-fatal
  }
}

function getArg(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith('-')) {
    return args[idx + 1];
  }
  return undefined;
}

function printServeHelp(): void {
  console.log(`
crab pf serve — Slack polling daemon

Watches your DMs with the Crab bot for target specifications,
runs the discovery agent locally, and posts results back to Slack.

Setup:
  crab pf serve --setup          Configure your Slack username

Usage:
  crab pf serve                  Start the daemon
  crab pf serve -v               Start with verbose output
  crab pf serve --provider X     Override LLM provider

Options:
  --setup              One-time configuration
  --provider <str>     LLM provider (default: from config or openai:gpt-4o)
  --interval <ms>      Poll interval in ms (default: 5000)
  --verbose, -v        Show detailed output
  --help, -h           Show this help

How it works:
  1. DM the Crab bot in Slack starting with "pf:"
     e.g., "pf: My API is at http://localhost:8080/chat"
  2. You can also attach files (curl commands, API specs, etc.)
  3. The daemon picks it up and runs the discovery agent locally
  4. Results (promptfooconfig.yaml) are posted back to the thread

Requirements:
  - Slack bot token (CRAB_SLACK_BOT_TOKEN or ~/.crabcode/config.yaml)
  - LLM API key (OPENAI_API_KEY or ANTHROPIC_API_KEY)
`);
}
