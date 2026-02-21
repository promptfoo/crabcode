import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { startSession } from './commands/start.js';
import { openSession } from './commands/open.js';
import { listDrawSessions } from './commands/list.js';
import { deleteDrawSession } from './commands/delete.js';
import { resolveSession, loadSession } from './storage/sessions.js';

function getArg(args: string[], flag: string, short?: string): string | undefined {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag || (short && args[i] === short)) {
      return args[i + 1];
    }
  }
  return undefined;
}

function hasFlag(args: string[], flag: string, short?: string): boolean {
  return args.includes(flag) || (short ? args.includes(short) : false);
}

function promptChoice(
  message: string,
  projectRoot: string,
  ids: string[],
): Promise<string> {
  return new Promise((resolve, reject) => {
    console.log(`\n${message}\n`);
    for (let i = 0; i < ids.length; i++) {
      const session = loadSession(projectRoot, ids[i]);
      const label = session ? `${ids[i]}  (${session.title})` : ids[i];
      console.log(`  ${i + 1}) ${label}`);
    }
    console.log('');

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('Pick a number (or q to cancel): ', (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      if (trimmed === 'q' || trimmed === '') {
        reject(new Error('cancelled'));
        return;
      }
      const idx = parseInt(trimmed, 10) - 1;
      if (isNaN(idx) || idx < 0 || idx >= ids.length) {
        reject(new Error('invalid choice'));
        return;
      }
      resolve(ids[idx]);
    });
  });
}

function showHelp(): void {
  console.log('Crab Draw - Collaborative Excalidraw sessions');
  console.log('');
  console.log('Usage:');
  console.log('  crab draw                          Start a new drawing session');
  console.log('  crab draw --title "name"            Start with a title');
  console.log('  crab draw --no-tunnel               Start without sharing tunnel');
  console.log('  crab draw <session-id>              Reopen a saved session');
  console.log('  crab draw <session-id> --collab     Reopen with sharing enabled');
  console.log('  crab draw ls                        List all sessions');
  console.log('  crab draw delete <session-id>       Delete a session');
  console.log('');
  console.log('Options:');
  console.log('  --title, -t <name>     Name the drawing session');
  console.log('  --collab               Enable sharing tunnel (for reopened sessions)');
  console.log('  --no-tunnel            Start without tunnel (local only)');
  console.log('  --tunnel <tool>        Use specific tunnel (cloudflared, ngrok, bore)');
  console.log('  --port <port>          Use specific port (default: auto from 7220)');
  console.log('  --help, -h             Show this help');
  console.log('');
  console.log('Sessions are saved to .crab/draw/ in your project directory.');
  console.log('Commit them to git so teammates can access them with the same commands.');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Resolve project root from env or walk up to find .git
  const projectRoot = resolveProjectRoot();

  if (hasFlag(args, '--help', '-h') || hasFlag(args, 'help')) {
    showHelp();
    return;
  }

  const command = args[0];

  // crab draw ls
  if (command === 'ls' || command === 'list') {
    listDrawSessions(projectRoot);
    return;
  }

  // crab draw delete <id>
  if (command === 'delete' || command === 'rm') {
    const input = args[1];
    if (!input) {
      console.error('Usage: crab draw delete <session-id>');
      process.exit(1);
    }
    const resolved = resolveSession(projectRoot, input);
    if (!resolved) {
      console.error(`Session "${input}" not found.`);
      process.exit(1);
    }
    if (resolved.ambiguous) {
      try {
        const chosen = await promptChoice(
          `"${input}" matches multiple sessions:`,
          projectRoot,
          resolved.ambiguous,
        );
        deleteDrawSession(projectRoot, chosen);
      } catch {
        console.log('Cancelled.');
      }
      return;
    }
    deleteDrawSession(projectRoot, resolved.id);
    return;
  }

  // crab draw <session-id> — reopen existing session (supports prefix match)
  if (command && !command.startsWith('-')) {
    const resolved = resolveSession(projectRoot, command);
    if (resolved) {
      if (resolved.ambiguous) {
        try {
          const chosen = await promptChoice(
            `"${command}" matches multiple sessions:`,
            projectRoot,
            resolved.ambiguous,
          );
          await openSession(projectRoot, {
            sessionId: chosen,
            collab: hasFlag(args, '--collab'),
            tunnel: getArg(args, '--tunnel'),
            port: getArg(args, '--port') ? parseInt(getArg(args, '--port')!) : undefined,
          });
        } catch {
          console.log('Cancelled.');
        }
        return;
      }
      await openSession(projectRoot, {
        sessionId: resolved.id,
        collab: hasFlag(args, '--collab'),
        tunnel: getArg(args, '--tunnel'),
        port: getArg(args, '--port') ? parseInt(getArg(args, '--port')!) : undefined,
      });
      return;
    }
  }

  // crab draw [--title "..."] — new session
  // If command looks like a session name but doesn't match, warn
  if (command && !command.startsWith('-')) {
    console.error(`No session matching "${command}". Starting new session instead.\n`);
  }

  await startSession(projectRoot, {
    title: getArg(args, '--title', '-t'),
    collab: !hasFlag(args, '--no-tunnel'),
    tunnel: getArg(args, '--tunnel'),
    port: getArg(args, '--port') ? parseInt(getArg(args, '--port')!) : undefined,
  });
}

function resolveProjectRoot(): string {
  // First: env var from crab bash handler
  if (process.env.CRAB_PROJECT_ROOT) {
    return process.env.CRAB_PROJECT_ROOT;
  }

  // Fallback: walk up from cwd looking for .git
  let dir = process.cwd();
  while (dir !== '/') {
    try {
      const stat = fs.statSync(path.join(dir, '.git'));
      if (stat.isDirectory()) return dir;
    } catch {
      // continue
    }
    dir = path.dirname(dir);
  }

  // Last resort: use cwd
  return process.cwd();
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
