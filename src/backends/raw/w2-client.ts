import { runSubprocess, type RunResult } from './process-runner';

export class W2Client {
  async run(args: string[]): Promise<RunResult> {
    return runSubprocess('w2', args, { timeoutMs: 30_000 });
  }
}

