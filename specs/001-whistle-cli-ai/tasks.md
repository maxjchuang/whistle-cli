# Tasks: Whistle AI CLI

**Input**: Design documents from `/specs/001-whistle-cli-ai/`  
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: No story-specific test tasks are generated here because the feature spec does not explicitly require TDD. Testing infrastructure and validation hooks are still included in setup/foundational work so implementation can be verified as features land.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/`, `tests/` at repository root
- Paths below follow the implementation plan’s single-project TypeScript CLI layout

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Initialize the TypeScript CLI project and create the baseline repository layout.

- [x] T001 Initialize the Node.js package manifest with CLI entrypoints and scripts in package.json
- [x] T002 Create TypeScript compiler and runtime configuration in tsconfig.json
- [x] T003 [P] Add `.gitignore` entries for Node, build, local state, and fixture artifacts in .gitignore
- [x] T004 [P] Add repository-level tool configuration for formatting and linting in .prettierrc.json and eslint.config.js
- [x] T005 Create the planned source and test directory skeleton with placeholder indexes in src/cli/index.ts, src/shortcuts/index.ts, src/resources/index.ts, src/backends/raw/index.ts, src/backends/storage/index.ts, src/backends/runtime/index.ts, src/domain/index.ts, src/doctor/index.ts, src/output/index.ts, src/shared/index.ts, tests/unit/.gitkeep, tests/contract/.gitkeep, and tests/integration/.gitkeep
- [x] T006 Install and record baseline runtime and development dependencies in package.json and package-lock.json

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build the shared command, output, adapter, and state foundations that all user stories depend on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T007 Implement environment and repository configuration loading in src/shared/config.ts
- [x] T008 [P] Implement current-instance resolution and selection primitives in src/shared/instance-context.ts
- [x] T009 [P] Implement canonical JSON result envelopes and shared response helpers in src/output/result.ts
- [x] T010 [P] Implement stable typed error codes and error serialization in src/output/errors.ts
- [x] T011 Implement human-readable and machine-readable output rendering in src/output/renderers.ts
- [x] T012 [P] Implement local whistle-cli metadata persistence for action logs, previews, and flow checkpoints in src/backends/storage/state-store.ts
- [x] T013 [P] Implement the low-level subprocess runner for raw `w2` execution in src/backends/raw/process-runner.ts
- [x] T014 Implement the high-level `w2` adapter for lifecycle, proxy, CA, and plugin operations in src/backends/raw/w2-client.ts
- [x] T015 [P] Implement persisted Whistle storage discovery and read/write helpers in src/backends/storage/whistle-storage.ts
- [x] T016 [P] Implement runtime client scaffolding for captures and replay-oriented operations in src/backends/runtime/runtime-client.ts
- [x] T017 Implement preview/apply/verify orchestration and rollback hooks in src/domain/action-executor.ts
- [x] T018 Implement interactive flow state handling for blocked and user-assisted operations in src/domain/flow-runner.ts
- [x] T019 Implement the root CLI program, global flags, and resource registration in src/cli/program.ts
- [x] T020 Implement the `raw w2 ...` command surface and CLI registration in src/resources/raw.ts and src/cli/program.ts
- [x] T021 Configure the baseline verification toolchain and test runner scripts in vitest.config.ts

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Bootstrap And Control Whistle (Priority: P1) 🎯 MVP

**Goal**: Let users and AI start, stop, inspect, and prepare a Whistle instance, including certificate and proxy setup, without falling back to raw Whistle commands.

**Independent Test**: A user can run instance, cert, proxy, and doctor commands against a local or headless Whistle setup, receive structured results, and successfully reach a working Whistle session through the resolved default instance.

- [x] T022 [P] [US1] Implement the Whistle instance domain model and lifecycle mapping in src/domain/instance-service.ts
- [x] T023 [P] [US1] Implement certificate state inspection and install-material resolution in src/domain/certificate-service.ts
- [x] T024 [P] [US1] Implement proxy state inspection and verification logic in src/domain/proxy-service.ts
- [x] T025 [US1] Implement resource commands for `instance start/stop/restart/status/list/select` in src/resources/instance.ts
- [x] T026 [US1] Implement resource commands for `certs status/install/verify/guide` in src/resources/certs.ts
- [x] T027 [US1] Implement resource commands for `proxy status/set/off/verify` in src/resources/proxy.ts
- [x] T028 [US1] Implement doctor flows for `instance-status`, `proxy-routing`, and `https-capture` in src/doctor/system-doctor.ts
- [x] T029 [US1] Implement the `doctor` command surface and blocked-flow serialization in src/resources/doctor.ts
- [x] T030 [US1] Implement local permission detection and remediation hints for cert/proxy mutations in src/doctor/permission-checks.ts and src/domain/flow-runner.ts
- [x] T031 [US1] Implement high-frequency bootstrap shortcuts such as `cert install`, `doctor https`, and default-instance preparation in src/shortcuts/bootstrap.ts
- [x] T032 [US1] Add integration fixtures and command validation helpers for local-instance bootstrap scenarios in tests/integration/us1-bootstrap.fixtures.ts

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - Express Whistle Rules In Natural Language (Priority: P1)

**Goal**: Provide AI-friendly rule and value management with safe previews, persistent defaults, and explainable mutations.

**Independent Test**: A user can request a rule or value change, inspect the preview, apply it to the default or selected instance, verify that it took effect, and ask the tool to explain the resulting configuration.

- [ ] T033 [P] [US2] Implement the rule set, rule patch, and value entry models in src/domain/rules-model.ts
- [ ] T034 [P] [US2] Implement value entry persistence and import/export helpers in src/domain/values-service.ts
- [ ] T035 [US2] Implement rule patch planning, diff generation, and conflict detection in src/domain/rules-service.ts
- [ ] T036 [US2] Implement resource commands for `rules list/get/patch/apply/verify/enable/disable/import/export` in src/resources/rules.ts
- [ ] T037 [US2] Implement resource commands for value inspection and persistence management in src/resources/values.ts
- [ ] T038 [US2] Implement natural-language-to-intent shortcuts such as `rule set-header` and `rule map-local` in src/shortcuts/rules.ts
- [ ] T039 [US2] Implement configuration explanation and persistence-scope reporting for rules and values in src/domain/config-explainer.ts
- [ ] T040 [US2] Wire rule and value action logging, rollback handles, and persistent-default behavior into src/domain/action-executor.ts
- [ ] T041 [US2] Add rule/value command fixtures covering preview, apply, verify, and explain scenarios in tests/integration/us2-rules.fixtures.ts

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 3 - Inspect, Replay, And Compose Traffic (Priority: P2)

**Goal**: Turn Whistle captures into an AI-readable observation surface that supports search, analysis, replay, and edited request composition.

**Independent Test**: A user can find recent captures, inspect structured request/response evidence, replay an existing capture with modifications, and receive typed output for both batch and streaming capture views.

- [ ] T042 [P] [US3] Implement capture query, capture record, and compose request models in src/domain/captures-model.ts
- [ ] T043 [US3] Implement capture search, filtering, sorting, and summary analysis in src/domain/captures-service.ts
- [ ] T044 [US3] Implement replay and compose execution planning over runtime and raw backends in src/domain/composer-service.ts
- [ ] T045 [US3] Implement resource commands for `captures find/get/tail/diff/export` in src/resources/captures.ts
- [ ] T046 [US3] Implement resource commands for replay and edited request composition in src/resources/composer.ts
- [ ] T047 [US3] Implement capture-oriented shortcuts such as `capture find`, `capture find-error`, and replay patch helpers in src/shortcuts/captures.ts
- [ ] T048 [US3] Extend the runtime client for NDJSON streaming, session detail loading, and capture export in src/backends/runtime/runtime-client.ts
- [ ] T049 [US3] Implement WebSocket/TCP frame inspection and session-control services in src/domain/frames-service.ts
- [ ] T050 [US3] Implement resource commands for frame listing and session send/receive control in src/resources/frames.ts
- [ ] T051 [US3] Extend output rendering for capture analysis summaries, frame events, and streaming output in src/output/renderers.ts
- [ ] T052 [US3] Add capture, replay, and WebSocket/TCP validation fixtures in tests/integration/us3-captures.fixtures.ts

**Checkpoint**: At this point, User Stories 1, 2, and 3 should all be independently functional

---

## Phase 6: User Story 4 - Manage Plugin Lifecycle (Priority: P3)

**Goal**: Support plugin lifecycle management and metadata inspection without promising unified plugin custom-action invocation in v1.

**Independent Test**: A user can install, inspect, enable, disable, update, and uninstall a Whistle plugin through structured commands, and gets a clear out-of-scope response if they ask to invoke plugin-specific custom actions.

- [ ] T053 [P] [US4] Implement the plugin record model and lifecycle state normalization in src/domain/plugins-model.ts
- [ ] T054 [US4] Implement plugin lifecycle orchestration and metadata inspection in src/domain/plugins-service.ts
- [ ] T055 [US4] Implement resource commands for `plugins list/install/uninstall/enable/disable/inspect` in src/resources/plugins.ts
- [ ] T056 [US4] Implement plugin-management shortcuts and out-of-scope custom-action handling in src/shortcuts/plugins.ts
- [ ] T057 [US4] Extend the raw backend adapter for plugin install, uninstall, and status flows in src/backends/raw/w2-client.ts
- [ ] T058 [US4] Add plugin lifecycle validation fixtures and unsupported-action scenarios in tests/integration/us4-plugins.fixtures.ts

**Checkpoint**: All user stories should now be independently functional

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Finalize cross-story quality, documentation, and release readiness for the accepted v1 platform matrix.

- [ ] T059 [P] Add CLI usage documentation and architecture notes for the three-layer command surface in README.md
- [ ] T060 Add a documented workflow coverage matrix for official Whistle workflow parity in specs/001-whistle-cli-ai/workflow-coverage.md
- [ ] T061 Update quickstart validation steps and local setup guidance to match the implemented command surface in specs/001-whistle-cli-ai/quickstart.md
- [ ] T062 [P] Add macOS and Linux headless acceptance scripts for the documented core workflows in tests/integration/acceptance-smoke.ts
- [ ] T063 Harden logging, warning messages, and blocked-flow next actions across all resources in src/output/result.ts
- [ ] T064 [P] Add final contract fixtures for result envelopes and stable error codes in tests/contract/output-envelope.contract.ts
- [ ] T065 Run the quickstart flow end-to-end, validate workflow coverage against specs/001-whistle-cli-ai/workflow-coverage.md, and capture any final path/config adjustments in specs/001-whistle-cli-ai/quickstart.md

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - US1 and US2 are both P1, but US1 should land first because instance, cert, proxy, and doctor primitives reduce downstream uncertainty
  - US3 depends on runtime adapter maturity from Foundational and benefits from US2 action logging/output patterns
  - US4 depends on raw backend and output/error foundations, but is otherwise independent from US3
- **Polish (Phase 7)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - establishes the operational base for the product MVP
- **User Story 2 (P1)**: Can start after Foundational (Phase 2) - should reuse shared instance resolution and action execution from US1, but remains independently testable
- **User Story 3 (P2)**: Can start after Foundational (Phase 2) - reuses output, runtime, and state foundations; does not require plugins
- **User Story 4 (P3)**: Can start after Foundational (Phase 2) - reuses raw adapter and output contracts; does not require captures

### Within Each User Story

- Domain models and normalization helpers before resource command wiring
- Resource commands before shortcuts
- Backend extensions before runtime-heavy or plugin-heavy flows
- Fixtures and acceptance helpers after the relevant resource surface exists

### Parallel Opportunities

- Setup tasks marked `[P]` can run in parallel
- Foundational tasks marked `[P]` can run in parallel once the package scaffold exists
- Within US1, T022-T024 can run in parallel before command wiring
- Within US2, T033-T034 can run in parallel before rule orchestration
- Within US3, T040 and T046 can proceed in parallel after foundational runtime scaffolding exists
- Within US4, T053 and T057 can proceed in parallel before plugin command wiring
- Polish tasks T059, T062, and T064 can run in parallel once story work is complete

---

## Parallel Example: User Story 1

```bash
# Launch domain primitives for User Story 1 together:
Task: "Implement the Whistle instance domain model and lifecycle mapping in src/domain/instance-service.ts"
Task: "Implement certificate state inspection and install-material resolution in src/domain/certificate-service.ts"
Task: "Implement proxy state inspection and verification logic in src/domain/proxy-service.ts"
```

## Parallel Example: User Story 2

```bash
# Launch rule/value model work together:
Task: "Implement the rule set, rule patch, and value entry models in src/domain/rules-model.ts"
Task: "Implement value entry persistence and import/export helpers in src/domain/values-service.ts"
```

## Parallel Example: User Story 3

```bash
# Launch capture model and runtime stream work together:
Task: "Implement capture query, capture record, and compose request models in src/domain/captures-model.ts"
Task: "Extend the runtime client for NDJSON streaming, session detail loading, and capture export in src/backends/runtime/runtime-client.ts"
```

## Parallel Example: User Story 4

```bash
# Launch plugin model and raw backend extension together:
Task: "Implement the plugin record model and lifecycle state normalization in src/domain/plugins-model.ts"
Task: "Extend the raw backend adapter for plugin install, uninstall, and status flows in src/backends/raw/w2-client.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1
4. Validate instance, cert, proxy, and doctor flows on macOS desktop
5. Demo the local-first bootstrap experience before expanding scope

### Incremental Delivery

1. Setup + Foundational create the reusable CLI core
2. Add User Story 1 for operational bootstrap and environment readiness
3. Add User Story 2 for rule/value manipulation and configuration explanation
4. Add User Story 3 for capture analysis and replay
5. Add User Story 4 for plugin lifecycle coverage
6. Finish with polish tasks and macOS/Linux headless acceptance checks

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1
   - Developer B: User Story 2
   - Developer C: User Story 3
3. User Story 4 can start once raw backend and output contracts are stable
4. Final acceptance and docs can proceed in parallel during Polish

---

## Notes

- `[P]` tasks target different files or isolated modules
- User story tasks are organized so each story can be validated independently
- No story-specific test-first tasks are included because the feature spec did not require TDD
- The suggested MVP scope is **User Story 1** only
