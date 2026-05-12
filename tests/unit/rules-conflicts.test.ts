import { describe, expect, it } from 'vitest';
import { diagnoseHeaderConflictsFromText } from '../../src/domain/rules-service';

describe('rule header conflict diagnosis', () => {
  it('finds multiple matching reqHeaders rules for the same header', () => {
    const text = [
      '/^https:\\/\\/example\\.com\\// reqHeaders://x-env=wide',
      '/\\/api\\/widgets\\/[^/]+\\/trigger/ reqHeaders://x-env=specific',
      'other.example.com reqHeaders://x-env=other',
    ].join('\n');

    const result = diagnoseHeaderConflictsFromText(text, {
      header: 'x-env',
      url: 'https://example.com/api/widgets/123/trigger',
    });

    expect(result.conflict).toBe(true);
    expect(result.matches.length).toBe(2);
    expect(result.matches.map((m) => m.value)).toEqual(['wide', 'specific']);
  });

  it('does not flag duplicate assignments from a single matching rule as a conflict', () => {
    const result = diagnoseHeaderConflictsFromText('example.com reqHeaders://x-env=a&x-env=b', {
      header: 'x-env',
      url: 'https://example.com/api/widgets/123/trigger',
    });

    expect(result.conflict).toBe(false);
    expect(result.matches.length).toBe(2);
    expect(result.matches.map((m) => m.value)).toEqual(['a', 'b']);
  });

  it('does not match host/path patterns across unrelated host boundaries', () => {
    const result = diagnoseHeaderConflictsFromText('example.com/api reqHeaders://x-env=bad', {
      header: 'x-env',
      url: 'https://badexample.com/api/foo',
    });

    expect(result.conflict).toBe(false);
    expect(result.matches).toEqual([]);
  });

  it('matches header names case-insensitively', () => {
    const result = diagnoseHeaderConflictsFromText('example.com reqHeaders://X-Env=staging', {
      header: 'x-env',
      url: 'https://example.com/api/widgets/123/trigger',
    });

    expect(result.conflict).toBe(false);
    expect(result.matches.map((m) => m.value)).toEqual(['staging']);
  });
});
