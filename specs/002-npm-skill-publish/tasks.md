# Tasks: NPM And Skill Distribution

**Input**: Design documents from `/specs/002-npm-skill-publish/`  
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Include release verification and smoke validation tasks because the feature explicitly requires release readiness gates (FR-010, SC-004).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Single project paths at repository root
- CLI code: `src/`
- Release/validation scripts: `scripts/`
- Skill artifacts: `skills/whistle-cli/`
- Tests: `tests/`

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish release/skill artifact scaffolding and baseline metadata targets.

- [X] T001 Create skill artifact directory and initial placeholder files in `skills/whistle-cli/SKILL.md` and `skills/whistle-cli/README.md`
- [X] T002 Create release validation script scaffold in `scripts/release-verify.sh`
- [X] T003 [P] Create skill installation helper script scaffold in `scripts/install-skill.sh`
- [X] T004 [P] Add release notes template scaffold in `docs/release-notes-template.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build shared release infrastructure that all user stories depend on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T005 Update package publish metadata for public npm distribution in `package.json` (`private`, `files`, `bin`, `engines`, `repository`, `keywords`)
- [X] T006 Add npm packaging sanity checks and scripts in `package.json` (`prepublishOnly`, `release:verify`, `release:dry-run`)
- [X] T007 Implement shared release check helpers in `scripts/release-lib.sh`
- [X] T008 Implement major-version compatibility validator for CLI/skill in `scripts/check-compatibility.sh` (define exit codes + concise mismatch message)
- [X] T009 [P] Add release verification record schema and sample output file in `specs/002-npm-skill-publish/contracts/release-verification-record.json`
- [X] T010 [P] Add CI-oriented usage docs for release scripts in `docs/release-workflow.md`

**Checkpoint**: Foundation ready - user story implementation can now begin.

---

## Phase 3: User Story 1 - Publish Installable CLI Package (Priority: P1) 🎯 MVP

**Goal**: Publish `whistle-cli` to npm public registry and ensure clean install usability.

**Independent Test**: Install from npm in a clean environment and run `whistle-cli --help` + one JSON command successfully.

### Implementation for User Story 1

- [X] T011 [US1] Remove publish blocking flags and finalize package identity for public registry in `package.json`
- [X] T012 [US1] Add explicit package file whitelist and dist/runtime inclusion rules in `package.json`
- [X] T013 [US1] Implement end-to-end release verification flow (build/test/pack/install smoke + optional upgrade verification mode via `RELEASE_VERIFY_UPGRADE=1` + `RELEASE_VERIFY_FROM_VERSION=<semver>`; define stable exit codes) in `scripts/release-verify.sh`
- [X] T014 [P] [US1] Add dry-run publish helper command flow in `scripts/release-dry-run.sh`
- [X] T015 [US1] Add post-install smoke command checks in `scripts/release-verify.sh` for `whistle-cli --help` and `--format json instance status`
- [X] T016 [P] [US1] Document npm public install and upgrade instructions in `README.md`
- [X] T017 [US1] Add npm publish and rollback guidance for failed verification in `docs/release-workflow.md`
- [X] T018 [US1] Add integration smoke test for packaged CLI artifact install flow in `tests/integration/release-package-smoke.test.ts`

**Checkpoint**: User Story 1 is publishable and independently verifiable.

---

## Phase 4: User Story 2 - Install Skill For Agent Workflows (Priority: P1)

**Goal**: Provide an installable repository-local skill with deterministic agent behavior rules.

**Independent Test**: Install skill from canonical local path in a clean agent environment and complete baseline workflow through agent-invoked CLI commands.

### Implementation for User Story 2

- [X] T019 [US2] Author production skill contract and usage rules in `skills/whistle-cli/SKILL.md`
- [X] T020 [US2] Document canonical local install path and copy/link to global skill directory in `skills/whistle-cli/README.md`
- [X] T021 [US2] Implement skill installation helper script from repository path in `scripts/install-skill.sh`
- [X] T022 [P] [US2] Add agent workflow examples (resource-first, raw fallback, error handling) in `skills/whistle-cli/SKILL.md`
- [X] T023 [US2] Add compatibility failure guidance messaging in `skills/whistle-cli/README.md`
- [X] T024 [US2] Add skill install verification test script in `scripts/verify-skill-install.sh`
- [X] T025 [P] [US2] Add integration test for baseline agent workflow command sequence in `tests/integration/skill-agent-workflow-smoke.test.ts`
- [X] T026 [US2] Update top-level docs to reference skill install entrypoint in `README.md`

**Checkpoint**: User Story 2 can be installed and executed independently.

---

## Phase 5: User Story 3 - Versioned Release And Upgrade Guidance (Priority: P2)

**Goal**: Enforce CLI/skill major-version compatibility and provide clear upgrade guidance.

**Independent Test**: Validate same-major success and mismatched-major rejection with explicit remediation guidance.

### Implementation for User Story 3

- [X] T027 [US3] Finalize compatibility validator contract (inputs/outputs + messaging) and align it with `docs/release-workflow.md` + `skills/whistle-cli/README.md` (no new validator implementation beyond T008)
- [X] T028 [US3] Integrate compatibility gate into release verification pipeline in `scripts/release-verify.sh`
- [X] T029 [US3] Integrate compatibility gate into skill install helper in `scripts/install-skill.sh`
- [X] T030 [P] [US3] Add upgrade path documentation + compatibility matrix + how to run upgrade verification mode (`RELEASE_VERIFY_UPGRADE`, `RELEASE_VERIFY_FROM_VERSION`, expected exit codes) in `docs/release-workflow.md`
- [X] T031 [P] [US3] Add user-facing mismatch error examples and fixes in `skills/whistle-cli/README.md`
- [X] T032 [US3] Add automated tests for compatible and incompatible major-version combinations in `tests/integration/compatibility-gate.test.ts`
- [X] T033 [US3] Add release notes requirements for breaking changes and migration steps in `docs/release-notes-template.md`

**Checkpoint**: Versioned release flow and compatibility behavior are independently testable.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Close cross-story quality and operational readiness.

- [X] T034 [P] Add final release checklist document for maintainers in `docs/release-checklist.md`
- [X] T035 Validate quickstart flow end-to-end and align command examples in `specs/002-npm-skill-publish/quickstart.md`
- [X] T036 [P] Ensure contracts and implementation docs are consistent across `README.md`, `docs/release-workflow.md`, and `skills/whistle-cli/README.md`
- [X] T037 Run full verification (`npm run build`, `npm run test`, `npm run release:verify`) and record outcomes in `specs/002-npm-skill-publish/contracts/release-verification-record.json`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup completion; blocks all stories.
- **User Stories (Phase 3+)**: Depend on Foundational completion.
- **Polish (Phase 6)**: Depends on all required stories being complete.

### User Story Dependencies

- **US1 (P1)**: Starts after Phase 2; no dependency on other user stories.
- **US2 (P1)**: Starts after Phase 2; can run in parallel with US1 except shared docs/scripts merge points.
- **US3 (P2)**: Starts after US1 and US2 core scripts exist (`release-verify.sh`, `install-skill.sh`) because it extends both with compatibility gating.

### Within Each User Story

- Core scripts before docs that reference their behavior.
- Verification tests after scripts are executable.
- Story checkpoint must pass before moving to dependent story.

### Parallel Opportunities

- Setup tasks marked [P] can run concurrently.
- Foundational documentation/schema tasks marked [P] can run concurrently.
- US1 and US2 can run largely in parallel after Phase 2.
- Documentation tasks in US3 marked [P] can run while compatibility script wiring is in progress.

---

## Parallel Example: User Story 1

```bash
# Parallelizable tasks in US1:
Task: "Add dry-run publish helper command flow in scripts/release-dry-run.sh"
Task: "Document npm public install and upgrade instructions in README.md"
```

## Parallel Example: User Story 2

```bash
# Parallelizable tasks in US2:
Task: "Add agent workflow examples in skills/whistle-cli/SKILL.md"
Task: "Add integration test for baseline agent workflow in tests/integration/skill-agent-workflow-smoke.test.ts"
```

## Parallel Example: User Story 3

```bash
# Parallelizable tasks in US3:
Task: "Add upgrade path documentation and compatibility matrix in docs/release-workflow.md"
Task: "Add user-facing mismatch examples in skills/whistle-cli/README.md"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 and Phase 2.
2. Implement Phase 3 (US1).
3. Validate npm installability and command smoke checks.
4. Demo/ship MVP distribution capability.

### Incremental Delivery

1. Deliver US1 (npm package distribution).
2. Deliver US2 (skill distribution and agent workflow contract).
3. Deliver US3 (version compatibility and upgrade policy).
4. Run final polish and verification gate before release.

### Parallel Team Strategy

1. One developer drives release script/package metadata (US1).
2. One developer drives skill assets/install flow (US2).
3. After both tracks stabilize, integrate compatibility policy (US3).

---

## Notes

- All tasks use strict checklist format: checkbox + ID + optional `[P]` + optional `[USx]` + clear file path.
- Avoid cross-story coupling outside declared dependencies.
- Keep release scripts deterministic for local and CI usage.
