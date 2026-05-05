import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { execa } from 'execa';

describe('compatibility gate', () => {
  it('accepts same-major versions', async () => {
    const repoRoot = path.resolve(__dirname, '..', '..');
    const res = await execa('bash', ['./scripts/check-compatibility.sh'], {
      cwd: repoRoot,
      reject: false,
      env: {
        ...process.env,
        WHISTLE_CLI_INSTALLED_VERSION: '0.9.0',
      },
    });
    expect(res.exitCode).toBe(0);
  });

  it('rejects mismatched-major versions', async () => {
    const repoRoot = path.resolve(__dirname, '..', '..');
    const res = await execa('bash', ['./scripts/check-compatibility.sh'], {
      cwd: repoRoot,
      reject: false,
      env: {
        ...process.env,
        WHISTLE_CLI_INSTALLED_VERSION: '1.0.0',
      },
    });
    expect(res.exitCode).toBe(12);
  });
});

