import { describe, expect, it } from 'vitest';
import { okEnvelope, warningEnvelope, errorEnvelope, blockedEnvelope } from '../../src/output/result';
import { renderEnvelope } from '../../src/output/renderers';

describe('Output envelope contract', () => {
  it('renders ok envelope as json with stable top-level keys', () => {
    const env = okEnvelope('instance', 'status', { running: true }, { effective: true, meta: { action_id: 'act_1' } });
    const out = renderEnvelope(env, 'json');
    const parsed = JSON.parse(out);
    expect(parsed.status).toBe('ok');
    expect(parsed.resource).toBe('instance');
    expect(parsed.action).toBe('status');
    expect(parsed.effective).toBe(true);
    expect(parsed.meta.action_id).toBe('act_1');
  });

  it('renders warning envelope with warnings array', () => {
    const env = warningEnvelope('plugins', 'uninstall', { uninstalled: false }, ['PLUGIN_NOT_INSTALLED']);
    const parsed = JSON.parse(renderEnvelope(env, 'json'));
    expect(parsed.status).toBe('warning');
    expect(parsed.warnings).toEqual(['PLUGIN_NOT_INSTALLED']);
  });

  it('renders error envelope with stable error shape', () => {
    const env = errorEnvelope('proxy', 'set', {
      code: 'PROXY_NOT_ACTIVE',
      message: 'System proxy is not active',
      reason: 'expected host:port mismatch',
      suggested_fix: 'Run proxy set then verify',
    });
    const parsed = JSON.parse(renderEnvelope(env, 'json'));
    expect(parsed.status).toBe('error');
    expect(parsed.error.code).toBe('PROXY_NOT_ACTIVE');
    expect(typeof parsed.error.message).toBe('string');
  });

  it('renders blocked envelope with effective=false', () => {
    const env = blockedEnvelope('doctor', 'https-capture', { step: 'trust_cert' });
    const parsed = JSON.parse(renderEnvelope(env, 'json'));
    expect(parsed.status).toBe('blocked');
    expect(parsed.effective).toBe(false);
  });
});

