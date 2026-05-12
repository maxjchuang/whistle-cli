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

      const rollback = await runCli(['--instance', 'dummy', 'rules', 'rollback', '--action-id', applied.data.action_id, '--format', 'json'], {
        env: {
          WHISTLE_CLI_STATE_DIR: stateDir,
          WHISTLE_CLI_RUNTIME_URL: backend.baseUrl,
        },
      });
      expect(rollback.exitCode).toBe(0);

      const afterRollback = await runCli(['--instance', 'dummy', 'rules', 'default', 'get', '--format', 'json'], {
        env: {
          WHISTLE_CLI_STATE_DIR: stateDir,
          WHISTLE_CLI_RUNTIME_URL: backend.baseUrl,
        },
      });
      expect(afterRollback.exitCode).toBe(0);
      const restored = JSON.parse(afterRollback.stdout);
      expect(restored.data.source_text).toBe('example.com reqHeaders://x-old=1\n');
      expect(restored.data.disabled).toBe(false);
    } finally {
      await backend.close();
    }
  });

  it('rules default apply fails when Whistle returns an add error', async () => {
    const stateDir = await makeTempDir('whistle-cli-us2-runtime-state-');
    const workDir = await makeTempDir('whistle-cli-us2-runtime-work-');
    const rulesPath = path.join(workDir, 'default-rules.txt');
    await fs.writeFile(rulesPath, 'example.com reqHeaders://x-new=2\n', 'utf8');
    const backend = await startFakeCaptureBackend({ failRulesAdd: true });
    try {
      const apply = await runCli(
        ['--instance', 'dummy', 'rules', 'default', 'apply', '--file', rulesPath, '--apply', '--format', 'json'],
        {
          env: {
            WHISTLE_CLI_STATE_DIR: stateDir,
            WHISTLE_CLI_RUNTIME_URL: backend.baseUrl,
          },
        },
      );

      expect(apply.exitCode).not.toBe(0);
      const err = JSON.parse(apply.stderr);
      expect(err).toMatchObject({
        status: 'error',
        resource: 'rules',
        action: 'default-apply',
        error: {
          code: 'WHISTLE_WEB_UNAVAILABLE',
          message: 'Whistle Web API returned an error response',
          reason: 'failed to add default rules',
        },
      });
    } finally {
      await backend.close();
    }
  });

  it('rules default apply fails verify and restores previous runtime default rules', async () => {
    const stateDir = await makeTempDir('whistle-cli-us2-runtime-state-');
    const workDir = await makeTempDir('whistle-cli-us2-runtime-work-');
    const rulesPath = path.join(workDir, 'default-rules.txt');
    await fs.writeFile(rulesPath, 'example.com reqHeaders://x-new=2\n', 'utf8');
    const backend = await startFakeCaptureBackend({ mismatchDefaultRulesOnAdd: true, initialDefaultRulesIsDisabled: true });
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

      expect(apply.exitCode).not.toBe(0);
      const err = JSON.parse(apply.stderr);
      expect(err).toMatchObject({
        status: 'error',
        resource: 'rules',
        action: 'default-apply',
        error: {
          code: 'RULE_RUNTIME_VERIFY_FAILED',
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
      expect(got.data.source_text).toBe('example.com reqHeaders://x-old=1\n');
      expect(got.data.disabled).toBe(true);
    } finally {
      await backend.close();
    }
  });

  it('rules default apply verify detects silent enabled state mismatch', async () => {
    const stateDir = await makeTempDir('whistle-cli-us2-runtime-state-');
    const workDir = await makeTempDir('whistle-cli-us2-runtime-work-');
    const rulesPath = path.join(workDir, 'default-rules.txt');
    await fs.writeFile(rulesPath, 'example.com reqHeaders://x-new=2\n', 'utf8');
    const backend = await startFakeCaptureBackend({ initialDefaultRulesIsDisabled: true, ignoreDefaultStateChange: true });
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

      expect(apply.exitCode).not.toBe(0);
      const err = JSON.parse(apply.stderr);
      expect(err).toMatchObject({
        status: 'error',
        resource: 'rules',
        action: 'default-apply',
        error: {
          code: 'RULE_RUNTIME_VERIFY_FAILED',
        },
      });
      expect(err.error.reason).toContain('defaultRulesIsDisabled=true');
      expect(err.error.reason).toContain('expected false');
    } finally {
      await backend.close();
    }
  });

  it('rules default apply verify surfaces restore failure details', async () => {
    const stateDir = await makeTempDir('whistle-cli-us2-runtime-state-');
    const workDir = await makeTempDir('whistle-cli-us2-runtime-work-');
    const rulesPath = path.join(workDir, 'default-rules.txt');
    await fs.writeFile(rulesPath, 'example.com reqHeaders://x-new=2\n', 'utf8');
    const backend = await startFakeCaptureBackend({ mismatchDefaultRulesOnAdd: true, failRestoreAfterMismatch: true });
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

      expect(apply.exitCode).not.toBe(0);
      const err = JSON.parse(apply.stderr);
      expect(err).toMatchObject({
        status: 'error',
        resource: 'rules',
        action: 'default-apply',
        error: {
          code: 'RULE_RUNTIME_VERIFY_FAILED',
        },
      });
      expect(err.error.reason).toContain('Restore failed');
      expect(err.error.reason).toContain('failed to restore default rules');
    } finally {
      await backend.close();
    }
  });

  it('rules default apply restores prior rules when enable fails after text write', async () => {
    const stateDir = await makeTempDir('whistle-cli-us2-runtime-state-');
    const workDir = await makeTempDir('whistle-cli-us2-runtime-work-');
    const rulesPath = path.join(workDir, 'default-rules.txt');
    await fs.writeFile(rulesPath, 'example.com reqHeaders://x-new=2\n', 'utf8');
    const backend = await startFakeCaptureBackend({
      initialDefaultRulesIsDisabled: true,
      failDefaultStateToggleAfterAdd: true,
    });
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

      expect(apply.exitCode).not.toBe(0);
      const err = JSON.parse(apply.stderr);
      expect(err).toMatchObject({
        status: 'error',
        resource: 'rules',
        action: 'default-apply',
        error: {
          code: 'WHISTLE_WEB_UNAVAILABLE',
          reason: 'failed to enable default rules',
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
      expect(got.data.source_text).toBe('example.com reqHeaders://x-old=1\n');
      expect(got.data.disabled).toBe(true);
    } finally {
      await backend.close();
    }
  });

  it('rules default rollback restores previous disabled state', async () => {
    const stateDir = await makeTempDir('whistle-cli-us2-runtime-state-');
    const workDir = await makeTempDir('whistle-cli-us2-runtime-work-');
    const rulesPath = path.join(workDir, 'default-rules.txt');
    const newRules = 'example.com reqHeaders://x-new=2\n';
    await fs.writeFile(rulesPath, newRules, 'utf8');
    const backend = await startFakeCaptureBackend({ initialDefaultRulesIsDisabled: true });
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

      const afterApply = await runCli(['--instance', 'dummy', 'rules', 'default', 'get', '--format', 'json'], {
        env: {
          WHISTLE_CLI_STATE_DIR: stateDir,
          WHISTLE_CLI_RUNTIME_URL: backend.baseUrl,
        },
      });
      expect(afterApply.exitCode).toBe(0);
      const active = JSON.parse(afterApply.stdout);
      expect(active.data.source_text).toBe(newRules);
      expect(active.data.disabled).toBe(false);

      const rollback = await runCli(['--instance', 'dummy', 'rules', 'rollback', '--action-id', applied.data.action_id, '--format', 'json'], {
        env: {
          WHISTLE_CLI_STATE_DIR: stateDir,
          WHISTLE_CLI_RUNTIME_URL: backend.baseUrl,
        },
      });
      expect(rollback.exitCode).toBe(0);

      const afterRollback = await runCli(['--instance', 'dummy', 'rules', 'default', 'get', '--format', 'json'], {
        env: {
          WHISTLE_CLI_STATE_DIR: stateDir,
          WHISTLE_CLI_RUNTIME_URL: backend.baseUrl,
        },
      });
      expect(afterRollback.exitCode).toBe(0);
      const restored = JSON.parse(afterRollback.stdout);
      expect(restored.data.source_text).toBe('example.com reqHeaders://x-old=1\n');
      expect(restored.data.disabled).toBe(true);
    } finally {
      await backend.close();
    }
  });

  it('rules default apply preview does not mutate runtime default rules', async () => {
    const stateDir = await makeTempDir('whistle-cli-us2-runtime-state-');
    const workDir = await makeTempDir('whistle-cli-us2-runtime-work-');
    const rulesPath = path.join(workDir, 'default-rules.txt');
    await fs.writeFile(rulesPath, 'example.com reqHeaders://x-preview=3\n', 'utf8');
    const backend = await startFakeCaptureBackend();
    try {
      const preview = await runCli(
        ['--instance', 'dummy', 'rules', 'default', 'apply', '--file', rulesPath, '--preview', '--format', 'json'],
        {
          env: {
            WHISTLE_CLI_STATE_DIR: stateDir,
            WHISTLE_CLI_RUNTIME_URL: backend.baseUrl,
          },
        },
      );
      expect(preview.exitCode).toBe(0);
      const previewOut = JSON.parse(preview.stdout);
      expect(previewOut).toMatchObject({
        status: 'ok',
        resource: 'rules',
        action: 'default-apply',
        effective: false,
        data: {
          preview: {
            backend: 'whistle-web',
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
      expect(got.data.source_text).toBe('example.com reqHeaders://x-old=1\n');
    } finally {
      await backend.close();
    }
  });
});
