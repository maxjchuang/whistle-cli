# Tasks: Runtime Backend Server

**Input**: Design documents from `/specs/004-runtime-backend/`  
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/
**GitHub Issue**: [#7](https://github.com/maxjchuang/whistle-cli/issues/7)

**Tests**: Required. This feature changes runtime behavior and command contracts.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prepare command registration and route contract test scaffolding.

- [x] T001 Add runtime resource registration point in `src/resources/runtime.ts` and `src/resources/index.ts`
- [x] T002 [P] Add runtime backend integration test file in `tests/integration/runtime-backend.test.ts`
- [x] T003 [P] Add runtime backend contract notes to `README.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core runtime server primitives required by all user stories.

- [x] T004 Write failing route contract tests for runtime health and unsupported frame routes in `tests/integration/runtime-backend.test.ts`
- [x] T005 Implement runtime HTTP server skeleton, JSON helpers, and unsupported frame routes in `src/backends/runtime/runtime-server.ts`
- [x] T006 Wire `runtime serve` CLI command to the server in `src/resources/runtime.ts` and `src/resources/index.ts`

**Checkpoint**: Runtime backend can start, report health, and return structured unsupported frame errors.

---

## Phase 3: User Story 1 - Start a Local Runtime Backend (Priority: P1) MVP

**Goal**: Start a local backend and use `WHISTLE_CLI_RUNTIME_URL` with existing runtime capture commands.

**Independent Test**: Start the backend against a fake Whistle Web API and run `captures find --backend runtime`.

### Tests for User Story 1

- [x] T007 [US1] Write failing integration test for `captures find --backend runtime` through the served runtime backend in `tests/integration/runtime-backend.test.ts`

### Implementation for User Story 1

- [x] T008 [US1] Implement capture source refresh and find filtering in `src/backends/runtime/runtime-server.ts`
- [x] T009 [US1] Verify `captures find --backend runtime` passes through existing `RuntimeClient` in `tests/integration/runtime-backend.test.ts`

**Checkpoint**: User Story 1 works independently.

---

## Phase 4: User Story 2 - Read and Stream Runtime Captures (Priority: P2)

**Goal**: Provide get/export/tail runtime capture routes.

**Independent Test**: Route tests call get/export/tail and assert deterministic JSON or NDJSON output.

### Tests for User Story 2

- [x] T010 [US2] Write failing integration tests for capture get/export/tail runtime routes in `tests/integration/runtime-backend.test.ts`

### Implementation for User Story 2

- [x] T011 [US2] Implement capture get/export/tail handlers in `src/backends/runtime/runtime-server.ts`
- [x] T012 [US2] Verify existing `captures get/export/tail --backend runtime` commands against the served backend in `tests/integration/runtime-backend.test.ts`

**Checkpoint**: User Story 2 works independently.

---

## Phase 5: User Story 3 - Compose and Replay Requests Through Runtime Backend (Priority: P3)

**Goal**: Execute compose and replay operations through runtime backend.

**Independent Test**: Fake upstream server receives compose/replay requests and backend returns structured response summaries.

### Tests for User Story 3

- [x] T013 [US3] Write failing integration tests for composer compose and replay runtime routes in `tests/integration/runtime-backend.test.ts`

### Implementation for User Story 3

- [x] T014 [US3] Implement compose and replay request execution in `src/backends/runtime/runtime-server.ts`
- [x] T015 [US3] Verify existing composer CLI commands against the served backend in `tests/integration/runtime-backend.test.ts`

**Checkpoint**: User Story 3 works independently.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, validation, and repository hygiene.

- [x] T016 Update `skills/whistle-cli/SKILL.md` with runtime backend startup guidance
- [x] T017 Update `README.md` with runtime backend command examples and frame-route limitation
- [x] T018 Run focused tests for runtime backend and affected capture/composer suites
- [x] T019 Run lint and TypeScript build
- [X] T020 Commit changes and prepare detailed PR body linked to the GitHub issue

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup completion and blocks all user stories.
- **User Story 1 (Phase 3)**: Depends on Foundational.
- **User Story 2 (Phase 4)**: Depends on Foundational and can reuse US1 capture normalization.
- **User Story 3 (Phase 5)**: Depends on Foundational and capture cache behavior for replay.
- **Polish (Phase 6)**: Depends on selected user stories being complete.

### Parallel Opportunities

- T002 and T003 can run in parallel.
- Documentation updates T016 and T017 can run after implementation stabilizes.

## Implementation Strategy

1. Deliver the MVP by completing Phases 1-3 so `captures find --backend runtime` works against a real served backend.
2. Add capture get/export/tail to complete runtime capture parity.
3. Add compose/replay execution.
4. Validate with focused integration tests, lint, and build before PR.
