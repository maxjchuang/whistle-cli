import { Command } from 'commander';
import { registerRawResource } from '../resources/raw';
import { registerInstanceResource } from '../resources/instance';
import { registerCertsResource } from '../resources/certs';
import { registerProxyResource } from '../resources/proxy';
import { registerDoctorResource } from '../resources/doctor';
import { registerBootstrapShortcuts } from '../shortcuts/bootstrap';

export type OutputFormat = 'json' | 'pretty' | 'table' | 'ndjson';

export interface GlobalOptions {
  format: OutputFormat;
  instance?: string;
  nonInteractive?: boolean;
}

export function buildProgram(): Command {
  const program = new Command();

  program.name('whistle-cli');
  program.description('AI-friendly CLI facade over Whistle');

  program
    .option('--format <format>', 'Output format: json|pretty|table|ndjson', 'json')
    .option('--instance <id>', 'Target instance id/name')
    .option('--non-interactive', 'Fail instead of waiting for user action', false);

  registerRawResource(program);

  registerInstanceResource(program);
  registerCertsResource(program);
  registerProxyResource(program);
  registerDoctorResource(program);

  registerBootstrapShortcuts(program);

  return program;
}
