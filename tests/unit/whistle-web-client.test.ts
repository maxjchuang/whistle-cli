import http from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { WhistleWebClient } from '../../src/backends/whistle-web';

let server: http.Server | undefined;

async function startServer(handler: http.RequestListener): Promise<string> {
  server = http.createServer(handler);
  await new Promise<void>((resolve) => server!.listen(0, resolve));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('no port');
  return `http://127.0.0.1:${addr.port}`;
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  return await new Promise((resolve, reject) => {
    let out = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => (out += chunk));
    req.on('end', () => resolve(out));
    req.on('error', reject);
  });
}

afterEach(async () => {
  if (!server) return;
  await new Promise<void>((resolve, reject) => server!.close((err) => (err ? reject(err) : resolve())));
  server = undefined;
});

describe('WhistleWebClient', () => {
  it('reads runtime default rules from /cgi-bin/rules/list', async () => {
    const baseUrl = await startServer((req, res) => {
      expect(req.url).toBe('/cgi-bin/rules/list');
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ec: 0, defaultRules: 'example.com reqHeaders://x-test=1\n', defaultRulesIsDisabled: false }));
    });

    const client = new WhistleWebClient({ baseUrl });
    const result = await client.getRulesList();

    expect(result.defaultRules).toContain('x-test=1');
    expect(result.defaultRulesIsDisabled).toBe(false);
  });

  it('applies default rules with a form post to /cgi-bin/rules/add', async () => {
    const baseUrl = await startServer((req, res) => {
      void (async () => {
        try {
          expect(req.method).toBe('POST');
          expect(req.url).toBe('/cgi-bin/rules/add');
          expect(req.headers['content-type']).toContain('application/x-www-form-urlencoded');
          const body = await readBody(req);
          expect(body).toContain('name=Default');
          expect(decodeURIComponent(body)).toContain('example.com reqHeaders://x-test=1');
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ ec: 0 }));
        } catch (err) {
          res.statusCode = 500;
          res.end(err instanceof Error ? err.message : String(err));
        }
      })();
    });

    const client = new WhistleWebClient({ baseUrl });
    await expect(client.applyDefaultRules('example.com reqHeaders://x-test=1\n')).resolves.toEqual({ ec: 0 });
  });

  it('can apply default rules without selecting them', async () => {
    const baseUrl = await startServer((req, res) => {
      void (async () => {
        const body = await readBody(req);
        expect(body).toContain('selected=false');
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ ec: 0 }));
      })();
    });

    const client = new WhistleWebClient({ baseUrl });
    await expect(client.applyDefaultRules('example.com reqHeaders://x-test=1\n', { selected: false })).resolves.toEqual({ ec: 0 });
  });

  it('toggles default rules enabled state', async () => {
    const seen: string[] = [];
    const baseUrl = await startServer((req, res) => {
      seen.push(req.url ?? '');
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ec: 0 }));
    });

    const client = new WhistleWebClient({ baseUrl });
    await client.disableDefaultRules();
    await client.enableDefaultRules();

    expect(seen).toEqual(['/cgi-bin/rules/disable-default', '/cgi-bin/rules/enable-default']);
  });

  it('reads native capture data from /cgi-bin/get-data', async () => {
    const baseUrl = await startServer((req, res) => {
      expect(req.url).toBe('/cgi-bin/get-data?startTime=0&dumpCount=20');
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ec: 0, data: { data: { c1: { id: 'c1', url: 'https://example.com/a' } } } }));
    });

    const client = new WhistleWebClient({ baseUrl });
    const result = await client.getData({ startTime: 0, dumpCount: 20 });

    expect(result.data?.data?.c1?.url).toBe('https://example.com/a');
  });

  it('maps non-ok responses to WHISTLE_WEB_UNAVAILABLE', async () => {
    const baseUrl = await startServer((_req, res) => {
      res.statusCode = 500;
      res.end('broken');
    });

    const client = new WhistleWebClient({ baseUrl });
    await expect(client.getRulesList()).rejects.toMatchObject({
      details: { code: 'WHISTLE_WEB_UNAVAILABLE' },
    });
  });

  it('maps invalid JSON responses to WHISTLE_WEB_UNAVAILABLE', async () => {
    const baseUrl = await startServer((_req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end('{not json');
    });

    const client = new WhistleWebClient({ baseUrl });
    await expect(client.getRulesList()).rejects.toMatchObject({
      details: { code: 'WHISTLE_WEB_UNAVAILABLE' },
    });
  });

  it('maps Whistle logical error responses to WHISTLE_WEB_UNAVAILABLE', async () => {
    const baseUrl = await startServer((_req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ec: 1, em: 'rules add failed' }));
    });

    const client = new WhistleWebClient({ baseUrl });
    await expect(client.applyDefaultRules('example.com reqHeaders://x-test=1\n')).rejects.toMatchObject({
      details: {
        code: 'WHISTLE_WEB_UNAVAILABLE',
        message: 'Whistle Web API returned an error response',
        reason: 'rules add failed',
      },
    });
  });

  it('maps numeric string Whistle error responses to WHISTLE_WEB_UNAVAILABLE', async () => {
    const baseUrl = await startServer((_req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ec: '1', em: 'string error code' }));
    });

    const client = new WhistleWebClient({ baseUrl });
    await expect(client.getRulesList()).rejects.toMatchObject({
      details: {
        code: 'WHISTLE_WEB_UNAVAILABLE',
        reason: 'string error code',
      },
    });
  });
});
