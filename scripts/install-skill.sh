#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/skills/whistle-cli"

MODE="copy"
if [[ "${1:-}" == "--link" ]]; then
  MODE="link"
  shift
fi
if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  cat >&2 <<'EOF'
Usage: ./scripts/install-skill.sh [--link]

Environment:
  SKILLS_DIR  Default: ~/.agents/skills
EOF
  exit 0
fi

DEST_ROOT="${SKILLS_DIR:-$HOME/.agents/skills}"
DEST="$DEST_ROOT/whistle-cli"

[[ -f "$SRC/SKILL.md" ]] || { echo "Missing $SRC/SKILL.md" >&2; exit 2; }

# Enforce major-version compatibility early.
if bash "$ROOT/scripts/check-compatibility.sh"; then
  :
else
  status=$?
  exit "$status"
fi

mkdir -p "$DEST_ROOT"

rm -rf "$DEST"
if [[ "$MODE" == "link" ]]; then
  ln -s "$SRC" "$DEST"
else
  cp -R "$SRC" "$DEST"
fi

echo "Installed skill to: $DEST" >&2
