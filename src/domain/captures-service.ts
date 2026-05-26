import { InstanceService } from './instance-service';
import { loadConfig } from '../shared/config';
import { RuntimeClient } from '../backends/runtime/runtime-client';
import { WhistleWebClient } from '../backends/whistle-web';
import { CliError } from '../output/errors';
import type {
  CaptureAssertRequestOptions,
  CaptureAssertRequestResult,
  CaptureBackend,
  CaptureQuery,
  CaptureRecord,
  CaptureSummary,
  CaptureSummaryOptions,
  HeaderAssertionExample,
  HeaderAssertionOptions,
  HeaderAssertionResult,
} from './captures-model';

const DEFAULT_SUMMARY_FIELDS = [
  'capture_id',
  'method',
  'status_code',
  'url',
  'host',
  'path',
  'x_tt_logid',
  'request_id',
  'env',
  'x_tt_env',
  'referer',
  'matched_rules_summary',
  'redacted_headers',
];

const SENSITIVE_HEADER_NAMES = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'proxy-authorization',
  'x-csrftoken',
  'x-csrf-token',
  'csrf-token',
]);

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' ? (value as UnknownRecord) : {};
}

function optionalRecord(value: unknown): UnknownRecord | undefined {
  return value && typeof value === 'object' ? (value as UnknownRecord) : undefined;
}

function prop(record: UnknownRecord, key: string): unknown {
  return record[key];
}

function nestedRecord(record: UnknownRecord, key: string): UnknownRecord {
  return asRecord(prop(record, key));
}

function normalizeLimit(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(String(n ?? ''));
  if (!Number.isFinite(v) || v <= 0) return 30;
  return Math.min(Math.max(Math.floor(v), 1), 200);
}

function parseProtocol(v: unknown): CaptureRecord['protocol'] {
  const s = String(v ?? '').toLowerCase();
  if (s === 'ws' || s === 'wss') return 'websocket';
  if (
    s === 'http' ||
    s === 'https' ||
    s === 'http2' ||
    s === 'websocket' ||
    s === 'tcp' ||
    s === 'tunnel'
  )
    return s;
  return 'unknown';
}

function parseProtocolFromUrl(url: string | undefined): CaptureRecord['protocol'] {
  if (!url) return 'unknown';
  try {
    const protocol = new URL(url).protocol.replace(/:$/, '');
    return parseProtocol(protocol);
  } catch {
    return 'unknown';
  }
}

function normalizeRequestHeaders(...candidates: unknown[]): Record<string, string> | undefined {
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue;
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(candidate)) {
      out[key.toLowerCase()] = Array.isArray(value) ? value.map(String).join(', ') : String(value);
    }
    if (Object.keys(out).length > 0) return out;
  }
  return undefined;
}

function normalizeRuntimeCapture(raw: unknown, instanceId: string): CaptureRecord {
  const r = asRecord(raw);
  const req = nestedRecord(r, 'req');
  const capture_id = String(
    prop(r, 'capture_id') ?? prop(r, 'id') ?? prop(r, 'sessionId') ?? prop(r, 'reqId') ?? '',
  );
  const request_headers = normalizeRequestHeaders(
    prop(r, 'request_headers'),
    prop(r, 'headers'),
    prop(req, 'headers'),
  );
  return {
    capture_id: capture_id || `cap_${Math.random().toString(16).slice(2)}`,
    instance_id: instanceId,
    backend: 'runtime',
    protocol: parseProtocol(prop(r, 'protocol') ?? prop(r, 'proto') ?? prop(r, 'type')),
    method: prop(r, 'method') ? String(prop(r, 'method')) : undefined,
    url: prop(r, 'url') ? String(prop(r, 'url')) : undefined,
    host: prop(r, 'host') ? String(prop(r, 'host')) : request_headers?.host,
    path: prop(r, 'path') ? String(prop(r, 'path')) : undefined,
    status_code:
      typeof prop(r, 'status_code') === 'number'
        ? (prop(r, 'status_code') as number)
        : typeof prop(r, 'statusCode') === 'number'
          ? (prop(r, 'statusCode') as number)
          : undefined,
    request_headers,
  };
}

function firstNonEmptyString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value !== 'string' && typeof value !== 'number') continue;
    const s = String(value);
    if (s) return s;
  }
  return undefined;
}

function normalizeRuntimeBackendError(e: unknown): never {
  if (e instanceof CliError && e.details.code === 'CAPTURE_BACKEND_UNAVAILABLE') {
    throw new CliError(
      {
        code: 'RUNTIME_BACKEND_UNAVAILABLE',
        message: 'Runtime capture backend is not available',
        reason: e.details.reason,
        suggested_fix:
          'Use the default Whistle Web backend, or start a backend that supports the whistle-cli runtime API.',
      },
      e,
    );
  }
  throw e;
}

export function normalizeWhistleWebCapture(
  raw: unknown,
  instanceId: string,
  fallbackId?: string,
): CaptureRecord {
  const r = asRecord(raw);
  const req = nestedRecord(r, 'req');
  const res = nestedRecord(r, 'res');
  const url = prop(r, 'url') ? String(prop(r, 'url')) : undefined;
  let parsedUrl: URL | undefined;
  if (url) {
    try {
      parsedUrl = new URL(url);
    } catch {
      parsedUrl = undefined;
    }
  }

  const request_headers = normalizeRequestHeaders(prop(req, 'headers'));

  const matchedRules: Record<string, unknown> = {};
  if (prop(r, 'rules') !== undefined) matchedRules.rules = prop(r, 'rules');
  if (prop(r, 'rulesHeaders') !== undefined) matchedRules.rulesHeaders = prop(r, 'rulesHeaders');

  return {
    capture_id:
      firstNonEmptyString(prop(r, 'id'), prop(r, 'capture_id'), prop(r, 'reqId'), fallbackId) ??
      `cap_${Math.random().toString(16).slice(2)}`,
    instance_id: instanceId,
    backend: 'whistle-web',
    protocol: parsedUrl
      ? parseProtocol(parsedUrl.protocol.replace(/:$/, ''))
      : parseProtocolFromUrl(url),
    method: prop(req, 'method') ? String(prop(req, 'method')) : undefined,
    url,
    host: parsedUrl?.host ?? request_headers?.host,
    path: parsedUrl ? `${parsedUrl.pathname}${parsedUrl.search}` : undefined,
    status_code:
      typeof prop(res, 'statusCode') === 'number'
        ? (prop(res, 'statusCode') as number)
        : typeof prop(res, 'status_code') === 'number'
          ? (prop(res, 'status_code') as number)
          : typeof prop(r, 'status_code') === 'number'
            ? (prop(r, 'status_code') as number)
            : typeof prop(r, 'statusCode') === 'number'
              ? (prop(r, 'statusCode') as number)
              : undefined,
    request_headers,
    matched_rules: Object.keys(matchedRules).length ? matchedRules : undefined,
  };
}

function getHeaderValue(
  headers: Record<string, string> | undefined,
  header: string,
): string | undefined {
  if (!headers) return undefined;
  const key = header.toLowerCase();
  if (headers[key] != null) return headers[key];
  for (const [candidate, value] of Object.entries(headers)) {
    if (candidate.toLowerCase() === key) return value;
  }
  return undefined;
}

function parseMatchedRulesSummary(matchedRules: unknown): string[] | undefined {
  const out: string[] = [];
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    if ('raw' in value && typeof (value as { raw?: unknown }).raw === 'string') {
      out.push((value as { raw: string }).raw);
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    for (const child of Object.values(value)) visit(child);
  };
  visit(matchedRules);
  return out.length ? [...new Set(out)] : undefined;
}

function redactedHeaderNames(headers: Record<string, string> | undefined): string[] | undefined {
  if (!headers) return undefined;
  const redacted = Object.keys(headers).filter((name) => {
    const normalized = name.toLowerCase();
    return (
      SENSITIVE_HEADER_NAMES.has(normalized) ||
      normalized.includes('token') ||
      normalized.includes('session')
    );
  });
  return redacted.length ? redacted.sort() : undefined;
}

function projectSummary(summary: CaptureSummary, fields?: string[]): CaptureSummary {
  const selected = fields?.length ? fields : DEFAULT_SUMMARY_FIELDS;
  const allowed = new Set(selected);
  const out: CaptureSummary = { capture_id: summary.capture_id };
  for (const [key, value] of Object.entries(summary) as Array<
    [keyof CaptureSummary, CaptureSummary[keyof CaptureSummary]]
  >) {
    if (value === undefined) continue;
    if (key === 'capture_id' || allowed.has(key)) {
      (out as unknown as Record<string, unknown>)[key] = value;
    }
  }
  return out;
}

export function classifyHeaderRecord(
  record: CaptureRecord,
  header: string,
  expected: string,
): HeaderAssertionExample {
  const actual = getHeaderValue(record.request_headers, header);
  const classification = actual === expected ? 'OK' : actual == null ? 'MISS' : 'OVERRIDDEN';
  return {
    capture_id: record.capture_id,
    url: record.url,
    method: record.method,
    status_code: record.status_code,
    expected: `${header}=${expected}`,
    actual: actual == null ? undefined : `${header}=${actual}`,
    classification,
  };
}

export function filterNewHeaderAssertionEvents(
  events: HeaderAssertionExample[],
  seenCaptureIds: Set<string>,
): HeaderAssertionExample[] {
  const out: HeaderAssertionExample[] = [];
  for (const event of events) {
    if (seenCaptureIds.has(event.capture_id)) continue;
    seenCaptureIds.add(event.capture_id);
    out.push(event);
  }
  return out;
}

function knownCaptureBackend(backend: CaptureQuery['backend']): CaptureBackend | undefined {
  return backend === 'runtime' || backend === 'whistle-web' ? backend : undefined;
}

export function summarizeHeaderAssertion(
  records: CaptureRecord[],
  opts: HeaderAssertionOptions,
): HeaderAssertionResult {
  if (records.length === 0) {
    return {
      backend: 'whistle-web',
      observed: 0,
      ok: 0,
      overridden: 0,
      miss: 0,
      no_traffic: true,
      classification: 'NO_TRAFFIC',
      events: [],
      examples: [],
    };
  }

  const events = records.map((r) => classifyHeaderRecord(r, opts.header, opts.equals));
  const ok = events.filter((e) => e.classification === 'OK').length;
  const overridden = events.filter((e) => e.classification === 'OVERRIDDEN').length;
  const miss = events.filter((e) => e.classification === 'MISS').length;

  return {
    backend: records[0]?.backend ?? 'whistle-web',
    observed: records.length,
    ok,
    overridden,
    miss,
    no_traffic: false,
    classification: overridden > 0 ? 'OVERRIDDEN' : miss > 0 ? 'MISS' : 'OK',
    events,
    examples: events.filter((e) => e.classification !== 'OK').slice(0, 5),
  };
}

export class CapturesService {
  private readonly instances: InstanceService;

  constructor(instances?: InstanceService) {
    this.instances = instances ?? new InstanceService();
  }

  private async runtimeClientForInstance(instanceId: string): Promise<RuntimeClient> {
    const cfg = loadConfig();
    if (cfg.runtimeUrl) {
      return new RuntimeClient({ baseUrl: cfg.runtimeUrl });
    }
    // Best-effort: derive from instance status (requires w2).
    const st = await this.instances.status(instanceId);
    const baseUrl = `http://${st.host}:${st.port}`;
    return new RuntimeClient({ baseUrl });
  }

  private async whistleWebClientForInstance(instanceId: string): Promise<WhistleWebClient> {
    const cfg = loadConfig();
    if (cfg.runtimeUrl) {
      return new WhistleWebClient({ baseUrl: cfg.runtimeUrl });
    }
    const st = await this.instances.status(instanceId);
    const baseUrl = `http://${st.host}:${st.port}`;
    return new WhistleWebClient({ baseUrl });
  }

  private buildFindResult(
    query: CaptureQuery,
    items: CaptureRecord[],
  ): {
    filters: CaptureQuery['filters'];
    count: number;
    items: CaptureRecord[];
    analysis?: {
      top_hosts: Array<{ host: string; count: number }>;
      status_codes: Array<{ status_code: number; count: number }>;
      protocols: Array<{ protocol: CaptureRecord['protocol']; count: number }>;
    };
  } {
    const hostCount = new Map<string, number>();
    const statusCount = new Map<number, number>();
    const protoCount = new Map<CaptureRecord['protocol'], number>();
    for (const it of items) {
      const host = it.host?.trim();
      if (host) hostCount.set(host, (hostCount.get(host) ?? 0) + 1);
      if (typeof it.status_code === 'number') {
        statusCount.set(it.status_code, (statusCount.get(it.status_code) ?? 0) + 1);
      }
      protoCount.set(it.protocol, (protoCount.get(it.protocol) ?? 0) + 1);
    }

    const analysis = {
      top_hosts: [...hostCount.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([host, count]) => ({ host, count })),
      status_codes: [...statusCount.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([status_code, count]) => ({ status_code, count })),
      protocols: [...protoCount.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([protocol, count]) => ({ protocol, count })),
    };

    return { filters: query.filters, count: items.length, items, analysis };
  }

  summarizeRecord(record: CaptureRecord, opts?: CaptureSummaryOptions): CaptureSummary {
    const headers = record.request_headers;
    const summary: CaptureSummary = {
      capture_id: record.capture_id,
      method: record.method,
      status_code: record.status_code,
      url: record.url,
      host: record.host,
      path: record.path,
      x_tt_logid: getHeaderValue(headers, 'x-tt-logid'),
      request_id: getHeaderValue(headers, 'x-request-id') ?? getHeaderValue(headers, 'request-id'),
      env: getHeaderValue(headers, 'env'),
      x_tt_env: getHeaderValue(headers, 'x-tt-env'),
      referer: getHeaderValue(headers, 'referer'),
      matched_rules_summary: parseMatchedRulesSummary(record.matched_rules),
      redacted_headers: redactedHeaderNames(headers),
    };
    return projectSummary(summary, opts?.fields);
  }

  summarizeRecords(records: CaptureRecord[], opts?: CaptureSummaryOptions): CaptureSummary[] {
    return records.map((record) => this.summarizeRecord(record, opts));
  }

  private async findViaWhistleWeb(
    query: CaptureQuery,
    limit: number,
  ): Promise<ReturnType<CapturesService['buildFindResult']>> {
    const client = await this.whistleWebClientForInstance(query.instance_id);
    const dumpCount = Math.min(Math.max(limit * 5, 100), 1000);
    const res = await client.getData({ startTime: 0, dumpCount });
    const rawItems = Object.entries(res.data?.data ?? {});
    const filters = query.filters;
    const items = rawItems
      .map(([id, r]) => normalizeWhistleWebCapture(r, query.instance_id, id))
      .filter((item) => {
        if (filters.host && item.host !== filters.host) return false;
        if (filters.path && !String(item.path ?? '').includes(filters.path)) return false;
        if (
          filters.method &&
          String(item.method ?? '').toLowerCase() !== filters.method.toLowerCase()
        )
          return false;
        if (typeof filters.status === 'number' && item.status_code !== filters.status) return false;
        if (filters.keyword && !JSON.stringify(item).includes(filters.keyword)) return false;
        return true;
      })
      .slice(0, limit);
    return this.buildFindResult(query, items);
  }

  async find(query: CaptureQuery): Promise<{
    filters: CaptureQuery['filters'];
    count: number;
    items: CaptureRecord[];
    analysis?: {
      top_hosts: Array<{ host: string; count: number }>;
      status_codes: Array<{ status_code: number; count: number }>;
      protocols: Array<{ protocol: CaptureRecord['protocol']; count: number }>;
    };
  }> {
    const limit = normalizeLimit(query.limit);
    const backend = query.backend ?? 'auto';
    if (backend !== 'auto' && backend !== 'whistle-web' && backend !== 'runtime') {
      throw new CliError({
        code: 'UNSUPPORTED_OPERATION',
        message: `Unsupported capture backend: ${backend}`,
        suggested_fix: 'Use one of: auto, whistle-web, runtime.',
      });
    }
    if (backend === 'auto' || backend === 'whistle-web') {
      return await this.findViaWhistleWeb(query, limit);
    }

    let res: { items?: unknown[] };
    try {
      const client = await this.runtimeClientForInstance(query.instance_id);
      res = await client.findCaptures({
        ...query.filters,
        limit,
      });
    } catch (e) {
      normalizeRuntimeBackendError(e);
    }

    const rawItems = Array.isArray(res.items) ? res.items : [];
    const items = rawItems.map((r) => normalizeRuntimeCapture(r, query.instance_id));
    return this.buildFindResult(query, items);
  }

  async assertHeader(
    query: CaptureQuery,
    opts: HeaderAssertionOptions & { durationMs?: number },
  ): Promise<HeaderAssertionResult> {
    const deadline = Date.now() + (opts.durationMs ?? 60_000);
    const seen = new Map<string, CaptureRecord>();

    do {
      const result = await this.find(query);
      for (const item of result.items) {
        seen.set(item.capture_id, item);
      }
      if (seen.size > 0 && Date.now() >= deadline) break;
      const remainingMs = deadline - Date.now();
      if (remainingMs > 0)
        await new Promise((resolve) => setTimeout(resolve, Math.min(1000, remainingMs)));
    } while (Date.now() < deadline);

    const summary = summarizeHeaderAssertion([...seen.values()], opts);
    const knownBackend = knownCaptureBackend(query.backend);
    if (summary.no_traffic && knownBackend) return { ...summary, backend: knownBackend };
    return summary;
  }

  async assertRequest(
    query: CaptureQuery,
    opts?: CaptureAssertRequestOptions,
  ): Promise<CaptureAssertRequestResult> {
    const timeoutMs = opts?.timeoutMs ?? 60_000;
    const pollIntervalMs = Math.max(100, opts?.pollIntervalMs ?? 1000);
    const deadline = Date.now() + timeoutMs;
    const baseline = new Set((await this.find(query)).items.map((item) => item.capture_id));
    const observed = new Map<string, CaptureRecord>();

    do {
      const result = await this.find(query);
      for (const item of result.items) {
        if (baseline.has(item.capture_id) || observed.has(item.capture_id)) continue;
        observed.set(item.capture_id, item);
        return {
          matched: true,
          classification: 'MATCHED',
          observed: observed.size,
          filters: query.filters,
          match: this.summarizeRecord(item, opts),
        };
      }
      const remainingMs = deadline - Date.now();
      if (remainingMs > 0)
        await new Promise((resolve) => setTimeout(resolve, Math.min(pollIntervalMs, remainingMs)));
    } while (Date.now() < deadline);

    return {
      matched: false,
      classification: 'TIMEOUT',
      observed: observed.size,
      filters: query.filters,
      next_actions: [
        'Trigger the target UI action again while the capture watch is active.',
        'Broaden the path or keyword filter only if the target endpoint is unknown.',
      ],
    };
  }

  async *watchRequestSummaries(
    query: CaptureQuery,
    opts?: CaptureAssertRequestOptions,
  ): AsyncGenerator<CaptureSummary, void, unknown> {
    const timeoutMs = opts?.timeoutMs ?? 60_000;
    const pollIntervalMs = Math.max(100, opts?.pollIntervalMs ?? 1000);
    const deadline = Date.now() + timeoutMs;
    const seen = new Set((await this.find(query)).items.map((item) => item.capture_id));

    do {
      const result = await this.find(query);
      for (const item of result.items) {
        if (seen.has(item.capture_id)) continue;
        seen.add(item.capture_id);
        yield this.summarizeRecord(item, opts);
      }
      const remainingMs = deadline - Date.now();
      if (remainingMs > 0)
        await new Promise((resolve) => setTimeout(resolve, Math.min(pollIntervalMs, remainingMs)));
    } while (Date.now() < deadline);
  }

  async get(instanceId: string, captureId: string): Promise<CaptureRecord> {
    try {
      const client = await this.runtimeClientForInstance(instanceId);
      const res = await client.getCapture(captureId);
      const responseRecord = asRecord(res);
      const item = optionalRecord(responseRecord.item) ?? responseRecord;
      return {
        capture_id: String(item.capture_id ?? item.id ?? captureId),
        instance_id: instanceId,
        backend: 'runtime',
        protocol: parseProtocol(item.protocol ?? item.proto ?? item.type),
        method: item.method ? String(item.method) : undefined,
        url: item.url ? String(item.url) : undefined,
        host: item.host ? String(item.host) : undefined,
        path: item.path ? String(item.path) : undefined,
        status_code:
          typeof item.status_code === 'number'
            ? item.status_code
            : typeof item.statusCode === 'number'
              ? item.statusCode
              : undefined,
      };
    } catch (e) {
      normalizeRuntimeBackendError(e);
    }
  }

  async export(
    query: CaptureQuery & { export_format?: 'har' | 'json' },
  ): Promise<Record<string, unknown>> {
    try {
      const client = await this.runtimeClientForInstance(query.instance_id);
      const limit = normalizeLimit(query.limit);
      const res = await client.exportCaptures({
        ...query.filters,
        limit,
        format: query.export_format,
      });
      return res as Record<string, unknown>;
    } catch (e) {
      normalizeRuntimeBackendError(e);
    }
  }

  async *tail(query: CaptureQuery): AsyncGenerator<CaptureRecord, void, unknown> {
    try {
      const client = await this.runtimeClientForInstance(query.instance_id);
      const limit = normalizeLimit(query.limit);
      let seen = 0;
      for await (const r of client.tailCaptures({ ...query.filters, limit })) {
        const item = asRecord(r);
        const capture_id = String(item.capture_id ?? item.id ?? item.sessionId ?? item.reqId ?? '');
        yield {
          capture_id: capture_id || `cap_${Math.random().toString(16).slice(2)}`,
          instance_id: query.instance_id,
          backend: 'runtime',
          protocol: parseProtocol(item.protocol ?? item.proto ?? item.type),
          method: item.method ? String(item.method) : undefined,
          url: item.url ? String(item.url) : undefined,
          host: item.host ? String(item.host) : undefined,
          path: item.path ? String(item.path) : undefined,
          status_code:
            typeof item.status_code === 'number'
              ? item.status_code
              : typeof item.statusCode === 'number'
                ? item.statusCode
                : undefined,
        };
        seen++;
        if (seen >= limit) break;
      }
    } catch (e) {
      normalizeRuntimeBackendError(e);
    }
  }
}
