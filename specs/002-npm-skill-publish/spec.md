# Feature Specification: NPM And Skill Distribution

**Feature Branch**: `002-npm-skill-publish`  
**Created**: 2026-05-01  
**Status**: Draft  
**Input**: User description: "我希望将 whistle-cli 发布到 npm 包，并且能够作为一个可安装使用的 skill 来让 AI agent 来使用"

## Clarifications

### Session 2026-05-05

- Q: v1 的 skill 安装目标路径策略是什么？ → A: 安装到仓库约定路径并提供复制到全局目录指引
- Q: skill 与 CLI 的版本兼容策略是什么？ → A: 仅同 major 版本兼容（1.x 对 1.x）
- Q: v1 分发渠道范围是什么？ → A: npm 公网发布 + GitHub 仓库 skill 安装（`skills add ... --skill whistle-cli`）+ 本地目录安装 skill（v1）

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Publish Installable CLI Package (Priority: P1)

As a developer, I can install `whistle-cli` from a package registry so I can use the tool without cloning the repository.

**Why this priority**: Without package distribution, the product cannot be adopted in normal developer workflows.

**Independent Test**: Can be fully tested by installing the published package in a clean environment, running `whistle-cli --help`, and executing a basic status command successfully.

**Acceptance Scenarios**:

1. **Given** a clean machine with Node.js and Whistle prerequisites, **When** the user installs `whistle-cli` from the package registry, **Then** the command is available on PATH and starts normally.
2. **Given** a published package version, **When** the user runs core read commands, **Then** they receive valid structured output without repository-only setup.

---

### User Story 2 - Install Skill For Agent Workflows (Priority: P1)

As an AI agent operator, I can install a reusable `whistle-cli` skill so the agent can consistently use command patterns, output parsing, and fallback behavior.

**Why this priority**: The value of AI-friendly CLI depends on predictable agent behavior; packaging a skill standardizes that behavior.

**Independent Test**: Can be fully tested by installing the skill into a fresh agent environment and completing a full workflow (instance check, mutation preview/apply/verify, diagnostics) through agent-issued commands.

**Acceptance Scenarios**:

1. **Given** a supported agent environment, **When** the user installs the `whistle-cli` skill, **Then** the skill becomes discoverable and callable by the agent.
2. **Given** the installed skill, **When** the agent handles CLI errors or blocked states, **Then** it follows documented error-code and next-action handling rules.

---

### User Story 3 - Versioned Release And Upgrade Guidance (Priority: P2)

As a maintainer, I can release new package and skill versions with clear compatibility guidance so users and agents can upgrade safely.

**Why this priority**: Sustained usage requires clear versioning and upgrade behavior, especially when command contracts evolve.

**Independent Test**: Can be fully tested by releasing a new version, performing an upgrade from the previous version, and validating backward-compatible core workflows.

**Acceptance Scenarios**:

1. **Given** an existing installed version, **When** a user upgrades to a newer release, **Then** core workflows continue to work or provide explicit migration guidance.
2. **Given** a release that changes behavior, **When** users read release documentation, **Then** compatibility impact and required actions are clearly stated.

---

### Edge Cases

- What happens when package installation succeeds but runtime prerequisites (such as underlying Whistle tooling) are missing?
- How does the system handle agent environments where the skill is installed but cannot execute local shell commands?
- What happens when a skill version and CLI version are incompatible?
- How are users guided when global command names conflict with an existing local tool on PATH?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a distributable package for `whistle-cli` that users can install in a standard Node.js environment and run as a command-line tool.
- **FR-002**: System MUST provide release metadata and installation instructions for npm public registry installation so first-time users can complete setup without cloning source code.
- **FR-003**: System MUST ensure the distributed CLI preserves the documented command surface and machine-readable output envelope used by agents.
- **FR-004**: System MUST provide a distributable skill package that can be installed from the public GitHub repository using `skills add https://github.com/maxjchuang/whistle-cli --skill whistle-cli` and from a repository-defined local directory path into supported agent environments in v1.
- **FR-005**: Skill documentation MUST define the required invocation pattern for agents, including preferred command layers, output parsing fields, and fallback behavior.
- **FR-006**: Skill behavior MUST require agents to prioritize structured resource commands before raw passthrough commands except when unsupported operations are encountered.
- **FR-007**: System MUST enforce and document compatibility boundaries where skill and CLI must share the same major version.
- **FR-008**: System MUST provide an upgrade path for both npm package and local-directory skill package, including guidance for breaking or behavior-changing releases.
- **FR-009**: System MUST provide clear error guidance for installation and runtime prerequisite failures, including next-step remediation.
- **FR-010**: System MUST define a verification checklist for release readiness covering package installability, command availability, skill installability, and baseline workflow execution.
- **FR-011**: System MUST include user guidance for GitHub-based skill installation and for copying or linking the repository-installed skill into a global/default skill directory when needed by the runtime environment.

### Key Entities *(include if feature involves data)*

- **CLI Package Release**: A versioned, installable artifact that exposes the `whistle-cli` executable and associated release metadata.
- **Skill Package Release**: A versioned, installable skill artifact containing agent usage rules, command patterns, and operational guidance.
- **Compatibility Policy**: A documented mapping where skill and CLI are compatible only when their major versions match.
- **Release Verification Record**: A structured checklist or report confirming that install, execution, and agent workflow gates passed for a release.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: New users can install and run `whistle-cli --help` in under 10 minutes using published instructions only.
- **SC-002**: At least 95% of tested fresh environments can install the CLI package and execute a basic status command successfully.
- **SC-003**: At least 95% of tested fresh agent environments can install the skill and complete the baseline agent workflow without manual command rewrites.
- **SC-004**: For each release, 100% of required release verification checklist items pass before publication.
- **SC-005**: After upgrade to a new version, at least 90% of baseline workflows continue to pass without additional manual fixes.
- **SC-006**: 100% of tested mismatched-major combinations are rejected with explicit compatibility guidance before workflow execution.

## Assumptions

- The target users already have a supported Node.js runtime and can install packages from their approved package source.
- Agent environments that use this skill can execute local CLI commands and read JSON output.
- Core Whistle prerequisite setup remains a prerequisite; this feature focuses on distribution and agent usability rather than replacing Whistle itself.
- The first release scope is npm public registry for CLI plus GitHub repository and repository-defined local-directory installation for skill; other channels are out of scope for v1.
