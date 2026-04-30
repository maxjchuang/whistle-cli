import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { defaultWhistleStorageDir, type WhistleStorageLocation } from '../backends/storage/whistle-storage';
import { CliError } from '../output/errors';

export interface ValueEntry {
  instance_id: string;
  key: string;
  file_id: string;
  content_type: 'text';
  content?: string;
}

type ValuesProperties = Record<string, unknown> & {
  filesOrder?: unknown;
};

export interface ValueRollbackSnapshot {
  existed: boolean;
  key: string;
  prev_file_id?: string;
  prev_content?: string;
  created_file_id?: string;
}

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => typeof x === 'string') as string[];
}

function safeJsonParse(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function resolveInstanceBaseDir(instanceId?: string): { baseDir: string; instance_id: string } {
  const id = (instanceId ?? 'default').trim() || 'default';
  if (id === 'default') return { baseDir: defaultWhistleStorageDir(), instance_id: 'default' };
  // Allow passing an explicit baseDir path.
  if (id.includes('/') || id.includes('\\')) return { baseDir: id, instance_id: id };
  return { baseDir: path.join(defaultWhistleStorageDir(), 'instances', id), instance_id: id };
}

async function readTextFileIfExists(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

async function writeTextFile(filePath: string, contents: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, contents, 'utf8');
}

function normalizeProps(raw: unknown): ValuesProperties {
  if (!raw || typeof raw !== 'object') return {};
  return raw as ValuesProperties;
}

function isReservedKey(k: string): boolean {
  return k === 'filesOrder' || k === 'selectedList';
}

function extractKeyToFileId(props: ValuesProperties): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(props)) {
    if (isReservedKey(k)) continue;
    if (typeof v === 'string' && v.trim()) out[k] = v;
  }
  return out;
}

function generateFileId(): string {
  // Whistle commonly uses numeric-ish ids, but any stable filename is acceptable for v1.
  return `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

export class ValuesService {
  resolveStorage(instanceId?: string): WhistleStorageLocation {
    const { baseDir, instance_id } = resolveInstanceBaseDir(instanceId);
    return { path: baseDir, source: instance_id === 'default' ? 'default' : 'candidate' };
  }

  private valuesDir(storage: WhistleStorageLocation): string {
    return path.join(storage.path, '.whistle', 'values');
  }

  private propertiesPath(storage: WhistleStorageLocation): string {
    return path.join(this.valuesDir(storage), 'properties');
  }

  private filesDir(storage: WhistleStorageLocation): string {
    return path.join(this.valuesDir(storage), 'files');
  }

  private async readProps(storage: WhistleStorageLocation): Promise<ValuesProperties> {
    const raw = (await readTextFileIfExists(this.propertiesPath(storage))) ?? '';
    const parsed = raw.trim() ? safeJsonParse(raw) : {};
    const props = normalizeProps(parsed);
    props.filesOrder = toStringArray(props.filesOrder);
    return props;
  }

  private async writeProps(storage: WhistleStorageLocation, props: ValuesProperties): Promise<void> {
    await writeTextFile(this.propertiesPath(storage), JSON.stringify(props));
  }

  async snapshot(key: string, instanceId?: string): Promise<ValueRollbackSnapshot> {
    try {
      const entry = await this.get(key, instanceId);
      return {
        existed: true,
        key,
        prev_file_id: entry.file_id,
        prev_content: entry.content ?? '',
      };
    } catch {
      return { existed: false, key };
    }
  }

  async restore(snapshot: ValueRollbackSnapshot, instanceId?: string): Promise<{ restored: boolean }>{
    const storage = this.resolveStorage(instanceId);

    if (!snapshot.existed) {
      // Remove the key if present now.
      await this.remove(snapshot.key, instanceId);
      // Best-effort: cleanup created file if we know it.
      if (snapshot.created_file_id) {
        await fs.unlink(path.join(this.filesDir(storage), snapshot.created_file_id)).catch(() => undefined);
      }
      return { restored: true };
    }

    const props = await this.readProps(storage);
    const fileId = snapshot.prev_file_id ?? generateFileId();
    await writeTextFile(path.join(this.filesDir(storage), fileId), snapshot.prev_content ?? '');
    (props as Record<string, unknown>)[snapshot.key] = fileId;
    const order = toStringArray(props.filesOrder);
    if (!order.includes(fileId)) order.push(fileId);
    props.filesOrder = order;
    await this.writeProps(storage, props);

    // Best-effort: remove created file if it differs.
    if (snapshot.created_file_id && snapshot.created_file_id !== fileId) {
      await fs.unlink(path.join(this.filesDir(storage), snapshot.created_file_id)).catch(() => undefined);
    }

    return { restored: true };
  }

  async list(instanceId?: string): Promise<ValueEntry[]> {
    const storage = this.resolveStorage(instanceId);
    const raw = (await readTextFileIfExists(this.propertiesPath(storage))) ?? '';
    const parsed = raw.trim() ? safeJsonParse(raw) : {};
    const props = normalizeProps(parsed);
    const mapping = extractKeyToFileId(props);
    const orderIds = toStringArray(props.filesOrder);

    const entries = Object.entries(mapping).map(([key, file_id]) => ({
      instance_id: instanceId ?? 'default',
      key,
      file_id,
      content_type: 'text' as const,
    }));

    if (orderIds.length) {
      const byIdOrder = new Map(orderIds.map((id, idx) => [id, idx] as const));
      entries.sort((a, b) => {
        const ai = byIdOrder.get(a.file_id);
        const bi = byIdOrder.get(b.file_id);
        if (ai == null && bi == null) return a.key.localeCompare(b.key);
        if (ai == null) return 1;
        if (bi == null) return -1;
        return ai - bi;
      });
    } else {
      entries.sort((a, b) => a.key.localeCompare(b.key));
    }

    return entries;
  }

  async get(key: string, instanceId?: string): Promise<ValueEntry> {
    const storage = this.resolveStorage(instanceId);
    const raw = (await readTextFileIfExists(this.propertiesPath(storage))) ?? '';
    const parsed = raw.trim() ? safeJsonParse(raw) : {};
    const props = normalizeProps(parsed);
    const mapping = extractKeyToFileId(props);
    const file_id = mapping[key];
    if (!file_id) {
      throw new CliError({
        code: 'UNSUPPORTED_OPERATION',
        message: `Value not found: ${key}`,
        reason: 'No mapping exists in `.whistle/values/properties`',
        suggested_fix: 'Use `whistle-cli values set --key <k> --value <text>` to create it.',
      });
    }
    const content = await readTextFileIfExists(path.join(this.filesDir(storage), file_id));
    return {
      instance_id: instanceId ?? 'default',
      key,
      file_id,
      content_type: 'text',
      content: content ?? '',
    };
  }

  async set(key: string, value: string, instanceId?: string): Promise<{ changed: boolean; entry: ValueEntry }> {
    const storage = this.resolveStorage(instanceId);
    const props = await this.readProps(storage);
    const mapping = extractKeyToFileId(props);
    const existingId = mapping[key];
    const file_id = existingId ?? generateFileId();

    const filePath = path.join(this.filesDir(storage), file_id);
    const prev = await readTextFileIfExists(filePath);
    await writeTextFile(filePath, value);

    // Update properties mapping.
    (props as Record<string, unknown>)[key] = file_id;
    const filesOrder = toStringArray(props.filesOrder);
    if (!filesOrder.includes(file_id)) {
      filesOrder.push(file_id);
      props.filesOrder = filesOrder;
    }
    await this.writeProps(storage, props);

    return {
      changed: prev !== value,
      entry: {
        instance_id: instanceId ?? 'default',
        key,
        file_id,
        content_type: 'text',
        content: value,
      },
    };
  }

  async remove(key: string, instanceId?: string): Promise<{ removed: boolean; file_id?: string }> {
    const storage = this.resolveStorage(instanceId);
    const props = await this.readProps(storage);
    const mapping = extractKeyToFileId(props);
    const file_id = mapping[key];
    if (!file_id) return { removed: false };

    delete (props as Record<string, unknown>)[key];
    const filesOrder = toStringArray(props.filesOrder).filter((id) => id !== file_id);
    props.filesOrder = filesOrder;
    await this.writeProps(storage, props);

    // Best-effort: remove file.
    await fs.unlink(path.join(this.filesDir(storage), file_id)).catch(() => undefined);
    return { removed: true, file_id };
  }

  async importFromFile(key: string, filePath: string, instanceId?: string) {
    const content = await fs.readFile(filePath, 'utf8');
    return this.set(key, content, instanceId);
  }

  async exportToFile(key: string, outPath: string, instanceId?: string) {
    const entry = await this.get(key, instanceId);
    await writeTextFile(outPath, entry.content ?? '');
    return { outPath };
  }
}
