import type { Command } from 'commander';
import { accessSync, constants, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { OutputFormat } from '../cli/program';
import { resolveInstanceId } from '../shared/instance-context';
import { CliError } from '../output/errors';
import { errorEnvelope, okEnvelope, warningEnvelope } from '../output/result';
import { renderEnvelope } from '../output/renderers';
import {
  CapturesService,
  filterNewHeaderAssertionEvents,
  whistleWebDumpCountForLimit,
} from '../domain/captures-service';

function parseDurationMs(input: unknown): number {
  const raw = String(input ?? '60s').trim();
  const parsed = raw.endsWith('ms')
    ? Number(raw.slice(0, -2))
    : raw.endsWith('s')
      ? Number(raw.slice(0, -1)) * 1000
      : Number(raw) * 1000;
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 60_000;
}

function normalizeCaptureLimit(input: unknown): number {
  const value = typeof input === 'number' ? input : Number(String(input ?? ''));
  if (!Number.isFinite(value) || value <= 0) return 30;
  return Math.min(Math.max(Math.floor(value), 1), 200);
}

function splitHeaderPair(pair: string): { header: string; equals: string } {
  const idx = pair.indexOf('=');
  if (idx <= 0) {
    throw new CliError({
      code: 'UNSUPPORTED_OPERATION',
      message: 'Expected header pair in key=value format',
      suggested_fix: 'Use --expect-header x-env=staging.',
    });
  }
  return { header: pair.slice(0, idx), equals: pair.slice(idx + 1) };
}

function splitFields(input: unknown): string[] | undefined {
  if (input == null) return undefined;
  const fields = String(input)
    .split(',')
    .map((field) => field.trim())
    .filter(Boolean);
  return fields.length ? fields : undefined;
}

function assertWatchSince(since: unknown): void {
  if (since == null || String(since) === 'now') return;
  throw new CliError({
    code: 'UNSUPPORTED_OPERATION',
    message: 'Unsupported capture starting point',
    reason: `since=${String(since)}`,
    suggested_fix: 'Use --since now or omit --since. Historical capture cursors are not supported.',
  });
}

function writeJsonFile(file: unknown, data: unknown): string | undefined {
  if (!file) return undefined;
  const filePath = String(file);
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return filePath;
}

function assertSaveTargetsWritable(...files: unknown[]): void {
  for (const file of files) {
    if (!file) continue;
    const filePath = String(file);
    const parent = path.dirname(filePath);
    try {
      const parentStat = statSync(parent);
      if (!parentStat.isDirectory()) {
        throw new Error(`${parent} is not a directory`);
      }
      accessSync(parent, constants.W_OK);
      try {
        const targetStat = statSync(filePath);
        if (!targetStat.isFile()) {
          throw new Error(`${filePath} is not a file`);
        }
        accessSync(filePath, constants.W_OK);
      } catch (e) {
        const code = (e as { code?: unknown }).code;
        if (code !== 'ENOENT') throw e;
      }
    } catch (e) {
      throw new CliError(
        {
          code: 'UNSUPPORTED_OPERATION',
          message: 'Capture header save target is not writable',
          reason: `file=${filePath}`,
          suggested_fix:
            'Create the parent directory or choose a writable path before retrying.',
        },
        e,
      );
    }
  }
}

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
  return `"${value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')}"`;
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

function assertFindBackend(backend: unknown): 'auto' | 'whistle-web' | 'runtime' {
  if (backend === 'auto' || backend === 'whistle-web' || backend === 'runtime') return backend;
  throw new CliError({
    code: 'UNSUPPORTED_OPERATION',
    message: `Unsupported capture backend: ${String(backend)}`,
    suggested_fix: 'Use one of: auto, whistle-web, runtime.',
  });
}

function assertRuntimeOnlyBackend(backend: unknown, action: string): void {
  if (backend === undefined || backend === 'runtime') return;
  throw new CliError({
    code: 'UNSUPPORTED_OPERATION',
    message: `captures ${action} only supports the runtime backend`,
    suggested_fix: 'Use --backend runtime, or use captures find for Whistle Web capture reads.',
  });
}

function assertCaptureBackend(backend: unknown): 'whistle-web' | 'runtime' {
  if (backend === 'whistle-web' || backend === 'runtime') return backend;
  throw new CliError({
    code: 'UNSUPPORTED_OPERATION',
    message: `Unsupported capture backend: ${String(backend)}`,
    suggested_fix: 'Use one of: whistle-web, runtime.',
  });
}

type CaptureFindOptions = {
  host?: string;
  path?: string;
  method?: string;
  status?: string | number;
  keyword?: string;
  limit?: string | number;
  backend?: string;
  fields?: string;
};

type CaptureGetOptions = {
  id: string;
  backend?: string;
  limit?: string | number;
};

type CaptureGetHeaderOptions = CaptureGetOptions & {
  header: string;
  redact?: boolean;
  saveValue?: string;
  saveEnv?: string;
  envKey?: string;
  saveJson?: string;
};

type CaptureAssertRequestCommandOptions = CaptureFindOptions & {
  timeout?: string;
  pollInterval?: string;
  save?: string;
};

type CaptureHeadersCommandOptions = CaptureFindOptions & {
  headers: string;
  timeout?: string;
  pollInterval?: string;
  allowExisting?: boolean;
  saveEnv?: string;
  saveJson?: string;
  envMap?: string;
};

type CaptureAssertHeaderOptions = {
  host: string;
  path?: string;
  header: string;
  equals: string;
  duration?: string;
  backend?: string;
};

type CaptureWatchOptions = CaptureFindOptions & {
  expectHeader?: string;
  duration?: string;
  timeout?: string;
  pollInterval?: string;
  since?: string;
  watch?: boolean;
};

type WatchStopReason = 'interrupted';

type CaptureExportOptions = CaptureFindOptions & {
  exportFormat?: string;
};

export function registerCapturesResource(program: Command): void {
  const captures = program.command('captures').description('Inspect and export captured traffic');
  const service = new CapturesService();

  captures
    .command('find')
    .description('Find recent captures')
    .option('--host <host>', 'Filter by host')
    .option('--path <path>', 'Filter by request path substring')
    .option('--method <method>', 'Filter by HTTP method')
    .option('--status <status>', 'Filter by status code')
    .option('--keyword <keyword>', 'Search keyword')
    .option('--limit <n>', 'Max items', '30')
    .option('--backend <backend>', 'Capture backend: auto|whistle-web|runtime', 'auto')
    .option('--fields <fields>', 'Comma-separated summary fields to return')
    .action(async (cmdOpts: CaptureFindOptions) => {
      const opts = program.opts();
      const format = (opts.format ?? 'json') as OutputFormat;
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'find';

      try {
        const filters = {
          host: cmdOpts.host ? String(cmdOpts.host) : undefined,
          path: cmdOpts.path ? String(cmdOpts.path) : undefined,
          method: cmdOpts.method ? String(cmdOpts.method) : undefined,
          status: cmdOpts.status ? Number(cmdOpts.status) : undefined,
          keyword: cmdOpts.keyword ? String(cmdOpts.keyword) : undefined,
        };
        const limit = Number(cmdOpts.limit ?? 30);
        const backend = assertFindBackend(cmdOpts.backend);
        const out = await service.find({ instance_id: resolved.id, filters, limit, backend });
        const data = cmdOpts.fields
          ? {
              ...out,
              items: service.summarizeRecords(out.items, { fields: splitFields(cmdOpts.fields) }),
            }
          : out;
        process.stdout.write(
          renderEnvelope(
            okEnvelope('captures', action, data, { instance: resolved, effective: true }),
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

  captures
    .command('get')
    .description('Get a single capture record')
    .requiredOption('--id <id>', 'Capture id')
    .option('--backend <backend>', 'Capture backend: whistle-web|runtime', 'runtime')
    .option('--limit <n>', 'Recent Whistle Web records to inspect', '200')
    .action(async (cmdOpts: CaptureGetOptions) => {
      const opts = program.opts();
      const format = (opts.format ?? 'json') as OutputFormat;
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'get';
      try {
        const backend = assertCaptureBackend(cmdOpts.backend ?? 'runtime');
        const item = await service.get(resolved.id, cmdOpts.id, {
          backend,
          limit: Number(cmdOpts.limit ?? 200),
        });
        process.stdout.write(
          renderEnvelope(
            okEnvelope('captures', action, item, { instance: resolved, effective: true }),
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

  captures
    .command('get-header')
    .description('Get one request header from a capture')
    .requiredOption('--id <id>', 'Capture id')
    .requiredOption('--header <name>', 'Request header name')
    .option('--backend <backend>', 'Capture backend: whistle-web|runtime', 'runtime')
    .option('--limit <n>', 'Recent Whistle Web records to inspect', '200')
    .option('--redact', 'Do not print the header value')
    .option('--save-value <file>', 'Write the raw header value to a file')
    .option('--save-env <file>', 'Write the header value as one dotenv assignment')
    .option('--env-key <name>', 'Env key for --save-env')
    .option('--save-json <file>', 'Write the header value as JSON')
    .action(async (cmdOpts: CaptureGetHeaderOptions) => {
      const opts = program.opts();
      const format = (opts.format ?? 'json') as OutputFormat;
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'get-header';
      try {
        const backend = assertCaptureBackend(cmdOpts.backend ?? 'runtime');
        const data = await service.getHeader(resolved.id, cmdOpts.id, String(cmdOpts.header), {
          backend,
          limit: Number(cmdOpts.limit ?? 200),
        });
        assertSaveTargetsWritable(cmdOpts.saveValue, cmdOpts.saveEnv, cmdOpts.saveJson);
        const values = [{ header: data.header, value: data.value }];
        const rawPath = writeTextFile(cmdOpts.saveValue, data.value);
        const envMap = cmdOpts.envKey
          ? new Map([[data.header.toLowerCase(), String(cmdOpts.envKey)]])
          : undefined;
        const envPath = writeHeaderEnvFile(cmdOpts.saveEnv, values, envMap);
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
      } catch (e) {
        const err = CliError.fromUnknown(e);
        process.stderr.write(
          renderEnvelope(errorEnvelope('captures', action, err, { instance: resolved }), format),
        );
        process.exitCode = 1;
      }
    });

  captures
    .command('tail')
    .description('Stream captures as ndjson (best-effort)')
    .option('--host <host>', 'Filter by host')
    .option('--path <path>', 'Filter by request path substring')
    .option('--method <method>', 'Filter by HTTP method')
    .option('--status <status>', 'Filter by status code')
    .option('--keyword <keyword>', 'Search keyword')
    .option('--limit <n>', 'Max events before ending (for safety)', '20')
    .option('--backend <backend>', 'Capture backend: runtime', 'runtime')
    .action(async (cmdOpts: CaptureFindOptions) => {
      const opts = program.opts();
      const format = (opts.format ?? 'json') as OutputFormat;
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'tail';

      const max = Number(cmdOpts.limit ?? 20);
      const filters = {
        host: cmdOpts.host ? String(cmdOpts.host) : undefined,
        path: cmdOpts.path ? String(cmdOpts.path) : undefined,
        method: cmdOpts.method ? String(cmdOpts.method) : undefined,
        status: cmdOpts.status ? Number(cmdOpts.status) : undefined,
        keyword: cmdOpts.keyword ? String(cmdOpts.keyword) : undefined,
      };

      let count = 0;
      try {
        assertRuntimeOnlyBackend(cmdOpts.backend, action);
        const backend = 'runtime' as const;
        // v1 safety: enforce ndjson for tail
        if (format !== 'ndjson') {
          throw new CliError({
            code: 'UNSUPPORTED_OPERATION',
            message: '`captures tail` requires --format ndjson',
            suggested_fix: 'Re-run with: whistle-cli --format ndjson captures tail',
          });
        }
        for await (const item of service.tail({
          instance_id: resolved.id,
          filters,
          limit: max,
          backend,
        })) {
          const env = okEnvelope('captures', action, item, {
            instance: resolved,
            effective: true,
            event: 'capture',
          });
          process.stdout.write(renderEnvelope(env, 'ndjson'));
          count++;
        }
      } catch (e) {
        const err = CliError.fromUnknown(e);
        process.stderr.write(
          renderEnvelope(
            errorEnvelope('captures', action, err, { instance: resolved, event: 'error' }),
            'json',
          ),
        );
        process.exitCode = 1;
        return;
      }

      const endEnvelope = okEnvelope(
        'captures',
        action,
        { ended: true, count },
        { instance: resolved, effective: true, event: 'end', meta: { verified: true } },
      );
      process.stdout.write(renderEnvelope(endEnvelope, 'ndjson'));
    });

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
        const limit = normalizeCaptureLimit(cmdOpts.limit ?? 200);
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
        assertSaveTargetsWritable(cmdOpts.saveEnv, cmdOpts.saveJson);
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

  captures
    .command('assert-request')
    .description('Wait for a newly observed matching request')
    .option('--host <host>', 'Filter by host')
    .option('--path <path>', 'Filter by request path substring')
    .option('--method <method>', 'Filter by HTTP method')
    .option('--status <status>', 'Filter by status code')
    .option('--keyword <keyword>', 'Search keyword')
    .option('--timeout <duration>', 'Observation timeout, e.g. 60s', '60s')
    .option('--poll-interval <duration>', 'Polling interval, e.g. 2s', '1s')
    .option('--fields <fields>', 'Comma-separated summary fields to return')
    .option('--save <file>', 'Save the matched redacted summary to a JSON file')
    .option('--backend <backend>', 'Capture backend: auto|whistle-web|runtime', 'auto')
    .action(async (cmdOpts: CaptureAssertRequestCommandOptions) => {
      const opts = program.opts();
      const format = (opts.format ?? 'json') as OutputFormat;
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'assert-request';
      try {
        const backend = assertFindBackend(cmdOpts.backend);
        const filters = {
          host: cmdOpts.host ? String(cmdOpts.host) : undefined,
          path: cmdOpts.path ? String(cmdOpts.path) : undefined,
          method: cmdOpts.method ? String(cmdOpts.method) : undefined,
          status: cmdOpts.status ? Number(cmdOpts.status) : undefined,
          keyword: cmdOpts.keyword ? String(cmdOpts.keyword) : undefined,
        };
        const result = await service.assertRequest(
          { instance_id: resolved.id, filters, limit: 200, backend },
          {
            timeoutMs: parseDurationMs(cmdOpts.timeout),
            pollIntervalMs: parseDurationMs(cmdOpts.pollInterval),
            fields: splitFields(cmdOpts.fields),
          },
        );
        const saved_to = result.match ? writeJsonFile(cmdOpts.save, result.match) : undefined;
        const data = saved_to ? { ...result, saved_to } : result;
        const envelope =
          result.classification === 'MATCHED'
            ? okEnvelope('captures', action, data, { instance: resolved, effective: true })
            : warningEnvelope('captures', action, data, ['CAPTURE_REQUEST_TIMEOUT'], {
                instance: resolved,
                effective: false,
                next_actions: result.next_actions?.map((next) => ({ action: next })),
              });
        process.stdout.write(renderEnvelope(envelope, format));
        if (!result.matched) process.exitCode = 1;
      } catch (e) {
        const err = CliError.fromUnknown(e);
        process.stderr.write(
          renderEnvelope(errorEnvelope('captures', action, err, { instance: resolved }), format),
        );
        process.exitCode = 1;
      }
    });

  captures
    .command('assert-header')
    .description('Observe captures and assert a request header value')
    .requiredOption('--host <host>', 'Filter by host')
    .option('--path <path>', 'Filter by request path substring')
    .requiredOption('--header <name>', 'Request header name')
    .requiredOption('--equals <value>', 'Expected request header value')
    .option('--duration <duration>', 'Observation duration, e.g. 60s', '60s')
    .option('--backend <backend>', 'Capture backend: auto|whistle-web|runtime', 'auto')
    .action(async (cmdOpts: CaptureAssertHeaderOptions) => {
      const opts = program.opts();
      const format = (opts.format ?? 'json') as OutputFormat;
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'assert-header';

      try {
        const backend = assertFindBackend(cmdOpts.backend);
        const result = await service.assertHeader(
          {
            instance_id: resolved.id,
            backend,
            filters: {
              host: String(cmdOpts.host),
              path: cmdOpts.path ? String(cmdOpts.path) : undefined,
            },
            limit: 200,
          },
          {
            header: String(cmdOpts.header),
            equals: String(cmdOpts.equals),
            durationMs: parseDurationMs(cmdOpts.duration),
          },
        );
        process.stdout.write(
          renderEnvelope(
            okEnvelope('captures', action, result, {
              instance: resolved,
              effective: result.classification === 'OK',
            }),
            format,
          ),
        );
        if (result.classification !== 'OK') process.exitCode = 1;
      } catch (e) {
        const err = CliError.fromUnknown(e);
        process.stderr.write(
          renderEnvelope(errorEnvelope('captures', action, err, { instance: resolved }), format),
        );
        process.exitCode = 1;
      }
    });

  captures
    .command('watch')
    .description('Observe captures and emit header assertion events')
    .requiredOption('--host <host>', 'Filter by host')
    .option('--path <path>', 'Filter by request path substring')
    .option('--method <method>', 'Filter by HTTP method')
    .option('--status <status>', 'Filter by status code')
    .option('--keyword <keyword>', 'Search keyword')
    .option('--expect-header <k=v>', 'Expected request header pair')
    .option('--duration <duration>', 'Observation duration, e.g. 60s', '60s')
    .option('--timeout <duration>', 'Observation timeout for request watching, e.g. 60s')
    .option('--poll-interval <duration>', 'Polling interval for request watching, e.g. 2s', '1s')
    .option('--since <since>', 'Capture starting point: now')
    .option('--fields <fields>', 'Comma-separated summary fields for request watching')
    .option('--watch', 'Keep watching until interrupted')
    .option('--backend <backend>', 'Capture backend: auto|whistle-web|runtime', 'auto')
    .action(async (cmdOpts: CaptureWatchOptions) => {
      const opts = program.opts();
      const format = (opts.format ?? 'ndjson') as OutputFormat;
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'watch';

      try {
        if (format !== 'ndjson') {
          throw new CliError({
            code: 'UNSUPPORTED_OPERATION',
            message: '`captures watch` requires --format ndjson',
            suggested_fix: 'Re-run with: whistle-cli --format ndjson captures watch',
          });
        }

        const backend = assertFindBackend(cmdOpts.backend);
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
          const abortController = persistent ? new AbortController() : undefined;
          let count = 0;
          let stopReason: WatchStopReason | undefined;
          const stop = (): void => {
            stopReason = 'interrupted';
            if (!abortController?.signal.aborted) abortController?.abort();
          };
          const onSigint = (): void => stop();
          const onSigterm = (): void => stop();

          if (persistent) {
            process.on('SIGINT', onSigint);
            process.on('SIGTERM', onSigterm);
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
                stopSignal: persistent ? abortController?.signal : undefined,
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

        assertWatchSince(cmdOpts.since);
        const expected = splitHeaderPair(String(cmdOpts.expectHeader));
        const seenCaptureIds = new Set<string>();
        let finalClassification = 'OK';
        do {
          const result = await service.assertHeader(
            {
              instance_id: resolved.id,
              backend,
              filters: {
                host: String(cmdOpts.host),
                path: cmdOpts.path ? String(cmdOpts.path) : undefined,
              },
              limit: 200,
            },
            { ...expected, durationMs: parseDurationMs(cmdOpts.duration) },
          );
          for (const event of filterNewHeaderAssertionEvents(result.events, seenCaptureIds)) {
            process.stdout.write(
              renderEnvelope(
                okEnvelope('captures', action, event, { instance: resolved, event: 'capture' }),
                'ndjson',
              ),
            );
          }
          process.stdout.write(
            renderEnvelope(
              okEnvelope('captures', action, result, { instance: resolved, event: 'end' }),
              'ndjson',
            ),
          );
          finalClassification = result.classification;
        } while (cmdOpts.watch);

        if (finalClassification !== 'OK') process.exitCode = 1;
      } catch (e) {
        const err = CliError.fromUnknown(e);
        process.stderr.write(
          renderEnvelope(
            errorEnvelope('captures', action, err, { instance: resolved, event: 'error' }),
            'ndjson',
          ),
        );
        process.exitCode = 1;
      }
    });

  // Contract-required actions (stubs for now)
  captures
    .command('diff')
    .description('Diff two captures (not implemented in v1 yet)')
    .action(async () => {
      const opts = program.opts();
      const format = (opts.format ?? 'json') as OutputFormat;
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'diff';
      const err = new CliError({
        code: 'UNSUPPORTED_OPERATION',
        message: 'captures diff not implemented yet',
      });
      process.stderr.write(
        renderEnvelope(errorEnvelope('captures', action, err, { instance: resolved }), format),
      );
      process.exitCode = 1;
    });

  captures
    .command('export')
    .description('Export captures (best-effort)')
    .option('--host <host>', 'Filter by host')
    .option('--path <path>', 'Filter by request path substring')
    .option('--method <method>', 'Filter by HTTP method')
    .option('--status <status>', 'Filter by status code')
    .option('--keyword <keyword>', 'Search keyword')
    .option('--limit <n>', 'Max items', '200')
    .option('--export-format <fmt>', 'Export format: har|json', 'json')
    .option('--backend <backend>', 'Capture backend: whistle-web|runtime', 'runtime')
    .action(async (cmdOpts: CaptureExportOptions) => {
      const opts = program.opts();
      const format = (opts.format ?? 'json') as OutputFormat;
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'export';

      try {
        const filters = {
          host: cmdOpts.host ? String(cmdOpts.host) : undefined,
          path: cmdOpts.path ? String(cmdOpts.path) : undefined,
          method: cmdOpts.method ? String(cmdOpts.method) : undefined,
          status: cmdOpts.status ? Number(cmdOpts.status) : undefined,
          keyword: cmdOpts.keyword ? String(cmdOpts.keyword) : undefined,
        };
        const limit = Number(cmdOpts.limit ?? 200);
        const export_format = cmdOpts.exportFormat === 'har' ? 'har' : 'json';
        const backend = assertCaptureBackend(cmdOpts.backend ?? 'runtime');
        const out = await service.export({
          instance_id: resolved.id,
          filters,
          limit,
          export_format,
          backend,
        });
        process.stdout.write(
          renderEnvelope(
            okEnvelope('captures', action, out, { instance: resolved, effective: true }),
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
}
