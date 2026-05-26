# Tasks: Agent-Driven Capture Workflow Reliability

**Input**: Design documents from `/specs/003-capture-workflow/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/captures-contract.md, quickstart.md

## Phase 1: Setup

- [x] T001 Review existing capture command/service contracts in `src/resources/captures.ts`, `src/domain/captures-service.ts`, and `src/domain/captures-model.ts`
- [x] T002 [P] Review existing capture tests and fake backend fixtures in `tests/integration/us3-captures.test.ts` and `tests/integration/us3-captures.fixtures.ts`

## Phase 2: Foundational

- [x] T003 Add capture summary, assertion result, watch, redaction, field projection, and since option types in `src/domain/captures-model.ts`
- [x] T004 Implement capture summary projection and default sensitive-header redaction helpers in `src/domain/captures-service.ts`
- [x] T005 Extend fake capture backend support for dynamic Whistle Web captures in `tests/integration/us3-captures.fixtures.ts`

## Phase 3: User Story 1 - Capture a Target Request Reliably (P1)

**Goal**: Agents can wait for new matching captures and receive the first matching request without custom polling loops.

**Independent Test**: Start an assert request with old matching captures already present, add or expose a new matching capture, and verify only the new request is returned.

- [x] T006 [P] [US1] Add integration tests for `captures assert-request` success and timeout in `tests/integration/us3-captures.test.ts`
- [x] T007 [US1] Implement snapshot-based since filtering and Web-backend polling in `src/domain/captures-service.ts`
- [x] T008 [US1] Add `captures assert-request` CLI command and options in `src/resources/captures.ts`
- [x] T009 [US1] Extend `captures watch` to support Whistle Web backend polling with `--since now`, timeout, and poll interval in `src/resources/captures.ts`

## Phase 4: User Story 2 - Return Safe, High-Signal Capture Summaries (P2)

**Goal**: Capture output is concise and safe by default while preserving diagnostic identifiers.

**Independent Test**: Query a capture containing cookie and authorization headers and verify default summaries include logid/request-id/env but omit sensitive values.

- [x] T010 [P] [US2] Add integration tests for field projection, redaction, and save output in `tests/integration/us3-captures.test.ts`
- [x] T011 [US2] Wire `--fields` projection into `captures find`, `captures watch`, and `captures assert-request` in `src/resources/captures.ts`
- [x] T012 [US2] Implement redacted summary save support in `src/domain/captures-service.ts` and `src/resources/captures.ts`

## Phase 5: User Story 3 - Follow a Documented Agent Playbook (P3)

**Goal**: The distributed skill guides agents through scoped capture workflows and fallback handling.

**Independent Test**: Read the skill and verify it documents status checks, scoped since-now watching, exact user trigger prompts, immediate logid extraction, timeout handling, and intent mappings.

- [x] T013 [P] [US3] Update capture workflow guidance in `skills/whistle-cli/SKILL.md`
- [x] T014 [P] [US3] Update local skill README or install guidance if command examples change in `skills/whistle-cli/README.md`
- [x] T015 [US3] Add or update skill workflow smoke coverage in `tests/integration/skill-agent-workflow-smoke.test.ts`

## Final Phase: Polish & Cross-Cutting

- [x] T016 Run `npm test` and fix regressions
- [x] T017 Run `npm run build` and verify CLI command help for new options
- [x] T018 Update GitHub issue #5 with implementation status and verification notes

## Dependencies

- Phase 1 before Phase 2.
- Phase 2 blocks all user stories.
- US1 is MVP and should complete before US2 because projection and save behavior depend on summary output shape.
- US3 can proceed after command contracts are stable.

## Parallel Opportunities

- T001 and T002 can run in parallel.
- T006 can be authored while T007/T008 are implemented.
- T010 can be authored after summary contract is clear.
- T013 and T014 can run in parallel with late implementation once command syntax is stable.

## Implementation Strategy

1. Deliver US1 first: `assert-request` and Web-backend watch with since-now filtering.
2. Add US2 safety defaults: field projection, redaction, and optional save.
3. Update skill guidance and smoke tests for US3.
4. Run full verification and update issue #5.
