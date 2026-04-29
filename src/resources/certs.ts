import type { Command } from 'commander';
import { CertificateService } from '../domain/certificate-service';
import { InstanceService } from '../domain/instance-service';
import { ActionExecutor } from '../domain/action-executor';
import { FlowRunner } from '../domain/flow-runner';
import { permissionHintForCertTrust } from '../doctor/permission-checks';
import { resolveInstanceId } from '../shared/instance-context';
import { CliError } from '../output/errors';
import { blockedEnvelope, errorEnvelope, okEnvelope } from '../output/result';
import { renderEnvelope } from '../output/renderers';

function resolvePavFlags(cmdOpts: { preview?: boolean; apply?: boolean; verify?: boolean }) {
  const preview = Boolean(cmdOpts.preview);
  const verify = Boolean(cmdOpts.verify);
  const apply = Boolean(cmdOpts.apply) || verify || (!preview && !cmdOpts.apply && !cmdOpts.verify);
  return { preview, apply, verify };
}

export function registerCertsResource(program: Command): void {
  const certs = program.command('certs').alias('cert').description('Certificate setup and verification');
  const service = new CertificateService();
  const instances = new InstanceService();
  const executor = new ActionExecutor();
  const flows = new FlowRunner();

  certs
    .command('status')
    .description('Show certificate material status')
    .action(async () => {
      const opts = program.opts();
      const format = opts.format ?? 'json';
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'status';
      try {
        const inst = await instances.status(resolved.id).catch(() => ({ host: '127.0.0.1', port: 8899 } as any));
        const st = await service.status({ host: inst.host, port: inst.port });
        process.stdout.write(renderEnvelope(okEnvelope('certs', action, st, { instance: resolved }), format));
      } catch (e) {
        const err = CliError.fromUnknown(e);
        process.stderr.write(renderEnvelope(errorEnvelope('certs', action, err, { instance: resolved }), format));
        process.exitCode = 1;
      }
    });

  certs
    .command('guide')
    .description('Show trust guide for current platform')
    .action(async () => {
      const opts = program.opts();
      const format = opts.format ?? 'json';
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'guide';
      try {
        const inst = await instances.status(resolved.id).catch(() => ({ host: '127.0.0.1', port: 8899 } as any));
        const st = await service.status({ host: inst.host, port: inst.port });
        const guide = service.trustGuide(st.root_ca_path);
        process.stdout.write(
          renderEnvelope(
            okEnvelope('certs', action, { ...st, guide }, { instance: resolved, effective: false }),
            format,
          ),
        );
      } catch (e) {
        const err = CliError.fromUnknown(e);
        process.stderr.write(renderEnvelope(errorEnvelope('certs', action, err, { instance: resolved }), format));
        process.exitCode = 1;
      }
    });

  certs
    .command('install')
    .description('Generate/export Root CA material (trust still requires user action)')
    .option('--preview', 'Preview without applying')
    .option('--apply', 'Apply the change')
    .option('--verify', 'Verify (guided) trust status after apply')
    .action(async (cmdOpts: { preview?: boolean; apply?: boolean; verify?: boolean }) => {
      const opts = program.opts();
      const format = opts.format ?? 'json';
      const nonInteractive = Boolean(opts.nonInteractive);
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'install';
      const pav = resolvePavFlags(cmdOpts);

      try {
        const inst = await instances.status(resolved.id).catch(() => ({ host: '127.0.0.1', port: 8899 } as any));
        const before = await service.status({ host: inst.host, port: inst.port });
        const preview = {
          will_generate_if_missing: !before.installed,
          root_ca_path: before.root_ca_path,
          root_ca_url: before.root_ca_url,
          storage: before.storage,
        };

        if (pav.preview && !pav.apply) {
          process.stdout.write(
            renderEnvelope(
              okEnvelope('certs', action, { preview }, { instance: resolved, effective: false, meta: { preview: true } }),
              format,
            ),
          );
          return;
        }

        const result = await executor.execute(
          { resource: 'certs', action, instance: resolved },
          pav,
          {
            preview: async () => preview,
            apply: async () => {
              const applyRes = await service.install(resolved.id, { host: inst.host, port: inst.port });
              const after = await service.status({ host: inst.host, port: inst.port });
              const guide = service.trustGuide(applyRes.downloaded_root_ca_path ?? after.root_ca_path);
              return {
                result: { apply: applyRes, after, guide },
              };
            },
            verify: async () => service.verifyTrusted(),
          },
        );

        // Always treat trust as a guided / potentially blocked step.
        const applyInfo = (result.apply_result as any)?.apply as { downloaded_root_ca_path?: string } | undefined;
        const after = (result.apply_result as any)?.after as { root_ca_path: string | null } | undefined;
        const guide = service.trustGuide(applyInfo?.downloaded_root_ca_path ?? after?.root_ca_path ?? null);
        const perm = permissionHintForCertTrust();
        const flow = await flows.createWaitingForUser({
          current_step: 'trust_root_ca',
          instruction: guide.instruction,
          completion_criteria: ['系统/设备信任 Root CA 后，HTTPS 抓包不再弹出证书错误'],
          auto_checks: ['certs verify', 'doctor https-capture'],
        });

        if (nonInteractive) {
          const err = new CliError({
            code: 'USER_ACTION_REQUIRED',
            message: '证书信任需要人工步骤（non-interactive 模式无法继续）',
            reason: guide.instruction,
            suggested_fix: guide.suggested_fix,
          });
          process.stderr.write(
            renderEnvelope(
              errorEnvelope('certs', action, err, {
                instance: resolved,
                next_actions: [
                  { action: 'certs guide', reason: '查看并按平台完成信任步骤' },
                  { action: 'certs verify', reason: '完成后重新验证' },
                ],
                meta: { action_id: result.action_id },
              }),
              format,
            ),
          );
          process.exitCode = 1;
          return;
        }

        const envelope = blockedEnvelope(
          'certs',
          action,
          {
            ...result,
            flow,
            trust: { requires_user_action: true, guide },
            permission: perm,
          },
          {
            instance: resolved,
            next_actions: [
              { action: 'certs guide', reason: '查看并按平台完成信任步骤' },
              { action: 'certs verify', reason: '完成后重新验证' },
            ],
            meta: { preview: pav.preview, verified: pav.verify, action_id: result.action_id },
          },
        );
        process.stdout.write(renderEnvelope(envelope, format));
      } catch (e) {
        const err = CliError.fromUnknown(e);
        process.stderr.write(renderEnvelope(errorEnvelope('certs', action, err, { instance: resolved }), format));
        process.exitCode = 1;
      }
    });

  certs
    .command('verify')
    .description('Verify certificate trust status (guided)')
    .action(async () => {
      const opts = program.opts();
      const format = opts.format ?? 'json';
      const nonInteractive = Boolean(opts.nonInteractive);
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'verify';
      try {
        const inst = await instances.status(resolved.id).catch(() => ({ host: '127.0.0.1', port: 8899 } as any));
        const st = await service.status({ host: inst.host, port: inst.port });
        if (!st.installed) {
          const envelope = blockedEnvelope(
            'certs',
            action,
            st,
            {
              instance: resolved,
              next_actions: [{ action: 'certs install', reason: '先生成/导出 Root CA' }],
            },
          );
          process.stdout.write(renderEnvelope(envelope, format));
          return;
        }
        const trust = await service.verifyTrusted();
        if (!trust.trusted) {
          const guide = service.trustGuide(st.downloaded_root_ca_path ?? st.root_ca_path);
          const perm = permissionHintForCertTrust();
          const flow = await flows.createWaitingForUser({
            current_step: 'trust_root_ca',
            instruction: guide.instruction,
            completion_criteria: ['系统/设备信任 Root CA 后，HTTPS 抓包不再弹出证书错误'],
            auto_checks: ['doctor https-capture'],
          });

          if (nonInteractive) {
            const err = new CliError({
              code: 'USER_ACTION_REQUIRED',
              message: '证书信任需要人工步骤（non-interactive 模式无法继续）',
              reason: guide.instruction,
              suggested_fix: guide.suggested_fix,
            });
            process.stderr.write(
              renderEnvelope(
                errorEnvelope('certs', action, err, {
                  instance: resolved,
                  next_actions: [{ action: 'certs guide', reason: '完成系统/设备信任步骤' }],
                }),
                format,
              ),
            );
            process.exitCode = 1;
            return;
          }

          const envelope = blockedEnvelope(
            'certs',
            action,
            { ...st, trust, guide, permission: perm, flow },
            {
              instance: resolved,
              next_actions: [{ action: 'certs guide', reason: '完成系统/设备信任步骤' }],
            },
          );
          process.stdout.write(renderEnvelope(envelope, format));
          return;
        }
        process.stdout.write(
          renderEnvelope(okEnvelope('certs', action, { ...st, trust }, { instance: resolved, effective: true }), format),
        );
      } catch (e) {
        const err = CliError.fromUnknown(e);
        process.stderr.write(renderEnvelope(errorEnvelope('certs', action, err, { instance: resolved }), format));
        process.exitCode = 1;
      }
    });
}
