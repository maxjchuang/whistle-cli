# Feature Specification: Whistle AI CLI

**Feature Branch**: `001-whistle-cli-ai`  
**Created**: 2026-04-28  
**Status**: Draft  
**Input**: User description: "对 https://github.com/avwo/whistle 的功能做调研，我要做一款基于它的工具，名字叫 whistle-cli，支持 AI 友好的方式实现 whistle 的所有操作。"

## Clarifications

### Session 2026-04-28

- Q: AI 发起的规则 / mock / 代理类变更默认落到哪种生命周期？ → A: persistent
- Q: v1 的多实例支持边界是什么？ → A: 支持多实例，未指定时使用当前默认实例
- Q: v1 的插件支持边界是什么？ → A: 只支持安装、卸载、启停、列出、查看元信息
- Q: v1 的权限边界是什么？ → A: 不做额外权限系统，只运行在当前用户本机权限范围内
- Q: v1 的正式验收平台边界是什么？ → A: 正式验收 macOS 和 Linux headless，Windows 延后

### Session 2026-04-29

- Q: v1 插件标识符（name / scope / version）输入格式与校验规则是什么？ → A: 接受 npm package spec：`whistle.<name>` / `@scope/whistle.<name>`，可选 `@<semver>`（如 `whistle.cache@1.2.3`）；拒绝空白、包含空格或 shell 控制字符的输入
- Q: v1 支持哪些插件安装来源？哪些明确不在范围内？ → A: 仅支持 npm registry 安装（等价于 `w2` 的 install 行为）；本地 tarball/git/path 安装与离线包仓库不作为 v1 正式能力
- Q: v1 的“update”语义如何落地（独立命令 vs install 复用）？ → A: 不引入 `plugins update` 独立资源动作；`plugins install <name@version?>` 既用于首次安装也用于升级/降级（不传 version 视为安装/升级到 latest），且默认不改变当前 enabled/disabled 状态
- Q: v1 的插件生命周期状态与幂等策略是什么？ → A: 规范化状态为 `installed|enabled|disabled|unknown`；`install/enable/disable/uninstall` 需尽量幂等（重复执行返回 `status=ok` 或 `status=warning` 且不破坏现有环境）
- Q: v1 的多实例与 rollback 语义如何定义？ → A: 插件操作作用于 `--instance` 指定的实例存储作用域（未指定时为当前默认实例）；`--rollback <action-id>` 仅对 whistle-cli 自己记录过的 install/uninstall/enable/disable 变更做 best-effort 回滚（含版本回退仅在可确定之前版本时保证）

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Bootstrap And Control Whistle (Priority: P1)

As a developer or tester, I can ask `whistle-cli` to start, stop, inspect, and configure a Whistle workspace in plain language so that I can get a usable proxy environment without memorizing Whistle commands or manual setup steps.

**Why this priority**: No other Whistle capability is usable until the proxy instance, certificate, storage, and proxy routing are correctly prepared.

**Independent Test**: Can be fully tested by asking the tool to prepare a local or remote Whistle session, confirm its running status, guide or execute certificate and proxy setup, and then verify that the user reaches a working Web UI or proxy endpoint.

**Acceptance Scenarios**:

1. **Given** a machine where Whistle is not running, **When** the user asks to start a new debugging session, **Then** the tool starts the correct Whistle instance, reports reachable addresses, and explains any remaining manual trust or proxy steps.
2. **Given** a running Whistle instance, **When** the user asks for its status or to restart it with different listening settings, **Then** the tool reports the current instance details and applies the requested change without requiring the user to know the underlying command syntax.
3. **Given** multiple Whistle instances are available, **When** the user does not specify a target, **Then** the tool operates on the current default instance and reports which instance was selected.
4. **Given** a user who needs HTTPS or mobile capture, **When** the user asks to prepare certificate or proxy setup, **Then** the tool provides the correct certificate/proxy path for the target device and clearly indicates success criteria and unresolved blockers.

---

### User Story 2 - Express Whistle Rules In Natural Language (Priority: P1)

As a developer, I can describe a debugging goal in everyday language and have `whistle-cli` create, update, explain, enable, disable, import, or export the corresponding Whistle rules and values so that I can perform request and response manipulation without learning the full rule DSL first.

**Why this priority**: Rules are the core of Whistle's value. An AI-friendly interface is only credible if it can safely cover the dominant rule authoring and rule maintenance workflows.

**Independent Test**: Can be fully tested by giving the tool a natural-language task such as local forwarding, header rewrite, body modification, throttling, filtering, or response mocking, and verifying that the produced rules and values match the requested behavior and remain reviewable.

**Acceptance Scenarios**:

1. **Given** a user request such as "send `/api` traffic to my test server but leave static files alone", **When** the tool translates that request, **Then** it creates or updates the correct rule set and explains the effect in plain language before activation.
2. **Given** existing rules and values, **When** the user asks what they do or asks for a safe modification, **Then** the tool summarizes the current behavior, applies the requested change, and preserves unaffected entries.
3. **Given** an ambiguous or risky natural-language request, **When** the tool cannot safely infer the exact outcome, **Then** it asks for the smallest necessary clarification or presents a preview before activating the change.

---

### User Story 3 - Inspect, Replay, And Compose Traffic (Priority: P2)

As a developer or QA engineer, I can ask `whistle-cli` to find captured traffic, filter it, explain matched rules, replay requests, and construct edited requests so that I can debug failures without switching between multiple manual interfaces.

**Why this priority**: Traffic inspection and request replay are core day-two workflows after the environment and rules are in place.

**Independent Test**: Can be fully tested by capturing traffic, asking the tool to locate a specific request or class of requests, replay or edit one of them, and confirming the expected request behavior and returned result.

**Acceptance Scenarios**:

1. **Given** captured traffic exists, **When** the user asks to find failed calls, requests from a host, or requests matching a body/header pattern, **Then** the tool returns the relevant captures with enough detail to act on them.
2. **Given** a selected request, **When** the user asks to replay it or resend it with modified headers, params, body, or temporary rules, **Then** the tool performs the action and reports the outcome.
3. **Given** WebSocket or TCP traffic, **When** the user asks to inspect frames or control send/receive behavior, **Then** the tool exposes the relevant session context and available controls in user-readable language.

---

### User Story 4 - Manage Plugin Lifecycle (Priority: P3)

As a power user or platform engineer, I can manage Whistle plugins through `whistle-cli` so that installation, lifecycle control, and metadata inspection are available from the same AI interface without relying on raw plugin tooling.

**Why this priority**: Plugin lifecycle coverage is necessary to claim broad Whistle coverage, but it depends on the core lifecycle and rule workflows already being stable.

**Independent Test**: Can be fully tested by installing, enabling, disabling, inspecting, updating, and uninstalling a plugin through natural-language commands, while preserving the user’s existing Whistle environment.

**Acceptance Scenarios**:

1. **Given** a plugin name or purpose, **When** the user asks to install or remove it, **Then** the tool performs the lifecycle action and reports any registry, version, or compatibility issue.
2. **Given** an installed plugin, **When** the user asks to inspect it, **Then** the tool presents its lifecycle state and metadata in a readable summary.
3. **Given** a plugin exposes custom actions beyond lifecycle management, **When** the user asks to invoke them, **Then** the tool clearly reports that unified plugin action invocation is not part of the v1 contract.

#### Command Mapping (v1)

- `whistle-cli plugins list`
- `whistle-cli plugins inspect <name>`
- `whistle-cli plugins install <name[@version]> --preview|--apply|--verify`
- `whistle-cli plugins enable <name> --preview|--apply|--verify`
- `whistle-cli plugins disable <name> --preview|--apply|--verify`
- `whistle-cli plugins uninstall <name> --preview|--apply|--verify`

#### Lifecycle Semantics (v1)

- Identity: plugin input is an npm package spec (`whistle.<name>` / `@scope/whistle.<name>` with optional `@version`).
- Source: npm registry only; local tarball/git/path installs are explicitly out of scope for v1.
- Update: `install` is the single entry for install/upgrade/downgrade (latest if version omitted) and does not implicitly flip enabled state.
- Multi-instance: plugin operations are scoped by the resolved instance (`--instance`), using the instance storage directory as the source of truth.
- Preserve environment: lifecycle operations should avoid mutating unrelated rules/values; if the underlying plugin tooling triggers side effects, they must be surfaced as warnings.
- Enable/disable capability: if the underlying backend cannot express enable/disable, commands must fail with a stable capability error and next action suggesting `raw w2` fallback.

### Edge Cases

- What happens when the user machine has multiple Whistle instances, multiple storage directories, or conflicting ports?
- How does the system handle operations that require partial manual action, such as trusting a root certificate, changing OS proxy settings, or configuring a mobile device on the same LAN?
- What happens when a natural-language request maps to multiple possible rule strategies with materially different outcomes?
- How does the system prevent destructive edits to existing rule groups, values, or plugin settings when the user intended only a temporary experiment?
- What happens when a capture or replay request references traffic that has expired, been filtered out, or belongs to a different Whistle instance?
- How does the system respond when a plugin is unavailable, disabled, incompatible, or requires extra parameters the user did not supply?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST let users operate Whistle through natural-language requests for instance start, stop, restart, status inspection, and workspace selection, including support for multiple instances with a current default instance used when the user does not explicitly choose one.
- **FR-002**: System MUST support configuring the connection prerequisites required to use Whistle, including proxy endpoint selection, certificate guidance, and device-specific setup instructions when automation is not possible.
- **FR-003**: System MUST let users create, update, enable, disable, import, export, and explain Whistle rule groups through natural-language requests.
- **FR-004**: System MUST support natural-language authoring and maintenance for the major Whistle rule families, including request forwarding, local mapping, request rewriting, response rewriting, throttling, filtering, and debugging tools.
- **FR-005**: System MUST let users create, update, inspect, reuse, import, and export Values entries that are referenced by rules.
- **FR-006**: System MUST present a human-readable preview of rule or value changes before activation when the requested action is ambiguous, broad in impact, or potentially destructive.
- **FR-007**: System MUST preserve unrelated existing rule groups, Values entries, and plugin settings when applying a targeted user request.
- **FR-008**: System MUST let users query captured traffic in plain language using request attributes such as host, path, method, status, headers, body content, application source, or error state.
- **FR-009**: System MUST let users inspect a selected traffic record, including the matched rules, request and response details, timing information, and available follow-up actions.
- **FR-010**: System MUST let users replay captured requests and compose edited requests from scratch or from an existing capture using natural-language instructions.
- **FR-011**: System MUST support WebSocket and TCP debugging workflows that Whistle exposes, including frame-oriented inspection and session-level send/receive control where available.
- **FR-012**: System MUST let users install, update, enable, disable, inspect, and uninstall Whistle plugins through AI-guided commands.
  - Plugin identifiers MUST accept npm package specs (`whistle.<name>` / `@scope/whistle.<name>`) with optional `@<semver>`.
  - Plugin installation MUST target the npm registry in v1; local tarball/git/path sources are out of scope.
  - “Update” MUST be supported via `plugins install <name@version?>` semantics (install latest when version omitted).
- **FR-019**: System MUST limit v1 plugin support to lifecycle management and metadata inspection, while treating unified invocation of plugin-specific custom actions as out of scope for the initial release.
- **FR-013**: System MUST explain operational blockers in user-readable language, including missing prerequisites, permission issues, certificate trust requirements, unavailable plugins, or unsupported device/network conditions.
- **FR-014**: System MUST maintain an auditable history of AI-issued actions, including what the user asked for, what Whistle-facing change was applied, and whether the change was temporary or persistent.
- **FR-015**: System MUST support safe rollback or reversal for the changes it applies to rules, values, proxy state, and plugin configuration whenever those artifacts were modified by the tool during the current workflow.
  - For plugins, rollback MUST be best-effort and limited to tool-recorded lifecycle mutations (`install/uninstall/enable/disable`), restoring the prior lifecycle state when deterministically known.
- **FR-016**: System MUST distinguish between read-only requests, temporary debugging actions, and persistent configuration changes so users can control when a change should survive the current session, with AI-initiated rule, mock, and proxy changes defaulting to persistent unless the user explicitly requests a temporary scope.
- **FR-017**: System MUST help users understand existing Whistle configurations by translating current rules, values, captures, and plugin state into concise natural-language explanations.
- **FR-018**: System MUST support workflows for local desktop use, headless server use, and remote/mobile device access to the extent those workflows are supported by Whistle itself, with formal v1 acceptance focused on macOS desktop and Linux headless environments.
- **FR-020**: System MUST operate within the invoking user’s local machine permissions in v1 and MUST NOT introduce a separate multi-user authorization model for controlling Whistle.

### Key Entities *(include if feature involves data)*

- **Whistle Instance**: A running proxy workspace with its own listening addresses, storage scope, lifecycle state, and accessibility details.
- **Rule Group**: A named collection of ordered Whistle rules that can be enabled, disabled, imported, exported, and edited as a unit.
- **Rule Entry**: A single match-and-action instruction with optional filters, priority behavior, and persistence scope.
- **Value Entry**: Named reusable content referenced by rules or plugins for request/response transformation.
- **Capture Record**: A stored or live network event containing request, response, timing, matching, and error context.
- **Compose Request**: A user-authored or replay-derived outbound request definition used for testing.
- **Plugin**: An installable Whistle extension with lifecycle state, optional rules/values, executable commands, and management surface.
- **Device Setup Profile**: The instructions and connection data needed for a person or device to trust Whistle and route traffic through it.
- **AI Action Log**: A history record that links a user intent to the Whistle-facing action taken, its scope, and its outcome.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In usability testing, at least 90% of common Whistle setup tasks can be completed by target users without manually writing raw Whistle commands or rule syntax.
- **SC-002**: At least 85% of the documented high-frequency Whistle workflows covered in the official getting-started, CLI, rules, network, composer, values, plugins, and mobile guidance can be completed end-to-end through `whistle-cli`.
- **SC-003**: For first-pass natural-language rule authoring tasks, at least 80% of requested behaviors are accepted by users without manual correction after the tool presents its preview.
- **SC-004**: Users can complete a new local debugging session, including starting Whistle and understanding any remaining trust/proxy steps, in under 5 minutes.
- **SC-005**: Users can locate, inspect, and replay a previously captured request in under 2 minutes for the median tested workflow.
- **SC-006**: When users ask the tool to explain existing rules or plugin state, at least 90% of reviewed explanations are rated understandable and action-oriented by target users.
- **SC-007**: Fewer than 2% of persistent configuration changes applied by the tool require manual cleanup because unrelated Whistle state was unintentionally modified.
- **SC-008**: The v1 acceptance suite passes on macOS desktop and Linux headless target environments for the documented core workflows before the release is considered ready.

## Assumptions

- The first release targets users who already choose Whistle as their proxy/debugging engine and need a more natural operating layer rather than a replacement proxy core.
- The first release assumes a single local user operating within their own machine permissions; no separate multi-user authorization layer is introduced in v1.
- `whistle-cli` is expected to orchestrate Whistle’s existing capabilities and surfaces, not reimplement the underlying proxy engine.
- When operating systems or devices require explicit trust dialogs, password entry, or manual certificate installation, the tool may guide the user rather than fully automate the step.
- The initial scope prioritizes the operations documented in Whistle’s official README and documentation: lifecycle, proxy/certificate setup, rules, values, capture inspection, composer/replay, plugins, and mobile/remote access.
- Formal v1 acceptance covers macOS desktop and Linux headless environments; Windows compatibility may be pursued later but is not a release gate for the first version.
- When multiple Whistle instances exist, `whistle-cli` resolves operations against a current default instance unless the user explicitly targets another one.
- The tool can rely on users to review previews before high-impact persistent changes are committed.
- Unless the user explicitly asks for a temporary scope, AI-initiated rule, mock, and proxy changes are treated as persistent changes to the user’s Whistle configuration.
- Unsupported or third-party plugin-specific behaviors may be surfaced as best-effort workflows rather than guaranteed end-to-end automation in the first release.
- Plugin support in the first release is limited to lifecycle management and metadata inspection; standardized invocation of plugin-specific custom actions is reserved for a later phase.
