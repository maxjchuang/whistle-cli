import crypto from 'node:crypto';
import { loadConfig } from '../shared/config';
import { StateStore } from '../backends/storage/state-store';
import type { InstanceRef, ResourceName } from '../output/result';
import { CliError } from '../output/errors';

export interface PreviewApplyVerifyOptions {
  preview?: boolean;
  apply?: boolean;
  verify?: boolean;
}

export interface ActionMeta {
  resource: ResourceName;
  action: string;
  instance?: InstanceRef;
}

export interface ApplyOutcome<TResult> {
  result: TResult;
  rollback?: unknown;
}

export class ActionExecutor {
  // Shared preview->apply->verify coordinator. Resource services will use this
  // for deterministic mutation flows and action history persistence.
  async execute<TPreview, TResult>(
    meta: ActionMeta,
    opts: PreviewApplyVerifyOptions,
    handlers: {
      preview: () => Promise<TPreview>;
      apply: () => Promise<ApplyOutcome<TResult>>;
      verify?: () => Promise<unknown>;
    },
  ): Promise<{
    action_id: string;
    preview?: TPreview;
    apply_result?: TResult;
    verify_result?: unknown;
    rollback?: unknown;
  }> {
    const config = loadConfig();
    const store = new StateStore(config.stateDir);

    const action_id = `act_${crypto.randomUUID()}`;
    const created_at = new Date().toISOString();

    const doPreview = opts.preview === true;
    const doApply = opts.apply === true;
    const doVerify = opts.verify === true;

    const preview = doPreview ? await handlers.preview() : undefined;

    let apply_result: TResult | undefined;
    let verify_result: unknown | undefined;
    let rollback: unknown | undefined;

    if (doApply) {
      const outcome = await handlers.apply();
      apply_result = outcome.result;
      rollback = outcome.rollback;
      if (doVerify && handlers.verify) {
        verify_result = await handlers.verify();
      }
    }

    await store.appendActionLog({
      action_id,
      resource: meta.resource,
      action: meta.action,
      created_at,
      instance_id: meta.instance?.id,
      preview,
      apply_result,
      verify_result,
      rollback,
    });

    return { action_id, preview, apply_result, verify_result, rollback };
  }

  async load(actionId: string) {
    const config = loadConfig();
    const store = new StateStore(config.stateDir);
    return store.findActionLog(actionId);
  }

  async executeRollback<TResult>(
    meta: ActionMeta,
    actionId: string,
    handler: (rollbackHandle: unknown) => Promise<TResult>,
  ): Promise<{ action_id: string; rollback_of: string; result: TResult }> {
    const config = loadConfig();
    const store = new StateStore(config.stateDir);
    const record = await store.findActionLog(actionId);
    if (!record) {
      throw new CliError({
        code: 'UNSUPPORTED_OPERATION',
        message: 'Rollback action not found',
        reason: `No action log entry for ${actionId}`,
      });
    }
    if (record.rollback === undefined) {
      throw new CliError({
        code: 'UNSUPPORTED_OPERATION',
        message: 'Rollback not available for this action',
        reason: `Action ${actionId} does not include a rollback handle`,
      });
    }

    const rollbackActionId = `act_${crypto.randomUUID()}`;
    const created_at = new Date().toISOString();
    const result = await handler(record.rollback);

    await store.appendActionLog({
      action_id: rollbackActionId,
      resource: meta.resource,
      action: `${meta.action}.rollback`,
      created_at,
      instance_id: meta.instance?.id,
      apply_result: { rollback_of: actionId, result },
    });

    return { action_id: rollbackActionId, rollback_of: actionId, result };
  }
}
