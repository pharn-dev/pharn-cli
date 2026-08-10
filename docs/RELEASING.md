# Releasing pharn

Maintainer guide for publishing a new version of the `@pharn-dev/pharn` npm package.

Releases are automated: cut a **GitHub Release** and
[`.github/workflows/publish.yml`](../.github/workflows/publish.yml) publishes to
npm. Authentication is **npm Trusted Publishing (OIDC)** — there are **no npm
tokens** anywhere in this repository or in its GitHub Actions secrets.

## The package

The canonical npm package is **`@pharn-dev/pharn`** (org-scoped) —
<https://www.npmjs.com/package/@pharn-dev/pharn>. It exposes a single `pharn` bin.

> The unscoped name `pharn` is **not publishable**: npm rejects it with E403 as
> too similar to existing packages (`yarn`, `charm`, `sharp`), and a scoped name
> sidesteps that similarity check — so `@pharn-dev/pharn` is canonical. An earlier
> `@pharn-dev/pharn@0.2.0` was published then unpublished on 2026-07-22, so
> `0.2.0` is permanently burned on this name; releases resume at `0.3.0`. The
> installed binary stays `pharn`.

## How publishing is authenticated

`publish.yml` uses **npm Trusted Publishing (OIDC)**: at publish time the
workflow exchanges a short-lived GitHub OIDC id-token with npm — no long-lived
credential is stored or passed.

- **No secrets, no tokens** — not in the repo, not in Actions secrets, not in
  the workflow. `permissions: id-token: write` is what enables the OIDC exchange
  (and the `--provenance` attestation); it is not a secret.
- The Trusted Publisher is configured **on npmjs.com** for package `@pharn-dev/pharn`,
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
5. **Publishing the Release triggers `publish.yml`.** It runs on node 24, whose
   bundled npm already satisfies the npm >= 11.5.1 that Trusted Publishing
   needs — an **Assert npm floor** step enforces that and fails the run if it
   ever stops being true, so nothing is installed at publish time. The run then
   re-runs the full check suite and build (via the `prepublishOnly` + `prepack`
   hooks), verifies the tag, and runs `npm publish --provenance --access
   public`. The `--provenance` flag overrides `publishConfig.provenance: false`,
   so the release carries a signed provenance attestation.

## Verify the release

1. **GitHub Actions** — the `publish` workflow run for the Release is green.
2. **npmjs.com** — <https://www.npmjs.com/package/@pharn-dev/pharn> shows the new version,
   and that version shows a **provenance** badge linking back to the GitHub
   Actions run.
3. **Smoke-test** — `npx @pharn-dev/pharn@latest --version` prints the new version.

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
a new package name — never to a normal version bump of `@pharn-dev/pharn`.
