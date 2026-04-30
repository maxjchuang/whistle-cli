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
}
