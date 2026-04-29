import type { Command } from 'commander';
import { SystemDoctor } from '../doctor/system-doctor';
import { resolveInstanceId } from '../shared/instance-context';
import { CliError } from '../output/errors';
import { blockedEnvelope, errorEnvelope, okEnvelope } from '../output/result';
import { renderEnvelope } from '../output/renderers';

export function registerDoctorResource(program: Command): void {
  const doctor = program.command('doctor').description('Guided diagnostics and setup flows');
  const sys = new SystemDoctor();

  doctor
    .command('instance-status')
    .description('Diagnose instance running status')
    .action(async () => {
      const opts = program.opts();
      const format = opts.format ?? 'json';
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'instance-status';
      try {
        const res = await sys.instanceStatus(resolved.id);
        const envelope =
          res.status === 'ok'
            ? okEnvelope('doctor', action, res, { instance: resolved, effective: true })
            : blockedEnvelope('doctor', action, res, { instance: resolved, next_actions: res.next_actions });
        process.stdout.write(renderEnvelope(envelope, format));
      } catch (e) {
        const err = CliError.fromUnknown(e);
        process.stderr.write(renderEnvelope(errorEnvelope('doctor', action, err, { instance: resolved }), format));
        process.exitCode = 1;
      }
    });

  doctor
    .command('proxy-routing')
    .description('Diagnose proxy routing to the selected instance')
    .action(async () => {
      const opts = program.opts();
      const format = opts.format ?? 'json';
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'proxy-routing';
      try {
        const res = await sys.proxyRouting(resolved.id);
        const envelope =
          res.status === 'ok'
            ? okEnvelope('doctor', action, res, { instance: resolved, effective: true })
            : blockedEnvelope('doctor', action, res, { instance: resolved, next_actions: res.next_actions });
        process.stdout.write(renderEnvelope(envelope, format));
      } catch (e) {
        const err = CliError.fromUnknown(e);
        process.stderr.write(renderEnvelope(errorEnvelope('doctor', action, err, { instance: resolved }), format));
        process.exitCode = 1;
      }
    });

  doctor
    .command('https-capture')
    .description('Diagnose HTTPS capture prerequisites')
    .action(async () => {
      const opts = program.opts();
      const format = opts.format ?? 'json';
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'https-capture';
      try {
        const res = await sys.httpsCapture(resolved.id);
        const envelope =
          res.status === 'ok'
            ? okEnvelope('doctor', action, res, { instance: resolved, effective: true })
            : blockedEnvelope('doctor', action, res, { instance: resolved, next_actions: res.next_actions });
        process.stdout.write(renderEnvelope(envelope, format));
      } catch (e) {
        const err = CliError.fromUnknown(e);
        process.stderr.write(renderEnvelope(errorEnvelope('doctor', action, err, { instance: resolved }), format));
        process.exitCode = 1;
      }
    });
}

