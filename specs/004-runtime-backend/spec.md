# Feature Specification: Runtime Backend Server

**Feature Branch**: `004-runtime-backend`  
**Created**: 2026-05-26  
**Status**: Draft  
**Input**: User description: "Open a GitHub issue for the missing runtime backend, then follow the Speckit workflow to implement the runtime backend and submit a detailed PR linked to the issue."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Start a Local Runtime Backend (Priority: P1)

An agent or developer can start a local runtime backend for a running Whistle instance and point `WHISTLE_CLI_RUNTIME_URL` at it so existing `--backend runtime` capture commands call a real service instead of failing because `__whistle_cli__` routes do not exist.

**Why this priority**: This closes the current implementation gap and makes the existing `RuntimeClient` contract usable without requiring a separate unpublished service.

**Independent Test**: Start the runtime backend against a fake Whistle Web API and run `captures find --backend runtime`; the command returns structured capture records from the backend.

**Acceptance Scenarios**:

1. **Given** a reachable Whistle Web API with captured traffic, **When** the user starts the runtime backend and runs `captures find --backend runtime`, **Then** the command returns matching capture records with `backend=runtime`.
2. **Given** the target Whistle Web API is unavailable, **When** the user starts or queries the runtime backend, **Then** the operation returns a structured runtime backend error with an actionable next step.

---

### User Story 2 - Read and Stream Runtime Captures (Priority: P2)

An agent can use the runtime backend for capture lookup, single-capture retrieval, JSON export, and bounded tail streaming through the existing `__whistle_cli__/captures/*` routes.

**Why this priority**: Capture workflows are the highest-value runtime use case and are already represented in the CLI surface.

**Independent Test**: Run the runtime backend against fixture capture data and verify `find`, `get`, `export`, and `tail` return deterministic JSON or NDJSON responses.

**Acceptance Scenarios**:

1. **Given** multiple captures exist, **When** the user filters by host, path, method, status, or keyword, **Then** only matching captures are returned.
2. **Given** a known capture id, **When** the user calls `captures get --backend runtime`, **Then** the backend returns the requested normalized capture.
3. **Given** matching capture data exists, **When** the user calls `captures tail --backend runtime --format ndjson`, **Then** bounded NDJSON events are emitted without hanging indefinitely.

---

### User Story 3 - Compose and Replay Requests Through Runtime Backend (Priority: P3)

An agent can replay a captured request or compose a new HTTP request through the runtime backend and receive a structured response summary.

**Why this priority**: The existing composer commands already depend on `RuntimeClient`, so this makes a documented partial workflow executable.

**Independent Test**: Run composer commands against the runtime backend with fake upstream responses and verify the backend executes the request and returns status, URL, method, headers, and body metadata.

**Acceptance Scenarios**:

1. **Given** a capture with method, URL, headers, and body, **When** the user replays it, **Then** the backend issues an equivalent request with allowed overrides and returns the response summary.
2. **Given** a new request definition, **When** the user composes it, **Then** the backend issues the request and returns the response summary.

### Edge Cases

- Runtime backend receives malformed JSON or missing required request fields.
- Runtime backend target URL is unavailable or returns malformed Web API data.
- Captures contain sensitive headers; default CLI summaries must still redact through existing capture service behavior.
- A replay target fails, times out, or returns non-2xx status.
- Tail is requested when no captures match; the response must complete without an infinite stream in bounded CLI flows.
- Frame routes are requested before frame support exists; the backend must return a clear unsupported-operation response rather than pretending success.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST provide a CLI command to start a local runtime backend for a specified Whistle Web API target.
- **FR-002**: System MUST expose `__whistle_cli__/captures/find`, `get`, `export`, and `tail` routes compatible with the existing `RuntimeClient`.
- **FR-003**: System MUST normalize Whistle Web capture data into runtime capture records with stable ids, method, URL, host, path, status, protocol, request headers, and matched-rule evidence when available.
- **FR-004**: System MUST support host, path, method, status, keyword, and limit filters for runtime capture find/export/tail.
- **FR-005**: System MUST expose `__whistle_cli__/composer/compose` and `replay` routes that execute HTTP requests and return structured response summaries.
- **FR-006**: System MUST reject invalid runtime backend requests with JSON errors containing a stable code, message, and suggested fix.
- **FR-007**: System MUST keep existing Whistle Web backend behavior available; implementing runtime backend MUST NOT remove Web API fallback paths.
- **FR-008**: System MUST clearly report unsupported runtime frame routes until frame support is implemented.
- **FR-009**: System MUST include integration tests for runtime backend routes and CLI commands that exercise `RuntimeClient` against the implemented backend.
- **FR-010**: System MUST document how to start the runtime backend and point `WHISTLE_CLI_RUNTIME_URL` at it.
- **FR-011**: System MUST avoid explicit `any` in TypeScript source and tests.
- **FR-012**: System MUST open a GitHub issue and link the final pull request to that issue when GitHub credentials are available in the local environment.

### Key Entities

- **Runtime Backend Process**: Local HTTP service exposing `__whistle_cli__` routes and proxying or adapting data from a target Whistle Web API.
- **Runtime Capture Record**: Normalized capture object returned by runtime routes and consumed by `RuntimeClient`.
- **Runtime Request Execution**: Compose or replay operation that sends an outbound HTTP request and returns a structured response summary.
- **Runtime Error Envelope**: JSON error body used by backend routes for invalid input, unavailable targets, and unsupported operations.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A user can run one documented command to start the runtime backend and one documented environment variable to route `RuntimeClient` to it.
- **SC-002**: `captures find --backend runtime` succeeds against fixture Whistle Web capture data without requiring test-only fake `__whistle_cli__` routes.
- **SC-003**: Runtime capture find/get/export/tail routes return deterministic JSON or NDJSON responses and terminate predictably under test.
- **SC-004**: Composer compose/replay routes execute requests against a fake upstream server and return status, method, URL, and response metadata.
- **SC-005**: Unsupported frame routes return a stable unsupported-operation JSON error instead of a generic 404.
- **SC-006**: Focused integration tests, lint, and TypeScript build pass before the PR is opened.

## Assumptions

- The runtime backend will be a local CLI-managed HTTP service in this repository, not a Whistle plugin, for the first implementation.
- The backend will use Whistle's existing Web API as its capture source so it can be tested without modifying Whistle itself.
- Full WebSocket/TCP frame support is out of scope for this implementation; explicit unsupported responses are acceptable.
- The local environment may not have GitHub CLI credentials; if unavailable, implementation continues and GitHub issue/PR creation is reported as blocked.
