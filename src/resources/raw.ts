import type { Command } from 'commander';
import { CliError } from '../output/errors';
import { errorEnvelope, okEnvelope } from '../output/result';
import { renderEnvelope } from '../output/renderers';
import { W2Client } from '../backends/raw/w2-client';
import { resolveInstanceId } from '../shared/instance-context';

export function registerRawResource(program: Command): void {
  const raw = program.command('raw').description('Mirror/escape-hatch commands over Whistle tooling');

  raw
    .command('w2 [args...]')
    .description('Run raw w2 commands (escape hatch)')
    .allowUnknownOption(true)
    .action(async (args: string[]) => {
      const opts = program.opts();
      const format = opts.format ?? 'json';
      const instance = await resolveInstanceId(opts.instance);

      const actionName = `w2 ${args?.join(' ') || ''}`.trim();

      const client = new W2Client();
      try {
        const res = await client.run(args ?? []);

        if (res.commandNotFound) {
          const err = new CliError({
            code: 'UNSUPPORTED_OPERATION',
            message: '`w2` command not found on PATH',
            reason: `Tried to run: w2 ${args?.join(' ') || ''}`.trim(),
            suggested_fix: 'Install whistle: `npm install -g whistle`',
          });
          process.stderr.write(renderEnvelope(errorEnvelope('raw', actionName, err), format));
          process.exitCode = 1;
          return;
        }

        if (res.exitCode !== 0) {
          const err = new CliError({
            code: 'UNSUPPORTED_OPERATION',
            message: 'w2 command failed',
            reason: res.stderr || res.stdout || `exitCode=${res.exitCode}`,
            suggested_fix: 'Ensure `whistle` is installed and `w2` is available on PATH.',
          });
          process.stderr.write(renderEnvelope(errorEnvelope('raw', actionName, err), format));
          process.exitCode = 1;
          return;
        }

        const envelope = okEnvelope(
          'raw',
          actionName,
          {
            stdout: res.stdout,
            stderr: res.stderr,
            exitCode: res.exitCode,
            durationMs: res.durationMs,
          },
          {
            instance,
            effective: true,
          },
        );

        process.stdout.write(renderEnvelope(envelope, format));
      } catch (e) {
        const err = CliError.fromUnknown(e);
        process.stderr.write(renderEnvelope(errorEnvelope('raw', actionName, err), format));
        process.exitCode = 1;
      }
    });
}
