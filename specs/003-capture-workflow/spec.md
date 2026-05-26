# Feature Specification: Agent-Driven Capture Workflow Reliability

**Feature Branch**: `003-capture-workflow`  
**Created**: 2026-05-26  
**Status**: Draft  
**Input**: User description: "Track GitHub issue #5 and improve whistle-cli plus the distributed skill so agent-driven Whistle capture tasks are more accurate, faster, safer, and recoverable."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Capture a Target Request Reliably (Priority: P1)

As an agent debugging traffic through Whistle, I want to wait for a target request using scoped filters and receive the first matching request from only newly observed captures, so I can report identifiers such as logid without writing custom polling loops.

**Why this priority**: This is the core user value: a capture task should reliably find the intended package and avoid confusing old traffic with newly triggered actions.

**Independent Test**: Run a capture wait with host and path filters, trigger a matching request after the wait starts, and verify the result contains only the new matching capture with status and request identifiers.

**Acceptance Scenarios**:

1. **Given** existing captures include old matching and non-matching traffic, **When** a capture wait starts with "since now" behavior and the user triggers a matching request, **Then** the result returns the new matching capture and excludes old matches.
2. **Given** no matching request is observed before the timeout, **When** the capture wait ends, **Then** the result clearly reports no match and gives actionable next steps for retriggering the UI action.
3. **Given** multiple requests are observed after the wait starts, **When** only one request satisfies the target filters, **Then** the result identifies the target request without returning unrelated captures.

---

### User Story 2 - Return Safe, High-Signal Capture Summaries (Priority: P2)

As an agent sharing capture results, I want default output to include only useful diagnostic fields and to redact sensitive headers, so I can respond quickly without exposing cookies or tokens.

**Why this priority**: Capture output often contains sensitive authentication material. The default workflow must be safe and concise before it is broadly useful.

**Independent Test**: Query or wait for captures that include sensitive headers and verify the default summary includes requested fields such as logid and request-id while excluding sensitive header values.

**Acceptance Scenarios**:

1. **Given** a matching capture includes `cookie` and `authorization` headers, **When** the agent requests a default summary, **Then** those values are not emitted.
2. **Given** a matching capture has `x-tt-logid`, request id, injected environment headers, and matched rules, **When** the summary is returned, **Then** those diagnostic fields are present.
3. **Given** a user explicitly asks for a saved artifact, **When** the target capture is found, **Then** a redacted capture summary can be persisted for later review.

---

### User Story 3 - Follow a Documented Agent Playbook (Priority: P3)

As a user asking an agent to capture a known workflow, I want the repository skill to describe the standard capture process and common intent-to-filter mappings, so the agent starts with accurate filters and asks for the right UI trigger.

**Why this priority**: Tooling alone is not enough; the skill must guide agents toward the reliable path and away from broad, noisy keyword searches.

**Independent Test**: Read the distributed skill and verify it instructs agents to check status, start a scoped new-capture watch, request a specific user trigger, extract identifiers immediately, and apply fallback steps on timeout.

**Acceptance Scenarios**:

1. **Given** a user asks to capture a chatbot skill list request, **When** the skill guidance is followed, **Then** the agent uses host and path filters for the chatbot skill-list intent.
2. **Given** no matching capture appears within the initial wait, **When** the skill guidance is followed, **Then** the agent reports that no match was observed and asks the user to trigger the exact UI action again.

### Edge Cases

- The runtime capture backend is unavailable and only Whistle Web capture reads can be used.
- The target request was already present before listening started.
- The target request appears multiple times during a single watch window.
- A matching capture lacks `x-tt-logid` or request-id headers.
- A capture contains sensitive headers that must not be emitted by default.
- No matching request appears before timeout because the UI did not trigger the target network call.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a way to wait for matching captures using host, path, method, status, and keyword filters.
- **FR-002**: The system MUST support waiting for captures that occur only after the wait begins.
- **FR-003**: The system MUST return a structured success result when a matching capture is observed before timeout.
- **FR-004**: The system MUST return a structured timeout result with next actions when no matching capture is observed.
- **FR-005**: The system MUST include key diagnostic fields in capture summaries: capture id, method, status, URL or path, logid, request id, selected environment headers, referer, and matched rule summary when available.
- **FR-006**: The system MUST redact sensitive header values such as cookies, authorization tokens, and token-like fields from default capture summaries.
- **FR-007**: The system MUST allow callers to select a limited set of output fields for capture queries.
- **FR-008**: The system MUST allow a matched capture summary to be saved in redacted form for later inspection.
- **FR-009**: The system MUST keep existing capture query behavior available for users who need broad find/export workflows.
- **FR-010**: The repository-distributed skill MUST document the standard capture workflow, including status checks, scoped filters, user trigger coordination, immediate identifier extraction, timeout handling, and safety defaults.
- **FR-011**: The repository-distributed skill MUST include intent-to-filter examples for common Whistle debugging tasks, including chatbot skill-list requests.
- **FR-012**: The system MUST expose machine-readable output suitable for agent control flow.

### Key Entities

- **Capture Watch Session**: A bounded attempt to observe matching traffic after a known start point; includes filters, timeout, result status, and observed matches.
- **Capture Filter**: Criteria used to select relevant traffic, such as host, path, method, status, and keyword.
- **Capture Summary**: A redacted, field-limited representation of a capture suitable for agent responses.
- **Intent Mapping**: A skill-documented mapping from a natural-language debugging intent to recommended capture filters.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An agent can capture and report the logid for a newly triggered target request with a single documented watch/assert workflow.
- **SC-002**: The workflow excludes old matching captures when the user asks to trigger a fresh request.
- **SC-003**: Default capture summaries do not expose cookie or authorization header values.
- **SC-004**: Timeout results tell the user exactly what action to take next to retrigger the target request.
- **SC-005**: The documented chatbot skill-list workflow identifies the expected host and path filters without relying on broad keyword-only searches.

## Assumptions

- GitHub issue #5 is the tracking issue for this feature.
- The initial implementation should work when only Whistle Web capture reads are available.
- Default output should optimize for agent safety and concise human reporting, not raw packet archival.
- Existing `captures find`, `captures export`, and current JSON envelope conventions remain compatible.
