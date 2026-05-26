import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { runCli } from './us1-bootstrap.fixtures';
import { makeTempDir } from './us2-rules.fixtures';
import { startFakeCaptureBackend } from './us3-captures.fixtures';

describe('US3 captures (integration)', () => {
  it('captures find returns ok envelope (including empty results)', async () => {
    const stateDir = await makeTempDir('whistle-cli-us3-state-');
    const backend = await startFakeCaptureBackend();
    try {
      const ok = await runCli(
        [
          '--instance',
          'dummy',
          'captures',
          'find',
          '--limit',
          '2',
          '--backend',
          'runtime',
          '--format',
          'json',
        ],
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
        [
          '--instance',
          'dummy',
          'captures',
          'find',
          '--keyword',
          'none',
          '--backend',
          'runtime',
          '--format',
          'json',
        ],
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
    const backend = await startFakeCaptureBackend({ disableCaptureRuntimeRoutes: true });
    try {
      const res = await runCli(
        ['--instance', 'dummy', 'captures', 'find', '--host', 'example.com', '--format', 'json'],
        {
          env: {
            WHISTLE_CLI_STATE_DIR: stateDir,
            WHISTLE_CLI_RUNTIME_URL: backend.baseUrl,
          },
        },
      );
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain('"backend":"whistle-web"');
      expect(res.stdout).toContain('"request_headers"');
      expect(res.stdout).toContain('"x-env":"staging"');
    } finally {
      await backend.close();
    }
  });

  it('captures assert-request returns only a newly observed Whistle Web match', async () => {
    const stateDir = await makeTempDir('whistle-cli-us3-state-');
    const oldMatch = {
      old_skill: {
        id: 'old_skill',
        url: 'https://app.example.com/space/api/workspace/chatbot/bot1/skills',
        req: {
          method: 'GET',
          headers: {
            host: 'app.example.com',
            cookie: 'secret=old',
            'x-tt-logid': 'old-logid',
            'request-id': 'old-request-id',
            env: 'pre_release',
          },
        },
        res: { statusCode: 200 },
      },
    };
    const newMatch = {
      ...oldMatch,
      new_skill: {
        id: 'new_skill',
        url: 'https://app.example.com/space/api/workspace/chatbot/bot1/skills',
        req: {
          method: 'GET',
          headers: {
            host: 'app.example.com',
            cookie: 'secret=new',
            authorization: 'Bearer secret',
            'x-tt-logid': 'new-logid',
            'request-id': 'new-request-id',
            env: 'pre_release',
          },
        },
        res: { statusCode: 200 },
        rules: {
          reqHeaders: {
            raw: '/^https?:\\/\\/[^/]+\\.example\\.com\\// reqHeaders://env=pre_release',
          },
        },
      },
    };
    const backend = await startFakeCaptureBackend({
      disableCaptureRuntimeRoutes: true,
      nativeCaptureSequence: [oldMatch, oldMatch, newMatch],
    });
    try {
      const savePath = path.join(stateDir, 'matched-summary.json');
      const res = await runCli(
        [
          '--instance',
          'dummy',
          'captures',
          'assert-request',
          '--backend',
          'whistle-web',
          '--host',
          'app.example.com',
          '--path',
          '/skills',
          '--timeout',
          '3s',
          '--poll-interval',
          '100ms',
          '--save',
          savePath,
          '--format',
          'json',
        ],
        {
          env: {
            WHISTLE_CLI_STATE_DIR: stateDir,
            WHISTLE_CLI_RUNTIME_URL: backend.baseUrl,
          },
        },
      );
      expect(res.exitCode).toBe(0);
      const envelope = JSON.parse(res.stdout);
      expect(envelope.action).toBe('assert-request');
      expect(envelope.data.matched).toBe(true);
      expect(envelope.data.match.capture_id).toBe('new_skill');
      expect(envelope.data.match.x_tt_logid).toBe('new-logid');
      expect(envelope.data.match.request_id).toBe('new-request-id');
      expect(JSON.stringify(envelope)).not.toContain('secret=new');
      expect(envelope.data.match.redacted_headers).toContain('authorization');
      expect(envelope.data.match.redacted_headers).toContain('cookie');
      expect(envelope.data.saved_to).toBe(savePath);
      const saved = JSON.parse(await fs.readFile(savePath, 'utf8'));
      expect(saved.capture_id).toBe('new_skill');
      expect(JSON.stringify(saved)).not.toContain('Bearer secret');
    } finally {
      await backend.close();
    }
  });

  it('captures assert-request returns warning timeout with next actions', async () => {
    const stateDir = await makeTempDir('whistle-cli-us3-state-');
    const backend = await startFakeCaptureBackend({
      disableCaptureRuntimeRoutes: true,
      nativeCaptureData: {},
    });
    try {
      const res = await runCli(
        [
          '--instance',
          'dummy',
          'captures',
          'assert-request',
          '--backend',
          'whistle-web',
          '--host',
          'app.example.com',
          '--path',
          '/skills',
          '--timeout',
          '100ms',
          '--poll-interval',
          '50ms',
          '--format',
          'json',
        ],
        {
          env: {
            WHISTLE_CLI_STATE_DIR: stateDir,
            WHISTLE_CLI_RUNTIME_URL: backend.baseUrl,
          },
        },
      );
      expect(res.exitCode).not.toBe(0);
      const envelope = JSON.parse(res.stdout);
      expect(envelope.status).toBe('warning');
      expect(envelope.data.classification).toBe('TIMEOUT');
      expect(envelope.next_actions.length).toBeGreaterThan(0);
    } finally {
      await backend.close();
    }
  });

  it('captures watch streams newly observed Whistle Web summaries', async () => {
    const stateDir = await makeTempDir('whistle-cli-us3-state-');
    const backend = await startFakeCaptureBackend({
      disableCaptureRuntimeRoutes: true,
      nativeCaptureSequence: [
        {},
        {
          cap_watch: {
            id: 'cap_watch',
            url: 'https://app.example.com/space/api/workspace/chatbot/bot1/skills',
            req: {
              method: 'GET',
              headers: {
                host: 'app.example.com',
                cookie: 'secret',
                'x-tt-logid': 'watch-logid',
              },
            },
            res: { statusCode: 200 },
          },
        },
      ],
    });
    try {
      const res = await runCli(
        [
          '--instance',
          'dummy',
          'captures',
          'watch',
          '--backend',
          'whistle-web',
          '--host',
          'app.example.com',
          '--path',
          '/skills',
          '--timeout',
          '300ms',
          '--poll-interval',
          '50ms',
          '--fields',
          'capture_id,x_tt_logid,redacted_headers',
          '--format',
          'ndjson',
        ],
        {
          env: {
            WHISTLE_CLI_STATE_DIR: stateDir,
            WHISTLE_CLI_RUNTIME_URL: backend.baseUrl,
          },
        },
      );
      expect(res.exitCode).toBe(0);
      const lines = res.stdout
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      expect(lines[0].event).toBe('capture');
      expect(lines[0].data.capture_id).toBe('cap_watch');
      expect(lines[0].data.x_tt_logid).toBe('watch-logid');
      expect(lines[0].data.redacted_headers).toEqual(['cookie']);
      expect(JSON.stringify(lines)).not.toContain('secret');
      expect(lines.at(-1).event).toBe('end');
    } finally {
      await backend.close();
    }
  });

  it('captures find --fields returns projected redacted summaries', async () => {
    const stateDir = await makeTempDir('whistle-cli-us3-state-');
    const backend = await startFakeCaptureBackend({
      disableCaptureRuntimeRoutes: true,
      nativeCaptureData: {
        cap: {
          id: 'cap',
          url: 'https://app.example.com/space/api/workspace/chatbot/bot1/skills',
          req: {
            method: 'GET',
            headers: {
              host: 'app.example.com',
              cookie: 'secret',
              'x-tt-logid': 'logid',
              'request-id': 'request-id',
              env: 'pre_release',
            },
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
          'captures',
          'find',
          '--backend',
          'whistle-web',
          '--host',
          'app.example.com',
          '--fields',
          'capture_id,x_tt_logid,request_id,redacted_headers',
          '--format',
          'json',
        ],
        {
          env: {
            WHISTLE_CLI_STATE_DIR: stateDir,
            WHISTLE_CLI_RUNTIME_URL: backend.baseUrl,
          },
        },
      );
      expect(res.exitCode).toBe(0);
      const envelope = JSON.parse(res.stdout);
      expect(envelope.data.items[0]).toEqual({
        capture_id: 'cap',
        x_tt_logid: 'logid',
        request_id: 'request-id',
        redacted_headers: ['cookie'],
      });
      expect(JSON.stringify(envelope)).not.toContain('secret');
    } finally {
      await backend.close();
    }
  });

  it('captures find filters after reading a larger native session window', async () => {
    const stateDir = await makeTempDir('whistle-cli-us3-state-');
    const backend = await startFakeCaptureBackend({
      nativeCaptureData: {
        other: {
          id: 'other',
          url: 'https://other.example/api/nope',
          req: { method: 'GET', headers: { host: 'other.example' } },
          res: { statusCode: 200 },
        },
        native_key_only: {
          url: 'https://example.com/api/late',
          req: { method: 'GET', headers: { host: 'example.com' } },
          res: { statusCode: 200 },
        },
      },
    });
    try {
      const res = await runCli(
        [
          '--instance',
          'dummy',
          'captures',
          'find',
          '--host',
          'example.com',
          '--limit',
          '1',
          '--format',
          'json',
        ],
        {
          env: {
            WHISTLE_CLI_STATE_DIR: stateDir,
            WHISTLE_CLI_RUNTIME_URL: backend.baseUrl,
          },
        },
      );
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain('"count":1');
      expect(res.stdout).toContain('"capture_id":"native_key_only"');
    } finally {
      await backend.close();
    }
  });

  it('captures find --backend runtime fails when runtime routes are absent', async () => {
    const stateDir = await makeTempDir('whistle-cli-us3-state-');
    const backend = await startFakeCaptureBackend({ disableCaptureRuntimeRoutes: true });
    try {
      const res = await runCli(
        ['--instance', 'dummy', 'captures', 'find', '--backend', 'runtime', '--format', 'json'],
        {
          env: {
            WHISTLE_CLI_STATE_DIR: stateDir,
            WHISTLE_CLI_RUNTIME_URL: backend.baseUrl,
          },
        },
      );
      expect(res.exitCode).not.toBe(0);
      expect(res.stderr).toContain('"code":"RUNTIME_BACKEND_UNAVAILABLE"');
    } finally {
      await backend.close();
    }
  });

  it('runtime-only capture commands report runtime backend unavailable when runtime routes are absent', async () => {
    const stateDir = await makeTempDir('whistle-cli-us3-state-');
    const backend = await startFakeCaptureBackend({ disableCaptureRuntimeRoutes: true });
    try {
      for (const args of [
        ['captures', 'get', '--id', 'cap_1', '--backend', 'runtime', '--format', 'json'],
        ['captures', 'export', '--backend', 'runtime', '--format', 'json'],
        ['captures', 'tail', '--backend', 'runtime', '--format', 'ndjson'],
      ]) {
        const res = await runCli(['--instance', 'dummy', ...args], {
          env: {
            WHISTLE_CLI_STATE_DIR: stateDir,
            WHISTLE_CLI_RUNTIME_URL: backend.baseUrl,
          },
        });
        expect(res.exitCode).not.toBe(0);
        expect(res.stderr).toContain('"code":"RUNTIME_BACKEND_UNAVAILABLE"');
      }
    } finally {
      await backend.close();
    }
  });

  it('captures find rejects invalid backend values', async () => {
    const stateDir = await makeTempDir('whistle-cli-us3-state-');
    const backend = await startFakeCaptureBackend();
    try {
      const res = await runCli(
        ['--instance', 'dummy', 'captures', 'find', '--backend', 'bad', '--format', 'json'],
        {
          env: {
            WHISTLE_CLI_STATE_DIR: stateDir,
            WHISTLE_CLI_RUNTIME_URL: backend.baseUrl,
          },
        },
      );
      expect(res.exitCode).not.toBe(0);
      expect(res.stderr).toContain('"code":"UNSUPPORTED_OPERATION"');
    } finally {
      await backend.close();
    }
  });

  it('runtime-only capture commands reject non-runtime backend values', async () => {
    const stateDir = await makeTempDir('whistle-cli-us3-state-');
    const backend = await startFakeCaptureBackend();
    try {
      for (const args of [
        ['captures', 'get', '--id', 'cap_1', '--backend', 'whistle-web', '--format', 'json'],
        ['captures', 'export', '--backend', 'whistle-web', '--format', 'json'],
        ['captures', 'tail', '--backend', 'whistle-web', '--format', 'ndjson'],
      ]) {
        const res = await runCli(['--instance', 'dummy', ...args], {
          env: {
            WHISTLE_CLI_STATE_DIR: stateDir,
            WHISTLE_CLI_RUNTIME_URL: backend.baseUrl,
          },
        });
        expect(res.exitCode).not.toBe(0);
        expect(res.stderr).toContain('"code":"UNSUPPORTED_OPERATION"');
      }
    } finally {
      await backend.close();
    }
  });

  it('captures get returns the requested capture id', async () => {
    const stateDir = await makeTempDir('whistle-cli-us3-state-');
    const backend = await startFakeCaptureBackend();
    try {
      const res = await runCli(
        [
          '--instance',
          'dummy',
          'captures',
          'get',
          '--id',
          'cap_1',
          '--backend',
          'runtime',
          '--format',
          'json',
        ],
        {
          env: {
            WHISTLE_CLI_STATE_DIR: stateDir,
            WHISTLE_CLI_RUNTIME_URL: backend.baseUrl,
          },
        },
      );
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
      const bad = await runCli(
        ['--instance', 'dummy', 'captures', 'tail', '--backend', 'runtime', '--format', 'json'],
        {
          env: {
            WHISTLE_CLI_STATE_DIR: stateDir,
            WHISTLE_CLI_RUNTIME_URL: backend.baseUrl,
          },
        },
      );
      expect(bad.exitCode).not.toBe(0);
      expect(bad.stderr).toContain('"resource":"captures"');
      expect(bad.stderr).toContain('"code":"UNSUPPORTED_OPERATION"');

      const ok = await runCli(
        ['--instance', 'dummy', 'captures', 'tail', '--backend', 'runtime', '--format', 'ndjson'],
        {
          env: {
            WHISTLE_CLI_STATE_DIR: stateDir,
            WHISTLE_CLI_RUNTIME_URL: backend.baseUrl,
          },
        },
      );
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
      const res = await runCli(
        ['--instance', 'dummy', 'captures', 'export', '--backend', 'runtime', '--format', 'json'],
        {
          env: {
            WHISTLE_CLI_STATE_DIR: stateDir,
            WHISTLE_CLI_RUNTIME_URL: backend.baseUrl,
          },
        },
      );
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
      const replay = await runCli(
        [
          '--instance',
          'dummy',
          'composer',
          'replay',
          '--capture-id',
          'cap_1',
          '--apply',
          '--format',
          'json',
        ],
        {
          env: {
            WHISTLE_CLI_STATE_DIR: stateDir,
            WHISTLE_CLI_RUNTIME_URL: backend.baseUrl,
          },
        },
      );
      expect(replay.exitCode).toBe(0);
      expect(replay.stdout).toContain('"resource":"composer"');
      expect(replay.stdout).toContain('"action":"replay"');
      expect(replay.stdout).toContain('"replayed":true');

      const compose = await runCli(
        [
          '--instance',
          'dummy',
          'composer',
          'compose',
          '--method',
          'POST',
          '--url',
          'http://example.com/x',
          '--apply',
          '--format',
          'json',
        ],
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
      const list = await runCli(
        ['--instance', 'dummy', 'frames', 'list', '--session-id', 's1', '--format', 'json'],
        {
          env: {
            WHISTLE_CLI_STATE_DIR: stateDir,
            WHISTLE_CLI_RUNTIME_URL: backend.baseUrl,
          },
        },
      );
      expect(list.exitCode).toBe(0);
      expect(list.stdout).toContain('"resource":"frames"');
      expect(list.stdout).toContain('"action":"list"');
      expect(list.stdout).toContain('"count":2');

      const send = await runCli(
        [
          '--instance',
          'dummy',
          'frames',
          'send',
          '--session-id',
          's1',
          '--data',
          'ping',
          '--apply',
          '--format',
          'json',
        ],
        {
          env: {
            WHISTLE_CLI_STATE_DIR: stateDir,
            WHISTLE_CLI_RUNTIME_URL: backend.baseUrl,
          },
        },
      );
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
      const res = await runCli(
        [
          '--instance',
          'dummy',
          'capture',
          'find',
          '--limit',
          '2',
          '--backend',
          'runtime',
          '--format',
          'json',
        ],
        {
          env: {
            WHISTLE_CLI_STATE_DIR: stateDir,
            WHISTLE_CLI_RUNTIME_URL: backend.baseUrl,
          },
        },
      );
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain('"resource":"captures"');
      expect(res.stdout).toContain('"action":"find"');
      expect(res.stdout).toContain('"count":2');
    } finally {
      await backend.close();
    }
  });
});
