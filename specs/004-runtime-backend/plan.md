# Implementation Plan: Runtime Backend Server

**Branch**: `004-runtime-backend` | **Date**: 2026-05-26 | **Spec**: [spec.md](spec.md)  
**Input**: Feature specification from `/specs/004-runtime-backend/spec.md`

## Summary

Implement the missing `whistle-cli` runtime backend as a local CLI-managed HTTP service that exposes the `__whistle_cli__` routes already consumed by `RuntimeClient`. The backend will adapt capture data from Whistle's Web API, provide bounded runtime capture routes, execute compose/replay HTTP requests, return stable JSON errors for unsupported frame routes, and document how agents point `WHISTLE_CLI_RUNTIME_URL` at the service.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20 LTS  
**Primary Dependencies**: Existing `commander`, `zod`, Node `http`, Node `fetch`; no new runtime dependency planned  
**Storage**: In-memory capture cache only for runtime `get`/`replay` lookup during process lifetime  
**Testing**: Vitest unit and integration tests using existing fake Whistle Web backend and fake upstream HTTP servers  
**Target Platform**: macOS and Linux CLI environments  
**Project Type**: Single-project TypeScript CLI with local HTTP service mode  
**Performance Goals**: Capture find/export/tail should complete within one Whistle Web `get-data` request plus normalization for fixture-scale data; backend requests should use bounded timeouts  
**Constraints**: Preserve existing JSON/NDJSON output contracts; no explicit `any`; keep Whistle Web backend available; frame support is explicit unsupported behavior in this feature  
**Scale/Scope**: Runtime backend command, runtime server module, capture/composer adapters, tests, and docs/skill guidance

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- CLI-first outcomes: PASS. The feature adds `whistle-cli runtime serve` and preserves structured output.
- Type safety without explicit `any`: PASS. Runtime request bodies and external payloads will enter as `unknown` and be narrowed.
- Observable capture behavior: PASS. Capture routes normalize evidence and preserve filterable runtime behavior.
- Testable and reversible changes: PASS. Backend service mode is non-mutating except compose/replay outbound requests; tests cover route contracts.
- Repository hygiene and release discipline: PASS. Scope is confined to the active feature and verification will include focused tests, lint, and build.

Post-design gate result: PASS. Design keeps the runtime backend local and additive, leaves existing Whistle Web fallback in place, and documents unsupported frame routes.

## Project Structure

### Documentation (this feature)

```text
specs/004-runtime-backend/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── runtime-backend-contract.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── backends/
│   ├── runtime/
│   │   ├── runtime-client.ts
│   │   └── runtime-server.ts
│   └── whistle-web/
├── cli/
├── domain/
├── resources/
│   └── runtime.ts
└── output/

tests/
├── integration/
│   ├── runtime-backend.test.ts
│   └── us3-captures.fixtures.ts
└── unit/
```

**Structure Decision**: Keep the existing single-project CLI. Add `runtime-server.ts` beside `runtime-client.ts` because the module implements the server counterpart to the existing client contract. Add `resources/runtime.ts` for the CLI command registration, following existing resource command organization.

## Phase 0: Research Summary

- Implement runtime backend as a local CLI-managed HTTP service, not a Whistle plugin, for first delivery.
- Use Whistle Web `/cgi-bin/get-data` as the capture source to avoid requiring changes to Whistle or plugin installation.
- Keep frame routes explicit unsupported JSON responses until a later feature can access frame-level Whistle internals.
- Use Node `fetch` for compose/replay to avoid new dependencies and keep request execution bounded by timeout.

## Phase 1: Design Outputs

- [research.md](research.md)
- [data-model.md](data-model.md)
- [contracts/runtime-backend-contract.md](contracts/runtime-backend-contract.md)
- [quickstart.md](quickstart.md)

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --------- | ---------- | ------------------------------------ |
| None      | N/A        | N/A                                  |
