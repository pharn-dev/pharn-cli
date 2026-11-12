# PLAN — release-0184 (cut 0.18.4 from the two merged CI / dev-loop changes)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: release `main` as 0.18.4 — move the `[Unreleased]` entry for #357 under a new
  `## [0.18.4] — 2026-11-12` heading, add the missing entry for #358, bump the version, and add
  `v0.18.3` to `KNOWN_TAGS`. No code change.
- layer(s): release metadata, tests
- constitution_refs: [P1, P4, P6, P7]

## Why (P7 — a real need, verified this run)

- The user asked to release pharn-cli after #357 and #358 merged (relayed by the starting session;
  GATE 1 / GATE 2 are the user's own answers here).
- `origin/main` @ `6ca4634` (fetched this run) carries, since `v0.18.3` (`f83b736`, the latest
  release per `gh release list`):
  - `7a3e649` #357 — `ci.yml` gains a `pharn-ci comment` job, `pharn-ci-comment.yml` comments on
    fork PRs only, `tests/ci-workflow.test.ts` pins it. Its `[Unreleased]` `### Changed` entry
    already exists and says "No change to the published CLI."
  - `6ca4634` #358 — the eight `.pharn/` runtime files are untracked and ignored (`/.pharn/*`,
    `!/.pharn/ci.yml`), pinned by `tests/repo-runtime-state.test.ts`. It wrote **no** CHANGELOG
    entry.
- `git diff --stat v0.18.3 origin/main -- src README.md LICENSE package.json scripts` is empty, and
  `npm pack --dry-run` ships only `LICENSE README.md dist/index.js package.json` (`files: ["dist"]`).
  So the 0.18.4 tarball's CLI behaves exactly as 0.18.3's; only the version string differs.

## Discovery — verified this run (P6)

- `.pharn/writes-scope.json` is no longer tracked (`git ls-files .pharn` → only `.pharn/ci.yml`), so
  no restore step is needed before commit.
- `tests/release-consistency.test.ts` `KNOWN_TAGS` ends at `v0.18.2`; once `package.json` is
  0.18.4, the `[0.18.3]` compare link's `v0.18.3` must be a known tag (docs/RELEASING.md step 2).
- Release mechanics (CLAUDE.md "Releasing"): the bump travels in the PR; `publish.yml` publishes
  0.18.4 to npm and creates the `v0.18.4` GitHub release on merge. `scripts/release-notes.mjs`
  needs a non-empty `[0.18.4]` section (checked by `release-consistency.test.ts`).

## Files

- `CHANGELOG.md` — rename `[Unreleased]`'s content into `## [0.18.4] — 2026-11-12` (keeping
  #357's `### Changed` entry), add a `### Changed` entry for #358, state that the published CLI's
  behavior is unchanged, leave an empty `## [Unreleased]`, update the compare links — layer: release
- `tests/release-consistency.test.ts` — add `v0.18.3` to `KNOWN_TAGS` — layer: tests
- `package.json`, `package-lock.json` — `npm version --no-git-tag-version 0.18.4` — layer: release

## Contracts satisfied

- None touched (`pharn-contracts` is not involved; release procedure per `docs/RELEASING.md`).

## Evals to write (P1)

- No new behavior, so no new test. The existing `tests/release-consistency.test.ts` is the check:
  lockfile version = package version, a non-empty `[0.18.4]` section exists, and every compare
  link resolves to a known tag or `v<version>` (fails until `v0.18.3` is added).

## Guarantee audit (P0)

- "the published CLI is unchanged from 0.18.3" → floor-checkable this run: the empty
  `git diff v0.18.3 origin/main` over the published inputs, and the `files` list. Stated in the
  CHANGELOG as a fact of this release, not a guarantee the CLI makes.

## Trust audit (P2)

- No untrusted input ingested.

## Determinism audit (P5)

- No branch added.

## Out of scope (named, not done)

- The worktree writes-scope hook follow-up (`Make writes-scope hooks work in worktree sessions`)
  is its own session and PR; not part of this release.

## Open questions (HALT)

- None open. Version 0.18.4 (patch), dated 2026-11-12 — confirmed at GATE 1.

## Approval

- Approved as written by the user at GATE 1, 2026-11-12.
