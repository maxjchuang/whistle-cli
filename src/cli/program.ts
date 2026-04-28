import { Command } from 'commander';
import { registerRawResource } from '../resources/raw';

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

  // Future resources will be registered here (instance/rules/mocks/captures/certs/proxy/plugins/doctor)

  return program;
}

