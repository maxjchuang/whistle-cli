import { describe, expect, it } from 'vitest';
import { runCli } from './us1-bootstrap.fixtures';
import { makeTempDir } from './us2-rules.fixtures';
import { startFakeCaptureBackend } from './us3-captures.fixtures';

describe('US3 captures (integration)', () => {
  it('captures find returns ok envelope (including empty results)', async () => {
    const stateDir = await makeTempDir('whistle-cli-us3-state-');
    const backend = await startFakeCaptureBackend();
    try {
      const ok = await runCli(
        ['--instance', 'dummy', 'captures', 'find', '--limit', '2', '--format', 'json'],
        {
          env: {
            WHISTLE_CLI_STATE_DIR: stateDir,
            WHISTLE_CLI_RUNTIME_URL: backend.baseUrl,
          },
        },
      );
      expect(ok.exitCode).toBe(0);
      expect(ok.stdout).toContain('"resource":"captures"');
      expect(ok.stdout).toContain('"action":"find"');
      expect(ok.stdout).toContain('"count":2');

      const empty = await runCli(
        ['--instance', 'dummy', 'captures', 'find', '--keyword', 'none', '--format', 'json'],
        {
          env: {
            WHISTLE_CLI_STATE_DIR: stateDir,
            WHISTLE_CLI_RUNTIME_URL: backend.baseUrl,
          },
        },
      );
      expect(empty.exitCode).toBe(0);
      expect(empty.stdout).toContain('"count":0');
    } finally {
      await backend.close();
    }
  });

  it('captures get returns the requested capture id', async () => {
    const stateDir = await makeTempDir('whistle-cli-us3-state-');
    const backend = await startFakeCaptureBackend();
    try {
      const res = await runCli(['--instance', 'dummy', 'captures', 'get', '--id', 'cap_1', '--format', 'json'], {
        env: {
          WHISTLE_CLI_STATE_DIR: stateDir,
          WHISTLE_CLI_RUNTIME_URL: backend.baseUrl,
        },
      });
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain('"resource":"captures"');
      expect(res.stdout).toContain('"action":"get"');
      expect(res.stdout).toContain('"capture_id":"cap_1"');
    } finally {
      await backend.close();
    }
  });

  it('captures tail enforces ndjson and emits an end event', async () => {
    const stateDir = await makeTempDir('whistle-cli-us3-state-');
    const backend = await startFakeCaptureBackend();
    try {
      const bad = await runCli(['--instance', 'dummy', 'captures', 'tail', '--format', 'json'], {
        env: {
          WHISTLE_CLI_STATE_DIR: stateDir,
          WHISTLE_CLI_RUNTIME_URL: backend.baseUrl,
        },
      });
      expect(bad.exitCode).not.toBe(0);
      expect(bad.stderr).toContain('"resource":"captures"');
      expect(bad.stderr).toContain('"code":"UNSUPPORTED_OPERATION"');

      const ok = await runCli(['--instance', 'dummy', 'captures', 'tail', '--format', 'ndjson'], {
        env: {
          WHISTLE_CLI_STATE_DIR: stateDir,
          WHISTLE_CLI_RUNTIME_URL: backend.baseUrl,
        },
      });
      expect(ok.exitCode).toBe(0);
      const lines = ok.stdout.trim().split('\n');
      expect(lines.length).toBe(1);
      const obj = JSON.parse(lines[0] ?? '{}');
      expect(obj.resource).toBe('captures');
      expect(obj.action).toBe('tail');
      expect(obj.event).toBe('end');
    } finally {
      await backend.close();
    }
  });
});

