import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { defaultWhistleStorageDir, type WhistleStorageLocation } from '../backends/storage/whistle-storage';
import { WhistleWebClient } from '../backends/whistle-web';
import { CliError } from '../output/errors';
import { loadConfig } from '../shared/config';
import { InstanceService } from './instance-service';
import type { RuntimeDefaultRules, RuntimeDefaultRulesApplyResult, RuleSet } from './rules-model';

export type RulePatchMode = 'replace' | 'append';

export interface RulePatchPlan {
  instance_id: string;
  file_id: string;
  name: string;
  mode: RulePatchMode;
  base_sha256: string;
  next_sha256: string;
  preview_diff: string;
  patch_bytes: number;
}

type RulesProperties = Record<string, unknown> & {
  filesOrder?: unknown;
  selectedList?: unknown;
};

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

function normalizeProps(raw: unknown): RulesProperties {
  if (!raw || typeof raw !== 'object') return { filesOrder: [], selectedList: [] };
  return raw as RulesProperties;
}

function resolveInstanceBaseDir(instanceId?: string): { baseDir: string; instance_id: string } {
  const id = (instanceId ?? 'default').trim() || 'default';
  if (id === 'default') return { baseDir: defaultWhistleStorageDir(), instance_id: 'default' };
  if (id.includes('/') || id.includes('\\')) return { baseDir: id, instance_id: id };
  return { baseDir: path.join(defaultWhistleStorageDir(), 'instances', id), instance_id: id };
}

function generateFileId(): string {
  return `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

function normalizeEol(s: string): string {
  return s.replace(/\r\n/g, '\n');
}

function joinAppend(base: string, patch: string): string {
  if (!base) return patch;
  if (!patch) return base;
  const b = normalizeEol(base);
  const p = normalizeEol(patch);
  const needsNl = !b.endsWith('\n') && !p.startsWith('\n');
  return needsNl ? `${b}\n${p}` : `${b}${p}`;
}

function renderSimpleDiff(before: string, after: string): string {
  const b = normalizeEol(before);
  const a = normalizeEol(after);
  if (b === a) return '(no changes)';

  const bLines = b.split('\n');
  const aLines = a.split('\n');

  let prefix = 0;
  while (prefix < bLines.length && prefix < aLines.length && bLines[prefix] === aLines[prefix]) prefix++;

  let bSuffix = bLines.length - 1;
  let aSuffix = aLines.length - 1;
  while (bSuffix >= prefix && aSuffix >= prefix && bLines[bSuffix] === aLines[aSuffix]) {
    bSuffix--;
    aSuffix--;
  }

  const out: string[] = [];
  out.push('--- before');
  out.push('+++ after');
  out.push(`@@ -${prefix + 1},${Math.max(0, bSuffix - prefix + 1)} +${prefix + 1},${Math.max(0, aSuffix - prefix + 1)} @@`);

  for (let i = prefix; i <= bSuffix; i++) {
    if (i >= 0 && i < bLines.length) out.push(`- ${bLines[i]}`);
  }
  for (let i = prefix; i <= aSuffix; i++) {
    if (i >= 0 && i < aLines.length) out.push(`+ ${aLines[i]}`);
  }

  return out.join('\n');
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

export class RulesService {
  private readonly instances = new InstanceService();

  resolveStorage(instanceId?: string): WhistleStorageLocation {
    const { baseDir, instance_id } = resolveInstanceBaseDir(instanceId);
    return { path: baseDir, source: instance_id === 'default' ? 'default' : 'candidate' };
  }

  private async whistleWebClientForInstance(instanceId?: string): Promise<WhistleWebClient> {
    const cfg = loadConfig();
    if (cfg.runtimeUrl) return new WhistleWebClient({ baseUrl: cfg.runtimeUrl });

    const st = await this.instances.status(instanceId ?? 'default');
    return new WhistleWebClient({ baseUrl: `http://${st.host}:${st.port}` });
  }

  private rulesDir(storage: WhistleStorageLocation): string {
    return path.join(storage.path, '.whistle', 'rules');
  }

  private propertiesPath(storage: WhistleStorageLocation): string {
    return path.join(this.rulesDir(storage), 'properties');
  }

  private filesDir(storage: WhistleStorageLocation): string {
    return path.join(this.rulesDir(storage), 'files');
  }

  private async ensureRulesDirs(storage: WhistleStorageLocation): Promise<void> {
    await fs.mkdir(this.filesDir(storage), { recursive: true });
  }

  private async readProps(storage: WhistleStorageLocation): Promise<RulesProperties> {
    const raw = (await readTextFileIfExists(this.propertiesPath(storage))) ?? '';
    const parsed = raw.trim() ? safeJsonParse(raw) : { filesOrder: [], selectedList: [] };
    const props = normalizeProps(parsed);
    props.filesOrder = toStringArray(props.filesOrder);
    props.selectedList = toStringArray(props.selectedList);
    return props;
  }

  private async writeProps(storage: WhistleStorageLocation, props: RulesProperties): Promise<void> {
    await writeTextFile(this.propertiesPath(storage), JSON.stringify(props));
  }

  private resolveRuleName(props: RulesProperties, fileId: string): string {
    const v = (props as Record<string, unknown>)[fileId];
    if (typeof v === 'string' && v.trim()) return v;
    if (v && typeof v === 'object' && typeof (v as any).name === 'string') return (v as any).name;
    return fileId;
  }

  async list(instanceId?: string, opts?: { includeText?: boolean }): Promise<RuleSet[]> {
    const storage = this.resolveStorage(instanceId);
    const props = await this.readProps(storage);
    const filesOrder = toStringArray(props.filesOrder);
    const selected = new Set(toStringArray(props.selectedList));

    const out: RuleSet[] = [];
    for (const file_id of filesOrder) {
      const name = this.resolveRuleName(props, file_id);
      const enabled = selected.has(file_id) || selected.has(name);
      const source_text = opts?.includeText ? ((await readTextFileIfExists(path.join(this.filesDir(storage), file_id))) ?? '') : undefined;
      out.push({
        instance_id: instanceId ?? 'default',
        file_id,
        name,
        enabled,
        scope: 'global',
        source_text,
      });
    }
    return out;
  }

  async getRuntimeDefaultRules(instanceId?: string): Promise<RuntimeDefaultRules> {
    const client = await this.whistleWebClientForInstance(instanceId);
    const list = await client.getRulesList();
    return {
      instance_id: instanceId ?? 'default',
      backend: 'whistle-web',
      source_text: list.defaultRules ?? '',
      disabled: Boolean(list.defaultRulesIsDisabled),
    };
  }

  async applyRuntimeDefaultRules(
    text: string,
    instanceId?: string,
    opts?: { verify?: boolean },
  ): Promise<RuntimeDefaultRulesApplyResult> {
    const client = await this.whistleWebClientForInstance(instanceId);
    const before = await client.getRulesList();
    const beforeText = before.defaultRules ?? '';
    await client.applyDefaultRules(text);
    const after = await client.getRulesList();
    const afterText = after.defaultRules ?? '';

    if (opts?.verify && normalizeEol(afterText) !== normalizeEol(text)) {
      throw new CliError({
        code: 'RULE_RUNTIME_VERIFY_FAILED',
        message: 'Runtime default rules verification failed',
        reason: 'Whistle Web API returned default rules that differ from the requested content.',
        suggested_fix: 'Re-run `whistle-cli rules default get` and inspect the active runtime rules before applying again.',
      });
    }

    return {
      backend: 'whistle-web',
      changed: normalizeEol(beforeText) !== normalizeEol(afterText),
      verified: Boolean(opts?.verify),
      before_sha256: sha256Hex(normalizeEol(beforeText)),
      after_sha256: sha256Hex(normalizeEol(afterText)),
    };
  }

  async findByName(name: string, instanceId?: string): Promise<RuleSet | null> {
    const all = await this.list(instanceId);
    return all.find((r) => r.name === name) ?? null;
  }

  async ensureRuleSetByName(name: string, instanceId?: string): Promise<RuleSet> {
    const existing = await this.findByName(name, instanceId);
    if (existing) return this.get(existing.file_id, instanceId);
    return this.create(name, '', instanceId);
  }

  async get(nameOrId: string, instanceId?: string): Promise<RuleSet> {
    const storage = this.resolveStorage(instanceId);
    const props = await this.readProps(storage);
    const filesOrder = toStringArray(props.filesOrder);
    const selected = new Set(toStringArray(props.selectedList));

    const matchId = filesOrder.find((id) => id === nameOrId) ?? filesOrder.find((id) => this.resolveRuleName(props, id) === nameOrId);
    if (!matchId) {
      throw new CliError({
        code: 'UNSUPPORTED_OPERATION',
        message: `Rule set not found: ${nameOrId}`,
        reason: 'No matching file_id/name in `.whistle/rules/properties.filesOrder`',
        suggested_fix: 'Use `whistle-cli rules list` to discover available rule sets first.',
      });
    }

    const name = this.resolveRuleName(props, matchId);
    const enabled = selected.has(matchId) || selected.has(name);
    const source_text = (await readTextFileIfExists(path.join(this.filesDir(storage), matchId))) ?? '';
    return { instance_id: instanceId ?? 'default', file_id: matchId, name, enabled, scope: 'global', source_text };
  }

  async planPatchFromText(
    nameOrId: string,
    patchText: string,
    mode: RulePatchMode,
    instanceId?: string,
  ): Promise<RulePatchPlan> {
    const current = await this.get(nameOrId, instanceId);
    const base = current.source_text ?? '';
    const next = mode === 'append' ? joinAppend(base, patchText) : normalizeEol(patchText);
    const base_sha256 = sha256Hex(normalizeEol(base));
    const next_sha256 = sha256Hex(next);
    return {
      instance_id: instanceId ?? 'default',
      file_id: current.file_id,
      name: current.name,
      mode,
      base_sha256,
      next_sha256,
      preview_diff: renderSimpleDiff(base, next),
      patch_bytes: Buffer.byteLength(patchText, 'utf8'),
    };
  }

  async applyPlannedPatch(plan: RulePatchPlan, patchText: string, instanceId?: string): Promise<{ changed: boolean; rule: RuleSet }> {
    const storage = this.resolveStorage(instanceId);
    const filePath = path.join(this.filesDir(storage), plan.file_id);
    const currentText = (await readTextFileIfExists(filePath)) ?? '';
    const currentHash = sha256Hex(normalizeEol(currentText));
    if (currentHash !== plan.base_sha256) {
      throw new CliError({
        code: 'RULE_CONFLICT',
        message: 'Rule changed since preview was generated',
        reason: `expected base_sha256=${plan.base_sha256}, got ${currentHash}`,
        suggested_fix: 'Re-run `whistle-cli rules patch` to regenerate the preview, then apply again.',
      });
    }

    const next = plan.mode === 'append' ? joinAppend(currentText, patchText) : normalizeEol(patchText);
    await writeTextFile(filePath, next);
    const rule = await this.get(plan.file_id, instanceId);
    return { changed: normalizeEol(currentText) !== normalizeEol(next), rule };
  }

  async verify(nameOrId: string, instanceId?: string): Promise<{ ok: boolean; reason?: string; rule?: RuleSet }> {
    try {
      const rule = await this.get(nameOrId, instanceId);
      return { ok: true, rule };
    } catch (e) {
      const err = CliError.fromUnknown(e);
      return { ok: false, reason: `${err.details.code}: ${err.details.message}` };
    }
  }

  async setEnabled(nameOrId: string, enabled: boolean, instanceId?: string): Promise<{ changed: boolean; rule: RuleSet }>{
    const storage = this.resolveStorage(instanceId);
    const props = await this.readProps(storage);
    const filesOrder = toStringArray(props.filesOrder);
    const selected = toStringArray(props.selectedList);

    const matchId = filesOrder.find((id) => id === nameOrId) ?? filesOrder.find((id) => this.resolveRuleName(props, id) === nameOrId);
    if (!matchId) {
      throw new CliError({
        code: 'UNSUPPORTED_OPERATION',
        message: `Rule set not found: ${nameOrId}`,
      });
    }

    const before = new Set(selected);
    const prevEnabled = before.has(matchId);
    if (enabled) before.add(matchId);
    else before.delete(matchId);
    props.selectedList = Array.from(before);
    await this.writeProps(storage, props);

    const rule = await this.get(matchId, instanceId);
    return { changed: prevEnabled !== enabled, rule };
  }

  async create(name: string, sourceText: string, instanceId?: string): Promise<RuleSet> {
    const storage = this.resolveStorage(instanceId);
    await this.ensureRulesDirs(storage);
    const props = await this.readProps(storage);
    const file_id = generateFileId();
    await writeTextFile(path.join(this.filesDir(storage), file_id), sourceText);
    const filesOrder = toStringArray(props.filesOrder);
    filesOrder.push(file_id);
    props.filesOrder = filesOrder;
    (props as Record<string, unknown>)[file_id] = name;
    await this.writeProps(storage, props);
    return this.get(file_id, instanceId);
  }

  async importFromFile(name: string, filePath: string, instanceId?: string): Promise<RuleSet> {
    const contents = await fs.readFile(filePath, 'utf8');
    return this.create(name, contents, instanceId);
  }

  async exportToFile(nameOrId: string, outPath: string, instanceId?: string): Promise<{ outPath: string; bytes: number }> {
    const rule = await this.get(nameOrId, instanceId);
    const text = rule.source_text ?? '';
    await writeTextFile(outPath, text);
    return { outPath, bytes: Buffer.byteLength(text, 'utf8') };
  }

  async removeRuleSet(nameOrId: string, instanceId?: string): Promise<{ removed: boolean; file_id?: string }> {
    const storage = this.resolveStorage(instanceId);
    const props = await this.readProps(storage);
    const filesOrder = toStringArray(props.filesOrder);

    const matchId =
      filesOrder.find((id) => id === nameOrId) ?? filesOrder.find((id) => this.resolveRuleName(props, id) === nameOrId);
    if (!matchId) return { removed: false };

    props.filesOrder = filesOrder.filter((id) => id !== matchId);
    props.selectedList = toStringArray(props.selectedList).filter((id) => id !== matchId);
    delete (props as Record<string, unknown>)[matchId];
    await this.writeProps(storage, props);

    await fs.unlink(path.join(this.filesDir(storage), matchId)).catch(() => undefined);
    return { removed: true, file_id: matchId };
  }
}
