---
name: whistle-cli
description: Use when operating Whistle through whistle-cli, including instance checks, rules/values/captures/proxy/certs/plugins workflows, safe preview/apply/verify changes, raw w2 fallback, and diagnostics for agent-driven proxy setup.
---

# whistle-cli

Use this skill to operate the `whistle-cli` command-line tool in a deterministic, agent-friendly way.

## Preconditions

- The environment can run local shell commands.
- Prefer machine-readable output: always pass `--format json`.

## Primary Strategy (Resource-First)

1. Use stable resource/shortcut commands first.
   - Example: `whistle-cli --format json instance status`
2. Only use raw passthrough when resource/shortcut commands cannot represent the operation.
   - Example: `whistle-cli raw w2 status`

## Output Contract

- Always parse stdout as a single JSON envelope.
- Use these fields for control flow:
  - `status`: `ok | warning | error | blocked`
  - `error.code`: stable machine-readable reason
  - `error.suggested_fix` and `next_actions`: what to do next

## Error Handling Rules

- If exit code != 0, capture stderr and stdout; attempt JSON parse of the emitted envelope.
- If `status == blocked`, stop and present `next_actions` to the user.
- If `status == error`, follow `error.suggested_fix` (do not guess).

## Examples

### Health check

- `whistle-cli --format json instance status`

### Safe mutation pattern (preview -> apply -> verify)

- `whistle-cli --format json rules patch --id <id> --file <path> --preview`
- `whistle-cli --format json rules apply --id <id> --file <path> --apply --verify`

### Raw fallback

- `whistle-cli raw w2 status`
