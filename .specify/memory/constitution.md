<!--
Sync Impact Report
Version change: template -> 1.0.0
Modified principles:
- Added CLI-first user outcomes
- Added TypeScript type safety with explicit `any` forbidden
- Added observable capture behavior
- Added testable, reversible changes
- Added repository hygiene and release discipline
Added sections:
- Technology Constraints
- Development Workflow
Removed sections:
- Placeholder template sections
Templates requiring updates:
- .specify/templates/plan-template.md: reviewed; generic Constitution Check remains sufficient
- .specify/templates/spec-template.md: reviewed; no change required
- .specify/templates/tasks-template.md: reviewed; no change required
Follow-up TODOs: none
-->

# Whistle CLI Constitution

## Core Principles

### I. CLI-First User Outcomes
Every feature MUST expose its primary value through the command-line interface with deterministic input, structured output, and useful failure messages. Commands MUST support automation-friendly JSON or NDJSON when the behavior is consumed by agents or scripts. User-facing errors MUST include the actionable reason and next step when recovery is possible.

### II. Type Safety Without Explicit `any`
TypeScript source and tests MUST NOT use explicit `any`. ESLint MUST enforce `@typescript-eslint/no-explicit-any` as an error, and project code MUST NOT introduce overrides or suppressions that let explicit `any` pass lint. External data MUST enter the system as `unknown`, `Record<string, unknown>`, narrow interfaces, generics, or validated domain models before use.

### III. Observable Capture Behavior
Proxy, capture, rule, certificate, and plugin workflows MUST return enough structured evidence for an agent to decide whether the requested operation happened. Capture features MUST prefer precise filters, bounded watch windows, redaction of sensitive headers, and clear classifications over broad or ambiguous matching.

### IV. Testable And Reversible Changes
State-changing operations MUST support preview/apply/verify semantics when feasible. Mutations that alter local Whistle state SHOULD record rollback handles or document why rollback is not possible. New behavior MUST include focused unit or integration tests when it touches shared contracts, command output, rollback, or capture matching.

### V. Repository Hygiene And Release Discipline
Changes MUST stay scoped to the active Speckit feature unless the user explicitly requests a cross-cutting correction. Generated artifacts, logs, and snapshots MUST NOT leak sensitive or organization-specific identifiers into tracked code or tests. Before commit, the project MUST pass lint and TypeScript build; broader tests are required when the change affects runtime behavior.

## Technology Constraints

The project is a Node.js and TypeScript CLI. Implementation SHOULD reuse existing services, models, and output envelopes before adding new abstractions. Dynamic JSON from Whistle endpoints, filesystem state, or runtime backends MUST be narrowed at boundaries. Network and filesystem operations MUST preserve existing error envelope conventions.

## Development Workflow

For feature work, follow the active Speckit specification and plan under `specs/`. Constitution checks in plans MUST call out violations before implementation begins and be re-checked after design. Commits SHOULD be small enough to explain one intent, and dedicated cleanup work, such as restoring type-safety gates, MUST be committed separately from feature behavior.

## Governance

This constitution supersedes conflicting local practices. Amendments require updating this file, recording the version impact in the Sync Impact Report, and reviewing affected Speckit templates or active plans. Pull requests and commits MUST verify the applicable principles, especially the explicit `any` lint gate, before merge or push.

**Version**: 1.0.0 | **Ratified**: 2026-05-26 | **Last Amended**: 2026-05-26
