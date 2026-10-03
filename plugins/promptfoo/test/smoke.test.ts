import { afterEach, expect, test } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parse } from 'yaml';
import { parseArtifact, parseArtifactAll } from '../src/parsers/index.js';
import { generateConfig } from '../src/generator/config.js';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('parses an authenticated JSON curl request', () => {
  const artifact = parseArtifact(`curl https://example.test/chat?mode=stream \
    -H 'Authorization: Bearer fixture-token' \
    -H 'Content-Type: application/json' \
    -d '{"message":"hello"}'`);
  expect(artifact).toMatchObject({
    source: 'curl',
    method: 'POST',
    url: 'https://example.test/chat',
    body: { message: 'hello' },
    bodyType: 'json',
    queryParams: { mode: 'stream' },
    auth: { type: 'bearer' },
  });
});

test('discovers all endpoints in an OpenAPI document', () => {
  const artifacts = parseArtifactAll(JSON.stringify({
    openapi: '3.0.0',
    info: { title: 'Fixture', version: '1.0.0' },
    servers: [{ url: 'https://example.test' }],
    paths: {
      '/chat': { post: { responses: { '200': { description: 'OK' } } } },
      '/health': { get: { responses: { '200': { description: 'OK' } } } },
    },
  }));
  expect(artifacts.map(({ method, url }) => ({ method, url }))).toEqual([
    { method: 'POST', url: 'https://example.test/chat' },
    { method: 'GET', url: 'https://example.test/health' },
  ]);
});

test('writes a readable YAML configuration without altering prompt templates', () => {
  const outputDir = mkdtempSync(path.join(tmpdir(), 'crab-pf-config-'));
  directories.push(outputDir);
  const providerConfig = {
    url: 'https://example.test/chat',
    method: 'POST',
    body: { message: '{{prompt}}' },
    responseParser: 'json.answer',
  };
  const result = generateConfig({
    description: 'Fixture configuration',
    providerType: 'http',
    providerConfig,
    outputDir,
  });
  expect(parse(readFileSync(result.filePath, 'utf8'))).toMatchObject({
    description: 'Fixture configuration',
    providers: [{ id: 'http', config: providerConfig }],
    prompts: ['{{prompt}}'],
  });
});
