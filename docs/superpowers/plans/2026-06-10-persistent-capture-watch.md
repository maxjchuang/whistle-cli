# Persistent Capture Watch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `whistle-cli captures watch --watch` continuously stream newly observed request summaries until interrupted.

**Architecture:** Extend the existing captures domain and CLI resource rather than adding a new command. The domain service owns baseline polling and de-duplication; the CLI owns option validation, signal handling, NDJSON envelopes, and exit codes. The implementation continues to read Whistle Web's bounded recent capture window through existing `find()` behavior.

**Tech Stack:** TypeScript 5.x, Node.js 20, commander, Vitest integration tests, existing fake Whistle Web backend.

---

## Source Map

- Modify `src/domain/captures-model.ts`
  - Add an options type for request-summary watch generators that can run forever and stop through a callback.
- Modify `src/domain/captures-service.ts`
  - Extend `watchRequestSummaries()` to support persistent mode while preserving bounded mode.
- Modify `src/resources/captures.ts`
  - Add `--since` validation.
  - Make ordinary `captures watch --watch` ignore timeout/duration, stop on `SIGINT`/`SIGTERM`, and emit an interrupt end event.
  - Render watch errors as single-line NDJSON-compatible error envelopes.
- Modify `tests/integration/us3-captures.test.ts`
  - Add a long-running CLI test helper based on `child_process.spawn`.
  - Add integration tests for persistent watch, interrupt end events, startup baseline behavior, unsupported `--since`, and persistent watch errors.
- Modify `README.md`
  - Document persistent request-summary watch usage and constraints.
- Modify `skills/whistle-cli/SKILL.md`
  - Update capture workflow guidance to use `captures watch --watch` for human-facing continuous monitoring.

---

### Task 1: Add Failing Integration Tests For Persistent Watch

**Files:**
- Modify: `tests/integration/us3-captures.test.ts`

- [ ] **Step 1: Add long-running CLI imports**

At the top of `tests/integration/us3-captures.test.ts`, add these imports after the existing imports:

```ts
import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
```

- [ ] **Step 2: Add a spawned CLI helper**

Add this helper after the existing imports and before `describe('US3 captures (integration)', () => {`:

```ts
type StartedCli = {
  child: ChildProcessWithoutNullStreams;
  stdout: () => string;
  stderr: () => string;
  wait: () => Promise<{ exitCode: number; signal: NodeJS.Signals | null; stdout: string; stderr: string }>;
};

function startCli(
  args: string[],
  opts?: { env?: Record<string, string | undefined> },
): StartedCli {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const srcEntry = path.join(repoRoot, 'src', 'cli', 'index.ts');
  const tsxBin = path.join(repoRoot, 'node_modules', '.bin', 'tsx');
  const child = spawn(process.execPath, [tsxBin, srcEntry, ...args], {
    env: {
      ...process.env,
      ...opts?.env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk: string) => {
    stderr += chunk;
  });

  const exit = new Promise<{
    exitCode: number;
    signal: NodeJS.Signals | null;
    stdout: string;
    stderr: string;
  }>((resolve) => {
    child.once('exit', (code, signal) => {
      resolve({
        exitCode: code ?? 0,
        signal,
        stdout,
        stderr,
      });
    });
  });

  return {
    child,
    stdout: () => stdout,
    stderr: () => stderr,
    wait: () => exit,
  };
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 1000,
  intervalMs = 20,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  do {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  } while (Date.now() < deadline);
  throw new Error('Timed out waiting for condition');
}
```

- [ ] **Step 3: Add persistent watch test**

Add this test after the existing `captures watch streams newly observed Whistle Web summaries` test:

```ts
  it('captures watch --watch streams request summaries until interrupted', async () => {
    const stateDir = await makeTempDir('whistle-cli-us3-state-');
    const backend = await startFakeCaptureBackend({
      disableCaptureRuntimeRoutes: true,
      nativeCaptureSequence: [
        {
          old_capture: {
            id: 'old_capture',
            url: 'https://app.example.com/space/api/workspace/chatbot/bot1/skills',
            req: {
              method: 'GET',
              headers: {
                host: 'app.example.com',
                'x-tt-logid': 'old-logid',
              },
            },
            res: { statusCode: 200 },
          },
        },
        {
          old_capture: {
            id: 'old_capture',
            url: 'https://app.example.com/space/api/workspace/chatbot/bot1/skills',
            req: {
              method: 'GET',
              headers: {
                host: 'app.example.com',
                'x-tt-logid': 'old-logid',
              },
            },
            res: { statusCode: 200 },
          },
        },
        {
          old_capture: {
            id: 'old_capture',
            url: 'https://app.example.com/space/api/workspace/chatbot/bot1/skills',
            req: {
              method: 'GET',
              headers: {
                host: 'app.example.com',
                'x-tt-logid': 'old-logid',
              },
            },
            res: { statusCode: 200 },
          },
          persistent_watch: {
            id: 'persistent_watch',
            url: 'https://app.example.com/space/api/workspace/chatbot/bot1/skills',
            req: {
              method: 'GET',
              headers: {
                host: 'app.example.com',
                'x-tt-logid': 'persistent-logid',
              },
            },
            res: { statusCode: 200 },
          },
        },
      ],
    });
    const started = startCli(
      [
        '--instance',
        'dummy',
        'captures',
        'watch',
        '--backend',
        'whistle-web',
        '--host',
        'app.example.com',
        '--path',
        '/skills',
        '--duration',
        '20ms',
        '--poll-interval',
        '50ms',
        '--fields',
        'capture_id,x_tt_logid',
        '--watch',
        '--format',
        'ndjson',
      ],
      {
        env: {
          WHISTLE_CLI_STATE_DIR: stateDir,
          WHISTLE_CLI_RUNTIME_URL: backend.baseUrl,
        },
      },
    );
    try {
      await waitFor(() => started.stdout().includes('persistent_watch'), 1500);
      expect(started.stdout()).not.toContain('old_capture');

      started.child.kill('SIGINT');
      const result = await started.wait();
      expect(result.exitCode).toBe(0);

      const lines = result.stdout
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      expect(lines[0]).toMatchObject({
        event: 'capture',
        data: {
          capture_id: 'persistent_watch',
          x_tt_logid: 'persistent-logid',
        },
      });
      expect(lines.at(-1)).toMatchObject({
        event: 'end',
        data: {
          ended: true,
          count: 1,
          reason: 'interrupted',
        },
      });
    } finally {
      if (started.child.exitCode == null && !started.child.killed) started.child.kill('SIGTERM');
      await backend.close();
    }
  });
```

- [ ] **Step 4: Add unsupported `--since` test**

Add this test after the persistent watch test:

```ts
  it('captures watch rejects unsupported since values', async () => {
    const stateDir = await makeTempDir('whistle-cli-us3-state-');
    const backend = await startFakeCaptureBackend({ disableCaptureRuntimeRoutes: true });
    try {
      const res = await runCli(
        [
          '--instance',
          'dummy',
          'captures',
          'watch',
          '--backend',
          'whistle-web',
          '--host',
          'app.example.com',
          '--since',
          '12345',
          '--format',
          'ndjson',
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
      expect(envelope.event).toBe('error');
      expect(envelope.error.code).toBe('UNSUPPORTED_OPERATION');
      expect(envelope.error.message).toContain('Unsupported capture starting point');
    } finally {
      await backend.close();
    }
  });
```

- [ ] **Step 5: Add persistent error test**

Add this test after the unsupported `--since` test:

```ts
  it('captures watch --watch exits on Whistle Web errors', async () => {
    const stateDir = await makeTempDir('whistle-cli-us3-state-');
    const backend = await startFakeCaptureBackend({
      disableCaptureRuntimeRoutes: true,
      failGetData: true,
    });
    try {
      const res = await runCli(
        [
          '--instance',
          'dummy',
          'captures',
          'watch',
          '--backend',
          'whistle-web',
          '--host',
          'app.example.com',
          '--watch',
          '--format',
          'ndjson',
        ],
        {
          env: {
            WHISTLE_CLI_STATE_DIR: stateDir,
            WHISTLE_CLI_RUNTIME_URL: backend.baseUrl,
          },
        },
      );
      expect(res.exitCode).not.toBe(0);
      expect(res.stdout.trim()).toBe('');
      const envelope = JSON.parse(res.stderr);
      expect(envelope.event).toBe('error');
      expect(envelope.error.code).toBe('WHISTLE_WEB_UNAVAILABLE');
    } finally {
      await backend.close();
    }
  });
```

- [ ] **Step 6: Run the new tests and verify failure**

Run:

```bash
npm run test -- tests/integration/us3-captures.test.ts -t "captures watch"
```

Expected: FAIL. The persistent watch test should time out waiting for `persistent_watch` or exit before interruption because ordinary request-summary `--watch` is not implemented yet.

- [ ] **Step 7: Commit the failing tests**

Run:

```bash
git add tests/integration/us3-captures.test.ts
git commit -m "test(captures): cover persistent watch"
```

---

### Task 2: Add Persistent Watch Support In The Domain Service

**Files:**
- Modify: `src/domain/captures-model.ts`
- Modify: `src/domain/captures-service.ts`

- [ ] **Step 1: Add watch generator options type**

In `src/domain/captures-model.ts`, add this interface after `CaptureAssertRequestOptions`:

```ts
export interface CaptureWatchRequestSummariesOptions extends CaptureAssertRequestOptions {
  forever?: boolean;
  shouldStop?: () => boolean;
}
```

- [ ] **Step 2: Import the new type**

In `src/domain/captures-service.ts`, add the new type to the existing import list:

```ts
  CaptureWatchRequestSummariesOptions,
```

- [ ] **Step 3: Extend `watchRequestSummaries`**

Replace the existing `watchRequestSummaries` method in `src/domain/captures-service.ts` with:

```ts
  async *watchRequestSummaries(
    query: CaptureQuery,
    opts?: CaptureWatchRequestSummariesOptions,
  ): AsyncGenerator<CaptureSummary, void, unknown> {
    const timeoutMs = opts?.timeoutMs ?? 60_000;
    const pollIntervalMs = Math.max(100, opts?.pollIntervalMs ?? 1000);
    const forever = Boolean(opts?.forever);
    const deadline = forever ? Number.POSITIVE_INFINITY : Date.now() + timeoutMs;
    const shouldStop = opts?.shouldStop ?? (() => false);
    const seen = new Set((await this.find(query)).items.map((item) => item.capture_id));

    do {
      const result = await this.find(query);
      for (const item of result.items) {
        if (shouldStop()) return;
        if (seen.has(item.capture_id)) continue;
        seen.add(item.capture_id);
        yield this.summarizeRecord(item, opts);
      }
      if (shouldStop()) return;
      const remainingMs = forever ? pollIntervalMs : deadline - Date.now();
      if (remainingMs > 0) {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(pollIntervalMs, remainingMs)),
        );
      }
    } while (!shouldStop() && (forever || Date.now() < deadline));
  }
```

- [ ] **Step 4: Run typecheck build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 5: Run the persistent watch tests and verify they still fail at CLI behavior**

Run:

```bash
npm run test -- tests/integration/us3-captures.test.ts -t "captures watch --watch"
```

Expected: FAIL. The service can run forever, but the CLI has not yet passed `forever: true` or installed interrupt handling.

- [ ] **Step 6: Commit service support**

Run:

```bash
git add src/domain/captures-model.ts src/domain/captures-service.ts
git commit -m "feat(captures): support persistent watch generator"
```

---

### Task 3: Wire Persistent Watch Semantics Into The CLI

**Files:**
- Modify: `src/resources/captures.ts`

- [ ] **Step 1: Add `since` to the watch option type**

In `src/resources/captures.ts`, update `CaptureWatchOptions` to include `since`:

```ts
type CaptureWatchOptions = CaptureFindOptions & {
  expectHeader?: string;
  duration?: string;
  timeout?: string;
  pollInterval?: string;
  since?: string;
  watch?: boolean;
};
```

- [ ] **Step 2: Add `--since` validation helper**

Add this helper near the other small parsing/assertion helpers:

```ts
function assertWatchSince(since: unknown): void {
  if (since == null || String(since) === 'now') return;
  throw new CliError({
    code: 'UNSUPPORTED_OPERATION',
    message: 'Unsupported capture starting point',
    reason: `since=${String(since)}`,
    suggested_fix: 'Use --since now or omit --since. Historical capture cursors are not supported.',
  });
}
```

- [ ] **Step 3: Add signal helper types**

Add this type near the command option types:

```ts
type WatchStopReason = 'interrupted';
```

- [ ] **Step 4: Replace ordinary request-summary watch branch**

Inside the `captures.command('watch')` action, replace the entire `if (!cmdOpts.expectHeader) { ... return; }` block with:

```ts
        if (!cmdOpts.expectHeader) {
          assertWatchSince(cmdOpts.since);
          const filters = {
            host: cmdOpts.host ? String(cmdOpts.host) : undefined,
            path: cmdOpts.path ? String(cmdOpts.path) : undefined,
            method: cmdOpts.method ? String(cmdOpts.method) : undefined,
            status: cmdOpts.status ? Number(cmdOpts.status) : undefined,
            keyword: cmdOpts.keyword ? String(cmdOpts.keyword) : undefined,
          };
          const persistent = Boolean(cmdOpts.watch);
          let count = 0;
          let stopReason: WatchStopReason | undefined;
          const stop = (): void => {
            stopReason = 'interrupted';
          };
          const onSigint = (): void => stop();
          const onSigterm = (): void => stop();

          if (persistent) {
            process.once('SIGINT', onSigint);
            process.once('SIGTERM', onSigterm);
          }

          try {
            for await (const item of service.watchRequestSummaries(
              { instance_id: resolved.id, backend, filters, limit: 200 },
              {
                timeoutMs: persistent
                  ? undefined
                  : parseDurationMs(cmdOpts.timeout ?? cmdOpts.duration),
                pollIntervalMs: parseDurationMs(cmdOpts.pollInterval),
                fields: splitFields(cmdOpts.fields),
                forever: persistent,
                shouldStop: persistent ? () => stopReason != null : undefined,
              },
            )) {
              count++;
              process.stdout.write(
                renderEnvelope(
                  okEnvelope('captures', action, item, { instance: resolved, event: 'capture' }),
                  'ndjson',
                ),
              );
            }
          } finally {
            if (persistent) {
              process.off('SIGINT', onSigint);
              process.off('SIGTERM', onSigterm);
            }
          }

          const data = stopReason
            ? { ended: true, count, reason: stopReason }
            : { ended: true, count };
          process.stdout.write(
            renderEnvelope(
              okEnvelope('captures', action, data, { instance: resolved, event: 'end' }),
              'ndjson',
            ),
          );
          return;
        }
```

- [ ] **Step 5: Validate `--since` for header watch branch**

Immediately before `const expected = splitHeaderPair(String(cmdOpts.expectHeader));`, add:

```ts
        assertWatchSince(cmdOpts.since);
```

- [ ] **Step 6: Render watch errors as NDJSON**

In the `catch` block of the `captures.command('watch')` action, replace the current render format argument:

```ts
            'json',
```

with:

```ts
            'ndjson',
```

The full `process.stderr.write` call should end as:

```ts
        process.stderr.write(
          renderEnvelope(
            errorEnvelope('captures', action, err, { instance: resolved, event: 'error' }),
            'ndjson',
          ),
        );
```

- [ ] **Step 7: Run focused tests**

Run:

```bash
npm run test -- tests/integration/us3-captures.test.ts -t "captures watch"
```

Expected: PASS.

- [ ] **Step 8: Run build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 9: Commit CLI behavior**

Run:

```bash
git add src/resources/captures.ts
git commit -m "feat(captures): keep watch running until interrupted"
```

---

### Task 4: Update User And Agent Documentation

**Files:**
- Modify: `README.md`
- Modify: `skills/whistle-cli/SKILL.md`

- [ ] **Step 1: Update README watch documentation**

In `README.md`, in the Whistle Web capture retrieval section after the `assert-request` example, add this markdown:

````md
For continuous human-facing monitoring, use `captures watch --watch` with NDJSON output:

```bash
whistle-cli --format ndjson captures watch \
  --backend whistle-web \
  --host app.example.com \
  --path /api/ \
  --fields capture_id,method,status_code,path,x_tt_logid,request_id,referer \
  --watch
```

`--watch` keeps the process running until Ctrl-C or SIGTERM. It performs process-local in-memory de-duplication from the startup baseline and does not persist history across restarts. It still reads Whistle Web's recent capture window, so high-volume traffic can rotate old records out before they are observed.
````

- [ ] **Step 2: Update skill guidance**

In `skills/whistle-cli/SKILL.md`, in the "Capture Workflow" section after the timeout fallback guidance, add:

```md
For long-running human-facing monitoring, use request-summary watch mode:

- `whistle-cli --format ndjson captures watch --backend whistle-web --host app.example.com --path /api/ --fields capture_id,method,status_code,path,x_tt_logid,request_id,referer --watch`

This is process-local monitoring over Whistle Web's recent capture window. Stop it with Ctrl-C; the command emits a final `event=end` envelope on interruption.
```

- [ ] **Step 3: Run docs-sensitive tests**

Run:

```bash
npm run test -- tests/integration/us3-captures.test.ts -t "captures watch"
```

Expected: PASS.

- [ ] **Step 4: Commit documentation**

Run:

```bash
git add README.md skills/whistle-cli/SKILL.md
git commit -m "docs(captures): document persistent watch"
```

---

### Task 5: Final Verification

**Files:**
- No new files.
- Verify all files modified by Tasks 1-4.

- [ ] **Step 1: Run full test suite**

Run:

```bash
npm run test
```

Expected: PASS.

- [ ] **Step 2: Run lint**

Run:

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 3: Run build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 4: Inspect git status**

Run:

```bash
git status --short
```

Expected: Only intentional committed changes are absent from the working tree. Pre-existing unrelated package version or `.tgz` changes may still be present and must not be reverted unless the user explicitly asks.

- [ ] **Step 5: Commit any verification-only fix**

If verification required a small fix, commit only the files touched for this feature:

```bash
git add src/domain/captures-model.ts src/domain/captures-service.ts src/resources/captures.ts tests/integration/us3-captures.test.ts README.md skills/whistle-cli/SKILL.md
git commit -m "fix(captures): stabilize persistent watch"
```

Expected: No commit is needed when Tasks 1-4 already pass verification.
