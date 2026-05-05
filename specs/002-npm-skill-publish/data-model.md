# Data Model: NPM And Skill Distribution

## Overview

This feature adds release/distribution entities and validation records around an existing CLI codebase.

## Entities

### CliPackageRelease

- **Fields**:
  - `name` (string): npm package name
  - `version` (string): semantic version
  - `channel` (enum): `npm-public`
  - `bin_name` (string): command exposed after install (`whistle-cli`)
  - `published_at` (datetime)
  - `status` (enum): `draft | candidate | published | deprecated`
- **Validation rules**:
  - `version` must follow semver
  - `status=published` requires verification record pass

### SkillPackageRelease

- **Fields**:
  - `id` (string): skill identifier
  - `version` (string): semantic version
  - `source_path` (string): repository-defined install path
  - `install_mode` (enum): `local-directory`
  - `status` (enum): `draft | published | deprecated`
- **Validation rules**:
  - `source_path` must exist in repo
  - `version.major` must equal linked CLI major

### CompatibilityPolicy

- **Fields**:
  - `cli_major` (integer)
  - `skill_major` (integer)
  - `compatible` (boolean)
  - `guidance` (string): remediation text for mismatch
- **Validation rules**:
  - `compatible=true` only if `cli_major == skill_major`

### ReleaseVerificationRecord

- **Fields**:
  - `release_version` (string)
  - `checks` (list): named check results
  - `passed` (boolean)
  - `executed_at` (datetime)
  - `executor` (string): user/CI identity
- **Validation rules**:
  - `passed=true` requires all required checks pass
  - Record must include package install check and skill install check

## Relationships

- One `CliPackageRelease` may map to one or more `SkillPackageRelease` entries, but only same-major combinations are compatible.
- One `ReleaseVerificationRecord` is associated to one release candidate version.

## State Transitions

### Package Release Lifecycle

`draft -> candidate -> published -> deprecated`

- `candidate -> published` requires verification pass.

### Skill Release Lifecycle

`draft -> published -> deprecated`

- `draft -> published` requires compatibility check and install validation.
