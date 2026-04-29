import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export type WhistleStorageSource = 'env' | 'default' | 'candidate' | 'unknown';

export interface WhistleStorageLocation {
  path: string;
  source: WhistleStorageSource;
}

async function dirExists(p: string): Promise<boolean> {
  try {
    const st = await fs.stat(p);
    return st.isDirectory();
  } catch {
    return false;
  }
}

export function defaultWhistleStorageDir(): string {
  const envDir = process.env.WHISTLE_STORAGE_DIR?.trim() || process.env.WHISTLE_APPDATA_DIR?.trim();
  if (envDir) return envDir;
  // Whistle's default data dir is commonly `~/.WhistleAppData` on macOS/Linux.
  // Windows typically uses `%APPDATA%\WhistleAppData`.
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA?.trim();
    return appData ? path.join(appData, 'WhistleAppData') : path.join(os.homedir(), 'WhistleAppData');
  }
  return path.join(os.homedir(), '.WhistleAppData');
}

export async function discoverWhistleStorage(): Promise<WhistleStorageLocation> {
  const envDir = process.env.WHISTLE_STORAGE_DIR?.trim() || process.env.WHISTLE_APPDATA_DIR?.trim();
  if (envDir) {
    return { path: envDir, source: 'env' };
  }

  const candidates = [
    defaultWhistleStorageDir(),
    path.join(os.homedir(), '.whistle'),
    path.join(os.homedir(), '.config', 'whistle'),
  ];

  for (const p of candidates) {
    if (await dirExists(p)) {
      return { path: p, source: p === candidates[0] ? 'default' : 'candidate' };
    }
  }

  // Fall back to the default even if it doesn't exist yet.
  return { path: candidates[0], source: 'unknown' };
}

export function resolveWhistlePath(storage: WhistleStorageLocation, ...segments: string[]): string {
  return path.join(storage.path, ...segments);
}

export async function readWhistleFile(
  storage: WhistleStorageLocation,
  relativePath: string,
): Promise<string | null> {
  const filePath = resolveWhistlePath(storage, relativePath);
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

export async function writeWhistleFile(
  storage: WhistleStorageLocation,
  relativePath: string,
  contents: string,
): Promise<void> {
  const filePath = resolveWhistlePath(storage, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, contents, 'utf8');
}

export async function existsWhistlePath(
  storage: WhistleStorageLocation,
  relativePath: string,
): Promise<boolean> {
  const filePath = resolveWhistlePath(storage, relativePath);
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function findFirstExistingWhistlePath(
  storage: WhistleStorageLocation,
  relativePaths: string[],
): Promise<string | null> {
  for (const rel of relativePaths) {
    if (await existsWhistlePath(storage, rel)) {
      return resolveWhistlePath(storage, rel);
    }
  }
  return null;
}
