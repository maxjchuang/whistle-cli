import { describe, expect, it } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { execa } from 'execa';

describe('skill install smoke', () => {
  it(
    'installs the repository-local skill into a skills directory',
    async () => {
    const repoRoot = path.resolve(__dirname, '..', '..');
    const tmpSkillsRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'whistle-cli-skills-'));
    try {
      await execa('bash', ['./scripts/install-skill.sh'], {
        cwd: repoRoot,
        reject: true,
        env: {
          ...process.env,
          SKILLS_DIR: tmpSkillsRoot,
          WHISTLE_CLI_INSTALLED_VERSION: '0.9.0',
        },
      });

      const skillDir = path.join(tmpSkillsRoot, 'whistle-cli');
      const skillMd = await fs.readFile(path.join(skillDir, 'SKILL.md'), 'utf8');
      expect(skillMd).toContain('whistle-cli');
      expect(skillMd).toContain('--format json');
      expect(skillMd).toContain('Resource-First');
    } finally {
      await fs.rm(tmpSkillsRoot, { recursive: true, force: true });
    }
    },
    30_000,
  );
});
