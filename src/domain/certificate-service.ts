import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';
import { W2Client } from '../backends/raw/w2-client';
import {
  discoverWhistleStorage,
  findFirstExistingWhistlePath,
  type WhistleStorageLocation,
} from '../backends/storage/whistle-storage';
import { CliError } from '../output/errors';
import { loadConfig } from '../shared/config';
import { runSubprocess } from '../backends/raw/process-runner';

export interface CertificateStatus {
  storage: WhistleStorageLocation;
  root_ca_path: string | null;
  downloaded_root_ca_path?: string | null;
  root_ca_url?: string;
  reachable?: boolean;
  installed: boolean;
}

function ensureW2Available(res: { commandNotFound: boolean }) {
  if (!res.commandNotFound) return;
  throw new CliError({
    code: 'UNSUPPORTED_OPERATION',
    message: '`w2` command not found on PATH',
    reason: 'Certificate generation relies on `w2 ca` in v1',
    suggested_fix: 'Install whistle: `npm install -g whistle` (or add it as a devDependency).',
  });
}

const COMMON_CA_RELATIVE_PATHS = [
  // Common Whistle cert locations (best-effort; may vary by version).
  'certs/rootCA.crt',
  'certs/rootCA.pem',
  'certs/rootCA.cer',
  'certs/rootCA.der',
  // Some installs keep a nested dotdir.
  path.join('.whistle', 'certs', 'rootCA.crt'),
  path.join('.whistle', 'certs', 'rootCA.pem'),
];

export class CertificateService {
  private readonly w2: W2Client;

  constructor(w2Client?: W2Client) {
    this.w2 = w2Client ?? new W2Client();
  }

  async status(opts?: { host?: string; port?: number }): Promise<CertificateStatus> {
    const storage = await discoverWhistleStorage();
    const root_ca_path = await findFirstExistingWhistlePath(storage, COMMON_CA_RELATIVE_PATHS);
    const config = loadConfig();
    const downloadedPath = path.join(config.stateDir, 'certs', 'rootCA.crt');
    const downloaded_root_ca_path = await fs
      .stat(downloadedPath)
      .then(() => downloadedPath)
      .catch(() => null);
    const host = opts?.host ?? '127.0.0.1';
    const port = opts?.port ?? 8899;
    const root_ca_url = `http://${host}:${port}/cgi-bin/rootca?enableHttps=1`;
    const reachable = await this.probeRootCaUrl(root_ca_url);
    return {
      storage,
      root_ca_path,
      downloaded_root_ca_path,
      root_ca_url,
      reachable,
      installed: Boolean(root_ca_path) || reachable,
    };
  }

  async install(instanceId?: string, opts?: { host?: string; port?: number }): Promise<{
    w2_stdout: string;
    w2_stderr: string;
    w2_exitCode: number;
    downloaded_root_ca_path?: string;
  }> {
    // Best-effort generation/export; trust still requires user action on most platforms.
    const res = await this.w2.ca({ instanceId, timeoutMs: 10_000 });
    ensureW2Available(res);
    if (res.exitCode !== 0) {
      throw new CliError({
        code: 'UNSUPPORTED_OPERATION',
        message: 'w2 ca failed',
        reason: res.stderr || res.stdout || `exitCode=${res.exitCode}`,
        suggested_fix: 'Try running `whistle-cli raw w2 ca` to see full output and ensure Whistle can initialize its CA.',
      });
    }

    const host = opts?.host ?? '127.0.0.1';
    const port = opts?.port ?? 8899;
    const root_ca_url = `http://${host}:${port}/cgi-bin/rootca?enableHttps=1`;
    const downloaded_root_ca_path = await this.downloadRootCa(root_ca_url).catch(() => undefined);

    return {
      w2_stdout: res.stdout,
      w2_stderr: res.stderr,
      w2_exitCode: res.exitCode,
      downloaded_root_ca_path,
    };
  }

  trustGuide(rootCaPath: string | null): { instruction: string; suggested_fix: string } {
    const p = rootCaPath ?? '<unknown>';
    if (process.platform === 'darwin') {
      return {
        instruction: `在 macOS 上需要把根证书导入并设为信任：${p}`,
        suggested_fix:
          '双击证书导入“钥匙串访问”，或用 `security add-trusted-cert ...`（可能需要管理员权限）。',
      };
    }
    if (process.platform === 'win32') {
      return {
        instruction: `在 Windows 上需要把根证书导入到“受信任的根证书颁发机构”：${p}`,
        suggested_fix: '使用“证书管理”或 `certutil -addstore Root <file>`。',
      };
    }

    // Linux headless
    const caInstallHint =
      rootCaPath && rootCaPath.endsWith('.crt')
        ? `sudo cp "${rootCaPath}" /usr/local/share/ca-certificates/whistle-cli-rootCA.crt && sudo update-ca-certificates`
        : `把根证书复制到系统信任目录并更新信任（例如 Debian/Ubuntu: /usr/local/share/ca-certificates + update-ca-certificates）`;
    return {
      instruction: `在 Linux 上需要把根证书加入系统信任：${p}`,
      suggested_fix: caInstallHint,
    };
  }

  async verifyTrusted(): Promise<{
    trusted: boolean;
    reason?: string;
    suggested_fix?: string;
  }> {
    const { root_ca_path, downloaded_root_ca_path } = await this.status();
    const materialPath = downloaded_root_ca_path ?? root_ca_path;
    if (!materialPath) {
      return {
        trusted: false,
        reason: 'Root CA file not found in Whistle storage',
        suggested_fix: 'Run `whistle-cli certs install` first.',
      };
    }

    // Best-effort automatic trust checks (Linux).
    if (process.platform === 'linux') {
      const caBundleCandidates = ['/etc/ssl/certs/ca-certificates.crt', '/etc/pki/tls/certs/ca-bundle.crt'];
      for (const bundle of caBundleCandidates) {
        const exists = await fs
          .stat(bundle)
          .then(() => true)
          .catch(() => false);
        if (!exists) continue;

        const verify = await runSubprocess('openssl', ['verify', '-CAfile', bundle, materialPath], {
          timeoutMs: 5_000,
        });
        if (verify.exitCode === 0) {
          return { trusted: true };
        }
      }
    }

    // Trust verification is highly platform-specific; v1 treats this as a guided step.
    const guide = this.trustGuide(materialPath);
    return {
      trusted: false,
      reason: 'Cannot verify trust automatically in v1; user action required',
      suggested_fix: guide.suggested_fix,
    };
  }

  private async probeRootCaUrl(url: string): Promise<boolean> {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 1200);
    try {
      const res = await fetch(url, { method: 'GET', signal: ac.signal });
      return res.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  private async downloadRootCa(url: string): Promise<string> {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 3000);
    try {
      const res = await fetch(url, { method: 'GET', signal: ac.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const config = loadConfig();
      const outPath = path.join(config.stateDir, 'certs', 'rootCA.crt');
      await fs.mkdir(path.dirname(outPath), { recursive: true });
      await fs.writeFile(outPath, buf);
      return outPath;
    } finally {
      clearTimeout(timer);
    }
  }
}
