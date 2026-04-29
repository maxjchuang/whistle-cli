import type { Command } from 'commander';
import { InstanceService } from '../domain/instance-service';
import { CertificateService } from '../domain/certificate-service';
import { ProxyService } from '../domain/proxy-service';
import { FlowRunner } from '../domain/flow-runner';
import { resolveInstanceId } from '../shared/instance-context';
import { CliError } from '../output/errors';
import { blockedEnvelope, errorEnvelope, okEnvelope } from '../output/result';
import { renderEnvelope } from '../output/renderers';

export function registerBootstrapShortcuts(program: Command): void {
  const bootstrap = program.command('bootstrap').description('High-frequency bootstrap shortcuts');
  const instances = new InstanceService();
  const certs = new CertificateService();
  const proxy = new ProxyService();
  const flows = new FlowRunner();

  bootstrap
    .command('start')
    .description('Shortcut: start default instance and verify')
    .action(async () => {
      const opts = program.opts();
      const format = opts.format ?? 'json';
      const resolved = await resolveInstanceId(opts.instance);
      try {
        const res = await instances.start(resolved.id);
        const st = await instances.status(resolved.id);
        process.stdout.write(
          renderEnvelope(
            okEnvelope('instance', 'start', { apply: res, status: st }, { instance: resolved, effective: st.status === 'running' }),
            format,
          ),
        );
      } catch (e) {
        const err = CliError.fromUnknown(e);
        process.stderr.write(renderEnvelope(errorEnvelope('instance', 'start', err, { instance: resolved }), format));
        process.exitCode = 1;
      }
    });

  bootstrap
    .command('prepare')
    .description('Shortcut: start + certs install + proxy set (may require user action)')
    .action(async () => {
      const opts = program.opts();
      const format = opts.format ?? 'json';
      const nonInteractive = Boolean(opts.nonInteractive);
      const resolved = await resolveInstanceId(opts.instance);

      try {
        const startRes = await instances.start(resolved.id);
        const inst = await instances.status(resolved.id);

        const certApply = await certs.install(resolved.id, { host: inst.host, port: inst.port });
        const certStatus = await certs.status({ host: inst.host, port: inst.port });
        const certGuide = certs.trustGuide(certApply.downloaded_root_ca_path ?? certStatus.downloaded_root_ca_path ?? null);

        const proxyMode = proxy.detectMode();
        const proxyGuide = proxyMode === 'env' ? proxy.envSetGuide(inst.host, inst.port) : null;

        // Cert trust always requires user action in v1.
        const needsUserAction = true;
        const flow = await flows.createWaitingForUser({
          current_step: 'bootstrap_prepare',
          instruction:
            proxyMode === 'env'
              ? `${certGuide.instruction}\n\n代理设置：${proxyGuide?.suggested_fix}`
              : certGuide.instruction,
          completion_criteria: ['完成 Root CA 信任（以及必要的代理设置）后，doctor 全绿'],
          auto_checks: ['doctor https-capture', 'doctor proxy-routing'],
        });

        if (nonInteractive && needsUserAction) {
          const err = new CliError({
            code: 'USER_ACTION_REQUIRED',
            message: 'bootstrap prepare 需要人工步骤（non-interactive 模式无法继续）',
            reason: certGuide.instruction,
            suggested_fix: certGuide.suggested_fix,
          });
          process.stderr.write(
            renderEnvelope(
              errorEnvelope('doctor', 'bootstrap-prepare', err, {
                instance: resolved,
                next_actions: [
                  { action: 'certs guide', reason: '完成 Root CA 信任' },
                  { action: 'proxy set', reason: '设置代理（如需要）' },
                ],
              }),
              format,
            ),
          );
          process.exitCode = 1;
          return;
        }

        const envelope = blockedEnvelope(
          'doctor',
          'bootstrap-prepare',
          {
            flow,
            instance: inst,
            steps: {
              instance_start: { stdout: startRes.stdout, stderr: startRes.stderr, exitCode: startRes.exitCode },
              certs_install: { ...certApply, guide: certGuide, status: certStatus },
              proxy_set: proxyMode === 'env' ? { mode: proxyMode, guide: proxyGuide } : { mode: proxyMode },
            },
          },
          {
            instance: resolved,
            next_actions: [
              { action: 'certs guide', reason: '按平台完成 Root CA 信任步骤' },
              { action: 'proxy set', reason: '将代理指向该实例（Linux env 模式需在当前 shell 设置）' },
              { action: 'doctor https-capture', reason: '检查 HTTPS 抓包前置条件' },
              { action: 'doctor proxy-routing', reason: '检查代理路由' },
            ],
          },
        );

        process.stdout.write(renderEnvelope(envelope, format));
      } catch (e) {
        const err = CliError.fromUnknown(e);
        process.stderr.write(renderEnvelope(errorEnvelope('doctor', 'bootstrap-prepare', err, { instance: resolved }), format));
        process.exitCode = 1;
      }
    });
}
