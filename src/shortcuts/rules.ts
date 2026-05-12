import type { Command } from 'commander';
import { resolveInstanceId } from '../shared/instance-context';
import { CliError } from '../output/errors';
import { errorEnvelope, okEnvelope } from '../output/result';
import { renderEnvelope } from '../output/renderers';
import { ActionExecutor } from '../domain/action-executor';
import { RulesService } from '../domain/rules-service';
import { CapturesService } from '../domain/captures-service';

function parseDurationMs(input: unknown): number {
  const raw = String(input ?? '60s').trim();
  const parsed = raw.endsWith('ms') ? Number(raw.slice(0, -2)) : raw.endsWith('s') ? Number(raw.slice(0, -1)) * 1000 : Number(raw) * 1000;
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 60_000;
}

function splitHeaderPair(pair: string): { header: string; equals: string } {
  const idx = pair.indexOf('=');
  if (idx <= 0) {
    throw new CliError({
      code: 'UNSUPPORTED_OPERATION',
      message: `Invalid --header value: ${pair}`,
      reason: 'Expected format: key=value',
    });
  }
  const header = pair.slice(0, idx).trim();
  if (!header) {
    throw new CliError({
      code: 'UNSUPPORTED_OPERATION',
      message: `Invalid --header value: ${pair}`,
      reason: 'Header key is empty',
    });
  }
  return { header, equals: pair.slice(idx + 1) };
}

function unescapeRegexHost(raw: string): string {
  return raw
    .replace(/\\\./g, '.')
    .replace(/\\-/g, '-')
    .replace(/\\_/g, '_')
    .replace(/\\:/g, ':')
    .replace(/\\\//g, '/')
    .replace(/\\/g, '');
}

function hostFromMatch(match: string): string | undefined {
  const raw = match.trim();

  const direct = raw.match(/^https?:\/\/([^/?#\s]+)/i);
  if (direct?.[1]) return direct[1];

  const marker = raw.match(/https:\\?\/\\?\/(.+)$/i);
  if (!marker?.[1]) return undefined;

  const hostLike = marker[1].split(/(?:\\?\/|\/|\\\?|[/?#\s$()[\]{}+*])/)[0];
  const host = unescapeRegexHost(hostLike).replace(/\^/g, '').trim();
  return host || undefined;
}

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
  const captures = new CapturesService();

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
    .option('--runtime-default', 'Apply to runtime default rules through Whistle Web API')
    .option('--verify-live', 'Observe matching captures and assert header injected')
    .option('--duration <duration>', 'Live verification duration', '60s')
    .action(
      async (cmdOpts: {
        match: string;
        target: string;
        header: string[];
        ref?: string;
        preview?: boolean;
        apply?: boolean;
        verify?: boolean;
        runtimeDefault?: boolean;
        verifyLive?: boolean;
        duration?: string;
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

          const payload = cmdOpts.ref?.trim() ? cmdOpts.ref.trim() : normalizeHeaderPairs(cmdOpts.header);
          const ruleLine = buildRuleLine(cmdOpts.match, `reqHeaders://${payload}`);

          if (cmdOpts.runtimeDefault) {
            const current = await rules.getRuntimeDefaultRules(resolved.id);
            const next = `${current.source_text.trimEnd()}\n${ruleLine}`;
            const runtime = await rules.applyRuntimeDefaultRules(next, resolved.id, {
              verify: Boolean(cmdOpts.verify),
              selected: true,
            });
            let live_verification: Awaited<ReturnType<CapturesService['assertHeader']>> | undefined;

            if (cmdOpts.verifyLive) {
              const firstHeader = cmdOpts.header[0];
              if (!firstHeader) {
                throw new CliError({
                  code: 'UNSUPPORTED_OPERATION',
                  message: '--verify-live requires a key=value --header value',
                });
              }
              const { header, equals } = splitHeaderPair(firstHeader);
              const host = hostFromMatch(cmdOpts.match);
              if (!host) {
                throw new CliError({
                  code: 'UNSUPPORTED_OPERATION',
                  message: 'Unable to derive host from --match for live verification',
                  reason: `Match pattern: ${cmdOpts.match}`,
                  suggested_fix: 'Use a matcher that includes an https:// host, such as /^https:\\/\\/example\\.com\\//.',
                });
              }
              live_verification = await captures.assertHeader(
                { instance_id: resolved.id, filters: { host }, limit: 200 },
                { header, equals, durationMs: parseDurationMs(cmdOpts.duration) },
              );
            }

            process.stdout.write(
              renderEnvelope(
                okEnvelope(
                  'rules',
                  action,
                  { runtime, live_verification },
                  {
                    instance: resolved,
                    effective: !live_verification || live_verification.classification === 'OK',
                    meta: { verified: Boolean(cmdOpts.verify), live_verified: Boolean(cmdOpts.verifyLive) } as {
                      verified: boolean;
                      live_verified: boolean;
                    },
                  },
                ),
                format,
              ),
            );
            if (live_verification && live_verification.classification !== 'OK') process.exitCode = 1;
            return;
          }

          const targetRuleSet = await rules.ensureRuleSetByName(cmdOpts.target, resolved.id);

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
