# Research: NPM And Skill Distribution

## Inputs Reviewed

- `specs/002-npm-skill-publish/spec.md`
- Current repository package/runtime layout (`package.json`, `src/cli`, `README.md`)
- Existing agent workflow expectations in project docs

## Decision 1: Publish CLI via npm public registry only in v1

- **Decision**: Use npm public registry as the only official CLI distribution channel for v1.
- **Rationale**: Minimizes release process branching and supports broad developer install patterns.
- **Alternatives considered**:
  - Private npm only: rejected due to lower adoption and extra access management.
  - Multi-channel release (npm + binary bundles): rejected for v1 complexity.

## Decision 2: Ship skill from repository-defined local directory

- **Decision**: Maintain a canonical skill source directory in repo and document local installation plus optional copy/link into global skill directories.
- **Rationale**: Keeps skill version tightly coupled to source control and review process.
- **Alternatives considered**:
  - Remote skill marketplace publishing first: deferred due to operational overhead.
  - User-chosen arbitrary path only: rejected because reproducibility suffers.

## Decision 3: Enforce major-version compatibility between CLI and skill

- **Decision**: Skill and CLI are compatible only when major versions match.
- **Rationale**: Simple mental model and strong guardrail against contract drift.
- **Alternatives considered**:
  - Fully loose compatibility: rejected due to runtime mismatch risk.
  - Exact version pinning: rejected due to unnecessary release friction.

## Decision 4: Add release verification gate before publish

- **Decision**: Require a deterministic release checklist that validates package installability, command availability, skill installability, and baseline agent workflow.
- **Rationale**: Prevents broken publish artifacts and ensures both human and agent usability.
- **Alternatives considered**:
  - Manual ad-hoc checks only: rejected due to inconsistency.
  - Post-publish validation only: rejected due to rollback risk.

## Decision 5: Keep distribution changes inside existing repo structure

- **Decision**: Avoid creating a monorepo/package split; add minimal docs/scripts/assets in current layout.
- **Rationale**: Scope is distribution + contract hardening, not architecture refactor.
- **Alternatives considered**:
  - Split CLI and skill into separate packages now: deferred until scale requires it.
