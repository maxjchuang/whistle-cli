# Research: Whistle Web Capture Retrieval

## Decision: Reuse Whistle Web get-data reads for exact lookup

**Rationale**: `findViaWhistleWeb` already reads `/cgi-bin/get-data` and normalizes captures. Exact lookup should use the same source to keep id semantics consistent with `assert-request`.

**Alternatives considered**:

- Require runtime backend: rejected because issue #10 occurs when Whistle Web already detected the capture and runtime may not be running.
- Store captures locally during assert-request: rejected for this feature because it introduces persistence/lifecycle concerns and does not help independent get/export calls.

## Decision: Match ids using map key and known record fields

**Rationale**: Whistle Web records may use the data map key as the stable id, while some records also include `id`, `capture_id`, or `reqId`. Matching all of these avoids missing records due to shape differences.

**Alternatives considered**:

- Match only normalized `capture_id`: rejected because normalization itself uses fallback id and exact source matching should be explicit.

## Decision: Add get-header command

**Rationale**: Automation often needs one header value for a follow-up command. A dedicated command returns only the requested header and identity metadata without requiring consumers to parse full capture output.

**Alternatives considered**:

- Add `--include-request-header` to `captures get`: rejected because it makes `get` do two jobs and still requires users to parse larger output.
- Add sensitive-output confirmation flags: rejected because the user explicitly confirmed that special handling for sensitive headers would reduce tool effectiveness.

## Decision: Keep HAR export unsupported for Whistle Web

**Rationale**: The current normalized Whistle Web data is enough for JSON export but not guaranteed to be a complete HAR. Returning a stable unsupported-operation error is more honest than producing incomplete HAR.

**Alternatives considered**:

- Generate partial HAR: rejected because consumers may assume HAR completeness.
