import { beforeEach, describe, expect, it, vi } from 'vitest';

const execFileSyncMock = vi.fn();

vi.mock('node:child_process', () => ({
  execFileSync: execFileSyncMock,
  execSync: vi.fn(),
}));

describe('installProviderDependencies', () => {
  beforeEach(() => {
    execFileSyncMock.mockReset();
  });

  it('invokes npm without building a shell string', async () => {
    const { installProviderDependencies } = await import('./loop.js');

    installProviderDependencies('/tmp/provider with spaces');

    expect(execFileSyncMock).toHaveBeenCalledWith(
      'npm',
      ['install', '--silent'],
      expect.objectContaining({
        cwd: '/tmp/provider with spaces',
        timeout: 60000,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    );
  });
});
