export interface RunResult {
  command: string;
  args: string[];
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export async function runSubprocess(
  command: string,
  args: string[],
  opts?: { timeoutMs?: number; cwd?: string },
): Promise<RunResult> {
  const startedAt = Date.now();
  const { execa } = await import('execa');
  const res = await execa(command, args, {
    reject: false,
    timeout: opts?.timeoutMs,
    cwd: opts?.cwd,
  });

  return {
    command,
    args,
    exitCode: res.exitCode ?? 0,
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? '',
    durationMs: Date.now() - startedAt,
  };
}
