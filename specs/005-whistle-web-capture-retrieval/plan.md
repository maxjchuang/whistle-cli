# Implementation Plan: Whistle Web Capture Retrieval

**Branch**: `005-whistle-web-capture-retrieval` | **Date**: 2026-05-28 | **Spec**: [spec.md](spec.md)  
**Input**: Feature specification from `/specs/005-whistle-web-capture-retrieval/spec.md`

## Summary

Improve Whistle Web capture automation by making the backend symmetric for the workflows already supported by `find/assert`: add exact capture retrieval by id, JSON export with filters, and one-header extraction. The technical approach is to extend `CapturesService` with Whistle Web get/export/header paths backed by existing `/cgi-bin/get-data` reads and update the captures CLI to accept `whistle-web` for get/export plus a new `get-header` command.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20 LTS  
**Primary Dependencies**: Existing `commander`, `zod`, Node runtime, existing Whistle Web client  
**Storage**: N/A; reads recent Whistle Web capture window only  
**Testing**: Vitest integration tests with existing fake Whistle Web backend  
**Target Platform**: macOS and Linux CLI environments  
**Project Type**: Single-project TypeScript CLI  
**Performance Goals**: Whistle Web get/export/header should complete within one `get-data` request for fixture-scale data; lookup window uses bounded `dumpCount`  
**Constraints**: Preserve JSON/NDJSON envelope contracts; no explicit `any`; keep `assert-request` redacted; explicit get/get-header/export may return captured header values; runtime backend behavior must not regress  
**Scale/Scope**: Capture domain service, capture CLI resource, tests, README, and repository skill guidance

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- CLI-first outcomes: PASS. The feature exposes primary value through `captures get`, `captures export`, and `captures get-header`.
- Type safety without explicit `any`: PASS. External Whistle Web payloads remain `unknown`/narrowed normalized records.
- Observable capture behavior: PASS. Exact id lookup and one-header extraction improve automation evidence.
- Testable and reversible changes: PASS. The feature is read-only and will include focused integration tests.
- Repository hygiene and release discipline: PASS. Scope is limited to active Spec Kit feature and verification includes lint/build/tests.

Post-design gate result: PASS. The design stays within existing capture service/resource architecture and does not introduce new dependencies.

## Project Structure

### Documentation (this feature)

```text
specs/005-whistle-web-capture-retrieval/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── captures-contract.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── domain/
│   ├── captures-model.ts
│   └── captures-service.ts
├── resources/
│   └── captures.ts
└── backends/
    └── whistle-web/

tests/
└── integration/
    ├── us3-captures.test.ts
    └── us3-captures.fixtures.ts
```

**Structure Decision**: Extend existing capture domain/resource paths. Avoid new backend abstractions because Whistle Web capture reads already exist in `CapturesService.findViaWhistleWeb`.

## Phase 0: Research Summary

- Use one bounded `/cgi-bin/get-data` read for Whistle Web exact lookup and export to keep behavior aligned with existing find/assert paths.
- Match capture ids by Whistle Web map key and common in-record id fields to support records that omit explicit `id`.
- Add a dedicated `get-header` command rather than adding unsafe/allowlist flags to `get`; it returns only the requested header and avoids printing unrelated headers.
- Do not add sensitive-header special casing for explicit retrieval commands; user confirmed this would reduce tool usefulness.

## Phase 1: Design Outputs

- [research.md](research.md)
- [data-model.md](data-model.md)
- [contracts/captures-contract.md](contracts/captures-contract.md)
- [quickstart.md](quickstart.md)

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --------- | ---------- | ------------------------------------ |
| None      | N/A        | N/A                                  |
