# Research: Whistle AI CLI

## Inputs Reviewed

- Feature spec: `specs/001-whistle-cli-ai/spec.md`
- Prior design discussion: Lark Wiki document `黄剑成与Max-jieli的会话 2026年4月28日`
- Official Whistle sources:
  - GitHub README / README-en_US
  - `whistle` npm package metadata
  - Whistle documentation navigation for CLI, Network, Rules, Values, Composer, Plugins, Mobile

## Decision 1: Build `whistle-cli` as a TypeScript CLI on Node.js 20 LTS

- Decision: Use Node.js 20 LTS with TypeScript 5.x for the implementation language and runtime.
- Rationale:
  - Whistle itself is distributed as a Node package and exposes `whistle`, `w2`, and `wproxy` binaries from the same package.
  - A Node/TypeScript CLI can shell out to `w2`, inspect local files, and optionally talk to local runtime surfaces without cross-language impedance.
  - TypeScript makes it practical to define stable machine-readable contracts for AI-facing commands and typed error envelopes.
- Alternatives considered:
  - Plain JavaScript: lower setup cost, but weaker type guarantees for contracts and adapters.
  - Python/Rust wrapper: possible, but adds friction around invoking and modeling a Node-native backend.

## Decision 2: Use a three-layer command surface instead of exposing raw `w2` as the product model

- Decision: Organize the CLI into `shortcuts/skills`, `resource commands`, and `mirror/raw` commands.
- Rationale:
  - The prior design discussion converged on `larksuite/cli` as the reference shape: lightweight operational surface, not a heavy platform.
  - AI needs stable resource/action semantics, while human operators still need raw escape hatches for complete Whistle coverage.
  - This keeps the semantic surface predictable without losing access to long-tail Whistle capabilities.
- Alternatives considered:
  - Thin wrapper around `w2`: fastest to ship, but too inconsistent for AI orchestration.
  - Workflow-first assistant only: attractive demos, but weak determinism and incomplete coverage.

## Decision 3: Keep Whistle’s existing mechanisms as the source of truth for v1

- Decision: The backend will prefer existing Whistle mechanisms in this order:
  1. `w2` subprocess adapter for lifecycle, proxy, CA, and baseline plugin operations
  2. Storage adapter for persisted rules, values, profiles, and import/export artifacts
  3. Runtime adapter for sessions, composer-style actions, and runtime-only state where a stable running surface exists
- Rationale:
  - The user explicitly chose the “wrap existing mechanisms” direction for v1 speed.
  - Official metadata confirms Whistle is shipped as a CLI-first Node package; using its own binaries reduces reverse-engineering risk.
  - This still allows a semantic facade without rebuilding Whistle internals.
- Alternatives considered:
  - Import and manipulate Whistle internals directly as a library-first backend: cleaner long term, slower and riskier for v1.
  - Filesystem-only integration: insufficient for runtime-heavy workflows such as captures and replay.

## Decision 4: Do not expose `mocks` as a first-class resource in v1

- Decision: v1 does **not** introduce a separate `mocks` resource. Mocking workflows are expressed via `rules` / `values` intents (e.g. response overrides) with the same `preview -> apply -> verify` and rollback semantics.
- Rationale:
  - Mocking is a high-frequency semantic object for AI, but a dedicated resource is not required to ship a stable v1 contract.
  - Using rules/values intents keeps the v1 resource surface smaller and aligned with the canonical contract, while still enabling common “mock an endpoint” workflows.
  - A future v2 can still add a first-class `mocks` resource if the ergonomics justify it, without breaking the v1 rule/value model.
- Alternatives considered:
  - Expose mocks as a first-class resource in v1: better semantics, but increases surface area and contract burden for the initial milestone.

## Decision 5: Standardize all mutating commands around `preview -> apply -> verify`

- Decision: Every high-value mutating command must support a consistent preview, apply, and verification lifecycle.
- Rationale:
  - The prior design discussion emphasized that “config written” is not equivalent to “behavior effective” in Whistle.
  - AI needs explicit checkpoints before and after state changes to stay deterministic and auditable.
  - This pattern naturally supports rollback, operator confirmation, and structured history.
- Alternatives considered:
  - Immediate write-only commands: simpler, but too risky for AI-driven proxy and rule changes.
  - Fully interactive hidden workflows: harder to automate and audit.

## Decision 6: Make JSON output the canonical contract, with typed errors and next actions

- Decision: All resource commands and shortcuts should default to stable JSON envelopes, with optional human-readable rendering.
- Rationale:
  - The main product is an AI-friendly control plane, not just a terminal UX.
  - Typed result envelopes allow AI to distinguish warnings, blocked flows, verification failures, and recoverable errors without log scraping.
  - This follows the same operational philosophy that made `larksuite/cli` usable for agent workflows.
- Alternatives considered:
  - Human-first stdout with best-effort parsing: brittle for AI and difficult to version safely.

## Decision 7: Model diagnostics and guided setup as shared mechanisms, not separate product silos

- Decision: Implement `check/status`, `doctor/guide`, and `interactive flow` as shared capabilities used across resources.
- Rationale:
  - The design discussion explicitly rejected an overly heavy “platform” architecture.
  - Whistle still needs diagnosis for certificates, proxy routing, and capture availability, but those capabilities should stay close to the resources they explain.
  - Shared mechanisms keep the surface closer to `larksuite/cli` while preserving Whistle-specific guidance.
- Alternatives considered:
  - A standalone diagnostics subsystem: too heavy for the first release.
  - No diagnostic layer: leaves AI to guess at proxy/certificate failures.

## Decision 8: Defer full plugin capability standardization, but reserve a future contract

- Decision: v1 plugin support covers install, uninstall, enable, disable, list, and inspect, while reserving a future plugin capability schema.
- Rationale:
  - This was the explicit choice in the prior design discussion: operational management now, standardized plugin invocation later.
  - It keeps v1 scope achievable while preventing the contract model from painting itself into a corner.
- Alternatives considered:
  - Full plugin action discovery and invocation in v1: too broad for the first milestone.
  - Treat plugins as opaque forever: incompatible with the long-term AI goal.

## Decision 9: Optimize the first milestone for local-first individual debugging, with macOS as the primary validation target

- Decision: Design v1 around a single developer operating one or a small number of local Whistle instances, with macOS desktop as the primary validation environment and Linux headless as the secondary environment.
- Rationale:
  - The Lark design discussion corrected the primary user from “AI agent control plane” to “local-first developer debugging with AI assistance”.
  - Whistle’s official materials emphasize desktop and headless Linux usage; the initial milestone should validate against the most common local setup path.
  - Proxy switching, certificate trust, and local browser/app debugging are most critical in this mode.
- Alternatives considered:
  - Team-shared remote control plane first: interesting later, but not the chosen primary use case.
  - Windows-first validation: possible, but not the clearest path for the first milestone.

## Decision 10: Use a local whistle-cli state directory only for tool-owned metadata

- Decision: Persist whistle-cli-owned metadata such as operation history, transaction snapshots, cached inspections, and interactive flow state in a dedicated local state directory, while leaving Whistle’s own state in Whistle-managed storage.
- Rationale:
  - The spec requires auditable history and reversible operations.
  - Mixing whistle-cli metadata into Whistle’s storage would make rollback and future migrations harder.
  - A small tool-owned state layer is enough to support previews, rollbacks, and AI audit trails.
- Alternatives considered:
  - No local tool state: too limiting for rollback and action history.
  - Full database layer: unnecessary for a local-first CLI.
