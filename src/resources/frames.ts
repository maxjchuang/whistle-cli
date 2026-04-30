import type { Command } from 'commander';
import type { OutputFormat } from '../cli/program';
import { resolveInstanceId } from '../shared/instance-context';
import { CliError } from '../output/errors';
import { errorEnvelope, okEnvelope } from '../output/result';
import { renderEnvelope } from '../output/renderers';
import { ActionExecutor } from '../domain/action-executor';
import { FramesService } from '../domain/frames-service';

function resolvePavFlags(cmdOpts: { preview?: boolean; apply?: boolean; verify?: boolean }) {
  const preview = Boolean(cmdOpts.preview);
  const verify = Boolean(cmdOpts.verify);
  const apply = Boolean(cmdOpts.apply) || verify || (!preview && !cmdOpts.apply && !cmdOpts.verify);
  return { preview, apply, verify };
}

export function registerFramesResource(program: Command): void {
  const frames = program.command('frames').description('Inspect and control WebSocket/TCP frames (runtime backend)');
  const service = new FramesService();
  const executor = new ActionExecutor();

  frames
    .command('list')
    .description('List frames for a session')
    .requiredOption('--session-id <id>', 'Session id')
    .option('--limit <n>', 'Max frames', '50')
    .action(async (cmdOpts: { sessionId: string; limit?: string }) => {
      const opts = program.opts();
      const format = (opts.format ?? 'json') as OutputFormat;
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'list';
      try {
        const limit = Number(cmdOpts.limit ?? 50);
        const out = await service.list(resolved.id, cmdOpts.sessionId, limit);
        process.stdout.write(renderEnvelope(okEnvelope('frames', action, out, { instance: resolved, effective: true }), format));
      } catch (e) {
        const err = CliError.fromUnknown(e);
        process.stderr.write(renderEnvelope(errorEnvelope('frames', action, err, { instance: resolved }), format));
        process.exitCode = 1;
      }
    });

  frames
    .command('send')
    .description('Send a frame payload to a session (best-effort)')
    .requiredOption('--session-id <id>', 'Session id')
    .requiredOption('--data <data>', 'Frame payload (string)')
    .option('--direction <dir>', 'to_server|to_client', 'to_server')
    .option('--preview', 'Preview without applying')
    .option('--apply', 'Apply the change')
    .option('--verify', 'Verify after apply (best-effort)')
    .action(
      async (cmdOpts: {
        sessionId: string;
        data: string;
        direction?: string;
        preview?: boolean;
        apply?: boolean;
        verify?: boolean;
      }) => {
        const opts = program.opts();
        const format = (opts.format ?? 'json') as OutputFormat;
        const resolved = await resolveInstanceId(opts.instance);
        const action = 'send';
        const pav = resolvePavFlags(cmdOpts);

        try {
          const dir = (cmdOpts.direction ?? 'to_server').toLowerCase();
          const direction = dir === 'to_client' ? 'to_client' : 'to_server';

          const result = await executor.execute(
            { resource: 'frames', action, instance: resolved },
            pav,
            {
              preview: async () => ({ will_call: 'runtime frames send', session_id: cmdOpts.sessionId, direction }),
              apply: async () => {
                const out = await service.send(resolved.id, cmdOpts.sessionId, cmdOpts.data, direction);
                return { result: out };
              },
              verify: async () => ({ verified: true }),
            },
          );

          process.stdout.write(
            renderEnvelope(
              okEnvelope('frames', action, result, {
                instance: resolved,
                effective: pav.apply ? true : false,
                meta: { preview: pav.preview, verified: pav.verify, action_id: result.action_id },
              }),
              format,
            ),
          );
        } catch (e) {
          const err = CliError.fromUnknown(e);
          process.stderr.write(renderEnvelope(errorEnvelope('frames', action, err, { instance: resolved }), format));
          process.exitCode = 1;
        }
      },
    );
}

