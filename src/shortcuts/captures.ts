import type { Command } from 'commander';
import { resolveInstanceId } from '../shared/instance-context';
import { CliError } from '../output/errors';
import { errorEnvelope, okEnvelope } from '../output/result';
import { renderEnvelope } from '../output/renderers';
import { CapturesService } from '../domain/captures-service';

export function registerCapturesShortcuts(program: Command): void {
  const capture = program.command('capture').description('AI-friendly capture shortcuts');
  const service = new CapturesService();

  capture
    .command('find')
    .description('Shortcut: captures find')
    .option('--host <host>', 'Filter by host')
    .option('--path <path>', 'Filter by request path substring')
    .option('--method <method>', 'Filter by HTTP method')
    .option('--status <status>', 'Filter by status code')
    .option('--keyword <keyword>', 'Search keyword')
    .option('--limit <n>', 'Max items', '30')
    .action(async (cmdOpts: any) => {
      const opts = program.opts();
      const format = opts.format ?? 'json';
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

  capture
    .command('find-error')
    .description('Shortcut: find likely error captures')
    .option('--host <host>', 'Filter by host')
    .option('--keyword <keyword>', 'Search keyword')
    .option('--status <status>', 'Status code (default: 500)', '500')
    .option('--limit <n>', 'Max items', '30')
    .action(async (cmdOpts: any) => {
      const opts = program.opts();
      const format = opts.format ?? 'json';
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'find-error';
      try {
        const filters = {
          host: cmdOpts.host ? String(cmdOpts.host) : undefined,
          keyword: cmdOpts.keyword ? String(cmdOpts.keyword) : undefined,
          status: Number(cmdOpts.status ?? 500),
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
}

