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

describe('generateConfig filename handling', () => {
  it('keeps the requested filename while writing a stable verify config alias', () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crabcode-config-'));
    tempDirs.push(outputDir);

    const generated = generateConfig({
      description: 'Custom filename config',
      providerType: 'http',
      providerConfig: { url: 'https://example.com', method: 'GET' },
      outputDir,
      filename: 'custom-config.yaml',
    });

    expect(generated.filePath).toBe(path.join(outputDir, 'custom-config.yaml'));
    expect(generated.verifyPath).toBe('promptfooconfig.yaml');
    expect(fs.readFileSync(generated.filePath, 'utf-8')).toBe(
      fs.readFileSync(path.join(outputDir, generated.verifyPath), 'utf-8')
    );
  });
});
