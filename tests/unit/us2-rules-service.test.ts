import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { RulesService } from '../../src/domain/rules-service';
import { CliError } from '../../src/output/errors';

async function mkRulesBaseDir(): Promise<{ baseDir: string; fileId: string }> {
  const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'whistle-cli-us2-rules-'));
  const rulesDir = path.join(baseDir, '.whistle', 'rules');
  const filesDir = path.join(rulesDir, 'files');
  await fs.mkdir(filesDir, { recursive: true });

  const fileId = 'r1';
  await fs.writeFile(path.join(filesDir, fileId), 'a=1\n', 'utf8');
  const props = { filesOrder: [fileId], selectedList: [], [fileId]: 'main' };
  await fs.writeFile(path.join(rulesDir, 'properties'), JSON.stringify(props), 'utf8');
  return { baseDir, fileId };
}

describe('RulesService patch', () => {
  it('plans and applies a replace patch', async () => {
    const { baseDir, fileId } = await mkRulesBaseDir();
    const svc = new RulesService();

    const plan = await svc.planPatchFromText(fileId, 'b=2\n', 'replace', baseDir);
    expect(plan.file_id).toBe(fileId);
    expect(plan.preview_diff).toContain('--- before');
    expect(plan.preview_diff).toContain('+++ after');

    const applied = await svc.applyPlannedPatch(plan, 'b=2\n', baseDir);
    expect(applied.changed).toBe(true);
    expect(applied.rule.source_text).toContain('b=2');
  });

  it('detects conflict if rule changed after preview', async () => {
    const { baseDir, fileId } = await mkRulesBaseDir();
    const svc = new RulesService();

    const plan = await svc.planPatchFromText(fileId, 'b=2\n', 'replace', baseDir);
    // External change
    await fs.writeFile(path.join(baseDir, '.whistle', 'rules', 'files', fileId), 'external=1\n', 'utf8');

    let caught: unknown;
    try {
      await svc.applyPlannedPatch(plan, 'b=2\n', baseDir);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(CliError);
    const err = caught as CliError;
    expect(err.details.code).toBe('RULE_CONFLICT');
  });

  it('exports to a file and imports as a new rule set', async () => {
    const { baseDir, fileId } = await mkRulesBaseDir();
    const svc = new RulesService();

    const outPath = path.join(baseDir, 'rules-export.txt');
    const exported = await svc.exportToFile(fileId, outPath, baseDir);
    expect(exported.outPath).toBe(outPath);
    const onDisk = await fs.readFile(outPath, 'utf8');
    expect(onDisk).toContain('a=1');

    const imported = await svc.importFromFile('imported', outPath, baseDir);
    expect(imported.name).toBe('imported');
    expect(imported.source_text).toContain('a=1');

    const listed = await svc.list(baseDir);
    expect(listed.length).toBe(2);
  });
});
