#!/usr/bin/env node

import { buildProgram } from './program';
import { CliError } from '../output/errors';
import { errorEnvelope } from '../output/result';
import { renderEnvelope } from '../output/renderers';

export async function main(argv: string[] = process.argv): Promise<void> {
  try {
    const program = buildProgram();
    await program.parseAsync(argv);
  } catch (err) {
    const format = 'json';
    const cliError = err instanceof CliError ? err : CliError.fromUnknown(err);
    const envelope = errorEnvelope('raw', 'cli', cliError, { effective: false });
    process.stderr.write(renderEnvelope(envelope, format));
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch(() => {
    process.exitCode = 1;
  });
}
