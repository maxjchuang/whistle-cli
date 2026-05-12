import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { runCli } from './us1-bootstrap.fixtures';
import { makeTempDir } from './us2-rules.fixtures';
import { startFakeCaptureBackend } from './us3-captures.fixtures';

async function getRuntimeDefaultRules(stateDir: string, runtimeUrl: string) {
  const res = await runCli(['--instance', 'dummy', 'rules', 'default', 'get', '--format', 'json'], {
    env: { WHISTLE_CLI_STATE_DIR: stateDir, WHISTLE_CLI_RUNTIME_URL: runtimeUrl },
  });
  expect(res.exitCode).toBe(0);
  return JSON.parse(res.stdout).data as { source_text: string; disabled: boolean };
}

describe('rule set-header runtime flow', () => {
  it('applies a header rule to runtime default rules and verifies live traffic', async () => {
    const stateDir = await makeTempDir('whistle-cli-runtime-set-header-');
    const backend = await startFakeCaptureBackend({ initialDefaultRulesIsDisabled: true });
    try {
      const res = await runCli(
        [
          '--instance',
          'dummy',
          'rule',
          'set-header',
          '--match',
          '/^https:\\/\\/example\\.com\\//',
          '--header',
          'x-env=staging',
          '--apply',
          '--runtime-default',
          '--verify-live',
          '--duration',
          '0s',
          '--format',
          'json',
        ],
        { env: { WHISTLE_CLI_STATE_DIR: stateDir, WHISTLE_CLI_RUNTIME_URL: backend.baseUrl } },
      );
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain('"action":"set-header"');
      expect(res.stdout).toContain('"runtime"');
      expect(res.stdout).toContain('"live_verification"');
      expect(res.stdout).toContain('"classification":"OK"');
      const out = JSON.parse(res.stdout);
      expect(out.meta.action_id).toMatch(/^act_/);
      expect(out.data.runtime).toMatchObject({ backend: 'whistle-web', changed: true });
      await expect(getRuntimeDefaultRules(stateDir, backend.baseUrl)).resolves.toMatchObject({
        source_text: 'example.com reqHeaders://x-old=1\n/^https:\\/\\/example\\.com\\// reqHeaders://x-env=staging\n',
        disabled: false,
      });

      const rollback = await runCli(['--instance', 'dummy', 'rules', 'rollback', '--action-id', out.meta.action_id, '--format', 'json'], {
        env: { WHISTLE_CLI_STATE_DIR: stateDir, WHISTLE_CLI_RUNTIME_URL: backend.baseUrl },
      });
      expect(rollback.exitCode).toBe(0);
      await expect(getRuntimeDefaultRules(stateDir, backend.baseUrl)).resolves.toMatchObject({
        source_text: 'example.com reqHeaders://x-old=1\n',
        disabled: true,
      });
    } finally {
      await backend.close();
    }
  });

  it('previews runtime default append without mutating runtime rules', async () => {
    const stateDir = await makeTempDir('whistle-cli-runtime-set-header-');
    const backend = await startFakeCaptureBackend();
    try {
      const res = await runCli(
        [
          '--instance',
          'dummy',
          'rule',
          'set-header',
          '--match',
          '/^https:\\/\\/example\\.com\\//',
          '--header',
          'x-env=preview',
          '--preview',
          '--runtime-default',
          '--format',
          'json',
        ],
        { env: { WHISTLE_CLI_STATE_DIR: stateDir, WHISTLE_CLI_RUNTIME_URL: backend.baseUrl } },
      );

      expect(res.exitCode).toBe(0);
      const out = JSON.parse(res.stdout);
      expect(out).toMatchObject({
        status: 'ok',
        resource: 'rules',
        action: 'set-header',
        effective: false,
        data: {
          preview: {
            backend: 'whistle-web',
          },
        },
      });
      expect(out.data.preview.next_source_text).toContain('reqHeaders://x-env=preview');
      await expect(getRuntimeDefaultRules(stateDir, backend.baseUrl)).resolves.toMatchObject({
        source_text: 'example.com reqHeaders://x-old=1\n',
        disabled: false,
      });
    } finally {
      await backend.close();
    }
  });

  it('rejects invalid live verification input before mutating runtime rules', async () => {
    const stateDir = await makeTempDir('whistle-cli-runtime-set-header-');
    const backend = await startFakeCaptureBackend();
    try {
      const res = await runCli(
        [
          '--instance',
          'dummy',
          'rule',
          'set-header',
          '--match',
          '/^https:\\/\\/example\\.com\\//',
          '--ref',
          '{envHeaders}',
          '--apply',
          '--runtime-default',
          '--verify-live',
          '--format',
          'json',
        ],
        { env: { WHISTLE_CLI_STATE_DIR: stateDir, WHISTLE_CLI_RUNTIME_URL: backend.baseUrl } },
      );

      expect(res.exitCode).not.toBe(0);
      expect(JSON.parse(res.stderr)).toMatchObject({
        status: 'error',
        resource: 'rules',
        action: 'set-header',
        error: { code: 'UNSUPPORTED_OPERATION' },
      });
      await expect(getRuntimeDefaultRules(stateDir, backend.baseUrl)).resolves.toMatchObject({
        source_text: 'example.com reqHeaders://x-old=1\n',
        disabled: false,
      });
    } finally {
      await backend.close();
    }
  });

  it.each([
    '/^https:\\/\\/example\\.com\\//',
    '/^http:\\/\\/example\\.com\\//',
    '/^https?:\\/\\/example\\.com\\//',
    'https://example.com/path',
  ])('derives host for live verification from %s', async (match) => {
    const stateDir = await makeTempDir('whistle-cli-runtime-set-header-');
    const backend = await startFakeCaptureBackend();
    try {
      const res = await runCli(
        [
          '--instance',
          'dummy',
          'rule',
          'set-header',
          '--match',
          match,
          '--header',
          'x-env=staging',
          '--preview',
          '--runtime-default',
          '--verify-live',
          '--format',
          'json',
        ],
        { env: { WHISTLE_CLI_STATE_DIR: stateDir, WHISTLE_CLI_RUNTIME_URL: backend.baseUrl } },
      );

      expect(res.exitCode).toBe(0);
      await expect(getRuntimeDefaultRules(stateDir, backend.baseUrl)).resolves.toMatchObject({
        source_text: 'example.com reqHeaders://x-old=1\n',
      });
    } finally {
      await backend.close();
    }
  });

  it('exits nonzero when live verification is not OK', async () => {
    const stateDir = await makeTempDir('whistle-cli-runtime-set-header-');
    const backend = await startFakeCaptureBackend({
      nativeCaptureData: {
        n1: {
          id: 'n1',
          url: 'https://example.com/api/ok',
          req: {
            method: 'GET',
            headers: { host: 'example.com', 'x-env': 'prod' },
          },
          res: { statusCode: 200 },
        },
      },
    });
    try {
      const res = await runCli(
        [
          '--instance',
          'dummy',
          'rule',
          'set-header',
          '--match',
          '/^https:\\/\\/example\\.com\\//',
          '--header',
          'x-env=staging',
          '--apply',
          '--runtime-default',
          '--verify-live',
          '--duration',
          '0s',
          '--format',
          'json',
        ],
        { env: { WHISTLE_CLI_STATE_DIR: stateDir, WHISTLE_CLI_RUNTIME_URL: backend.baseUrl } },
      );

      expect(res.exitCode).toBe(1);
      const out = JSON.parse(res.stdout);
      expect(out.meta.action_id).toMatch(/^act_/);
      expect(out).toMatchObject({
        status: 'ok',
        resource: 'rules',
        action: 'set-header',
        effective: false,
        data: {
          live_verification: {
            classification: 'OVERRIDDEN',
          },
        },
      });
    } finally {
      await backend.close();
    }
  });

  it('rejects live verification without runtime default before storage mutation', async () => {
    const stateDir = await makeTempDir('whistle-cli-runtime-set-header-');
    const instanceDir = await makeTempDir('whistle-cli-runtime-set-header-instance-');
    const res = await runCli(
      [
        '--instance',
        instanceDir,
        'rule',
        'set-header',
        '--match',
        '/^https:\\/\\/example\\.com\\//',
        '--header',
        'x-env=staging',
        '--apply',
        '--verify-live',
        '--format',
        'json',
      ],
      { env: { WHISTLE_CLI_STATE_DIR: stateDir } },
    );

    expect(res.exitCode).not.toBe(0);
    expect(JSON.parse(res.stderr)).toMatchObject({
      status: 'error',
      resource: 'rules',
      action: 'set-header',
      error: {
        code: 'UNSUPPORTED_OPERATION',
        message: '--verify-live requires --runtime-default',
      },
    });
    await expect(fs.access(path.join(instanceDir, '.whistle'))).rejects.toThrow();
  });
});
