import type { Command } from 'commander';
import type { OutputFormat } from '../cli/program';
import { ProxyService } from '../domain/proxy-service';
import { InstanceService } from '../domain/instance-service';
import { ActionExecutor } from '../domain/action-executor';
import { FlowRunner } from '../domain/flow-runner';
import { permissionHintForSystemProxySet } from '../doctor/permission-checks';
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

async function runProxyRollback(
  executor: ActionExecutor,
  service: ProxyService,
  resolved: { id: string; name: string },
  actionId: string,
  format: OutputFormat,
): Promise<void> {
  const res = await executor.executeRollback(
    { resource: 'proxy', action: 'rollback', instance: resolved },
    actionId,
    async (handle) => {
      if (!handle || typeof handle !== 'object') {
        throw new CliError({ code: 'UNSUPPORTED_OPERATION', message: 'Invalid rollback handle' });
      }
      const h = handle as any;

      // Backwards compatibility: older proxy actions stored a generic `w2` handle.
      if (h.type === 'w2' && Array.isArray(h.args) && h.args[0] === 'proxy') {
        const arg = String(h.args[1] ?? '0');
        const n = Number(arg);
        if (Number.isFinite(n) && n > 0) {
          const out = await service.setSystemProxy(n, resolved.id);
          return { rolled_back: true, kind: 'system', restored_port: n, result: out };
        }
        const out = await service.offSystemProxy(resolved.id);
        return { rolled_back: true, kind: 'system', restored_port: 0, result: out };
      }

      if (h.type === 'proxy.system') {
        const prev_port = typeof h.prev_port === 'number' ? h.prev_port : null;
        if (prev_port && prev_port > 0) {
          const out = await service.setSystemProxy(prev_port, resolved.id);
          return { rolled_back: true, kind: 'system', restored_port: prev_port, result: out };
        }
        const out = await service.offSystemProxy(resolved.id);
        return { rolled_back: true, kind: 'system', restored_port: 0, result: out };
      }

      throw new CliError({
        code: 'UNSUPPORTED_OPERATION',
        message: 'Unsupported rollback handle type',
        reason: String(h.type ?? '<unknown>'),
      });
    },
  );

  process.stdout.write(renderEnvelope(okEnvelope('proxy', 'rollback', res, { instance: resolved, effective: true }), format));
}

export function registerProxyResource(program: Command): void {
  const proxy = program.command('proxy').description('Proxy routing setup and verification');
  const service = new ProxyService();
  const instances = new InstanceService();
  const executor = new ActionExecutor();
  const flows = new FlowRunner();

  proxy
    .command('status')
    .description('Show proxy routing status')
    .action(async () => {
      const opts = program.opts();
      const format = opts.format ?? 'json';
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'status';
      try {
        const inst = await instances.status(resolved.id);
        const st = await service.status(inst.host, inst.port, resolved.id);
        process.stdout.write(renderEnvelope(okEnvelope('proxy', action, st, { instance: resolved }), format));
      } catch (e) {
        const err = CliError.fromUnknown(e);
        process.stderr.write(renderEnvelope(errorEnvelope('proxy', action, err, { instance: resolved }), format));
        process.exitCode = 1;
      }
    });

  proxy
    .command('set')
    .description('Point proxy to the selected instance (best-effort)')
    .option('--preview', 'Preview without applying')
    .option('--apply', 'Apply the change')
    .option('--verify', 'Verify after apply')
    .option('--rollback <actionId>', 'Rollback a previous action instead of setting')
    .action(async (cmdOpts: { preview?: boolean; apply?: boolean; verify?: boolean; rollback?: string }) => {
      const opts = program.opts();
      const format = (opts.format ?? 'json') as OutputFormat;
      const nonInteractive = Boolean(opts.nonInteractive);
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'set';
      const pav = resolvePavFlags(cmdOpts);

      if (cmdOpts.rollback) {
        try {
          await runProxyRollback(executor, service, resolved, String(cmdOpts.rollback), format);
        } catch (e) {
          const err = CliError.fromUnknown(e);
          process.stderr.write(renderEnvelope(errorEnvelope('proxy', 'rollback', err, { instance: resolved }), format));
          process.exitCode = 1;
        }
        return;
      }

      try {
        const inst = await instances.status(resolved.id);
        const mode = service.detectMode();
        if (mode === 'env') {
          const guide = service.envSetGuide(inst.host, inst.port);

          const flow = await flows.createWaitingForUser({
            current_step: 'set_env_proxy',
            instruction: guide.suggested_fix,
            completion_criteria: ['当前 shell 的 HTTP_PROXY/HTTPS_PROXY 指向目标 Whistle'],
            auto_checks: ['proxy verify', 'doctor proxy-routing'],
          });

          if (nonInteractive) {
            const err = new CliError({
              code: 'USER_ACTION_REQUIRED',
              message: '需要在当前 shell 设置代理环境变量（non-interactive 模式无法继续）',
              reason: guide.instruction,
              suggested_fix: guide.suggested_fix,
            });
            process.stderr.write(
              renderEnvelope(
                errorEnvelope('proxy', action, err, {
                  instance: resolved,
                  next_actions: [{ action: 'proxy verify', reason: '设置环境变量后验证' }],
                }),
                format,
              ),
            );
            process.exitCode = 1;
            return;
          }

          const envelope = blockedEnvelope(
            'proxy',
            action,
            { mode, expected: { host: inst.host, port: inst.port }, guide, flow },
            {
              instance: resolved,
              next_actions: [{ action: 'proxy verify', reason: '设置环境变量后验证' }],
              meta: { preview: pav.preview, verified: pav.verify },
            },
          );
          process.stdout.write(renderEnvelope(envelope, format));
          return;
        }

        const result = await executor.execute(
          { resource: 'proxy', action, instance: resolved },
          pav,
          {
            preview: async () => ({ will_run: 'w2 proxy <port>', port: inst.port }),
            apply: async () => {
              const prev_port = await service.currentSystemProxyPort(resolved.id);
              const res = await service.setSystemProxy(inst.port, resolved.id);
              return {
                result: { stdout: res.stdout, stderr: res.stderr, exitCode: res.exitCode, durationMs: res.durationMs },
                rollback: { type: 'proxy.system', prev_port },
              };
            },
            verify: async () => service.status(inst.host, inst.port, resolved.id),
          },
        );

        process.stdout.write(
          renderEnvelope(
            okEnvelope('proxy', action, { ...result, permission: permissionHintForSystemProxySet() }, {
              instance: resolved,
              effective: pav.apply ? true : false,
              meta: { preview: pav.preview, verified: pav.verify, action_id: result.action_id },
            }),
            format,
          ),
        );
      } catch (e) {
        const err = CliError.fromUnknown(e);
        process.stderr.write(renderEnvelope(errorEnvelope('proxy', action, err, { instance: resolved }), format));
        process.exitCode = 1;
      }
    });

  proxy
    .command('off')
    .description('Turn off proxy routing (best-effort)')
    .option('--preview', 'Preview without applying')
    .option('--apply', 'Apply the change')
    .option('--verify', 'Verify after apply')
    .option('--rollback <actionId>', 'Rollback a previous action instead of turning off')
    .action(async (cmdOpts: { preview?: boolean; apply?: boolean; verify?: boolean; rollback?: string }) => {
      const opts = program.opts();
      const format = (opts.format ?? 'json') as OutputFormat;
      const nonInteractive = Boolean(opts.nonInteractive);
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'off';
      const pav = resolvePavFlags(cmdOpts);

      if (cmdOpts.rollback) {
        try {
          await runProxyRollback(executor, service, resolved, String(cmdOpts.rollback), format);
        } catch (e) {
          const err = CliError.fromUnknown(e);
          process.stderr.write(renderEnvelope(errorEnvelope('proxy', 'rollback', err, { instance: resolved }), format));
          process.exitCode = 1;
        }
        return;
      }

      try {
        const mode = service.detectMode();
        if (mode === 'env') {
          const guide = {
            instruction: '请在当前 shell 中清理代理环境变量',
            suggested_fix: 'unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy',
          };
          const flow = await flows.createWaitingForUser({
            current_step: 'unset_env_proxy',
            instruction: guide.suggested_fix,
            completion_criteria: ['HTTP_PROXY/HTTPS_PROXY 不再指向目标 Whistle'],
            auto_checks: ['proxy verify'],
          });

          if (nonInteractive) {
            const err = new CliError({
              code: 'USER_ACTION_REQUIRED',
              message: '需要在当前 shell 清理代理环境变量（non-interactive 模式无法继续）',
              reason: guide.instruction,
              suggested_fix: guide.suggested_fix,
            });
            process.stderr.write(renderEnvelope(errorEnvelope('proxy', action, err, { instance: resolved }), format));
            process.exitCode = 1;
            return;
          }

          const envelope = blockedEnvelope('proxy', action, { mode, guide, flow }, { instance: resolved });
          process.stdout.write(renderEnvelope(envelope, format));
          return;
        }

        const result = await executor.execute(
          { resource: 'proxy', action, instance: resolved },
          pav,
          {
            preview: async () => ({ will_run: 'w2 proxy 0' }),
            apply: async () => {
              const prev_port = await service.currentSystemProxyPort(resolved.id);
              const res = await service.offSystemProxy(resolved.id);
              return {
                result: { stdout: res.stdout, stderr: res.stderr, exitCode: res.exitCode, durationMs: res.durationMs },
                rollback: { type: 'proxy.system', prev_port },
              };
            },
          },
        );
        process.stdout.write(
          renderEnvelope(
            okEnvelope('proxy', action, result, {
              instance: resolved,
              effective: pav.apply ? true : false,
              meta: { preview: pav.preview, verified: pav.verify, action_id: result.action_id },
            }),
            format,
          ),
        );
      } catch (e) {
        const err = CliError.fromUnknown(e);
        process.stderr.write(renderEnvelope(errorEnvelope('proxy', action, err, { instance: resolved }), format));
        process.exitCode = 1;
      }
    });

  proxy
    .command('verify')
    .description('Verify current proxy points to selected instance')
    .action(async () => {
      const opts = program.opts();
      const format = opts.format ?? 'json';
      const resolved = await resolveInstanceId(opts.instance);
      const action = 'verify';
      try {
        const inst = await instances.status(resolved.id);
        const st = await service.status(inst.host, inst.port, resolved.id);
        if (!st.active) {
          const envelope = blockedEnvelope(
            'proxy',
            action,
            st,
            {
              instance: resolved,
              next_actions: [{ action: 'proxy set', reason: '将代理指向目标实例后再验证' }],
            },
          );
          process.stdout.write(renderEnvelope(envelope, format));
          return;
        }
        process.stdout.write(renderEnvelope(okEnvelope('proxy', action, st, { instance: resolved, effective: true }), format));
      } catch (e) {
        const err = CliError.fromUnknown(e);
        process.stderr.write(renderEnvelope(errorEnvelope('proxy', action, err, { instance: resolved }), format));
        process.exitCode = 1;
      }
    });
}
