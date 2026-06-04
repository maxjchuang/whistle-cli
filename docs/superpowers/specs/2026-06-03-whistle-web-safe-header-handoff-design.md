# Whistle Web Safe Header Handoff Design

## Context

GitHub issue #12 describes an agent workflow where authenticated request headers are captured from Whistle Web and passed to a follow-up command without exposing sensitive values in stdout or chat logs. The prior Whistle Web capture retrieval work already added `captures get`, `captures export`, and `captures get-header` support for the `whistle-web` backend. This design builds on that work instead of replacing it.

The target workflow is:

1. A user opens or triggers an authenticated web app action.
2. An agent watches Whistle Web captures for a host/path.
3. The CLI captures selected request headers.
4. The CLI writes those values to a local env or JSON file.
5. The agent uses the file for a follow-up command.
6. Sensitive header values are never printed to stdout.

## Goals

- Provide a high-level `captures capture-headers` command for safe agent handoff.
- Keep `captures get-header` useful for exact capture debugging while adding safe save/redaction options.
- Preserve existing `get-header` behavior when no redaction or save option is requested.
- Keep Whistle Web filtering and matching consistent across `find`, `export`, `get`, `get-header`, and the new workflow.
- Improve `NO_CAPTURE_MATCH` and missing-header diagnostics with enough metadata for agents to recover.

## Non-Goals

- Do not add persistent credential caching.
- Do not change `assert-request` redaction behavior.
- Do not make Whistle Web HAR export part of this feature.
- Do not redesign output envelopes or introduce a new backend abstraction.

## Recommended Approach

Use a two-layer design:

1. Add `captures capture-headers` as the recommended safe workflow command.
2. Add minimal safe-output options to `captures get-header`.

This covers the complete agent workflow while preserving lower-level exact capture operations for existing scripts.

Alternatives considered:

- Only enhance `get-header`: lower implementation cost, but agents would still need to chain several commands and could accidentally log sensitive values.
- Only add `capture-headers`: safest primary workflow, but existing `get-header` users would still lack a safe save path.

## Command Design

### `captures capture-headers`

Example:

```bash
whistle-cli --format json captures capture-headers \
  --backend whistle-web \
  --host app.example.com \
  --path /api/user \
  --headers cookie,x-csrftoken,x-signature-key \
  --timeout 120s \
  --save-env .devops-headers.env
```

Behavior:

- Requires at least one save target: `--save-env <file>` or `--save-json <file>`.
- Supports `--backend whistle-web` for the initial implementation; other backends return `UNSUPPORTED_OPERATION`.
- Defaults to matching only captures observed after the command starts.
- Supports `--allow-existing` to explicitly allow using an already visible matching capture.
- Supports `--limit <n>` with the existing Whistle Web dump window rule.
- Supports `--poll-interval <duration>` for agent-friendly waiting.
- Validates that all requested headers are present before writing any output file.
- Prints only safe metadata to stdout.

Recommended options:

- `--headers <names>`: comma-separated header names.
- `--save-env <file>`: write dotenv output.
- `--save-json <file>`: write selected header values as JSON.
- `--env-map <pairs>`: comma-separated mapping such as `cookie=DEVOPS_COOKIE,x-csrftoken=DEVOPS_CSRF`.
- `--allow-existing`: allow reuse of a matching capture from the initial window.
- `--timeout <duration>`: default `60s`.
- `--poll-interval <duration>`: default `1s`.

Safe stdout example:

```json
{
  "capture_id": "new_api",
  "backend": "whistle-web",
  "method": "GET",
  "host": "app.example.com",
  "path": "/api/user",
  "headers": {
    "cookie": { "present": true },
    "x-csrftoken": { "present": true },
    "x-signature-key": { "present": true }
  },
  "saved_to": [".devops-headers.env"]
}
```

Stdout must not include the header values.

### Env Output

Default env key mapping uppercases the header name and replaces non-alphanumeric characters with underscores:

- `cookie` -> `COOKIE`
- `x-csrftoken` -> `X_CSRFTOKEN`
- `x-csrf-token` -> `X_CSRF_TOKEN`
- `x-signature-key` -> `X_SIGNATURE_KEY`

`--env-map` overrides the default on a per-header basis.

Values are written using shell-safe single-quoted dotenv syntax:

```dotenv
COOKIE='...'
X_CSRFTOKEN='...'
X_SIGNATURE_KEY='...'
```

If env and JSON save targets are both provided, both files are written and `saved_to` lists both paths.

### JSON Output

`--save-json` writes only the selected values:

```json
{
  "cookie": "...",
  "x-csrftoken": "...",
  "x-signature-key": "..."
}
```

### `captures get-header` Enhancements

Existing behavior remains unchanged when no save or redaction option is present:

```bash
whistle-cli --format json captures get-header \
  --backend whistle-web \
  --id new_api \
  --header cookie
```

The result may include `value` for backward compatibility.

New safe options:

- `--redact`: do not print the header value.
- `--save-value <file>`: write the raw value to a file.
- `--save-env <file>`: write one dotenv assignment.
- `--env-key <name>`: override the env key for `--save-env`.
- `--save-json <file>`: write `{ "<header>": "<value>" }`.

If any save option is present, stdout defaults to redacted output even without `--redact`.

Safe stdout example:

```json
{
  "capture_id": "new_api",
  "backend": "whistle-web",
  "header": "cookie",
  "present": true,
  "redacted": true,
  "saved_to": [".devops-headers.env"]
}
```

## Service Design

Add a domain method with a narrow workflow boundary:

```ts
captureHeaders(query, options): Promise<CaptureHeadersResult>
```

Responsibilities:

- Use existing `find(query)` behavior to read and filter captures.
- Establish a baseline when `allowExisting` is false.
- Poll until a candidate capture contains all requested headers or timeout expires.
- Perform case-insensitive header lookup.
- Return selected header values to the CLI layer for file writing.
- Return safe metadata for stdout rendering.

The CLI layer remains responsible for:

- Parsing `--headers` and `--env-map`.
- Writing env, JSON, or raw value files.
- Removing values from the envelope before rendering.

This keeps file IO out of the domain service and lets tests verify the sensitive rendering boundary in the CLI resource.

## Matching And Consistency

`capture-headers` should use the same `find(query)` path as Whistle Web `find` and `export`. This avoids a new data path that could disagree with existing filters.

Exact id retrieval for `get` and `get-header` should continue to match Whistle Web records by:

- data map key
- raw `id`
- raw `capture_id`
- raw `reqId`
- raw `sessionId`
- normalized `capture_id`

The implementation should keep the bounded dump rule consistent:

```text
dumpCount = min(max(limit * 5, 100), 1000)
```

## Error Handling

Use stable error codes:

- `NO_CAPTURE_MATCH`: no matching request or capture id was found in the scanned window.
- `CAPTURE_HEADERS_MISSING`: matching requests were observed, but required headers were still missing at timeout.
- `UNSUPPORTED_OPERATION`: unsupported backend, invalid save configuration, malformed header list, or invalid env map.

Diagnostics should contain safe metadata only:

- `backend`
- `filters`
- `limit`
- `dump_count`
- `scanned`
- `matched`
- `missing_headers`
- `capture_id` when available

Suggested fixes should be actionable:

- Retry with `--limit 1000`.
- Re-trigger the browser request and immediately run the command.
- Confirm the command uses `--backend whistle-web` when the id came from Whistle Web.
- Use `--allow-existing` only when reusing a recent request is intended.

File write failures must return an error envelope and must not fall back to printing sensitive values.

## Testing Strategy

Add focused integration tests around the existing fake Whistle Web backend:

1. `capture-headers` ignores baseline captures by default and captures only a new request.
2. `capture-headers --allow-existing` can use a matching baseline capture.
3. Multiple requested headers are written to `.env`, while stdout does not contain the values.
4. `--env-map` overrides default env key generation.
5. Missing requested headers returns `CAPTURE_HEADERS_MISSING` and writes no partial file.
6. `get-header --save-env` and `get-header --redact` do not leak values to stdout.
7. Whistle Web `NO_CAPTURE_MATCH` diagnostics include `limit`, `dump_count`, `scanned`, and retry guidance.
8. Existing `get-header` without save/redaction still returns `value`.
9. Existing Whistle Web `find`, `get`, `export`, and runtime backend tests continue to pass.

## Documentation Updates

Update `README.md` and `skills/whistle-cli/SKILL.md` with the safe workflow:

```text
user opens web page
-> agent runs capture-headers for host/path
-> user triggers target action
-> CLI writes selected headers to env/json
-> agent runs follow-up command using the file
-> sensitive values never appear in stdout
```

Also document:

- `get-header` compatibility behavior.
- Save/redaction options.
- The Whistle Web data window and `--limit 1000` retry guidance.
- The default env key mapping and `--env-map` override.

## Acceptance Criteria

- `capture-headers` can safely capture `cookie`, `x-csrftoken` or `x-csrf-token`, `x-signature-key`, and `user-agent` from a newly observed Whistle Web request.
- Header values are written to requested files and never printed by `capture-headers`.
- `get-header` can save or redact a single header value without breaking the existing value-returning path.
- Error envelopes give agents enough safe metadata to retry or re-trigger the request.
- Integration tests prove no sensitive value appears in stdout for safe workflows.
