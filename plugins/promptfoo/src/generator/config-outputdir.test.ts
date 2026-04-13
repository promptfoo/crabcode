import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { generateConfig } from './config.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('generateConfig output paths', () => {
  it('returns a verify path relative to the output directory', () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crabcode-config-'));
    tempDirs.push(outputDir);

    const generated = generateConfig({
      description: 'Test config',
      providerType: 'http',
      providerConfig: { url: 'https://example.com', method: 'GET' },
      outputDir,
      filename: 'nested-config.yaml',
    });

    expect(generated.filePath).toBe(path.join(outputDir, 'nested-config.yaml'));
    expect(generated.verifyPath).toBe('promptfooconfig.yaml');
    expect(fs.existsSync(generated.filePath)).toBe(true);
  });
});
