# Contract: Resource Commands

## Purpose

Define the stable command surface that both humans and AI agents can rely on for `whistle-cli`.

## Global Command Shape

```text
whistle-cli <surface> <action> [options]
```

## Surfaces

### 1. Shortcut / Skill Surface

High-frequency, intent-shaped commands. These compile to resource commands.

Examples:

```text
whistle-cli rule set-header --match host=localhost:4001 --header env=prelease
whistle-cli mock reply --match POST:/save --status 200 --body-file ./fixtures/save.json
whistle-cli capture find --host api.example.com --keyword timeout
whistle-cli doctor https-capture
whistle-cli cert install --target local
```

### 2. Resource Surface

The canonical operational contract.

Supported top-level resources for v1:

- `instance`
- `rules`
- `values`
- `mocks`
- `captures`
- `certs`
- `proxy`
- `plugins`
- `doctor`

Examples:

```text
whistle-cli instance start
whistle-cli rules patch --ruleset default --intent set-header --match host=localhost:4001 --header env=prelease --preview
whistle-cli mocks create --name save-mock --match POST:/save --status 200 --body-file ./fixtures/save.json
whistle-cli captures find --host api.example.com --limit 30
whistle-cli certs verify --target local_system
whistle-cli proxy set --mode system --instance default
whistle-cli plugins install whistle.xxx
```

### 3. Mirror / Raw Surface

Compatibility and escape-hatch layer for long-tail Whistle coverage.

Examples:

```text
whistle-cli raw w2 start
whistle-cli raw w2 proxy 0
whistle-cli raw w2 ca
```

## Shared Flags

All resource commands should support the following shared flags where relevant:

- `--instance <name|id>`: Target instance. Defaults to the resolved current instance.
- `--format <json|pretty|table|ndjson>`: Output format. `json` is the canonical contract.
- `--preview`: Show planned mutation without applying it.
- `--apply`: Apply a mutation.
- `--verify`: Verify effective runtime behavior after apply.
- `--rollback <action-id>`: Revert a previously logged mutation when supported.
- `--non-interactive`: Fail instead of waiting for user action.

If `--rollback <action-id>` is provided for a supported resource, the command should execute rollback instead of its normal behavior.

## Resource Actions

### `instance`

- `start`
- `stop`
- `restart`
- `status`
- `list`
- `select`

### `rules`

- `list`
- `get`
- `patch`
- `apply`
- `verify`
- `enable`
- `disable`
- `import`
- `export`
- `rollback`

### `values`

- `list`
- `get`
- `set`
- `remove`
- `import`
- `export`
- `rollback`

### `mocks`

- `list`
- `create`
- `update`
- `enable`
- `disable`
- `delete`

### `captures`

- `find`
- `get`
- `tail`
- `diff`
- `export`

### `certs`

- `status`
- `install`
- `verify`
- `guide`

### `proxy`

- `status`
- `set`
- `off`
- `verify`

### `plugins`

- `list`
- `install`
- `uninstall`
- `enable`
- `disable`
- `inspect`

### `doctor`

- `instance-status`
- `proxy-routing`
- `https-capture`

## Command Semantics

### Mutating Commands

Mutating commands must follow `preview -> apply -> verify` semantics.

- `--preview` returns the intended change and verification plan.
- `--apply` commits the change and emits an action log entry.
- `--verify` checks runtime effectiveness and reports success, warning, or failure.

### Read Commands

Read commands must be side-effect free and return enough structured context for an AI to choose the next command without scraping terminal text.

### Flow Commands

Multi-step commands such as certificate installation or HTTPS diagnosis must expose their current step explicitly rather than hiding the workflow inside a blocking terminal session.
