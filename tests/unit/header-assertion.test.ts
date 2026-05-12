import { describe, expect, it } from 'vitest';
import { CapturesService, classifyHeaderRecord, filterNewHeaderAssertionEvents, summarizeHeaderAssertion } from '../../src/domain/captures-service';
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
  it('classifies individual records as ok, overridden, and miss', () => {
    expect(classifyHeaderRecord(rec({ 'x-env': 'staging' }), 'x-env', 'staging').classification).toBe('OK');
    expect(classifyHeaderRecord(rec({ 'x-env': 'other' }), 'x-env', 'staging').classification).toBe('OVERRIDDEN');
    expect(classifyHeaderRecord(rec({}), 'x-env', 'staging').classification).toBe('MISS');
  });

  it('classifies request headers case-insensitively', () => {
    expect(classifyHeaderRecord(rec({ 'X-Env': 'staging' }), 'x-env', 'staging').classification).toBe('OK');
  });

  it('summarizes ok traffic', () => {
    const summary = summarizeHeaderAssertion([rec({ 'x-env': 'staging' })], { header: 'x-env', equals: 'staging' });

    expect(summary.classification).toBe('OK');
    expect(summary.ok).toBe(1);
    expect(summary.overridden).toBe(0);
    expect(summary.miss).toBe(0);
  });

  it('summarizes overridden traffic when any header value differs', () => {
    const summary = summarizeHeaderAssertion([rec({ 'x-env': 'staging' }), rec({ 'x-env': 'prod' }), rec({})], {
      header: 'x-env',
      equals: 'staging',
    });

    expect(summary.classification).toBe('OVERRIDDEN');
    expect(summary.ok).toBe(1);
    expect(summary.overridden).toBe(1);
    expect(summary.miss).toBe(1);
  });

  it('summarizes missing header traffic as miss when no value was overridden', () => {
    const summary = summarizeHeaderAssertion([rec({}), rec({ 'x-other': 'staging' })], { header: 'x-env', equals: 'staging' });

    expect(summary.classification).toBe('MISS');
    expect(summary.ok).toBe(0);
    expect(summary.overridden).toBe(0);
    expect(summary.miss).toBe(2);
  });

  it('summarizes no traffic', () => {
    const summary = summarizeHeaderAssertion([], { header: 'x-env', equals: 'staging' });

    expect(summary.classification).toBe('NO_TRAFFIC');
    expect(summary.no_traffic).toBe(true);
  });

  it('keeps known backend on no traffic assertion summaries', async () => {
    const service = new CapturesService();
    (service as any).find = async () => ({ filters: {}, count: 0, items: [] });

    const summary = await service.assertHeader(
      { instance_id: 'default', backend: 'runtime', filters: { host: 'example.com' }, limit: 200 },
      { header: 'x-env', equals: 'staging', durationMs: 0 },
    );

    expect(summary.classification).toBe('NO_TRAFFIC');
    expect(summary.backend).toBe('runtime');
  });

  it('filters duplicate header assertion events across watch iterations', () => {
    const seen = new Set<string>();
    const first = filterNewHeaderAssertionEvents(
      [
        {
          capture_id: 'c1',
          expected: 'x-env=staging',
          actual: 'x-env=staging',
          classification: 'OK',
        },
      ],
      seen,
    );
    const second = filterNewHeaderAssertionEvents(
      [
        {
          capture_id: 'c1',
          expected: 'x-env=staging',
          actual: 'x-env=staging',
          classification: 'OK',
        },
      ],
      seen,
    );

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);
  });
});
