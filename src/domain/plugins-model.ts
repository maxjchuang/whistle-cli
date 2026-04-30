export type PluginLifecycleState = 'installed' | 'enabled' | 'disabled' | 'unknown';

export interface PluginIdentifier {
  /** npm package name (may be scoped). Examples: `whistle.foo`, `@scope/whistle.foo` */
  name: string;
  /** optional semver-ish string (best-effort parsing) */
  version?: string;
  /** original user input */
  spec: string;
}

export interface PluginRecord {
  instance_id: string;
  name: string;
  version?: string;
  state: PluginLifecycleState;
  description?: string;
  homepage?: string;
  installed_path?: string;
}

