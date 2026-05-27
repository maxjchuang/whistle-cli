import type { Command } from 'commander';
import type { OutputFormat } from '../cli/program';
import { CliError } from '../output/errors';
import { errorEnvelope, okEnvelope } from '../output/result';
import { renderEnvelope } from '../output/renderers';
import { startRuntimeBackend } from '../backends/runtime/runtime-server';

interface RuntimeServeOptions {
  targetUrl: string;
  host?: string;
  port?: string;
  timeout?: string;
}

function parsePort(value: unknown): number {
  const parsed = Number(String(value ?? '8898'));
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
    throw new CliError({
      code: 'UNSUPPORTED_OPERATION',
      message: 'Invalid runtime backend port',
      suggested_fix: 'Use a TCP port between 0 and 65535.',
    });
  }
  return parsed;
}

function parseTimeoutMs(value: unknown): number {
  const raw = String(value ?? '10s');
  const parsed = raw.endsWith('ms')
    ? Number(raw.slice(0, -2))
    : raw.endsWith('s')
      ? Number(raw.slice(0, -1)) * 1000
      : Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10_000;
}

export function registerRuntimeResource(program: Command): void {
  const runtime = program
    .command('runtime')
    .description('Run the optional whistle-cli runtime backend');

  runtime
    .command('serve')
    .description('Serve the __whistle_cli__ runtime backend API')
    .requiredOption(
      '--target-url <url>',
      'Whistle Web API base URL, for example http://127.0.0.1:8899',
    )
    .option('--host <host>', 'Host interface to bind', '127.0.0.1')
    .option('--port <port>', 'Port to bind', '8898')
    .option('--timeout <duration>', 'Target request timeout, such as 10s or 5000ms', '10s')
    .action(async (cmdOpts: RuntimeServeOptions) => {
      const opts = program.opts();
      const format = (opts.format ?? 'json') as OutputFormat;
      const action = 'serve';
      try {
        const handle = await startRuntimeBackend({
          targetBaseUrl: cmdOpts.targetUrl,
          host: cmdOpts.host ?? '127.0.0.1',
          port: parsePort(cmdOpts.port),
          requestTimeoutMs: parseTimeoutMs(cmdOpts.timeout),
        });
        process.stdout.write(
          renderEnvelope(
            okEnvelope('runtime', action, {
              base_url: handle.baseUrl,
              target_url: cmdOpts.targetUrl,
              env: `WHISTLE_CLI_RUNTIME_URL=${handle.baseUrl}`,
            }),
            format,
          ),
        );
        await new Promise<void>((resolve) => {
          const shutdown = (): void => {
            void handle.close().finally(resolve);
          };
          process.once('SIGINT', shutdown);
          process.once('SIGTERM', shutdown);
        });
      } catch (e) {
        const err = CliError.fromUnknown(e);
        process.stderr.write(renderEnvelope(errorEnvelope('runtime', action, err), format));
        process.exitCode = 1;
      }
    });
}
