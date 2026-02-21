import { spawn, execSync, type ChildProcess } from 'node:child_process';

export interface TunnelResult {
  url: string;
  process: ChildProcess;
  close: () => void;
}

type TunnelBackend = 'cloudflared' | 'ngrok' | 'bore';

function commandExists(cmd: string): boolean {
  try {
    execSync(`command -v ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function detectTunnel(preferred?: string): TunnelBackend | null {
  if (preferred) {
    if (commandExists(preferred)) return preferred as TunnelBackend;
    return null;
  }

  // Priority: cloudflared > ngrok > bore
  if (commandExists('cloudflared')) return 'cloudflared';
  if (commandExists('ngrok')) return 'ngrok';
  if (commandExists('bore')) return 'bore';
  return null;
}

export function startTunnel(port: number, backend: TunnelBackend): Promise<TunnelResult> {
  switch (backend) {
    case 'cloudflared':
      return startCloudflared(port);
    case 'ngrok':
      return startNgrok(port);
    case 'bore':
      return startBore(port);
  }
}

function startCloudflared(port: number): Promise<TunnelResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${port}`], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        reject(new Error('Cloudflared tunnel timed out after 30s'));
        proc.kill();
      }
    }, 30_000);

    // cloudflared prints the URL to stderr
    const handleOutput = (data: Buffer) => {
      const line = data.toString();
      const match = line.match(/https:\/\/[^\s]+\.trycloudflare\.com/);
      if (match && !resolved) {
        resolved = true;
        clearTimeout(timeout);
        resolve({
          url: match[0],
          process: proc,
          close: () => proc.kill(),
        });
      }
    };

    proc.stderr?.on('data', handleOutput);
    proc.stdout?.on('data', handleOutput);

    proc.on('error', (err) => {
      if (!resolved) {
        clearTimeout(timeout);
        reject(new Error(`Failed to start cloudflared: ${err.message}`));
      }
    });

    proc.on('exit', (code) => {
      if (!resolved) {
        clearTimeout(timeout);
        reject(new Error(`cloudflared exited with code ${code}`));
      }
    });
  });
}

function startNgrok(port: number): Promise<TunnelResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ngrok', ['http', String(port), '--log', 'stdout', '--log-format', 'json'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        reject(new Error('ngrok tunnel timed out after 30s'));
        proc.kill();
      }
    }, 30_000);

    proc.stdout?.on('data', (data: Buffer) => {
      const line = data.toString();
      try {
        const log = JSON.parse(line);
        if (log.url && log.url.startsWith('https://') && !resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve({
            url: log.url,
            process: proc,
            close: () => proc.kill(),
          });
        }
      } catch {
        // Not JSON, check for URL pattern
        const match = line.match(/https:\/\/[^\s]+\.ngrok[^\s]*/);
        if (match && !resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve({
            url: match[0],
            process: proc,
            close: () => proc.kill(),
          });
        }
      }
    });

    proc.on('error', (err) => {
      if (!resolved) {
        clearTimeout(timeout);
        reject(new Error(`Failed to start ngrok: ${err.message}`));
      }
    });
  });
}

function startBore(port: number): Promise<TunnelResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn('bore', ['local', String(port), '--to', 'bore.pub'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        reject(new Error('bore tunnel timed out after 30s'));
        proc.kill();
      }
    }, 30_000);

    const handleOutput = (data: Buffer) => {
      const line = data.toString();
      // bore outputs: "listening at bore.pub:XXXXX"
      const match = line.match(/bore\.pub:(\d+)/);
      if (match && !resolved) {
        resolved = true;
        clearTimeout(timeout);
        resolve({
          url: `http://bore.pub:${match[1]}`,
          process: proc,
          close: () => proc.kill(),
        });
      }
    };

    proc.stdout?.on('data', handleOutput);
    proc.stderr?.on('data', handleOutput);

    proc.on('error', (err) => {
      if (!resolved) {
        clearTimeout(timeout);
        reject(new Error(`Failed to start bore: ${err.message}`));
      }
    });
  });
}

export function tunnelInstallHint(backend: string | null): string {
  if (backend) return '';
  return [
    'No tunnel tool found. Install one to enable sharing:',
    '',
    '  brew install cloudflared    # Recommended (free, no account)',
    '  brew install ngrok          # Alternative (free tier has 2h limit)',
    '  cargo install bore-cli      # Lightweight (Rust)',
    '',
  ].join('\n');
}
