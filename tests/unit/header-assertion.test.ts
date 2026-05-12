import { describe, expect, it } from 'vitest';
import { classifyHeaderRecord, summarizeHeaderAssertion } from '../../src/domain/captures-service';
import type { CaptureRecord } from '../../src/domain/captures-model';

function rec(headers?: Record<string, string>): CaptureRecord {
  return {
    capture_id: Math.random().toString(16),
    instance_id: 'default',
    protocol: 'https',
    backend: 'whistle-web',
    url: 'https://example.com/api',
    host: 'example.com',
    path: '/api',
    request_headers: headers,
  };
}

describe('header assertion classification', () => {
  it('classifies ok, overridden, miss, and no traffic', () => {
    expect(classifyHeaderRecord(rec({ 'x-env': 'staging' }), 'x-env', 'staging').classification).toBe('OK');
    expect(classifyHeaderRecord(rec({ 'x-env': 'other' }), 'x-env', 'staging').classification).toBe('OVERRIDDEN');
    expect(classifyHeaderRecord(rec({}), 'x-env', 'staging').classification).toBe('MISS');

    const summary = summarizeHeaderAssertion([], { header: 'x-env', equals: 'staging' });
    expect(summary.classification).toBe('NO_TRAFFIC');
    expect(summary.no_traffic).toBe(true);
  });
});
