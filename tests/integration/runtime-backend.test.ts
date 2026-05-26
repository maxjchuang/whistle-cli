import { describe, expect, it } from 'vitest';
import http from 'node:http';
import { runCli } from './us1-bootstrap.fixtures';
import { makeTempDir } from './us2-rules.fixtures';
import { startFakeCaptureBackend } from './us3-captures.fixtures';
import { startRuntimeBackend } from '../../src/backends/runtime/runtime-server';

async function startUpstream(): Promise<{
  baseUrl: string;
  seen: Array<{ method: string; url: string; headers: http.IncomingHttpHeaders; body: string }>;
  close: () => Promise<void>;
}> {
  const seen: Array<{
    method: string;
    url: string;
    headers: http.IncomingHttpHeaders;
    body: string;
  }> = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      seen.push({
        method: req.method ?? 'GET',
        url: req.url ?? '/',
        headers: req.headers,
        body,
      });
      res.statusCode = 202;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ accepted: true, path: req.url ?? '/' }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('Failed to bind upstream');
  return {
    baseUrl: `http://127.0.0.1:${addr.port}`,
    seen,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}

describe('runtime backend server', () => {
  it('serves health and structured unsupported frame route errors', async () => {
    const whistle = await startFakeCaptureBackend({ disableCaptureRuntimeRoutes: true });
    const runtime = await startRuntimeBackend({
      targetBaseUrl: whistle.baseUrl,
      host: '127.0.0.1',
      port: 0,
    });
    try {
      const health = await fetch(`${runtime.baseUrl}/__whistle_cli__/health`);
      await expect(health.json()).resolves.toMatchObject({ ok: true });

      const frames = await fetch(`${runtime.baseUrl}/__whistle_cli__/frames/list?session_id=s1`);
      expect(frames.status).toBe(501);
      await expect(frames.json()).resolves.toMatchObject({
        error: {
          code: 'UNSUPPORTED_OPERATION',
        },
      });
    } finally {
      await runtime.close();
      await whistle.close();
    }
  });

  it('routes captures find through the served runtime backend', async () => {
    const stateDir = await makeTempDir('whistle-cli-runtime-backend-');
    const whistle = await startFakeCaptureBackend({ disableCaptureRuntimeRoutes: true });
    const runtime = await startRuntimeBackend({
      targetBaseUrl: whistle.baseUrl,
      host: '127.0.0.1',
      port: 0,
    });
    try {
      const res = await runCli(
        [
          '--instance',
          'dummy',
          'captures',
          'find',
          '--backend',
          'runtime',
          '--host',
          'example.com',
          '--format',
          'json',
        ],
        {
          env: {
            WHISTLE_CLI_STATE_DIR: stateDir,
            WHISTLE_CLI_RUNTIME_URL: runtime.baseUrl,
          },
        },
      );
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain('"backend":"runtime"');
      expect(res.stdout).toContain('"capture_id":"n1"');
      expect(res.stdout).toContain('"x-env":"staging"');
    } finally {
      await runtime.close();
      await whistle.close();
    }
  });

  it('supports capture get export and bounded tail routes', async () => {
    const stateDir = await makeTempDir('whistle-cli-runtime-backend-');
    const whistle = await startFakeCaptureBackend({ disableCaptureRuntimeRoutes: true });
    const runtime = await startRuntimeBackend({
      targetBaseUrl: whistle.baseUrl,
      host: '127.0.0.1',
      port: 0,
    });
    try {
      const env = {
        WHISTLE_CLI_STATE_DIR: stateDir,
        WHISTLE_CLI_RUNTIME_URL: runtime.baseUrl,
      };
      const get = await runCli(
        ['--instance', 'dummy', 'captures', 'get', '--id', 'n1', '--format', 'json'],
        { env },
      );
      expect(get.exitCode).toBe(0);
      expect(get.stdout).toContain('"capture_id":"n1"');

      const exp = await runCli(
        [
          '--instance',
          'dummy',
          'captures',
          'export',
          '--backend',
          'runtime',
          '--host',
          'example.com',
          '--format',
          'json',
        ],
        { env },
      );
      expect(exp.exitCode).toBe(0);
      expect(exp.stdout).toContain('"items"');
      expect(exp.stdout).toContain('"capture_id":"n1"');

      const tail = await runCli(
        [
          '--instance',
          'dummy',
          '--format',
          'ndjson',
          'captures',
          'tail',
          '--backend',
          'runtime',
          '--host',
          'example.com',
          '--limit',
          '1',
        ],
        { env },
      );
      expect(tail.exitCode).toBe(0);
      const lines = tail.stdout
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as { event?: string; data?: { capture_id?: string } });
      expect(lines[0]).toMatchObject({ event: 'capture', data: { capture_id: 'n1' } });
      expect(lines.at(-1)).toMatchObject({ event: 'end' });
    } finally {
      await runtime.close();
      await whistle.close();
    }
  });

  it('executes compose and replay requests through runtime backend', async () => {
    const stateDir = await makeTempDir('whistle-cli-runtime-backend-');
    const upstream = await startUpstream();
    const captureData = {
      n1: {
        id: 'n1',
        url: `${upstream.baseUrl}/replay-source`,
        req: {
          method: 'POST',
          headers: { host: new URL(upstream.baseUrl).host, 'x-env': 'staging' },
        },
        res: { statusCode: 200 },
      },
    };
    const whistle = await startFakeCaptureBackend({
      disableCaptureRuntimeRoutes: true,
      nativeCaptureData: captureData,
    });
    const runtime = await startRuntimeBackend({
      targetBaseUrl: whistle.baseUrl,
      host: '127.0.0.1',
      port: 0,
    });
    try {
      const env = {
        WHISTLE_CLI_STATE_DIR: stateDir,
        WHISTLE_CLI_RUNTIME_URL: runtime.baseUrl,
      };
      const compose = await runCli(
        [
          '--instance',
          'dummy',
          'composer',
          'compose',
          '--method',
          'POST',
          '--url',
          `${upstream.baseUrl}/compose`,
          '--header',
          'x-test=1',
          '--body',
          'hello',
          '--apply',
          '--format',
          'json',
        ],
        { env },
      );
      expect(compose.exitCode).toBe(0);
      expect(compose.stdout).toContain('"status":202');

      const replay = await runCli(
        [
          '--instance',
          'dummy',
          'composer',
          'replay',
          '--capture-id',
          'n1',
          '--url',
          `${upstream.baseUrl}/replay`,
          '--body',
          'again',
          '--apply',
          '--format',
          'json',
        ],
        { env },
      );
      expect(replay.exitCode).toBe(0);
      expect(replay.stdout).toContain('"status":202');
      expect(upstream.seen.map((item) => item.url)).toEqual(['/compose', '/replay']);
    } finally {
      await runtime.close();
      await whistle.close();
      await upstream.close();
    }
  });
});
