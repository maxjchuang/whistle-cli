import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { registerRawResource } from '../resources/raw';
import { registerInstanceResource } from '../resources/instance';
import { registerCertsResource } from '../resources/certs';
import { registerProxyResource } from '../resources/proxy';
import { registerDoctorResource } from '../resources/doctor';
import { registerRulesResource } from '../resources/rules';
import { registerValuesResource } from '../resources/values';
import { registerCapturesResource } from '../resources/captures';
import { registerComposerResource } from '../resources/composer';
import { registerFramesResource } from '../resources/frames';
import { registerPluginsResource } from '../resources/plugins';
import { registerBootstrapShortcuts } from '../shortcuts/bootstrap';
import { registerRulesShortcuts } from '../shortcuts/rules';
import { registerCapturesShortcuts } from '../shortcuts/captures';
import { registerPluginsShortcuts } from '../shortcuts/plugins';

export type OutputFormat = 'json' | 'pretty' | 'table' | 'ndjson';

export interface GlobalOptions {
  format: OutputFormat;
  instance?: string;
  nonInteractive?: boolean;
}

function getPackageVersion(): string {
  try {
    const pkgPath = path.resolve(__dirname, '../../package.json');
    const pkgRaw = readFileSync(pkgPath, 'utf8');
    const pkg = JSON.parse(pkgRaw) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export function buildProgram(): Command {
  const program = new Command();

  program.name('whistle-cli');
  program.description('AI-friendly CLI facade over Whistle');
  program.version(getPackageVersion());

  program
    .option('--format <format>', 'Output format: json|pretty|table|ndjson', 'json')
    .option('--instance <id>', 'Target instance id/name')
    .option('--non-interactive', 'Fail instead of waiting for user action', false);

  registerRawResource(program);

  registerInstanceResource(program);
  registerCertsResource(program);
  registerProxyResource(program);
  registerDoctorResource(program);

  registerRulesResource(program);
  registerValuesResource(program);
  registerCapturesResource(program);
  registerComposerResource(program);
  registerFramesResource(program);
  registerPluginsResource(program);

  registerBootstrapShortcuts(program);
  registerRulesShortcuts(program);
  registerCapturesShortcuts(program);
  registerPluginsShortcuts(program);

  return program;
}
