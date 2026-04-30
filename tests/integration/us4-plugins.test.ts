import { describe, expect, it } from 'vitest';
import { runCli } from './us1-bootstrap.fixtures';
import { setupFakeW2PluginsEnv } from './us4-plugins.fixtures';

describe('US4 plugins (integration)', () => {
  it('plugins list/install/inspect/enable/disable/uninstall produce envelopes and support rollback', async () => {
    const { env } = await setupFakeW2PluginsEnv();

    const empty = await runCli(['--instance', 'dummy', 'plugins', 'list', '--format', 'json'], { env });
    expect(empty.exitCode).toBe(0);
    expect(empty.stdout).toContain('"resource":"plugins"');
    expect(empty.stdout).toContain('"action":"list"');

    const preview = await runCli(
      ['--instance', 'dummy', 'plugins', 'install', 'whistle.test@1.2.3', '--preview', '--format', 'json'],
      { env },
    );
    expect(preview.exitCode).toBe(0);
    const previewEnv = JSON.parse(preview.stdout);
    expect(previewEnv.resource).toBe('plugins');
    expect(previewEnv.action).toBe('install');
    expect(previewEnv.meta?.preview).toBe(true);

    const installed = await runCli(
      ['--instance', 'dummy', 'plugins', 'install', 'whistle.test@1.2.3', '--apply', '--format', 'json'],
      { env },
    );
    expect(installed.exitCode).toBe(0);
    const installedEnv = JSON.parse(installed.stdout);
    expect(installedEnv.resource).toBe('plugins');
    expect(installedEnv.action).toBe('install');
    expect(typeof installedEnv?.meta?.action_id).toBe('string');

    const inspect = await runCli(['--instance', 'dummy', 'plugins', 'inspect', 'whistle.test', '--format', 'json'], { env });
    expect(inspect.exitCode).toBe(0);
    expect(inspect.stdout).toContain('"resource":"plugins"');
    expect(inspect.stdout).toContain('"action":"inspect"');
    expect(inspect.stdout).toContain('"name":"whistle.test"');
    expect(inspect.stdout).toContain('"version":"1.2.3"');

    const disable = await runCli(['--instance', 'dummy', 'plugins', 'disable', 'whistle.test', '--apply', '--format', 'json'], { env });
    expect(disable.exitCode).toBe(0);
    const disableEnv = JSON.parse(disable.stdout);
    const disableActionId = disableEnv?.meta?.action_id;
    expect(typeof disableActionId).toBe('string');

    const rollback = await runCli(['--instance', 'dummy', 'plugins', 'disable', '--rollback', disableActionId, '--format', 'json'], { env });
    expect(rollback.exitCode).toBe(0);
    const rollbackEnv = JSON.parse(rollback.stdout);
    expect(rollbackEnv.resource).toBe('plugins');
    expect(rollbackEnv.action).toBe('rollback');

    const uninstall = await runCli(['--instance', 'dummy', 'plugins', 'uninstall', 'whistle.test', '--apply', '--format', 'json'], { env });
    expect(uninstall.exitCode).toBe(0);
    expect(uninstall.stdout).toContain('"action":"uninstall"');
  });
});

