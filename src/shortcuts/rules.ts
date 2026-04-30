import type { Command } from 'commander';
import { resolveInstanceId } from '../shared/instance-context';
import { CliError } from '../output/errors';
import { errorEnvelope, okEnvelope } from '../output/result';
import { renderEnvelope } from '../output/renderers';
import { ActionExecutor } from '../domain/action-executor';
import { RulesService } from '../domain/rules-service';

function normalizeHeaderPairs(headers: string[]): string {
  const pairs: string[] = [];
  for (const h of headers) {
    const idx = h.indexOf('=');
    if (idx <= 0) {
      throw new CliError({
        code: 'UNSUPPORTED_OPERATION',
        message: `Invalid --header value: ${h}`,
        reason: 'Expected format: key=value',
      });
    }
    const key = h.slice(0, idx).trim();
    const value = h.slice(idx + 1);
    if (!key) {
      throw new CliError({
        code: 'UNSUPPORTED_OPERATION',
        message: `Invalid --header value: ${h}`,
        reason: 'Header key is empty',
      });
    }
    // Keep raw value (may be empty). For complex values, use rules import with a JSON file.
    pairs.push(`${key}=${value}`);
  }
  return pairs.join('&');
}

function buildRuleLine(match: string, action: string): string {
  const m = match.trim();
  const a = action.trim();
  if (!m || !a) {
    throw new CliError({
      code: 'UNSUPPORTED_OPERATION',
      message: 'match/action cannot be empty',
    });
  }
  return `${m} ${a}\n`;
}

export function registerRulesShortcuts(program: Command): void {
  const rule = program.command('rule').description('AI-friendly rule shortcuts');
  const executor = new ActionExecutor();
  const rules = new RulesService();

  rule
    .command('set-header')
    .description('Shortcut: append a reqHeaders rule')
    .requiredOption('--match <pattern>', 'Rule matcher pattern (e.g. www.example.com/api)')
    .option('--target <ruleset>', 'Target rule set id or name (default: whistle-cli)', 'whistle-cli')
    .option('--header <k=v>', 'Header pair, repeatable', (v, acc: string[]) => {
      acc.push(v);
      return acc;
    }, [])
    .option('--ref <ref>', 'Use a Values key or file/url reference for reqHeaders payload (e.g. {k} or /abs/path.json)')
    .option('--preview', 'Preview without applying')
    .option('--apply', 'Apply the change')
    .option('--verify', 'Verify after apply')
    .action(
      async (cmdOpts: {
        match: string;
        target: string;
        header: string[];
        ref?: string;
        preview?: boolean;
        apply?: boolean;
        verify?: boolean;
      }) => {
        const opts = program.opts();
        const format = opts.format ?? 'json';
        const resolved = await resolveInstanceId(opts.instance);
        const action = 'set-header';

        try {
          const pav = {
            preview: Boolean(cmdOpts.preview),
            verify: Boolean(cmdOpts.verify),
            apply: Boolean(cmdOpts.apply) || Boolean(cmdOpts.verify) || (!cmdOpts.preview && !cmdOpts.apply && !cmdOpts.verify),
          };

          const targetRuleSet = await rules.ensureRuleSetByName(cmdOpts.target, resolved.id);
          const payload = cmdOpts.ref?.trim() ? cmdOpts.ref.trim() : normalizeHeaderPairs(cmdOpts.header);
          const ruleLine = buildRuleLine(cmdOpts.match, `reqHeaders://${payload}`);

          const result = await executor.execute(
            { resource: 'rules', action, instance: resolved },
            pav,
            {
              preview: async () => rules.planPatchFromText(targetRuleSet.file_id, ruleLine, 'append', resolved.id),
              apply: async () => {
                const plan = await rules.planPatchFromText(targetRuleSet.file_id, ruleLine, 'append', resolved.id);
                const out = await rules.applyPlannedPatch(plan, ruleLine, resolved.id);
                return { result: { target: targetRuleSet, plan, apply: out } };
              },
              verify: async () => rules.verify(targetRuleSet.file_id, resolved.id),
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
      },
    );

  rule
    .command('map-local')
    .description('Shortcut: append a file:// rule mapping to local path or values ref')
    .requiredOption('--match <pattern>', 'Rule matcher pattern (e.g. www.example.com/static)')
    .requiredOption('--to <target>', 'Mapping target (e.g. /abs/dir, D:\\dir, {valuesKey}, or (inline))')
    .option('--target <ruleset>', 'Target rule set id or name (default: whistle-cli)', 'whistle-cli')
    .option('--preview', 'Preview without applying')
    .option('--apply', 'Apply the change')
    .option('--verify', 'Verify after apply')
    .action(
      async (cmdOpts: {
        match: string;
        to: string;
        target: string;
        preview?: boolean;
        apply?: boolean;
        verify?: boolean;
      }) => {
        const opts = program.opts();
        const format = opts.format ?? 'json';
        const resolved = await resolveInstanceId(opts.instance);
        const action = 'map-local';

        try {
          const pav = {
            preview: Boolean(cmdOpts.preview),
            verify: Boolean(cmdOpts.verify),
            apply: Boolean(cmdOpts.apply) || Boolean(cmdOpts.verify) || (!cmdOpts.preview && !cmdOpts.apply && !cmdOpts.verify),
          };

          const targetRuleSet = await rules.ensureRuleSetByName(cmdOpts.target, resolved.id);
          const ruleLine = buildRuleLine(cmdOpts.match, `file://${cmdOpts.to.trim()}`);

          const result = await executor.execute(
            { resource: 'rules', action, instance: resolved },
            pav,
            {
              preview: async () => rules.planPatchFromText(targetRuleSet.file_id, ruleLine, 'append', resolved.id),
              apply: async () => {
                const plan = await rules.planPatchFromText(targetRuleSet.file_id, ruleLine, 'append', resolved.id);
                const out = await rules.applyPlannedPatch(plan, ruleLine, resolved.id);
                return { result: { target: targetRuleSet, plan, apply: out } };
              },
              verify: async () => rules.verify(targetRuleSet.file_id, resolved.id),
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
      },
    );
}

