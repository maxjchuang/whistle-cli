import type { Command } from 'commander';
import type { OutputFormat } from '../cli/program';
import { resolveInstanceId } from '../shared/instance-context';
import { CliError } from '../output/errors';
import { errorEnvelope, okEnvelope } from '../output/result';
import { renderEnvelope } from '../output/renderers';
import { CapturesService } from '../domain/captures-service';

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
    .action(async (cmdOpts: any) => {
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
        process.stdout.write(renderEnvelope(okEnvelope('captures', action, out, { instance: resolved, effective: true }), format));
      } catch (e) {
        const err = CliError.fromUnknown(e);
        process.stderr.write(renderEnvelope(errorEnvelope('captures', action, err, { instance: resolved }), format));
        process.exitCode = 1;
      }
    });

  captures
    .command('get')
    .description('Get a single capture record')
    .requiredOption('--id <id>', 'Capture id')
    .option('--backend <backend>', 'Capture backend: runtime', 'runtime')
    .action(async (cmdOpts: { id: string }) => {
      const opts = program.opts();
      const format = (opts.format ?? 'json') as OutputFormat;
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'get';
      try {
        assertRuntimeOnlyBackend((cmdOpts as any).backend, action);
        const item = await service.get(resolved.id, cmdOpts.id);
        process.stdout.write(renderEnvelope(okEnvelope('captures', action, item, { instance: resolved, effective: true }), format));
      } catch (e) {
        const err = CliError.fromUnknown(e);
        process.stderr.write(renderEnvelope(errorEnvelope('captures', action, err, { instance: resolved }), format));
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
    .action(async (cmdOpts: any) => {
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
        // v1 safety: enforce ndjson for tail
        if (format !== 'ndjson') {
          throw new CliError({
            code: 'UNSUPPORTED_OPERATION',
            message: '`captures tail` requires --format ndjson',
            suggested_fix: 'Re-run with: whistle-cli --format ndjson captures tail',
          });
        }
        for await (const item of service.tail({ instance_id: resolved.id, filters, limit: max, backend: cmdOpts.backend })) {
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
        process.stderr.write(renderEnvelope(errorEnvelope('captures', action, err, { instance: resolved, event: 'error' }), 'json'));
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

  // Contract-required actions (stubs for now)
  captures
    .command('diff')
    .description('Diff two captures (not implemented in v1 yet)')
    .action(async () => {
      const opts = program.opts();
      const format = (opts.format ?? 'json') as OutputFormat;
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'diff';
      const err = new CliError({ code: 'UNSUPPORTED_OPERATION', message: 'captures diff not implemented yet' });
      process.stderr.write(renderEnvelope(errorEnvelope('captures', action, err, { instance: resolved }), format));
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
    .option('--backend <backend>', 'Capture backend: runtime', 'runtime')
    .action(async (cmdOpts: any) => {
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
        assertRuntimeOnlyBackend(cmdOpts.backend, action);
        const out = await service.export({ instance_id: resolved.id, filters, limit, export_format, backend: cmdOpts.backend });
        process.stdout.write(renderEnvelope(okEnvelope('captures', action, out, { instance: resolved, effective: true }), format));
      } catch (e) {
        const err = CliError.fromUnknown(e);
        process.stderr.write(renderEnvelope(errorEnvelope('captures', action, err, { instance: resolved }), format));
        process.exitCode = 1;
      }
    });
}
