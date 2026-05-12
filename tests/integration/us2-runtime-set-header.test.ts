import { describe, expect, it } from 'vitest';
import { runCli } from './us1-bootstrap.fixtures';
import { makeTempDir } from './us2-rules.fixtures';
import { startFakeCaptureBackend } from './us3-captures.fixtures';

describe('rule set-header runtime flow', () => {
  it('applies a header rule to runtime default rules and verifies live traffic', async () => {
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
    } finally {
      await backend.close();
    }
  });
});
