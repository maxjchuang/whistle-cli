import { CliError } from '../../output/errors';

export interface RuntimeClientOptions {
  baseUrl: string;
  timeoutMs?: number;
}

export class RuntimeClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(opts: RuntimeClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.timeoutMs = opts.timeoutMs ?? 10_000;
  }

  private async getJson<T>(pathAndQuery: string): Promise<T> {
    const url = `${this.baseUrl}${pathAndQuery}`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { accept: 'application/json' },
        signal: ctrl.signal,
      });
      if (!res.ok) {
        throw new CliError({
          code: 'CAPTURE_BACKEND_UNAVAILABLE',
          message: 'Capture backend returned non-OK response',
          reason: `${res.status} ${res.statusText}`,
          suggested_fix: 'Ensure the capture backend is reachable and supports the whistle-cli runtime API.',
        });
      }
      return (await res.json()) as T;
    } catch (e) {
      if (e instanceof CliError) throw e;
      throw new CliError({
        code: 'CAPTURE_BACKEND_UNAVAILABLE',
        message: 'Capture backend is not reachable',
        reason: (e as Error)?.message ?? String(e),
        suggested_fix:
          'Set WHISTLE_CLI_RUNTIME_URL to a reachable backend, or start the target Whistle instance and ensure its runtime API is available.',
      });
    } finally {
      clearTimeout(t);
    }
  }

  private async postJson<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify(body ?? {}),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        throw new CliError({
          code: 'CAPTURE_BACKEND_UNAVAILABLE',
          message: 'Runtime backend returned non-OK response',
          reason: `${res.status} ${res.statusText}`,
          suggested_fix: 'Ensure the runtime backend is reachable and supports the whistle-cli runtime API.',
        });
      }
      return (await res.json()) as T;
    } catch (e) {
      if (e instanceof CliError) throw e;
      throw new CliError({
        code: 'CAPTURE_BACKEND_UNAVAILABLE',
        message: 'Runtime backend is not reachable',
        reason: (e as Error)?.message ?? String(e),
        suggested_fix:
          'Set WHISTLE_CLI_RUNTIME_URL to a reachable backend, or start the target Whistle instance and ensure its runtime API is available.',
      });
    } finally {
      clearTimeout(t);
    }
  }

  async findCaptures(query: {
    host?: string;
    path?: string;
    method?: string;
    status?: number;
    keyword?: string;
    limit?: number;
  }): Promise<{ items: unknown[] }> {
    const params = new URLSearchParams();
    if (query.host) params.set('host', query.host);
    if (query.path) params.set('path', query.path);
    if (query.method) params.set('method', query.method);
    if (typeof query.status === 'number') params.set('status', String(query.status));
    if (query.keyword) params.set('keyword', query.keyword);
    if (typeof query.limit === 'number') params.set('limit', String(query.limit));
    const qs = params.toString();
    return this.getJson<{ items: unknown[] }>(`/__whistle_cli__/captures/find${qs ? `?${qs}` : ''}`);
  }

  async getCapture(id: string): Promise<{ item: unknown } | unknown> {
    const safeId = encodeURIComponent(id);
    return this.getJson<{ item: unknown }>(`/__whistle_cli__/captures/get?id=${safeId}`);
  }

  async exportCaptures(query: {
    host?: string;
    path?: string;
    method?: string;
    status?: number;
    keyword?: string;
    limit?: number;
    format?: 'har' | 'json';
  }): Promise<{ items?: unknown[]; file_path?: string } & Record<string, unknown>> {
    const params = new URLSearchParams();
    if (query.host) params.set('host', query.host);
    if (query.path) params.set('path', query.path);
    if (query.method) params.set('method', query.method);
    if (typeof query.status === 'number') params.set('status', String(query.status));
    if (query.keyword) params.set('keyword', query.keyword);
    if (typeof query.limit === 'number') params.set('limit', String(query.limit));
    if (query.format) params.set('format', query.format);
    const qs = params.toString();
    return this.getJson(`/__whistle_cli__/captures/export${qs ? `?${qs}` : ''}`);
  }

  async *tailCaptures(query: {
    host?: string;
    path?: string;
    method?: string;
    status?: number;
    keyword?: string;
    limit?: number;
  }): AsyncGenerator<unknown, void, unknown> {
    const params = new URLSearchParams();
    if (query.host) params.set('host', query.host);
    if (query.path) params.set('path', query.path);
    if (query.method) params.set('method', query.method);
    if (typeof query.status === 'number') params.set('status', String(query.status));
    if (query.keyword) params.set('keyword', query.keyword);
    if (typeof query.limit === 'number') params.set('limit', String(query.limit));
    const qs = params.toString();
    const url = `${this.baseUrl}/__whistle_cli__/captures/tail${qs ? `?${qs}` : ''}`;

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { accept: 'application/x-ndjson, application/json' },
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        throw new CliError({
          code: 'CAPTURE_BACKEND_UNAVAILABLE',
          message: 'Capture tail backend returned non-OK response',
          reason: `${res.status} ${res.statusText}`,
          suggested_fix: 'Ensure the runtime backend supports captures tail streaming.',
        });
      }

      const decoder = new TextDecoder();
      let buf = '';
      // Node fetch body is a Web ReadableStream.
      const reader = (res.body as any).getReader?.();
      if (!reader) {
        throw new CliError({
          code: 'CAPTURE_BACKEND_UNAVAILABLE',
          message: 'Streaming body reader not available',
          suggested_fix: 'Use Node.js >= 20 and ensure the backend uses a streaming response.',
        });
      }

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        while (true) {
          const idx = buf.indexOf('\n');
          if (idx < 0) break;
          const line = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 1);
          if (!line) continue;
          try {
            yield JSON.parse(line);
          } catch {
            // Ignore malformed lines for best-effort streaming.
          }
        }
      }

      const tail = buf.trim();
      if (tail) {
        try {
          yield JSON.parse(tail);
        } catch {
          // ignore
        }
      }
    } catch (e) {
      if (e instanceof CliError) throw e;
      throw new CliError({
        code: 'CAPTURE_BACKEND_UNAVAILABLE',
        message: 'Capture tail backend is not reachable',
        reason: (e as Error)?.message ?? String(e),
        suggested_fix:
          'Set WHISTLE_CLI_RUNTIME_URL to a reachable backend, or start the target Whistle instance and ensure its runtime API is available.',
      });
    } finally {
      clearTimeout(t);
    }
  }

  async replayCapture(body: {
    capture_id: string;
    headers?: Record<string, string>;
    body?: string;
    method?: string;
    url?: string;
  }): Promise<Record<string, unknown>> {
    return this.postJson('/__whistle_cli__/composer/replay', body);
  }

  async composeRequest(body: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: string;
  }): Promise<Record<string, unknown>> {
    return this.postJson('/__whistle_cli__/composer/compose', body);
  }

  async listFrames(query: { session_id: string; limit?: number }): Promise<{ items: unknown[] }> {
    const params = new URLSearchParams();
    params.set('session_id', query.session_id);
    if (typeof query.limit === 'number') params.set('limit', String(query.limit));
    return this.getJson<{ items: unknown[] }>(`/__whistle_cli__/frames/list?${params.toString()}`);
  }

  async sendFrame(body: { session_id: string; data: string; direction?: 'to_server' | 'to_client' }): Promise<Record<string, unknown>> {
    return this.postJson('/__whistle_cli__/frames/send', body);
  }
}
