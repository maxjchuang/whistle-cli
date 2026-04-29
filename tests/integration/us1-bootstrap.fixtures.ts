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
  const distEntry = path.join(repoRoot, 'dist', 'cli', 'index.js');
  const srcEntry = path.join(repoRoot, 'src', 'cli', 'index.ts');

  const distExists = await fs
    .stat(distEntry)
    .then(() => true)
    .catch(() => false);

  const tsxBin = path.join(repoRoot, 'node_modules', '.bin', 'tsx');
  const cmd = distExists ? process.execPath : tsxBin;
  const finalArgs = distExists ? [distEntry, ...args] : [srcEntry, ...args];

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
