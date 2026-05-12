import { CliError } from '../../output/errors';

export interface WhistleWebClientOptions {
  baseUrl: string;
  timeoutMs?: number;
}

export interface WhistleRulesListResponse {
  ec?: number;
  em?: string;
  defaultRules?: string;
  defaultRulesIsDisabled?: boolean;
  list?: unknown[];
}

export interface WhistleApplyResponse {
  ec?: number;
  em?: string;
  [key: string]: unknown;
}

export interface WhistleGetDataResponse {
  ec?: number;
  data?: {
    data?: Record<string, unknown>;
    ids?: string[];
    newIds?: string[];
    lastId?: string;
    endId?: string;
  };
  [key: string]: unknown;
}

function assertWhistleSuccess(payload: unknown): void {
  if (!payload || typeof payload !== 'object') return;
  const ec = (payload as { ec?: unknown }).ec;
  if (typeof ec !== 'number' || ec === 0) return;
  const em = (payload as { em?: unknown }).em;
  throw new CliError({
    code: 'WHISTLE_WEB_UNAVAILABLE',
    message: 'Whistle Web API returned an error response',
    reason: typeof em === 'string' && em.trim() ? em : `ec=${ec}`,
    suggested_fix: 'Ensure the target Whistle instance is running and its Web UI API is healthy.',
  });
}

export class WhistleWebClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(opts: WhistleWebClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.timeoutMs = opts.timeoutMs ?? 10_000;
  }

  private async requestJson<T>(pathAndQuery: string, init?: RequestInit): Promise<T> {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}${pathAndQuery}`, {
        ...init,
        headers: {
          accept: 'application/json',
          ...(init?.headers ?? {}),
        },
        signal: ctrl.signal,
      });
      if (!res.ok) {
        throw new CliError({
          code: 'WHISTLE_WEB_UNAVAILABLE',
          message: 'Whistle Web API returned non-OK response',
          reason: `${res.status} ${res.statusText}`,
          suggested_fix: 'Ensure the target Whistle instance is running and its Web UI API is reachable.',
        });
      }
      const payload = (await res.json()) as T;
      assertWhistleSuccess(payload);
      return payload;
    } catch (e) {
      if (e instanceof CliError) throw e;
      throw new CliError({
        code: 'WHISTLE_WEB_UNAVAILABLE',
        message: 'Whistle Web API is not reachable',
        reason: (e as Error)?.message ?? String(e),
        suggested_fix: 'Run `whistle-cli instance status` and verify the Whistle host and port.',
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  async getRulesList(): Promise<WhistleRulesListResponse> {
    return this.requestJson<WhistleRulesListResponse>('/cgi-bin/rules/list');
  }

  async applyDefaultRules(value: string, opts?: { selected?: boolean }): Promise<WhistleApplyResponse> {
    const selected = opts?.selected ?? true;
    const body = `name=Default&value=${encodeURIComponent(value)}&selected=${selected ? 'true' : 'false'}`;
    return this.requestJson<WhistleApplyResponse>('/cgi-bin/rules/add', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
  }

  async enableDefaultRules(): Promise<WhistleApplyResponse> {
    return this.requestJson<WhistleApplyResponse>('/cgi-bin/rules/enable-default', { method: 'POST' });
  }

  async disableDefaultRules(): Promise<WhistleApplyResponse> {
    return this.requestJson<WhistleApplyResponse>('/cgi-bin/rules/disable-default', { method: 'POST' });
  }

  async getData(opts?: { startTime?: number; dumpCount?: number }): Promise<WhistleGetDataResponse> {
    const params = new URLSearchParams();
    if (typeof opts?.startTime === 'number') params.set('startTime', String(opts.startTime));
    if (typeof opts?.dumpCount === 'number') params.set('dumpCount', String(opts.dumpCount));
    const qs = params.toString();
    return this.requestJson<WhistleGetDataResponse>(`/cgi-bin/get-data${qs ? `?${qs}` : ''}`);
  }
}
