import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ValuesService } from '../../src/domain/values-service';

async function mkBaseDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'whistle-cli-us2-'));
  await fs.mkdir(path.join(dir, '.whistle', 'values', 'files'), { recursive: true });
  return dir;
}

describe('ValuesService', () => {
  it('sets, gets, lists and removes values under an explicit baseDir', async () => {
    const baseDir = await mkBaseDir();
    const svc = new ValuesService();

    const set1 = await svc.set('k1', 'v1', baseDir);
    expect(set1.entry.key).toBe('k1');
    expect(set1.entry.content).toBe('v1');

    const got = await svc.get('k1', baseDir);
    expect(got.content).toBe('v1');

    const list1 = await svc.list(baseDir);
    expect(list1.map((x) => x.key)).toEqual(['k1']);

    const removed = await svc.remove('k1', baseDir);
    expect(removed.removed).toBe(true);

    const list2 = await svc.list(baseDir);
    expect(list2).toEqual([]);
  });

  it('exports to a file and imports back', async () => {
    const baseDir = await mkBaseDir();
    const svc = new ValuesService();

    await svc.set('k1', 'v1', baseDir);
    const outPath = path.join(baseDir, 'export.txt');
    const exported = await svc.exportToFile('k1', outPath, baseDir);
    expect(exported.outPath).toBe(outPath);
    const onDisk = await fs.readFile(outPath, 'utf8');
    expect(onDisk).toBe('v1');

    await svc.importFromFile('k2', outPath, baseDir);
    const got = await svc.get('k2', baseDir);
    expect(got.content).toBe('v1');
  });
});
