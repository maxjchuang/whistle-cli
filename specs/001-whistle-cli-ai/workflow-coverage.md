# Workflow Coverage Matrix (Whistle → whistle-cli)

This document maps high-frequency workflows described in Whistle’s official README/docs (getting started, rules/values, network/capture, composer, plugins, mobile) to the stable `whistle-cli` command surface.

Legend:

- **Covered**: doable end-to-end via resource/shortcut commands.
- **Partial**: some steps are guided/manual, or only best-effort verification exists.
- **Raw**: supported via `whistle-cli raw w2 ...` escape hatch (not a stable contract).
- **Out of scope (v1)**: intentionally not promised.

## Coverage

| Official workflow area | Typical user goal | whistle-cli mapping (preferred) | Status | Notes / limitations |
|---|---|---|---|---|
| Install / prerequisites | Confirm Whistle tooling is available | `raw w2 status` | Raw | Resource commands that depend on `w2` may return `UNSUPPORTED_OPERATION` if `w2` is missing. |
| Start instance | Start a local Whistle instance | `instance start` | Covered | Use `--instance <name|id>` to target a non-default instance. |
| Stop / restart instance | Stop or restart Whistle | `instance stop`, `instance restart` | Covered | Designed for local-first; remote control is not a v1 guarantee. |
| Instance discovery | List/select which instance to operate on | `instance list`, `instance select` | Covered | “Current instance” resolution is shared across all resources. |
| Access Web UI | Find the local UI address | `instance status` | Covered | Reports host/port and (when known) the UI URL as data; does not open a browser. |
| System proxy routing | Point OS proxy at Whistle | `proxy set --preview|--apply|--verify` | Partial | Some platforms require manual steps/permissions; blocked flows may be returned with next actions. |
| Turn proxy off | Remove Whistle from OS proxy | `proxy off --preview|--apply|--verify` | Partial | Same permission caveats as `proxy set`. |
| Verify proxy routing | Confirm traffic is routed via Whistle | `proxy verify`, `doctor proxy-routing` | Partial | “Verify” is best-effort (depends on platform and available signals). |
| HTTPS CA material | Generate / locate Root CA | `certs install --preview|--apply` | Covered | Material generation is automated; trust is not. |
| Trust Root CA (desktop) | Fix HTTPS errors by trusting CA | `certs guide`, `certs verify`, `doctor https-capture` | Partial | Trust often requires manual steps; commands return blocked flows with guidance. |
| Rules authoring (common) | Add a safe rule change (e.g., set header, map local) | `rules patch --intent <...> --preview|--apply|--verify` | Covered | Mutations follow `preview → apply → verify`; verification checks effective behavior when feasible. |
| Rules enable/disable | Toggle a ruleset without deleting | `rules enable`, `rules disable` | Covered | Keeps rule content intact; status reflected in structured output. |
| Rules import/export | Move rules across machines | `rules import`, `rules export` | Covered | Uses Whistle storage artifacts; stable JSON envelope output. |
| Values management | Create/update values referenced by rules | `values set --preview|--apply`, `values get`, `values list` | Covered | Designed for AI-safe, targeted edits; supports rollback. |
| Values import/export | Sync values across setups | `values import`, `values export` | Covered | Same storage-driven approach as rules. |
| Mocking responses | Return canned response / override API | Shortcut: `rule map-local`, `rule set-response` (or `rules patch --intent ...`) | Covered | v1 does not expose a separate `mocks` resource; use rules/values intents instead. |
| Inspect recent traffic | Find recent requests by filters | `captures find --host ... --path ... --method ... --status ... --keyword ...` | Covered | Query semantics are best-effort recent-first, with clamped limits. |
| Inspect one capture | Load request/response evidence for a record | `captures get --id <capture-id>` | Covered | Output includes enough structured context for follow-up actions. |
| Live tail (stream) | Stream captures for active debugging | `captures tail --format ndjson` | Covered | Contract requires `ndjson` and event envelopes; suitable for agents. |
| Compare two captures | Diff evidence across two records | `captures diff --a <id> --b <id>` | Covered | Best-effort depending on available capture detail. |
| Export captures | Save capture set for offline analysis | `captures export --host ...` | Covered | Export format is stable JSON when possible. |
| Replay a request | Re-run a captured request | `composer replay --capture-id <id> --apply` | Partial | Runtime-oriented; `--verify` may only confirm backend acceptance. |
| Compose an edited request | Send a modified request | `composer compose --method ... --url ... --apply` | Partial | Same runtime caveat; focus is deterministic result envelopes. |
| WebSocket/TCP debugging | Inspect sessions and send frames | `frames list`, `frames send` | Partial | Depends on runtime backend availability and Whistle support. |
| Plugin install/update | Install or change plugin version | `plugins install <name[@version]> --preview|--apply|--verify` | Covered | Update is modeled via `install`; enable/disable state is preserved. |
| Plugin enable/disable | Toggle plugin lifecycle state | `plugins enable`, `plugins disable` | Covered | If backend can’t express enable/disable, returns a stable capability error. |
| Plugin inspect | Read plugin metadata/state | `plugins inspect <name>`, `plugins list` | Covered | v1 does not standardize plugin custom actions. |
| Diagnose common setup issues | Identify why HTTPS/proxy/capture isn’t working | `doctor instance-status`, `doctor proxy-routing`, `doctor https-capture` | Covered | Designed to produce typed errors + next actions rather than “log scraping”. |
| Escape hatch parity | Run an unsupported Whistle command | `raw w2 <args...>` | Raw | Exists for long-tail Whistle parity; not a stable contract surface. |
| Mobile device capture | Guide proxy + cert setup for phone | `certs guide`, `proxy set`, `doctor https-capture` | Partial | Requires LAN/access and device trust steps; `whistle-cli` guides but cannot fully automate. |
| Unified plugin custom actions | Invoke plugin-specific “commands” | (none) | Out of scope (v1) | Should return a typed `PLUGIN_CAPABILITY_UNAVAILABLE`/`UNSUPPORTED_OPERATION` style response if requested. |

## Notes for reviewers

- The stable contract surface for this matrix is defined in `specs/001-whistle-cli-ai/contracts/resource-commands.md`.
- The intended validation sequence that exercises the covered areas lives in `specs/001-whistle-cli-ai/quickstart.md`.
