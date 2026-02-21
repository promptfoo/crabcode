import fs from 'node:fs';
import path from 'node:path';
import type { DrawSession, ExcalidrawElement } from '../types.js';

function drawDir(projectRoot: string): string {
  return path.join(projectRoot, '.crab', 'draw');
}

function sessionDir(projectRoot: string, id: string): string {
  return path.join(drawDir(projectRoot), id);
}

export function createSession(
  projectRoot: string,
  opts: { id: string; title: string; creator: string },
): DrawSession {
  const dir = sessionDir(projectRoot, opts.id);
  fs.mkdirSync(dir, { recursive: true });

  const session: DrawSession = {
    id: opts.id,
    title: opts.title,
    creator: opts.creator,
    createdAt: new Date().toISOString(),
    participants: [opts.creator],
    description: '',
  };

  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(session, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, 'drawing.excalidraw'), JSON.stringify({ elements: [] }, null, 2) + '\n');

  return session;
}

export function loadSession(projectRoot: string, id: string): DrawSession | null {
  const metaPath = path.join(sessionDir(projectRoot, id), 'meta.json');
  if (!fs.existsSync(metaPath)) return null;
  return JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
}

export function loadDrawing(projectRoot: string, id: string): ExcalidrawElement[] {
  const drawingPath = path.join(sessionDir(projectRoot, id), 'drawing.excalidraw');
  if (!fs.existsSync(drawingPath)) return [];
  const data = JSON.parse(fs.readFileSync(drawingPath, 'utf-8'));
  return data.elements || [];
}

export function saveDrawing(
  projectRoot: string,
  id: string,
  elements: ExcalidrawElement[],
): void {
  const drawingPath = path.join(sessionDir(projectRoot, id), 'drawing.excalidraw');
  fs.writeFileSync(drawingPath, JSON.stringify({ elements }, null, 2) + '\n');
}

export function updateSessionMeta(
  projectRoot: string,
  id: string,
  updates: Partial<DrawSession>,
): void {
  const session = loadSession(projectRoot, id);
  if (!session) return;
  const updated = { ...session, ...updates };
  const metaPath = path.join(sessionDir(projectRoot, id), 'meta.json');
  fs.writeFileSync(metaPath, JSON.stringify(updated, null, 2) + '\n');
}

export function listSessions(projectRoot: string): DrawSession[] {
  const dir = drawDir(projectRoot);
  if (!fs.existsSync(dir)) return [];

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const sessions: DrawSession[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const session = loadSession(projectRoot, entry.name);
    if (session) sessions.push(session);
  }

  return sessions.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function deleteSession(projectRoot: string, id: string): boolean {
  const dir = sessionDir(projectRoot, id);
  if (!fs.existsSync(dir)) return false;
  fs.rmSync(dir, { recursive: true, force: true });
  return true;
}

export function sessionExists(projectRoot: string, id: string): boolean {
  return fs.existsSync(path.join(sessionDir(projectRoot, id), 'meta.json'));
}

/**
 * Resolve a session by exact ID or prefix match.
 * Returns the full session ID, or null if not found / ambiguous.
 */
export function resolveSession(projectRoot: string, input: string): { id: string; ambiguous?: string[] } | null {
  // Exact match first
  if (sessionExists(projectRoot, input)) {
    return { id: input };
  }

  // Prefix match
  const dir = drawDir(projectRoot);
  if (!fs.existsSync(dir)) return null;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const matches = entries
    .filter((e) => e.isDirectory() && e.name.startsWith(input))
    .map((e) => e.name);

  if (matches.length === 1) {
    return { id: matches[0] };
  }
  if (matches.length > 1) {
    return { id: matches[0], ambiguous: matches };
  }
  return null;
}
