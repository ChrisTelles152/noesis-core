# Releasing `@noesis-edu/core`

This package publishes to the public npm registry as `@noesis-edu/core`.
Releases ship via the `core-v*` git-tag → GitHub Actions pipeline. There
is no `latest` tag with surprise contents — every published version
matches a tag in the repo.

## Pre-flight (do this before tagging)

From the repo root:

```bash
# Build, test, smoke — same checks the release workflow runs
npm run release:core:dry-run

# Sanity-check what would be packed (catch missing files in the
# `files` array of packages/core/package.json)
npm run verify:core:pack
```

If both pass cleanly, the artifact is ready.

## Cutting a release

1. Bump `packages/core/package.json` `version` and `packages/core/src/index.ts`
   `VERSION` constant in lockstep.
2. Update `packages/core/CHANGELOG.md` — add a new dated section, move
   anything from `[Unreleased]` into it.
3. Commit: `chore(core): release v<X.Y.Z>`.
4. Tag and push:

   ```bash
   git tag core-v<X.Y.Z>
   git push origin main
   git push origin core-v<X.Y.Z>
   ```

5. The `Release @noesis-edu/core` workflow (`.github/workflows/release.yml`)
   picks up the tag, runs build → test → smoke → pack-verify → publish.
6. Verify the publish landed:

   ```bash
   npm view @noesis-edu/core version       # should show <X.Y.Z>
   ```

## Required GitHub secret

The workflow reads `NPM_TOKEN` from repository secrets. The token must
have publish access to the `@noesis-edu` scope. To rotate:

```bash
# On npmjs.com → Settings → Access Tokens → Generate New Token
# (Granular, scope: @noesis-edu, permissions: read+publish)

# In the GitHub repo → Settings → Secrets and variables → Actions
# → New repository secret → Name: NPM_TOKEN → Paste value
```

## Local-only publish (escape hatch)

If CI is blocked and you need to publish from your laptop:

```bash
# Make sure your local npm is logged in to a token with publish rights
npm whoami --scope=@noesis-edu

# Run the same checks the workflow would, then publish
npm run release:core
```

This calls the `release:core` script in the root `package.json`, which
runs `build:core && test:core && smoke:core && cd packages/core && npm publish --access public`.

## Versioning

- **Patch (0.2.x)** — bug fixes, no API surface change.
- **Minor (0.x.0)** — additive features. New types/exports/methods.
- **Major (x.0.0)** — breaking changes. Today: changing the determinism
  contract, the snapshot version (`importState` no longer accepts an
  older shape), or removing/renaming an exported symbol.

The snapshot version (in `engine/NoesisCoreEngineImpl.ts`) tracks
internally. When it crosses a major boundary that older snapshots can't
import, bump the package major as well.
