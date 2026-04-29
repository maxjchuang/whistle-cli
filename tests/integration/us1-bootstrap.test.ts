import { describe, expect, it } from 'vitest';
import { makeTempDir, runCli } from './us1-bootstrap.fixtures';

describe('US1 bootstrap (integration)', () => {
  it('instance status returns UNSUPPORTED_OPERATION when w2 missing', async () => {
    const stateDir = await makeTempDir('whistle-cli-state-');
    const res = await runCli(['instance', 'status', '--format', 'json'], {
      env: {
        WHISTLE_CLI_STATE_DIR: stateDir,
        PATH: '/nonexistent',
      },
    });
    expect(res.exitCode).not.toBe(0);
    expect(res.stderr).toContain('"code":"UNSUPPORTED_OPERATION"');
    expect(res.stderr).toContain('"resource":"instance"');
  });

  it('certs status works without w2 (falls back to default host/port probe)', async () => {
    const stateDir = await makeTempDir('whistle-cli-state-');
    const res = await runCli(['certs', 'status', '--format', 'json'], {
      env: {
        WHISTLE_CLI_STATE_DIR: stateDir,
        PATH: '/nonexistent',
      },
    });
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain('"resource":"certs"');
    expect(res.stdout).toContain('"action":"status"');
  });

  it('bootstrap prepare fails with USER_ACTION_REQUIRED in non-interactive mode', async () => {
    const stateDir = await makeTempDir('whistle-cli-state-');
    const appDataDir = await makeTempDir('whistle-cli-whistledata-');

    // We do not force PATH missing here; this test is about non-interactive behavior.
    // When w2 is missing, it will also fail, which is acceptable.
    const res = await runCli(['bootstrap', 'prepare', '--format', 'json', '--non-interactive'], {
      env: {
        WHISTLE_CLI_STATE_DIR: stateDir,
        WHISTLE_APPDATA_DIR: appDataDir,
      },
    });
    expect(res.exitCode).not.toBe(0);
    expect(res.stderr).toMatch(/"code":"USER_ACTION_REQUIRED"|"code":"UNSUPPORTED_OPERATION"/);
  });
});

