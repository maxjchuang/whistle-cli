import { InstanceService } from './instance-service';
import { loadConfig } from '../shared/config';
import { RuntimeClient } from '../backends/runtime/runtime-client';
import { WhistleWebClient } from '../backends/whistle-web';
import { CliError } from '../output/errors';
import type {
  CaptureBackend,
  CaptureQuery,
  CaptureRecord,
  HeaderAssertionExample,
  HeaderAssertionOptions,
  HeaderAssertionResult,
} from './captures-model';

function normalizeLimit(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(String(n ?? ''));
  if (!Number.isFinite(v) || v <= 0) return 30;
  return Math.min(Math.max(Math.floor(v), 1), 200);
}

function parseProtocol(v: unknown): CaptureRecord['protocol'] {
  const s = String(v ?? '').toLowerCase();
  if (s === 'ws' || s === 'wss') return 'websocket';
  if (s === 'http' || s === 'https' || s === 'http2' || s === 'websocket' || s === 'tcp' || s === 'tunnel') return s;
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

function normalizeRuntimeCapture(raw: any, instanceId: string): CaptureRecord {
  const capture_id = String(raw.capture_id ?? raw.id ?? raw.sessionId ?? raw.reqId ?? '');
  const request_headers = normalizeRequestHeaders(raw.request_headers, raw.headers, raw.req?.headers);
  return {
    capture_id: capture_id || `cap_${Math.random().toString(16).slice(2)}`,
    instance_id: instanceId,
    backend: 'runtime',
    protocol: parseProtocol(raw.protocol ?? raw.proto ?? raw.type),
    method: raw.method ? String(raw.method) : undefined,
    url: raw.url ? String(raw.url) : undefined,
    host: raw.host ? String(raw.host) : request_headers?.host,
    path: raw.path ? String(raw.path) : undefined,
    status_code:
      typeof raw.status_code === 'number' ? raw.status_code : typeof raw.statusCode === 'number' ? raw.statusCode : undefined,
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
        suggested_fix: 'Use the default Whistle Web backend, or start a backend that supports the whistle-cli runtime API.',
      },
      e,
    );
  }
  throw e;
}

export function normalizeWhistleWebCapture(raw: any, instanceId: string, fallbackId?: string): CaptureRecord {
  const url = raw?.url ? String(raw.url) : undefined;
  let parsedUrl: URL | undefined;
  if (url) {
    try {
      parsedUrl = new URL(url);
    } catch {
      parsedUrl = undefined;
    }
  }

  const request_headers = normalizeRequestHeaders(raw?.req?.headers);

  const matchedRules: Record<string, unknown> = {};
  if (raw?.rules !== undefined) matchedRules.rules = raw.rules;
  if (raw?.rulesHeaders !== undefined) matchedRules.rulesHeaders = raw.rulesHeaders;

  return {
    capture_id: firstNonEmptyString(raw?.id, raw?.capture_id, raw?.reqId, fallbackId) ?? `cap_${Math.random().toString(16).slice(2)}`,
    instance_id: instanceId,
    backend: 'whistle-web',
    protocol: parsedUrl ? parseProtocol(parsedUrl.protocol.replace(/:$/, '')) : parseProtocolFromUrl(url),
    method: raw?.req?.method ? String(raw.req.method) : undefined,
    url,
    host: parsedUrl?.host ?? request_headers?.host,
    path: parsedUrl ? `${parsedUrl.pathname}${parsedUrl.search}` : undefined,
    status_code:
      typeof raw?.res?.statusCode === 'number'
        ? raw.res.statusCode
        : typeof raw?.res?.status_code === 'number'
          ? raw.res.status_code
          : typeof raw?.status_code === 'number'
            ? raw.status_code
            : typeof raw?.statusCode === 'number'
              ? raw.statusCode
              : undefined,
    request_headers,
    matched_rules: Object.keys(matchedRules).length ? matchedRules : undefined,
  };
}

function getHeaderValue(headers: Record<string, string> | undefined, header: string): string | undefined {
  if (!headers) return undefined;
  const key = header.toLowerCase();
  if (headers[key] != null) return headers[key];
  for (const [candidate, value] of Object.entries(headers)) {
    if (candidate.toLowerCase() === key) return value;
  }
  return undefined;
}

export function classifyHeaderRecord(record: CaptureRecord, header: string, expected: string): HeaderAssertionExample {
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

export function summarizeHeaderAssertion(records: CaptureRecord[], opts: HeaderAssertionOptions): HeaderAssertionResult {
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

  private buildFindResult(query: CaptureQuery, items: CaptureRecord[]): {
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

  private async findViaWhistleWeb(query: CaptureQuery, limit: number): Promise<ReturnType<CapturesService['buildFindResult']>> {
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
        if (filters.method && String(item.method ?? '').toLowerCase() !== filters.method.toLowerCase()) return false;
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

    const rawItems = Array.isArray((res as any).items) ? ((res as any).items as any[]) : [];
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
      if (remainingMs > 0) await new Promise((resolve) => setTimeout(resolve, Math.min(1000, remainingMs)));
    } while (Date.now() < deadline);

    const summary = summarizeHeaderAssertion([...seen.values()], opts);
    const knownBackend = knownCaptureBackend(query.backend);
    if (summary.no_traffic && knownBackend) return { ...summary, backend: knownBackend };
    return summary;
  }

  async get(instanceId: string, captureId: string): Promise<CaptureRecord> {
    try {
      const client = await this.runtimeClientForInstance(instanceId);
      const res = await client.getCapture(captureId);
      const item = (res as any).item ?? res;
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
          typeof item.status_code === 'number' ? item.status_code : typeof item.statusCode === 'number' ? item.statusCode : undefined,
      };
    } catch (e) {
      normalizeRuntimeBackendError(e);
    }
  }

  async export(query: CaptureQuery & { export_format?: 'har' | 'json' }): Promise<Record<string, unknown>> {
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
        const capture_id = String((r as any).capture_id ?? (r as any).id ?? (r as any).sessionId ?? (r as any).reqId ?? '');
        yield {
          capture_id: capture_id || `cap_${Math.random().toString(16).slice(2)}`,
          instance_id: query.instance_id,
          backend: 'runtime',
          protocol: parseProtocol((r as any).protocol ?? (r as any).proto ?? (r as any).type),
          method: (r as any).method ? String((r as any).method) : undefined,
          url: (r as any).url ? String((r as any).url) : undefined,
          host: (r as any).host ? String((r as any).host) : undefined,
          path: (r as any).path ? String((r as any).path) : undefined,
          status_code:
            typeof (r as any).status_code === 'number'
              ? (r as any).status_code
              : typeof (r as any).statusCode === 'number'
                ? (r as any).statusCode
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
