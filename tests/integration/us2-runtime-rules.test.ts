import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli } from './us1-bootstrap.fixtures';
import { makeTempDir } from './us2-rules.fixtures';
import { startFakeCaptureBackend } from './us3-captures.fixtures';

describe('US2 runtime default rules (integration)', () => {
  it('rules default get reads runtime default rules from Whistle Web', async () => {
    const stateDir = await makeTempDir('whistle-cli-us2-runtime-state-');
    const backend = await startFakeCaptureBackend();
    try {
      const res = await runCli(['--instance', 'dummy', 'rules', 'default', 'get', '--format', 'json'], {
        env: {
          WHISTLE_CLI_STATE_DIR: stateDir,
          WHISTLE_CLI_RUNTIME_URL: backend.baseUrl,
        },
      });

      expect(res.exitCode).toBe(0);
      const out = JSON.parse(res.stdout);
      expect(out).toMatchObject({
        status: 'ok',
        resource: 'rules',
        action: 'default-get',
        effective: true,
        data: {
          instance_id: 'dummy',
          backend: 'whistle-web',
          source_text: 'example.com reqHeaders://x-old=1\n',
          disabled: false,
        },
      });
    } finally {
      await backend.close();
    }
  });

  it('rules default apply updates and verifies runtime default rules', async () => {
    const stateDir = await makeTempDir('whistle-cli-us2-runtime-state-');
    const workDir = await makeTempDir('whistle-cli-us2-runtime-work-');
    const rulesPath = path.join(workDir, 'default-rules.txt');
    const newRules = 'example.com reqHeaders://x-new=2\n';
    await fs.writeFile(rulesPath, newRules, 'utf8');
    const backend = await startFakeCaptureBackend();
    try {
      const apply = await runCli(
        ['--instance', 'dummy', 'rules', 'default', 'apply', '--file', rulesPath, '--apply', '--verify', '--format', 'json'],
        {
          env: {
            WHISTLE_CLI_STATE_DIR: stateDir,
            WHISTLE_CLI_RUNTIME_URL: backend.baseUrl,
          },
        },
      );

      expect(apply.exitCode).toBe(0);
      const applied = JSON.parse(apply.stdout);
      expect(applied).toMatchObject({
        status: 'ok',
        resource: 'rules',
        action: 'default-apply',
        meta: { verified: true },
        data: {
          apply_result: {
            backend: 'whistle-web',
            changed: true,
            verified: true,
          },
        },
      });

      const get = await runCli(['--instance', 'dummy', 'rules', 'default', 'get', '--format', 'json'], {
        env: {
          WHISTLE_CLI_STATE_DIR: stateDir,
          WHISTLE_CLI_RUNTIME_URL: backend.baseUrl,
        },
      });
      expect(get.exitCode).toBe(0);
      const got = JSON.parse(get.stdout);
      expect(got.data.source_text).toBe(newRules);
    } finally {
      await backend.close();
    }
  });
});
