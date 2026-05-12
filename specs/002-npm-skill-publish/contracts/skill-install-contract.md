# Contract: Skill Installation And Agent Usage

## Purpose

Define how `whistle-cli` skill is packaged, installed, and used by agents in v1.

## Install Contract

- Skill source path is repository-defined (single canonical location).
- Public installation method is `skills add https://github.com/maxjchuang/whistle-cli --skill whistle-cli`.
- Development installation method is local-directory installation.
- Documentation must include optional copy/link steps to global/default skill directory.
- `SKILL.md` must include `name` and `description` frontmatter for skill discovery.

## Compatibility Contract

- Skill and CLI are compatible only when major versions match.
- On mismatch, skill usage MUST fail early with explicit guidance.

## Agent Behavior Contract

- Agent should prioritize resource/shortcut commands over raw passthrough.
- Agent should parse structured output (`status`, `error.code`, `next_actions`, `effective`).
- Raw passthrough should be used only for unsupported operations.

## Verification Requirements

1. Fresh agent environment can install skill from the public GitHub repository.
2. Fresh agent environment can install skill from canonical local path.
3. Agent can run baseline flow: instance check -> mutation preview/apply/verify -> diagnostics.
4. Mismatched major versions are detected before workflow execution.
