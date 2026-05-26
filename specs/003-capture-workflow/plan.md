# Implementation Plan: Agent-Driven Capture Workflow Reliability

**Branch**: `003-capture-workflow` | **Date**: 2026-05-26 | **Spec**: [spec.md](specs/003-capture-workflow/spec.md)  
**Input**: Feature specification from `/specs/003-capture-workflow/spec.md`

## Summary

Improve `whistle-cli` capture workflows so agents can wait for newly triggered requests, extract high-signal identifiers immediately, avoid leaking sensitive headers, and follow a documented skill playbook. The technical approach is to extend existing capture services and commands with Web-backend polling, since filtering, request assertion, field projection, redaction, optional saved summaries, and updated skill guidance.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20 LTS  
**Primary Dependencies**: `commander`, `zod`, `execa`; existing Whistle Web and runtime backend clients  
**Storage**: Optional local filesystem output for redacted capture summaries  
**Testing**: `vitest` unit and integration tests with existing fake capture backend  
**Target Platform**: macOS and Linux CLI environments with local Whistle access  
**Project Type**: Single-project CLI with repository-distributed agent skill  
**Performance Goals**: Watch/assert command should find a matching Web-backend capture within one polling interval after Whistle exposes it; default polling should avoid excessive Whistle Web API load  
**Constraints**: Preserve current JSON/NDJSON envelope contracts; do not emit sensitive header values by default; runtime backend may be unavailable  
**Scale/Scope**: One CLI resource area (`captures`), capture domain models/services, tests, and `skills/whistle-cli/SKILL.md`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- `.specify/memory/constitution.md` remains an unratified placeholder template with no enforceable project-specific gates.
- Pre-design gate result: PASS with caveat (no active constitutional gates to violate).
- Post-design gate result: PASS (design stays within the existing CLI/resource architecture and adds no new package workspace).

## Project Structure

### Documentation (this feature)

```text
specs/003-capture-workflow/
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
├── cli/
├── domain/
│   ├── captures-model.ts
│   └── captures-service.ts
├── backends/
│   ├── runtime/
│   └── whistle-web/
├── resources/
│   └── captures.ts
└── output/

skills/
└── whistle-cli/
    └── SKILL.md

tests/
├── integration/
├── unit/
└── contract/
```

**Structure Decision**: Keep the existing single-project CLI architecture. Extend the `captures` domain/resource path and repository-owned skill content instead of introducing a new worker service or package.

## Phase 0: Research Summary

- Whistle Web polling is the required fallback because runtime capture APIs may be unavailable on local Whistle instances.
- Since filtering should be based on capture id snapshots where possible, because Whistle Web captures may not expose stable wall-clock timestamps through normalized records.
- Default capture summaries should be redacted and field-limited; raw capture access remains available through existing explicit export/get paths.
- `assert-request` should be a first-class command because agents need one success/timeout envelope, not a stream they must post-process.

## Phase 1: Design Outputs

- [research.md](specs/003-capture-workflow/research.md)
- [data-model.md](specs/003-capture-workflow/data-model.md)
- [contracts/captures-contract.md](specs/003-capture-workflow/contracts/captures-contract.md)
- [quickstart.md](specs/003-capture-workflow/quickstart.md)

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | N/A | N/A |
