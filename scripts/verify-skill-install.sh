#!/usr/bin/env bash
set -euo pipefail

DEST_ROOT="${SKILLS_DIR:-$HOME/.agents/skills}"
DEST="$DEST_ROOT/whistle-cli"

[[ -d "$DEST" ]] || { echo "Missing skill dir: $DEST" >&2; exit 10; }
[[ -f "$DEST/SKILL.md" ]] || { echo "Missing SKILL.md: $DEST/SKILL.md" >&2; exit 11; }
[[ -f "$DEST/README.md" ]] || { echo "Missing README.md: $DEST/README.md" >&2; exit 12; }

echo "skill install ok: $DEST" >&2

