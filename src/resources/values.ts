import type { Command } from 'commander';
import fs from 'node:fs/promises';
import { resolveInstanceId } from '../shared/instance-context';
import { CliError } from '../output/errors';
import { errorEnvelope, okEnvelope } from '../output/result';
import { renderEnvelope } from '../output/renderers';
import { ValuesService } from '../domain/values-service';
import { ActionExecutor } from '../domain/action-executor';

function resolvePavFlags(cmdOpts: { preview?: boolean; apply?: boolean; verify?: boolean }) {
  const preview = Boolean(cmdOpts.preview);
  const verify = Boolean(cmdOpts.verify);
  const apply = Boolean(cmdOpts.apply) || verify || (!preview && !cmdOpts.apply && !cmdOpts.verify);
  return { preview, apply, verify };
}

export function registerValuesResource(program: Command): void {
  const values = program.command('values').description('Manage Whistle values');
  const service = new ValuesService();
  const executor = new ActionExecutor();

  values
    .command('rollback')
    .description('Rollback a previously logged values mutation')
    .requiredOption('--action-id <id>', 'Action id to rollback')
    .action(async (cmdOpts: { actionId: string }) => {
      const opts = program.opts();
      const format = opts.format ?? 'json';
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'rollback';

      try {
        const res = await executor.executeRollback(
          { resource: 'values', action, instance: resolved },
          cmdOpts.actionId,
          async (handle) => {
            if (!handle || typeof handle !== 'object') {
              throw new CliError({ code: 'UNSUPPORTED_OPERATION', message: 'Invalid rollback handle' });
            }
            const h = handle as any;
            if (h.type === 'values.restore') {
              const snapshot = h.snapshot as any;
              return service.restore(snapshot, resolved.id);
            }
            throw new CliError({
              code: 'UNSUPPORTED_OPERATION',
              message: 'Unsupported rollback handle type',
              reason: String(h.type ?? '<unknown>'),
            });
          },
        );

        process.stdout.write(renderEnvelope(okEnvelope('values', action, res, { instance: resolved, effective: true }), format));
      } catch (e) {
        const err = CliError.fromUnknown(e);
        process.stderr.write(renderEnvelope(errorEnvelope('values', action, err, { instance: resolved }), format));
        process.exitCode = 1;
      }
    });

  values
    .command('list')
    .description('List values')
    .action(async () => {
      const opts = program.opts();
      const format = opts.format ?? 'json';
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'list';
      try {
        const data = await service.list(resolved.id);
        process.stdout.write(renderEnvelope(okEnvelope('values', action, { values: data }, { instance: resolved }), format));
      } catch (e) {
        const err = CliError.fromUnknown(e);
        process.stderr.write(renderEnvelope(errorEnvelope('values', action, err, { instance: resolved }), format));
        process.exitCode = 1;
      }
    });

  values
    .command('get')
    .description('Get a value entry')
    .requiredOption('--key <key>', 'Value key')
    .action(async (cmdOpts: { key: string }) => {
      const opts = program.opts();
      const format = opts.format ?? 'json';
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'get';
      try {
        const data = await service.get(cmdOpts.key, resolved.id);
        process.stdout.write(renderEnvelope(okEnvelope('values', action, data, { instance: resolved }), format));
      } catch (e) {
        const err = CliError.fromUnknown(e);
        process.stderr.write(renderEnvelope(errorEnvelope('values', action, err, { instance: resolved }), format));
        process.exitCode = 1;
      }
    });

  values
    .command('set')
    .description('Create or update a value entry')
    .requiredOption('--key <key>', 'Value key')
    .requiredOption('--value <value>', 'Value content (text)')
    .option('--preview', 'Preview without applying')
    .option('--apply', 'Apply the change')
    .option('--verify', 'Verify after apply')
    .action(async (cmdOpts: { key: string; value: string; preview?: boolean; apply?: boolean; verify?: boolean }) => {
      const opts = program.opts();
      const format = opts.format ?? 'json';
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'set';
      const pav = resolvePavFlags(cmdOpts);
      try {
        const result = await executor.execute(
          { resource: 'values', action, instance: resolved },
          pav,
          {
            preview: async () => ({ will_set: cmdOpts.key, bytes: Buffer.byteLength(cmdOpts.value, 'utf8') }),
            apply: async () => {
              const snap = await service.snapshot(cmdOpts.key, resolved.id);
              const out = await service.set(cmdOpts.key, cmdOpts.value, resolved.id);
              if (!snap.existed) snap.created_file_id = out.entry.file_id;
              return { result: out, rollback: { type: 'values.restore', snapshot: snap, instanceId: resolved.id } };
            },
            verify: async () => service.get(cmdOpts.key, resolved.id),
          },
        );

        process.stdout.write(
          renderEnvelope(
            okEnvelope('values', action, result, {
              instance: resolved,
              effective: pav.apply ? true : false,
              meta: { preview: pav.preview, verified: pav.verify, action_id: result.action_id },
            }),
            format,
          ),
        );
      } catch (e) {
        const err = CliError.fromUnknown(e);
        process.stderr.write(renderEnvelope(errorEnvelope('values', action, err, { instance: resolved }), format));
        process.exitCode = 1;
      }
    });

  values
    .command('remove')
    .description('Remove a value entry')
    .requiredOption('--key <key>', 'Value key')
    .option('--preview', 'Preview without applying')
    .option('--apply', 'Apply the change')
    .option('--verify', 'Verify after apply')
    .action(async (cmdOpts: { key: string; preview?: boolean; apply?: boolean; verify?: boolean }) => {
      const opts = program.opts();
      const format = opts.format ?? 'json';
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'remove';
      const pav = resolvePavFlags(cmdOpts);

      try {
        const result = await executor.execute(
          { resource: 'values', action, instance: resolved },
          pav,
          {
            preview: async () => ({ will_remove: cmdOpts.key }),
            apply: async () => {
              const snap = await service.snapshot(cmdOpts.key, resolved.id);
              const out = await service.remove(cmdOpts.key, resolved.id);
              return { result: out, rollback: { type: 'values.restore', snapshot: snap, instanceId: resolved.id } };
            },
            verify: async () => ({ removed: true }),
          },
        );

        process.stdout.write(
          renderEnvelope(
            okEnvelope('values', action, result, {
              instance: resolved,
              effective: pav.apply ? true : false,
              meta: { preview: pav.preview, verified: pav.verify, action_id: result.action_id },
            }),
            format,
          ),
        );
      } catch (e) {
        const err = CliError.fromUnknown(e);
        process.stderr.write(renderEnvelope(errorEnvelope('values', action, err, { instance: resolved }), format));
        process.exitCode = 1;
      }
    });

  values
    .command('import')
    .description('Import a value entry from a file')
    .requiredOption('--key <key>', 'Value key')
    .requiredOption('--file <path>', 'Input file path')
    .option('--preview', 'Preview without applying')
    .option('--apply', 'Apply the change')
    .option('--verify', 'Verify after apply')
    .action(async (cmdOpts: { key: string; file: string; preview?: boolean; apply?: boolean; verify?: boolean }) => {
      const opts = program.opts();
      const format = opts.format ?? 'json';
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'import';
      const pav = resolvePavFlags(cmdOpts);

      try {
        const fileContent = await fs.readFile(cmdOpts.file, 'utf8');
        const bytes = Buffer.byteLength(fileContent, 'utf8');

        const result = await executor.execute(
          { resource: 'values', action, instance: resolved },
          pav,
          {
            preview: async () => ({ will_import: { key: cmdOpts.key, from: cmdOpts.file, bytes } }),
            apply: async () => {
              const snap = await service.snapshot(cmdOpts.key, resolved.id);
              const out = await service.importFromFile(cmdOpts.key, cmdOpts.file, resolved.id);
              if (!snap.existed) snap.created_file_id = out.entry.file_id;
              return { result: out, rollback: { type: 'values.restore', snapshot: snap, instanceId: resolved.id } };
            },
            verify: async () => service.get(cmdOpts.key, resolved.id),
          },
        );

        process.stdout.write(
          renderEnvelope(
            okEnvelope('values', action, result, {
              instance: resolved,
              effective: pav.apply ? true : false,
              meta: { preview: pav.preview, verified: pav.verify, action_id: result.action_id },
            }),
            format,
          ),
        );
      } catch (e) {
        const err = CliError.fromUnknown(e);
        process.stderr.write(renderEnvelope(errorEnvelope('values', action, err, { instance: resolved }), format));
        process.exitCode = 1;
      }
    });

  values
    .command('export')
    .description('Export a value entry to a file')
    .requiredOption('--key <key>', 'Value key')
    .requiredOption('--out <path>', 'Output file path')
    .option('--preview', 'Preview without applying')
    .option('--apply', 'Write the file')
    .option('--verify', 'Verify after write')
    .action(async (cmdOpts: { key: string; out: string; preview?: boolean; apply?: boolean; verify?: boolean }) => {
      const opts = program.opts();
      const format = opts.format ?? 'json';
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'export';
      const pav = resolvePavFlags(cmdOpts);

      try {
        const result = await executor.execute(
          { resource: 'values', action, instance: resolved },
          pav,
          {
            preview: async () => ({ will_export: { key: cmdOpts.key, out: cmdOpts.out } }),
            apply: async () => {
              const out = await service.exportToFile(cmdOpts.key, cmdOpts.out, resolved.id);
              return { result: out };
            },
            verify: async () => {
              const st = await fs.stat(cmdOpts.out);
              return { exists: true, bytes: st.size };
            },
          },
        );

        process.stdout.write(
          renderEnvelope(
            okEnvelope('values', action, result, {
              instance: resolved,
              effective: pav.apply ? true : false,
              meta: { preview: pav.preview, verified: pav.verify, action_id: result.action_id },
            }),
            format,
          ),
        );
      } catch (e) {
        const err = CliError.fromUnknown(e);
        process.stderr.write(renderEnvelope(errorEnvelope('values', action, err, { instance: resolved }), format));
        process.exitCode = 1;
      }
    });
}
