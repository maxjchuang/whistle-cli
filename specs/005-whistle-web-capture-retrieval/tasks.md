# Tasks: Whistle Web Capture Retrieval

**Input**: Design documents from `/specs/005-whistle-web-capture-retrieval/`  
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/
**GitHub Issue**: [#10](https://github.com/maxjchuang/whistle-cli/issues/10)

**Tests**: Required. This feature changes capture command behavior and output contracts.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add task tracking and identify capture test locations.

- [x] T001 Confirm existing capture integration test location in `tests/integration/us3-captures.test.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Add shared domain helpers for Whistle Web capture lookup and header extraction.

- [x] T002 Write failing integration tests for `captures get --backend whistle-web` and not-found behavior in `tests/integration/us3-captures.test.ts`
- [x] T003 Implement Whistle Web exact capture lookup in `src/domain/captures-service.ts`

**Checkpoint**: Whistle Web exact get works without changing export/header commands.

---

## Phase 3: User Story 1 - Retrieve Exact Whistle Web Capture By Id (Priority: P1) MVP

**Goal**: Retrieve exact capture by id using Whistle Web backend.

**Independent Test**: `assert-request --backend whistle-web` returns an id that `captures get --backend whistle-web --id` can retrieve.

### Tests for User Story 1

- [x] T004 [US1] Add assert-then-get Whistle Web integration test in `tests/integration/us3-captures.test.ts`

### Implementation for User Story 1

- [x] T005 [US1] Update `captures get` backend validation and service branching in `src/resources/captures.ts` and `src/domain/captures-service.ts`

**Checkpoint**: User Story 1 works independently.

---

## Phase 4: User Story 2 - Export Whistle Web Captures With Filters (Priority: P2)

**Goal**: Export filtered Whistle Web captures as JSON.

**Independent Test**: `captures export --backend whistle-web --host ... --path ...` returns matching records and rejects HAR.

### Tests for User Story 2

- [x] T006 [US2] Add Whistle Web export integration tests in `tests/integration/us3-captures.test.ts`

### Implementation for User Story 2

- [x] T007 [US2] Implement Whistle Web JSON export and HAR rejection in `src/domain/captures-service.ts` and `src/resources/captures.ts`

**Checkpoint**: User Story 2 works independently.

---

## Phase 5: User Story 3 - Extract One Header From Exact Capture (Priority: P3)

**Goal**: Return one explicitly requested header by capture id.

**Independent Test**: `captures get-header --backend whistle-web --id <id> --header cookie` returns only the cookie header value.

### Tests for User Story 3

- [x] T008 [US3] Add get-header integration tests for success, case-insensitive lookup, and missing header in `tests/integration/us3-captures.test.ts`

### Implementation for User Story 3

- [x] T009 [US3] Add capture header extraction service method in `src/domain/captures-service.ts`
- [x] T010 [US3] Add `captures get-header` CLI command in `src/resources/captures.ts`

**Checkpoint**: User Story 3 works independently.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, skill guidance, and verification.

- [x] T011 Update Whistle Web retrieval docs in `README.md`
- [x] T012 Update capture workflow guidance in `skills/whistle-cli/SKILL.md`
- [x] T013 Run focused capture tests in `tests/integration/us3-captures.test.ts`
- [X] T014 Run lint, TypeScript build, and full test suite
- [X] T015 Commit changes and open PR linked to issue #10

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Blocks user stories.
- **User Story 1 (Phase 3)**: Depends on exact lookup helper.
- **User Story 2 (Phase 4)**: Depends on Whistle Web filtered read helper.
- **User Story 3 (Phase 5)**: Depends on exact lookup helper.
- **Polish (Phase 6)**: Depends on implemented stories.

### Parallel Opportunities

- Documentation updates T011 and T012 can run after command behavior stabilizes.

## Implementation Strategy

1. Implement exact Whistle Web get first as MVP.
2. Add JSON export using the same filtered read path.
3. Add get-header as a focused extraction command.
4. Verify runtime backend behavior remains compatible.
