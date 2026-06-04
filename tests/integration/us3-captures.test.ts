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

  it('captures get --backend whistle-web returns an exact capture by id', async () => {
    const stateDir = await makeTempDir('whistle-cli-us3-state-');
    const backend = await startFakeCaptureBackend({
      disableCaptureRuntimeRoutes: true,
      nativeCaptureData: {
        target_capture: {
          url: 'https://app.example.com/api/widgets?debug=1',
          req: {
            method: 'POST',
            headers: {
              host: 'app.example.com',
              cookie: 'session=abc',
              authorization: 'Bearer token',
              'x-request-id': 'req-123',
            },
          },
          res: { statusCode: 202 },
        },
      },
    });
    try {
      const res = await runCli(
        [
          '--instance',
          'dummy',
          'captures',
          'get',
          '--backend',
          'whistle-web',
          '--id',
          'target_capture',
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
      expect(envelope.data).toMatchObject({
        capture_id: 'target_capture',
        backend: 'whistle-web',
        method: 'POST',
        status_code: 202,
        path: '/api/widgets?debug=1',
      });
      expect(envelope.data.request_headers.cookie).toBe('session=abc');
      expect(envelope.data.request_headers.authorization).toBe('Bearer token');
    } finally {
      await backend.close();
    }
  });

  it('captures get --backend whistle-web reports not found when the id is absent', async () => {
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
          'get',
          '--backend',
          'whistle-web',
          '--id',
          'missing',
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
      expect(res.stderr).toContain('"code":"NO_CAPTURE_MATCH"');
    } finally {
      await backend.close();
    }
  });

  it('captures assert-request id can be retrieved with Whistle Web get', async () => {
    const stateDir = await makeTempDir('whistle-cli-us3-state-');
    const baseline = {
      old_api: {
        id: 'old_api',
        url: 'https://app.example.com/api/widgets',
        req: { method: 'GET', headers: { host: 'app.example.com' } },
        res: { statusCode: 200 },
      },
    };
    const next = {
      ...baseline,
      new_api: {
        id: 'new_api',
        url: 'https://app.example.com/api/widgets',
        req: {
          method: 'GET',
          headers: { host: 'app.example.com', cookie: 'session=new' },
        },
        res: { statusCode: 200 },
      },
    };
    const backend = await startFakeCaptureBackend({
      disableCaptureRuntimeRoutes: true,
      nativeCaptureSequence: [baseline, next, next],
    });
    try {
      const env = {
        WHISTLE_CLI_STATE_DIR: stateDir,
        WHISTLE_CLI_RUNTIME_URL: backend.baseUrl,
      };
      const asserted = await runCli(
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
          '/api/widgets',
          '--timeout',
          '1s',
          '--poll-interval',
          '50ms',
          '--format',
          'json',
        ],
        { env },
      );
      expect(asserted.exitCode).toBe(0);
      const captureId = JSON.parse(asserted.stdout).data.match.capture_id;
      expect(captureId).toBe('new_api');

      const got = await runCli(
        [
          '--instance',
          'dummy',
          'captures',
          'get',
          '--backend',
          'whistle-web',
          '--id',
          captureId,
          '--format',
          'json',
        ],
        { env },
      );
      expect(got.exitCode).toBe(0);
      expect(JSON.parse(got.stdout).data.request_headers.cookie).toBe('session=new');
    } finally {
      await backend.close();
    }
  });

  it('captures export --backend whistle-web returns filtered JSON captures and rejects HAR', async () => {
    const stateDir = await makeTempDir('whistle-cli-us3-state-');
    const backend = await startFakeCaptureBackend({
      disableCaptureRuntimeRoutes: true,
      nativeCaptureData: {
        wanted: {
          id: 'wanted',
          url: 'https://app.example.com/api/widgets',
          req: { method: 'GET', headers: { host: 'app.example.com', cookie: 'session=abc' } },
          res: { statusCode: 200 },
        },
        other: {
          id: 'other',
          url: 'https://app.example.com/telemetry',
          req: { method: 'POST', headers: { host: 'app.example.com' } },
          res: { statusCode: 204 },
        },
      },
    });
    try {
      const env = {
        WHISTLE_CLI_STATE_DIR: stateDir,
        WHISTLE_CLI_RUNTIME_URL: backend.baseUrl,
      };
      const json = await runCli(
        [
          '--instance',
          'dummy',
          'captures',
          'export',
          '--backend',
          'whistle-web',
          '--host',
          'app.example.com',
          '--path',
          '/api/',
          '--export-format',
          'json',
          '--format',
          'json',
        ],
        { env },
      );
      expect(json.exitCode).toBe(0);
      const envelope = JSON.parse(json.stdout);
      expect(envelope.data).toMatchObject({ backend: 'whistle-web', format: 'json', count: 1 });
      expect(envelope.data.items[0].capture_id).toBe('wanted');
      expect(envelope.data.items[0].request_headers.cookie).toBe('session=abc');

      const har = await runCli(
        [
          '--instance',
          'dummy',
          'captures',
          'export',
          '--backend',
          'whistle-web',
          '--export-format',
          'har',
          '--format',
          'json',
        ],
        { env },
      );
      expect(har.exitCode).not.toBe(0);
      expect(har.stderr).toContain('"code":"UNSUPPORTED_OPERATION"');
    } finally {
      await backend.close();
    }
  });

  it('captures get-header extracts one Whistle Web header case-insensitively', async () => {
    const stateDir = await makeTempDir('whistle-cli-us3-state-');
    const backend = await startFakeCaptureBackend({
      disableCaptureRuntimeRoutes: true,
      nativeCaptureData: {
        header_cap: {
          id: 'header_cap',
          url: 'https://app.example.com/api/widgets',
          req: {
            method: 'GET',
            headers: {
              host: 'app.example.com',
              cookie: 'session=abc',
              authorization: 'Bearer token',
            },
          },
          res: { statusCode: 200 },
        },
      },
    });
    try {
      const env = {
        WHISTLE_CLI_STATE_DIR: stateDir,
        WHISTLE_CLI_RUNTIME_URL: backend.baseUrl,
      };
      const res = await runCli(
        [
          '--instance',
          'dummy',
          'captures',
          'get-header',
          '--backend',
          'whistle-web',
          '--id',
          'header_cap',
          '--header',
          'Cookie',
          '--format',
          'json',
        ],
        { env },
      );
      expect(res.exitCode).toBe(0);
      const envelope = JSON.parse(res.stdout);
      expect(envelope.data).toEqual({
        capture_id: 'header_cap',
        backend: 'whistle-web',
        header: 'Cookie',
        value: 'session=abc',
      });
      expect(JSON.stringify(envelope)).not.toContain('Bearer token');

      const missing = await runCli(
        [
          '--instance',
          'dummy',
          'captures',
          'get-header',
          '--backend',
          'whistle-web',
          '--id',
          'header_cap',
          '--header',
          'x-missing',
          '--format',
          'json',
        ],
        { env },
      );
      expect(missing.exitCode).not.toBe(0);
      expect(missing.stderr).toContain('"code":"NO_CAPTURE_MATCH"');
    } finally {
      await backend.close();
    }
  });

  it('captures get-header Whistle Web not-found diagnostics include scan window details', async () => {
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
          'get-header',
          '--backend',
          'whistle-web',
          '--id',
          'missing',
          '--header',
          'cookie',
          '--limit',
          '25',
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
      const envelope = JSON.parse(res.stderr);
      expect(envelope.error.code).toBe('NO_CAPTURE_MATCH');
      expect(envelope.error.reason).toContain('capture_id=missing');
      expect(envelope.error.reason).toContain('limit=25');
      expect(envelope.error.reason).toContain('dump_count=125');
      expect(envelope.error.reason).toContain('scanned=0');
      expect(envelope.error.suggested_fix).toContain('--limit 200');
    } finally {
      await backend.close();
    }
  });

  it('captures get-header saves env output without leaking the value to stdout', async () => {
    const stateDir = await makeTempDir('whistle-cli-us3-state-');
    const backend = await startFakeCaptureBackend({
      disableCaptureRuntimeRoutes: true,
      nativeCaptureData: {
        header_cap: {
          id: 'header_cap',
          url: 'https://app.example.com/api/session',
          req: {
            method: 'GET',
            headers: {
              host: 'app.example.com',
              cookie: 'session=secret',
            },
          },
          res: { statusCode: 200 },
        },
      },
    });
    try {
      const envPath = path.join(stateDir, 'one.env');
      const rawPath = path.join(stateDir, 'one.txt');
      const jsonPath = path.join(stateDir, 'one.json');
      const res = await runCli(
        [
          '--instance',
          'dummy',
          'captures',
          'get-header',
          '--backend',
          'whistle-web',
          '--id',
          'header_cap',
          '--header',
          'cookie',
          '--save-env',
          envPath,
          '--env-key',
          '_devops_cookie',
          '--save-value',
          rawPath,
          '--save-json',
          jsonPath,
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
      expect(envelope.data).toMatchObject({
        capture_id: 'header_cap',
        backend: 'whistle-web',
        header: 'cookie',
        present: true,
        redacted: true,
        saved_to: [rawPath, envPath, jsonPath],
      });
      expect(JSON.stringify(envelope)).not.toContain('session=secret');
      await expect(fs.readFile(envPath, 'utf8')).resolves.toBe(
        '_devops_cookie="session=secret"\n',
      );
      await expect(fs.readFile(rawPath, 'utf8')).resolves.toBe('session=secret');
      await expect(fs.readFile(jsonPath, 'utf8')).resolves.toBe(
        `${JSON.stringify({ cookie: 'session=secret' }, null, 2)}\n`,
      );
    } finally {
      await backend.close();
    }
  });

  it('captures get-header keeps value output when no safe output option is used', async () => {
    const stateDir = await makeTempDir('whistle-cli-us3-state-');
    const backend = await startFakeCaptureBackend({
      disableCaptureRuntimeRoutes: true,
      nativeCaptureData: {
        header_cap: {
          id: 'header_cap',
          url: 'https://app.example.com/api/session',
          req: {
            method: 'GET',
            headers: {
              host: 'app.example.com',
              cookie: 'session=abc',
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
          'get-header',
          '--backend',
          'whistle-web',
          '--id',
          'header_cap',
          '--header',
          'cookie',
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
      expect(JSON.parse(res.stdout).data.value).toBe('session=abc');
    } finally {
      await backend.close();
    }
  });

  it('captures capture-headers ignores baseline captures by default and saves only a new match', async () => {
    const stateDir = await makeTempDir('whistle-cli-us3-state-');
    const baseline = {
      old_session: {
        id: 'old_session',
        url: 'https://app.example.com/api/session',
        req: {
          method: 'GET',
          headers: {
            host: 'app.example.com',
            cookie: 'session=old',
            'x-csrftoken': 'csrf-old',
          },
        },
        res: { statusCode: 200 },
      },
    };
    const next = {
      ...baseline,
      new_session: {
        id: 'new_session',
        url: 'https://app.example.com/api/session',
        req: {
          method: 'GET',
          headers: {
            host: 'app.example.com',
            cookie: 'session=new',
            'x-csrftoken': 'csrf-new',
          },
        },
        res: { statusCode: 200 },
      },
    };
    const backend = await startFakeCaptureBackend({
      disableCaptureRuntimeRoutes: true,
      nativeCaptureSequence: [baseline, next, next],
    });
    try {
      const envPath = path.join(stateDir, 'headers.env');
      const res = await runCli(
        [
          '--instance',
          'dummy',
          'captures',
          'capture-headers',
          '--backend',
          'whistle-web',
          '--host',
          'app.example.com',
          '--path',
          '/api/session',
          '--headers',
          'cookie,x-csrftoken',
          '--timeout',
          '1s',
          '--poll-interval',
          '50ms',
          '--save-env',
          envPath,
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
      expect(envelope.data.capture_id).toBe('new_session');
      expect(JSON.stringify(envelope)).not.toContain('session=new');
      expect(JSON.stringify(envelope)).not.toContain('csrf-new');
      const saved = await fs.readFile(envPath, 'utf8');
      expect(saved).toContain('COOKIE="session=new"');
      expect(saved).toContain('X_CSRFTOKEN="csrf-new"');
      expect(saved).not.toContain('session=old');
    } finally {
      await backend.close();
    }
  });

  it('captures capture-headers reports missing requested headers without writing partial files', async () => {
    const stateDir = await makeTempDir('whistle-cli-us3-state-');
    const backend = await startFakeCaptureBackend({
      disableCaptureRuntimeRoutes: true,
      nativeCaptureSequence: [
        {},
        {
          missing_header_cap: {
            id: 'missing_header_cap',
            url: 'https://app.example.com/api/session',
            req: {
              method: 'GET',
              headers: {
                host: 'app.example.com',
                cookie: 'session=abc',
              },
            },
            res: { statusCode: 200 },
          },
        },
      ],
    });
    try {
      const envPath = path.join(stateDir, 'headers.env');
      const res = await runCli(
        [
          '--instance',
          'dummy',
          'captures',
          'capture-headers',
          '--backend',
          'whistle-web',
          '--host',
          'app.example.com',
          '--path',
          '/api/session',
          '--headers',
          'cookie,x-csrftoken',
          '--timeout',
          '200ms',
          '--poll-interval',
          '50ms',
          '--save-env',
          envPath,
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
      const envelope = JSON.parse(res.stderr);
      expect(envelope.error.code).toBe('CAPTURE_HEADERS_MISSING');
      expect(envelope.error.reason).toContain('backend=whistle-web');
      expect(envelope.error.reason).toContain('limit=200');
      expect(envelope.error.reason).toContain('dump_count=1000');
      expect(envelope.error.reason).toContain('matched=');
      expect(envelope.error.suggested_fix).toContain('--limit 200');
      expect(res.stderr).toContain('x-csrftoken');
      await expect(fs.access(envPath)).rejects.toThrow();
    } finally {
      await backend.close();
    }
  });

  it('captures capture-headers can use existing captures and env-map overrides', async () => {
    const stateDir = await makeTempDir('whistle-cli-us3-state-');
    const backend = await startFakeCaptureBackend({
      disableCaptureRuntimeRoutes: true,
      nativeCaptureData: {
        existing_session: {
          id: 'existing_session',
          url: 'https://app.example.com/api/session',
          req: {
            method: 'GET',
            headers: {
              host: 'app.example.com',
              cookie: "session='quoted'",
              'x-signature-key': 'sig-value',
            },
          },
          res: { statusCode: 200 },
        },
      },
    });
    try {
      const envPath = path.join(stateDir, 'headers.env');
      const jsonPath = path.join(stateDir, 'headers.json');
      const res = await runCli(
        [
          '--instance',
          'dummy',
          'captures',
          'capture-headers',
          '--backend',
          'whistle-web',
          '--host',
          'app.example.com',
          '--path',
          '/api/session',
          '--headers',
          'cookie,x-signature-key',
          '--allow-existing',
          '--save-env',
          envPath,
          '--save-json',
          jsonPath,
          '--env-map',
          'cookie=DEVOPS_COOKIE',
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
      expect(envelope.data.capture_id).toBe('existing_session');
      expect(envelope.data.saved_to).toEqual([envPath, jsonPath]);
      expect(JSON.stringify(envelope)).not.toContain('sig-value');
      const envFile = await fs.readFile(envPath, 'utf8');
      expect(envFile).toContain('DEVOPS_COOKIE="session=\'quoted\'"');
      expect(envFile).toContain('X_SIGNATURE_KEY="sig-value"');
      const jsonFile = JSON.parse(await fs.readFile(jsonPath, 'utf8'));
      expect(jsonFile).toEqual({
        cookie: "session='quoted'",
        'x-signature-key': 'sig-value',
      });
    } finally {
      await backend.close();
    }
  });

  it('captures capture-headers rejects commands without a save target', async () => {
    const stateDir = await makeTempDir('whistle-cli-us3-state-');
    const backend = await startFakeCaptureBackend({ disableCaptureRuntimeRoutes: true });
    try {
      const res = await runCli(
        [
          '--instance',
          'dummy',
          'captures',
          'capture-headers',
          '--backend',
          'whistle-web',
          '--host',
          'example.com',
          '--headers',
          'cookie',
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
      expect(res.stderr).toContain('"code":"UNSUPPORTED_OPERATION"');
      expect(res.stderr).toContain('requires a save target');
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

  it('runtime-only capture tail rejects non-runtime backend values', async () => {
    const stateDir = await makeTempDir('whistle-cli-us3-state-');
    const backend = await startFakeCaptureBackend();
    try {
      for (const args of [['captures', 'tail', '--backend', 'whistle-web', '--format', 'ndjson']]) {
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
