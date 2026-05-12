import type { Command } from 'commander';
import type { OutputFormat } from '../cli/program';
import { resolveInstanceId } from '../shared/instance-context';
import { CliError } from '../output/errors';
import { errorEnvelope, okEnvelope } from '../output/result';
import { renderEnvelope } from '../output/renderers';
import { RulesService } from '../domain/rules-service';
import { ActionExecutor } from '../domain/action-executor';
import fs from 'node:fs/promises';

function resolvePavFlags(cmdOpts: { preview?: boolean; apply?: boolean; verify?: boolean }) {
  const preview = Boolean(cmdOpts.preview);
  const verify = Boolean(cmdOpts.verify);
  const apply = Boolean(cmdOpts.apply) || verify || (!preview && !cmdOpts.apply && !cmdOpts.verify);
  return { preview, apply, verify };
}

async function runRulesRollback(
  executor: ActionExecutor,
  service: RulesService,
  resolved: { id: string; name: string },
  actionId: string,
  format: string,
): Promise<void> {
  const res = await executor.executeRollback(
    { resource: 'rules', action: 'rollback', instance: resolved },
    actionId,
    async (handle) => {
      if (!handle || typeof handle !== 'object') {
        throw new CliError({ code: 'UNSUPPORTED_OPERATION', message: 'Invalid rollback handle' });
      }
      const h = handle as any;
      if (h.type === 'rules.patch') {
        const file_id = String(h.file_id);
        const prev_text = String(h.prev_text ?? '');
        const plan = await service.planPatchFromText(file_id, prev_text, 'replace', resolved.id);
        const out = await service.applyPlannedPatch(plan, prev_text, resolved.id);
        return { rolled_back: true, kind: 'patch', file_id, result: out };
      }
      if (h.type === 'rules.import') {
        const file_id = String(h.file_id);
        const out = await service.removeRuleSet(file_id, resolved.id);
        return { rolled_back: true, kind: 'import', file_id, result: out };
      }
      if (h.type === 'rules.enable' || h.type === 'rules.disable') {
        const file_id = String(h.file_id);
        const prev_enabled = Boolean(h.prev_enabled);
        const out = await service.setEnabled(file_id, prev_enabled, resolved.id);
        return { rolled_back: true, kind: 'enabled', file_id, prev_enabled, result: out };
      }
      if (h.type === 'rules.default') {
        const prev_text = String(h.prev_text ?? '');
        const prev_disabled = Boolean(h.prev_disabled);
        const instanceId = typeof h.instanceId === 'string' ? h.instanceId : resolved.id;
        const out = await service.applyRuntimeDefaultRules(prev_text, instanceId, { verify: true, selected: !prev_disabled });
        return { rolled_back: true, kind: 'default', prev_disabled, result: out };
      }

      throw new CliError({
        code: 'UNSUPPORTED_OPERATION',
        message: 'Unsupported rollback handle type',
        reason: String(h.type ?? '<unknown>'),
      });
    },
  );

  process.stdout.write(
    renderEnvelope(okEnvelope('rules', 'rollback', res, { instance: resolved, effective: true }), format as OutputFormat),
  );
}

export function registerRulesResource(program: Command): void {
  const rules = program.command('rules').description('Manage Whistle rules');
  const service = new RulesService();
  const executor = new ActionExecutor();
  const defaultRules = rules.command('default').description('Manage runtime default Whistle rules');

  defaultRules
    .command('get')
    .description('Get runtime default rules from Whistle Web')
    .action(async () => {
      const opts = program.opts();
      const format = opts.format ?? 'json';
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'default-get';

      try {
        const data = await service.getRuntimeDefaultRules(resolved.id);
        process.stdout.write(renderEnvelope(okEnvelope('rules', action, data, { instance: resolved, effective: true }), format));
      } catch (e) {
        const err = CliError.fromUnknown(e);
        process.stderr.write(renderEnvelope(errorEnvelope('rules', action, err, { instance: resolved }), format));
        process.exitCode = 1;
      }
    });

  defaultRules
    .command('apply')
    .description('Apply runtime default rules through Whistle Web')
    .requiredOption('--file <path>', 'Path to complete default rules text')
    .option('--preview', 'Preview without applying')
    .option('--apply', 'Apply the change')
    .option('--verify', 'Verify after apply')
    .action(async (cmdOpts: { file: string; preview?: boolean; apply?: boolean; verify?: boolean }) => {
      const opts = program.opts();
      const format = opts.format ?? 'json';
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'default-apply';
      const pav = resolvePavFlags(cmdOpts);

      try {
        const text = await fs.readFile(cmdOpts.file, 'utf8');
        const result = await executor.execute(
          { resource: 'rules', action, instance: resolved },
          pav,
          {
            preview: async () => ({ backend: 'whistle-web' as const, bytes: Buffer.byteLength(text, 'utf8') }),
            apply: async () => {
              const before = await service.getRuntimeDefaultRules(resolved.id);
              return {
                result: await service.applyRuntimeDefaultRules(text, resolved.id, { verify: pav.verify, selected: true }),
                rollback: { type: 'rules.default', prev_text: before.source_text, prev_disabled: before.disabled, instanceId: resolved.id },
              };
            },
            verify: async () => service.getRuntimeDefaultRules(resolved.id),
          },
        );

        process.stdout.write(
          renderEnvelope(
            okEnvelope('rules', action, result, {
              instance: resolved,
              effective: pav.apply ? true : false,
              meta: { preview: pav.preview, verified: pav.verify, action_id: result.action_id },
            }),
            format,
          ),
        );
      } catch (e) {
        const err = CliError.fromUnknown(e);
        process.stderr.write(renderEnvelope(errorEnvelope('rules', action, err, { instance: resolved }), format));
        process.exitCode = 1;
      }
    });

  rules
    .command('rollback')
    .description('Rollback a previously logged rules mutation')
    .requiredOption('--action-id <id>', 'Action id to rollback')
    .action(async (cmdOpts: { actionId: string }) => {
      const opts = program.opts();
      const format = opts.format ?? 'json';
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'rollback';

      try {
        await runRulesRollback(executor, service, resolved, cmdOpts.actionId, format);
      } catch (e) {
        const err = CliError.fromUnknown(e);
        process.stderr.write(renderEnvelope(errorEnvelope('rules', action, err, { instance: resolved }), format));
        process.exitCode = 1;
      }
    });

  rules
    .command('patch')
    .description('Preview a rule patch without applying')
    .requiredOption('--id <id>', 'Rule file id or name')
    .requiredOption('--file <path>', 'Path to patch content (text)')
    .option('--mode <mode>', 'Patch mode: replace|append', 'replace')
    .action(async (cmdOpts: { id: string; file: string; mode: string }) => {
      const opts = program.opts();
      const format = opts.format ?? 'json';
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'patch';

      try {
        const patchText = await fs.readFile(cmdOpts.file, 'utf8');
        const mode = (cmdOpts.mode === 'append' ? 'append' : 'replace') as 'append' | 'replace';
        const plan = await service.planPatchFromText(cmdOpts.id, patchText, mode, resolved.id);
        process.stdout.write(
          renderEnvelope(
            okEnvelope('rules', action, { plan }, { instance: resolved, effective: false, meta: { preview: true } }),
            format,
          ),
        );
      } catch (e) {
        const err = CliError.fromUnknown(e);
        process.stderr.write(renderEnvelope(errorEnvelope('rules', action, err, { instance: resolved }), format));
        process.exitCode = 1;
      }
    });

  rules
    .command('import')
    .description('Import a rule set from a file (creates a new rule set)')
    .requiredOption('--name <name>', 'Rule set name')
    .requiredOption('--file <path>', 'Path to rule text file')
    .option('--preview', 'Preview without applying')
    .option('--apply', 'Apply the change')
    .option('--verify', 'Verify after apply')
    .option('--rollback <actionId>', 'Rollback a previous action instead of importing')
    .action(async (cmdOpts: { name: string; file: string; preview?: boolean; apply?: boolean; verify?: boolean }) => {
      const opts = program.opts();
      const format = opts.format ?? 'json';
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'import';
      const pav = resolvePavFlags(cmdOpts);

      if ((cmdOpts as any).rollback) {
        try {
          await runRulesRollback(executor, service, resolved, String((cmdOpts as any).rollback), format);
        } catch (e) {
          const err = CliError.fromUnknown(e);
          process.stderr.write(renderEnvelope(errorEnvelope('rules', 'rollback', err, { instance: resolved }), format));
          process.exitCode = 1;
        }
        return;
      }

      try {
        const text = await fs.readFile(cmdOpts.file, 'utf8');
        const bytes = Buffer.byteLength(text, 'utf8');

        const result = await executor.execute(
          { resource: 'rules', action, instance: resolved },
          pav,
          {
            preview: async () => ({ will_import: { name: cmdOpts.name, from: cmdOpts.file, bytes } }),
            apply: async () => {
              const rule = await service.create(cmdOpts.name, text, resolved.id);
              return {
                result: { created: true, rule },
                rollback: { type: 'rules.import', file_id: rule.file_id, instanceId: resolved.id },
              };
            },
            verify: async () => ({ ok: true }),
          },
        );

        process.stdout.write(
          renderEnvelope(
            okEnvelope('rules', action, result, {
              instance: resolved,
              effective: pav.apply ? true : false,
              meta: { preview: pav.preview, verified: pav.verify, action_id: result.action_id },
            }),
            format,
          ),
        );
      } catch (e) {
        const err = CliError.fromUnknown(e);
        process.stderr.write(renderEnvelope(errorEnvelope('rules', action, err, { instance: resolved }), format));
        process.exitCode = 1;
      }
    });

  rules
    .command('export')
    .description('Export a rule set to a file')
    .requiredOption('--id <id>', 'Rule file id or name')
    .requiredOption('--out <path>', 'Output file path')
    .option('--preview', 'Preview without applying')
    .option('--apply', 'Write the file')
    .option('--verify', 'Verify after write')
    .option('--rollback <actionId>', 'Rollback a previous action instead of exporting')
    .action(async (cmdOpts: { id: string; out: string; preview?: boolean; apply?: boolean; verify?: boolean }) => {
      const opts = program.opts();
      const format = opts.format ?? 'json';
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'export';
      const pav = resolvePavFlags(cmdOpts);

      if ((cmdOpts as any).rollback) {
        try {
          await runRulesRollback(executor, service, resolved, String((cmdOpts as any).rollback), format);
        } catch (e) {
          const err = CliError.fromUnknown(e);
          process.stderr.write(renderEnvelope(errorEnvelope('rules', 'rollback', err, { instance: resolved }), format));
          process.exitCode = 1;
        }
        return;
      }

      try {
        const result = await executor.execute(
          { resource: 'rules', action, instance: resolved },
          pav,
          {
            preview: async () => ({ will_export: { id: cmdOpts.id, out: cmdOpts.out } }),
            apply: async () => {
              const out = await service.exportToFile(cmdOpts.id, cmdOpts.out, resolved.id);
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
            okEnvelope('rules', action, result, {
              instance: resolved,
              effective: pav.apply ? true : false,
              meta: { preview: pav.preview, verified: pav.verify, action_id: result.action_id },
            }),
            format,
          ),
        );
      } catch (e) {
        const err = CliError.fromUnknown(e);
        process.stderr.write(renderEnvelope(errorEnvelope('rules', action, err, { instance: resolved }), format));
        process.exitCode = 1;
      }
    });

  rules
    .command('apply')
    .description('Apply a rule patch')
    .requiredOption('--id <id>', 'Rule file id or name')
    .requiredOption('--file <path>', 'Path to patch content (text)')
    .option('--mode <mode>', 'Patch mode: replace|append', 'replace')
    .option('--preview', 'Preview without applying')
    .option('--apply', 'Apply the change')
    .option('--verify', 'Verify after apply')
    .option('--rollback <actionId>', 'Rollback a previous action instead of applying')
    .action(async (cmdOpts: { id: string; file: string; mode: string; preview?: boolean; apply?: boolean; verify?: boolean }) => {
      const opts = program.opts();
      const format = opts.format ?? 'json';
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'apply';
      const pav = resolvePavFlags(cmdOpts);

      if ((cmdOpts as any).rollback) {
        try {
          await runRulesRollback(executor, service, resolved, String((cmdOpts as any).rollback), format);
        } catch (e) {
          const err = CliError.fromUnknown(e);
          process.stderr.write(renderEnvelope(errorEnvelope('rules', 'rollback', err, { instance: resolved }), format));
          process.exitCode = 1;
        }
        return;
      }

      try {
        const patchText = await fs.readFile(cmdOpts.file, 'utf8');
        const mode = (cmdOpts.mode === 'append' ? 'append' : 'replace') as 'append' | 'replace';

        const result = await executor.execute(
          { resource: 'rules', action, instance: resolved },
          pav,
          {
            preview: async () => service.planPatchFromText(cmdOpts.id, patchText, mode, resolved.id),
            apply: async () => {
              const before = await service.get(cmdOpts.id, resolved.id);
              const prev_text = before.source_text ?? '';
              const plan = await service.planPatchFromText(cmdOpts.id, patchText, mode, resolved.id);
              const out = await service.applyPlannedPatch(plan, patchText, resolved.id);
              return {
                result: out,
                rollback: { type: 'rules.patch', file_id: plan.file_id, prev_text, instanceId: resolved.id },
              };
            },
            verify: async () => service.verify(cmdOpts.id, resolved.id),
          },
        );

        process.stdout.write(
          renderEnvelope(
            okEnvelope('rules', action, result, {
              instance: resolved,
              effective: pav.apply ? true : false,
              meta: { preview: pav.preview, verified: pav.verify, action_id: result.action_id },
            }),
            format,
          ),
        );
      } catch (e) {
        const err = CliError.fromUnknown(e);
        process.stderr.write(renderEnvelope(errorEnvelope('rules', action, err, { instance: resolved }), format));
        process.exitCode = 1;
      }
    });

  rules
    .command('verify')
    .description('Verify rule set readability (v1 local check)')
    .requiredOption('--id <id>', 'Rule file id or name')
    .action(async (cmdOpts: { id: string }) => {
      const opts = program.opts();
      const format = opts.format ?? 'json';
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'verify';

      try {
        const data = await service.verify(cmdOpts.id, resolved.id);
        process.stdout.write(renderEnvelope(okEnvelope('rules', action, data, { instance: resolved, effective: data.ok }), format));
      } catch (e) {
        const err = CliError.fromUnknown(e);
        process.stderr.write(renderEnvelope(errorEnvelope('rules', action, err, { instance: resolved }), format));
        process.exitCode = 1;
      }
    });

  rules
    .command('list')
    .description('List rule sets')
    .option('--with-text', 'Include rule text (may be large)', false)
    .action(async (cmdOpts: { withText?: boolean }) => {
      const opts = program.opts();
      const format = opts.format ?? 'json';
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'list';
      try {
        const data = await service.list(resolved.id, { includeText: Boolean(cmdOpts.withText) });
        process.stdout.write(renderEnvelope(okEnvelope('rules', action, { rules: data }, { instance: resolved }), format));
      } catch (e) {
        const err = CliError.fromUnknown(e);
        process.stderr.write(renderEnvelope(errorEnvelope('rules', action, err, { instance: resolved }), format));
        process.exitCode = 1;
      }
    });

  rules
    .command('get')
    .description('Get one rule set')
    .requiredOption('--id <id>', 'Rule file id or name')
    .action(async (cmdOpts: { id: string }) => {
      const opts = program.opts();
      const format = opts.format ?? 'json';
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'get';
      try {
        const data = await service.get(cmdOpts.id, resolved.id);
        process.stdout.write(renderEnvelope(okEnvelope('rules', action, data, { instance: resolved }), format));
      } catch (e) {
        const err = CliError.fromUnknown(e);
        process.stderr.write(renderEnvelope(errorEnvelope('rules', action, err, { instance: resolved }), format));
        process.exitCode = 1;
      }
    });

  rules
    .command('enable')
    .description('Enable a rule set')
    .requiredOption('--id <id>', 'Rule file id or name')
    .option('--preview', 'Preview without applying')
    .option('--apply', 'Apply the change')
    .option('--verify', 'Verify after apply')
    .option('--rollback <actionId>', 'Rollback a previous action instead of enabling')
    .action(async (cmdOpts: { id: string; preview?: boolean; apply?: boolean; verify?: boolean }) => {
      const opts = program.opts();
      const format = opts.format ?? 'json';
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'enable';
      const pav = resolvePavFlags(cmdOpts);

      if ((cmdOpts as any).rollback) {
        try {
          await runRulesRollback(executor, service, resolved, String((cmdOpts as any).rollback), format);
        } catch (e) {
          const err = CliError.fromUnknown(e);
          process.stderr.write(renderEnvelope(errorEnvelope('rules', 'rollback', err, { instance: resolved }), format));
          process.exitCode = 1;
        }
        return;
      }

      try {
        const result = await executor.execute(
          { resource: 'rules', action, instance: resolved },
          pav,
          {
            preview: async () => ({ will_enable: cmdOpts.id }),
            apply: async () => {
              const before = await service.get(cmdOpts.id, resolved.id);
              const out = await service.setEnabled(cmdOpts.id, true, resolved.id);
              return {
                result: out,
                rollback: { type: 'rules.enable', file_id: before.file_id, prev_enabled: before.enabled, instanceId: resolved.id },
              };
            },
            verify: async () => service.get(cmdOpts.id, resolved.id),
          },
        );

        process.stdout.write(
          renderEnvelope(
            okEnvelope('rules', action, result, {
              instance: resolved,
              effective: pav.apply ? true : false,
              meta: { preview: pav.preview, verified: pav.verify, action_id: result.action_id },
            }),
            format,
          ),
        );
      } catch (e) {
        const err = CliError.fromUnknown(e);
        process.stderr.write(renderEnvelope(errorEnvelope('rules', action, err, { instance: resolved }), format));
        process.exitCode = 1;
      }
    });

  rules
    .command('disable')
    .description('Disable a rule set')
    .requiredOption('--id <id>', 'Rule file id or name')
    .option('--preview', 'Preview without applying')
    .option('--apply', 'Apply the change')
    .option('--verify', 'Verify after apply')
    .option('--rollback <actionId>', 'Rollback a previous action instead of disabling')
    .action(async (cmdOpts: { id: string; preview?: boolean; apply?: boolean; verify?: boolean }) => {
      const opts = program.opts();
      const format = opts.format ?? 'json';
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'disable';
      const pav = resolvePavFlags(cmdOpts);

      if ((cmdOpts as any).rollback) {
        try {
          await runRulesRollback(executor, service, resolved, String((cmdOpts as any).rollback), format);
        } catch (e) {
          const err = CliError.fromUnknown(e);
          process.stderr.write(renderEnvelope(errorEnvelope('rules', 'rollback', err, { instance: resolved }), format));
          process.exitCode = 1;
        }
        return;
      }

      try {
        const result = await executor.execute(
          { resource: 'rules', action, instance: resolved },
          pav,
          {
            preview: async () => ({ will_disable: cmdOpts.id }),
            apply: async () => {
              const before = await service.get(cmdOpts.id, resolved.id);
              const out = await service.setEnabled(cmdOpts.id, false, resolved.id);
              return {
                result: out,
                rollback: { type: 'rules.disable', file_id: before.file_id, prev_enabled: before.enabled, instanceId: resolved.id },
              };
            },
            verify: async () => service.get(cmdOpts.id, resolved.id),
          },
        );

        process.stdout.write(
          renderEnvelope(
            okEnvelope('rules', action, result, {
              instance: resolved,
              effective: pav.apply ? true : false,
              meta: { preview: pav.preview, verified: pav.verify, action_id: result.action_id },
            }),
            format,
          ),
        );
      } catch (e) {
        const err = CliError.fromUnknown(e);
        process.stderr.write(renderEnvelope(errorEnvelope('rules', action, err, { instance: resolved }), format));
        process.exitCode = 1;
      }
    });
}
