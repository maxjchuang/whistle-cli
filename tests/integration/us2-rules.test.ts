import path from 'node:path';
import fs from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { runCli } from './us1-bootstrap.fixtures';
import { extractActionId, makeFakeInstanceWithRule, makeTempDir } from './us2-rules.fixtures';

describe('US2 rules/values rollback (integration)', () => {
  it('rules apply produces action log and rules rollback restores previous content', async () => {
    const stateDir = await makeTempDir('whistle-cli-us2-state-');
    const { baseDir, fileId } = await makeFakeInstanceWithRule('a=1\n');
    const patchPath = path.join(baseDir, 'patch.txt');
    await fs.writeFile(patchPath, 'b=2\n', 'utf8');

    const apply = await runCli(['--instance', baseDir, 'rules', 'apply', '--id', fileId, '--file', patchPath, '--apply', '--format', 'json'], {
      env: {
        WHISTLE_CLI_STATE_DIR: stateDir,
      },
    });
    expect(apply.exitCode).toBe(0);
    const actionId = extractActionId(apply.stdout);

    const after = await fs.readFile(path.join(baseDir, '.whistle', 'rules', 'files', fileId), 'utf8');
    expect(after).toContain('b=2');

    const rollback = await runCli(['--instance', baseDir, 'rules', 'rollback', '--action-id', actionId, '--format', 'json'], {
      env: {
        WHISTLE_CLI_STATE_DIR: stateDir,
      },
    });
    expect(rollback.exitCode).toBe(0);
    const restored = await fs.readFile(path.join(baseDir, '.whistle', 'rules', 'files', fileId), 'utf8');
    expect(restored).toContain('a=1');
  });

  it('values set produces action log and values rollback restores previous state', async () => {
    const stateDir = await makeTempDir('whistle-cli-us2-state-');
    const baseDir = await makeTempDir('whistle-cli-us2-instance-');
    await fs.mkdir(path.join(baseDir, '.whistle', 'values', 'files'), { recursive: true });
    await fs.writeFile(path.join(baseDir, '.whistle', 'values', 'properties'), JSON.stringify({ filesOrder: [] }), 'utf8');

    const set = await runCli(['--instance', baseDir, 'values', 'set', '--key', 'k1', '--value', 'v1', '--apply', '--format', 'json'], {
      env: {
        WHISTLE_CLI_STATE_DIR: stateDir,
      },
    });
    expect(set.exitCode).toBe(0);
    const actionId = extractActionId(set.stdout);

    const get1 = await runCli(['--instance', baseDir, 'values', 'get', '--key', 'k1', '--format', 'json'], {
      env: { WHISTLE_CLI_STATE_DIR: stateDir },
    });
    expect(get1.exitCode).toBe(0);
    expect(get1.stdout).toContain('"content":"v1"');

    const rollback = await runCli(['--instance', baseDir, 'values', 'rollback', '--action-id', actionId, '--format', 'json'], {
      env: {
        WHISTLE_CLI_STATE_DIR: stateDir,
      },
    });
    expect(rollback.exitCode).toBe(0);

    const get2 = await runCli(['--instance', baseDir, 'values', 'get', '--key', 'k1', '--format', 'json'], {
      env: { WHISTLE_CLI_STATE_DIR: stateDir },
    });
    expect(get2.exitCode).not.toBe(0);
    expect(get2.stderr).toContain('"resource":"values"');
  });
});

