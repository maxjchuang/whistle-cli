export interface RunResult {
  command: string;
  args: string[];
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  commandNotFound: boolean;
}

async function resolveLocalBin(command: string): Promise<string | null> {
  // Prefer local project binaries (node_modules/.bin) when available.
  // This keeps the CLI runnable in dev/test environments without requiring global installs.
  if (command.includes('/') || command.includes('\\')) return null;

  const path = await import('node:path');
  const fs = await import('node:fs/promises');
  const constants = await import('node:fs');
  const localBin = path.resolve(process.cwd(), 'node_modules', '.bin', command);
  try {
    await fs.access(localBin, constants.constants.X_OK);
    return localBin;
  } catch {
    return null;
  }
}

export async function runSubprocess(
  command: string,
  args: string[],
  opts?: { timeoutMs?: number; cwd?: string },
): Promise<RunResult> {
  const startedAt = Date.now();
  const { execa } = await import('execa');

  const resolvedCommand = (await resolveLocalBin(command)) ?? command;
  const res = await execa(resolvedCommand, args, {
    reject: false,
    timeout: opts?.timeoutMs,
    cwd: opts?.cwd,
  });

  // execa with reject:false returns failed:true + exitCode:undefined for ENOENT
  const commandNotFound = res.failed && res.exitCode === undefined;

  return {
    command: resolvedCommand,
    args,
    exitCode: res.exitCode ?? (commandNotFound ? 127 : 0),
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? '',
    durationMs: Date.now() - startedAt,
    commandNotFound,
  };
}
