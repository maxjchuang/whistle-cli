import http from 'node:http';

export interface FakeCaptureBackend {
  baseUrl: string;
  close: () => Promise<void>;
}

export interface FakeCaptureBackendOptions {
  failRulesAdd?: boolean;
  mismatchDefaultRulesOnAdd?: boolean;
  initialDefaultRulesIsDisabled?: boolean;
}

export async function startFakeCaptureBackend(opts?: FakeCaptureBackendOptions): Promise<FakeCaptureBackend> {
  let defaultRules = 'example.com reqHeaders://x-old=1\n';
  let defaultRulesIsDisabled = Boolean(opts?.initialDefaultRulesIsDisabled);
  let mismatchWritesRemaining = opts?.mismatchDefaultRulesOnAdd ? 1 : 0;

  async function readBody(req: http.IncomingMessage): Promise<string> {
    return await new Promise((resolve, reject) => {
      let buf = '';
      req.setEncoding('utf8');
      req.on('data', (chunk) => {
        buf += chunk;
      });
      req.on('end', () => resolve(buf));
      req.on('error', reject);
    });
  }

  async function readJson(req: http.IncomingMessage): Promise<any> {
    return await new Promise((resolve, reject) => {
      let buf = '';
      req.setEncoding('utf8');
      req.on('data', (chunk) => {
        buf += chunk;
      });
      req.on('end', () => {
        if (!buf.trim()) return resolve({});
        try {
          resolve(JSON.parse(buf));
        } catch (e) {
          reject(e);
        }
      });
      req.on('error', reject);
    });
  }

  const server = http.createServer((req, res) => {
    const u = new URL(req.url ?? '/', 'http://localhost');
    res.setHeader('content-type', 'application/json; charset=utf-8');

    if (u.pathname === '/cgi-bin/rules/list') {
      res.statusCode = 200;
      res.end(JSON.stringify({ ec: 0, defaultRules, defaultRulesIsDisabled, list: [] }));
      return;
    }

    if (u.pathname === '/cgi-bin/rules/enable-default') {
      defaultRulesIsDisabled = false;
      res.statusCode = 200;
      res.end(JSON.stringify({ ec: 0 }));
      return;
    }

    if (u.pathname === '/cgi-bin/rules/disable-default') {
      defaultRulesIsDisabled = true;
      res.statusCode = 200;
      res.end(JSON.stringify({ ec: 0 }));
      return;
    }

    if (u.pathname === '/cgi-bin/rules/add' && req.method === 'POST') {
      void readBody(req)
        .then((body) => {
          const params = new URLSearchParams(body);
          if (opts?.failRulesAdd) {
            res.statusCode = 200;
            res.end(JSON.stringify({ ec: 1, em: 'failed to add default rules' }));
            return;
          }
          if (params.get('name') === 'Default') {
            const value = params.get('value') ?? '';
            defaultRules = mismatchWritesRemaining > 0 ? `${value}# rewritten by backend\n` : value;
            mismatchWritesRemaining = Math.max(0, mismatchWritesRemaining - 1);
            defaultRulesIsDisabled = params.get('selected') === 'false';
          }
          res.statusCode = 200;
          res.end(JSON.stringify({ ec: 0 }));
        })
        .catch(() => {
          res.statusCode = 400;
          res.end(JSON.stringify({ ec: 1, error: 'bad_form' }));
        });
      return;
    }

    if (u.pathname === '/__whistle_cli__/captures/find') {
      const keyword = u.searchParams.get('keyword') ?? '';
      const host = u.searchParams.get('host') ?? '';
      const method = u.searchParams.get('method') ?? '';

      // Deterministic behavior for tests.
      if (keyword === 'none' || host === 'nope.local') {
        res.statusCode = 200;
        res.end(JSON.stringify({ items: [] }));
        return;
      }

      const items = [
        {
          id: 'cap_1',
          protocol: 'http',
          method: method || 'GET',
          url: 'http://example.com/api/hello',
          host: host || 'example.com',
          path: '/api/hello',
          statusCode: 200,
        },
        {
          id: 'cap_2',
          protocol: 'https',
          method: method || 'POST',
          url: 'https://example.com/api/world',
          host: host || 'example.com',
          path: '/api/world',
          statusCode: 201,
        },
      ];

      res.statusCode = 200;
      res.end(JSON.stringify({ items }));
      return;
    }

    if (u.pathname === '/__whistle_cli__/captures/export') {
      res.statusCode = 200;
      res.end(JSON.stringify({ exported: true, file_path: '/tmp/captures.json' }));
      return;
    }

    if (u.pathname === '/__whistle_cli__/captures/tail') {
      res.statusCode = 200;
      res.setHeader('content-type', 'application/x-ndjson; charset=utf-8');
      const items = [
        { id: 'cap_tail_1', protocol: 'http', method: 'GET', url: 'http://example.com/a', host: 'example.com', path: '/a', statusCode: 200 },
        { id: 'cap_tail_2', protocol: 'https', method: 'POST', url: 'https://example.com/b', host: 'example.com', path: '/b', statusCode: 500 },
      ];
      for (const it of items) {
        res.write(`${JSON.stringify(it)}\n`);
      }
      res.end();
      return;
    }

    if (u.pathname === '/__whistle_cli__/composer/replay' && req.method === 'POST') {
      void readJson(req)
        .then((body) => {
          res.statusCode = 200;
          res.end(
            JSON.stringify({
              replayed: true,
              capture_id: body.capture_id ?? null,
              applied_overrides: body,
              result: { status_code: 200 },
            }),
          );
        })
        .catch(() => {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'bad_json' }));
        });
      return;
    }

    if (u.pathname === '/__whistle_cli__/composer/compose' && req.method === 'POST') {
      void readJson(req)
        .then((body) => {
          res.statusCode = 200;
          res.end(JSON.stringify({ composed: true, request: body, result: { status_code: 201 } }));
        })
        .catch(() => {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'bad_json' }));
        });
      return;
    }

    if (u.pathname === '/__whistle_cli__/frames/list') {
      const sessionId = u.searchParams.get('session_id') ?? 'unknown';
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          items: [
            { id: 'f1', session_id: sessionId, direction: 'to_server', data: 'hello', ts: 't1' },
            { id: 'f2', session_id: sessionId, direction: 'to_client', data: 'world', ts: 't2' },
          ],
        }),
      );
      return;
    }

    if (u.pathname === '/__whistle_cli__/frames/send' && req.method === 'POST') {
      void readJson(req)
        .then((body) => {
          res.statusCode = 200;
          res.end(JSON.stringify({ sent: true, echo: body }));
        })
        .catch(() => {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'bad_json' }));
        });
      return;
    }

    if (u.pathname === '/__whistle_cli__/captures/get') {
      const id = u.searchParams.get('id') ?? 'unknown';
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          item: {
            id,
            protocol: 'http',
            method: 'GET',
            url: `http://example.com/echo/${id}`,
            host: 'example.com',
            path: `/echo/${id}`,
            statusCode: 200,
          },
        }),
      );
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'not_found' }));
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr = server.address();
  if (!addr || typeof addr === 'string') {
    throw new Error('Failed to bind fake backend server');
  }

  const baseUrl = `http://127.0.0.1:${addr.port}`;
  return {
    baseUrl,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}
