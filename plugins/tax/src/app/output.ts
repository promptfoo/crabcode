import * as fs from 'node:fs';
import * as path from 'node:path';

export function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function writeJson(filePath: string, data: unknown) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
}

export function writeText(filePath: string, content: string) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf-8');
}

export function appendText(filePath: string, content: string) {
  ensureDir(path.dirname(filePath));
  fs.appendFileSync(filePath, content, 'utf-8');
}
