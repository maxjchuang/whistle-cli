import path from 'node:path';
import fs from 'node:fs/promises';

import { makeTempDir } from './us1-bootstrap.fixtures';

export interface FakeW2PluginsEnv {
  env: Record<string, string | undefined>;
  paths: {
    stateDir: string;
    appDataDir: string;
    binDir: string;
    pluginsStateFile: string;
    proxyStateFile: string;
  };
}

export async function setupFakeW2PluginsEnv(): Promise<FakeW2PluginsEnv> {
  const stateDir = await makeTempDir('whistle-cli-us4-state-');
  const appDataDir = await makeTempDir('whistle-cli-us4-whistledata-');
  const binDir = await makeTempDir('whistle-cli-us4-bin-');

  const pluginsStateFile = path.join(binDir, 'w2-plugins-state.txt');
  await fs.writeFile(pluginsStateFile, '', 'utf8');

  const proxyStateFile = path.join(binDir, 'w2-proxy-state.txt');
  await fs.writeFile(proxyStateFile, '0', 'utf8');

  const w2Path = path.join(binDir, 'w2');
  await fs.writeFile(
    w2Path,
    `#!/usr/bin/env bash
set -euo pipefail

baseDir=""
if [[ $# -ge 2 && "$1" == "-D" ]]; then
  baseDir="$2"
  shift 2
fi

cmd=""
if [[ $# -ge 1 ]]; then
  cmd="$1"
  shift
fi

sub=""
if [[ $# -ge 1 ]]; then
  sub="$1"
  shift
fi

stateFile="$W2_PLUGINS_STATE_FILE"
proxyFile="$W2_PROXY_STATE_FILE"

ensure_line_absent() {
  local name="$1"
  if [[ ! -f "$stateFile" ]]; then
    return 0
  fi
  # Keep all lines that do not start with name|
  awk -F'|' -v n="$name" 'BEGIN{OFS=FS} $1!=n {print $0}' "$stateFile" > "$stateFile.tmp" || true
  mv "$stateFile.tmp" "$stateFile"
}

write_line() {
  local name="$1"
  local ver="$2"
  local enabled="$3"
  ensure_line_absent "$name"
  printf "%s|%s|%s\n" "$name" "$ver" "$enabled" >> "$stateFile"
}

read_line() {
  local name="$1"
  if [[ ! -f "$stateFile" ]]; then
    return 1
  fi
  awk -F'|' -v n="$name" '$1==n {print $0}' "$stateFile" | tail -n 1
}

parse_spec() {
  local spec="$1"
  local name="$spec"
  local ver="latest"
  # Handle non-scoped: whistle.x@1.2.3
  if [[ "$spec" != @* && "$spec" == *"@"* ]]; then
    name="$(printf "%s" "$spec" | sed 's/@[^@]*$//')"
    ver="$(printf "%s" "$spec" | awk -F'@' '{print $NF}')"
  fi
  # Handle scoped-with-version: @scope/whistle.x@1.2.3 (two @)
  if [[ "$spec" == @* ]]; then
    at_count=$(printf "%s" "$spec" | awk -F'@' '{print NF-1}')
    if [[ "$at_count" -ge 2 ]]; then
      name="$(printf "%s" "$spec" | sed 's/@[^@]*$//')"
      ver="$(printf "%s" "$spec" | awk -F'@' '{print $NF}')"
    else
      name="$spec"
      ver="latest"
    fi
  fi
  echo "$name|$ver"
}

case "$cmd" in
  plugin|plugins)
    case "$sub" in
      list)
        if [[ -f "$stateFile" ]]; then
          # Output: <name>@<version> <enabled|disabled>
          while IFS='|' read -r n v e; do
            if [[ -z "$n" ]]; then
              continue
            fi
            if [[ "$e" == "1" ]]; then
              echo "$n@$v enabled"
            else
              echo "$n@$v disabled"
            fi
          done < "$stateFile"
        fi
        exit 0
        ;;
      install)
        spec="$1"
        if [[ -z "$spec" ]]; then
          echo "missing plugin spec" >&2
          exit 2
        fi
        parsed=$(parse_spec "$spec")
        name="$(printf "%s" "$parsed" | cut -d'|' -f1)"
        ver="$(printf "%s" "$parsed" | cut -d'|' -f2)"
        write_line "$name" "$ver" "1"
        if [[ -n "$baseDir" ]]; then
          pkgDir="$baseDir/.whistle/node_modules/$name"
          mkdir -p "$pkgDir"
          cat > "$pkgDir/package.json" <<EOF
{"name":"$name","version":"$ver","description":"fake plugin $name","homepage":"https://example.invalid/$name"}
EOF
        fi
        echo "OK"
        exit 0
        ;;
      uninstall)
        name="$1"
        if [[ -z "$name" ]]; then
          echo "missing plugin name" >&2
          exit 2
        fi
        ensure_line_absent "$name"
        if [[ -n "$baseDir" ]]; then
          rm -rf "$baseDir/.whistle/node_modules/$name" || true
        fi
        echo "OK"
        exit 0
        ;;
      enable)
        name="$1"
        line=$(read_line "$name" || true)
        if [[ -z "$line" ]]; then
          echo "not installed" >&2
          exit 3
        fi
        IFS='|' read -r n v e <<< "$line"
        write_line "$n" "$v" "1"
        echo "OK"
        exit 0
        ;;
      disable)
        name="$1"
        line=$(read_line "$name" || true)
        if [[ -z "$line" ]]; then
          echo "not installed" >&2
          exit 3
        fi
        IFS='|' read -r n v e <<< "$line"
        write_line "$n" "$v" "0"
        echo "OK"
        exit 0
        ;;
      *)
        echo "unknown plugin subcommand: $sub" >&2
        exit 1
        ;;
    esac
    ;;
  status)
    echo "running on port 8899"
    exit 0
    ;;
  proxy)
    if [[ $# -eq 0 ]]; then
      port="$(cat "$proxyFile" 2>/dev/null || echo 0)"
      if [[ "$port" == "0" ]]; then
        echo "Proxy: off"
      else
        echo "Proxy: 127.0.0.1:$port"
      fi
      exit 0
    fi
    port="$1"
    echo "$port" > "$proxyFile"
    echo "OK"
    exit 0
    ;;
  *)
    echo "unknown command: $cmd" >&2
    exit 1
    ;;
esac
`,
    { mode: 0o755 },
  );

  const env: Record<string, string | undefined> = {
    WHISTLE_CLI_STATE_DIR: stateDir,
    WHISTLE_APPDATA_DIR: appDataDir,
    W2_PLUGINS_STATE_FILE: pluginsStateFile,
    W2_PROXY_STATE_FILE: proxyStateFile,
    PATH: `${binDir}:${process.env.PATH ?? ''}`,
  };

  return {
    env,
    paths: {
      stateDir,
      appDataDir,
      binDir,
      pluginsStateFile,
      proxyStateFile,
    },
  };
}
