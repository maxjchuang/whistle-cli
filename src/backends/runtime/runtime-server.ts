import http from 'node:http';
import { CliError } from '../../output/errors';
import { WhistleWebClient } from '../whistle-web';
import { normalizeWhistleWebCapture } from '../../domain/captures-service';
import type { CaptureRecord } from '../../domain/captures-model';

type UnknownRecord = Record<string, unknown>;

export interface RuntimeBackendOptions {
  targetBaseUrl: string;
  host?: string;
  port?: number;
  requestTimeoutMs?: number;
  captureLimit?: number;
}

export interface RuntimeBackendHandle {
  baseUrl: string;
  close(): Promise<void>;
}

interface RuntimeCaptureCacheEntry {
  record: CaptureRecord;
}

interface RuntimeErrorBody {
  error: {
    code: string;
    message: string;
    reason?: string;
    suggested_fix?: string;
  };
}

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' ? (value as UnknownRecord) : {};
}

function normalizeLimit(value: unknown, fallback: number): number {
  const parsed = Number(String(value ?? ''));
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.max(Math.floor(parsed), 1), 1000);
}

function statusFromSearch(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function runtimeItem(record: CaptureRecord): UnknownRecord {
  return {
    id: record.capture_id,
    capture_id: record.capture_id,
    protocol: record.protocol,
    method: record.method,
    url: record.url,
    host: record.host,
    path: record.path,
    status_code: record.status_code,
    request_headers: record.request_headers,
    matched_rules: record.matched_rules,
  };
}

function matchesFilters(record: CaptureRecord, params: URLSearchParams): boolean {
  const host = params.get('host');
  const path = params.get('path');
  const method = params.get('method');
  const status = statusFromSearch(params.get('status'));
  const keyword = params.get('keyword');

  if (host && record.host !== host) return false;
  if (path && !String(record.path ?? '').includes(path)) return false;
  if (method && String(record.method ?? '').toLowerCase() !== method.toLowerCase()) return false;
  if (typeof status === 'number' && record.status_code !== status) return false;
  if (keyword && !JSON.stringify(record).includes(keyword)) return false;
  return true;
}

function writeJson(res: http.ServerResponse, statusCode: number, body: unknown): void {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function runtimeError(
  code: string,
  message: string,
  opts?: { reason?: string; suggested_fix?: string },
): RuntimeErrorBody {
  return {
    error: {
      code,
      message,
      reason: opts?.reason,
      suggested_fix: opts?.suggested_fix,
    },
  };
}

async function readJson(req: http.IncomingMessage): Promise<UnknownRecord> {
  const raw = await new Promise<string>((resolve, reject) => {
    let buf = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      buf += chunk;
    });
    req.on('end', () => resolve(buf));
    req.on('error', reject);
  });
  if (!raw.trim()) return {};
  const parsed = JSON.parse(raw) as unknown;
  return asRecord(parsed);
}

function responseHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

function requestHeaders(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const out: Record<string, string> = {};
  for (const [key, headerValue] of Object.entries(value)) {
    if (headerValue == null) continue;
    out[key] = Array.isArray(headerValue)
      ? headerValue.map(String).join(', ')
      : String(headerValue);
  }
  return Object.keys(out).length ? out : undefined;
}

function safeOutboundHeaders(
  headers: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!headers) return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === 'host') continue;
    out[key] = value;
  }
  return Object.keys(out).length ? out : undefined;
}

export async function startRuntimeBackend(
  opts: RuntimeBackendOptions,
): Promise<RuntimeBackendHandle> {
  const host = opts.host ?? '127.0.0.1';
  const port = opts.port ?? 0;
  const timeoutMs = opts.requestTimeoutMs ?? 10_000;
  const defaultLimit = opts.captureLimit ?? 200;
  const web = new WhistleWebClient({ baseUrl: opts.targetBaseUrl, timeoutMs });
  const cache = new Map<string, RuntimeCaptureCacheEntry>();

  async function refreshCaptures(params?: URLSearchParams): Promise<CaptureRecord[]> {
    const limit = normalizeLimit(params?.get('limit'), defaultLimit);
    const dumpCount = Math.min(Math.max(limit * 5, 100), 1000);
    const payload = await web.getData({ startTime: 0, dumpCount });
    const records = Object.entries(payload.data?.data ?? {}).map(([id, raw]) => {
      const record = normalizeWhistleWebCapture(raw, 'runtime', id);
      return { ...record, backend: 'runtime' as const };
    });
    cache.clear();
    for (const record of records) {
      cache.set(record.capture_id, { record });
    }
    return records
      .filter((record) => (params ? matchesFilters(record, params) : true))
      .slice(0, limit);
  }

  async function executeRequest(input: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: string;
  }): Promise<UnknownRecord> {
    const method = input.method.toUpperCase();
    if (!input.url) {
      throw new CliError({
        code: 'UNSUPPORTED_OPERATION',
        message: 'Runtime request URL is required',
        suggested_fix: 'Provide a URL for compose, or replay a capture that includes a URL.',
      });
    }
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(input.url, {
        method,
        headers: safeOutboundHeaders(input.headers),
        body: method === 'GET' || method === 'HEAD' ? undefined : input.body,
        signal: ctrl.signal,
      });
      const bodyText = await res.text();
      return {
        ok: true,
        method,
        url: input.url,
        status: res.status,
        status_text: res.statusText,
        headers: responseHeaders(res.headers),
        body_length: bodyText.length,
        body_preview: bodyText.slice(0, 512),
      };
    } catch (e) {
      throw new CliError(
        {
          code: 'CAPTURE_BACKEND_UNAVAILABLE',
          message: 'Runtime request execution failed',
          reason: (e as Error)?.message ?? String(e),
          suggested_fix: 'Verify the target URL is reachable from this machine.',
        },
        e,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  async function handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', `http://${host}`);

    if (url.pathname === '/__whistle_cli__/health') {
      writeJson(res, 200, { ok: true, target_base_url: opts.targetBaseUrl });
      return;
    }

    if (
      url.pathname === '/__whistle_cli__/frames/list' ||
      url.pathname === '/__whistle_cli__/frames/send'
    ) {
      writeJson(
        res,
        501,
        runtimeError('UNSUPPORTED_OPERATION', 'Runtime frame routes are not implemented', {
          suggested_fix:
            'Use capture and composer runtime routes, or implement frame support in a later feature.',
        }),
      );
      return;
    }

    if (url.pathname === '/__whistle_cli__/captures/find') {
      const records = await refreshCaptures(url.searchParams);
      writeJson(res, 200, { items: records.map(runtimeItem) });
      return;
    }

    if (url.pathname === '/__whistle_cli__/captures/get') {
      const id = url.searchParams.get('id');
      if (!id) {
        writeJson(res, 400, runtimeError('BAD_REQUEST', 'Capture id is required'));
        return;
      }
      if (!cache.has(id)) await refreshCaptures();
      const item = cache.get(id)?.record;
      if (!item) {
        writeJson(res, 404, runtimeError('NOT_FOUND', 'Capture was not found'));
        return;
      }
      writeJson(res, 200, { item: runtimeItem(item) });
      return;
    }

    if (url.pathname === '/__whistle_cli__/captures/export') {
      const records = await refreshCaptures(url.searchParams);
      writeJson(res, 200, {
        items: records.map(runtimeItem),
        format: url.searchParams.get('format') ?? 'json',
      });
      return;
    }

    if (url.pathname === '/__whistle_cli__/captures/tail') {
      const records = await refreshCaptures(url.searchParams);
      res.statusCode = 200;
      res.setHeader('content-type', 'application/x-ndjson; charset=utf-8');
      for (const record of records) {
        res.write(`${JSON.stringify(runtimeItem(record))}\n`);
      }
      res.end();
      return;
    }

    if (url.pathname === '/__whistle_cli__/composer/compose' && req.method === 'POST') {
      const body = await readJson(req);
      const method = String(body.method ?? 'GET');
      const targetUrl = String(body.url ?? '');
      const result = await executeRequest({
        method,
        url: targetUrl,
        headers: requestHeaders(body.headers),
        body: body.body == null ? undefined : String(body.body),
      });
      writeJson(res, 200, result);
      return;
    }

    if (url.pathname === '/__whistle_cli__/composer/replay' && req.method === 'POST') {
      const body = await readJson(req);
      const captureId = String(body.capture_id ?? '');
      if (!captureId) {
        writeJson(res, 400, runtimeError('BAD_REQUEST', 'capture_id is required'));
        return;
      }
      if (!cache.has(captureId)) await refreshCaptures();
      const record = cache.get(captureId)?.record;
      if (!record) {
        writeJson(res, 404, runtimeError('NOT_FOUND', 'Capture was not found'));
        return;
      }
      const result = await executeRequest({
        method: String(body.method ?? record.method ?? 'GET'),
        url: String(body.url ?? record.url ?? ''),
        headers: { ...(record.request_headers ?? {}), ...(requestHeaders(body.headers) ?? {}) },
        body: body.body == null ? undefined : String(body.body),
      });
      writeJson(res, 200, result);
      return;
    }

    writeJson(res, 404, runtimeError('NOT_FOUND', 'Runtime route was not found'));
  }

  const server = http.createServer((req, res) => {
    void handle(req, res).catch((e) => {
      const err = CliError.fromUnknown(e);
      const statusCode = err.details.code === 'UNSUPPORTED_OPERATION' ? 501 : 502;
      writeJson(
        res,
        statusCode,
        runtimeError(err.details.code, err.details.message, {
          reason: err.details.reason,
          suggested_fix: err.details.suggested_fix,
        }),
      );
    });
  });

  await new Promise<void>((resolve) => server.listen(port, host, resolve));
  const addr = server.address();
  if (!addr || typeof addr === 'string') {
    throw new Error('Failed to bind runtime backend');
  }

  return {
    baseUrl: `http://${host}:${addr.port}`,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}
