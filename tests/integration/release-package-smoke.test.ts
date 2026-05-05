import { describe, expect, it } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { execa } from 'execa';

function assertJson(payload: string) {
  expect(() => JSON.parse(payload)).not.toThrow();
}

describe('release package smoke', () => {
  it(
    'packs and installs the built artifact, then runs basic commands',
    async () => {
    const repoRoot = path.resolve(__dirname, '..', '..');

    await execa('npm', ['run', 'build'], { cwd: repoRoot, reject: true });

    const packRes = await execa('npm', ['pack', '--silent'], { cwd: repoRoot, reject: true });
    const tgzName = (packRes.stdout ?? '').trim();
    expect(tgzName).toMatch(/\.tgz$/);
    const tgzPath = path.join(repoRoot, tgzName);

    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'whistle-cli-pack-'));
    try {
      await execa('npm', ['init', '-y'], { cwd: tmp, reject: true });
      await execa('npm', ['install', '--silent', tgzPath], { cwd: tmp, reject: true });

      const bin = path.join(tmp, 'node_modules', '.bin', 'whistle-cli');
      const help = await execa(bin, ['--help'], { cwd: tmp, reject: false });
      expect(help.exitCode).toBe(0);

      const inst = await execa(bin, ['--format', 'json', 'instance', 'status'], { cwd: tmp, reject: false });
      // Instance may not be running in CI; success here means "machine-readable output is produced".
      const payload = (inst.stdout || inst.stderr || '').trim();
      assertJson(payload);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
    },
    60_000,
  );
});
