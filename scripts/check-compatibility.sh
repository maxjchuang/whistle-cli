#!/usr/bin/env bash
set -euo pipefail

# Compatibility policy: skill major == CLI major
#
# This script compares:
# - repo version: package.json version (represents skill version for this checkout)
# - installed CLI version: `whistle-cli --version`

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

source "./scripts/release-lib.sh"

usage() {
  cat >&2 <<'EOF'
Usage: ./scripts/check-compatibility.sh

Environment overrides:
  WHISTLE_CLI_INSTALLED_VERSION=<semver>  # skip calling `whistle-cli --version`
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

repo_version="$(read_pkg_field version)"
[[ -n "$repo_version" ]] || die 2 "Unable to read package.json version"

installed_version="${WHISTLE_CLI_INSTALLED_VERSION:-}"
if [[ -z "$installed_version" ]]; then
  if ! command -v whistle-cli >/dev/null 2>&1; then
    die 10 "whistle-cli not found on PATH. Install it first (e.g. npm i -g whistle-cli@${repo_version})."
  fi
  installed_version="$(whistle-cli --version | head -n 1 | tr -d '\r' | awk '{print $1}')"
fi

repo_major="$(semver_major "$repo_version" || true)"
installed_major="$(semver_major "$installed_version" || true)"

[[ -n "$repo_major" && -n "$installed_major" ]] || die 11 "Invalid semver: repo=$repo_version installed=$installed_version"

if [[ "$repo_major" != "$installed_major" ]]; then
  cat >&2 <<EOF
Incompatible major versions:
- skill(repo) version: $repo_version
- installed CLI version: $installed_version

Fix: install a CLI version with major $repo_major (or use the matching skill checkout).
EOF
  exit 12
fi

log "compatibility ok (repo=$repo_version installed=$installed_version)"

