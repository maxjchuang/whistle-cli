import type { Command } from 'commander';
import { InstanceService } from '../domain/instance-service';
import { ActionExecutor } from '../domain/action-executor';
import { StateStore } from '../backends/storage/state-store';
import { loadConfig } from '../shared/config';
import { resolveInstanceId } from '../shared/instance-context';
import { CliError } from '../output/errors';
import { errorEnvelope, okEnvelope } from '../output/result';
import { renderEnvelope } from '../output/renderers';

function resolvePavFlags(cmdOpts: { preview?: boolean; apply?: boolean; verify?: boolean }) {
  const preview = Boolean(cmdOpts.preview);
  const verify = Boolean(cmdOpts.verify);
  const apply = Boolean(cmdOpts.apply) || verify || (!preview && !cmdOpts.apply && !cmdOpts.verify);
  return { preview, apply, verify };
}

export function registerInstanceResource(program: Command): void {
  const instance = program.command('instance').description('Manage Whistle instances');
  const service = new InstanceService();
  const executor = new ActionExecutor();

  instance
    .command('status')
    .description('Show current instance status')
    .action(async () => {
      const opts = program.opts();
      const format = opts.format ?? 'json';
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'status';
      try {
        const st = await service.status(resolved.id);
        process.stdout.write(renderEnvelope(okEnvelope('instance', action, st, { instance: resolved }), format));
      } catch (e) {
        const err = CliError.fromUnknown(e);
        process.stderr.write(renderEnvelope(errorEnvelope('instance', action, err, { instance: resolved }), format));
        process.exitCode = 1;
      }
    });

  instance
    .command('start')
    .description('Start the instance')
    .option('--port <port>', 'Listening port', (v) => Number(v))
    .option('--preview', 'Preview without applying')
    .option('--apply', 'Apply the change')
    .option('--verify', 'Verify runtime status after apply')
    .action(async (cmdOpts: { port?: number; preview?: boolean; apply?: boolean; verify?: boolean }) => {
      const opts = program.opts();
      const format = opts.format ?? 'json';
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'start';
      const pav = resolvePavFlags(cmdOpts);

      try {
        const result = await executor.execute(
          { resource: 'instance', action, instance: resolved },
          pav,
          {
            preview: async () => ({ will_run: 'w2 start', port: cmdOpts.port ?? null }),
            apply: async () => {
              const res = await service.start(resolved.id, cmdOpts.port);
              return {
                result: {
                  stdout: res.stdout,
                  stderr: res.stderr,
                  exitCode: res.exitCode,
                  durationMs: res.durationMs,
                },
                rollback: { type: 'w2', args: ['stop'], instanceId: resolved.id },
              };
            },
            verify: async () => service.status(resolved.id),
          },
        );

        process.stdout.write(
          renderEnvelope(
            okEnvelope('instance', action, result, {
              instance: resolved,
              effective: pav.apply ? true : false,
              meta: { preview: pav.preview, verified: pav.verify, action_id: result.action_id },
            }),
            format,
          ),
        );
      } catch (e) {
        const err = CliError.fromUnknown(e);
        process.stderr.write(renderEnvelope(errorEnvelope('instance', action, err, { instance: resolved }), format));
        process.exitCode = 1;
      }
    });

  instance
    .command('stop')
    .description('Stop the instance')
    .option('--preview', 'Preview without applying')
    .option('--apply', 'Apply the change')
    .option('--verify', 'Verify runtime status after apply')
    .action(async (cmdOpts: { preview?: boolean; apply?: boolean; verify?: boolean }) => {
      const opts = program.opts();
      const format = opts.format ?? 'json';
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'stop';
      const pav = resolvePavFlags(cmdOpts);

      try {
        const result = await executor.execute(
          { resource: 'instance', action, instance: resolved },
          pav,
          {
            preview: async () => ({ will_run: 'w2 stop' }),
            apply: async () => {
              const res = await service.stop(resolved.id);
              return {
                result: {
                  stdout: res.stdout,
                  stderr: res.stderr,
                  exitCode: res.exitCode,
                  durationMs: res.durationMs,
                },
              };
            },
            verify: async () => service.status(resolved.id),
          },
        );

        process.stdout.write(
          renderEnvelope(
            okEnvelope('instance', action, result, {
              instance: resolved,
              effective: pav.apply ? true : false,
              meta: { preview: pav.preview, verified: pav.verify, action_id: result.action_id },
            }),
            format,
          ),
        );
      } catch (e) {
        const err = CliError.fromUnknown(e);
        process.stderr.write(renderEnvelope(errorEnvelope('instance', action, err, { instance: resolved }), format));
        process.exitCode = 1;
      }
    });

  instance
    .command('restart')
    .description('Restart the instance')
    .option('--port <port>', 'Listening port', (v) => Number(v))
    .option('--preview', 'Preview without applying')
    .option('--apply', 'Apply the change')
    .option('--verify', 'Verify runtime status after apply')
    .action(async (cmdOpts: { port?: number; preview?: boolean; apply?: boolean; verify?: boolean }) => {
      const opts = program.opts();
      const format = opts.format ?? 'json';
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'restart';
      const pav = resolvePavFlags(cmdOpts);

      try {
        const result = await executor.execute(
          { resource: 'instance', action, instance: resolved },
          pav,
          {
            preview: async () => ({ will_run: 'w2 restart', port: cmdOpts.port ?? null }),
            apply: async () => {
              const res = await service.restart(resolved.id, cmdOpts.port);
              return {
                result: {
                  stdout: res.stdout,
                  stderr: res.stderr,
                  exitCode: res.exitCode,
                  durationMs: res.durationMs,
                },
                rollback: { type: 'w2', args: ['stop'], instanceId: resolved.id },
              };
            },
            verify: async () => service.status(resolved.id),
          },
        );
        process.stdout.write(
          renderEnvelope(
            okEnvelope('instance', action, result, {
              instance: resolved,
              effective: pav.apply ? true : false,
              meta: { preview: pav.preview, verified: pav.verify, action_id: result.action_id },
            }),
            format,
          ),
        );
      } catch (e) {
        const err = CliError.fromUnknown(e);
        process.stderr.write(renderEnvelope(errorEnvelope('instance', action, err, { instance: resolved }), format));
        process.exitCode = 1;
      }
    });

  instance
    .command('list')
    .description('List known instances (best-effort)')
    .action(async () => {
      const opts = program.opts();
      const format = opts.format ?? 'json';
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'list';
      try {
        const res = await service.list(resolved.id);
        process.stdout.write(
          renderEnvelope(
            okEnvelope(
              'instance',
              action,
              {
                stdout: res.stdout,
                stderr: res.stderr,
                exitCode: res.exitCode,
                durationMs: res.durationMs,
              },
              { instance: resolved },
            ),
            format,
          ),
        );
      } catch (e) {
        const err = CliError.fromUnknown(e);
        process.stderr.write(renderEnvelope(errorEnvelope('instance', action, err, { instance: resolved }), format));
        process.exitCode = 1;
      }
    });

  instance
    .command('select')
    .description('Select current default instance')
    .requiredOption('--id <id>', 'Instance id/name')
    .action(async (cmdOpts: { id: string }) => {
      const opts = program.opts();
      const format = opts.format ?? 'json';
      const action = 'select';
      const config = loadConfig();
      const store = new StateStore(config.stateDir);
      try {
        await store.write({ current_instance_id: cmdOpts.id.trim() });
        process.stdout.write(
          renderEnvelope(
            okEnvelope(
              'instance',
              action,
              { current_instance_id: cmdOpts.id.trim() },
              { instance: { id: cmdOpts.id.trim(), name: cmdOpts.id.trim() }, effective: true },
            ),
            format,
          ),
        );
      } catch (e) {
        const err = CliError.fromUnknown(e);
        process.stderr.write(renderEnvelope(errorEnvelope('instance', action, err), format));
        process.exitCode = 1;
      }
    });
}

