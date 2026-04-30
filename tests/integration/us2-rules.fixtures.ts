import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';

export async function makeTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  return dir;
}

export async function makeFakeInstanceWithRule(ruleText: string): Promise<{ baseDir: string; fileId: string }> {
  const baseDir = await makeTempDir('whistle-cli-us2-instance-');
  const rulesDir = path.join(baseDir, '.whistle', 'rules');
  const filesDir = path.join(rulesDir, 'files');
  await fs.mkdir(filesDir, { recursive: true });
  const fileId = 'r1';
  await fs.writeFile(path.join(filesDir, fileId), ruleText, 'utf8');
  await fs.writeFile(
    path.join(rulesDir, 'properties'),
    JSON.stringify({ filesOrder: [fileId], selectedList: [], [fileId]: 'main' }),
    'utf8',
  );
  return { baseDir, fileId };
}

export function extractActionId(output: string): string {
  const m = output.match(/"action_id"\s*:\s*"(act_[^"]+)"/);
  if (!m?.[1]) {
    throw new Error(`action_id not found in output: ${output.slice(0, 200)}`);
  }
  return m[1];
}

