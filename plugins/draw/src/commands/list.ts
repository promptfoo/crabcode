import { listSessions } from '../storage/sessions.js';

export function listDrawSessions(projectRoot: string): void {
  const sessions = listSessions(projectRoot);

  if (sessions.length === 0) {
    console.log('\nNo draw sessions found.');
    console.log('Start one with: crab draw\n');
    return;
  }

  console.log(`\n  Draw sessions (${sessions.length}):\n`);

  const now = Date.now();

  for (const s of sessions) {
    const date = new Date(s.createdAt);
    const age = now - date.getTime();
    const ageStr = formatAge(age);
    const status = s.endedAt ? 'saved' : 'active';

    console.log(`  ${s.id}`);
    console.log(`    ${s.title}  ·  ${s.creator}  ·  ${ageStr}  ·  ${status}`);
    if (s.participants.length > 1) {
      console.log(`    Participants: ${s.participants.join(', ')}`);
    }
    console.log('');
  }

  console.log('  Tip: you can use a prefix to match, e.g. "crab draw first-test"');
  console.log('  Open:   crab draw <session-id>');
  console.log('  Collab: crab draw <session-id> --collab');
  console.log('  Delete: crab draw delete <session-id>\n');
}

function formatAge(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}
