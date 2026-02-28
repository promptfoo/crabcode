import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import open from 'open';
import type { OpenOptions, OpenFileOptions, ExcalidrawElement } from '../types.js';
import { loadSession, loadDrawing, saveDrawing, updateSessionMeta } from '../storage/sessions.js';
import { startAutosave, startFileAutosave, stopAutosave } from '../storage/autosave.js';
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

export async function openSession(projectRoot: string, opts: OpenOptions): Promise<void> {
  const session = loadSession(projectRoot, opts.sessionId);
  if (!session) {
    console.error(`Error: Session "${opts.sessionId}" not found`);
    process.exit(1);
  }

  const initialElements = loadDrawing(projectRoot, opts.sessionId);
  const creator = getGitUser();

  console.log(`\nOpening: ${session.title} (${opts.sessionId})`);
  console.log(`  Created by ${session.creator} on ${new Date(session.createdAt).toLocaleDateString()}`);
  console.log(`  Elements: ${initialElements.length}`);

  const port = await findAvailablePort(opts.port || 7220);

  let roomRef: ReturnType<typeof createRoomServer> | null = null;

  const httpServer = createHttpServer({
    getElements: () => roomRef?.getElements() ?? initialElements,
    saveElements: () => {},
  });

  const room = createRoomServer(httpServer, opts.sessionId, initialElements);
  roomRef = room;

  await new Promise<void>((resolve) => {
    httpServer.listen(port, () => resolve());
  });

  const localUrl = `http://localhost:${port}?room=${opts.sessionId}&name=${encodeURIComponent(creator)}`;
  console.log(`\n  Local:  http://localhost:${port}`);

  let tunnel: TunnelResult | null = null;

  if (opts.collab) {
    const tunnelBackend = detectTunnel(opts.tunnel);
    if (tunnelBackend) {
      try {
        console.log(`  Tunnel: Starting ${tunnelBackend}...`);
        tunnel = await startTunnel(port, tunnelBackend);
        console.log(`  Share:  ${tunnel.url}`);
      } catch (err) {
        console.error(`  Tunnel failed: ${(err as Error).message}`);
      }
    } else {
      console.log(tunnelInstallHint(null));
    }
  }

  console.log('\n  Press Ctrl-C to end session and save.\n');

  const autosaveTimer = startAutosave(projectRoot, opts.sessionId, () => room.getElements());

  await open(localUrl);

  const shutdown = () => {
    console.log('\n\nEnding session...');

    const finalElements = room.getElements();
    if (finalElements.length > 0) {
      saveDrawing(projectRoot, opts.sessionId, finalElements);
    }

    const participants = room.getParticipants();
    if (participants.length > 0) {
      const allParticipants = [...new Set([...session.participants, ...participants])];
      updateSessionMeta(projectRoot, opts.sessionId, {
        endedAt: new Date().toISOString(),
        participants: allParticipants,
      });
    }

    stopAutosave(autosaveTimer);
    room.close();
    httpServer.close();
    if (tunnel) tunnel.close();

    console.log(`Session saved to .crab/draw/${opts.sessionId}/`);
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

export async function openFile(opts: OpenFileOptions): Promise<void> {
  const filePath = path.resolve(opts.filePath);

  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const initialElements: ExcalidrawElement[] = data.elements || [];
  const fileName = path.basename(filePath, '.excalidraw');
  const creator = getGitUser();

  console.log(`\nOpening: ${filePath}`);
  console.log(`  Elements: ${initialElements.length}`);

  const port = await findAvailablePort(opts.port || 7220);

  let roomRef: ReturnType<typeof createRoomServer> | null = null;

  const httpServer = createHttpServer({
    getElements: () => roomRef?.getElements() ?? initialElements,
    saveElements: () => {},
  });

  const room = createRoomServer(httpServer, fileName, initialElements);
  roomRef = room;

  await new Promise<void>((resolve) => {
    httpServer.listen(port, () => resolve());
  });

  const localUrl = `http://localhost:${port}?room=${encodeURIComponent(fileName)}&name=${encodeURIComponent(creator)}`;
  console.log(`\n  Local:  http://localhost:${port}`);

  let tunnel: TunnelResult | null = null;

  if (opts.collab) {
    const tunnelBackend = detectTunnel(opts.tunnel);
    if (tunnelBackend) {
      try {
        console.log(`  Tunnel: Starting ${tunnelBackend}...`);
        tunnel = await startTunnel(port, tunnelBackend);
        console.log(`  Share:  ${tunnel.url}`);
      } catch (err) {
        console.error(`  Tunnel failed: ${(err as Error).message}`);
      }
    } else {
      console.log(tunnelInstallHint(null));
    }
  }

  console.log('\n  Press Ctrl-C to save and exit.\n');

  const autosaveTimer = startFileAutosave(filePath, () => room.getElements());

  await open(localUrl);

  const shutdown = () => {
    console.log('\n\nSaving...');

    const finalElements = room.getElements();
    if (finalElements.length > 0) {
      fs.writeFileSync(filePath, JSON.stringify({ elements: finalElements }, null, 2) + '\n');
    }

    stopAutosave(autosaveTimer);
    room.close();
    httpServer.close();
    if (tunnel) tunnel.close();

    console.log(`Saved to ${filePath}`);
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
