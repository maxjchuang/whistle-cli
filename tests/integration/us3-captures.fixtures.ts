import http from 'node:http';

export interface FakeCaptureBackend {
  baseUrl: string;
  close: () => Promise<void>;
}

export async function startFakeCaptureBackend(): Promise<FakeCaptureBackend> {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url ?? '/', 'http://localhost');
    res.setHeader('content-type', 'application/json; charset=utf-8');

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

