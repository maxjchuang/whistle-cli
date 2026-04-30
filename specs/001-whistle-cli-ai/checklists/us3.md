# Requirements Checklist: US3 Traffic (Captures/Replay/Frames)

**Purpose**: Validate US3 requirements quality (captures search/inspect, replay/compose, frames, and streaming output) before implementation.
**Created**: 2026-04-29
**Feature**: [spec.md](specs/001-whistle-cli-ai/spec.md)

## Requirement Completeness

- [ ] CHK001 Are requirements defined for capture query filters (host/path/method/status/headers/body/app/error) beyond examples? [Completeness, Spec FR-008]
- [ ] CHK002 Are requirements defined for what constitutes a "capture record" (fields, identifiers, timestamps) at the contract level? [Gap, Spec FR-009]
- [ ] CHK003 Are requirements defined for how matched rules are represented in capture inspection output (ids/names, match evidence)? [Gap, Spec FR-009]
- [ ] CHK004 Are requirements defined for replay inputs (headers/params/body edits) and output evidence (request sent + response summary)? [Completeness, Spec FR-010]
- [ ] CHK005 Are requirements defined for "compose request" from scratch vs from capture, including required fields and defaults? [Gap, Spec FR-010]
- [ ] CHK006 Are requirements defined for WebSocket/TCP frame inspection outputs (frame fields, direction, timestamps)? [Gap, Spec FR-011]
- [ ] CHK007 Are requirements defined for `captures tail` streaming envelope semantics (event types, end condition)? [Completeness, Contracts output-contract.md Streaming Contract]

## Requirement Clarity

- [ ] CHK008 Is "find captured traffic" clarified into a stable query API (supported operators, partial matches, limits)? [Clarity, Spec US3 + FR-008]
- [ ] CHK009 Is "explain matched rules" clarified into a required output shape (summary vs full list, ordering, confidence)? [Clarity, Spec US3 + FR-009]
- [ ] CHK010 Is "replay" clarified regarding scope (does it reuse existing rules/values, inject temporary rules, or both)? [Ambiguity, Spec FR-010 + FR-016]
- [ ] CHK011 Is "construct edited requests" clarified regarding how conflicts are resolved (header overwrite vs merge, param merge rules)? [Clarity, Spec FR-010]
- [ ] CHK012 Are terms like "recent" and "debug window" quantified (time range defaults, max records)? [Ambiguity, Spec US3 + Plan Performance Goals]

## Requirement Consistency

- [ ] CHK013 Do US3 outputs consistently follow the output envelope contract for `status/resource/action/meta` across batch and streaming modes? [Consistency, Contracts output-contract.md + resource-commands.md]
- [ ] CHK014 Are `captures` actions listed in the resource contract (`find/get/tail/diff/export`) consistent with tasks and US3 narrative (includes replay/compose via separate resource)? [Consistency, Contracts resource-commands.md + Tasks T045–T046]
- [ ] CHK015 Is rollback scope consistent: US3 operations that mutate state must declare whether they are temporary/persistent and whether rollback is supported/required. [Consistency, Spec FR-015 + FR-016]

## Acceptance Criteria Quality

- [ ] CHK016 Can SC-005 ("locate, inspect, and replay" in under 2 minutes) be measured with a defined setup, dataset, and timing method? [Measurability, Spec SC-005]
- [ ] CHK017 Are acceptance scenarios for US3 mapped to concrete command surfaces (which resource/shortcut commands satisfy each scenario)? [Gap, Spec US3 + Contracts resource-commands.md]
- [ ] CHK018 Are success criteria for streaming behavior testable (e.g., event ordering, backpressure, termination)? [Measurability, Contracts output-contract.md Streaming Contract]

## Scenario Coverage

- [ ] CHK019 Are primary flows specified for: find -> inspect -> replay -> verify outcome? [Coverage, Spec US3]
- [ ] CHK020 Are alternate flows specified for: multiple matches and user/AI selection strategy? [Gap, Spec US3]
- [ ] CHK021 Are exception flows specified for: missing/expired capture record references? [Coverage, Spec Edge Cases]
- [ ] CHK022 Are recovery flows specified for: replay fails due to environment (proxy not active, instance not running) and what next actions should be suggested? [Coverage, Spec FR-013]

## Edge Case Coverage

- [ ] CHK023 Are requirements defined for cross-instance ambiguity (capture belongs to different instance than current default) and how to resolve/report it? [Coverage, Spec Edge Cases]
- [ ] CHK024 Are requirements defined for sensitive data handling in captures (redaction, opt-out, filtering)? [Gap, Spec FR-018/Assumptions]
- [ ] CHK025 Are requirements defined for large bodies/binary payloads and truncation policy in outputs? [Gap, Spec FR-009]
- [ ] CHK026 Are requirements defined for WebSocket/TCP frame volume limits and sampling (to avoid overwhelming output)? [Gap, Spec FR-011]

## Non-Functional Requirements

- [ ] CHK027 Are performance expectations for capture queries (latency p95, limits) translated into testable NFR statements for US3? [Clarity, Plan Performance Goals]
- [ ] CHK028 Are failure modes mapped to stable error codes for capture/runtime availability (e.g., `CAPTURE_BACKEND_UNAVAILABLE`, `NO_CAPTURE_MATCH`)? [Consistency, Contracts output-contract.md Error Codes]

## Dependencies & Assumptions

- [ ] CHK029 Are dependencies between runtime backend vs raw backend for replay/compose explicitly stated (what uses which backend)? [Clarity, Tasks T044/T048]
- [ ] CHK030 Are assumptions about capture retention/availability documented (what data sources exist, when data expires)? [Gap, Spec Edge Cases]

## Ambiguities & Conflicts

- [ ] CHK031 Is it explicit whether US3 must work without `w2` installed (like parts of US1), or is `w2` a hard dependency for capture/replay? [Ambiguity, Plan Technical Context + Spec FR-018]
- [ ] CHK032 Is the boundary between `captures diff` and `composer` (edited request composition) clearly defined to avoid overlapping contracts? [Clarity, Contracts resource-commands.md + Tasks T045–T046]

## Notes

- Use this checklist to refine requirements before starting `T042+` implementation.
