---
name: npm-version-release
description: Use when updating the whistle-cli npm package version, preparing npm release artifacts, or publishing to npm. Covers version bump, package-lock synchronization, verification, tarball hygiene, and token handling through environment variables only.
---

# npm-version-release

Use this skill for `whistle-cli` npm version updates and release preparation.

## Rules

- Never commit access tokens, `.npmrc`, `.env`, or generated credential files.
- Read npm access tokens only from environment variables. Prefer `NPM_TOKEN`; accept `NODE_AUTH_TOKEN` if already provided.
- Do not print token values or include them in final answers.
- Preserve unrelated untracked files and user changes.
- Treat `*.tgz` as local release artifacts unless the user explicitly asks to keep or commit them.

## Version Update Workflow

1. Confirm repository state:
   - `git status --short --branch`
   - `git log -1 --oneline`
2. Inspect current package version:
   - `node -p "require('./package.json').version"`
3. Choose the semver bump:
   - `patch` for bug fixes and implementation gaps.
   - `minor` for new user-facing commands or compatible feature additions.
   - `major` only for breaking CLI/API behavior.
4. Update version without creating a git tag:
   - `npm version <patch|minor|major|x.y.z> --no-git-tag-version`
5. Verify only expected version files changed:
   - `git diff -- package.json package-lock.json`

## Verification

Run release-relevant checks in sequence, not in parallel, because tests may build/package the repo and mutate `dist` or create `*.tgz` files.

```bash
npm run build
npm test
```

If a parallel run caused `rm: dist: Directory not empty` or similar build races, rerun the checks sequentially before treating it as a real failure.

After verification:

```bash
git status --short --branch
ls -1 *.tgz 2>/dev/null || true
```

Remove only tarballs generated during the current run unless the user asked to keep them.

## Optional Publish

Only publish when the user explicitly asks.

Require a token in the environment:

```bash
test -n "${NPM_TOKEN:-${NODE_AUTH_TOKEN:-}}"
```

Use a temporary npm userconfig outside the repo and delete it afterward:

```bash
tmp_npmrc="$(mktemp)"
chmod 600 "$tmp_npmrc"
printf '//registry.npmjs.org/:_authToken=%s\n' "${NPM_TOKEN:-$NODE_AUTH_TOKEN}" > "$tmp_npmrc"
NPM_CONFIG_USERCONFIG="$tmp_npmrc" npm publish --access public --registry https://registry.npmjs.org/
rm -f "$tmp_npmrc"
```

If publish fails, remove the temp userconfig before reporting the error.

## Final Response

Report:

- New version.
- Files changed.
- Verification commands and results.
- Any generated artifacts left in the working tree.
- Whether publish was skipped or completed.
