import path from 'node:path';
import { defaultWhistleStorageDir } from '../storage/whistle-storage';
import { runSubprocess, type RunResult } from './process-runner';

export interface W2RunOptions {
  timeoutMs?: number;
  instanceId?: string;
}

export interface W2CommandFailure {
  kind: 'command_not_found' | 'failed';
  result: RunResult;
}

export interface W2Ok<TData> {
  ok: true;
  data: TData;
  result: RunResult;
}

export interface W2Err {
  ok: false;
  error: W2CommandFailure;
}

export type W2Response<TData> = W2Ok<TData> | W2Err;

function normalizeInstanceId(instanceId?: string): string | undefined {
  const id = instanceId?.trim();
  if (!id) return undefined;
  if (id === 'default') return undefined;
  return id;
}

export class W2Client {
  async run(args: string[], opts?: W2RunOptions): Promise<RunResult> {
    return this.runWithInstance(args, opts);
  }

  async status(opts?: W2RunOptions): Promise<RunResult> {
    return this.runWithInstance(['status'], opts);
  }

  async start(opts?: W2RunOptions & { port?: number }): Promise<RunResult> {
    const args = ['start'];
    if (typeof opts?.port === 'number') {
      args.push('-p', String(opts.port));
    }
    return this.runWithInstance(args, opts);
  }

  async stop(opts?: W2RunOptions): Promise<RunResult> {
    return this.runWithInstance(['stop'], opts);
  }

  async restart(opts?: W2RunOptions & { port?: number }): Promise<RunResult> {
    const args = ['restart'];
    if (typeof opts?.port === 'number') {
      args.push('-p', String(opts.port));
    }
    return this.runWithInstance(args, opts);
  }

  async list(opts?: W2RunOptions): Promise<RunResult> {
    // `w2` subcommand name varies between releases; try common variants.
    const attempts: string[][] = [['list'], ['ls'], ['status']];
    let last: RunResult | null = null;
    for (const args of attempts) {
      const res = await this.runWithInstance(args, opts);
      last = res;
      if (res.commandNotFound) return res;
      if (res.exitCode === 0) return res;
    }
    return last!;
  }

  async ca(opts?: W2RunOptions): Promise<RunResult> {
    // Note: This may open UI on some platforms; callers should treat this as best-effort.
    return this.runWithInstance(['ca'], { ...opts, timeoutMs: opts?.timeoutMs ?? 30_000 });
  }

  async proxyStatus(opts?: W2RunOptions): Promise<RunResult> {
    return this.runWithInstance(['proxy'], opts);
  }

  async proxySet(port: number, opts?: W2RunOptions): Promise<RunResult> {
    return this.runWithInstance(['proxy', String(port)], opts);
  }

  async proxyOff(opts?: W2RunOptions): Promise<RunResult> {
    return this.runWithInstance(['proxy', '0'], opts);
  }

  async pluginsList(opts?: W2RunOptions): Promise<RunResult> {
    // Best-effort: Whistle uses `w2 plugin ...` in some versions.
    const attempts: string[][] = [['plugin', 'list'], ['plugins', 'list']];
    let last: RunResult | null = null;
    for (const args of attempts) {
      const res = await this.runWithInstance(args, opts);
      last = res;
      if (res.commandNotFound) return res;
      if (res.exitCode === 0) return res;
    }
    return last!;
  }

  async pluginInstall(name: string, opts?: W2RunOptions): Promise<RunResult> {
    const attempts: string[][] = [
      ['plugin', 'install', name],
      ['plugins', 'install', name],
      ['install', name],
    ];
    return this.runFirstOk(attempts, opts);
  }

  async pluginUninstall(name: string, opts?: W2RunOptions): Promise<RunResult> {
    const attempts: string[][] = [
      ['plugin', 'uninstall', name],
      ['plugins', 'uninstall', name],
      ['uninstall', name],
    ];
    return this.runFirstOk(attempts, opts);
  }

  private async runFirstOk(attempts: string[][], opts?: W2RunOptions): Promise<RunResult> {
    let last: RunResult | null = null;
    for (const args of attempts) {
      const res = await this.runWithInstance(args, opts);
      last = res;
      if (res.commandNotFound) return res;
      if (res.exitCode === 0) return res;
    }
    return last!;
  }

  private async runWithInstance(args: string[], opts?: W2RunOptions): Promise<RunResult> {
    const timeoutMs = opts?.timeoutMs ?? 30_000;
    const instanceId = normalizeInstanceId(opts?.instanceId);
    if (!instanceId) {
      return runSubprocess('w2', args, { timeoutMs });
    }

    // Whistle `w2` does not have a stable "instance name" flag.
    // Use `--baseDir` to scope storage per instance id.
    const baseDir = instanceId.includes('/') || instanceId.includes('\\')
      ? instanceId
      : path.join(defaultWhistleStorageDir(), 'instances', instanceId);
    return runSubprocess('w2', ['-D', baseDir, ...args], { timeoutMs });
  }
}
