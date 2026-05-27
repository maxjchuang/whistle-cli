# Research: Runtime Backend Server

## Decision: Implement a local CLI-managed backend process

**Rationale**: The repository already ships a CLI and `RuntimeClient`, but no service provides the `__whistle_cli__` API. A local `runtime serve` mode can be implemented, tested, and distributed with the existing package without requiring Whistle plugin installation.

**Alternatives considered**:

- Whistle plugin backend: deferred because it adds plugin packaging, installation, and version compatibility risk before the API contract is proven.
- Continue relying only on Whistle Web API: rejected because existing runtime-only composer/frame/capture commands still point at `RuntimeClient` and remain non-functional.

## Decision: Source captures from Whistle Web data

**Rationale**: Whistle Web `/cgi-bin/get-data` is already used successfully by `WhistleWebClient` and works in normal Whistle environments. Reusing it gives the runtime backend an immediately available capture source.

**Alternatives considered**:

- Read Whistle storage directly: rejected because it bypasses the running instance and is less stable for recent traffic.
- Require native runtime capture hooks: rejected for this feature because the missing backend is the current problem.

## Decision: Return explicit unsupported responses for frame routes

**Rationale**: Frame list/send needs deeper access to WebSocket/TCP internals than the current Web API adapter exposes. A stable unsupported JSON response is safer than a misleading success or generic 404.

**Alternatives considered**:

- Fake frame support: rejected because it would break agent trust.
- Remove frame commands: rejected because it is unrelated behavior and would be a breaking CLI change.

## Decision: Execute compose/replay with Node fetch

**Rationale**: Node 20 provides `fetch`, so compose/replay can be implemented without adding dependencies. The backend can return a bounded response summary with status, headers, body length, and optional body preview.

**Alternatives considered**:

- Delegate compose/replay to Whistle Web UI: rejected because no stable existing endpoint is available in the current codebase.
- Shell out to curl: rejected because it adds platform variance and weaker error typing.
