# PLAN — release-tag-ref

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- base: 95426567c2197a0dc4807382287c44b1a1385077
- increment: the verified-release channel resolves the release tag's commit through the full tag ref (`GET /repos/pharn-dev/pharn-oss/commits/refs/tags/<tag>`) instead of the bare name (`commits/<tag>`), so a branch named like the tag cannot stand in for the verified release; and the `main` channel's SHA resolve asks for `commits/refs/heads/main`, so a tag named `main` cannot stand in for the branch (Linear CORE-169, C3.1). Released as 0.18.5.
- layer(s): product `src/lib/` (fetch boundary, ARCHITECTURE.md §4) + its tests + CHANGELOG/CLAUDE.md; LIMITS.md and THREAT-MODEL.md text is proposed for the human (hook-protected, fix #2)
- constitution_refs: [P0, P1, P2, P4, P5, P6, P7]

## Why (live state, read this run)

- `origin/main` = `9542656`; `src/lib/release.ts:161` builds `` `${API}/repos/${REPO}/commits/${tag}` `` — a bare ref name. GitHub does not document how a bare name is resolved when a branch and a tag share it; shadowing is suspected, not reproduced (CORE-169 Evidence).
- Measured this run (unauthenticated GETs, `Accept: application/vnd.github.sha`), latest release `v7.10.3`:
  - `commits/v7.10.3` → 200 `39ec5825b7b8…`
  - `commits/tags/v7.10.3` → **422** "No commit found for SHA: tags/v7.10.3" (the documented form does not work)
  - `commits/refs/tags/v7.10.3` → 200 `39ec5825b7b8…` — same commit as today's URL
  - `git ls-remote`: `refs/tags/v7.10.3` = `d153adb5…` (tag object) and `^{}` = `39ec5825…` — v7.10.3 is an ANNOTATED tag, so `refs/tags/` dereferences an annotated tag to its commit. No lightweight release tag exists to measure; the lightweight case is covered by a stub only.
  - `commits/refs/heads/main` → 200, same sha as `commits/main` (relevant only to the optional open question below).
- `fetchRepo` downloads by `source.sha` (`src/lib/repo.ts`), so this one resolve is the only place the tag becomes a commit.
- The working tree carries `.updated` copies from an earlier hand-over (`src/lib/release.updated.ts`, `LIMITS.updated.md`, `tests/release.test.updated.ts`, `tests/commands-integration.test.updated.ts`, `CHANGELOG.updated.md`). The last two also carry an UNRELATED change (the `.claude/agents` surface, status/records fixes) and are stale against 0.18.4, so this increment is rebuilt from `origin/main`, not applied from those copies, and does not touch them.

## Design

- `resolveLatestRelease` requests `` `${API}/repos/${REPO}/commits/refs/tags/${tag}` `` — same `get()` (redirect:error, 8 s deadline, `MAX_SHA_BYTES` cap), same `application/vnd.github.sha`, same COMMIT_RE check, same refusal wording (`could not resolve <tag> to a commit (HTTP <n> from <url>)`, which names `--ref main` through `refusal()`). `tag` already passed `RELEASE_TAG_RE`, so it stays a safe URL segment.
- `immutable` is NOT required (pharn-oss releases report `immutable: false`; requiring it would fail every install — CORE-169 Change).
- `fetchCommitSha` (`src/lib/repo.ts`, the `main` channel) requests `` `${API}/repos/${REPO}/commits/refs/heads/${REPO_BRANCH}` `` — same media type, deadline, cap and null-on-failure degraded mode (LIMITS §3b). The float download already uses `refs/heads/${REPO_BRANCH}` (`repo.ts:164`), measured 200 on codeload; untouched.
- No other request changes; `resolveLatestReleaseVersion` (status --no-drift) makes no commit request and is untouched.

## Files

- `src/lib/release.ts` — the tag-ref URL + a comment saying why (bare name may be a branch; `tags/<tag>` answers 422) — layer lib (fetch boundary)
- `tests/release.test.ts` — `shaUrl` → `commits/refs/tags/<tag>`; a literal-URL assertion (not via the helper); annotated- and lightweight-tag stubs both resolve to the commit with exactly two requests; a 404 AND a 422 on the tag path each refuse with `ReleaseResolveError` naming `--ref main`; the stub refuses any bare `commits/<tag>` request — layer tests
- `tests/commands-integration.test.ts` — the stubbed sha URL (line 69) → `commits/refs/tags/<tag>`; `RESOLVE_URL` (line 66) → `commits/refs/heads/main` — layer tests
- `src/lib/repo.ts` — `fetchCommitSha` URL → `commits/refs/heads/${REPO_BRANCH}` + why — layer lib (fetch boundary)
- `tests/repo.test.ts` — `RESOLVE_URL` → `commits/refs/heads/main`; a literal-URL assertion; the stub refuses a bare `commits/main` — layer tests
- `tests/repo-signals.test.ts` — `RESOLVE_URL` → `commits/refs/heads/main` — layer tests
- `package.json`, `package-lock.json` — `npm version --no-git-tag-version 0.18.5` — layer release
- `tests/release-consistency.test.ts` — add `'v0.18.4'` to `KNOWN_TAGS` (the tag exists on origin — `git ls-remote --tags origin` → `cb9dc616…`; the 0.18.5 link names it as its base). Added during build: the release-consistency gate refused the compare link — layer tests
- `CHANGELOG.md` — new `## [0.18.5] — 2026-11-12` with a `### Security` entry (both resolves); compare links `[Unreleased]` → `v0.18.5...HEAD`, `[0.18.5]` → `v0.18.4...v0.18.5` — layer docs
- `CLAUDE.md` — the `lib/release.ts` paragraph names `commits/refs/tags/<tag>` (was `commits/<tag>`) — layer docs
- `.dev/features/release-tag-ref/PLAN.md` — this plan — layer dev-loop artifact

### Proposed for the human (hook-protected — the agent cannot write them)

- `LIMITS.md §3e` — after "the release channel waits for a verified release": ", and resolves its commit through the tag ref itself (`commits/refs/tags/<tag>`), so a branch named like the tag cannot stand in for it." (identical to the existing `LIMITS.updated.md`, whose diff is only this change)
- `THREAT-MODEL.md` (~l.171) — "the release `tag_name` against `RELEASE_TAG_RE` and the tag's commit — resolved through the full tag ref `commits/refs/tags/<tag>`, never a bare name a same-named branch could answer — against `COMMIT_RE`"
- `THREAT-MODEL.md` (l.73) — "`fetchCommitSha` reads the branch head over the GitHub REST API" → "… reads the branch head over the GitHub REST API through its full ref (`commits/refs/heads/main`, so a tag named `main` cannot answer)"

### Explicitly not touched

- every existing `*.updated.*` file in the working tree

## Contracts satisfied

- CLAUDE.md "`lib/validate.ts` is security-sensitive" network floor (redirect:error, 8 s, body cap) — unchanged, reused via `get()`
- CLAUDE.md `lib/release.ts` FAIL-CLOSED contract — a non-2xx on the tag path stays a `ReleaseResolveError` naming `--ref main`; never a float to the tip

## Evals to write (P1)

- URL shape → the sha request is exactly `https://api.github.com/repos/pharn-dev/pharn-oss/commits/refs/tags/v6.54.1` (literal)
- annotated tag (stub answers the dereferenced commit) → `{kind:'release', sha: <commit>}`, two requests
- lightweight tag (stub answers the commit) → same result, two requests
- 404 on the tag path → `ReleaseResolveError`, message contains `could not resolve v1.0.0 to a commit` and `--ref main`
- 422 on the tag path → same (existing case, kept)
- a request to the bare `commits/<tag>` → the stub throws `unexpected request` (the resolver never asks for it)
- `main` channel: `fetchCommitSha` requests exactly `https://api.github.com/repos/pharn-dev/pharn-oss/commits/refs/heads/main` (literal); a bare `commits/main` is never requested
- integration: `runInit --yes` (release channel) and the `main`-channel commands still install against the stubbed tarball with the new URLs

## Guarantee audit (P0)

- "the release's commit is resolved from the TAG, not a same-named branch" → floor: the request URL is a fixed literal prefix + a `RELEASE_TAG_RE`-validated segment (enum-regex), test-pinned. That GitHub's `commits/refs/tags/<name>` resolves only `refs/tags/<name>` is GitHub's documented full-ref semantics, MEASURED this run for an annotated tag — an external behaviour, stated as such, not a CLI guarantee.
- "a failed resolve refuses and names `--ref main`" → floor: unchanged `refusal()` path, tested for 404 and 422.
- "the installed tree is the verified release" → still provenance, not cryptography (LIMITS §1b); this change narrows which ref the provenance points at, nothing more. Release immutability is advisory/pharn-oss-side (not required here).

## Trust audit (P2)

- `tag_name` (untrusted, from `releases/latest`) → validated by `RELEASE_TAG_RE` before becoming a URL segment (unchanged). The sha response (untrusted) → `COMMIT_RE` before it is used or recorded (unchanged). No new input is ingested.

## Determinism audit (P5)

- No new branch. The refusal paths are status-code membership tests already in `get()`/`httpReason()`.

## Open questions — resolved at GATE 1 (2026-11-12)

1. `main` channel → **include** `commits/refs/heads/main` (folded into Design/Files above).
2. Version → **bump to 0.18.5** in this PR (merging publishes).
3. Delivery → **feature branch `fix/release-tag-ref` in a fresh worktree off `origin/main`, committed**; a PR only on the human's word at GATE 2.

Plan approved as written, with the three answers above.
