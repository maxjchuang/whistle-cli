#!/usr/bin/env bash
set -euo pipefail

log() {
  echo "[$(date +%H:%M:%S)] $*" >&2
}

die() {
  local code="${1:-1}"
  shift || true
  echo "ERROR: $*" >&2
  exit "$code"
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die 20 "Missing required command: $1"
}

repo_root() {
  git rev-parse --show-toplevel 2>/dev/null || pwd
}

read_pkg_field() {
  local field="$1"
  node -p "require('./package.json')[${field@Q}]" 2>/dev/null || true
}

semver_major() {
  local v="$1"
  v="${v#v}"
  if [[ ! "$v" =~ ^[0-9]+\.[0-9]+\.[0-9]+ ]]; then
    return 1
  fi
  echo "${v%%.*}"
}

