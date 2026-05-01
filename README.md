# whistle-cli

AI-friendly CLI facade over [Whistle](https://github.com/avwo/whistle).

## Prerequisites

- Node.js >= 20
- `whistle` installed (`npm install -g whistle`) so `w2` is available on PATH

## Install

```bash
# This repository (dev mode)
npm install
npm run dev -- --help
```

> Note: this repo is currently configured as `"private": true` in `package.json`.
> Publish/install from npm is not enabled by default.

## Quick Start

```bash
# Check command surface in dev mode
npm run dev -- --help

# Check Whistle availability
npm run dev -- raw w2 status

# Structured JSON output (default)
npm run dev -- --format json instance status

# Human-readable output
npm run dev -- --format pretty instance status
```

## Command Structure

whistle-cli provides three layers of commands:

| Layer | Purpose | Example |
|-------|---------|---------|
| **raw** | Escape hatch, passthrough to `w2` | `whistle-cli raw w2 status` |
| **resource** | Stable resource operations, preferred for agents | `whistle-cli rules patch --preview` |
| **shortcut** | High-frequency intent-driven commands | `whistle-cli rule set-header --match ...` |

### Resource Commands (v1 target)

- `instance` — start / stop / restart / status / list / select
- `rules` — rollback / patch / import / export / apply / verify / list / get / enable / disable
- `values` — rollback / list / get / set / remove / import / export
- `captures` — find / get / tail / diff / export
- `composer` — replay / compose
- `frames` — list / send
- `certs` — status / install / verify / guide
- `proxy` — status / set / off / verify
- `plugins` — list / install / uninstall / enable / disable / inspect
- `doctor` — instance-status / proxy-routing / https-capture
- `raw` — w2 passthrough

### Shortcut Commands

- `bootstrap` — `start` / `prepare`
- `rule` — `set-header` / `map-local`
- `capture` — `find` / `find-error`
- `plugin` — `install` / `remove` / `inspect` / `invoke` (`invoke` is out of scope in v1)

### Global Flags

| Flag | Description |
|------|-------------|
| `--format <json\|pretty\|table\|ndjson>` | Output format, default `json` |
| `--instance <id>` | Target instance, defaults to current |
| `--non-interactive` | Fail instead of waiting for user action |

`--preview`, `--apply`, `--verify`, and `--rollback` are **command-level flags** on mutating resource commands (not global flags).

Common rollback forms:

- `rules rollback --action-id <id>`
- `values rollback --action-id <id>`
- `proxy set --rollback <id>`
- `plugins install --rollback <id>`

## Output Envelope

All output is a structured JSON envelope designed for machine parsing:

```json
{
  "status": "ok | warning | error | blocked",
  "resource": "raw | instance | rules | values | captures | composer | frames | certs | proxy | plugins | doctor",
  "action": "w2 status",
  "data": {},
  "error": {
    "code": "INSTANCE_NOT_RUNNING",
    "message": "...",
    "reason": "...",
    "suggested_fix": "..."
  },
  "next_actions": [{ "action": "...", "reason": "..." }],
  "effective": true
}
```

### Reading the Envelope

- `status` — success / failure decision
- `error.code` — stable machine-readable error classification
- `next_actions` — suggested next steps (agent doesn't need to guess)
- `effective` — whether a mutation is actually live at runtime

### Error Codes

| Code | Meaning |
|------|---------|
| `INSTANCE_NOT_RUNNING` | Whistle instance is not running |
| `INSTANCE_PORT_CONFLICT` | Port already in use |
| `CERT_NOT_INSTALLED` | CA certificate not installed |
| `CERT_NOT_TRUSTED` | CA certificate not trusted by system |
| `PROXY_NOT_ACTIVE` | System proxy not pointing to Whistle |
| `RULE_CONFLICT` | Conflicting rules detected |
| `RULE_VERIFY_FAILED` | Rule verification failed |
| `NO_CAPTURE_MATCH` | No captured traffic matched the query |
| `CAPTURE_BACKEND_UNAVAILABLE` | Capture backend not accessible |
| `PLUGIN_NOT_INSTALLED` | Plugin not installed |
| `PLUGIN_CAPABILITY_UNAVAILABLE` | Plugin capability not available |
| `PERMISSION_REQUIRED` | Insufficient permissions |
| `USER_ACTION_REQUIRED` | Manual user action needed |
| `UNSUPPORTED_OPERATION` | Operation not supported |

## Agent Integration

### Typical Workflow

```
1. Environment check
   whistle-cli --format json instance status

2. Start instance
   whistle-cli --format json instance start

3. Safe mutation (preview -> apply -> verify)
   whistle-cli rules patch --id main --file ./patch.txt --format json
   whistle-cli rules apply --id main --file ./patch.txt --apply --verify --format json

4. Diagnose issues
   whistle-cli --format json captures find --host api.example.com
   whistle-cli --format json doctor https-capture

5. Handle blocked/error states
   -> Read error.suggested_fix and inform user
   -> Read next_actions for next step
```

### Error Handling Pattern

```python
result = run("whistle-cli rules patch --apply")

if result.status == "error":
    match result.error.code:
        case "INSTANCE_NOT_RUNNING":
            run("whistle-cli instance start")
            # retry
        case "CERT_NOT_TRUSTED":
            tell_user(result.error.suggested_fix)
        case "PROXY_NOT_ACTIVE":
            run("whistle-cli proxy set")
        case _:
            tell_user(result.error.message)

elif result.status == "blocked":
    tell_user(result.next_actions)

elif result.status == "warning":
    log(result.warnings)
```

## Development

```bash
# Build
npm run build

# Dev mode (tsx)
npm run dev -- raw w2 status

# Built binary
node dist/cli/index.js --help

# Test
npm run test

# Lint
npm run lint
```

## Implementation Status

| Command | Status |
|---------|--------|
| `raw w2 [args]` | Available |
| `instance/*` | Available |
| `rules/*` | Available |
| `values/*` | Available |
| `captures/*` | Available |
| `composer/*` | Available |
| `frames/*` | Available |
| `certs/*` | Available |
| `proxy/*` | Available |
| `plugins/*` | Available |
| `doctor/*` | Available |
| `shortcuts/*` | Available |

## Current Limitations (v1)

- `captures diff` exists in command surface but currently returns `UNSUPPORTED_OPERATION`.
- `captures tail` requires `--format ndjson`.
- Certificate trust and some proxy setup steps may return `blocked` or `USER_ACTION_REQUIRED` and require manual OS actions.

## License

MIT
