# Research: Agent-Driven Capture Workflow Reliability

## Decision: Implement Web-backend watch as polling over existing capture reads

**Rationale**: Local Whistle instances may not expose the runtime capture API, while the existing Whistle Web client already reads recent sessions. Polling keeps the implementation compatible with current deployments.

**Alternatives considered**:

- Runtime-only tailing: rejected because it failed when runtime routes were unavailable.
- Direct Whistle storage inspection: rejected because it is less stable and bypasses existing Web API normalization.

## Decision: Use snapshot-based since filtering first

**Rationale**: Whistle Web capture records expose stable ids in the current normalized model. Capturing the visible id set at watch start avoids old matches without relying on timestamps that may not be available or comparable.

**Alternatives considered**:

- Wall-clock `startTime` only: useful for backend query narrowing but not sufficient as the only filter.
- No since filtering: rejected because it mixes historical and newly triggered traffic.

## Decision: Add `assert-request` as a one-shot success/timeout command

**Rationale**: Agents need a deterministic control-flow primitive that waits for a request and returns a structured result. This avoids ad hoc shell loops and makes timeout behavior consistent.

**Alternatives considered**:

- Extend `find` only: rejected because `find` is a point-in-time query, not a wait operation.
- Extend header-specific `watch`: rejected because request capture tasks often need path/logid matching without asserting a header value.

## Decision: Redact and project capture summaries by default

**Rationale**: Capture records often contain cookies, authorization tokens, and session material. Agent-facing defaults should optimize for safe reporting while still exposing diagnostic identifiers.

**Alternatives considered**:

- Emit full records and rely on agents to redact: rejected due to high leakage risk.
- Remove all headers: rejected because logid, request-id, env headers, and matched rules are the core debugging output.

## Decision: Update the repository skill alongside CLI changes

**Rationale**: The workflow improvement depends on agent behavior. The skill should encode status checks, scoped filters, since-now listening, user trigger coordination, immediate identifier extraction, and fallback handling.

**Alternatives considered**:

- CLI-only change: rejected because agents may continue using broad keyword searches and unsafe output patterns.
