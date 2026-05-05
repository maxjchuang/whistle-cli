#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

source "./scripts/release-lib.sh"

assert_json() {
  local label="$1"
  local payload="$2"
  if ! node -e "let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>{JSON.parse(s);});" <<<"$payload" >/dev/null 2>&1; then
    echo "$payload" >&2
    die 30 "Expected JSON output for $label"
  fi
}

pack_and_install_smoke() {
  local tgz_path="$1"
  local expected_version="$2"

  local tmp
  tmp="$(mktemp -d)"
  local ok=0

  log "[pack] temp=$tmp"
  pushd "$tmp" >/dev/null
  {
    npm init -y >/dev/null
    npm install --silent "$tgz_path" >/dev/null

    local bin="./node_modules/.bin/whistle-cli"
    [[ -x "$bin" ]] || die 31 "Expected installed binary at $bin"

    local actual_version
    actual_version="$($bin --version | head -n 1 | tr -d '\r' | awk '{print $1}')"
    if [[ "$actual_version" != "$expected_version" ]]; then
      die 33 "Packed artifact version mismatch: expected=$expected_version got=$actual_version"
    fi

    "$bin" --help >/dev/null

    local out
    out="$($bin --format json instance status 2>&1 || true)"
    assert_json "instance status" "$out"
    ok=1
  }
  popd >/dev/null

  if [[ "$ok" != "1" ]]; then
    rm -rf "$tmp"
    return 1
  fi
  rm -rf "$tmp"
}

upgrade_smoke() {
  local from_version="$1"
  local tgz_path="$2"

  local pkg_name
  pkg_name="$(read_pkg_field name)"
  [[ -n "$pkg_name" ]] || die 2 "Unable to read package.json name"

  local tmp
  tmp="$(mktemp -d)"
  local ok=0

  pushd "$tmp" >/dev/null
  {
    npm init -y >/dev/null

    if ! npm install --silent "${pkg_name}@${from_version}" >/dev/null 2>&1; then
      die 10 "Cannot install previous version: ${pkg_name}@${from_version}"
    fi

    local bin="./node_modules/.bin/whistle-cli"
    "$bin" --help >/dev/null || die 11 "Smoke failed before upgrade"
    local before
    before="$($bin --format json instance status 2>&1 || true)"
    assert_json "instance status (before upgrade)" "$before" || die 11 "Smoke failed before upgrade"

    if ! npm install --silent "$tgz_path" >/dev/null 2>&1; then
      die 12 "Cannot install current packed artifact"
    fi

    "$bin" --help >/dev/null || die 13 "Smoke failed after upgrade"
    local after
    after="$($bin --format json instance status 2>&1 || true)"
    assert_json "instance status (after upgrade)" "$after" || die 13 "Smoke failed after upgrade"
    ok=1
  }
  popd >/dev/null

  if [[ "$ok" != "1" ]]; then
    rm -rf "$tmp"
    return 1
  fi
  rm -rf "$tmp"
}

log "verify: build"
npm run build

log "verify: test"
npm run test

log "verify: pack"
tgz_file="$(npm pack --silent)"
tgz_path="$ROOT/$tgz_file"
[[ -f "$tgz_path" ]] || die 32 "Expected packed artifact at $tgz_path"

log "verify: install smoke"
repo_version="$(read_pkg_field version)"
[[ -n "$repo_version" ]] || die 2 "Unable to read package.json version"
pack_and_install_smoke "$tgz_path" "$repo_version"

if [[ "${RELEASE_VERIFY_UPGRADE:-}" == "1" ]]; then
  from="${RELEASE_VERIFY_FROM_VERSION:-}"
  [[ -n "$from" ]] || die 2 "RELEASE_VERIFY_FROM_VERSION is required when RELEASE_VERIFY_UPGRADE=1"
  log "verify: upgrade smoke (from=$from)"
  upgrade_smoke "$from" "$tgz_path"
fi

log "verify: ok"
