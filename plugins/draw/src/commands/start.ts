import { execSync } from 'node:child_process';
import open from 'open';
import { nanoid } from 'nanoid';
import type { StartOptions, ExcalidrawElement } from '../types.js';
import { createSession, saveDrawing, updateSessionMeta } from '../storage/sessions.js';
import { startAutosave, stopAutosave } from '../storage/autosave.js';
import { createHttpServer, findAvailablePort } from '../server/http.js';
import { createRoomServer } from '../server/room.js';
import { detectTunnel, startTunnel, tunnelInstallHint, type TunnelResult } from '../server/tunnel.js';

function getGitUser(): string {
  try {
    return execSync('git config user.name', { encoding: 'utf-8' }).trim() || 'anonymous';
  } catch {
    return 'anonymous';
  }
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30);
}

export async function startSession(projectRoot: string, opts: StartOptions): Promise<void> {
  const creator = getGitUser();
  const suffix = nanoid(6);
  const slug = opts.title ? slugify(opts.title) : 'draw';
  const sessionId = `${slug}-${suffix}`;

  // Create session on disk
  const session = createSession(projectRoot, {
    id: sessionId,
    title: opts.title || 'Untitled drawing',
    creator,
  });

  console.log(`\nStarting draw session: ${sessionId}`);

  // Find available port
  const port = await findAvailablePort(opts.port || 7220);

  // Start HTTP + Socket.IO server (use ref so HTTP layer can read room state)
  let roomRef: ReturnType<typeof createRoomServer> | null = null;

  const httpServer = createHttpServer({
    getElements: () => roomRef?.getElements() ?? [],
    saveElements: () => {},
  });

  const room = createRoomServer(httpServer, sessionId, []);
  roomRef = room;

  const getElements = () => room.getElements();

  await new Promise<void>((resolve) => {
    httpServer.listen(port, () => resolve());
  });

  const localUrl = `http://localhost:${port}?room=${sessionId}&name=${encodeURIComponent(creator)}`;
  console.log(`\n  Local:  http://localhost:${port}`);

  // Start tunnel if requested or if a tunnel tool is available
  let tunnel: TunnelResult | null = null;
  const tunnelBackend = detectTunnel(opts.tunnel);

  if (opts.collab !== false && tunnelBackend) {
    try {
      console.log(`  Tunnel: Starting ${tunnelBackend}...`);
      tunnel = await startTunnel(port, tunnelBackend);
      console.log(`  Share:  ${tunnel.url}`);
    } catch (err) {
      console.error(`  Tunnel failed: ${(err as Error).message}`);
      console.log('  Continuing without tunnel (local only)');
    }
  } else if (opts.collab !== false && !tunnelBackend) {
    console.log(tunnelInstallHint(null));
  }

  console.log('\n  Collaborators can open the share link to join.');
  console.log('  Press Ctrl-C to end session and save.\n');

  // Start autosave
  const autosaveTimer = startAutosave(projectRoot, sessionId, getElements);

  // Open browser
  await open(localUrl);

  // Handle shutdown
  const shutdown = () => {
    console.log('\n\nEnding session...');

    // Final save
    const finalElements = getElements();
    if (finalElements.length > 0) {
      saveDrawing(projectRoot, sessionId, finalElements);
    }

    // Update meta with deduplicated participants
    const liveParticipants = room.getParticipants();
    const allParticipants = [...new Set([creator, ...liveParticipants])];
    updateSessionMeta(projectRoot, sessionId, {
      endedAt: new Date().toISOString(),
      participants: allParticipants,
    });

    // Cleanup
    stopAutosave(autosaveTimer);
    room.close();
    httpServer.close();
    if (tunnel) tunnel.close();

    console.log(`Session saved to .crab/draw/${sessionId}/`);
    console.log(`  Drawing: .crab/draw/${sessionId}/drawing.excalidraw`);
    console.log(`  Reopen:  crab draw ${sessionId}\n`);

    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
