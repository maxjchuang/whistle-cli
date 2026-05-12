import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli } from './us1-bootstrap.fixtures';
import { startFakeCaptureBackend } from './us3-captures.fixtures';

describe('rules diagnose-conflicts', () => {
  it('reports conflicts from runtime default rules', async () => {
    const backend = await startFakeCaptureBackend();
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'whistle-cli-conflicts-'));
    const file = path.join(dir, 'rules.txt');
    await fs.writeFile(
      file,
      '/^https:\\/\\/example\\.com\\// reqHeaders://x-env=wide\n/\\/api\\/widgets\\/[^/]+\\/trigger/ reqHeaders://x-env=specific\n',
      'utf8',
    );
    try {
      await runCli(['--instance', 'dummy', 'rules', 'default', 'apply', '--file', file, '--apply', '--verify', '--format', 'json'], {
        env: { WHISTLE_CLI_RUNTIME_URL: backend.baseUrl },
      });
      const res = await runCli(
        [
          '--instance',
          'dummy',
          'rules',
          'diagnose-conflicts',
          '--header',
          'x-env',
          '--url',
          'https://example.com/api/widgets/123/trigger',
          '--format',
          'json',
        ],
        { env: { WHISTLE_CLI_RUNTIME_URL: backend.baseUrl } },
      );
      expect(res.exitCode).not.toBe(0);
      expect(res.stdout).toContain('"conflict":true');
      expect(res.stdout).toContain('"value":"wide"');
      expect(res.stdout).toContain('"value":"specific"');
    } finally {
      await backend.close();
    }
  });

  it('exits zero when no runtime default rule conflict is found', async () => {
    const backend = await startFakeCaptureBackend();
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'whistle-cli-conflicts-'));
    const file = path.join(dir, 'rules.txt');
    await fs.writeFile(file, 'example.com/api reqHeaders://X-Env=single\n', 'utf8');
    try {
      await runCli(['--instance', 'dummy', 'rules', 'default', 'apply', '--file', file, '--apply', '--verify', '--format', 'json'], {
        env: { WHISTLE_CLI_RUNTIME_URL: backend.baseUrl },
      });
      const res = await runCli(
        [
          '--instance',
          'dummy',
          'rules',
          'diagnose-conflicts',
          '--header',
          'x-env',
          '--url',
          'https://example.com/api/widgets/123/trigger',
          '--format',
          'json',
        ],
        { env: { WHISTLE_CLI_RUNTIME_URL: backend.baseUrl } },
      );
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain('"conflict":false');
      expect(res.stdout).toContain('"value":"single"');
    } finally {
      await backend.close();
    }
  });
});
