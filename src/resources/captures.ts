import type { Command } from 'commander';
import type { OutputFormat } from '../cli/program';
import { resolveInstanceId } from '../shared/instance-context';
import { CliError } from '../output/errors';
import { errorEnvelope, okEnvelope } from '../output/result';
import { renderEnvelope } from '../output/renderers';
import { CapturesService } from '../domain/captures-service';

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
        const out = await service.find({ instance_id: resolved.id, filters, limit });
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
    .action(async (cmdOpts: { id: string }) => {
      const opts = program.opts();
      const format = (opts.format ?? 'json') as OutputFormat;
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'get';
      try {
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
    .option('--limit <n>', 'Max events before ending (for safety)', '20')
    .action(async (cmdOpts: { limit?: string }) => {
      const opts = program.opts();
      const format = (opts.format ?? 'json') as OutputFormat;
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'tail';

      // v1 safety: enforce ndjson for tail
      if (format !== 'ndjson') {
        const err = new CliError({
          code: 'UNSUPPORTED_OPERATION',
          message: '`captures tail` requires --format ndjson',
          suggested_fix: 'Re-run with: whistle-cli --format ndjson captures tail',
        });
        process.stderr.write(renderEnvelope(errorEnvelope('captures', action, err, { instance: resolved }), 'json'));
        process.exitCode = 1;
        return;
      }

      const max = Number(cmdOpts.limit ?? 20);
      const endEnvelope = okEnvelope(
        'captures',
        action,
        { ended: true },
        { instance: resolved, effective: true, event: 'end', meta: { verified: true } },
      );

      // TODO (US3): real streaming backend. For now, emit `end` immediately.
      process.stdout.write(renderEnvelope(endEnvelope, 'ndjson'));
      if (Number.isFinite(max) && max <= 0) return;
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
    .description('Export captures (not implemented in v1 yet)')
    .action(async () => {
      const opts = program.opts();
      const format = (opts.format ?? 'json') as OutputFormat;
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'export';
      const err = new CliError({ code: 'UNSUPPORTED_OPERATION', message: 'captures export not implemented yet' });
      process.stderr.write(renderEnvelope(errorEnvelope('captures', action, err, { instance: resolved }), format));
      process.exitCode = 1;
    });
}

