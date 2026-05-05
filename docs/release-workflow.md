# Release Workflow

This document describes how to verify and publish `whistle-cli`.

## Verify Locally

```bash
npm run release:verify
```

## Skill Install Verification

```bash
./scripts/install-skill.sh
./scripts/verify-skill-install.sh
```

## Dry Run

```bash
npm run release:dry-run
```

## Publish

1. Bump `package.json` version.
2. Run verification.
3. Publish to npm.

```bash
npm run release:verify
npm publish
```

## Rollback / Mitigation

- If a publish is broken, prefer `npm deprecate` with guidance instead of `npm unpublish` (unpublish is time-limited and disruptive).
- Always document remediation in release notes.

## Upgrade Verification Mode

`release:verify` supports an optional upgrade verification mode:

```bash
RELEASE_VERIFY_UPGRADE=1 \
RELEASE_VERIFY_FROM_VERSION=<semver> \
npm run release:verify
```

Expected exit codes:

- `0`: success
- `2`: usage / required inputs missing
- `10`: cannot install previous version
- `11`: smoke failed before upgrade
- `12`: cannot install current packed artifact
- `13`: smoke failed after upgrade
