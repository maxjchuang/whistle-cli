# Implementation Plan: NPM And Skill Distribution

**Branch**: `002-npm-skill-publish` | **Date**: 2026-05-05 | **Spec**: [spec.md](specs/002-npm-skill-publish/spec.md)
**Input**: Feature specification from `/specs/002-npm-skill-publish/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Publish `whistle-cli` as an installable npm package and ship a repository-distributed skill that lets AI agents use the CLI consistently. The skill must be installable from the public GitHub repository via `skills add https://github.com/maxjchuang/whistle-cli --skill whistle-cli` and from a local checkout. The plan focuses on release readiness, version compatibility policy (CLI/skill same major only), install/upgrade guidance, and verification gates that prove package and skill usability in clean environments.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20 LTS  
**Primary Dependencies**: `commander`, `zod`, `execa` (runtime), npm registry tooling for distribution  
**Storage**: Local filesystem artifacts for skill package and release verification records  
**Testing**: `vitest` plus install/packaging smoke verification scripts  
**Target Platform**: macOS and Linux (CLI runtime), agent environments with local command execution  
**Project Type**: Single-project CLI with distributable skill assets  
**Performance Goals**: Package install + `whistle-cli --help` runnable within 10 minutes for first-time users; release verification script completes within 5 minutes in CI-like local run  
**Constraints**: v1 distribution channels fixed to npm public registry (CLI), GitHub repository skill installation, and repository-defined local path installation (skill); CLI/skill major versions must match
**Scale/Scope**: One public package, one skill package path, and one release checklist for each version

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- `.specify/memory/constitution.md` is still an unratified placeholder template with no enforceable principles.
- Pre-design gate result: PASS with caveat (no active constitutional gates to violate).
- Post-design gate result: PASS (no additional architecture complexity beyond current single-project layout).

## Project Structure

### Documentation (this feature)

```text
specs/002-npm-skill-publish/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── npm-release-contract.md
│   └── skill-install-contract.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── cli/
├── resources/
├── shortcuts/
├── output/
└── shared/

scripts/

skills/
└── whistle-cli/
    └── SKILL.md

tests/
├── integration/
├── contract/
└── unit/
```

**Structure Decision**: Keep the existing single-project CLI architecture. Add a repository-owned skill directory (for installable agent skill artifacts) and release verification scripts under `scripts/` without introducing a separate package workspace.

## Phase 0: Research Summary

- npm distribution in this feature should include package metadata hardening (`private` removal, files whitelist, bin entry validation) and publish-time verification.
- Skill distribution is repository-backed in v1, so installation contract must define the public GitHub install command, deterministic local source path, and guidance for copying/linking into agent global directories.
- Compatibility policy is strict major-match between CLI and skill versions; mismatch should fail early with explicit guidance.
- Release verification must combine package-level install checks and skill-level agent workflow checks.

## Phase 1: Design Outputs

- [research.md](specs/002-npm-skill-publish/research.md)
- [data-model.md](specs/002-npm-skill-publish/data-model.md)
- [quickstart.md](specs/002-npm-skill-publish/quickstart.md)
- [contracts/npm-release-contract.md](specs/002-npm-skill-publish/contracts/npm-release-contract.md)
- [contracts/skill-install-contract.md](specs/002-npm-skill-publish/contracts/skill-install-contract.md)

## Post-Design Constitution Check

- No constitutional conflicts identified (constitution remains template-only).
- Design remains within current repository scope and avoids unnecessary multi-package decomposition.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | N/A | N/A |
