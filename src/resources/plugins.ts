import type { Command } from 'commander';
import type { OutputFormat } from '../cli/program';

import { resolveInstanceId } from '../shared/instance-context';
import { CliError } from '../output/errors';
import { errorEnvelope, okEnvelope, warningEnvelope } from '../output/result';
import { renderEnvelope } from '../output/renderers';
import { ActionExecutor } from '../domain/action-executor';
import { PluginsService } from '../domain/plugins-service';
import type { PluginLifecycleState } from '../domain/plugins-model';

function resolvePavFlags(cmdOpts: { preview?: boolean; apply?: boolean; verify?: boolean }) {
  const preview = Boolean(cmdOpts.preview);
  const verify = Boolean(cmdOpts.verify);
  const apply = Boolean(cmdOpts.apply) || verify || (!preview && !cmdOpts.apply && !cmdOpts.verify);
  return { preview, apply, verify };
}

async function runPluginsRollback(
  executor: ActionExecutor,
  service: PluginsService,
  resolved: { id: string; name: string },
  actionId: string,
  format: string,
): Promise<void> {
  const res = await executor.executeRollback(
    { resource: 'plugins', action: 'rollback', instance: resolved },
    actionId,
    async (handle) => {
      if (!handle || typeof handle !== 'object') {
        throw new CliError({ code: 'UNSUPPORTED_OPERATION', message: 'Invalid rollback handle' });
      }
      const h = handle as any;
      if (h.type === 'plugins.install') {
        const name = String(h.name ?? '');
        const prevInstalled = Boolean(h.prev_installed);
        const prevVersion = typeof h.prev_version === 'string' ? h.prev_version : undefined;

        if (!prevInstalled) {
          return service.uninstall(name, resolved.id);
        }
        if (prevVersion) {
          return service.install(`${name}@${prevVersion}`, resolved.id);
        }
        return service.install(name, resolved.id);
      }
      if (h.type === 'plugins.uninstall') {
        const name = String(h.name ?? '');
        const prevInstalled = Boolean(h.prev_installed);
        const prevVersion = typeof h.prev_version === 'string' ? h.prev_version : undefined;
        if (!prevInstalled) return { restored: true, noop: true };
        return service.install(prevVersion ? `${name}@${prevVersion}` : name, resolved.id);
      }
      if (h.type === 'plugins.enable' || h.type === 'plugins.disable') {
        const name = String(h.name ?? '');
        const prev = (h.prev_state as PluginLifecycleState | undefined) ?? 'unknown';
        if (prev === 'enabled') return service.enable(name, resolved.id);
        if (prev === 'disabled') return service.disable(name, resolved.id);
        return { restored: true, noop: true };
      }

      throw new CliError({
        code: 'UNSUPPORTED_OPERATION',
        message: 'Unsupported rollback handle type',
        reason: String(h.type ?? '<unknown>'),
      });
    },
  );

  process.stdout.write(
    renderEnvelope(okEnvelope('plugins', 'rollback', res, { instance: resolved, effective: true }), format as OutputFormat),
  );
}

async function getPluginState(service: PluginsService, name: string, instanceId: string): Promise<PluginLifecycleState> {
  const list = await service.list(instanceId);
  return list.find((p) => p.name === name)?.state ?? 'unknown';
}

export function registerPluginsResource(program: Command): void {
  const plugins = program.command('plugins').description('Manage Whistle plugins');
  const service = new PluginsService();
  const executor = new ActionExecutor();

  plugins
    .command('list')
    .description('List installed plugins')
    .action(async () => {
      const opts = program.opts();
      const format = opts.format ?? 'json';
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'list';
      try {
        const items = await service.list(resolved.id);
        process.stdout.write(
          renderEnvelope(okEnvelope('plugins', action, { count: items.length, items }, { instance: resolved }), format),
        );
      } catch (e) {
        const err = CliError.fromUnknown(e);
        process.stderr.write(renderEnvelope(errorEnvelope('plugins', action, err, { instance: resolved }), format));
        process.exitCode = 1;
      }
    });

  plugins
    .command('inspect')
    .description('Inspect an installed plugin and show metadata')
    .argument('<name>', 'Plugin name (npm package name)')
    .action(async (name: string) => {
      const opts = program.opts();
      const format = opts.format ?? 'json';
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'inspect';
      try {
        const plugin = await service.inspect(name, resolved.id);
        process.stdout.write(renderEnvelope(okEnvelope('plugins', action, plugin, { instance: resolved }), format));
      } catch (e) {
        const err = CliError.fromUnknown(e);
        process.stderr.write(renderEnvelope(errorEnvelope('plugins', action, err, { instance: resolved }), format));
        process.exitCode = 1;
      }
    });

  plugins
    .command('install')
    .description('Install (or update) a plugin')
    .argument('[spec]', 'npm package spec, e.g. whistle.foo@1.2.3')
    .option('--preview', 'Preview without applying')
    .option('--apply', 'Apply the change')
    .option('--verify', 'Verify after apply')
    .option('--rollback <actionId>', 'Rollback a previous action instead of installing')
    .action(async (spec: string | undefined, cmdOpts: { preview?: boolean; apply?: boolean; verify?: boolean; rollback?: string }) => {
      const opts = program.opts();
      const format = opts.format ?? 'json';
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'install';
      const pav = resolvePavFlags(cmdOpts);

      if (cmdOpts.rollback) {
        try {
          await runPluginsRollback(executor, service, resolved, String(cmdOpts.rollback), format);
        } catch (e) {
          const err = CliError.fromUnknown(e);
          process.stderr.write(renderEnvelope(errorEnvelope('plugins', 'rollback', err, { instance: resolved }), format));
          process.exitCode = 1;
        }
        return;
      }

      if (!spec) {
        const err = new CliError({ code: 'PLUGIN_INVALID_IDENTIFIER', message: 'Plugin spec is required' });
        process.stderr.write(renderEnvelope(errorEnvelope('plugins', action, err, { instance: resolved }), format));
        process.exitCode = 1;
        return;
      }

      try {
        const prev = await service.inspect(spec, resolved.id).catch(() => null);
        const prevInstalled = Boolean(prev);
        const prevVersion = prev?.version;

        const result = await executor.execute(
          { resource: 'plugins', action, instance: resolved },
          pav,
          {
            preview: async () => ({ will_install: spec }),
            apply: async () => {
              const out = await service.install(spec, resolved.id);
              return { result: out, rollback: { type: 'plugins.install', name: out.plugin.name, prev_installed: prevInstalled, prev_version: prevVersion } };
            },
            verify: async () => ({ verified: true, plugin: await service.inspect(spec, resolved.id) }),
          },
        );

        process.stdout.write(
          renderEnvelope(
            okEnvelope('plugins', action, result, {
              instance: resolved,
              effective: pav.apply ? true : false,
              meta: { preview: pav.preview, verified: pav.verify, action_id: result.action_id },
            }),
            format,
          ),
        );
      } catch (e) {
        const err = CliError.fromUnknown(e);
        process.stderr.write(renderEnvelope(errorEnvelope('plugins', action, err, { instance: resolved }), format));
        process.exitCode = 1;
      }
    });

  plugins
    .command('uninstall')
    .description('Uninstall a plugin')
    .argument('[name]', 'Plugin name (npm package name)')
    .option('--preview', 'Preview without applying')
    .option('--apply', 'Apply the change')
    .option('--verify', 'Verify after apply')
    .option('--rollback <actionId>', 'Rollback a previous action instead of uninstalling')
    .action(async (name: string | undefined, cmdOpts: { preview?: boolean; apply?: boolean; verify?: boolean; rollback?: string }) => {
      const opts = program.opts();
      const format = opts.format ?? 'json';
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'uninstall';
      const pav = resolvePavFlags(cmdOpts);

      if (cmdOpts.rollback) {
        try {
          await runPluginsRollback(executor, service, resolved, String(cmdOpts.rollback), format);
        } catch (e) {
          const err = CliError.fromUnknown(e);
          process.stderr.write(renderEnvelope(errorEnvelope('plugins', 'rollback', err, { instance: resolved }), format));
          process.exitCode = 1;
        }
        return;
      }

      if (!name) {
        const err = new CliError({ code: 'PLUGIN_INVALID_IDENTIFIER', message: 'Plugin name is required' });
        process.stderr.write(renderEnvelope(errorEnvelope('plugins', action, err, { instance: resolved }), format));
        process.exitCode = 1;
        return;
      }

      try {
        const prev = await service.inspect(name, resolved.id).catch(() => null);
        const prevInstalled = Boolean(prev);
        const prevVersion = prev?.version;

        type UninstallResult = {
          uninstalled: boolean;
          already_absent?: boolean;
          raw?: { stdout: string; stderr: string };
        };

        const result = await executor.execute(
          { resource: 'plugins', action, instance: resolved },
          pav,
          {
            preview: async () => ({ will_uninstall: name }),
            apply: async () => {
              if (!prevInstalled) {
                const out: UninstallResult = { uninstalled: false, already_absent: true };
                return { result: out, rollback: { type: 'plugins.uninstall', name, prev_installed: false } };
              }
              const out = await service.uninstall(name, resolved.id);
              const res: UninstallResult = { uninstalled: out.uninstalled, raw: out.raw };
              return { result: res, rollback: { type: 'plugins.uninstall', name, prev_installed: true, prev_version: prevVersion } };
            },
            verify: async () => {
              const exists = await service.inspect(name, resolved.id).then(() => true).catch(() => false);
              return { removed: !exists };
            },
          },
        );

        if (result.apply_result?.already_absent) {
          process.stdout.write(
            renderEnvelope(
              warningEnvelope('plugins', action, result, ['PLUGIN_NOT_INSTALLED'], {
                instance: resolved,
                effective: true,
                meta: { preview: pav.preview, verified: pav.verify, action_id: result.action_id },
              }),
              format,
            ),
          );
          return;
        }

        process.stdout.write(
          renderEnvelope(
            okEnvelope('plugins', action, result, {
              instance: resolved,
              effective: pav.apply ? true : false,
              meta: { preview: pav.preview, verified: pav.verify, action_id: result.action_id },
            }),
            format,
          ),
        );
      } catch (e) {
        const err = CliError.fromUnknown(e);
        process.stderr.write(renderEnvelope(errorEnvelope('plugins', action, err, { instance: resolved }), format));
        process.exitCode = 1;
      }
    });

  plugins
    .command('enable')
    .description('Enable a plugin')
    .argument('[name]', 'Plugin name (npm package name)')
    .option('--preview', 'Preview without applying')
    .option('--apply', 'Apply the change')
    .option('--verify', 'Verify after apply')
    .option('--rollback <actionId>', 'Rollback a previous action instead of enabling')
    .action(async (name: string | undefined, cmdOpts: { preview?: boolean; apply?: boolean; verify?: boolean; rollback?: string }) => {
      const opts = program.opts();
      const format = opts.format ?? 'json';
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'enable';
      const pav = resolvePavFlags(cmdOpts);

      if (cmdOpts.rollback) {
        try {
          await runPluginsRollback(executor, service, resolved, String(cmdOpts.rollback), format);
        } catch (e) {
          const err = CliError.fromUnknown(e);
          process.stderr.write(renderEnvelope(errorEnvelope('plugins', 'rollback', err, { instance: resolved }), format));
          process.exitCode = 1;
        }
        return;
      }

      if (!name) {
        const err = new CliError({ code: 'PLUGIN_INVALID_IDENTIFIER', message: 'Plugin name is required' });
        process.stderr.write(renderEnvelope(errorEnvelope('plugins', action, err, { instance: resolved }), format));
        process.exitCode = 1;
        return;
      }

      try {
        const prevState = await getPluginState(service, name, resolved.id);
        const result = await executor.execute(
          { resource: 'plugins', action, instance: resolved },
          pav,
          {
            preview: async () => ({ will_enable: name }),
            apply: async () => {
              const out = await service.enable(name, resolved.id);
              return { result: out, rollback: { type: 'plugins.enable', name, prev_state: prevState } };
            },
            verify: async () => ({ state: await getPluginState(service, name, resolved.id) }),
          },
        );

        process.stdout.write(
          renderEnvelope(
            okEnvelope('plugins', action, result, {
              instance: resolved,
              effective: pav.apply ? true : false,
              meta: { preview: pav.preview, verified: pav.verify, action_id: result.action_id },
            }),
            format,
          ),
        );
      } catch (e) {
        const err = CliError.fromUnknown(e);
        process.stderr.write(renderEnvelope(errorEnvelope('plugins', action, err, { instance: resolved }), format));
        process.exitCode = 1;
      }
    });

  plugins
    .command('disable')
    .description('Disable a plugin')
    .argument('[name]', 'Plugin name (npm package name)')
    .option('--preview', 'Preview without applying')
    .option('--apply', 'Apply the change')
    .option('--verify', 'Verify after apply')
    .option('--rollback <actionId>', 'Rollback a previous action instead of disabling')
    .action(async (name: string | undefined, cmdOpts: { preview?: boolean; apply?: boolean; verify?: boolean; rollback?: string }) => {
      const opts = program.opts();
      const format = opts.format ?? 'json';
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'disable';
      const pav = resolvePavFlags(cmdOpts);

      if (cmdOpts.rollback) {
        try {
          await runPluginsRollback(executor, service, resolved, String(cmdOpts.rollback), format);
        } catch (e) {
          const err = CliError.fromUnknown(e);
          process.stderr.write(renderEnvelope(errorEnvelope('plugins', 'rollback', err, { instance: resolved }), format));
          process.exitCode = 1;
        }
        return;
      }

      if (!name) {
        const err = new CliError({ code: 'PLUGIN_INVALID_IDENTIFIER', message: 'Plugin name is required' });
        process.stderr.write(renderEnvelope(errorEnvelope('plugins', action, err, { instance: resolved }), format));
        process.exitCode = 1;
        return;
      }

      try {
        const prevState = await getPluginState(service, name, resolved.id);
        const result = await executor.execute(
          { resource: 'plugins', action, instance: resolved },
          pav,
          {
            preview: async () => ({ will_disable: name }),
            apply: async () => {
              const out = await service.disable(name, resolved.id);
              return { result: out, rollback: { type: 'plugins.disable', name, prev_state: prevState } };
            },
            verify: async () => ({ state: await getPluginState(service, name, resolved.id) }),
          },
        );

        process.stdout.write(
          renderEnvelope(
            okEnvelope('plugins', action, result, {
              instance: resolved,
              effective: pav.apply ? true : false,
              meta: { preview: pav.preview, verified: pav.verify, action_id: result.action_id },
            }),
            format,
          ),
        );
      } catch (e) {
        const err = CliError.fromUnknown(e);
        process.stderr.write(renderEnvelope(errorEnvelope('plugins', action, err, { instance: resolved }), format));
        process.exitCode = 1;
      }
    });
}
