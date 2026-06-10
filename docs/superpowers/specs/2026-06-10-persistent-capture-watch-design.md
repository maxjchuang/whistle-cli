# Persistent Capture Watch Design

## Context

`whistle-cli captures watch` already supports bounded Whistle Web polling for request summaries and header assertions. The command exposes a `--watch` flag described as "Keep watching until interrupted", but the current ordinary request-summary branch still exits after `--timeout` or `--duration`. Only the `--expect-header` branch loops while `--watch` is present.

The feature should make the existing command match its advertised behavior for ordinary capture summaries. This is a CLI streaming improvement, not a storage or daemon feature.

## Goals

- Make `captures watch --watch` continuously emit newly observed request summaries until interrupted.
- Preserve bounded watch behavior when `--watch` is not passed.
- Preserve NDJSON envelope output and existing summary field projection.
- Keep the implementation read-only and based on Whistle Web recent-window polling.
- Exit immediately on Whistle Web or instance errors so external process managers can decide whether to restart.

## Non-Goals

- Do not add a new `captures stream` command.
- Do not create a background daemon or persistent capture database.
- Do not persist seen capture ids across process restarts.
- Do not remove the current Whistle Web recent-window constraint.
- Do not implement arbitrary historical `--since` cursors.

## CLI Semantics

`captures watch` has two request-summary modes:

1. Bounded mode, without `--watch`.
   - Uses `--timeout` when provided, otherwise `--duration`, otherwise the existing default duration.
   - Emits `event=capture` for each newly observed matching request.
   - Emits one `event=end` when the bounded observation window ends.

2. Persistent mode, with `--watch`.
   - Ignores `--timeout` and `--duration`.
   - Continues polling until `SIGINT` or `SIGTERM`.
   - Emits `event=capture` for each newly observed matching request.
   - On user or process-manager interruption, emits one `event=end` with `ended: true`, the total emitted capture count, and `reason: "interrupted"`.
   - Exits with code `0` after an interrupt end event.

Both modes continue to require `--format ndjson`. `--poll-interval` remains effective and uses the current lower bound of 100 ms in the service layer. `--fields` remains effective for projected summaries.

`--since` is clarified as supporting only the existing baseline behavior. Omitted `--since` and `--since now` are accepted. Any other value returns `UNSUPPORTED_OPERATION` instead of implying unsupported historical cursor behavior.

## Architecture

The change stays within the existing capture resource and domain service boundary:

- `src/resources/captures.ts` continues to own command parsing, NDJSON envelope rendering, signal handling, and exit codes.
- `src/domain/captures-service.ts` owns baseline creation, polling, de-duplication, and summary projection.
- `WhistleWebClient.getData()` remains unchanged.

The service should either extend `watchRequestSummaries()` with a persistent option or add a sibling method with the same inputs and a clear persistent contract. The CLI should not duplicate the polling and filtering loop directly.

## Data Flow

Persistent request-summary watch:

1. Resolve the target instance and filters.
2. Validate output format and `--since`.
3. Build an initial baseline by calling `find()` and inserting current `capture_id` values into an in-memory `Set`.
4. Poll using the configured interval.
5. For each `find()` result, skip ids already in the set.
6. Add newly observed ids to the set and yield projected summaries.
7. The CLI renders each yielded summary as an `event=capture` NDJSON envelope.
8. On `SIGINT` or `SIGTERM`, stop after the current safe point and render an `event=end` envelope.

The `Set` is intentionally unbounded for this design. Long-running high-volume processes can consume more memory over time, but this matches the requested behavior and avoids duplicate emissions if Whistle Web rotates ids back into the recent window.

## Error Handling

- Non-NDJSON output remains `UNSUPPORTED_OPERATION`.
- Unsupported `--since` values return `UNSUPPORTED_OPERATION`.
- Whistle Web, runtime, or instance errors emit an `event=error` envelope to stderr and exit non-zero.
- If an error happens after one or more `event=capture` envelopes, the command does not emit a normal `event=end`; the error envelope is the terminal event.
- Interrupt handling is best-effort. The process should avoid starting another poll after an interrupt has been received.

## Testing

Add focused integration coverage with the existing fake Whistle Web backend:

- `captures watch --watch` in request-summary mode continues past the normal bounded duration until the test sends an interrupt.
- Captures present at startup are treated as baseline and not emitted.
- Captures added after startup are emitted once as `event=capture`.
- Interrupting the process emits `event=end` with `ended: true`, `count`, and `reason: "interrupted"`, then exits with code `0`.
- A Whistle Web error emits `event=error` and exits non-zero.
- `--since now` is accepted and unsupported values are rejected.
- Non-NDJSON output is still rejected.

Update README and `skills/whistle-cli/SKILL.md` to show persistent request-summary watching with `captures watch --watch`, and document that it is process-local, in-memory de-duplication over Whistle Web's recent capture window.
