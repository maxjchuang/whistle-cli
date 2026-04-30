import fs from 'node:fs/promises';
import path from 'node:path';

import { defaultWhistleStorageDir } from '../backends/storage/whistle-storage';
import { W2Client } from '../backends/raw/w2-client';
import { CliError } from '../output/errors';
import type { PluginIdentifier, PluginLifecycleState, PluginRecord } from './plugins-model';

function ensureW2Available(res: { commandNotFound: boolean }) {
  if (!res.commandNotFound) return;
  throw new CliError({
    code: 'UNSUPPORTED_OPERATION',
    message: '`w2` command not found on PATH',
    reason: 'Plugin lifecycle management relies on `w2` in v1',
    suggested_fix: 'Install whistle: `npm install -g whistle` (or add it as a devDependency).',
  });
}

function resolveInstanceBaseDir(instanceId?: string): { baseDir: string; instance_id: string } {
  const id = (instanceId ?? 'default').trim() || 'default';
  if (id === 'default') return { baseDir: defaultWhistleStorageDir(), instance_id: 'default' };
  // Allow passing an explicit baseDir path.
  if (id.includes('/') || id.includes('\\')) return { baseDir: id, instance_id: id };
  return { baseDir: path.join(defaultWhistleStorageDir(), 'instances', id), instance_id: id };
}

function looksLikeShellUnsafe(input: string): boolean {
  // Commander already gives us one arg, but avoid common foot-guns.
  return /\s|[;&|`$<>]/.test(input);
}

export function parsePluginIdentifier(spec: string): PluginIdentifier {
  const s = spec.trim();
  if (!s) {
    throw new CliError({
      code: 'PLUGIN_INVALID_IDENTIFIER',
      message: 'Plugin identifier is required',
    });
  }
  if (looksLikeShellUnsafe(s)) {
    throw new CliError({
      code: 'PLUGIN_INVALID_IDENTIFIER',
      message: 'Plugin identifier contains unsupported characters',
      reason: 'Whitespace and shell control characters are not allowed in v1 plugin identifiers.',
    });
  }

  // npm package spec parsing (best-effort):
  // - non-scoped: name@version
  // - scoped: @scope/name or @scope/name@version
  let name = s;
  let version: string | undefined;
  if (s.startsWith('@')) {
    const at = s.lastIndexOf('@');
    const slash = s.indexOf('/');
    if (at > slash) {
      name = s.slice(0, at);
      version = s.slice(at + 1) || undefined;
    }
  } else {
    const at = s.lastIndexOf('@');
    if (at > 0) {
      name = s.slice(0, at);
      version = s.slice(at + 1) || undefined;
    }
  }

  if (!name || name === '@') {
    throw new CliError({
      code: 'PLUGIN_INVALID_IDENTIFIER',
      message: 'Invalid plugin identifier',
      reason: `Unable to parse name from: ${s}`,
    });
  }

  // Minimal v1 convention enforcement: encourage whistle.* plugins.
  if (!name.includes('whistle.')) {
    // Do not hard-fail: allow power users, but keep it visible to the caller.
  }

  return { name, version, spec: s };
}

function parsePluginsListLine(line: string): { name: string; version?: string; state: PluginLifecycleState } | null {
  const s = line.trim();
  if (!s) return null;
  // Expected (from our fixtures): <name>@<version> enabled|disabled
  const m = s.match(/^(\S+?)(?:@([^\s]+))?\s+(enabled|disabled)\b/i);
  if (!m) {
    // Best-effort: treat unknown format as installed unknown state
    const token = s.split(/\s+/)[0];
    if (!token) return null;
    const maybe = token.includes('@') && !token.startsWith('@') ? token.split('@') : [token];
    const nm = maybe[0] ?? token;
    const ver = maybe.length > 1 ? maybe.slice(1).join('@') : undefined;
    return { name: nm, version: ver, state: 'unknown' };
  }
  const name = m[1] ?? '';
  const version = m[2] || undefined;
  const state = (m[3] || '').toLowerCase() === 'disabled' ? 'disabled' : 'enabled';
  return { name, version, state };
}

async function readJsonIfExists(filePath: string): Promise<any | null> {
  try {
    const txt = await fs.readFile(filePath, 'utf8');
    return txt.trim() ? JSON.parse(txt) : null;
  } catch {
    return null;
  }
}

export class PluginsService {
  private readonly w2: W2Client;

  constructor(w2Client?: W2Client) {
    this.w2 = w2Client ?? new W2Client();
  }

  private pluginPackageJsonPath(name: string, instanceId?: string): { instance_id: string; pkgJsonPath: string } {
    const { baseDir, instance_id } = resolveInstanceBaseDir(instanceId);
    return {
      instance_id,
      pkgJsonPath: path.join(baseDir, '.whistle', 'node_modules', name, 'package.json'),
    };
  }

  async list(instanceId?: string): Promise<PluginRecord[]> {
    const res = await this.w2.pluginsList({ instanceId });
    ensureW2Available(res);
    if (res.exitCode !== 0) {
      throw new CliError({
        code: 'PLUGIN_CAPABILITY_UNAVAILABLE',
        message: 'Failed to list plugins via w2',
        reason: res.stderr || res.stdout || `exitCode=${res.exitCode}`,
        suggested_fix: 'Try `whistle-cli raw w2 plugin list` to see full output.',
      });
    }

    const { instance_id } = resolveInstanceBaseDir(instanceId);
    const lines = `${res.stdout}\n${res.stderr}`.split(/\r?\n/).map((l) => l.trim());
    const items: PluginRecord[] = [];
    for (const line of lines) {
      const parsed = parsePluginsListLine(line);
      if (!parsed) continue;
      items.push({
        instance_id,
        name: parsed.name,
        version: parsed.version,
        state: parsed.state,
      });
    }
    items.sort((a, b) => a.name.localeCompare(b.name));
    return items;
  }

  async inspect(name: string, instanceId?: string): Promise<PluginRecord> {
    const id = parsePluginIdentifier(name);
    const { instance_id, pkgJsonPath } = this.pluginPackageJsonPath(id.name, instanceId);
    const pkg = await readJsonIfExists(pkgJsonPath);
    if (!pkg) {
      throw new CliError({
        code: 'PLUGIN_NOT_INSTALLED',
        message: `Plugin not installed: ${id.name}`,
        suggested_fix: `Run: whistle-cli plugins install ${id.name} --apply`,
      });
    }

    const state = (await this.list(instanceId)).find((p) => p.name === id.name)?.state ?? 'installed';
    return {
      instance_id,
      name: String(pkg.name || id.name),
      version: typeof pkg.version === 'string' ? pkg.version : undefined,
      description: typeof pkg.description === 'string' ? pkg.description : undefined,
      homepage: typeof pkg.homepage === 'string' ? pkg.homepage : undefined,
      installed_path: path.dirname(pkgJsonPath),
      state,
    };
  }

  async install(spec: string, instanceId?: string): Promise<{ installed: boolean; plugin: PluginRecord; raw: { stdout: string; stderr: string } }>{
    const id = parsePluginIdentifier(spec);
    const res = await this.w2.pluginInstall(id.spec, { instanceId, timeoutMs: 5 * 60_000 });
    ensureW2Available(res);
    if (res.exitCode !== 0) {
      const merged = `${res.stdout}\n${res.stderr}`.toLowerCase();
      const code = merged.includes('enotfound') || merged.includes('econn') || merged.includes('registry')
        ? 'PLUGIN_REGISTRY_UNAVAILABLE'
        : 'PLUGIN_INSTALL_FAILED';
      throw new CliError({
        code,
        message: `Plugin install failed: ${id.name}`,
        reason: res.stderr || res.stdout || `exitCode=${res.exitCode}`,
        suggested_fix: 'Try `whistle-cli raw w2 plugin install <name>` to see full output.',
      });
    }

    const plugin = await this.inspect(id.name, instanceId).catch(() => ({
      instance_id: resolveInstanceBaseDir(instanceId).instance_id,
      name: id.name,
      version: id.version,
      state: 'installed' as const,
    }));

    return {
      installed: true,
      plugin,
      raw: { stdout: res.stdout, stderr: res.stderr },
    };
  }

  async uninstall(name: string, instanceId?: string): Promise<{ uninstalled: boolean; raw: { stdout: string; stderr: string } }>{
    const id = parsePluginIdentifier(name);
    const res = await this.w2.pluginUninstall(id.name, { instanceId, timeoutMs: 5 * 60_000 });
    ensureW2Available(res);
    if (res.exitCode !== 0) {
      throw new CliError({
        code: 'PLUGIN_UNINSTALL_FAILED',
        message: `Plugin uninstall failed: ${id.name}`,
        reason: res.stderr || res.stdout || `exitCode=${res.exitCode}`,
        suggested_fix: 'Try `whistle-cli raw w2 plugin uninstall <name>` to see full output.',
      });
    }
    return { uninstalled: true, raw: { stdout: res.stdout, stderr: res.stderr } };
  }

  async enable(name: string, instanceId?: string): Promise<{ enabled: boolean; raw: { stdout: string; stderr: string } }>{
    const id = parsePluginIdentifier(name);
    const res = await this.w2.pluginEnable(id.name, { instanceId });
    ensureW2Available(res);
    if (res.exitCode !== 0) {
      throw new CliError({
        code: 'PLUGIN_ENABLE_FAILED',
        message: `Plugin enable failed: ${id.name}`,
        reason: res.stderr || res.stdout || `exitCode=${res.exitCode}`,
        suggested_fix: 'Try `whistle-cli raw w2 plugin enable <name>` to see full output.',
      });
    }
    return { enabled: true, raw: { stdout: res.stdout, stderr: res.stderr } };
  }

  async disable(name: string, instanceId?: string): Promise<{ disabled: boolean; raw: { stdout: string; stderr: string } }>{
    const id = parsePluginIdentifier(name);
    const res = await this.w2.pluginDisable(id.name, { instanceId });
    ensureW2Available(res);
    if (res.exitCode !== 0) {
      throw new CliError({
        code: 'PLUGIN_DISABLE_FAILED',
        message: `Plugin disable failed: ${id.name}`,
        reason: res.stderr || res.stdout || `exitCode=${res.exitCode}`,
        suggested_fix: 'Try `whistle-cli raw w2 plugin disable <name>` to see full output.',
      });
    }
    return { disabled: true, raw: { stdout: res.stdout, stderr: res.stderr } };
  }
}

