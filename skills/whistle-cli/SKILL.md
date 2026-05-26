---
name: whistle-cli
description: Use when operating Whistle through whistle-cli, including instance checks, rules/values/captures/proxy/certs/plugins workflows, safe preview/apply/verify changes, raw w2 fallback, and diagnostics for agent-driven proxy setup.
---

# whistle-cli

Use this skill to operate the `whistle-cli` command-line tool in a deterministic, agent-friendly way.

## Preconditions

- The environment can run local shell commands.
- Prefer machine-readable output: pass `--format json` unless a streaming command explicitly requires `--format ndjson`.

## Primary Strategy (Resource-First)

1. Use stable resource/shortcut commands first.
   - Example: `whistle-cli --format json instance status`
2. Only use raw passthrough when resource/shortcut commands cannot represent the operation.
   - Example: `whistle-cli raw w2 status`

## Output Contract

- For `--format json`, parse stdout as a single JSON envelope.
- For `--format ndjson`, parse each stdout line as an event envelope.
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

### Runtime Header Injection Workflow

For live request-header changes, prefer runtime commands over direct storage edits:

1. Check Whistle:
   - `whistle-cli --format json instance status`
2. Prepare complete runtime rules in a file.
3. Apply and verify runtime default rules:
   - `whistle-cli --format json rules default apply --file ./rules.txt --apply --verify`
4. Assert live traffic receives the header:
   - `whistle-cli --format json captures assert-header --host app.example.com --header env --equals pre_release --duration 60s`
5. If the assertion reports `OVERRIDDEN`, diagnose matching rules:
   - `whistle-cli --format json rules diagnose-conflicts --header env --url https://app.example.com/api/example`
6. Use continuous monitoring only when a human is actively debugging:
   - `whistle-cli --format ndjson captures watch --host app.example.com --expect-header env=pre_release --watch`

Do not edit Whistle storage files for live rule changes unless the CLI runtime commands are unavailable and the user explicitly accepts that Whistle may need a reload.

### Capture Workflow

For agent-driven packet capture, prefer scoped watch/assert commands over broad keyword searches:

1. Check Whistle and proxy state:
   - `whistle-cli --format json instance status`
   - `whistle-cli --format json proxy status`
2. Convert the user's target into host/path/method filters.
3. Start the listener before asking the user to trigger the UI:
   - `whistle-cli --format json captures assert-request --backend whistle-web --host app.example.com --path /space/api/workspace/chatbot/ --keyword /skills --timeout 60s --poll-interval 2s --fields capture_id,method,status_code,path,x_tt_logid,request_id,env,referer,matched_rules_summary`
4. Tell the user the listener is active and ask for the exact UI action.
5. On match, immediately report `x_tt_logid`, `request_id`, `capture_id`, method, status, path, injected env headers, and matched rule summary.
6. On timeout, report that no matching capture was observed and ask the user to retrigger the exact UI action while the listener is active.

Safety defaults:

- Use `--fields` for capture output unless the user explicitly needs raw packets.
- Do not print cookies, authorization headers, CSRF tokens, session tokens, or full raw headers in user-facing responses.
- Use `--save <file>` for a redacted matched summary when evidence must survive Whistle's short query window.

Intent filters:

- Chatbot skill list:
  - `--host app.example.com`
  - `--path /space/api/workspace/chatbot/`
  - `--keyword /skills`
- Chatbot trigger:
  - `--host app.example.com`
  - `--path /space/api/workspace/chatbot/`
  - `--keyword /trigger`
- Base AI status:
  - `--host app.example.com`
  - `--path /space/api/workspace/base_ai/`

### Raw fallback

- `whistle-cli raw w2 status`
