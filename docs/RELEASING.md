# Releasing pharn

Maintainer guide for publishing a new version of the `@pharn-dev/pharn` npm package.

Releases publish on merge: a pull request that bumps the version **is** the
release. When it merges to `main`,
[`.github/workflows/publish.yml`](../.github/workflows/publish.yml) publishes to
npm, then tags the commit and creates the GitHub Release. Authentication is
**npm Trusted Publishing (OIDC)** — there are **no npm tokens** anywhere in this
repository or in its GitHub Actions secrets.

## The package

The canonical npm package is **`@pharn-dev/pharn`** (org-scoped) —
<https://www.npmjs.com/package/@pharn-dev/pharn>. It exposes a single `pharn` bin.

> The unscoped name `pharn` is **not publishable**: npm rejects it with E403 as
> too similar to existing packages (`yarn`, `charm`, `sharp`), and a scoped name
> sidesteps that similarity check — so `@pharn-dev/pharn` is canonical. An earlier
> `@pharn-dev/pharn@0.2.0` was published then unpublished on 2026-07-22, so
> `0.2.0` is permanently burned on this name; releases resumed at `0.3.0`. The
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

Put the release in the pull request that ships the change (or in a PR of its
own, when several merged changes go out together):

1. **Bump the version** in `package.json` and `package-lock.json` (SemVer, plain
   `X.Y.Z` — prereleases are refused):

   ```bash
   npm version --no-git-tag-version 0.12.0
   ```

2. **Update `CHANGELOG.md`.** Move the `[Unreleased]` entries under a new
   `## [X.Y.Z] — YYYY-MM-DD` heading, and refresh the compare links at the
   bottom (`[Unreleased]` now compares from `vX.Y.Z`; add a `[X.Y.Z]` line).
   The section under that heading becomes the GitHub Release notes, verbatim.
3. **Merge the PR** once the required checks pass. The `Test` check includes
   `tests/release-consistency.test.ts`, which fails the PR when
   `package-lock.json` does not carry the same version or `CHANGELOG.md` has no
   non-empty section for it — so a half-done bump is caught before the merge.

A PR that does **not** bump the version releases nothing: leave the version
alone and add your entry under `[Unreleased]`. Dependabot and docs merges work
the same way. Whether a PR should bump, and to which level, is the author's and
the reviewer's call; no check can know that.

## What the merge runs

Every push to `main` runs `publish.yml`. Its four jobs run one after another,
and a workflow-level `concurrency` group keeps two runs from overlapping:

- **`gate`** refuses any ref other than `main`, requires `package.json`
  `version` to be plain `X.Y.Z`, and asks the remote whether the tag `vX.Y.Z`
  exists (`git ls-remote --exit-code`). Tag present → the run ends here, green,
  having published nothing. Tag absent → release. Any other answer (network,
  auth) fails the run rather than guessing.
- **`build`** holds no publish rights (`id-token` is not granted to it). Before
  installing anything it checks the version again, that the commit is
  contained in `main`, and extracts the release notes with
  `scripts/release-notes.mjs` (a missing or empty CHANGELOG section fails here).
  It then runs `npm ci`, `npm run check` and `npm run test:coverage`, packs the
  tarball (`npm pack`, whose `prepack` builds it), installs that tarball into a
  scratch directory and runs `pharn --version`, and uploads the tarball and the
  notes as an artifact.
- **`publish`** is the only job with `id-token: write` and the `npm-publish`
  environment. It checks out nothing and installs nothing: on node 24, whose
  bundled npm already satisfies the npm >= 11.5.1 Trusted Publishing needs (an
  **Assert npm floor** step enforces that), it asks the registry whether the
  version is already published — HTTP 200 skips the publish, 404 publishes,
  anything else fails the run — and then runs
  `npm publish <tarball> --provenance --access public --ignore-scripts`. The
  `--provenance` flag overrides `publishConfig.provenance: false`, so the
  release carries a signed provenance attestation.
- **`release`** is the only job with `contents: write`. It checks out nothing
  and installs nothing: it runs `gh release create vX.Y.Z` at the built commit
  with the extracted notes, which also creates the tag. A Release that already
  exists is left alone.

npm comes first and the tag second, so a tag always means the version is on
npm. A Release created with the workflow's `GITHUB_TOKEN` starts no other
workflow, which is why tagging happens inside this run.

Why the split: every step of a job that holds `id-token: write` can request the
token npm trades for publish rights. Keeping the dev toolchain (install scripts,
linters, tests, bundler) out of that job means a compromised dev dependency can
no longer publish on its own. It can still influence the tarball's content in
`build` — the residual this does not close.

Note that `pharnVersion` (this package) and `skillsVersion` (upstream's
`SKILLS_VERSION`, which an install records separately) are independent numbers.
Releasing the CLI neither reads nor moves the content version. If a release
requires newer content, coordinate upstream's `MIN_CLI` file in the same window
— that is the handshake that refuses an under-versioned CLI.

## When a release run fails

- **Re-run it.** Every job is safe to repeat: the gate releases only while the
  tag is absent, `publish` skips a version npm already has, and `release`
  leaves an existing Release alone. A run that failed after npm but before the
  tag picks up where it stopped.
- **A failed run that nobody re-runs is picked up by the next merge.** Its
  `gate` still finds no tag for the version on `main`, so it releases that
  version — built from the later commit, which includes whatever merged in
  between (a docs or dependency change, say). Re-run the failed run first if
  the release should contain exactly the bump commit.
- **A run that was cancelled or never ran** (see the queueing note below) can be
  started again from **Actions → publish → Run workflow** on `main`. It releases
  the version currently on `main`, if that version has no tag yet.
- **A tag that exists without a release behind it** (pushed by hand, say) makes
  the gate skip that version for good. Delete it
  (`git push --delete origin vX.Y.Z`) and re-run, or bump to the next version.

## Limits

- **`publish.yml` runs only after a merge.** No pull request executes it.
  `tests/publish-workflow.test.ts` pins its triggers, job graph and permissions
  and executes the `Decide` and `Registry check` steps against a stub `git` and
  a local HTTP server, but the first real run of any other change to the
  workflow is the next release.
- **Queued runs can be superseded.** GitHub keeps one pending run per
  concurrency group. If several version bumps merge while a release is running,
  only the newest waiting run survives, and an intermediate version may never
  be published. Its CHANGELOG section then describes a version npm never had.
- **No click between merge and npm.** While the `npm-publish` environment has
  no required reviewers, merging a bump publishes it. To add a manual approval,
  set a required reviewer on the environment (repository **Settings →
  Environments → `npm-publish`**); the `publish` job then waits for an approval
  in the Actions run.
- **The Trusted Publisher is not tied to the trigger.** It is configured for the
  workflow file `publish.yml` and the `npm-publish` environment, which this flow
  keeps; nothing in this repository can check the npmjs.com side, so the first
  release after this change is also the test that it accepts a `push`-triggered
  run.

## Verify the release

1. **GitHub Actions** — the `publish` workflow run for the merge is green, and
   the **Releases** page shows `vX.Y.Z` with the CHANGELOG section as its notes.
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
