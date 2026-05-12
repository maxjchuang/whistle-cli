# Quickstart: NPM And Skill Distribution

## Goal

Validate that `whistle-cli` can be distributed via npm and consumed via installable skill for agent workflows.

## Prerequisites

- Node.js 20+
- npm account with publish rights
- Local Whistle prerequisites for runtime checks
- Agent environment supporting local skill installation

## Package Release Flow

1. Prepare release version and metadata.
2. Build and test CLI.
3. Run release verification checks.
4. Publish to npm public registry.
5. Verify clean-environment install and command availability.

## Skill Release Flow

1. Place skill content under repository-defined canonical path.
2. Install skill from the public GitHub repository in a clean agent environment.
3. Install skill from local directory for development verification.
4. Optionally copy/link skill into global/default skill directory.
5. Validate baseline agent workflow.

## Validation Sequence

1. CLI package install from npm succeeds.
2. `whistle-cli --help` works after install.
3. Structured command output contract remains valid.
4. Skill install from public GitHub repository succeeds.
5. Skill install from canonical local path succeeds.
6. Agent executes baseline flow without command rewrites.
7. Version mismatch (major) is rejected with explicit guidance.

## Example Verification Commands

```bash
npm run build
npm run test
npm run release:verify
npm run release:dry-run

# Skill (agent)
skills add https://github.com/maxjchuang/whistle-cli --skill whistle-cli
./scripts/install-skill.sh
./scripts/verify-skill-install.sh

# After publish (clean env)
npm install -g whistle-cli@<version>
whistle-cli --help
whistle-cli --format json instance status
```

## Exit Criteria

- Distribution channels match clarified v1 scope.
- Compatibility policy is enforced and documented.
- Release checklist passes before publication.
