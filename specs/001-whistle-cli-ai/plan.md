# Implementation Plan: Whistle AI CLI

**Branch**: `001-whistle-cli-ai` | **Date**: 2026-04-28 | **Spec**: [spec.md](specs/001-whistle-cli-ai/spec.md)
**Input**: Feature specification from `/specs/001-whistle-cli-ai/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Build a local-first, AI-friendly CLI over Whistle that covers nearly the full operational surface without depending on the Web UI as the primary control plane. The implementation will use a semantic facade over existing Whistle mechanisms: a TypeScript CLI on Node.js 20, structured around three entry layers (`shortcuts`, `resource commands`, `mirror/raw`), backed by `w2` subprocess execution, Whistle-owned persisted state, and targeted runtime access for captures and replay-heavy workflows. The core implementation emphasis for v1 is deterministic JSON output, preview/apply/verify mutation semantics, typed errors, and guided flows for certificates and proxy setup.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20 LTS  
**Primary Dependencies**: `commander` for command surface, `zod` for typed contracts/validation, `execa` for `w2` subprocess orchestration, Node built-ins for filesystem/state access  
**Storage**: Whistle-managed local storage for rules/values/runtime state plus a whistle-cli-owned local state directory for action history, previews, rollback handles, and flow checkpoints  
**Testing**: `vitest` for unit and contract tests, real-instance integration tests against local `whistle` / `w2` flows  
**Target Platform**: macOS desktop first; Linux headless second; Windows compatibility should remain possible but is not the primary validation target  
**Project Type**: Single-project CLI with AI-oriented shortcut surface over resource commands  
**Performance Goals**: Read/status commands return within 1 second p95 on a local machine; preview generation within 2 seconds p95; verification-oriented writes complete within 5 seconds unless explicitly blocked by user action; capture queries over recent local sessions return actionable summaries within 3 seconds for normal debug windows  
**Constraints**: Must treat existing Whistle mechanisms as the source of truth in v1; must not depend on the Web UI for primary automation; must expose deterministic JSON and typed errors; must support preview/apply/verify for high-value mutations; must keep manual certificate/proxy steps explicit when automation is impossible  
**Scale/Scope**: Single local developer, one to a few local Whistle instances, hundreds to low-thousands of recent sessions in active inspection, no multi-tenant remote control plane in v1

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- `.specify/memory/constitution.md` is still the default placeholder template and does not define any ratified principles or enforceable gates.
- Result before Phase 0: PASS with caveat. There are no active constitutional constraints to violate, so the plan proceeds using the feature spec and documented research decisions as the operative guidance.
- Result after Phase 1 design: PASS. The resulting plan stays within a single-project CLI architecture and avoids unjustified complexity spikes.

## Project Structure

### Documentation (this feature)

```text
specs/001-whistle-cli-ai/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── cli/
├── shortcuts/
├── resources/
├── backends/
│   ├── raw/
│   ├── storage/
│   └── runtime/
├── domain/
├── doctor/
├── output/
└── shared/

tests/
├── contract/
├── integration/
└── unit/
```

**Structure Decision**: Use a single-project CLI layout. The repository is currently an empty feature skeleton, so the plan establishes the target source tree around the semantic facade architecture chosen in research:

- `src/cli`: argument parsing, command registration, format negotiation
- `src/shortcuts`: AI/human high-frequency entrypoints such as `rule set-header`, `doctor https`
- `src/resources`: stable resource commands for instances, rules, captures, certs, proxy, plugins
- `src/backends/raw`: `w2` subprocess adapter
- `src/backends/storage`: persisted Whistle state adapter
- `src/backends/runtime`: runtime/session/replay adapter
- `src/domain`: preview/apply/verify orchestration and resource services
- `src/doctor`: diagnostics and guided flows
- `src/output`: JSON envelopes, renderers, and error contracts
- `src/shared`: config, logging, utilities, instance resolution
- `tests/contract`: stable machine-readable CLI response tests
- `tests/integration`: end-to-end flows against a real local Whistle installation
- `tests/unit`: mappers, validators, and planning logic

## Phase 0: Research Summary

- `whistle` is currently published on npm as version `2.10.2` and exposes `whistle`, `w2`, and `wproxy` binaries from one package.
- Official Whistle materials confirm the core surface needed by this feature: lifecycle, CA/proxy setup, rules, values, network capture, composer-like replay/editing, plugins, and mobile/headless usage.
- The prior CLI design discussion resolved the key product/architecture questions:
  - local-first individual developer debugging is the primary use case
  - semantic facade (`Approach 2`) is the preferred CLI shape
  - implementation should still ride on existing Whistle mechanisms for v1
  - the product should mirror a lightweight operational CLI structurally, but with Whistle-specific capture and diagnosis depth
  - plugin capability standardization is deferred, though the architecture should reserve the contract

## Phase 1: Design Outputs

- [research.md](specs/001-whistle-cli-ai/research.md)
- [data-model.md](specs/001-whistle-cli-ai/data-model.md)
- [quickstart.md](specs/001-whistle-cli-ai/quickstart.md)
- [contracts/resource-commands.md](specs/001-whistle-cli-ai/contracts/resource-commands.md)
- [contracts/output-contract.md](specs/001-whistle-cli-ai/contracts/output-contract.md)

## Post-Design Constitution Check

- The design remains a single-project CLI and does not introduce speculative subsystems beyond what the feature needs.
- Whistle-specific complexity is contained in shared mechanisms (`preview/apply/verify`, `doctor/guide`, `interactive flow`) rather than inflated into independent product silos.
- The plan preserves a deterministic non-AI core (`resource commands`) underneath the AI-facing shortcut surface.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Three command layers (`shortcuts`, `resources`, `raw`) | The feature must serve both AI-first workflows and full Whistle coverage | A thin `w2` wrapper is easier, but too unstable and inconsistent as the control plane AI depends on |
