# Whistle CLI Runtime Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reliable runtime rule application and live header verification through Whistle's built-in Web API, with conflict diagnostics and updated skill guidance.

**Architecture:** Add a focused `WhistleWebClient` backend for `/cgi-bin/*`, then route runtime default rules and native capture reads through domain services. Keep existing storage-backed rules and optional runtime API behavior intact; shortcuts only orchestrate domain services.

**Tech Stack:** TypeScript 6, Node.js 20 fetch/AbortController, Commander, Vitest, existing JSON envelope output.

---

## File Structure

- Create `src/backends/whistle-web/whistle-web-client.ts`: HTTP client for Whistle Web UI API, with typed responses and `WHISTLE_WEB_UNAVAILABLE` errors.
- Create `src/backends/whistle-web/index.ts`: export the client.
- Modify `src/output/errors.ts`: add stable runtime verification error codes.
- Modify `src/domain/rules-model.ts`: add runtime default rule and conflict diagnostic types.
- Modify `src/domain/rules-service.ts`: add runtime default rules methods and best-effort conflict diagnosis.
- Modify `src/domain/captures-model.ts`: add backend, request headers, matched rule metadata, assertion query, assertion result, and classification types.
- Modify `src/domain/captures-service.ts`: add Whistle Web backend selection, native capture normalization, finite polling, watch polling, and header assertion.
- Modify `src/resources/rules.ts`: register `rules default get`, `rules default apply`, and `rules diagnose-conflicts`.
- Modify `src/resources/captures.ts`: register `captures assert-header` and `captures watch`.
- Modify `src/shortcuts/rules.ts`: add runtime apply and live verification flags to `rule set-header`.
- Modify `skills/whistle-cli/SKILL.md`: document the new standard header-injection workflow.
- Modify `tests/integration/us3-captures.fixtures.ts`: extend fake backend with Whistle Web `/cgi-bin/*` routes.
- Add tests under `tests/unit/` and `tests/integration/` as listed in each task.

## Task 1: Whistle Web Client Backend

**Files:**
- Create: `src/backends/whistle-web/whistle-web-client.ts`
- Create: `src/backends/whistle-web/index.ts`
- Modify: `src/output/errors.ts`
- Test: `tests/unit/whistle-web-client.test.ts`

- [ ] **Step 1: Write failing tests for rules list, default apply, get-data, and error mapping**

Create `tests/unit/whistle-web-client.test.ts`:

```ts
import http from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { WhistleWebClient } from '../../src/backends/whistle-web';

let server: http.Server | undefined;

async function startServer(handler: http.RequestListener): Promise<string> {
  server = http.createServer(handler);
  await new Promise<void>((resolve) => server!.listen(0, resolve));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('no port');
  return `http://127.0.0.1:${addr.port}`;
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  return await new Promise((resolve, reject) => {
    let out = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => (out += chunk));
    req.on('end', () => resolve(out));
    req.on('error', reject);
  });
}

afterEach(async () => {
  if (!server) return;
  await new Promise<void>((resolve, reject) => server!.close((err) => (err ? reject(err) : resolve())));
  server = undefined;
});

describe('WhistleWebClient', () => {
  it('reads runtime default rules from /cgi-bin/rules/list', async () => {
    const baseUrl = await startServer((req, res) => {
      expect(req.url).toBe('/cgi-bin/rules/list');
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ec: 0, defaultRules: 'example.com reqHeaders://x-test=1\n', defaultRulesIsDisabled: false }));
    });

    const client = new WhistleWebClient({ baseUrl });
    const result = await client.getRulesList();

    expect(result.defaultRules).toContain('x-test=1');
    expect(result.defaultRulesIsDisabled).toBe(false);
  });

  it('applies default rules with a form post to /cgi-bin/rules/add', async () => {
    const baseUrl = await startServer((req, res) => {
      expect(req.method).toBe('POST');
      expect(req.url).toBe('/cgi-bin/rules/add');
      void readBody(req).then((body) => {
        expect(body).toContain('name=Default');
        expect(decodeURIComponent(body)).toContain('example.com reqHeaders://x-test=1');
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ ec: 0 }));
      });
    });

    const client = new WhistleWebClient({ baseUrl });
    await expect(client.applyDefaultRules('example.com reqHeaders://x-test=1\n')).resolves.toEqual({ ec: 0 });
  });

  it('reads native capture data from /cgi-bin/get-data', async () => {
    const baseUrl = await startServer((req, res) => {
      expect(req.url).toBe('/cgi-bin/get-data?startTime=0&dumpCount=20');
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ec: 0, data: { data: { c1: { id: 'c1', url: 'https://example.com/a' } } } }));
    });

    const client = new WhistleWebClient({ baseUrl });
    const result = await client.getData({ startTime: 0, dumpCount: 20 });

    expect(result.data?.data?.c1?.url).toBe('https://example.com/a');
  });

  it('maps non-ok responses to WHISTLE_WEB_UNAVAILABLE', async () => {
    const baseUrl = await startServer((_req, res) => {
      res.statusCode = 500;
      res.end('broken');
    });

    const client = new WhistleWebClient({ baseUrl });
    await expect(client.getRulesList()).rejects.toMatchObject({
      details: { code: 'WHISTLE_WEB_UNAVAILABLE' },
    });
  });
});
```

- [ ] **Step 2: Run the failing test**

Run: `npm test -- tests/unit/whistle-web-client.test.ts`

Expected: FAIL because `../../src/backends/whistle-web` does not exist.

- [ ] **Step 3: Add runtime verification error codes**

Modify `src/output/errors.ts` by adding these members to the `ErrorCode` union:

```ts
  | 'WHISTLE_WEB_UNAVAILABLE'
  | 'RUNTIME_BACKEND_UNAVAILABLE'
  | 'RULE_RUNTIME_VERIFY_FAILED'
  | 'HEADER_ASSERTION_NO_TRAFFIC'
  | 'HEADER_ASSERTION_FAILED'
  | 'RULE_HEADER_CONFLICT'
```

- [ ] **Step 4: Implement `WhistleWebClient`**

Create `src/backends/whistle-web/whistle-web-client.ts`:

```ts
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
    data?: Record<string, any>;
    ids?: string[];
    newIds?: string[];
    lastId?: string;
    endId?: string;
  };
  [key: string]: unknown;
}

export class WhistleWebClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(opts: WhistleWebClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
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
      return (await res.json()) as T;
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

  async applyDefaultRules(value: string): Promise<WhistleApplyResponse> {
    const body = new URLSearchParams();
    body.set('name', 'Default');
    body.set('value', value);
    body.set('selected', 'true');
    return this.requestJson<WhistleApplyResponse>('/cgi-bin/rules/add', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
  }

  async getData(opts?: { startTime?: number; dumpCount?: number }): Promise<WhistleGetDataResponse> {
    const params = new URLSearchParams();
    if (typeof opts?.startTime === 'number') params.set('startTime', String(opts.startTime));
    if (typeof opts?.dumpCount === 'number') params.set('dumpCount', String(opts.dumpCount));
    const qs = params.toString();
    return this.requestJson<WhistleGetDataResponse>(`/cgi-bin/get-data${qs ? `?${qs}` : ''}`);
  }
}
```

Create `src/backends/whistle-web/index.ts`:

```ts
export * from './whistle-web-client';
```

- [ ] **Step 5: Run the test**

Run: `npm test -- tests/unit/whistle-web-client.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/backends/whistle-web src/output/errors.ts tests/unit/whistle-web-client.test.ts
git commit -m "feat: add whistle web api client"
```

## Task 2: Runtime Default Rules Commands

**Files:**
- Modify: `src/domain/rules-model.ts`
- Modify: `src/domain/rules-service.ts`
- Modify: `src/resources/rules.ts`
- Test: `tests/integration/us2-runtime-rules.test.ts`
- Modify: `tests/integration/us3-captures.fixtures.ts`

- [ ] **Step 1: Extend fake backend with rules Web API routes**

Modify `tests/integration/us3-captures.fixtures.ts` by adding state before `http.createServer`:

```ts
  let defaultRules = 'example.com reqHeaders://x-old=1\n';
```

Add these routes near the top of the server callback, before `__whistle_cli__` routes:

```ts
    if (u.pathname === '/cgi-bin/rules/list') {
      res.statusCode = 200;
      res.end(JSON.stringify({ ec: 0, defaultRules, defaultRulesIsDisabled: false, list: [] }));
      return;
    }

    if (u.pathname === '/cgi-bin/rules/add' && req.method === 'POST') {
      let body = '';
      req.setEncoding('utf8');
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        const params = new URLSearchParams(body);
        if (params.get('name') === 'Default') {
          defaultRules = params.get('value') ?? '';
        }
        res.statusCode = 200;
        res.end(JSON.stringify({ ec: 0 }));
      });
      return;
    }
```

- [ ] **Step 2: Write failing integration tests for runtime default rules**

Create `tests/integration/us2-runtime-rules.test.ts`:

```ts
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli } from './us1-bootstrap.fixtures';
import { startFakeCaptureBackend } from './us3-captures.fixtures';

describe('runtime default rules', () => {
  it('gets runtime default rules through Whistle Web API', async () => {
    const backend = await startFakeCaptureBackend();
    try {
      const res = await runCli(['--instance', 'dummy', 'rules', 'default', 'get', '--format', 'json'], {
        env: { WHISTLE_CLI_RUNTIME_URL: backend.baseUrl },
      });
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain('"resource":"rules"');
      expect(res.stdout).toContain('"action":"default-get"');
      expect(res.stdout).toContain('"backend":"whistle-web"');
      expect(res.stdout).toContain('example.com reqHeaders://x-old=1');
    } finally {
      await backend.close();
    }
  });

  it('applies and verifies runtime default rules through Whistle Web API', async () => {
    const backend = await startFakeCaptureBackend();
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'whistle-cli-runtime-rules-'));
    const file = path.join(dir, 'rules.txt');
    await fs.writeFile(file, 'example.com reqHeaders://x-new=2\n', 'utf8');

    try {
      const apply = await runCli(['--instance', 'dummy', 'rules', 'default', 'apply', '--file', file, '--apply', '--verify', '--format', 'json'], {
        env: { WHISTLE_CLI_RUNTIME_URL: backend.baseUrl },
      });
      expect(apply.exitCode).toBe(0);
      expect(apply.stdout).toContain('"action":"default-apply"');
      expect(apply.stdout).toContain('"verified":true');

      const get = await runCli(['--instance', 'dummy', 'rules', 'default', 'get', '--format', 'json'], {
        env: { WHISTLE_CLI_RUNTIME_URL: backend.baseUrl },
      });
      expect(get.stdout).toContain('example.com reqHeaders://x-new=2');
    } finally {
      await backend.close();
    }
  });
});
```

- [ ] **Step 3: Run the failing integration test**

Run: `npm test -- tests/integration/us2-runtime-rules.test.ts`

Expected: FAIL because `rules default` is not registered.

- [ ] **Step 4: Add domain types**

Append to `src/domain/rules-model.ts`:

```ts
export interface RuntimeDefaultRules {
  instance_id: string;
  backend: 'whistle-web';
  source_text: string;
  disabled: boolean;
}

export interface RuntimeDefaultRulesApplyResult {
  backend: 'whistle-web';
  changed: boolean;
  verified: boolean;
  before_sha256: string;
  after_sha256: string;
}
```

- [ ] **Step 5: Add runtime default rule methods**

Modify `src/domain/rules-service.ts` imports:

```ts
import { WhistleWebClient } from '../backends/whistle-web';
import { InstanceService } from './instance-service';
import { loadConfig } from '../shared/config';
import type { RuntimeDefaultRules, RuntimeDefaultRulesApplyResult } from './rules-model';
```

Add a private field and helper inside `RulesService`:

```ts
  private readonly instances = new InstanceService();

  private async whistleWebClientForInstance(instanceId?: string): Promise<WhistleWebClient> {
    const cfg = loadConfig();
    if (cfg.runtimeUrl) return new WhistleWebClient({ baseUrl: cfg.runtimeUrl });
    const st = await this.instances.status(instanceId ?? 'default');
    return new WhistleWebClient({ baseUrl: `http://${st.host}:${st.port}` });
  }
```

Add methods inside `RulesService`:

```ts
  async getRuntimeDefaultRules(instanceId?: string): Promise<RuntimeDefaultRules> {
    const client = await this.whistleWebClientForInstance(instanceId);
    const res = await client.getRulesList();
    return {
      instance_id: instanceId ?? 'default',
      backend: 'whistle-web',
      source_text: String(res.defaultRules ?? ''),
      disabled: Boolean(res.defaultRulesIsDisabled),
    };
  }

  async applyRuntimeDefaultRules(text: string, instanceId?: string, opts?: { verify?: boolean }): Promise<RuntimeDefaultRulesApplyResult> {
    const client = await this.whistleWebClientForInstance(instanceId);
    const before = await client.getRulesList();
    const beforeText = String(before.defaultRules ?? '');
    await client.applyDefaultRules(text);
    const after = await client.getRulesList();
    const afterText = String(after.defaultRules ?? '');
    const verified = !opts?.verify || normalizeEol(afterText) === normalizeEol(text);
    if (!verified) {
      throw new CliError({
        code: 'RULE_RUNTIME_VERIFY_FAILED',
        message: 'Runtime default rules did not match after apply',
        reason: 'Whistle Web API accepted the write but returned different default rules on readback.',
        suggested_fix: 'Re-run `whistle-cli rules default get --format json` and inspect current runtime rules.',
      });
    }
    return {
      backend: 'whistle-web',
      changed: normalizeEol(beforeText) !== normalizeEol(afterText),
      verified,
      before_sha256: sha256Hex(normalizeEol(beforeText)),
      after_sha256: sha256Hex(normalizeEol(afterText)),
    };
  }
```

- [ ] **Step 6: Register `rules default get/apply`**

In `src/resources/rules.ts`, after `const executor = new ActionExecutor();`, add:

```ts
  const defaultRules = rules.command('default').description('Manage runtime default rules through Whistle Web API');

  defaultRules
    .command('get')
    .description('Get runtime default rules')
    .action(async () => {
      const opts = program.opts();
      const format = opts.format ?? 'json';
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'default-get';
      try {
        const data = await service.getRuntimeDefaultRules(resolved.id);
        process.stdout.write(renderEnvelope(okEnvelope('rules', action, data, { instance: resolved, effective: true }), format));
      } catch (e) {
        const err = CliError.fromUnknown(e);
        process.stderr.write(renderEnvelope(errorEnvelope('rules', action, err, { instance: resolved }), format));
        process.exitCode = 1;
      }
    });

  defaultRules
    .command('apply')
    .description('Apply runtime default rules through Whistle Web API')
    .requiredOption('--file <path>', 'Path to complete runtime default rules text')
    .option('--preview', 'Preview without applying')
    .option('--apply', 'Apply the change')
    .option('--verify', 'Verify after apply')
    .action(async (cmdOpts: { file: string; preview?: boolean; apply?: boolean; verify?: boolean }) => {
      const opts = program.opts();
      const format = opts.format ?? 'json';
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'default-apply';
      const pav = resolvePavFlags(cmdOpts);
      try {
        const text = await fs.readFile(cmdOpts.file, 'utf8');
        const result = await executor.execute(
          { resource: 'rules', action, instance: resolved },
          pav,
          {
            preview: async () => ({ backend: 'whistle-web', bytes: Buffer.byteLength(text, 'utf8') }),
            apply: async () => ({ result: await service.applyRuntimeDefaultRules(text, resolved.id, { verify: pav.verify }) }),
            verify: async () => service.getRuntimeDefaultRules(resolved.id),
          },
        );
        process.stdout.write(
          renderEnvelope(
            okEnvelope('rules', action, result, {
              instance: resolved,
              effective: pav.apply,
              meta: { preview: pav.preview, verified: pav.verify, action_id: result.action_id },
            }),
            format,
          ),
        );
      } catch (e) {
        const err = CliError.fromUnknown(e);
        process.stderr.write(renderEnvelope(errorEnvelope('rules', action, err, { instance: resolved }), format));
        process.exitCode = 1;
      }
    });
```

- [ ] **Step 7: Run integration tests**

Run: `npm test -- tests/integration/us2-runtime-rules.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/domain/rules-model.ts src/domain/rules-service.ts src/resources/rules.ts tests/integration/us2-runtime-rules.test.ts tests/integration/us3-captures.fixtures.ts
git commit -m "feat: manage runtime default rules"
```

## Task 3: Native Capture Backend And Normalization

**Files:**
- Modify: `src/domain/captures-model.ts`
- Modify: `src/domain/captures-service.ts`
- Modify: `tests/integration/us3-captures.fixtures.ts`
- Test: `tests/unit/captures-native.test.ts`
- Test: `tests/integration/us3-captures.test.ts`

- [ ] **Step 1: Extend fake backend with `/cgi-bin/get-data` route**

In `tests/integration/us3-captures.fixtures.ts`, add this route before `__whistle_cli__` routes:

```ts
    if (u.pathname === '/cgi-bin/get-data') {
      const data = {
        n1: {
          id: 'n1',
          startTime: 1700000000000,
          url: 'https://example.com/api/ok',
          req: {
            method: 'GET',
            headers: { host: 'example.com', 'x-env': 'staging' },
          },
          res: { statusCode: 200 },
          rules: { rule: { matcher: 'example.com', raw: 'example.com reqHeaders://x-env=staging' } },
          rulesHeaders: {},
        },
      };
      res.statusCode = 200;
      res.end(JSON.stringify({ ec: 0, data: { data, newIds: Object.keys(data) } }));
      return;
    }
```

- [ ] **Step 2: Write failing native normalization test**

Create `tests/unit/captures-native.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { normalizeWhistleWebCapture } from '../../src/domain/captures-service';

describe('native capture normalization', () => {
  it('normalizes Whistle Web get-data sessions with request headers and backend', () => {
    const record = normalizeWhistleWebCapture(
      {
        id: 'n1',
        url: 'https://example.com/api/ok?x=1',
        req: { method: 'POST', headers: { host: 'example.com', 'x-env': 'staging' } },
        res: { statusCode: 201 },
        rules: { rule: { raw: 'example.com reqHeaders://x-env=staging' } },
      },
      'default',
    );

    expect(record.capture_id).toBe('n1');
    expect(record.backend).toBe('whistle-web');
    expect(record.host).toBe('example.com');
    expect(record.path).toBe('/api/ok?x=1');
    expect(record.method).toBe('POST');
    expect(record.status_code).toBe(201);
    expect(record.request_headers?.['x-env']).toBe('staging');
  });
});
```

- [ ] **Step 3: Run failing unit test**

Run: `npm test -- tests/unit/captures-native.test.ts`

Expected: FAIL because `normalizeWhistleWebCapture` does not exist.

- [ ] **Step 4: Extend capture model**

Modify `src/domain/captures-model.ts`:

```ts
export type CaptureBackend = 'runtime' | 'whistle-web';
```

Add fields to `CaptureRecord`:

```ts
  backend?: CaptureBackend;
  request_headers?: Record<string, string>;
  matched_rules?: unknown;
```

Add backend to `CaptureQuery`:

```ts
  backend?: 'auto' | CaptureBackend;
```

- [ ] **Step 5: Implement native normalization and backend selection**

Modify `src/domain/captures-service.ts` imports:

```ts
import { WhistleWebClient } from '../backends/whistle-web';
import { CliError } from '../output/errors';
```

Add exported helper near the top:

```ts
export function normalizeWhistleWebCapture(raw: any, instanceId: string): CaptureRecord {
  const url = String(raw?.url ?? '');
  let parsed: URL | null = null;
  try {
    parsed = url ? new URL(url) : null;
  } catch {
    parsed = null;
  }
  const headers = raw?.req?.headers && typeof raw.req.headers === 'object' ? raw.req.headers : undefined;
  return {
    capture_id: String(raw?.id ?? raw?.capture_id ?? `cap_${Math.random().toString(16).slice(2)}`),
    instance_id: instanceId,
    backend: 'whistle-web',
    protocol: parseProtocol(parsed?.protocol?.replace(':', '') ?? raw?.protocol),
    method: raw?.req?.method ? String(raw.req.method) : raw?.method ? String(raw.method) : undefined,
    url: url || undefined,
    host: parsed?.host ?? (headers?.host ? String(headers.host) : undefined),
    path: parsed ? `${parsed.pathname}${parsed.search}` : undefined,
    status_code:
      typeof raw?.res?.statusCode === 'number'
        ? raw.res.statusCode
        : typeof raw?.res?.status === 'number'
          ? raw.res.status
          : typeof raw?.statusCode === 'number'
            ? raw.statusCode
            : undefined,
    request_headers: headers ? Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v)])) : undefined,
    matched_rules: raw?.rules ?? raw?.rulesHeaders ? { rules: raw?.rules, rulesHeaders: raw?.rulesHeaders } : undefined,
  };
}
```

Add a client helper:

```ts
  private async whistleWebClientForInstance(instanceId: string): Promise<WhistleWebClient> {
    const cfg = loadConfig();
    if (cfg.runtimeUrl) return new WhistleWebClient({ baseUrl: cfg.runtimeUrl });
    const st = await this.instances.status(instanceId);
    return new WhistleWebClient({ baseUrl: `http://${st.host}:${st.port}` });
  }
```

Add native find method:

```ts
  private async findViaWhistleWeb(query: CaptureQuery, limit: number): Promise<CaptureRecord[]> {
    const client = await this.whistleWebClientForInstance(query.instance_id);
    const res = await client.getData({ startTime: 0, dumpCount: limit });
    const rawItems = Object.values(res.data?.data ?? {});
    return rawItems
      .map((r) => normalizeWhistleWebCapture(r, query.instance_id))
      .filter((r) => {
        const f = query.filters;
        if (f.host && r.host !== f.host) return false;
        if (f.path && !r.path?.includes(f.path)) return false;
        if (f.method && r.method?.toUpperCase() !== f.method.toUpperCase()) return false;
        if (typeof f.status === 'number' && r.status_code !== f.status) return false;
        if (f.keyword && !JSON.stringify(r).includes(f.keyword)) return false;
        return true;
      });
  }
```

In `find`, before creating `RuntimeClient`, add:

```ts
    const backend = query.backend ?? 'auto';
    if (backend === 'auto' || backend === 'whistle-web') {
      const items = await this.findViaWhistleWeb(query, limit);
      return this.buildFindResult(query, items);
    }
```

Move the existing analysis construction into a private `buildFindResult(query, items)` helper and use it for both backends.

When mapping runtime items, add `backend: 'runtime'`.

If `backend === 'runtime'`, keep current runtime behavior.

Wrap the runtime branch in a catch that maps runtime availability failures to the explicit error code:

```ts
    try {
      const client = await this.runtimeClientForInstance(query.instance_id);
      const res = await client.findCaptures({ ...query.filters, limit });
      // existing runtime mapping continues here
    } catch (e) {
      const err = CliError.fromUnknown(e);
      if (backend === 'runtime' && err.details.code === 'CAPTURE_BACKEND_UNAVAILABLE') {
        throw new CliError({
          code: 'RUNTIME_BACKEND_UNAVAILABLE',
          message: 'Runtime capture backend is unavailable',
          reason: err.details.reason,
          suggested_fix: 'Use the default Whistle Web backend or install the runtime backend before passing --backend runtime.',
        });
      }
      throw e;
    }
```

- [ ] **Step 6: Run unit test**

Run: `npm test -- tests/unit/captures-native.test.ts`

Expected: PASS.

- [ ] **Step 7: Add integration assertion for default native backend**

Append to `tests/integration/us3-captures.test.ts`:

```ts
  it('captures find uses Whistle Web API by default when runtime routes are absent', async () => {
    const stateDir = await makeTempDir('whistle-cli-us3-state-');
    const backend = await startFakeCaptureBackend();
    try {
      const res = await runCli(['--instance', 'dummy', 'captures', 'find', '--host', 'example.com', '--format', 'json'], {
        env: {
          WHISTLE_CLI_STATE_DIR: stateDir,
          WHISTLE_CLI_RUNTIME_URL: backend.baseUrl,
        },
      });
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain('"backend":"whistle-web"');
      expect(res.stdout).toContain('"request_headers"');
      expect(res.stdout).toContain('"x-env":"staging"');
    } finally {
      await backend.close();
    }
  });
```

- [ ] **Step 8: Run captures tests**

Run: `npm test -- tests/unit/captures-native.test.ts tests/integration/us3-captures.test.ts`

Expected: PASS. Existing runtime tests may need `--backend runtime` added to commands that expect `__whistle_cli__` fixtures.

- [ ] **Step 9: Commit**

```bash
git add src/domain/captures-model.ts src/domain/captures-service.ts tests/unit/captures-native.test.ts tests/integration/us3-captures.fixtures.ts tests/integration/us3-captures.test.ts
git commit -m "feat: read captures from whistle web api"
```

## Task 4: Header Assertion And Watch Commands

**Files:**
- Modify: `src/domain/captures-model.ts`
- Modify: `src/domain/captures-service.ts`
- Modify: `src/resources/captures.ts`
- Test: `tests/unit/header-assertion.test.ts`
- Test: `tests/integration/us3-header-assertion.test.ts`

- [ ] **Step 1: Write failing classification unit tests**

Create `tests/unit/header-assertion.test.ts`:

```ts
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
```

- [ ] **Step 2: Run failing unit test**

Run: `npm test -- tests/unit/header-assertion.test.ts`

Expected: FAIL because helpers do not exist.

- [ ] **Step 3: Add assertion model types**

Append to `src/domain/captures-model.ts`:

```ts
export type HeaderAssertionClassification = 'OK' | 'OVERRIDDEN' | 'MISS' | 'NO_TRAFFIC';

export interface HeaderAssertionOptions {
  header: string;
  equals: string;
}

export interface HeaderAssertionExample {
  capture_id: string;
  url?: string;
  method?: string;
  status_code?: number;
  expected: string;
  actual?: string;
  classification: HeaderAssertionClassification;
}

export interface HeaderAssertionResult {
  backend: CaptureBackend;
  observed: number;
  ok: number;
  overridden: number;
  miss: number;
  no_traffic: boolean;
  classification: HeaderAssertionClassification;
  events: HeaderAssertionExample[];
  examples: HeaderAssertionExample[];
}
```

- [ ] **Step 4: Implement classification helpers and assertion method**

Modify `src/domain/captures-service.ts` imports:

```ts
import type { CaptureQuery, CaptureRecord, HeaderAssertionOptions, HeaderAssertionResult, HeaderAssertionExample } from './captures-model';
```

Add exported helpers:

```ts
export function classifyHeaderRecord(record: CaptureRecord, header: string, expected: string): HeaderAssertionExample {
  const key = header.toLowerCase();
  const actual = record.request_headers?.[key];
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
  const examples = records.map((r) => classifyHeaderRecord(r, opts.header, opts.equals));
  const ok = examples.filter((e) => e.classification === 'OK').length;
  const overridden = examples.filter((e) => e.classification === 'OVERRIDDEN').length;
  const miss = examples.filter((e) => e.classification === 'MISS').length;
  return {
    backend: records[0]?.backend ?? 'whistle-web',
    observed: records.length,
    ok,
    overridden,
    miss,
    no_traffic: false,
    classification: overridden || miss ? 'OVERRIDDEN' : 'OK',
    events: examples,
    examples: examples.filter((e) => e.classification !== 'OK').slice(0, 5),
  };
}
```

Add method to `CapturesService`:

```ts
  async assertHeader(query: CaptureQuery, opts: HeaderAssertionOptions & { durationMs?: number }): Promise<HeaderAssertionResult> {
    const deadline = Date.now() + (opts.durationMs ?? 60_000);
    const seen = new Map<string, CaptureRecord>();
    do {
      const result = await this.find(query);
      for (const item of result.items) seen.set(item.capture_id, item);
      if (seen.size > 0 && Date.now() >= deadline) break;
      if (Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 1000));
    } while (Date.now() < deadline);
    return summarizeHeaderAssertion([...seen.values()], opts);
  }
```

- [ ] **Step 5: Run unit test**

Run: `npm test -- tests/unit/header-assertion.test.ts`

Expected: PASS.

- [ ] **Step 6: Register `captures assert-header` and `captures watch`**

In `src/resources/captures.ts`, add helper functions near imports:

```ts
function parseDurationMs(input: unknown): number {
  const raw = String(input ?? '60s').trim();
  if (raw.endsWith('ms')) return Math.max(0, Number(raw.slice(0, -2)));
  if (raw.endsWith('s')) return Math.max(0, Number(raw.slice(0, -1)) * 1000);
  return Math.max(0, Number(raw) * 1000);
}

function splitHeaderPair(pair: string): { header: string; equals: string } {
  const idx = pair.indexOf('=');
  if (idx <= 0) throw new CliError({ code: 'UNSUPPORTED_OPERATION', message: 'Expected header pair in key=value format' });
  return { header: pair.slice(0, idx), equals: pair.slice(idx + 1) };
}
```

Add commands before `diff`:

```ts
  captures
    .command('assert-header')
    .description('Observe captures and assert a request header value')
    .requiredOption('--host <host>', 'Filter by host')
    .option('--path <path>', 'Filter by request path substring')
    .requiredOption('--header <name>', 'Request header name')
    .requiredOption('--equals <value>', 'Expected request header value')
    .option('--duration <duration>', 'Observation duration, e.g. 60s', '60s')
    .option('--backend <backend>', 'Capture backend: auto|whistle-web|runtime', 'auto')
    .action(async (cmdOpts: any) => {
      const opts = program.opts();
      const format = (opts.format ?? 'json') as OutputFormat;
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'assert-header';
      try {
        const result = await service.assertHeader(
          {
            instance_id: resolved.id,
            backend: cmdOpts.backend,
            filters: { host: String(cmdOpts.host), path: cmdOpts.path ? String(cmdOpts.path) : undefined },
            limit: 200,
          },
          { header: String(cmdOpts.header), equals: String(cmdOpts.equals), durationMs: parseDurationMs(cmdOpts.duration) },
        );
        const env = okEnvelope('captures', action, result, { instance: resolved, effective: result.classification === 'OK' });
        process.stdout.write(renderEnvelope(env, format));
        if (result.classification !== 'OK') process.exitCode = 1;
      } catch (e) {
        const err = CliError.fromUnknown(e);
        process.stderr.write(renderEnvelope(errorEnvelope('captures', action, err, { instance: resolved }), format));
        process.exitCode = 1;
      }
    });

  captures
    .command('watch')
    .description('Observe captures and emit header assertion events')
    .requiredOption('--host <host>', 'Filter by host')
    .option('--path <path>', 'Filter by request path substring')
    .requiredOption('--expect-header <k=v>', 'Expected request header pair')
    .option('--duration <duration>', 'Observation duration, e.g. 60s', '60s')
    .option('--watch', 'Keep watching until interrupted')
    .option('--backend <backend>', 'Capture backend: auto|whistle-web|runtime', 'auto')
    .action(async (cmdOpts: any) => {
      const opts = program.opts();
      const format = (opts.format ?? 'ndjson') as OutputFormat;
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'watch';
      if (format !== 'ndjson') {
        const err = new CliError({ code: 'UNSUPPORTED_OPERATION', message: '`captures watch` requires --format ndjson' });
        process.stderr.write(renderEnvelope(errorEnvelope('captures', action, err, { instance: resolved }), 'json'));
        process.exitCode = 1;
        return;
      }
      const expected = splitHeaderPair(String(cmdOpts.expectHeader));
      let finalClassification = 'OK';
      do {
        const result = await service.assertHeader(
          {
            instance_id: resolved.id,
            backend: cmdOpts.backend,
            filters: { host: String(cmdOpts.host), path: cmdOpts.path ? String(cmdOpts.path) : undefined },
            limit: 200,
          },
          { ...expected, durationMs: parseDurationMs(cmdOpts.duration) },
        );
        for (const event of result.events) {
          process.stdout.write(renderEnvelope(okEnvelope('captures', action, event, { instance: resolved, event: 'capture' }), 'ndjson'));
        }
        process.stdout.write(renderEnvelope(okEnvelope('captures', action, result, { instance: resolved, event: 'end' }), 'ndjson'));
        finalClassification = result.classification;
      } while (cmdOpts.watch);
      if (finalClassification !== 'OK') process.exitCode = 1;
    });
```

- [ ] **Step 7: Add integration tests**

Create `tests/integration/us3-header-assertion.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { runCli } from './us1-bootstrap.fixtures';
import { makeTempDir } from './us2-rules.fixtures';
import { startFakeCaptureBackend } from './us3-captures.fixtures';

describe('header assertion commands', () => {
  it('captures assert-header succeeds when native request header matches', async () => {
    const stateDir = await makeTempDir('whistle-cli-header-assert-');
    const backend = await startFakeCaptureBackend();
    try {
      const res = await runCli(
        ['--instance', 'dummy', 'captures', 'assert-header', '--host', 'example.com', '--header', 'x-env', '--equals', 'staging', '--duration', '0s', '--format', 'json'],
        { env: { WHISTLE_CLI_STATE_DIR: stateDir, WHISTLE_CLI_RUNTIME_URL: backend.baseUrl } },
      );
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain('"classification":"OK"');
      expect(res.stdout).toContain('"ok":1');
    } finally {
      await backend.close();
    }
  });

  it('captures assert-header fails with overridden when header value differs', async () => {
    const stateDir = await makeTempDir('whistle-cli-header-assert-');
    const backend = await startFakeCaptureBackend();
    try {
      const res = await runCli(
        ['--instance', 'dummy', 'captures', 'assert-header', '--host', 'example.com', '--header', 'x-env', '--equals', 'prod', '--duration', '0s', '--format', 'json'],
        { env: { WHISTLE_CLI_STATE_DIR: stateDir, WHISTLE_CLI_RUNTIME_URL: backend.baseUrl } },
      );
      expect(res.exitCode).not.toBe(0);
      expect(res.stdout).toContain('"classification":"OVERRIDDEN"');
      expect(res.stdout).toContain('"actual":"x-env=staging"');
    } finally {
      await backend.close();
    }
  });
});
```

- [ ] **Step 8: Run tests**

Run: `npm test -- tests/unit/header-assertion.test.ts tests/integration/us3-header-assertion.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/domain/captures-model.ts src/domain/captures-service.ts src/resources/captures.ts tests/unit/header-assertion.test.ts tests/integration/us3-header-assertion.test.ts
git commit -m "feat: assert request headers in captures"
```

## Task 5: Rule Header Conflict Diagnostics

**Files:**
- Modify: `src/domain/rules-model.ts`
- Modify: `src/domain/rules-service.ts`
- Modify: `src/resources/rules.ts`
- Test: `tests/unit/rules-conflicts.test.ts`
- Test: `tests/integration/us2-rules-conflicts.test.ts`

- [ ] **Step 1: Write failing unit tests for conflict diagnosis**

Create `tests/unit/rules-conflicts.test.ts`:

```ts
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
});
```

- [ ] **Step 2: Run failing unit test**

Run: `npm test -- tests/unit/rules-conflicts.test.ts`

Expected: FAIL because helper does not exist.

- [ ] **Step 3: Add conflict model types**

Append to `src/domain/rules-model.ts`:

```ts
export interface HeaderRuleMatch {
  line: number;
  pattern: string;
  header: string;
  value: string;
  raw: string;
}

export interface HeaderConflictDiagnostic {
  header: string;
  url: string;
  conflict: boolean;
  matches: HeaderRuleMatch[];
  recommendation?: string;
}
```

- [ ] **Step 4: Implement conflict parser**

Modify imports in `src/domain/rules-service.ts`:

```ts
import type { HeaderConflictDiagnostic, HeaderRuleMatch, RuntimeDefaultRules, RuntimeDefaultRulesApplyResult, RuleSet } from './rules-model';
```

Add exported helper near other pure helpers:

```ts
function parseReqHeadersPayload(payload: string): Array<{ key: string; value: string }> {
  return payload.split('&').map((part) => {
    const idx = part.indexOf('=');
    return { key: idx >= 0 ? part.slice(0, idx).toLowerCase() : part.toLowerCase(), value: idx >= 0 ? part.slice(idx + 1) : '' };
  });
}

function patternMatchesUrl(pattern: string, targetUrl: string): boolean {
  if (pattern.startsWith('/') && pattern.lastIndexOf('/') > 0) {
    const last = pattern.lastIndexOf('/');
    const body = pattern.slice(1, last);
    const flags = pattern.slice(last + 1);
    try {
      return new RegExp(body, flags).test(targetUrl);
    } catch {
      return false;
    }
  }
  if (/^https?:\/\//i.test(pattern)) return targetUrl.startsWith(pattern);
  try {
    const url = new URL(targetUrl);
    return targetUrl.includes(pattern) || url.host === pattern || `${url.host}${url.pathname}`.includes(pattern);
  } catch {
    return targetUrl.includes(pattern);
  }
}

export function diagnoseHeaderConflictsFromText(text: string, opts: { header: string; url: string }): HeaderConflictDiagnostic {
  const header = opts.header.toLowerCase();
  const matches: HeaderRuleMatch[] = [];
  const lines = normalizeEol(text).split('\n');
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const parts = trimmed.split(/\s+/);
    const pattern = parts[0] ?? '';
    const op = parts.find((p) => p.startsWith('reqHeaders://'));
    if (!pattern || !op || !patternMatchesUrl(pattern, opts.url)) return;
    const payload = op.slice('reqHeaders://'.length);
    for (const pair of parseReqHeadersPayload(payload)) {
      if (pair.key === header) {
        matches.push({ line: index + 1, pattern, header: opts.header, value: pair.value, raw: line });
      }
    }
  });
  return {
    header: opts.header,
    url: opts.url,
    conflict: matches.length > 1,
    matches,
    recommendation:
      matches.length > 1
        ? 'Multiple matching rules set the same request header. Use a more specific matcher, remove stale rules, or make broad rules mutually exclusive.'
        : undefined,
  };
}
```

Add method to `RulesService`:

```ts
  async diagnoseHeaderConflicts(opts: { header: string; url: string; instanceId?: string }): Promise<HeaderConflictDiagnostic> {
    const runtime = await this.getRuntimeDefaultRules(opts.instanceId);
    return diagnoseHeaderConflictsFromText(runtime.source_text, { header: opts.header, url: opts.url });
  }
```

- [ ] **Step 5: Run unit test**

Run: `npm test -- tests/unit/rules-conflicts.test.ts`

Expected: PASS.

- [ ] **Step 6: Register `rules diagnose-conflicts`**

In `src/resources/rules.ts`, add before `rules.command('verify')`:

```ts
  rules
    .command('diagnose-conflicts')
    .description('Diagnose matching reqHeaders rules for a URL and header')
    .requiredOption('--header <name>', 'Request header name')
    .requiredOption('--url <url>', 'Target URL to test against rules')
    .action(async (cmdOpts: { header: string; url: string }) => {
      const opts = program.opts();
      const format = opts.format ?? 'json';
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'diagnose-conflicts';
      try {
        const data = await service.diagnoseHeaderConflicts({ header: cmdOpts.header, url: cmdOpts.url, instanceId: resolved.id });
        process.stdout.write(renderEnvelope(okEnvelope('rules', action, data, { instance: resolved, effective: !data.conflict }), format));
        if (data.conflict) process.exitCode = 1;
      } catch (e) {
        const err = CliError.fromUnknown(e);
        process.stderr.write(renderEnvelope(errorEnvelope('rules', action, err, { instance: resolved }), format));
        process.exitCode = 1;
      }
    });
```

- [ ] **Step 7: Add integration test**

Create `tests/integration/us2-rules-conflicts.test.ts`:

```ts
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli } from './us1-bootstrap.fixtures';
import { startFakeCaptureBackend } from './us3-captures.fixtures';

describe('rules diagnose-conflicts', () => {
  it('reports conflicts from runtime default rules', async () => {
    const backend = await startFakeCaptureBackend();
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'whistle-cli-conflicts-'));
    const file = path.join(dir, 'rules.txt');
    await fs.writeFile(
      file,
      '/^https:\\/\\/example\\.com\\// reqHeaders://x-env=wide\n/\\/api\\/widgets\\/[^/]+\\/trigger/ reqHeaders://x-env=specific\n',
      'utf8',
    );
    try {
      await runCli(['--instance', 'dummy', 'rules', 'default', 'apply', '--file', file, '--apply', '--verify', '--format', 'json'], {
        env: { WHISTLE_CLI_RUNTIME_URL: backend.baseUrl },
      });
      const res = await runCli(
        ['--instance', 'dummy', 'rules', 'diagnose-conflicts', '--header', 'x-env', '--url', 'https://example.com/api/widgets/123/trigger', '--format', 'json'],
        { env: { WHISTLE_CLI_RUNTIME_URL: backend.baseUrl } },
      );
      expect(res.exitCode).not.toBe(0);
      expect(res.stdout).toContain('"conflict":true');
      expect(res.stdout).toContain('"value":"wide"');
      expect(res.stdout).toContain('"value":"specific"');
    } finally {
      await backend.close();
    }
  });
});
```

- [ ] **Step 8: Run tests**

Run: `npm test -- tests/unit/rules-conflicts.test.ts tests/integration/us2-rules-conflicts.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/domain/rules-model.ts src/domain/rules-service.ts src/resources/rules.ts tests/unit/rules-conflicts.test.ts tests/integration/us2-rules-conflicts.test.ts
git commit -m "feat: diagnose header rule conflicts"
```

## Task 6: Runtime Header Shortcut

**Files:**
- Modify: `src/shortcuts/rules.ts`
- Test: `tests/integration/us2-runtime-set-header.test.ts`

- [ ] **Step 1: Write failing shortcut integration test**

Create `tests/integration/us2-runtime-set-header.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { runCli } from './us1-bootstrap.fixtures';
import { makeTempDir } from './us2-rules.fixtures';
import { startFakeCaptureBackend } from './us3-captures.fixtures';

describe('rule set-header runtime flow', () => {
  it('applies a header rule to runtime default rules and verifies live traffic', async () => {
    const stateDir = await makeTempDir('whistle-cli-runtime-set-header-');
    const backend = await startFakeCaptureBackend();
    try {
      const res = await runCli(
        [
          '--instance',
          'dummy',
          'rule',
          'set-header',
          '--match',
          '/^https:\\/\\/example\\.com\\//',
          '--header',
          'x-env=staging',
          '--apply',
          '--runtime-default',
          '--verify-live',
          '--duration',
          '0s',
          '--format',
          'json',
        ],
        { env: { WHISTLE_CLI_STATE_DIR: stateDir, WHISTLE_CLI_RUNTIME_URL: backend.baseUrl } },
      );
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain('"action":"set-header"');
      expect(res.stdout).toContain('"runtime"');
      expect(res.stdout).toContain('"live_verification"');
      expect(res.stdout).toContain('"classification":"OK"');
    } finally {
      await backend.close();
    }
  });
});
```

- [ ] **Step 2: Run failing test**

Run: `npm test -- tests/integration/us2-runtime-set-header.test.ts`

Expected: FAIL because shortcut flags are not registered.

- [ ] **Step 3: Update shortcut imports and service construction**

Modify imports in `src/shortcuts/rules.ts`:

```ts
import { CapturesService } from '../domain/captures-service';
```

After `const rules = new RulesService();`, add:

```ts
  const captures = new CapturesService();
```

- [ ] **Step 4: Add shortcut flags**

In `rule.set-header` command chain, add:

```ts
    .option('--runtime-default', 'Apply to runtime default rules through Whistle Web API')
    .option('--verify-live', 'Observe matching captures and assert the header was injected')
    .option('--duration <duration>', 'Live verification duration, e.g. 60s', '60s')
```

Extend action type:

```ts
        runtimeDefault?: boolean;
        verifyLive?: boolean;
        duration?: string;
```

- [ ] **Step 5: Add local helper functions**

Add near `buildRuleLine`:

```ts
function parseDurationMs(input: unknown): number {
  const raw = String(input ?? '60s').trim();
  if (raw.endsWith('ms')) return Math.max(0, Number(raw.slice(0, -2)));
  if (raw.endsWith('s')) return Math.max(0, Number(raw.slice(0, -1)) * 1000);
  return Math.max(0, Number(raw) * 1000);
}

function hostFromMatch(match: string): string | undefined {
  const unescaped = match.replace(/\\\//g, '/').replace(/\\\./g, '.');
  const m = unescaped.match(/https:\/\/([^/\\]+)/);
  return m?.[1];
}
```

- [ ] **Step 6: Implement runtime-default branch**

Inside set-header action, after `const ruleLine = ...`, before existing `executor.execute`, add:

```ts
          if (cmdOpts.runtimeDefault) {
            const current = await rules.getRuntimeDefaultRules(resolved.id);
            const next = `${current.source_text.trimEnd()}\n${ruleLine}`;
            const runtime = await rules.applyRuntimeDefaultRules(next, resolved.id, { verify: Boolean(cmdOpts.verify) });
            let live_verification: unknown;
            if (cmdOpts.verifyLive) {
              const firstHeader = cmdOpts.header[0];
              const idx = firstHeader.indexOf('=');
              const header = firstHeader.slice(0, idx);
              const equals = firstHeader.slice(idx + 1);
              const host = hostFromMatch(cmdOpts.match);
              if (!host) {
                throw new CliError({
                  code: 'UNSUPPORTED_OPERATION',
                  message: '--verify-live requires a match pattern containing an https:// host',
                });
              }
              live_verification = await captures.assertHeader(
                { instance_id: resolved.id, filters: { host }, limit: 200 },
                { header, equals, durationMs: parseDurationMs(cmdOpts.duration) },
              );
            }
            process.stdout.write(
              renderEnvelope(
                okEnvelope('rules', action, { runtime, live_verification }, {
                  instance: resolved,
                  effective: !live_verification || (live_verification as any).classification === 'OK',
                  meta: { verified: Boolean(cmdOpts.verify), live_verified: Boolean(cmdOpts.verifyLive) },
                }),
                format,
              ),
            );
            if (live_verification && (live_verification as any).classification !== 'OK') process.exitCode = 1;
            return;
          }
```

- [ ] **Step 7: Run shortcut test**

Run: `npm test -- tests/integration/us2-runtime-set-header.test.ts`

Expected: PASS.

- [ ] **Step 8: Run shortcut regression test**

Run: `npm test -- tests/unit/us2-shortcuts-rules.test.ts`

Expected: PASS, proving storage-backed default behavior still works.

- [ ] **Step 9: Commit**

```bash
git add src/shortcuts/rules.ts tests/integration/us2-runtime-set-header.test.ts
git commit -m "feat: verify runtime set-header shortcut"
```

## Task 7: Skill Workflow Update

**Files:**
- Modify: `skills/whistle-cli/SKILL.md`
- Test: `tests/integration/skill-agent-workflow-smoke.test.ts`

- [ ] **Step 1: Write failing skill smoke expectations**

Modify `tests/integration/skill-agent-workflow-smoke.test.ts` to assert the skill includes the new workflow:

```ts
      expect(skillMd).toContain('rules default apply');
      expect(skillMd).toContain('captures assert-header');
      expect(skillMd).toContain('rules diagnose-conflicts');
      expect(skillMd).toContain('Do not edit Whistle storage files for live rule changes');
```

- [ ] **Step 2: Run failing skill smoke test**

Run: `npm test -- tests/integration/skill-agent-workflow-smoke.test.ts`

Expected: FAIL because the skill does not mention the new commands.

- [ ] **Step 3: Update skill**

In `skills/whistle-cli/SKILL.md`, add after “Safe mutation pattern”:

```md
### Runtime Header Injection Workflow

For live request-header changes, prefer runtime commands over direct storage edits:

1. Check Whistle:
   - `whistle-cli --format json instance status`
2. Prepare complete runtime rules in a file.
3. Apply and verify runtime default rules:
   - `whistle-cli --format json rules default apply --file ./rules.txt --apply --verify`
4. Assert live traffic receives the header:
   - `whistle-cli --format json captures assert-header --host app.example.com --header env --equals pre_release --duration 60s`
5. If the assertion reports `OVERRIDDEN`, diagnose matching rules:
   - `whistle-cli --format json rules diagnose-conflicts --header env --url https://app.example.com/api/example`
6. Use continuous monitoring only when a human is actively debugging:
   - `whistle-cli --format ndjson captures watch --host app.example.com --expect-header env=pre_release --watch`

Do not edit Whistle storage files for live rule changes unless the CLI runtime commands are unavailable and the user explicitly accepts that Whistle may need a reload.
```

- [ ] **Step 4: Run skill smoke test**

Run: `npm test -- tests/integration/skill-agent-workflow-smoke.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add skills/whistle-cli/SKILL.md tests/integration/skill-agent-workflow-smoke.test.ts
git commit -m "docs: update whistle skill runtime workflow"
```

## Task 8: Final Verification

**Files:**
- No code changes expected.

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm test -- \
  tests/unit/whistle-web-client.test.ts \
  tests/unit/captures-native.test.ts \
  tests/unit/header-assertion.test.ts \
  tests/unit/rules-conflicts.test.ts \
  tests/integration/us2-runtime-rules.test.ts \
  tests/integration/us2-rules-conflicts.test.ts \
  tests/integration/us2-runtime-set-header.test.ts \
  tests/integration/us3-captures.test.ts \
  tests/integration/us3-header-assertion.test.ts \
  tests/integration/skill-agent-workflow-smoke.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full test suite**

Run: `npm test`

Expected: PASS.

- [ ] **Step 3: Run build**

Run: `npm run build`

Expected: PASS and `dist/cli/index.js` exists with executable bit.

- [ ] **Step 4: Check git status and log**

Run:

```bash
git status --short
git log --oneline -8
```

Expected: clean working tree and task commits visible.

- [ ] **Step 5: Commit any verification-only doc corrections**

If verification required test expectation or documentation corrections, commit them:

```bash
git add <changed-files>
git commit -m "test: finalize runtime verification workflow"
```

If no files changed, skip this step.

## Self-Review

- Spec coverage: runtime default rules are covered by Task 2; Whistle Web capture backend by Task 3; header assertion/watch by Task 4; conflict diagnosis by Task 5; shortcut workflow by Task 6; skill guidance by Task 7; verification by Task 8.
- Placeholder scan: no placeholder tasks remain; each implementation task includes concrete files, commands, expected outcomes, and code snippets.
- Type consistency: `WhistleWebClient`, `RuntimeDefaultRules`, `CaptureBackend`, `HeaderAssertionResult`, and `HeaderConflictDiagnostic` are introduced before use in later tasks.
