import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { execa } from 'execa';

export async function makeTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  return dir;
}

export async function runCli(args: string[], opts?: { env?: Record<string, string | undefined> }) {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const srcEntry = path.join(repoRoot, 'src', 'cli', 'index.ts');
  const tsxBin = path.join(repoRoot, 'node_modules', '.bin', 'tsx');
  // Use the current Node binary to execute `tsx`, so tests can override PATH
  // (e.g. to simulate missing `w2`) without breaking the test runner itself.
  const cmd = process.execPath;
  const finalArgs = [tsxBin, srcEntry, ...args];

  const res = await execa(cmd, finalArgs, {
    reject: false,
    env: {
      ...process.env,
      ...opts?.env,
    },
  });
  return {
    exitCode: res.exitCode ?? 0,
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? '',
  };
}
