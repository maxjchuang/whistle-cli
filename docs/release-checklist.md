# Release Checklist

## Before Publish

- [ ] Version bumped in `package.json`
- [ ] `npm run build` passes
- [ ] `npm run test` passes
- [ ] `npm run release:verify` passes
- [ ] Skill install verified: `./scripts/install-skill.sh` + `./scripts/verify-skill-install.sh`
- [ ] Release notes prepared (use `docs/release-notes-template.md`)

## Publish

- [ ] `npm publish --dry-run` looks correct
- [ ] `npm publish` completed

## After Publish

- [ ] `npm i -g whistle-cli@<version>` works on a clean environment
- [ ] `whistle-cli --help` works
- [ ] `whistle-cli --format json instance status` emits JSON envelope

