# Releasing pharn

Maintainer guide for publishing a new version of the `pharn` npm package.

Releases are automated: cut a **GitHub Release** and
[`.github/workflows/publish.yml`](../.github/workflows/publish.yml) publishes to
npm. Authentication is **npm Trusted Publishing (OIDC)** — there are **no npm
tokens** anywhere in this repository or in its GitHub Actions secrets.

## The package

The canonical npm package is **`pharn`** (unscoped) —
<https://www.npmjs.com/package/pharn>. It exposes a single `pharn` bin.

> The scoped name `@pharn-dev/pharn` was briefly published early on and then
> **unpublished on 2026-07-22**. It was never deprecated — `pharn` is the only
> name. Do not republish the scoped name.

## How publishing is authenticated

`publish.yml` uses **npm Trusted Publishing (OIDC)**: at publish time the
workflow exchanges a short-lived GitHub OIDC id-token with npm — no long-lived
credential is stored or passed.

- **No secrets, no tokens** — not in the repo, not in Actions secrets, not in
  the workflow. `permissions: id-token: write` is what enables the OIDC exchange
  (and the `--provenance` attestation); it is not a secret.
- The Trusted Publisher is configured **on npmjs.com** for package `pharn`,
  pinned to workflow **`publish.yml`** and the GitHub deployment environment
  **`npm-publish`**.
- **If a publish ever fails asking for a token, the Trusted Publisher config is
  broken — fix it on npmjs.com. Never add an npm token secret.**

## Cutting a release

1. **Bump the version.** Update `"version"` in `package.json` (SemVer).
2. **Update `CHANGELOG.md`.** Move the `[Unreleased]` entries under a new
   `## [X.Y.Z] — YYYY-MM-DD` heading and refresh the compare links at the bottom.
3. **Merge to `main`** via PR — the CI gates in
   [`ci.yml`](../.github/workflows/ci.yml) must pass.
4. **Cut a GitHub Release.** Tag it **`vX.Y.Z`**, where `X.Y.Z` **exactly
   matches** `package.json` `version`. A guard step in `publish.yml` fails the
   run if the tag (minus its leading `v`) does not equal the package version.
5. **Publishing the Release triggers `publish.yml`.** It runs on node 24 with
   `npm@latest` (Trusted Publishing needs npm >= 11.5.1), re-runs the full check
   suite and build (via the `prepublishOnly` + `prepack` hooks), verifies the
   tag, then runs `npm publish --provenance --access public`. The `--provenance`
   flag overrides `publishConfig.provenance: false`, so the release carries a
   signed provenance attestation.

## Verify the release

1. **GitHub Actions** — the `publish` workflow run for the Release is green.
2. **npmjs.com** — <https://www.npmjs.com/package/pharn> shows the new version,
   and that version shows a **provenance** badge linking back to the GitHub
   Actions run.
3. **Smoke-test** — `npx pharn@latest --version` prints the new version.

## First publish of a new package name (one-time exception)

npm only lets you configure a Trusted Publisher on a package that **already
exists**. So the _very first_ publish of a brand-new package name is done
**manually and locally** by a maintainer who is logged in (`npm login`):

```bash
npm publish   # provenance stays off (publishConfig.provenance: false) — no OIDC available yet
```

Then configure the Trusted Publisher on npmjs.com (workflow `publish.yml`,
environment `npm-publish`), and every subsequent release goes through
`publish.yml` as described above. This exception applies **only** to introducing
a new package name — never to a normal version bump of `pharn`.
