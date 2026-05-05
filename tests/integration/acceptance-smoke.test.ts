import { describe, expect, it } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';

import { runCli } from './us1-bootstrap.fixtures';
import { extractActionId, makeFakeInstanceWithRule, makeTempDir } from './us2-rules.fixtures';
import { startFakeCaptureBackend } from './us3-captures.fixtures';
import { setupFakeW2PluginsEnv } from './us4-plugins.fixtures';

describe('Acceptance smoke (linux/headless-friendly)', () => {
  it(
    'covers core resources end-to-end using deterministic fixtures',
    async () => {
    const backend = await startFakeCaptureBackend();
    try {
      const { env } = await setupFakeW2PluginsEnv();
      const stateDir = await makeTempDir('whistle-cli-acc-state-');
      const { baseDir, fileId } = await makeFakeInstanceWithRule('a=1\n');

      const mergedEnv = {
        ...env,
        WHISTLE_CLI_STATE_DIR: stateDir,
        WHISTLE_CLI_RUNTIME_URL: backend.baseUrl,
        WHISTLE_CLI_PROXY_MODE: 'system',
      };

      // instance + certs (read)
      const inst = await runCli(['--instance', baseDir, 'instance', 'status', '--format', 'json'], { env: mergedEnv });
      expect(inst.exitCode).toBe(0);
      expect(inst.stdout).toContain('"resource":"instance"');

      const certs = await runCli(['--instance', baseDir, 'certs', 'status', '--format', 'json'], { env: mergedEnv });
      expect(certs.exitCode).toBe(0);
      expect(certs.stdout).toContain('"resource":"certs"');

      // proxy set + rollback
      const proxySet = await runCli(['--instance', baseDir, 'proxy', 'set', '--apply', '--format', 'json'], { env: mergedEnv });
      expect(proxySet.exitCode).toBe(0);
      const proxyAct = extractActionId(proxySet.stdout);
      const proxyRollback = await runCli(['--instance', baseDir, 'proxy', 'set', '--rollback', proxyAct, '--format', 'json'], { env: mergedEnv });
      expect(proxyRollback.exitCode).toBe(0);
      expect(proxyRollback.stdout).toContain('"action":"rollback"');

      // rules apply + rollback
      const patchPath = path.join(baseDir, 'patch.txt');
      await fs.writeFile(patchPath, 'b=2\n', 'utf8');
      const rulesApply = await runCli(
        ['--instance', baseDir, 'rules', 'apply', '--id', fileId, '--file', patchPath, '--apply', '--format', 'json'],
        { env: mergedEnv },
      );
      expect(rulesApply.exitCode).toBe(0);
      const rulesAct = extractActionId(rulesApply.stdout);
      const rulesRollback = await runCli(['--instance', baseDir, 'rules', 'rollback', '--action-id', rulesAct, '--format', 'json'], {
        env: mergedEnv,
      });
      expect(rulesRollback.exitCode).toBe(0);

      // captures find
      const capturesFind = await runCli(['--instance', 'dummy', 'captures', 'find', '--limit', '1', '--format', 'json'], { env: mergedEnv });
      expect(capturesFind.exitCode).toBe(0);
      expect(capturesFind.stdout).toContain('"resource":"captures"');

      // plugins install + rollback (via shared --rollback)
      const plugInstall = await runCli(
        ['--instance', 'dummy', 'plugins', 'install', 'whistle.test@1.2.3', '--apply', '--format', 'json'],
        { env: mergedEnv },
      );
      expect(plugInstall.exitCode).toBe(0);
      const plugAct = extractActionId(plugInstall.stdout);
      const plugRollback = await runCli(['--instance', 'dummy', 'plugins', 'install', '--rollback', plugAct, '--format', 'json'], {
        env: mergedEnv,
      });
      expect(plugRollback.exitCode).toBe(0);
      expect(plugRollback.stdout).toContain('"action":"rollback"');
    } finally {
      await backend.close();
    }
    },
    60_000,
  );
});
