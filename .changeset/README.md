# Changesets

This directory holds change-intent files consumed by pnpm-native workspace
versioning (`pnpm version -r`). One file per change, authored with:

```
pnpm change --bump <none|patch|minor|major> --summary "<changelog entry>" [<pkg>...]
```

- A PR that changes anything under `packages/` MUST ship with an intent here.
  Root tooling is outside the verdict.
- `--bump none` records a change that needs no release. A `none` on a
  behavior-visible change is the same silent non-release the gate exists to
  catch.
- Intents are consumed by `pnpm version -r` when the Release PR
  lands: consumption is recorded in `ledger.yaml` and the intent files
  are retained, so a present intent alone never implies a pending release.
- This README is NOT a changeset: the gate requires a file whose frontmatter
  parses as `"<pkg>": <none|patch|minor|major>`.

Releases are driven by the shared release toolchain
(`systemfsoftware/pnpm-release-management`), consumed as a reusable workflow from
`.github/workflows/release.yml` and configured by this repo's `release.jsonc`.
Distribution is this repository's Nix flake outputs consumed from a git ref
(pinned by `flake.lock` rev + narHash), not an npm registry: the release path
writes a `@systemfsoftware/omp-claude-compat@vX.Y.Z` git tag and a GitHub Release
for each unreleased version — there is no npm token, no OIDC trusted publishing,
and no registry to configure. The git tag is the durable record that a version
shipped, and tagging is idempotent, so a half-finished release resumes safely on
the next push to `main`.
