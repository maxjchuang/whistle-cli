# whistle-cli skill (local)

Canonical path: `skills/whistle-cli/`

## Install

From the public GitHub repository:

```bash
skills add https://github.com/maxjchuang/whistle-cli --skill whistle-cli
```

Use the helper script:

```bash
./scripts/install-skill.sh
```

By default it installs into `~/.agents/skills/whistle-cli`.

To choose a different location:

```bash
SKILLS_DIR=/path/to/skills ./scripts/install-skill.sh
```

To install as a symlink (for active development):

```bash
./scripts/install-skill.sh --link
```

## Compatibility

- Skill and CLI are compatible only when their **major versions match**.

If you see a major-version mismatch:

- Install a matching `whistle-cli` major version from npm
- Or use a matching skill checkout

Example:

- Skill checkout: `0.x`
- Installed CLI: `1.x`  -> reinstall `0.x` (or switch skill checkout)
