import { describe, expect, it } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
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

  it('proxy set produces action log and proxy rollback restores previous state (system mode)', async () => {
    const stateDir = await makeTempDir('whistle-cli-state-');
    const binDir = await makeTempDir('whistle-cli-bin-');

    const proxyStateFile = path.join(binDir, 'w2-proxy-state.txt');
    await fs.writeFile(proxyStateFile, '0', 'utf8');

    const w2Path = path.join(binDir, 'w2');
    await fs.writeFile(
      w2Path,
      `#!/usr/bin/env bash
set -euo pipefail

# Strip w2 instance flag: -D <baseDir>
if [[ $# -ge 2 && "$1" == "-D" ]]; then
  shift 2
fi

cmd=""
if [[ $# -ge 1 ]]; then
  cmd="$1"
  shift
fi

case "$cmd" in
  status)
    echo "running on port 8899"
    exit 0
    ;;
  proxy)
    if [[ $# -eq 0 ]]; then
      port="$(cat "$W2_PROXY_STATE_FILE")"
      if [[ "$port" == "0" ]]; then
        echo "Proxy: off"
      else
        echo "Proxy: 127.0.0.1:$port"
      fi
      exit 0
    fi
    port="$1"
    echo "$port" > "$W2_PROXY_STATE_FILE"
    echo "OK"
    exit 0
    ;;
  *)
    echo "unknown command: $cmd" >&2
    exit 1
    ;;
esac
`,
      { mode: 0o755 },
    );

    const env = {
      WHISTLE_CLI_STATE_DIR: stateDir,
      WHISTLE_CLI_PROXY_MODE: 'system',
      W2_PROXY_STATE_FILE: proxyStateFile,
      PATH: `${binDir}:${process.env.PATH}`,
    };

    const setRes = await runCli(['proxy', 'set', '--apply', '--format', 'json'], { env });
    expect(setRes.exitCode).toBe(0);
    const setEnvelope = JSON.parse(setRes.stdout);
    expect(setEnvelope.resource).toBe('proxy');
    expect(setEnvelope.action).toBe('set');
    const actionId = setEnvelope?.meta?.action_id;
    expect(typeof actionId).toBe('string');
    expect(actionId).toMatch(/^act_/);

    expect((await fs.readFile(proxyStateFile, 'utf8')).trim()).toBe('8899');

    const rollbackRes = await runCli(['proxy', 'set', '--rollback', actionId, '--format', 'json'], { env });
    expect(rollbackRes.exitCode).toBe(0);
    const rollbackEnvelope = JSON.parse(rollbackRes.stdout);
    expect(rollbackEnvelope.resource).toBe('proxy');
    expect(rollbackEnvelope.action).toBe('rollback');

    expect((await fs.readFile(proxyStateFile, 'utf8')).trim()).toBe('0');
  });
});
