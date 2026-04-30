# Quickstart: Whistle AI CLI

## Goal

Stand up the first implementation slice of `whistle-cli` so it can:

1. Operate a local Whistle instance
2. Preview/apply/verify rule and values changes
3. Query/analyze captures and replay/compose requests
4. Guide certificate and proxy setup
5. Manage plugin lifecycle

## Prerequisites

- Node.js 20 LTS installed
- `whistle` / `w2` available locally for full lifecycle/proxy/plugin operations
  - Example install: `npm i -g whistle` (provides `w2`)
- A local development machine with a running or runnable Whistle instance

Notes:

- If `w2` is not on `PATH`, commands like `instance/*`, `proxy/*`, and `plugins/*` will return `UNSUPPORTED_OPERATION`.
- `certs status/guide` can still run without `w2` (best-effort).

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
3. `rules patch/apply/verify` + `rules rollback`
4. `values set/remove/import/export` + `values rollback`
5. `captures find/get/tail/diff/export`
6. `composer replay/compose`
7. `frames list/send`
8. `certs status/guide/install/verify`
9. `proxy status/set/off/verify`
10. `plugins list/install/uninstall/enable/disable/inspect`
11. `doctor https-capture/proxy-routing/instance-status`
12. `raw w2 ...` escape hatch

## Validation Sequence

After the first slice is implemented, verify the feature in this order:

1. `instance status` returns structured JSON for a stopped and running instance.
2. `rules patch` returns a deterministic plan without mutating Whistle state.
3. `rules apply --verify` confirms the rule is live, not just persisted.
4. `values set --preview/--apply` produces a rollbackable values mutation.
5. `captures find` returns filtered recent sessions and summarises HTTP evidence.
6. `composer replay/compose` return typed outputs for replay/edited requests.
7. `plugins install/enable/disable/uninstall` produce action ids and support `--rollback <action-id>`.
8. `certs verify` and `proxy verify` return explicit blocked states when user action is required.
7. `doctor https-capture` classifies at least the common failure modes:
   - Whistle not running
   - CA missing or not trusted
   - Proxy not routed to the selected instance

## Example Target Commands

These are the target v1 commands to validate against:

```bash
whistle-cli instance status --format json
whistle-cli rules patch --id main --file ./patch.txt --mode replace --format json
whistle-cli rules apply --id main --file ./patch.txt --verify --format json
whistle-cli values set --key demo --value 'hello' --apply --format json
whistle-cli captures find --host localhost:4001 --limit 20 --format json
whistle-cli composer replay --capture-id cap_1 --apply --format json
whistle-cli frames list --session-id s1 --format json
whistle-cli certs install --apply --format json
WHISTLE_CLI_PROXY_MODE=system whistle-cli proxy set --verify --apply --format json
whistle-cli plugins install whistle.test@1.2.3 --apply --format json
whistle-cli doctor https-capture --format json
whistle-cli raw w2 status --format json
```

Tip (dev mode):

```bash
# run without building dist/
npm run dev -- --format json certs status
```

## Exit Criteria For This Plan

- The structured resource layer exists and is testable without AI.
- Shortcut commands compile to resource commands instead of bypassing them.
- Mutating commands share `preview/apply/verify`.
- Errors and blocked flows are stable enough for AI orchestration.
