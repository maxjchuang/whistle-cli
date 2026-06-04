# Whistle Web Safe Header Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe Whistle Web header handoff workflow that captures selected request headers into local files without printing sensitive values.

**Architecture:** Extend the existing captures domain and CLI resource. The domain service finds matching captures and returns selected header values plus safe metadata; the CLI resource writes files and strips values before rendering output. Existing `get-header` behavior stays compatible unless save or redaction options are used.

**Tech Stack:** TypeScript 5.x, Node.js 20, commander, Vitest integration tests, existing fake Whistle Web backend.

---

## Source Map

- Modify `src/output/errors.ts`
  - Add `CAPTURE_HEADERS_MISSING` to the stable error code union.
- Modify `src/domain/captures-model.ts`
  - Add types for capture header workflow options, selected header values, safe header metadata, and result objects.
- Modify `src/domain/captures-service.ts`
  - Export shared header lookup and dump-count helpers.
  - Add `captureHeaders` polling workflow.
  - Add richer Whistle Web not-found diagnostics.
- Modify `src/resources/captures.ts`
  - Add file-writing helpers for raw values, JSON values, and dotenv values.
  - Add `captures capture-headers`.
  - Add safe output options to `captures get-header`.
- Modify `tests/integration/us3-captures.test.ts`
  - Add integration tests for safe workflow, safe `get-header`, missing headers, and diagnostics.
- Modify `README.md`
  - Document safe header handoff workflow and retry guidance.
- Modify `skills/whistle-cli/SKILL.md`
  - Update agent guidance to prefer `capture-headers` for sensitive header handoff.

---

### Task 1: Add Domain Types And Error Code

**Files:**
- Modify: `src/output/errors.ts`
- Modify: `src/domain/captures-model.ts`

- [ ] **Step 1: Add the error code**

In `src/output/errors.ts`, add `CAPTURE_HEADERS_MISSING` after `NO_CAPTURE_MATCH`:

```ts
  | 'NO_CAPTURE_MATCH'
  | 'CAPTURE_HEADERS_MISSING'
  | 'CAPTURE_BACKEND_UNAVAILABLE'
```

- [ ] **Step 2: Add capture header workflow types**

In `src/domain/captures-model.ts`, add these interfaces after `CaptureHeaderResult`:

```ts
export interface CaptureHeaderSelection {
  header: string;
  value: string;
}

export interface CaptureHeaderPresence {
  present: boolean;
}

export interface CaptureHeadersOptions {
  headers: string[];
  timeoutMs?: number;
  pollIntervalMs?: number;
  allowExisting?: boolean;
}

export interface CaptureHeadersResult {
  capture_id: string;
  backend: CaptureBackend;
  method?: string;
  host?: string;
  path?: string;
  headers: Record<string, CaptureHeaderPresence>;
  values: CaptureHeaderSelection[];
  scanned: number;
  matched: number;
}
```

- [ ] **Step 3: Run TypeScript build**

Run:

```bash
npm run build
```

Expected: PASS because the new types are exported but not yet referenced.

- [ ] **Step 4: Commit**

Run:

```bash
git add src/output/errors.ts src/domain/captures-model.ts
git commit -m "feat(captures): add safe header handoff types"
```

---

### Task 2: Implement `captureHeaders` In The Domain Service

**Files:**
- Modify: `src/domain/captures-service.ts`

- [ ] **Step 1: Import the new model types**

In `src/domain/captures-service.ts`, extend the existing type import:

```ts
  CaptureHeadersOptions,
  CaptureHeadersResult,
```

- [ ] **Step 2: Export dump-count and header lookup helpers**

Replace the existing private `getHeaderValue` declaration with:

```ts
export function getCaptureHeaderValue(
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

function getHeaderValue(
  headers: Record<string, string> | undefined,
  header: string,
): string | undefined {
  return getCaptureHeaderValue(headers, header);
}

export function whistleWebDumpCountForLimit(limit: number): number {
  return Math.min(Math.max(limit * 5, 100), 1000);
}
```

Then replace both local dump-count expressions in `readWhistleWebCaptures` and `getViaWhistleWeb`:

```ts
const dumpCount = whistleWebDumpCountForLimit(limit);
```

- [ ] **Step 3: Add a candidate helper inside `CapturesService`**

Add this private method before `assertHeader`:

```ts
  private selectedHeaders(
    record: CaptureRecord,
    headers: string[],
  ): { complete: boolean; values: Array<{ header: string; value: string }>; missing: string[] } {
    const values: Array<{ header: string; value: string }> = [];
    const missing: string[] = [];
    for (const header of headers) {
      const value = getHeaderValue(record.request_headers, header);
      if (value == null) {
        missing.push(header);
      } else {
        values.push({ header, value });
      }
    }
    return { complete: missing.length === 0, values, missing };
  }
```

- [ ] **Step 4: Add `captureHeaders`**

Add this method before `assertHeader`:

```ts
  async captureHeaders(
    query: CaptureQuery,
    opts: CaptureHeadersOptions,
  ): Promise<CaptureHeadersResult> {
    const headers = opts.headers.map((header) => header.trim()).filter(Boolean);
    if (headers.length === 0) {
      throw new CliError({
        code: 'UNSUPPORTED_OPERATION',
        message: 'At least one request header is required',
        suggested_fix: 'Use --headers cookie,x-csrftoken.',
      });
    }

    const timeoutMs = opts.timeoutMs ?? 60_000;
    const pollIntervalMs = Math.max(50, opts.pollIntervalMs ?? 1000);
    const deadline = Date.now() + timeoutMs;
    const baselineResult = await this.find(query);
    const baseline = new Set(baselineResult.items.map((item) => item.capture_id));
    let scanned = baselineResult.items.length;
    let matched = 0;
    let lastMissing: string[] = headers;
    let lastCaptureId: string | undefined;

    const inspect = (items: CaptureRecord[]): CaptureHeadersResult | undefined => {
      for (const item of items) {
        scanned++;
        if (!opts.allowExisting && baseline.has(item.capture_id)) continue;
        const selected = this.selectedHeaders(item, headers);
        matched++;
        lastCaptureId = item.capture_id;
        if (!selected.complete) {
          lastMissing = selected.missing;
          continue;
        }
        const presence = Object.fromEntries(
          headers.map((header) => [header, { present: true }]),
        ) as CaptureHeadersResult['headers'];
        return {
          capture_id: item.capture_id,
          backend: item.backend ?? (query.backend === 'runtime' ? 'runtime' : 'whistle-web'),
          method: item.method,
          host: item.host,
          path: item.path,
          headers: presence,
          values: selected.values,
          scanned,
          matched,
        };
      }
      return undefined;
    };

    if (opts.allowExisting) {
      const existing = inspect(baselineResult.items);
      if (existing) return existing;
    }

    do {
      const result = await this.find(query);
      const found = inspect(result.items);
      if (found) return found;
      const remainingMs = deadline - Date.now();
      if (remainingMs > 0) {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(pollIntervalMs, remainingMs)),
        );
      }
    } while (Date.now() < deadline);

    if (matched > 0) {
      throw new CliError({
        code: 'CAPTURE_HEADERS_MISSING',
        message: 'Matching captures were found, but required request headers were missing',
        reason: `missing_headers=${lastMissing.join(',')}; capture_id=${lastCaptureId ?? 'unknown'}; scanned=${scanned}`,
        suggested_fix:
          'Confirm the requested header names, re-trigger the browser request, or broaden the host/path filters.',
      });
    }

    throw new CliError({
      code: 'NO_CAPTURE_MATCH',
      message: 'No matching capture was found while waiting for request headers',
      reason: `scanned=${scanned}`,
      suggested_fix:
        'Re-trigger the target browser request while the command is running, or use --allow-existing if reusing a recent request is intended.',
    });
  }
```

- [ ] **Step 5: Run TypeScript build**

Run:

```bash
npm run build
```

Expected: PASS. No CLI code calls the new method yet, but the service must type-check.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/domain/captures-service.ts
git commit -m "feat(captures): add safe header capture service"
```

---

### Task 3: Add CLI File Writers And `capture-headers`

**Files:**
- Modify: `src/resources/captures.ts`
- Test: `tests/integration/us3-captures.test.ts`

- [ ] **Step 1: Add baseline/new-capture test**

Append this test inside `tests/integration/us3-captures.test.ts`:

```ts
  it('captures capture-headers ignores baseline captures by default and saves only a new match', async () => {
    const stateDir = await makeTempDir('whistle-cli-us3-state-');
    const baseline = {
      old_session: {
        id: 'old_session',
        url: 'https://app.example.com/api/session',
        req: {
          method: 'GET',
          headers: {
            host: 'app.example.com',
            cookie: 'session=old',
            'x-csrftoken': 'csrf-old',
          },
        },
        res: { statusCode: 200 },
      },
    };
    const next = {
      ...baseline,
      new_session: {
        id: 'new_session',
        url: 'https://app.example.com/api/session',
        req: {
          method: 'GET',
          headers: {
            host: 'app.example.com',
            cookie: 'session=new',
            'x-csrftoken': 'csrf-new',
          },
        },
        res: { statusCode: 200 },
      },
    };
    const backend = await startFakeCaptureBackend({
      disableCaptureRuntimeRoutes: true,
      nativeCaptureSequence: [baseline, next, next],
    });
    try {
      const envPath = path.join(stateDir, 'headers.env');
      const res = await runCli(
        [
          '--instance',
          'dummy',
          'captures',
          'capture-headers',
          '--backend',
          'whistle-web',
          '--host',
          'app.example.com',
          '--path',
          '/api/session',
          '--headers',
          'cookie,x-csrftoken',
          '--timeout',
          '1s',
          '--poll-interval',
          '50ms',
          '--save-env',
          envPath,
          '--format',
          'json',
        ],
        {
          env: {
            WHISTLE_CLI_STATE_DIR: stateDir,
            WHISTLE_CLI_RUNTIME_URL: backend.baseUrl,
          },
        },
      );
      expect(res.exitCode).toBe(0);
      const envelope = JSON.parse(res.stdout);
      expect(envelope.data.capture_id).toBe('new_session');
      expect(JSON.stringify(envelope)).not.toContain('session=new');
      expect(JSON.stringify(envelope)).not.toContain('csrf-new');
      const saved = await fs.readFile(envPath, 'utf8');
      expect(saved).toContain("COOKIE='session=new'");
      expect(saved).toContain("X_CSRFTOKEN='csrf-new'");
      expect(saved).not.toContain('session=old');
    } finally {
      await backend.close();
    }
  });
```

- [ ] **Step 2: Add missing-header no-partial-file test**

Append this test inside `tests/integration/us3-captures.test.ts`:

```ts
  it('captures capture-headers reports missing requested headers without writing partial files', async () => {
    const stateDir = await makeTempDir('whistle-cli-us3-state-');
    const backend = await startFakeCaptureBackend({
      disableCaptureRuntimeRoutes: true,
      nativeCaptureSequence: [
        {},
        {
          missing_header_cap: {
            id: 'missing_header_cap',
            url: 'https://app.example.com/api/session',
            req: {
              method: 'GET',
              headers: {
                host: 'app.example.com',
                cookie: 'session=abc',
              },
            },
            res: { statusCode: 200 },
          },
        },
      ],
    });
    try {
      const envPath = path.join(stateDir, 'headers.env');
      const res = await runCli(
        [
          '--instance',
          'dummy',
          'captures',
          'capture-headers',
          '--backend',
          'whistle-web',
          '--host',
          'app.example.com',
          '--path',
          '/api/session',
          '--headers',
          'cookie,x-csrftoken',
          '--timeout',
          '200ms',
          '--poll-interval',
          '50ms',
          '--save-env',
          envPath,
          '--format',
          'json',
        ],
        {
          env: {
            WHISTLE_CLI_STATE_DIR: stateDir,
            WHISTLE_CLI_RUNTIME_URL: backend.baseUrl,
          },
        },
      );
      expect(res.exitCode).not.toBe(0);
      expect(res.stderr).toContain('"code":"CAPTURE_HEADERS_MISSING"');
      expect(res.stderr).toContain('x-csrftoken');
      await expect(fs.access(envPath)).rejects.toThrow();
    } finally {
      await backend.close();
    }
  });
```

- [ ] **Step 3: Run the capture-headers tests and verify CLI failures**

Run:

```bash
npm test -- tests/integration/us3-captures.test.ts -t "ignores baseline captures|reports missing requested headers"
```

Expected: FAIL because the command is not registered or file writing is absent.

- [ ] **Step 4: Import service helpers**

Update the import from `../domain/captures-service` in `src/resources/captures.ts`:

```ts
import {
  CapturesService,
  filterNewHeaderAssertionEvents,
  whistleWebDumpCountForLimit,
} from '../domain/captures-service';
```

- [ ] **Step 5: Add parser and file writer helpers**

Add these helpers after `writeJsonFile`:

```ts
function splitCsv(input: unknown): string[] {
  return String(input ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function envKeyForHeader(header: string): string {
  return header
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parseEnvMap(input: unknown): Map<string, string> {
  const map = new Map<string, string>();
  if (input == null) return map;
  for (const pair of splitCsv(input)) {
    const idx = pair.indexOf('=');
    if (idx <= 0 || idx === pair.length - 1) {
      throw new CliError({
        code: 'UNSUPPORTED_OPERATION',
        message: 'Expected env map entries in header=ENV_KEY format',
        suggested_fix: 'Use --env-map cookie=DEVOPS_COOKIE,x-csrftoken=DEVOPS_CSRF.',
      });
    }
    map.set(pair.slice(0, idx).toLowerCase(), pair.slice(idx + 1));
  }
  return map;
}

function escapeDotenvValue(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function writeTextFile(file: unknown, value: string): string | undefined {
  if (!file) return undefined;
  const filePath = String(file);
  writeFileSync(filePath, value, 'utf8');
  return filePath;
}

function writeHeaderEnvFile(
  file: unknown,
  values: Array<{ header: string; value: string }>,
  envMap?: Map<string, string>,
): string | undefined {
  if (!file) return undefined;
  const lines = values.map(({ header, value }) => {
    const key = envMap?.get(header.toLowerCase()) ?? envKeyForHeader(header);
    return `${key}=${escapeDotenvValue(value)}`;
  });
  return writeTextFile(file, `${lines.join('\n')}\n`);
}

function writeHeaderJsonFile(
  file: unknown,
  values: Array<{ header: string; value: string }>,
): string | undefined {
  if (!file) return undefined;
  const payload = Object.fromEntries(values.map(({ header, value }) => [header, value]));
  return writeJsonFile(file, payload);
}

function savedPaths(...paths: Array<string | undefined>): string[] | undefined {
  const out = paths.filter((path): path is string => Boolean(path));
  return out.length ? out : undefined;
}
```

- [ ] **Step 6: Add command option type**

Add this type near the existing capture option types:

```ts
type CaptureHeadersCommandOptions = CaptureFindOptions & {
  headers: string;
  timeout?: string;
  pollInterval?: string;
  allowExisting?: boolean;
  saveEnv?: string;
  saveJson?: string;
  envMap?: string;
};
```

- [ ] **Step 7: Register `captures capture-headers`**

Add this command before `assert-request` in `registerCapturesResource`:

```ts
  captures
    .command('capture-headers')
    .description('Capture selected request headers into local files without printing values')
    .option('--host <host>', 'Filter by host')
    .option('--path <path>', 'Filter by request path substring')
    .option('--method <method>', 'Filter by HTTP method')
    .option('--status <status>', 'Filter by status code')
    .option('--keyword <keyword>', 'Search keyword')
    .option('--limit <n>', 'Recent Whistle Web records to inspect', '200')
    .requiredOption('--headers <headers>', 'Comma-separated request header names')
    .option('--timeout <duration>', 'Observation timeout, e.g. 60s', '60s')
    .option('--poll-interval <duration>', 'Polling interval, e.g. 1s', '1s')
    .option('--allow-existing', 'Allow using a capture already present when the command starts')
    .option('--save-env <file>', 'Write selected headers as dotenv assignments')
    .option('--save-json <file>', 'Write selected headers as JSON')
    .option('--env-map <pairs>', 'Comma-separated header=ENV_KEY overrides')
    .option('--backend <backend>', 'Capture backend: whistle-web', 'whistle-web')
    .action(async (cmdOpts: CaptureHeadersCommandOptions) => {
      const opts = program.opts();
      const format = (opts.format ?? 'json') as OutputFormat;
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'capture-headers';
      try {
        const backend = assertCaptureBackend(cmdOpts.backend ?? 'whistle-web');
        if (backend !== 'whistle-web') {
          throw new CliError({
            code: 'UNSUPPORTED_OPERATION',
            message: 'captures capture-headers only supports the whistle-web backend',
            suggested_fix: 'Use --backend whistle-web for browser-driven capture handoff.',
          });
        }
        if (!cmdOpts.saveEnv && !cmdOpts.saveJson) {
          throw new CliError({
            code: 'UNSUPPORTED_OPERATION',
            message: 'captures capture-headers requires a save target',
            suggested_fix: 'Use --save-env <file> or --save-json <file>.',
          });
        }
        const headers = splitCsv(cmdOpts.headers);
        const limit = Number(cmdOpts.limit ?? 200);
        const filters = {
          host: cmdOpts.host ? String(cmdOpts.host) : undefined,
          path: cmdOpts.path ? String(cmdOpts.path) : undefined,
          method: cmdOpts.method ? String(cmdOpts.method) : undefined,
          status: cmdOpts.status ? Number(cmdOpts.status) : undefined,
          keyword: cmdOpts.keyword ? String(cmdOpts.keyword) : undefined,
        };
        const result = await service.captureHeaders(
          { instance_id: resolved.id, filters, limit, backend },
          {
            headers,
            timeoutMs: parseDurationMs(cmdOpts.timeout),
            pollIntervalMs: parseDurationMs(cmdOpts.pollInterval),
            allowExisting: Boolean(cmdOpts.allowExisting),
          },
        );
        const envMap = parseEnvMap(cmdOpts.envMap);
        const envPath = writeHeaderEnvFile(cmdOpts.saveEnv, result.values, envMap);
        const jsonPath = writeHeaderJsonFile(cmdOpts.saveJson, result.values);
        const saved_to = savedPaths(envPath, jsonPath);
        const safeResult = {
          capture_id: result.capture_id,
          backend: result.backend,
          method: result.method,
          host: result.host,
          path: result.path,
          headers: result.headers,
          scanned: result.scanned,
          matched: result.matched,
        };
        process.stdout.write(
          renderEnvelope(
            okEnvelope(
              'captures',
              action,
              {
                ...safeResult,
                saved_to,
                dump_count: whistleWebDumpCountForLimit(limit),
              },
              { instance: resolved, effective: true },
            ),
            format,
          ),
        );
      } catch (e) {
        const err = CliError.fromUnknown(e);
        process.stderr.write(
          renderEnvelope(errorEnvelope('captures', action, err, { instance: resolved }), format),
        );
        process.exitCode = 1;
      }
    });
```

- [ ] **Step 8: Run the capture-headers tests**

Run:

```bash
npm test -- tests/integration/us3-captures.test.ts -t "capture-headers"
```

Expected: PASS for the tests added in Tasks 1 and 2.

- [ ] **Step 9: Commit**

Run:

```bash
git add src/resources/captures.ts tests/integration/us3-captures.test.ts
git commit -m "feat(captures): add safe header handoff command"
```

---

### Task 4: Add `--allow-existing`, Env Map, And JSON Save Coverage

**Files:**
- Modify: `tests/integration/us3-captures.test.ts`
- Modify: `src/resources/captures.ts` if tests expose parser bugs

- [ ] **Step 1: Add `--allow-existing` and `--env-map` test**

Append this test:

```ts
  it('captures capture-headers can use existing captures and env-map overrides', async () => {
    const stateDir = await makeTempDir('whistle-cli-us3-state-');
    const backend = await startFakeCaptureBackend({
      disableCaptureRuntimeRoutes: true,
      nativeCaptureData: {
        existing_session: {
          id: 'existing_session',
          url: 'https://app.example.com/api/session',
          req: {
            method: 'GET',
            headers: {
              host: 'app.example.com',
              cookie: "session='quoted'",
              'x-signature-key': 'sig-value',
            },
          },
          res: { statusCode: 200 },
        },
      },
    });
    try {
      const envPath = path.join(stateDir, 'headers.env');
      const jsonPath = path.join(stateDir, 'headers.json');
      const res = await runCli(
        [
          '--instance',
          'dummy',
          'captures',
          'capture-headers',
          '--backend',
          'whistle-web',
          '--host',
          'app.example.com',
          '--path',
          '/api/session',
          '--headers',
          'cookie,x-signature-key',
          '--allow-existing',
          '--save-env',
          envPath,
          '--save-json',
          jsonPath,
          '--env-map',
          'cookie=DEVOPS_COOKIE',
          '--format',
          'json',
        ],
        {
          env: {
            WHISTLE_CLI_STATE_DIR: stateDir,
            WHISTLE_CLI_RUNTIME_URL: backend.baseUrl,
          },
        },
      );
      expect(res.exitCode).toBe(0);
      const envelope = JSON.parse(res.stdout);
      expect(envelope.data.capture_id).toBe('existing_session');
      expect(envelope.data.saved_to).toEqual([envPath, jsonPath]);
      expect(JSON.stringify(envelope)).not.toContain('sig-value');
      const envFile = await fs.readFile(envPath, 'utf8');
      expect(envFile).toContain("DEVOPS_COOKIE='session='\\''quoted'\\'''");
      expect(envFile).toContain("X_SIGNATURE_KEY='sig-value'");
      const jsonFile = JSON.parse(await fs.readFile(jsonPath, 'utf8'));
      expect(jsonFile).toEqual({
        cookie: "session='quoted'",
        'x-signature-key': 'sig-value',
      });
    } finally {
      await backend.close();
    }
  });
```

- [ ] **Step 2: Run the test and verify it fails if escaping or mapping is wrong**

Run:

```bash
npm test -- tests/integration/us3-captures.test.ts -t "env-map overrides"
```

Expected: PASS if Task 3 was implemented exactly. If it fails, fix `escapeDotenvValue`, `parseEnvMap`, or save path ordering in `src/resources/captures.ts`.

- [ ] **Step 3: Add a no-save-target validation test**

Append this test:

```ts
  it('captures capture-headers rejects commands without a save target', async () => {
    const stateDir = await makeTempDir('whistle-cli-us3-state-');
    const backend = await startFakeCaptureBackend({ disableCaptureRuntimeRoutes: true });
    try {
      const res = await runCli(
        [
          '--instance',
          'dummy',
          'captures',
          'capture-headers',
          '--backend',
          'whistle-web',
          '--host',
          'example.com',
          '--headers',
          'cookie',
          '--format',
          'json',
        ],
        {
          env: {
            WHISTLE_CLI_STATE_DIR: stateDir,
            WHISTLE_CLI_RUNTIME_URL: backend.baseUrl,
          },
        },
      );
      expect(res.exitCode).not.toBe(0);
      expect(res.stderr).toContain('"code":"UNSUPPORTED_OPERATION"');
      expect(res.stderr).toContain('requires a save target');
    } finally {
      await backend.close();
    }
  });
```

- [ ] **Step 4: Run focused capture-headers tests**

Run:

```bash
npm test -- tests/integration/us3-captures.test.ts -t "capture-headers"
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/resources/captures.ts tests/integration/us3-captures.test.ts
git commit -m "test(captures): cover safe header file outputs"
```

---

### Task 5: Add Safe Save Options To `get-header`

**Files:**
- Modify: `src/resources/captures.ts`
- Modify: `tests/integration/us3-captures.test.ts`

- [ ] **Step 1: Add redacted `get-header --save-env` test**

Append this test:

```ts
  it('captures get-header saves env output without leaking the value to stdout', async () => {
    const stateDir = await makeTempDir('whistle-cli-us3-state-');
    const backend = await startFakeCaptureBackend({
      disableCaptureRuntimeRoutes: true,
      nativeCaptureData: {
        header_cap: {
          id: 'header_cap',
          url: 'https://app.example.com/api/session',
          req: {
            method: 'GET',
            headers: {
              host: 'app.example.com',
              cookie: 'session=secret',
            },
          },
          res: { statusCode: 200 },
        },
      },
    });
    try {
      const envPath = path.join(stateDir, 'one.env');
      const res = await runCli(
        [
          '--instance',
          'dummy',
          'captures',
          'get-header',
          '--backend',
          'whistle-web',
          '--id',
          'header_cap',
          '--header',
          'cookie',
          '--save-env',
          envPath,
          '--env-key',
          'DEVOPS_COOKIE',
          '--format',
          'json',
        ],
        {
          env: {
            WHISTLE_CLI_STATE_DIR: stateDir,
            WHISTLE_CLI_RUNTIME_URL: backend.baseUrl,
          },
        },
      );
      expect(res.exitCode).toBe(0);
      const envelope = JSON.parse(res.stdout);
      expect(envelope.data).toMatchObject({
        capture_id: 'header_cap',
        backend: 'whistle-web',
        header: 'cookie',
        present: true,
        redacted: true,
      });
      expect(JSON.stringify(envelope)).not.toContain('session=secret');
      await expect(fs.readFile(envPath, 'utf8')).resolves.toBe("DEVOPS_COOKIE='session=secret'\n");
    } finally {
      await backend.close();
    }
  });
```

- [ ] **Step 2: Add compatibility test for existing value output**

Append this test:

```ts
  it('captures get-header keeps value output when no safe output option is used', async () => {
    const stateDir = await makeTempDir('whistle-cli-us3-state-');
    const backend = await startFakeCaptureBackend({
      disableCaptureRuntimeRoutes: true,
      nativeCaptureData: {
        header_cap: {
          id: 'header_cap',
          url: 'https://app.example.com/api/session',
          req: {
            method: 'GET',
            headers: {
              host: 'app.example.com',
              cookie: 'session=abc',
            },
          },
          res: { statusCode: 200 },
        },
      },
    });
    try {
      const res = await runCli(
        [
          '--instance',
          'dummy',
          'captures',
          'get-header',
          '--backend',
          'whistle-web',
          '--id',
          'header_cap',
          '--header',
          'cookie',
          '--format',
          'json',
        ],
        {
          env: {
            WHISTLE_CLI_STATE_DIR: stateDir,
            WHISTLE_CLI_RUNTIME_URL: backend.baseUrl,
          },
        },
      );
      expect(res.exitCode).toBe(0);
      expect(JSON.parse(res.stdout).data.value).toBe('session=abc');
    } finally {
      await backend.close();
    }
  });
```

- [ ] **Step 3: Run the new get-header tests and verify failure**

Run:

```bash
npm test -- tests/integration/us3-captures.test.ts -t "get-header"
```

Expected: FAIL for `--save-env` because those options do not exist.

- [ ] **Step 4: Extend command option type**

Change `CaptureGetHeaderOptions` in `src/resources/captures.ts`:

```ts
type CaptureGetHeaderOptions = CaptureGetOptions & {
  header: string;
  redact?: boolean;
  saveValue?: string;
  saveEnv?: string;
  envKey?: string;
  saveJson?: string;
};
```

- [ ] **Step 5: Add get-header options**

In the `captures.command('get-header')` chain, add:

```ts
    .option('--redact', 'Do not print the header value')
    .option('--save-value <file>', 'Write the raw header value to a file')
    .option('--save-env <file>', 'Write the header value as one dotenv assignment')
    .option('--env-key <name>', 'Env key for --save-env')
    .option('--save-json <file>', 'Write the header value as JSON')
```

- [ ] **Step 6: Replace get-header success rendering**

Inside the `get-header` action, replace the current `process.stdout.write(renderEnvelope(okEnvelope(...)))` block after `const data = await service.getHeader(...)` with:

```ts
        const values = [{ header: data.header, value: data.value }];
        const rawPath = writeTextFile(cmdOpts.saveValue, data.value);
        const envPath = writeHeaderEnvFile(
          cmdOpts.saveEnv,
          values.map(({ header, value }) => ({
            header: cmdOpts.envKey ? String(cmdOpts.envKey) : header,
            value,
          })),
        );
        const jsonPath = writeHeaderJsonFile(cmdOpts.saveJson, values);
        const saved_to = savedPaths(rawPath, envPath, jsonPath);
        const shouldRedact = Boolean(cmdOpts.redact || saved_to);
        const safeData = shouldRedact
          ? {
              capture_id: data.capture_id,
              backend: data.backend,
              header: data.header,
              present: true,
              redacted: true,
              saved_to,
            }
          : data;
        process.stdout.write(
          renderEnvelope(
            okEnvelope('captures', action, safeData, { instance: resolved, effective: true }),
            format,
          ),
        );
```

- [ ] **Step 7: Run get-header tests**

Run:

```bash
npm test -- tests/integration/us3-captures.test.ts -t "get-header"
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```bash
git add src/resources/captures.ts tests/integration/us3-captures.test.ts
git commit -m "feat(captures): redact and save header values"
```

---

### Task 6: Improve Whistle Web Diagnostics

**Files:**
- Modify: `src/domain/captures-service.ts`
- Modify: `tests/integration/us3-captures.test.ts`

- [ ] **Step 1: Add not-found diagnostics test**

Append this test:

```ts
  it('captures get-header Whistle Web not-found diagnostics include scan window details', async () => {
    const stateDir = await makeTempDir('whistle-cli-us3-state-');
    const backend = await startFakeCaptureBackend({
      disableCaptureRuntimeRoutes: true,
      nativeCaptureData: {},
    });
    try {
      const res = await runCli(
        [
          '--instance',
          'dummy',
          'captures',
          'get-header',
          '--backend',
          'whistle-web',
          '--id',
          'missing',
          '--header',
          'cookie',
          '--limit',
          '25',
          '--format',
          'json',
        ],
        {
          env: {
            WHISTLE_CLI_STATE_DIR: stateDir,
            WHISTLE_CLI_RUNTIME_URL: backend.baseUrl,
          },
        },
      );
      expect(res.exitCode).not.toBe(0);
      const envelope = JSON.parse(res.stderr);
      expect(envelope.error.code).toBe('NO_CAPTURE_MATCH');
      expect(envelope.error.reason).toContain('capture_id=missing');
      expect(envelope.error.reason).toContain('limit=25');
      expect(envelope.error.reason).toContain('dump_count=125');
      expect(envelope.error.reason).toContain('scanned=0');
      expect(envelope.error.suggested_fix).toContain('--limit 1000');
    } finally {
      await backend.close();
    }
  });
```

- [ ] **Step 2: Run the diagnostics test and verify it fails**

Run:

```bash
npm test -- tests/integration/us3-captures.test.ts -t "scan window details"
```

Expected: FAIL because the current reason does not include `limit`, `dump_count`, or `scanned`.

- [ ] **Step 3: Improve `getViaWhistleWeb` diagnostics**

In `src/domain/captures-service.ts`, update `getViaWhistleWeb` to track scanned entries:

```ts
    let scanned = 0;
    for (const [id, raw] of Object.entries(res.data?.data ?? {})) {
      scanned++;
      if (!sourceCaptureIdMatches(raw, id, captureId)) continue;
      return normalizeWhistleWebCapture(raw, instanceId, id);
    }
    throw new CliError({
      code: 'NO_CAPTURE_MATCH',
      message: 'Whistle Web capture was not found',
      reason: `capture_id=${captureId}; limit=${limit}; dump_count=${dumpCount}; scanned=${scanned}`,
      suggested_fix:
        'The Whistle Web data window may have rotated. Re-run captures capture-headers or captures assert-request while triggering the request, retry with --limit 1000, or broaden export filters immediately after the target request.',
    });
```

- [ ] **Step 4: Improve `captureHeaders` timeout diagnostics**

In `captureHeaders`, update the `CAPTURE_HEADERS_MISSING` error:

```ts
      throw new CliError({
        code: 'CAPTURE_HEADERS_MISSING',
        message: 'Matching captures were found, but required request headers were missing',
        reason: `missing_headers=${lastMissing.join(',')}; capture_id=${lastCaptureId ?? 'unknown'}; backend=${query.backend ?? 'auto'}; limit=${query.limit}; dump_count=${whistleWebDumpCountForLimit(normalizeLimit(query.limit))}; scanned=${scanned}; matched=${matched}`,
        suggested_fix:
          'Confirm the requested header names, re-trigger the browser request, use --limit 1000, or broaden the host/path filters.',
      });
```

Update the `NO_CAPTURE_MATCH` error in `captureHeaders`:

```ts
    throw new CliError({
      code: 'NO_CAPTURE_MATCH',
      message: 'No matching capture was found while waiting for request headers',
      reason: `backend=${query.backend ?? 'auto'}; limit=${query.limit}; dump_count=${whistleWebDumpCountForLimit(normalizeLimit(query.limit))}; scanned=${scanned}; matched=${matched}`,
      suggested_fix:
        'Re-trigger the target browser request while the command is running, retry with --limit 1000, or use --allow-existing if reusing a recent request is intended.',
    });
```

- [ ] **Step 5: Run diagnostics tests**

Run:

```bash
npm test -- tests/integration/us3-captures.test.ts -t "scan window details|missing requested headers"
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/domain/captures-service.ts tests/integration/us3-captures.test.ts
git commit -m "fix(captures): improve Whistle Web header diagnostics"
```

---

### Task 7: Update Documentation And Skill Guidance

**Files:**
- Modify: `README.md`
- Modify: `skills/whistle-cli/SKILL.md`

- [ ] **Step 1: Update README safe workflow section**

In `README.md`, find the `### Whistle Web Capture Retrieval` section and add this subsection after the existing `assert-request` example:

```md
#### Safe Header Handoff

When an agent needs authenticated request headers for a follow-up command, prefer `capture-headers` so values are written to local files and not printed to stdout:

```bash
whistle-cli --format json captures capture-headers \
  --backend whistle-web \
  --host app.example.com \
  --path /api/session \
  --headers cookie,x-csrftoken,x-signature-key \
  --timeout 120s \
  --save-env .devops-headers.env
```

By default, the command ignores captures that were already present when it started. Use `--allow-existing` only when reusing a recent matching request is intended. Use `--env-map cookie=DEVOPS_COOKIE` to override generated env keys such as `COOKIE` or `X_SIGNATURE_KEY`.

The command fails unless `--save-env` or `--save-json` is provided. Its JSON output reports capture metadata and header presence only; it does not include header values.
```

- [ ] **Step 2: Update `get-header` README note**

In the existing `get-header` paragraph, add:

```md
For a single exact header, `get-header` remains available. Add `--redact`, `--save-env`, `--save-json`, or `--save-value` when the value should not appear in stdout.
```

- [ ] **Step 3: Update skill guidance**

In `skills/whistle-cli/SKILL.md`, in the capture workflow area, add this guidance:

```md
For sensitive request-header handoff, prefer the high-level safe workflow:

```bash
whistle-cli --format json captures capture-headers \
  --backend whistle-web \
  --host <host> \
  --path <path> \
  --headers cookie,x-csrftoken,x-signature-key \
  --save-env <file>
```

Do not ask agents to read cookie or CSRF values from stdout. Use `--allow-existing` only when the user explicitly wants to reuse a recent capture.
```

- [ ] **Step 4: Run documentation grep checks**

Run:

```bash
rg -n "capture-headers|--save-env|--allow-existing" README.md skills/whistle-cli/SKILL.md
```

Expected: output includes both files and the new command.

- [ ] **Step 5: Commit**

Run:

```bash
git add README.md skills/whistle-cli/SKILL.md
git commit -m "docs: document safe header handoff workflow"
```

---

### Task 8: Full Verification And Final Commit Hygiene

**Files:**
- Verify: all changed files

- [ ] **Step 1: Run focused capture tests**

Run:

```bash
npm test -- tests/integration/us3-captures.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run lint**

Run:

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 3: Run TypeScript build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 4: Run full test suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 5: Inspect status**

Run:

```bash
git status --short
```

Expected: no tracked modifications. Untracked release tarballs `whistle-cli-0.1.1.tgz` and `whistle-cli-0.1.2.tgz` may remain if they existed before implementation.

- [ ] **Step 6: Summarize commits**

Run:

```bash
git log --oneline -8
```

Expected: recent commits include the task commits from this plan.

---

## Plan Self-Review

- Spec coverage: `capture-headers`, new-only matching, `--allow-existing`, env/json saves, env-map, `get-header` redaction/save compatibility, diagnostics, docs, and tests are covered by Tasks 1-8.
- Placeholder scan: no placeholder steps remain; each implementation step includes concrete paths, code, commands, and expected outcomes.
- Type consistency: plan uses `CaptureHeadersOptions`, `CaptureHeadersResult`, `CaptureHeaderSelection`, `CaptureHeaderPresence`, `captureHeaders`, `getCaptureHeaderValue`, and `whistleWebDumpCountForLimit` consistently across model, service, and CLI tasks.
