# whistle-cli

AI-friendly CLI facade over [Whistle](https://github.com/avwo/whistle).

## Prerequisites

- Node.js >= 20
- `whistle` installed (`npm install -g whistle`)

## Install

```bash
# Global
npm install -g whistle-cli

# Or local
npm install whistle-cli
export PATH="./node_modules/.bin:$PATH"
```

## Quick Start

```bash
# Check Whistle availability
whistle-cli raw w2 status

# Start a Whistle instance (via raw escape hatch)
whistle-cli raw w2 start

# Structured JSON output (default)
whistle-cli --format json raw w2 status

# Human-readable output
whistle-cli --format pretty raw w2 status
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
- `rules` — list / get / patch / apply / verify / enable / disable / import / export
- `mocks` — list / create / update / enable / disable / delete
- `captures` — find / get / tail / diff / export
- `certs` — status / install / verify / guide
- `proxy` — status / set / off / verify
- `plugins` — list / install / uninstall / enable / disable / inspect
- `doctor` — instance-status / proxy-routing / https-capture
- `raw` — w2 passthrough

### Global Flags

| Flag | Description |
|------|-------------|
| `--format <json\|pretty\|table\|ndjson>` | Output format, default `json` |
| `--instance <id>` | Target instance, defaults to current |
| `--non-interactive` | Fail instead of waiting for user action |
| `--preview` | Show planned mutation without applying |
| `--apply` | Apply a mutation |
| `--verify` | Verify effective runtime behavior after apply |

## Output Envelope

All output is a structured JSON envelope designed for machine parsing:

```json
{
  "status": "ok | warning | error | blocked",
  "resource": "raw | instance | rules | mocks | captures | certs | proxy | plugins | doctor",
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
   whistle-cli raw w2 status

2. Start instance
   whistle-cli instance start

3. Safe mutation (preview -> apply -> verify)
   whistle-cli rules patch --preview
   whistle-cli rules patch --apply
   whistle-cli rules patch --verify

4. Diagnose issues
   whistle-cli captures find --host api.example.com
   whistle-cli doctor https-capture

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

# Test
npm run test

# Lint
npm run lint
```

## Implementation Status

| Command | Status |
|---------|--------|
| `raw w2 [args]` | Available |
| `instance/*` | Planned |
| `rules/*` | Planned |
| `mocks/*` | Planned |
| `captures/*` | Planned |
| `certs/*` | Planned |
| `proxy/*` | Planned |
| `plugins/*` | Planned |
| `doctor/*` | Planned |
| `shortcuts/*` | Planned |

## License

MIT
