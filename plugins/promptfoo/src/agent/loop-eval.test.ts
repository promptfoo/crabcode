import { beforeEach, describe, expect, it, vi } from 'vitest';

const execFileSyncMock = vi.fn();

vi.mock('node:child_process', () => ({
  execFileSync: execFileSyncMock,
  execSync: vi.fn(),
}));

describe('runPromptfooEval', () => {
  beforeEach(() => {
    execFileSyncMock.mockReset();
  });

  it('invokes promptfoo eval with explicit argv', async () => {
    execFileSyncMock.mockReturnValue('1 passed');

    const { runPromptfooEval } = await import('./loop.js');

    expect(runPromptfooEval('/tmp/job dir', 'promptfooconfig.yaml')).toBe('1 passed');
    expect(execFileSyncMock).toHaveBeenCalledWith(
      'npx',
      ['promptfoo', 'eval', '-c', 'promptfooconfig.yaml', '--no-progress-bar'],
      expect.objectContaining({
        cwd: '/tmp/job dir',
        timeout: 120000,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    );
  });
});
