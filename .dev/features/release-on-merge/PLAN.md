# PLAN — release on merge (version bump carried in the feature PR)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # sha256 of ARCHITECTURE.md, read this run
- increment: `publish.yml` runs on every push to `main` and releases exactly when `package.json`'s version has no `v<version>` tag yet: gate → build (unprivileged, as today) → publish (the only `id-token` job, now idempotent) → a new `release` job that tags the built commit and creates the GitHub Release from that version's CHANGELOG section. The manual "cut a GitHub Release" step and the separate `chore(release)` PR go away; the version bump + CHANGELOG move into the feature PR.
- layer(s): repo tooling (`.github/workflows/publish.yml`, one `scripts/` helper) + its tests + maintainer docs. No `src/` change, no `pharn-contracts` change, no CLI behavior change.
- constitution_refs: [P0, P1, P4, P5, P6, P7]

## Discovery (live state, read this run)

- `publish.yml` triggers on `release: [published]`. `build` (no `id-token`) checks `GITHUB_REF_NAME` is `vX.Y.Z` = `package.json` and that `GITHUB_SHA` is an ancestor of `origin/main`, then `npm ci` → `check` + `test:coverage` → `npm pack` into `$RUNNER_TEMP/pkg` → smoke → upload artifact `npm-tarball`. `publish` (only job with `id-token: write` + `environment: npm-publish`) asserts npm ≥ 11.5.1, downloads the tarball, `npm publish ./pkg/… --provenance --access public --ignore-scripts`.
- npm Trusted Publisher is pinned to workflow file `publish.yml` + environment `npm-publish` (`docs/RELEASING.md`). Neither name changes in this plan.
- The `npm-publish` environment has **no protection rules** (`gh api …/environments/npm-publish` → `protection_rules: []`).
- `main` ruleset (`gh api …/rulesets/18605288`): PR required (1 approval + code-owner), required signatures, non-fast-forward, strict required checks (9 + 2 Socket); only bypass is the maintainer user. Ruleset `target: branch` — tags are not covered. This plan pushes nothing to `main`.
- Last releases: v0.11.0 / v0.10.0 / v0.9.0 / v0.7.1 / v0.7.0 all exist as tags; `package.json` and `package-lock.json` (root + `packages[""]`) are `0.11.0`; `CHANGELOG.md` has `## [0.11.0] — 2026-10-11` and compare links at the bottom.
- A release created with `GITHUB_TOKEN` does not trigger other workflows (GitHub rule) — so tag + release must be created inside this same run, and nothing downstream listens for it.
- Pins on `publish.yml` today:
  - `.dev/floor/check-run-pins.test.mjs` — `id-token: write` appears exactly once; slices from the `publish:` job header **to end of file** and asserts no `npm ci|install|i`, no `actions/checkout@`, and `--ignore-scripts` there; `Assert npm floor` + `11.5.1` present; no `install -g` / `@latest`; `npm ci`-class skips counted exactly (`skipped === 10`); pack destination `mkdir -p` in the packing job.
  - `.dev/floor/check-action-pins.mjs` — every `uses:` SHA-pinned with a version comment.
  - `tests/publish-workflow.test.ts` — every `.tgz` passed to `npm publish|install` is an explicit path; its comment says publish.yml "runs solely on a published Release".
  - `tests/ci-workflow.test.ts` header comment says publish.yml "runs on a published Release and reports no required context".
- Docs naming the manual flow: `docs/RELEASING.md` (§ Cutting a release), `CLAUDE.md` (§ Releasing), `CONTRIBUTING.md:19`, `.github/PULL_REQUEST_TEMPLATE.md` (no release item).

## Design

**Trigger.** `on: push: branches: [main]` + `workflow_dispatch` (recovery: re-drive a release whose run was cancelled/superseded; runs on the selected ref, refused unless it is `refs/heads/main`). The `release: published` trigger is **removed** — a human-cut Release would otherwise race the push run for the same version. `concurrency: { group: publish, cancel-in-progress: false }` so two quick merges never publish in parallel.

**Jobs (needs-chain `gate → build → publish → release`; YAML order the same).**

1. **`gate`** (`contents: read`; checkout with `persist-credentials: false`; no `npm ci`, no setup-node beyond what reading `package.json` needs — `node` is on the runner). Refuses unless `github.ref == 'refs/heads/main'`. Reads `package.json` `version`, requires `^[0-9]+\.[0-9]+\.[0-9]+$` (a prerelease/garbage version fails the run, it does not "skip"). Tag existence: `git ls-remote --exit-code --tags origin "refs/tags/v$VERSION"` — exit `0` → `release=false` (already released; the normal outcome for dependabot/docs/feature merges with no bump), exit `2` → `release=true`, **any other exit → fail** (never read a network error as "no tag"). Outputs `version`, `release`.
2. **`build`** — `needs: gate`, `if: needs.gate.outputs.release == 'true'`. Unchanged except: the `Verify tag` step becomes `Verify version` (`package.json` at `GITHUB_SHA` == `needs.gate.outputs.version`, strict regex, keep the `merge-base --is-ancestor "$GITHUB_SHA" origin/main` check); a new `Release notes` step runs `node scripts/release-notes.mjs "$VERSION" CHANGELOG.md > "$RUNNER_TEMP/pkg/RELEASE_NOTES.md"` (fails if the section is missing/empty) **before** `npm ci`, so a forgotten CHANGELOG costs no install; the notes file rides the existing `npm-tarball` artifact (upload `path` becomes the two files). Still no `id-token`.
3. **`publish`** — `needs: [gate, build]`; otherwise as today (only `id-token: write` job, `environment: npm-publish`, no checkout, no install, `--ignore-scripts`). New first step **`Registry check`**: a Node-stdlib `fetch` of `https://registry.npmjs.org/@pharn-dev%2fpharn/<version>` (`redirect: 'error'`, a timeout) mapping status by membership — `200 → published=true` (skip the publish step; idempotent re-run after a later-job failure), `404 → published=false`, **anything else → fail**. The `Publish` step runs only when `published == 'false'`.
4. **`release`** (new) — `needs: [gate, publish]`; `permissions: contents: write` (the ONLY `contents: write` in the file), **no `id-token`, no checkout, no install**. Downloads the artifact (same pinned `download-artifact` SHA), then `gh release create "v$VERSION" --repo "$GITHUB_REPOSITORY" --target "$GITHUB_SHA" --title "v$VERSION" --notes-file pkg/RELEASE_NOTES.md --verify-tag=false` with `GH_TOKEN: ${{ github.token }}`. If the release already exists (`gh release view` exit 0) the step is a no-op, so a re-run is idempotent.

**Order rationale.** npm first, tag second: a tag then always means "this version is on npm". If `release` fails after a successful publish, re-running the workflow: gate (no tag) → build → publish (`200` → skip) → release. A tag-first order would leave a tag claiming a release that may never have reached npm.

**`scripts/release-notes.mjs`** (Node stdlib, no deps; repo code, executed only in the unprivileged `build` job). Args: version, changelog path. Prints the body between the heading `## [<version>]` (exact bracketed match, any date suffix) and the next `## [` heading (or the link-reference block / EOF), trimmed. Exit 1 with one stderr line when the version arg is not strict `X.Y.Z`, the heading is absent, appears twice, or the body is empty. The version is matched as a literal string, never interpolated into a RegExp.

**PR-time consistency gate** (so a bad bump fails the PR, not the post-merge release): `tests/release-consistency.test.ts` asserts on every CI run that `package.json` `version` is strict `X.Y.Z`, equals `package-lock.json` `version` and `packages[""].version`, and that `scripts/release-notes.mjs` extracts a non-empty section for it from `CHANGELOG.md`. It cannot know whether the version *should* have been bumped — that stays the author's call (advisory, named in docs).

## Files

- `.github/workflows/publish.yml` — trigger `push: main` + `workflow_dispatch`, `concurrency`, new `gate` job, `build` verify-version + release-notes step + two-file artifact, `publish` registry check + conditional publish, new `release` job; header comment rewritten for the new flow. — layer repo tooling
- `scripts/release-notes.mjs` — extract one version's CHANGELOG section (stdlib, exit 1 on missing/duplicate/empty). — layer repo tooling
- `tests/release-notes.test.ts` — behavioral tests of the extractor (fixtures in temp dirs + the live CHANGELOG). — layer tests
- `tests/release-consistency.test.ts` — live `package.json` ↔ `package-lock.json` ↔ `CHANGELOG.md` agreement. — layer tests
- `tests/publish-workflow.test.ts` — keep the tarball-path pin (now also covering the notes file not being passed to `npm`); add structural pins: triggers are exactly `push: [main]` + `workflow_dispatch` (no `release:`), `concurrency` with `cancel-in-progress: false`, job ids and `needs` chain `gate → build → publish → release`, `contents: write` exactly once and inside `release`, `release` has no `id-token`/checkout/install, gate's `ls-remote --exit-code` maps `0`/`2` and fails otherwise, `Publish` step is conditioned on the registry check; update the header comment. — layer tests
- `.dev/floor/check-run-pins.test.mjs` — the PHARN-07 pin slices the `publish` job **to the next job header** (not EOF), so the new `release` job neither hides in nor pollutes it; add the mirror pin that `release` holds no `id-token` and installs nothing; keep `skipped === 10` (the gate job adds no lockfile install) and update its comment. — layer floor tests
- `tests/ci-workflow.test.ts` — header comment only: publish.yml now runs on push to `main` and still reports no required context. — layer tests
- `docs/RELEASING.md` — rewrite "Cutting a release": bump `package.json` + lockfile (`npm version --no-git-tag-version <x.y.z>`) and add the CHANGELOG section in the feature PR; merging releases; what a non-bump merge does (gate exits clean); idempotent re-run and `workflow_dispatch` recovery; residuals (below); verification steps unchanged; the environment-reviewer follow-up. — layer docs
- `CLAUDE.md` — § Releasing: replace the "cut a GitHub Release" flow with the merge-triggered one (jobs, idempotency, notes source, PR-time consistency test). — layer docs
- `CONTRIBUTING.md` — line 19 summary of the release flow. — layer docs
- `.github/PULL_REQUEST_TEMPLATE.md` — one checklist item: "Releasing? bump `package.json` + `package-lock.json` and add the `## [x.y.z]` CHANGELOG section in this PR — merging publishes." — layer docs
- `CHANGELOG.md` — `[Unreleased]` → `### Changed` one entry for contributors (releases now publish on merge of a version bump). **No version bump in this PR** — its merge is the first live exercise of the skip path (tag `v0.11.0` exists → gate ends, nothing published). — layer docs

## Contracts satisfied

- `pharn-contracts` — none touched (repo tooling only; no finding/capability/rule schema involved).
- The `main` ruleset's required-contexts contract (`tests/ci-workflow.test.ts`) — unaffected: publish.yml still does not run on `pull_request` and reports no required context.

## Evals to write (P1)

- release-notes: `## [0.11.0] — 2026-10-11` section → exact body up to the next `## [`; last released section before the link block → body without the link refs; heading absent → exit 1; heading twice → exit 1; empty body → exit 1; version `0.11.0-rc.1` / `v0.11.0` / `../x` → exit 1; version containing regex metacharacters (`0.1.0` vs `0x1x0` lookalike) → no false match (literal match proven); `[Unreleased]` is never returned for a numeric version.
- release-consistency (live): `package.json` = lockfile root = `packages[""]`; CHANGELOG section for it is non-empty. Mutation control: a fixture with a bumped `package.json` and no CHANGELOG heading → the extractor fails (so the live test is not vacuous).
- publish-workflow structure: each pin listed under Files; plus mutation controls — re-adding `release: types: [published]` is caught; moving `contents: write` to top-level or into `build` is caught; adding `id-token: write` to `release` is caught (count ≠ 1); removing the `if:` on `Publish` is caught.
- run-pins PHARN-07: slice ends at the next job header (a fixture where an `npm ci` sits in a job *after* `publish` must not be attributed to `publish`, and one *inside* `publish` still is).
- Existing: `check-action-pins` over the new `uses:` lines (same SHAs) and `check-run-pins` over the new `run:` lines stay GREEN; `node .dev/floor/validate.mjs .` GREEN.

## Guarantee audit (P0)

- "A merge whose `package.json` version already has a tag publishes nothing" → floor: **enum/exit-code membership** (`git ls-remote --exit-code` ∈ {0 → skip, 2 → release}, else fail) + job `if:` on the gate output; pinned statically by `tests/publish-workflow.test.ts`. The *runtime* behavior is only exercised by real runs (no PR check executes publish.yml) — named residual R1.
- "Only the `publish` job can mint the npm OIDC token" → floor: **regex pin** (`id-token: write` count == 1, inside `publish`, sliced to its own job) — unchanged guarantee, tighter slice.
- "Only the `release` job can write to the repo (tags/releases), and it runs no repo or dependency code" → floor: **regex pin** (`contents: write` count == 1 inside `release`; no checkout/install there).
- "A re-run never double-publishes" → floor: **HTTP-status membership** (`200` → skip, `404` → publish, else fail) at run time; npm itself also refuses re-publishing a version (E403) as a second backstop. Static pin that `Publish` is conditioned on it.
- "Release notes are the CHANGELOG section for that version" → floor: **exact-string heading match** in `release-notes.mjs`, behaviorally tested.
- "A version bump without a CHANGELOG section / with a stale lockfile fails the PR" → floor: **exact-match** test in the required `Test` gate.
- "The version bump is in the right PR / is the right SemVer level" → **advisory** (author + reviewer judgment; not checkable).
- "Merging = publishing is safe" → **advisory**: the human gate moves from "cut a Release" to the PR review + required checks. Restoring a click-to-publish gate is the environment-reviewer follow-up (human, GitHub setting), not code.
- "The tarball content is not tampered by a dev dependency" → **not claimed** (existing named residual of the build/publish split, unchanged).

## Trust audit (P2)

- No untrusted remote content is ingested by this increment. Inputs are the repo's own `package.json` / `package-lock.json` / `CHANGELOG.md` at a commit that passed review + required checks, the `ls-remote` exit code, and an npm registry HTTP status (only the status code is read — no body is parsed or executed). `RELEASE_NOTES.md` is passed to `gh` as a file (`--notes-file`), never interpolated into a shell line or `${{ }}` expression; the version reaches shell only after the strict `X.Y.Z` regex in `gate` (and again in `build`).

## Determinism audit (P5)

- Every branch is a membership test: ref == `refs/heads/main`; version matches strict regex; `ls-remote` exit ∈ {0, 2}; registry status ∈ {200, 404}; `gh release view` exit ∈ {0, non-zero}. Every "else" fails the run (red, visible) — never a guess, never a silent skip.

## Named residuals (to be written into `docs/RELEASING.md`)

- **R1** — publish.yml still runs only after merge; no PR check executes it. Static pins + the PR-time consistency test are the pre-merge coverage; the first run of the new release path is the next version bump. (Same posture as today's Release-triggered workflow.)
- **R2** — with `cancel-in-progress: false`, GitHub keeps one *pending* run per group: if three bump-merges land while one release runs, the middle one's version can be superseded and never published. Recovery is `workflow_dispatch` only for the version currently on `main`; a superseded intermediate version simply stays unpublished (harmless, but its CHANGELOG section then describes a version npm never had).
- **R3** — no human click between merge and npm while the `npm-publish` environment has no required reviewers.

## Human follow-ups (not code)

- Decide whether to add a required reviewer on the `npm-publish` environment (Settings → Environments). With it, a release waits for one Approve in the Actions run; without it, merge = publish.
- `THREAT-MODEL.md` / `LIMITS.md` are human-only and say nothing about the release pipeline today; whether the "merge = publish" posture belongs there is the maintainer's call.

## Resolved decisions (GATE 1, 2026-10-12)

Approved as written; every open question resolved as recommended:

1. `workflow_dispatch` kept as the recovery path (refused unless the ref is `main`).
2. Order: npm publish → tag + GitHub Release.
3. The PR-time `release-consistency` test is added.
