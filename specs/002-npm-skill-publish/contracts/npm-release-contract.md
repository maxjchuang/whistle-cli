# Contract: NPM Release

## Purpose

Define the release contract for publishing `whistle-cli` to npm public registry.

## Required Inputs

- Valid semantic version for the release
- Package metadata ready for publish
- Release verification record with all required checks passed

## Required Outputs

- Installable package available from npm public registry
- Working executable command `whistle-cli`
- Release notes containing install, upgrade, and compatibility guidance

## Verification Requirements

1. Fresh environment install succeeds.
2. `whistle-cli --help` executes successfully.
3. At least one structured command returns valid output envelope.
4. Upgrade from previous version preserves baseline workflows or emits migration guidance.

## Failure Contract

If any verification check fails, release MUST remain unpublished and include explicit remediation guidance.
