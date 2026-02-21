import { loadSession, deleteSession } from '../storage/sessions.js';

export function deleteDrawSession(projectRoot: string, sessionId: string): void {
  const session = loadSession(projectRoot, sessionId);

  if (!session) {
    console.error(`Error: Session "${sessionId}" not found`);
    process.exit(1);
  }

  const deleted = deleteSession(projectRoot, sessionId);

  if (deleted) {
    console.log(`Deleted: ${session.title} (${sessionId})`);
  } else {
    console.error(`Failed to delete session "${sessionId}"`);
    process.exit(1);
  }
}
