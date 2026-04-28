import crypto from 'node:crypto';
import { loadConfig } from '../shared/config';
import { StateStore } from '../backends/storage/state-store';

export interface PreviewApplyVerifyOptions {
  preview?: boolean;
  apply?: boolean;
  verify?: boolean;
}

export class ActionExecutor {
  // Shared preview->apply->verify coordinator. Resource services will use this
  // for deterministic mutation flows and action history persistence.
  async execute<TPreview, TResult>(
    opts: PreviewApplyVerifyOptions,
    handlers: {
      preview: () => Promise<TPreview>;
      apply: () => Promise<TResult>;
      verify?: () => Promise<unknown>;
    },
  ): Promise<{
    action_id: string;
    preview?: TPreview;
    apply_result?: TResult;
    verify_result?: unknown;
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

    if (doApply) {
      apply_result = await handlers.apply();
      if (doVerify && handlers.verify) {
        verify_result = await handlers.verify();
      }
    }

    await store.appendActionLog({
      action_id,
      resource: 'unknown',
      action: 'unknown',
      created_at,
      preview,
      apply_result,
      verify_result,
    });

    return { action_id, preview, apply_result, verify_result };
  }
}
