import * as fs from 'node:fs';
import * as path from 'node:path';

const SUPPORTED_EXTENSIONS = new Set([
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
]);

export function listInputFiles(inputDir: string): string[] {
  const entries = fs.readdirSync(inputDir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    if (entry.name.endsWith('.mock.json')) {
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) {
      continue;
    }
    files.push(path.join(inputDir, entry.name));
  }

  return files.sort((a, b) => a.localeCompare(b));
}
