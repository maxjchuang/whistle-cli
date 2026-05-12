# Whistle CLI Runtime Verification Design

## Context

During a real header-injection workflow, `whistle-cli` and its skill exposed three reliability gaps:

- Rules written directly to Whistle storage did not immediately affect the running Whistle instance.
- Capture commands depended on the optional `__whistle_cli__` runtime API and failed with 404 in a normal Whistle environment.
- Header verification needed to distinguish successful injection from old-rule overrides, not just whether a related rule existed.

The solution is to make the running Whistle instance the default source of truth for online operations, while keeping storage access for offline preview and compatibility.

## Goals

- Provide a reliable CLI workflow for setting request headers and verifying that live traffic receives them.
- Use Whistle's built-in Web UI API as the default online backend.
- Keep the `__whistle_cli__` runtime API as an optional enhanced backend, not the default dependency.
- Give agents structured results for rule application, header assertions, and conflict diagnosis.
- Update the skill so agents use CLI commands first and avoid direct Whistle storage edits for live changes.

## Non-Goals

- Fully reimplement Whistle's rule engine.
- Require users to install a Whistle plugin for baseline capture and rule operations.
- Remove existing storage-based rule patch commands.
- Build a GUI or browser-based monitoring interface.

## Command Surface

### Runtime Default Rules

```bash
whistle-cli rules default get --format json
whistle-cli rules default apply --file rules.txt --apply --verify --format json
```

These commands read and write the running Whistle instance through its Web UI API. Existing `rules patch/apply` commands remain available for storage-backed rule sets.

### Header Assertion And Monitoring

```bash
whistle-cli captures assert-header \
  --host app.example.com \
  --header env \
  --equals pre_release \
  --duration 60s \
  --format json

whistle-cli captures watch \
  --host staging.example.com \
  --expect-header x-env=staging_feature \
  --duration 60s \
  --format ndjson
```

`assert-header` performs a finite observation window by default. `watch` supports the same finite default and adds continuous streaming when `--watch` is passed.

### Rule Conflict Diagnosis

```bash
whistle-cli rules diagnose-conflicts \
  --header x-env \
  --url https://staging.example.com/api/widgets/123/trigger \
  --format json
```

The first version performs best-effort diagnosis for common `reqHeaders://k=v` rules.

### High-Frequency Shortcut

```bash
whistle-cli rule set-header \
  --match '/^https:\/\/app\.example\.com\//' \
  --header env=pre_release \
  --apply \
  --runtime-default \
  --verify-live \
  --duration 60s \
  --format json
```

The shortcut builds the `reqHeaders` rule, applies it to runtime default rules, verifies the running rules list, and optionally observes live traffic.

## Architecture

Add `src/backends/whistle-web/` beside the existing runtime and storage backends.

### `WhistleWebClient`

`WhistleWebClient` is a thin TypeScript adapter over the running Whistle instance's built-in HTTP API:

- `GET /cgi-bin/rules/list`
- `POST /cgi-bin/rules/add`
- `POST /cgi-bin/rules/enable-default` when needed
- `GET /cgi-bin/get-data`

It is not a new service or plugin. Its base URL comes from explicit configuration if present, otherwise from `instance status`, usually `http://127.0.0.1:8899`.

### Backend Roles

- `WhistleWebClient`: default online backend for runtime rules and basic capture data.
- `RuntimeClient`: optional enhanced backend for future plugin-backed operations.
- Storage backend: offline rule/values reading, previews, backups, and compatibility.

Default backend selection for captures is `auto`, which means Whistle Web API first. Users can explicitly request `--backend runtime` for enhanced runtime behavior.

## Data Flow

```text
rule set-header --apply --verify-live
  -> build reqHeaders rule
  -> RulesService.applyRuntimeDefaultRules()
  -> RulesService.verifyRuntimeDefaultRules()
  -> CapturesService.assertHeader()
     -> WhistleWebClient.getData()
     -> RuntimeClient only when explicitly selected or later required
  -> output OK / OVERRIDDEN / MISS / NO_TRAFFIC
```

Shortcut commands only orchestrate services. They must not directly call `/cgi-bin/*`, parse Whistle storage internals, or know about the `defalutRules` storage key.

## Capture Classification

For each matching request:

- `OK`: target request is observed and the header equals the expected value.
- `OVERRIDDEN`: target request is observed, the header exists, but the value differs.
- `MISS`: target request is observed, but the header is absent.
- `NO_TRAFFIC`: no matching request is observed during the finite observation window.

`assert-header` returns aggregate counts and representative examples. `watch --format ndjson` emits one classification event per observed request.

## Error Handling

Continue using the existing JSON envelope. Add these stable error codes:

- `WHISTLE_WEB_UNAVAILABLE`: Whistle Web API connection failed or returned invalid data.
- `RUNTIME_BACKEND_UNAVAILABLE`: user explicitly selected runtime, but runtime API is unavailable.
- `RULE_RUNTIME_VERIFY_FAILED`: runtime rule write completed, but the subsequent rules list did not contain the expected rule.
- `HEADER_ASSERTION_NO_TRAFFIC`: no target traffic appeared during the observation window.
- `HEADER_ASSERTION_FAILED`: target traffic appeared, but at least one request was `MISS` or `OVERRIDDEN`.
- `RULE_HEADER_CONFLICT`: multiple matching rules may set the same request header.

Failures should include `reason`, `suggested_fix`, and compact examples when available.

## Conflict Diagnosis

The first version of conflict diagnosis is intentionally best-effort:

- Parse rules containing `reqHeaders://`.
- Extract simple `key=value` header assignments.
- Match common patterns:
  - regex patterns like `/.../`
  - URL prefix patterns like `https://host/path`
  - host/path simple patterns
- For a provided URL and header, report all candidate matching rules and their assigned values.

The diagnostic output should explain when a more specific existing rule may override a broader domain rule, such as a path-specific trigger rule overriding a host-wide environment rule.

## Skill Updates

Update `skills/whistle-cli/SKILL.md` with a standard header-injection workflow:

1. Check instance status.
2. Apply runtime default rules through `rules default apply`.
3. Verify runtime rules through `rules default get`.
4. Use `captures assert-header` for finite verification.
5. Use `captures watch --watch` only for human-driven continuous debugging.
6. Use `rules diagnose-conflicts` when assertion reports `OVERRIDDEN`.

The skill should describe direct storage edits as a fallback for offline manipulation only, not as the preferred path for live rule changes.

## Testing Strategy

### Unit Tests

- `WhistleWebClient` request paths, POST body shape, timeout, and error mapping.
- Mapping `/cgi-bin/get-data` sessions into normalized capture records.
- Header classification: `OK`, `OVERRIDDEN`, `MISS`, and `NO_TRAFFIC`.
- Rule conflict parser and matcher for common `reqHeaders` patterns.

### Integration Tests

- Use a fake HTTP server implementing `/cgi-bin/rules/list`, `/cgi-bin/rules/add`, and `/cgi-bin/get-data`.
- Verify `rules default apply --verify` writes and reads back runtime default rules.
- Verify `captures assert-header --duration` produces aggregate counts and examples.
- Verify default capture backend succeeds through Whistle Web API when runtime API is absent.
- Verify explicit `--backend runtime` returns `RUNTIME_BACKEND_UNAVAILABLE` when the runtime API is absent.

### Skill Smoke

- Validate the skill references the new CLI workflow.
- Validate examples use `--format json` or `--format ndjson`.
- Validate the skill no longer recommends direct Whistle storage edits for live rule changes.

## Implementation Defaults

- Default finite observation duration is 60 seconds.
- Runtime backend probing must be explicit and cheap. It must not delay the default Whistle Web API path.
- `--backend auto` uses Whistle Web API by default. Runtime API is used only when explicitly requested in the first version.

## Acceptance Criteria

- A user can apply a domain-level request header rule through `whistle-cli` and verify the running Whistle rules include it.
- A user can observe live traffic for a host and receive `OK`, `OVERRIDDEN`, `MISS`, or `NO_TRAFFIC` results.
- In a normal Whistle instance without `__whistle_cli__` runtime API, capture verification still works through `/cgi-bin/get-data`.
- Existing storage-backed rule patch behavior remains compatible.
- The skill guides agents through the new CLI workflow and avoids direct live storage edits.
