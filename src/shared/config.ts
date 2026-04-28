import os from 'node:os';
import path from 'node:path';

export interface WhistleCliConfig {
  stateDir: string;
}

export function loadConfig(): WhistleCliConfig {
  const stateDir =
    process.env.WHISTLE_CLI_STATE_DIR?.trim() || path.join(os.homedir(), '.whistle-cli');
  return { stateDir };
}

