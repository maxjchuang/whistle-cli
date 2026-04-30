import { InstanceService } from './instance-service';
import { loadConfig } from '../shared/config';
import { RuntimeClient } from '../backends/runtime/runtime-client';
import type { CaptureQuery, CaptureRecord } from './captures-model';

function normalizeLimit(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(String(n ?? ''));
  if (!Number.isFinite(v) || v <= 0) return 30;
  return Math.min(Math.max(Math.floor(v), 1), 200);
}

function parseProtocol(v: unknown): CaptureRecord['protocol'] {
  const s = String(v ?? '').toLowerCase();
  if (s === 'http' || s === 'https' || s === 'http2' || s === 'websocket' || s === 'tcp' || s === 'tunnel') return s;
  return 'unknown';
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
    const client = await this.runtimeClientForInstance(query.instance_id);
    const limit = normalizeLimit(query.limit);
    const res = await client.findCaptures({
      ...query.filters,
      limit,
    });

    const rawItems = Array.isArray((res as any).items) ? ((res as any).items as any[]) : [];
    const items: CaptureRecord[] = rawItems.map((r) => {
      const capture_id = String(r.capture_id ?? r.id ?? r.sessionId ?? r.reqId ?? '');
      return {
        capture_id: capture_id || `cap_${Math.random().toString(16).slice(2)}`,
        instance_id: query.instance_id,
        protocol: parseProtocol(r.protocol ?? r.proto ?? r.type),
        method: r.method ? String(r.method) : undefined,
        url: r.url ? String(r.url) : undefined,
        host: r.host ? String(r.host) : undefined,
        path: r.path ? String(r.path) : undefined,
        status_code: typeof r.status_code === 'number' ? r.status_code : typeof r.statusCode === 'number' ? r.statusCode : undefined,
      };
    });

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

  async get(instanceId: string, captureId: string): Promise<CaptureRecord> {
    const client = await this.runtimeClientForInstance(instanceId);
    const res = await client.getCapture(captureId);
    const item = (res as any).item ?? res;
    return {
      capture_id: String(item.capture_id ?? item.id ?? captureId),
      instance_id: instanceId,
      protocol: parseProtocol(item.protocol ?? item.proto ?? item.type),
      method: item.method ? String(item.method) : undefined,
      url: item.url ? String(item.url) : undefined,
      host: item.host ? String(item.host) : undefined,
      path: item.path ? String(item.path) : undefined,
      status_code:
        typeof item.status_code === 'number' ? item.status_code : typeof item.statusCode === 'number' ? item.statusCode : undefined,
    };
  }

  async export(query: CaptureQuery & { export_format?: 'har' | 'json' }): Promise<Record<string, unknown>> {
    const client = await this.runtimeClientForInstance(query.instance_id);
    const limit = normalizeLimit(query.limit);
    const res = await client.exportCaptures({
      ...query.filters,
      limit,
      format: query.export_format,
    });
    return res as Record<string, unknown>;
  }

  async *tail(query: CaptureQuery): AsyncGenerator<CaptureRecord, void, unknown> {
    const client = await this.runtimeClientForInstance(query.instance_id);
    const limit = normalizeLimit(query.limit);
    let seen = 0;
    for await (const r of client.tailCaptures({ ...query.filters, limit })) {
      const capture_id = String((r as any).capture_id ?? (r as any).id ?? (r as any).sessionId ?? (r as any).reqId ?? '');
      yield {
        capture_id: capture_id || `cap_${Math.random().toString(16).slice(2)}`,
        instance_id: query.instance_id,
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
  }
}
