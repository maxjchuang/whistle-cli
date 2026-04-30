import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildProgram } from '../../src/cli/program';

async function mkInstanceBaseDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'whistle-cli-us2-shortcut-'));
  await fs.mkdir(path.join(dir, '.whistle', 'rules', 'files'), { recursive: true });
  await fs.writeFile(path.join(dir, '.whistle', 'rules', 'properties'), JSON.stringify({ filesOrder: [], selectedList: [] }), 'utf8');
  return dir;
}

describe('rule shortcuts', () => {
  it('rule set-header appends a reqHeaders line into default ruleset', async () => {
    const baseDir = await mkInstanceBaseDir();
    const program = buildProgram();

    let out = '';
    const origWrite = process.stdout.write.bind(process.stdout);
    (process.stdout.write as any) = (chunk: any) => {
      out += String(chunk);
      return true;
    };

    try {
      await program.parseAsync([
        'node',
        'whistle-cli',
        '--format',
        'json',
        '--instance',
        baseDir,
        'rule',
        'set-header',
        '--match',
        'www.example.com/api',
        '--header',
        'x-test=1',
        '--apply',
      ]);
    } finally {
      (process.stdout.write as any) = origWrite;
    }

    const propsRaw = await fs.readFile(path.join(baseDir, '.whistle', 'rules', 'properties'), 'utf8');
    const props = JSON.parse(propsRaw);
    expect(Array.isArray(props.filesOrder)).toBe(true);
    expect(props.filesOrder.length).toBe(1);

    const fileId = props.filesOrder[0];
    const ruleText = await fs.readFile(path.join(baseDir, '.whistle', 'rules', 'files', fileId), 'utf8');
    expect(ruleText).toContain('www.example.com/api reqHeaders://x-test=1');
    expect(out).toContain('"status":"ok"');
  });
});

