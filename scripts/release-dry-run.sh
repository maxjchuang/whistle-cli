#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "[dry-run] running verification" >&2
npm run release:verify

echo "[dry-run] npm publish --dry-run" >&2
npm publish --dry-run --access public --registry=https://registry.npmjs.org/
