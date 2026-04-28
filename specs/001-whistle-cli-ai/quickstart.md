# Quickstart: Whistle AI CLI

## Goal

Stand up the first implementation slice of `whistle-cli` so it can:

1. Operate a local Whistle instance
2. Preview/apply/verify rule and mock changes
3. Query and analyze captures
4. Guide certificate and proxy setup

## Prerequisites

- Node.js 20 LTS installed
- `whistle` available locally for integration testing
  - Example install: `npm i -g whistle`
- A local development machine with a running or runnable Whistle instance

## Project Bootstrap

1. Initialize a Node + TypeScript CLI package in the repo root.
2. Add the initial dependency set:
   - runtime: `commander`, `zod`, `execa`
   - dev: `typescript`, `tsx`, `vitest`, `@types/node`
3. Scaffold the first source layout:

```text
src/
├── cli/
├── shortcuts/
├── resources/
├── backends/
├── domain/
├── doctor/
├── output/
└── shared/
```

4. Scaffold the first test layout:

```text
tests/
├── unit/
├── contract/
└── integration/
```

## First Implementation Slice

Deliver the following in order:

1. `instance status/start/stop/restart`
2. shared JSON output envelope and typed error model
3. `rules patch/apply/verify`
4. `mocks create/enable/disable/delete`
5. `captures find/get/tail`
6. `certs status/install/verify`
7. `proxy status/set/off/verify`
8. `doctor https-capture/proxy-routing/instance-status`
9. `raw w2 ...` escape hatch

## Validation Sequence

After the first slice is implemented, verify the feature in this order:

1. `instance status` returns structured JSON for a stopped and running instance.
2. `rules patch --preview` returns a deterministic preview without mutating Whistle state.
3. `rules apply --verify` confirms the rule is live, not just persisted.
4. `mocks create` produces a mock resource that can be enabled and disabled cleanly.
5. `captures find` can return filtered recent sessions and summarize HTTP evidence.
6. `certs verify` and `proxy verify` return explicit blocked states when user action is required.
7. `doctor https-capture` classifies at least the common failure modes:
   - Whistle not running
   - CA missing or not trusted
   - Proxy not routed to the selected instance

## Example Target Commands

These are the target v1 commands to validate against:

```bash
whistle-cli instance status --format json
whistle-cli rules patch --ruleset default --intent set-header --match host=localhost:4001 --header env=prelease --preview
whistle-cli rules apply --ruleset default --verify --format json
whistle-cli mock reply --match POST:/save --status 200 --body-file ./fixtures/save.json --format json
whistle-cli captures find --host localhost:4001 --limit 20 --format json
whistle-cli cert install --target local --format json
whistle-cli proxy set --mode system --instance default --verify --format json
whistle-cli doctor https-capture --format json
whistle-cli raw w2 status --format json
```

## Exit Criteria For This Plan

- The structured resource layer exists and is testable without AI.
- Shortcut commands compile to resource commands instead of bypassing them.
- Mutating commands share `preview/apply/verify`.
- Errors and blocked flows are stable enough for AI orchestration.
