import type { Command } from 'commander';

import { resolveInstanceId } from '../shared/instance-context';
import { CliError } from '../output/errors';
import { errorEnvelope, okEnvelope } from '../output/result';
import { renderEnvelope } from '../output/renderers';
import { PluginsService } from '../domain/plugins-service';

export function registerPluginsShortcuts(program: Command): void {
  const plugin = program.command('plugin').description('AI-friendly plugin shortcuts');
  const service = new PluginsService();

  plugin
    .command('install')
    .description('Shortcut: plugins install --apply')
    .argument('<spec>', 'npm package spec')
    .action(async (spec: string) => {
      const opts = program.opts();
      const format = opts.format ?? 'json';
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'install';
      try {
        const out = await service.install(spec, resolved.id);
        process.stdout.write(renderEnvelope(okEnvelope('plugins', action, out, { instance: resolved, effective: true }), format));
      } catch (e) {
        const err = CliError.fromUnknown(e);
        process.stderr.write(renderEnvelope(errorEnvelope('plugins', action, err, { instance: resolved }), format));
        process.exitCode = 1;
      }
    });

  plugin
    .command('remove')
    .description('Shortcut: plugins uninstall --apply')
    .argument('<name>', 'plugin name')
    .action(async (name: string) => {
      const opts = program.opts();
      const format = opts.format ?? 'json';
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'uninstall';
      try {
        const out = await service.uninstall(name, resolved.id);
        process.stdout.write(renderEnvelope(okEnvelope('plugins', action, out, { instance: resolved, effective: true }), format));
      } catch (e) {
        const err = CliError.fromUnknown(e);
        process.stderr.write(renderEnvelope(errorEnvelope('plugins', action, err, { instance: resolved }), format));
        process.exitCode = 1;
      }
    });

  plugin
    .command('inspect')
    .description('Shortcut: plugins inspect')
    .argument('<name>', 'plugin name')
    .action(async (name: string) => {
      const opts = program.opts();
      const format = opts.format ?? 'json';
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'inspect';
      try {
        const out = await service.inspect(name, resolved.id);
        process.stdout.write(renderEnvelope(okEnvelope('plugins', action, out, { instance: resolved }), format));
      } catch (e) {
        const err = CliError.fromUnknown(e);
        process.stderr.write(renderEnvelope(errorEnvelope('plugins', action, err, { instance: resolved }), format));
        process.exitCode = 1;
      }
    });

  plugin
    .command('invoke')
    .description('Out of scope in v1: invoke plugin-specific custom actions')
    .argument('<name>', 'plugin name')
    .argument('<action>', 'plugin action name')
    .action(async (name: string, pluginAction: string) => {
      const opts = program.opts();
      const format = opts.format ?? 'json';
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'invoke';
      const err = new CliError({
        code: 'UNSUPPORTED_OPERATION',
        message: 'Unified plugin custom-action invocation is out of scope for v1',
        reason: `Requested ${name}.${pluginAction}`,
        suggested_fix: 'Use `whistle-cli raw w2` or the Whistle UI for plugin-specific actions.',
      });
      process.stderr.write(renderEnvelope(errorEnvelope('plugins', action, err, { instance: resolved }), format));
      process.exitCode = 1;
    });
}

