import { describe, expect, it } from 'vitest';
import { runCli } from './us1-bootstrap.fixtures';
import { makeTempDir } from './us2-rules.fixtures';
import { startFakeCaptureBackend } from './us3-captures.fixtures';

describe('header assertion commands', () => {
  it('captures assert-header succeeds when native request header matches', async () => {
    const stateDir = await makeTempDir('whistle-cli-header-assert-');
    const backend = await startFakeCaptureBackend();
    try {
      const res = await runCli(
        [
          '--instance',
          'dummy',
          'captures',
          'assert-header',
          '--host',
          'example.com',
          '--header',
          'x-env',
          '--equals',
          'staging',
          '--duration',
          '0s',
          '--format',
          'json',
        ],
        { env: { WHISTLE_CLI_STATE_DIR: stateDir, WHISTLE_CLI_RUNTIME_URL: backend.baseUrl } },
      );
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain('"classification":"OK"');
      expect(res.stdout).toContain('"ok":1');
    } finally {
      await backend.close();
    }
  });

  it('captures assert-header fails with overridden when header value differs', async () => {
    const stateDir = await makeTempDir('whistle-cli-header-assert-');
    const backend = await startFakeCaptureBackend();
    try {
      const res = await runCli(
        [
          '--instance',
          'dummy',
          'captures',
          'assert-header',
          '--host',
          'example.com',
          '--header',
          'x-env',
          '--equals',
          'prod',
          '--duration',
          '0s',
          '--format',
          'json',
        ],
        { env: { WHISTLE_CLI_STATE_DIR: stateDir, WHISTLE_CLI_RUNTIME_URL: backend.baseUrl } },
      );
      expect(res.exitCode).not.toBe(0);
      expect(res.stdout).toContain('"classification":"OVERRIDDEN"');
      expect(res.stdout).toContain('"actual":"x-env=staging"');
    } finally {
      await backend.close();
    }
  });
});
