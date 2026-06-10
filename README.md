# whistle-cli

AI-friendly CLI facade over [Whistle](https://github.com/avwo/whistle).

## Prerequisites

- Node.js >= 20
- `whistle` installed (`npm install -g whistle`) so `w2` is available on PATH

## Install

```bash
# Install from npm (global)
npm i -g whistle-cli --registry=https://registry.npmjs.org/

# Upgrade
npm i -g whistle-cli@latest --registry=https://registry.npmjs.org/

# This repository (dev mode)
npm install
npm run dev -- --help
```

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

## Skill (for AI agents)

Install from the public GitHub repository with a compatible skills installer:

```bash
skills add https://github.com/maxjchuang/whistle-cli --skill whistle-cli
```

Install the repository-distributed skill into the default skills directory:

```bash
./scripts/install-skill.sh
```

## Command Structure

whistle-cli provides three layers of commands:

| Layer        | Purpose                                          | Example                                   |
| ------------ | ------------------------------------------------ | ----------------------------------------- |
| **raw**      | Escape hatch, passthrough to `w2`                | `whistle-cli raw w2 status`               |
| **resource** | Stable resource operations, preferred for agents | `whistle-cli rules patch --preview`       |
| **shortcut** | High-frequency intent-driven commands            | `whistle-cli rule set-header --match ...` |

### Resource Commands (v1 target)

- `instance` — start / stop / restart / status / list / select
- `rules` — rollback / patch / import / export / apply / verify / list / get / enable / disable
- `values` — rollback / list / get / set / remove / import / export
- `captures` — find / get / tail / diff / export
- `composer` — replay / compose
- `frames` — list / send
- `runtime` — serve the optional `__whistle_cli__` backend API
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

| Flag                                     | Description                             |
| ---------------------------------------- | --------------------------------------- |
| `--format <json\|pretty\|table\|ndjson>` | Output format, default `json`           |
| `--instance <id>`                        | Target instance, defaults to current    |
| `--non-interactive`                      | Fail instead of waiting for user action |

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
  "resource": "raw | instance | rules | values | captures | composer | frames | runtime | certs | proxy | plugins | doctor",
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

| Code                            | Meaning                               |
| ------------------------------- | ------------------------------------- |
| `INSTANCE_NOT_RUNNING`          | Whistle instance is not running       |
| `INSTANCE_PORT_CONFLICT`        | Port already in use                   |
| `CERT_NOT_INSTALLED`            | CA certificate not installed          |
| `CERT_NOT_TRUSTED`              | CA certificate not trusted by system  |
| `PROXY_NOT_ACTIVE`              | System proxy not pointing to Whistle  |
| `RULE_CONFLICT`                 | Conflicting rules detected            |
| `RULE_VERIFY_FAILED`            | Rule verification failed              |
| `NO_CAPTURE_MATCH`              | No captured traffic matched the query |
| `CAPTURE_BACKEND_UNAVAILABLE`   | Capture backend not accessible        |
| `PLUGIN_NOT_INSTALLED`          | Plugin not installed                  |
| `PLUGIN_CAPABILITY_UNAVAILABLE` | Plugin capability not available       |
| `PERMISSION_REQUIRED`           | Insufficient permissions              |
| `USER_ACTION_REQUIRED`          | Manual user action needed             |
| `UNSUPPORTED_OPERATION`         | Operation not supported               |

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

### Runtime Backend

`whistle-cli` includes an optional local runtime backend that serves the `__whistle_cli__` API consumed by `--backend runtime` commands.

```bash
# Start a backend in front of a running Whistle Web API
whistle-cli --format json runtime serve \
  --target-url http://127.0.0.1:8899 \
  --host 127.0.0.1 \
  --port 8898

# In another shell, route RuntimeClient calls to it
export WHISTLE_CLI_RUNTIME_URL=http://127.0.0.1:8898

whistle-cli --format json captures find --backend runtime --host example.com
whistle-cli --format ndjson captures tail --backend runtime --host example.com --limit 5
whistle-cli --format json composer compose --method GET --url https://example.com --apply
```

The runtime backend currently adapts capture data from Whistle's Web API and executes compose/replay with local HTTP requests. Frame routes return `UNSUPPORTED_OPERATION` until frame-level backend support is implemented.

### Whistle Web Capture Retrieval

For browser-driven automation, prefer Whistle Web capture retrieval when the capture was detected with `--backend whistle-web`:

```bash
# Wait for a newly triggered request and keep only a redacted summary in the result
whistle-cli --format json captures assert-request \
  --backend whistle-web \
  --host app.example.com \
  --path /api/ \
  --timeout 90s \
  --poll-interval 2s \
  --fields capture_id,method,status_code,path,referer
```

#### Safe Header Handoff

When an agent needs authenticated request headers for a follow-up command, prefer `capture-headers` so values are written to local files and not printed to stdout:

```bash
whistle-cli --format json captures capture-headers \
  --backend whistle-web \
  --host app.example.com \
  --path /api/session \
  --headers cookie,x-csrftoken,x-signature-key \
  --timeout 120s \
  --save-env .devops-headers.env
```

By default, the command ignores captures that were already present when it started. Use `--allow-existing` only when reusing a recent matching request is intended. Use `--env-map cookie=DEVOPS_COOKIE` to override generated env keys such as `COOKIE` or `X_SIGNATURE_KEY`.

The command fails unless `--save-env` or `--save-json` is provided. Its JSON output reports capture metadata and header presence only; it does not include header values.

```bash
# Retrieve the exact capture while it is still in the Whistle Web data window
whistle-cli --format json captures get \
  --backend whistle-web \
  --id <capture_id>

# Extract one request header from the exact capture
whistle-cli --format json captures get-header \
  --backend whistle-web \
  --id <capture_id> \
  --header cookie

# Export filtered Whistle Web captures as JSON
whistle-cli --format json captures export \
  --backend whistle-web \
  --host app.example.com \
  --path /api/ \
  --export-format json
```

`assert-request` remains redacted by default for safe agent-facing reporting. Explicit retrieval commands such as `get`, `export`, and `get-header` return captured request header values requested by the user, so avoid logging their output when headers contain credentials.

For continuous human-facing monitoring, use `captures watch --watch` with NDJSON output:

```bash
whistle-cli --format ndjson captures watch \
  --backend whistle-web \
  --host app.example.com \
  --path /api/ \
  --fields capture_id,method,status_code,path,x_tt_logid,request_id,referer \
  --watch
```

`--watch` keeps the process running until Ctrl-C or SIGTERM. It performs process-local in-memory de-duplication from the startup baseline and does not persist history across restarts. It still reads Whistle Web's recent capture window, so high-volume traffic can rotate old records out before they are observed.

For a single exact header, `get-header` remains available. Add `--redact`, `--save-env`, `--save-json`, or `--save-value` when the value should not appear in stdout.

If direct Whistle Web API fallback is unavoidable, use `dumpCount` to widen the returned session window, for example: `/cgi-bin/get-data?startTime=0&dumpCount=1000`.

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

| Command         | Status    |
| --------------- | --------- |
| `raw w2 [args]` | Available |
| `instance/*`    | Available |
| `rules/*`       | Available |
| `values/*`      | Available |
| `captures/*`    | Available |
| `composer/*`    | Available |
| `frames/*`      | Available |
| `runtime serve` | Available |
| `certs/*`       | Available |
| `proxy/*`       | Available |
| `plugins/*`     | Available |
| `doctor/*`      | Available |
| `shortcuts/*`   | Available |

## Current Limitations (v1)

- `captures diff` exists in command surface but currently returns `UNSUPPORTED_OPERATION`.
- `captures tail` requires `--format ndjson`.
- Runtime backend frame routes return `UNSUPPORTED_OPERATION`; capture and composer runtime routes are implemented.
- Certificate trust and some proxy setup steps may return `blocked` or `USER_ACTION_REQUIRED` and require manual OS actions.

## License

MIT
