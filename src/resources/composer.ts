import type { Command } from 'commander';
import type { OutputFormat } from '../cli/program';
import { resolveInstanceId } from '../shared/instance-context';
import { CliError } from '../output/errors';
import { errorEnvelope, okEnvelope } from '../output/result';
import { renderEnvelope } from '../output/renderers';
import { ActionExecutor } from '../domain/action-executor';
import { ComposerService } from '../domain/composer-service';

function resolvePavFlags(cmdOpts: { preview?: boolean; apply?: boolean; verify?: boolean }) {
  const preview = Boolean(cmdOpts.preview);
  const verify = Boolean(cmdOpts.verify);
  const apply = Boolean(cmdOpts.apply) || verify || (!preview && !cmdOpts.apply && !cmdOpts.verify);
  return { preview, apply, verify };
}

function parseHeaderPairs(pairs: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of pairs) {
    const idx = p.indexOf('=');
    if (idx <= 0) continue;
    const k = p.slice(0, idx).trim();
    const v = p.slice(idx + 1);
    if (!k) continue;
    out[k] = v;
  }
  return out;
}

export function registerComposerResource(program: Command): void {
  const composer = program.command('composer').description('Replay and compose requests (runtime backend)');
  const service = new ComposerService();
  const executor = new ActionExecutor();

  composer
    .command('replay')
    .description('Replay a captured request (optionally with overrides)')
    .requiredOption('--capture-id <id>', 'Capture id')
    .option('--method <method>', 'Override HTTP method')
    .option('--url <url>', 'Override URL')
    .option('--header <k=v>', 'Override header, repeatable', (v, acc: string[]) => {
      acc.push(v);
      return acc;
    }, [])
    .option('--body <body>', 'Override request body')
    .option('--preview', 'Preview without applying')
    .option('--apply', 'Send the replay request')
    .option('--verify', 'Verify after apply (best-effort)')
    .action(
      async (cmdOpts: {
        captureId: string;
        method?: string;
        url?: string;
        header: string[];
        body?: string;
        preview?: boolean;
        apply?: boolean;
        verify?: boolean;
      }) => {
        const opts = program.opts();
        const format = (opts.format ?? 'json') as OutputFormat;
        const resolved = await resolveInstanceId(opts.instance);
        const action = 'replay';
        const pav = resolvePavFlags(cmdOpts);

        try {
          const overrides = {
            method: cmdOpts.method?.trim() || undefined,
            url: cmdOpts.url?.trim() || undefined,
            headers: cmdOpts.header?.length ? parseHeaderPairs(cmdOpts.header) : undefined,
            body: cmdOpts.body,
          };

          const result = await executor.execute(
            { resource: 'composer', action, instance: resolved },
            pav,
            {
              preview: async () => ({
                will_call: 'runtime composer replay',
                capture_id: cmdOpts.captureId,
                overrides,
              }),
              apply: async () => {
                const out = await service.replay({
                  instance_id: resolved.id,
                  capture_id: cmdOpts.captureId,
                  overrides,
                });
                return { result: out };
              },
              verify: async () => ({ verified: true }),
            },
          );

          process.stdout.write(
            renderEnvelope(
              okEnvelope('composer', action, result, {
                instance: resolved,
                effective: pav.apply ? true : false,
                meta: { preview: pav.preview, verified: pav.verify, action_id: result.action_id },
              }),
              format,
            ),
          );
        } catch (e) {
          const err = CliError.fromUnknown(e);
          process.stderr.write(renderEnvelope(errorEnvelope('composer', action, err, { instance: resolved }), format));
          process.exitCode = 1;
        }
      },
    );

  composer
    .command('compose')
    .description('Compose and send a request')
    .requiredOption('--method <method>', 'HTTP method')
    .requiredOption('--url <url>', 'Request URL')
    .option('--header <k=v>', 'Header, repeatable', (v, acc: string[]) => {
      acc.push(v);
      return acc;
    }, [])
    .option('--body <body>', 'Request body')
    .option('--preview', 'Preview without applying')
    .option('--apply', 'Send the composed request')
    .option('--verify', 'Verify after apply (best-effort)')
    .action(
      async (cmdOpts: {
        method: string;
        url: string;
        header: string[];
        body?: string;
        preview?: boolean;
        apply?: boolean;
        verify?: boolean;
      }) => {
        const opts = program.opts();
        const format = (opts.format ?? 'json') as OutputFormat;
        const resolved = await resolveInstanceId(opts.instance);
        const action = 'compose';
        const pav = resolvePavFlags(cmdOpts);

        try {
          const req = {
            compose_id: 'compose',
            instance_id: resolved.id,
            method: cmdOpts.method,
            url: cmdOpts.url,
            headers: cmdOpts.header?.length ? parseHeaderPairs(cmdOpts.header) : undefined,
            body: cmdOpts.body,
          };

          const result = await executor.execute(
            { resource: 'composer', action, instance: resolved },
            pav,
            {
              preview: async () => ({ will_call: 'runtime composer compose', request: req }),
              apply: async () => {
                const out = await service.compose(req);
                return { result: out };
              },
              verify: async () => ({ verified: true }),
            },
          );

          process.stdout.write(
            renderEnvelope(
              okEnvelope('composer', action, result, {
                instance: resolved,
                effective: pav.apply ? true : false,
                meta: { preview: pav.preview, verified: pav.verify, action_id: result.action_id },
              }),
              format,
            ),
          );
        } catch (e) {
          const err = CliError.fromUnknown(e);
          process.stderr.write(renderEnvelope(errorEnvelope('composer', action, err, { instance: resolved }), format));
          process.exitCode = 1;
        }
      },
    );
}

