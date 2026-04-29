import { W2Client } from '../backends/raw/w2-client';
import { CliError } from '../output/errors';

export type ProxyMode = 'system' | 'env';

export interface ProxyStatus {
  mode: ProxyMode;
  expected: {
    host: string;
    port: number;
  };
  env?: {
    http_proxy?: string;
    https_proxy?: string;
    no_proxy?: string;
  };
  active: boolean;
  raw?: {
    stdout: string;
    stderr: string;
  };
}

function ensureW2Available(res: { commandNotFound: boolean }) {
  if (!res.commandNotFound) return;
  throw new CliError({
    code: 'UNSUPPORTED_OPERATION',
    message: '`w2` command not found on PATH',
    reason: 'Proxy management relies on `w2 proxy` in v1',
    suggested_fix: 'Install whistle: `npm install -g whistle` (or add it as a devDependency).',
  });
}

function normalizeProxyValue(v: string | undefined): string | undefined {
  const s = v?.trim();
  if (!s) return undefined;
  return s;
}

function envLooksActive(expectedHost: string, expectedPort: number): boolean {
  const httpProxy = normalizeProxyValue(process.env.HTTP_PROXY || process.env.http_proxy);
  const httpsProxy = normalizeProxyValue(process.env.HTTPS_PROXY || process.env.https_proxy);
  const expected = `${expectedHost}:${expectedPort}`;
  return [httpProxy, httpsProxy].some((v) => (v ? v.includes(expected) : false));
}

export class ProxyService {
  private readonly w2: W2Client;

  constructor(w2Client?: W2Client) {
    this.w2 = w2Client ?? new W2Client();
  }

  detectMode(): ProxyMode {
    // On Linux headless, environment variables are the most reliable user-controlled proxy.
    if (process.platform === 'linux') return 'env';
    return 'system';
  }

  async status(expectedHost: string, expectedPort: number, instanceId?: string): Promise<ProxyStatus> {
    const mode = this.detectMode();
    if (mode === 'env') {
      return {
        mode,
        expected: { host: expectedHost, port: expectedPort },
        env: {
          http_proxy: normalizeProxyValue(process.env.HTTP_PROXY || process.env.http_proxy),
          https_proxy: normalizeProxyValue(process.env.HTTPS_PROXY || process.env.https_proxy),
          no_proxy: normalizeProxyValue(process.env.NO_PROXY || process.env.no_proxy),
        },
        active: envLooksActive(expectedHost, expectedPort),
      };
    }

    const res = await this.w2.proxyStatus({ instanceId });
    ensureW2Available(res);
    const merged = `${res.stdout}\n${res.stderr}`;
    const expected = `${expectedHost}:${expectedPort}`;
    const active = res.exitCode === 0 && merged.includes(expected);
    return {
      mode,
      expected: { host: expectedHost, port: expectedPort },
      active,
      raw: { stdout: res.stdout, stderr: res.stderr },
    };
  }

  async setSystemProxy(port: number, instanceId?: string) {
    const res = await this.w2.proxySet(port, { instanceId });
    ensureW2Available(res);
    if (res.exitCode !== 0) {
      throw new CliError({
        code: 'UNSUPPORTED_OPERATION',
        message: 'w2 proxy set failed',
        reason: res.stderr || res.stdout || `exitCode=${res.exitCode}`,
        suggested_fix: 'Try `whistle-cli raw w2 proxy <port>` to see full output.',
      });
    }
    return res;
  }

  async offSystemProxy(instanceId?: string) {
    const res = await this.w2.proxyOff({ instanceId });
    ensureW2Available(res);
    if (res.exitCode !== 0) {
      throw new CliError({
        code: 'UNSUPPORTED_OPERATION',
        message: 'w2 proxy off failed',
        reason: res.stderr || res.stdout || `exitCode=${res.exitCode}`,
        suggested_fix: 'Try `whistle-cli raw w2 proxy 0` to see full output.',
      });
    }
    return res;
  }

  envSetGuide(expectedHost: string, expectedPort: number): { instruction: string; suggested_fix: string } {
    const hp = `http://${expectedHost}:${expectedPort}`;
    return {
      instruction: '当前平台建议用环境变量代理（无法由子进程直接修改你当前 shell 的环境）。',
      suggested_fix: `export HTTP_PROXY=${hp} HTTPS_PROXY=${hp} NO_PROXY=localhost,127.0.0.1`,
    };
  }
}

