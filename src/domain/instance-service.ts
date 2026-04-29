import { W2Client } from '../backends/raw/w2-client';
import { CliError } from '../output/errors';

export type InstanceRuntimeStatus = 'running' | 'stopped' | 'unknown';

export interface InstanceStatus {
  status: InstanceRuntimeStatus;
  host: string;
  port: number;
  ui_url: string;
  proxy_url: string;
  raw?: {
    stdout: string;
    stderr: string;
  };
}

function ensureW2Available(res: { commandNotFound: boolean; stderr: string; stdout: string }) {
  if (!res.commandNotFound) return;
  throw new CliError({
    code: 'UNSUPPORTED_OPERATION',
    message: '`w2` command not found on PATH',
    reason: 'whistle-cli uses `w2` as the v1 backend adapter',
    suggested_fix: 'Install whistle: `npm install -g whistle` (or add it as a devDependency).',
  });
}

function inferPortFromOutput(out: string): number | null {
  // Best-effort. Whistle defaults to 8899.
  const m1 = out.match(/\bport\b[^\d]{0,10}(\d{2,5})\b/i);
  if (m1?.[1]) return Number(m1[1]);
  const m2 = out.match(/\bhttps?:\/\/[^\s:]+:(\d{2,5})\b/i);
  if (m2?.[1]) return Number(m2[1]);
  return null;
}

function inferRunningFromOutput(out: string): InstanceRuntimeStatus {
  const s = out.toLowerCase();
  if (s.includes('not running') || s.includes('no running') || s.includes('stopped')) return 'stopped';
  if (s.includes('running') || s.includes('listening') || s.includes('started')) return 'running';
  return 'unknown';
}

export class InstanceService {
  private readonly w2: W2Client;

  constructor(w2Client?: W2Client) {
    this.w2 = w2Client ?? new W2Client();
  }

  async status(instanceId?: string): Promise<InstanceStatus> {
    const res = await this.w2.status({ instanceId });
    ensureW2Available(res);

    const merged = `${res.stdout}\n${res.stderr}`.trim();
    const status = res.exitCode === 0 ? inferRunningFromOutput(merged) : 'unknown';
    const port = inferPortFromOutput(merged) ?? 8899;
    const host = '127.0.0.1';
    return {
      status,
      host,
      port,
      ui_url: `http://${host}:${port}/`,
      proxy_url: `${host}:${port}`,
      raw: {
        stdout: res.stdout,
        stderr: res.stderr,
      },
    };
  }

  async start(instanceId?: string, port?: number) {
    const res = await this.w2.start({ instanceId, port });
    ensureW2Available(res);
    return res;
  }

  async stop(instanceId?: string) {
    const res = await this.w2.stop({ instanceId });
    ensureW2Available(res);
    return res;
  }

  async restart(instanceId?: string, port?: number) {
    const res = await this.w2.restart({ instanceId, port });
    ensureW2Available(res);
    return res;
  }

  async list(instanceId?: string) {
    const res = await this.w2.list({ instanceId });
    ensureW2Available(res);
    return res;
  }
}

