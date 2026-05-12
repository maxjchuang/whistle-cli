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
        ['--instance', 'dummy', 'captures', 'find', '--limit', '2', '--backend', 'runtime', '--format', 'json'],
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
        ['--instance', 'dummy', 'captures', 'find', '--keyword', 'none', '--backend', 'runtime', '--format', 'json'],
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

  it('captures find uses Whistle Web API by default when runtime routes are absent', async () => {
    const stateDir = await makeTempDir('whistle-cli-us3-state-');
    const backend = await startFakeCaptureBackend();
    try {
      const res = await runCli(['--instance', 'dummy', 'captures', 'find', '--host', 'example.com', '--format', 'json'], {
        env: {
          WHISTLE_CLI_STATE_DIR: stateDir,
          WHISTLE_CLI_RUNTIME_URL: backend.baseUrl,
        },
      });
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain('"backend":"whistle-web"');
      expect(res.stdout).toContain('"request_headers"');
      expect(res.stdout).toContain('"x-env":"staging"');
    } finally {
      await backend.close();
    }
  });

  it('captures get returns the requested capture id', async () => {
    const stateDir = await makeTempDir('whistle-cli-us3-state-');
    const backend = await startFakeCaptureBackend();
    try {
      const res = await runCli(['--instance', 'dummy', 'captures', 'get', '--id', 'cap_1', '--backend', 'runtime', '--format', 'json'], {
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
      const bad = await runCli(['--instance', 'dummy', 'captures', 'tail', '--backend', 'runtime', '--format', 'json'], {
        env: {
          WHISTLE_CLI_STATE_DIR: stateDir,
          WHISTLE_CLI_RUNTIME_URL: backend.baseUrl,
        },
      });
      expect(bad.exitCode).not.toBe(0);
      expect(bad.stderr).toContain('"resource":"captures"');
      expect(bad.stderr).toContain('"code":"UNSUPPORTED_OPERATION"');

      const ok = await runCli(['--instance', 'dummy', 'captures', 'tail', '--backend', 'runtime', '--format', 'ndjson'], {
        env: {
          WHISTLE_CLI_STATE_DIR: stateDir,
          WHISTLE_CLI_RUNTIME_URL: backend.baseUrl,
        },
      });
      expect(ok.exitCode).toBe(0);
      const lines = ok.stdout.trim().split('\n');
      expect(lines.length).toBe(3);
      const first = JSON.parse(lines[0] ?? '{}');
      const second = JSON.parse(lines[1] ?? '{}');
      const end = JSON.parse(lines[2] ?? '{}');
      expect(first.resource).toBe('captures');
      expect(first.action).toBe('tail');
      expect(first.event).toBe('capture');
      expect(second.event).toBe('capture');
      expect(end.event).toBe('end');
    } finally {
      await backend.close();
    }
  });

  it('captures export returns ok envelope', async () => {
    const stateDir = await makeTempDir('whistle-cli-us3-state-');
    const backend = await startFakeCaptureBackend();
    try {
      const res = await runCli(['--instance', 'dummy', 'captures', 'export', '--backend', 'runtime', '--format', 'json'], {
        env: {
          WHISTLE_CLI_STATE_DIR: stateDir,
          WHISTLE_CLI_RUNTIME_URL: backend.baseUrl,
        },
      });
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain('"resource":"captures"');
      expect(res.stdout).toContain('"action":"export"');
      expect(res.stdout).toContain('"exported":true');
    } finally {
      await backend.close();
    }
  });

  it('composer replay/compose return ok envelopes', async () => {
    const stateDir = await makeTempDir('whistle-cli-us3-state-');
    const backend = await startFakeCaptureBackend();
    try {
      const replay = await runCli(['--instance', 'dummy', 'composer', 'replay', '--capture-id', 'cap_1', '--apply', '--format', 'json'], {
        env: {
          WHISTLE_CLI_STATE_DIR: stateDir,
          WHISTLE_CLI_RUNTIME_URL: backend.baseUrl,
        },
      });
      expect(replay.exitCode).toBe(0);
      expect(replay.stdout).toContain('"resource":"composer"');
      expect(replay.stdout).toContain('"action":"replay"');
      expect(replay.stdout).toContain('"replayed":true');

      const compose = await runCli(
        ['--instance', 'dummy', 'composer', 'compose', '--method', 'POST', '--url', 'http://example.com/x', '--apply', '--format', 'json'],
        {
          env: {
            WHISTLE_CLI_STATE_DIR: stateDir,
            WHISTLE_CLI_RUNTIME_URL: backend.baseUrl,
          },
        },
      );
      expect(compose.exitCode).toBe(0);
      expect(compose.stdout).toContain('"resource":"composer"');
      expect(compose.stdout).toContain('"action":"compose"');
      expect(compose.stdout).toContain('"composed":true');
    } finally {
      await backend.close();
    }
  });

  it('frames list/send return ok envelopes', async () => {
    const stateDir = await makeTempDir('whistle-cli-us3-state-');
    const backend = await startFakeCaptureBackend();
    try {
      const list = await runCli(['--instance', 'dummy', 'frames', 'list', '--session-id', 's1', '--format', 'json'], {
        env: {
          WHISTLE_CLI_STATE_DIR: stateDir,
          WHISTLE_CLI_RUNTIME_URL: backend.baseUrl,
        },
      });
      expect(list.exitCode).toBe(0);
      expect(list.stdout).toContain('"resource":"frames"');
      expect(list.stdout).toContain('"action":"list"');
      expect(list.stdout).toContain('"count":2');

      const send = await runCli(['--instance', 'dummy', 'frames', 'send', '--session-id', 's1', '--data', 'ping', '--apply', '--format', 'json'], {
        env: {
          WHISTLE_CLI_STATE_DIR: stateDir,
          WHISTLE_CLI_RUNTIME_URL: backend.baseUrl,
        },
      });
      expect(send.exitCode).toBe(0);
      expect(send.stdout).toContain('"resource":"frames"');
      expect(send.stdout).toContain('"action":"send"');
      expect(send.stdout).toContain('"sent":true');
    } finally {
      await backend.close();
    }
  });

  it('capture shortcut find compiles to captures find behavior', async () => {
    const stateDir = await makeTempDir('whistle-cli-us3-state-');
    const backend = await startFakeCaptureBackend();
    try {
      const res = await runCli(['--instance', 'dummy', 'capture', 'find', '--limit', '2', '--backend', 'runtime', '--format', 'json'], {
        env: {
          WHISTLE_CLI_STATE_DIR: stateDir,
          WHISTLE_CLI_RUNTIME_URL: backend.baseUrl,
        },
      });
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain('"resource":"captures"');
      expect(res.stdout).toContain('"action":"find"');
      expect(res.stdout).toContain('"count":2');
    } finally {
      await backend.close();
    }
  });
});
