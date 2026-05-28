# Feature Specification: Whistle Web Capture Retrieval

**Feature Branch**: `005-whistle-web-capture-retrieval`  
**Created**: 2026-05-28  
**Status**: Draft  
**Input**: User description: "Analyze issue #10 and fix Whistle Web capture retrieval so automation can get/export exact captures and extract a requested header after assert-request."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Retrieve Exact Whistle Web Capture By Id (Priority: P1)

An agent that already used `captures assert-request --backend whistle-web` can retrieve the exact capture by the returned `capture_id` without switching to the runtime backend or manually calling Whistle Web APIs.

**Why this priority**: This closes the main automation gap in issue #10: detection works, but exact follow-up retrieval does not.

**Independent Test**: Run `assert-request --backend whistle-web` against a fake Whistle Web capture sequence, then run `captures get --backend whistle-web --id <capture_id>` and verify the same capture is returned.

**Acceptance Scenarios**:

1. **Given** a newly observed Whistle Web capture id, **When** the user runs `captures get --backend whistle-web --id <id>`, **Then** the command returns that exact normalized capture.
2. **Given** the capture id is no longer in the Whistle Web data window, **When** the user runs `captures get --backend whistle-web --id <id>`, **Then** the command returns a stable error with a retry/listening suggestion.

---

### User Story 2 - Export Whistle Web Captures With Filters (Priority: P2)

An agent can export a best-effort JSON set of Whistle Web captures using the same filters as find/assert workflows, avoiding private `/cgi-bin/get-data` scripts.

**Why this priority**: Export removes repeated custom Web API code and makes capture automation more consistent.

**Independent Test**: Run `captures export --backend whistle-web --host ... --path ...` against fixture capture data and verify only matching records are returned.

**Acceptance Scenarios**:

1. **Given** multiple Whistle Web captures, **When** the user exports with host/path/method/status/keyword filters, **Then** only matching normalized records are returned.
2. **Given** the user requests an unsupported Whistle Web export format, **When** the command runs, **Then** the command returns a stable unsupported-operation error.

---

### User Story 3 - Extract One Header From Exact Capture (Priority: P3)

An agent can retrieve a specific request header from an exact capture id and pass it to a follow-up automation step without printing unrelated headers.

**Why this priority**: The issue's target workflow needs a single header value, such as a cookie, for an immediate one-off command.

**Independent Test**: Run `captures get-header --backend whistle-web --id <id> --header cookie` and verify the output contains only the requested header name/value for that capture.

**Acceptance Scenarios**:

1. **Given** a capture contains a `cookie` header, **When** the user asks for `--header cookie`, **Then** the command returns the cookie value without requiring an extra sensitive-output flag.
2. **Given** a capture contains multiple headers, **When** the user asks for one header, **Then** unrelated headers are not included in the output.
3. **Given** the requested header is absent, **When** the command runs, **Then** the command returns a stable error.

### Edge Cases

- The Whistle Web data window rotates between `assert-request` and `get`.
- A capture id appears as the Whistle Web data map key rather than inside the capture object.
- Header lookup must be case-insensitive.
- `captures export --backend whistle-web --export-format har` is requested before HAR generation exists.
- Runtime backend capture get/export behavior must remain compatible.
- Retrieval commands may output request header values exactly as captured when explicitly requested by the user.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST support `captures get --backend whistle-web --id <capture_id>`.
- **FR-002**: System MUST match Whistle Web captures by data map key, `id`, `capture_id`, or `reqId`.
- **FR-003**: System MUST return a normalized capture record for Whistle Web get, including request headers exactly as normalized from Whistle Web.
- **FR-004**: System MUST return a stable not-found error when a Whistle Web capture id cannot be found in the recent data window.
- **FR-005**: System MUST support `captures export --backend whistle-web` for JSON export with host, path, method, status, keyword, and limit filters.
- **FR-006**: System MUST reject unsupported Whistle Web export formats with a stable unsupported-operation error.
- **FR-007**: System MUST add `captures get-header` for extracting one request header by capture id and backend.
- **FR-008**: System MUST perform `get-header` lookup case-insensitively.
- **FR-009**: System MUST NOT require special flags based on whether a header name is sensitive; if the user explicitly requests a header, the tool returns that header's value.
- **FR-010**: System MUST ensure `get-header` output includes only the requested header and capture identity metadata, not all request headers.
- **FR-011**: System MUST keep `assert-request` summary output redacted by default.
- **FR-012**: System MUST preserve existing runtime backend capture get/export behavior.
- **FR-013**: System MUST document Whistle Web retrieval workflow and mention `dumpCount` for direct fallback use.
- **FR-014**: System MUST include focused integration tests for Whistle Web get, export, and get-header behavior.

### Key Entities

- **Whistle Web Capture Record**: Normalized capture data read from Whistle Web `/cgi-bin/get-data`.
- **Capture Retrieval Query**: Backend, capture id, and optional data window limit used to find one exact capture.
- **Capture Header Extraction Result**: Capture id, backend, header name, and value for the explicitly requested request header.
- **Whistle Web Export Result**: Filtered JSON collection of normalized Whistle Web captures and export metadata.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A capture id returned by `assert-request --backend whistle-web` can be retrieved by `captures get --backend whistle-web --id` while it remains in the Whistle Web data window.
- **SC-002**: `captures export --backend whistle-web` returns filtered JSON captures without requiring direct `/cgi-bin/get-data` scripting.
- **SC-003**: `captures get-header --backend whistle-web --id <id> --header <name>` returns only the requested header value and identity metadata.
- **SC-004**: Existing runtime capture tests continue to pass.
- **SC-005**: Focused tests, lint, TypeScript build, and full test suite pass before PR.

## Assumptions

- The fix targets JSON export for Whistle Web; HAR export remains runtime-only or unsupported for Whistle Web until a later feature.
- Explicit retrieval commands may expose captured header values because the user intentionally requested them.
- `assert-request` remains the safe reporting command and continues returning redacted summaries.
