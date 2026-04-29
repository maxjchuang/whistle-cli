export interface RunResult {
  command: string;
  args: string[];
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  commandNotFound: boolean;
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

  // execa with reject:false returns failed:true + exitCode:undefined for ENOENT
  const commandNotFound = res.failed && res.exitCode === undefined;

  return {
    command,
    args,
    exitCode: res.exitCode ?? (commandNotFound ? 127 : 0),
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? '',
    durationMs: Date.now() - startedAt,
    commandNotFound,
  };
}
