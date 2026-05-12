import { describe, expect, it } from 'vitest';
import { normalizeWhistleWebCapture } from '../../src/domain/captures-service';

describe('native capture normalization', () => {
  it('normalizes Whistle Web get-data sessions with request headers and backend', () => {
    const record = normalizeWhistleWebCapture(
      {
        id: 'n1',
        url: 'https://example.com/api/ok?x=1',
        req: { method: 'POST', headers: { host: 'example.com', 'x-env': 'staging' } },
        res: { statusCode: 201 },
        rules: { rule: { raw: 'example.com reqHeaders://x-env=staging' } },
      },
      'default',
    );

    expect(record.capture_id).toBe('n1');
    expect(record.backend).toBe('whistle-web');
    expect(record.host).toBe('example.com');
    expect(record.path).toBe('/api/ok?x=1');
    expect(record.method).toBe('POST');
    expect(record.status_code).toBe(201);
    expect(record.request_headers?.['x-env']).toBe('staging');
  });

  it('uses the session map key as a fallback capture id and normalizes websocket protocols', () => {
    const record = normalizeWhistleWebCapture(
      {
        id: '',
        url: 'wss://example.com/socket',
        req: { method: 'GET', headers: { Host: 'example.com' } },
        res: { statusCode: 101 },
      },
      'default',
      'session-key',
    );

    expect(record.capture_id).toBe('session-key');
    expect(record.protocol).toBe('websocket');
  });
});
