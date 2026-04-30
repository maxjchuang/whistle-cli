import os from 'node:os';
import path from 'node:path';

export interface WhistleCliConfig {
  stateDir: string;
  /** Optional runtime capture backend base URL (overrides instance-derived URL). */
  runtimeUrl?: string;
}

export function loadConfig(): WhistleCliConfig {
  const stateDir =
    process.env.WHISTLE_CLI_STATE_DIR?.trim() || path.join(os.homedir(), '.whistle-cli');
  const runtimeUrl = process.env.WHISTLE_CLI_RUNTIME_URL?.trim() || undefined;
  return { stateDir, runtimeUrl };
}
