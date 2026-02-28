import fs from 'node:fs';
import type { ExcalidrawElement } from '../types.js';
import { saveDrawing } from './sessions.js';

const AUTOSAVE_INTERVAL_MS = 30_000;

export function startAutosave(
  projectRoot: string,
  sessionId: string,
  getElements: () => ExcalidrawElement[],
): NodeJS.Timeout {
  return setInterval(() => {
    const elements = getElements();
    if (elements.length > 0) {
      saveDrawing(projectRoot, sessionId, elements);
    }
  }, AUTOSAVE_INTERVAL_MS);
}

export function startFileAutosave(
  filePath: string,
  getElements: () => ExcalidrawElement[],
): NodeJS.Timeout {
  return setInterval(() => {
    const elements = getElements();
    if (elements.length > 0) {
      fs.writeFileSync(filePath, JSON.stringify({ elements }, null, 2) + '\n');
    }
  }, AUTOSAVE_INTERVAL_MS);
}

export function stopAutosave(timer: NodeJS.Timeout): void {
  clearInterval(timer);
}
