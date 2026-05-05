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
2. Install skill from local directory in a clean agent environment.
3. Optionally copy/link skill into global/default skill directory.
4. Validate baseline agent workflow.

## Validation Sequence

1. CLI package install from npm succeeds.
2. `whistle-cli --help` works after install.
3. Structured command output contract remains valid.
4. Skill install from canonical local path succeeds.
5. Agent executes baseline flow without command rewrites.
6. Version mismatch (major) is rejected with explicit guidance.

## Example Verification Commands

```bash
npm run build
npm run test
npm pack
npm publish --dry-run

# After publish (clean env)
npm install -g whistle-cli@<version>
whistle-cli --help
whistle-cli --format json instance status
```

## Exit Criteria

- Distribution channels match clarified v1 scope.
- Compatibility policy is enforced and documented.
- Release checklist passes before publication.
