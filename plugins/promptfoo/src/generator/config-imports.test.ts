import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { writeProviderFile } from './config.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('writeProviderFile dependency detection', () => {
  it('extracts package imports without regex backtracking', () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crabcode-config-'));
    tempDirs.push(outputDir);

    writeProviderFile({
      outputDir,
      filename: 'provider.js',
      code: [
        'import \t\taxios from "axios";',
        'import { WebSocket } from "ws";',
        'import localThing from "./local.js";',
        'import fs from "node:fs";',
      ].join('\n'),
    });

    const packageJson = JSON.parse(
      fs.readFileSync(path.join(outputDir, 'package.json'), 'utf-8')
    ) as { dependencies: Record<string, string> };

    expect(packageJson.dependencies).toEqual({
      axios: '^1.6.0',
      ws: '^8.18.0',
    });
  });
});
