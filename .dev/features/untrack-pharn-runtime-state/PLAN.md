# PLAN — untrack-pharn-runtime-state (stop committing the dev loop's `.pharn/` runtime state)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: remove the eight runtime-state files under `.pharn/` from the git index
  (`git rm --cached`, the working copies stay), ignore `/.pharn/*` except `/.pharn/ci.yml`, and pin
  that with one vitest test. No `src/` change, no version bump, no CHANGELOG entry (repo-internal; the
  CHANGELOG documents `pharn`, and the CI/deps maintenance PRs carry none).
- layer(s): repo config (`.gitignore`, git index), tests
- constitution_refs: [P1, P5, P6, P7]

## Why (P7 — a real need, verified this run)

- `git ls-files .pharn` (this run) lists nine files. `.pharn/writes-scope.json` has 97 commits and its
  HEAD content scopes `.dev/features/remove-preserve-user-files/SHIP.md` (set 2026-10-12), so every fresh
  checkout starts with that stale scope instead of the hook's designed absent-file default.
- Observed this run: in a session started inside `.claude/worktrees/<name>/`, the PreToolUse hooks run
  with cwd = the MAIN checkout (`enforce-writes-scope.cjs` takes `ROOT` and the scope file from
  `process.cwd()`), whose tracked `.pharn/writes-scope.json` is that stale scope, so every Write/Edit in
  the worktree is denied; re-entering the worktree (EnterWorktree) did not change it. This run's writes
  land because the maintainer temporarily set the main checkout's scope file to this worktree's paths.
  Untracking does NOT fix that cwd mismatch (an absent scope file falls back to `DEFAULT_SAFE_SET`,
  whose globs are relative to the main checkout); it is a separate follow-up.
- Every dev-loop stage rewrites `writes-scope.json` (`set-writes-scope.cjs`) and `/pharn-dev-verify`
  rewrites `pharn-dev-verify/results.json`, so a ship run must `git restore` both before committing (the
  0.18.3 supervise-stage notes record exactly that step).
- `/pharn-dev-regress` Step 1 takes `inside = git diff --name-only <base>` + untracked files; a modified
  tracked `.pharn/writes-scope.json` lands in `--changed`, outside any PLAN's `## Files`, which
  `check-regress.mjs scope` reports as a fix#7 scope breach. Ignored + untracked, it drops out of both.

## Discovery — verified this run (P6)

Tracked `.pharn/` files, classified (writer read from the commands/hooks this run):

| path                                            | class                      | writer                                                                                                                         |
| ----------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `.pharn/ci.yml`                                 | **config — stays tracked** | human; read by the pharn-ci Action / `pharn-ci check`, and from the default branch by `.github/workflows/pharn-ci-comment.yml` |
| `.pharn/writes-scope.json`                      | runtime                    | `.claude/hooks/set-writes-scope.cjs` (every stage's Step 0)                                                                    |
| `.pharn/pharn-dev-verify/results.json`          | runtime                    | `/pharn-dev-verify` Step 1 capture                                                                                             |
| `.pharn/pharn-dev-verify/results-capture1.json` | runtime                    | an old `/pharn-dev-verify` capture (1 commit, 2026-08-17)                                                                      |
| `.pharn/pharn-dev-verify/verdict.json`          | runtime                    | an old `check-verify.mjs` output copy (last 2026-09-07)                                                                        |
| `.pharn/pharn-dev-regress/base-results.json`    | runtime                    | `/pharn-dev-regress` Step 2 capture                                                                                            |
| `.pharn/pharn-dev-regress/head-results.json`    | runtime                    | `/pharn-dev-regress` Step 2 capture                                                                                            |
| `.pharn/pharn-dev-regress/verdict.json`         | runtime                    | an old `check-regress.mjs` output copy                                                                                         |
| `.pharn/pharn-dev-memory-promote/body.md`       | runtime                    | `/pharn-dev-memory-promote` scratch (its Step 2 writes `candidate.json` beside it)                                             |

The durable stage reports live in `.dev/features/<name>/` (`regression-report.json`,
`verify-report.json`, `REGRESSION.md`, `VERIFY.md`); the `.pharn/` copies are captures only.

Nothing depends on them being tracked:

- `.claude/hooks/enforce-writes-scope.cjs` `loadScope()` returns `null` for an absent or unparseable
  scope file → the fail-closed `DEFAULT_SAFE_SET` (`src/**`, `tests/**`, `features/**`,
  `.dev/features/**`); its deny message already says "delete to reset; absence = fail-closed
  default-safe-set". `enforce-writes-scope.test.cjs` covers the no-scope cases ("no scope: …") in fresh
  temp dirs; `set-writes-scope.test.cjs` and `.dev/floor/check-build-complete.test.mjs` also run in temp
  dirs ("the real repo .pharn/ is never touched"). No test reads the repo's own `.pharn/`.
- `.dev/floor/*.mjs`: only `check-build-complete.test.mjs` mentions `.pharn/` (temp root).
- `tests/*.test.ts` mentions of `.pharn/` (`commands-integration`, `root-migration`) build their own
  temp projects. `.github/workflows/*` reference only `.pharn/ci.yml`.
- Every command that writes these does `mkdir -p .pharn/<stage>` or `fs.mkdirSync(…, {recursive})`
  first, so a checkout without them works. `ALWAYS = [".pharn/**"]` in the enforce hook is path-based,
  unaffected by git.
- Effect on other checkouts: pulling this commit deletes their unmodified working copies (→ the
  absent-file default); a checkout with a LOCALLY MODIFIED copy gets git's "would be overwritten"
  refusal on pull and must `git restore` it first. Named in the PR body.

## Files

- `.gitignore` — append a commented block: `/.pharn/*` then `!/.pharn/ci.yml` (one pattern covers
  future runtime files such as `candidate.json`; the negation keeps the config) — layer: repo config
- `.pharn/writes-scope.json` — removed from the index (`git rm --cached`), working copy kept — layer: git index
- `.pharn/pharn-dev-verify/results.json` — same — layer: git index
- `.pharn/pharn-dev-verify/results-capture1.json` — same — layer: git index
- `.pharn/pharn-dev-verify/verdict.json` — same — layer: git index
- `.pharn/pharn-dev-regress/base-results.json` — same — layer: git index
- `.pharn/pharn-dev-regress/head-results.json` — same — layer: git index
- `.pharn/pharn-dev-regress/verdict.json` — same — layer: git index
- `.pharn/pharn-dev-memory-promote/body.md` — same — layer: git index
- `tests/repo-runtime-state.test.ts` — new vitest test (see Evals) — layer: tests

## Contracts satisfied

- none in `pharn-contracts` (repo hygiene; no product surface). The writes-scope hook contract
  (absent file = fail-closed default-safe-set) is cited, not changed.

## Evals to write (P1)

- `tests/repo-runtime-state.test.ts`, via `git` in the repo root (`spawnSync`, no shell):
  - `git ls-files .pharn` → exactly `['.pharn/ci.yml']` (a re-added runtime file fails);
  - `git check-ignore -q` exits 0 for each of the eight runtime paths and for a future
    `.pharn/pharn-dev-memory-promote/candidate.json`;
  - `git check-ignore -q .pharn/ci.yml` exits 1 (the config is never ignored).
  - No skip (amended after pharn-ci TI03 flagged the original `describe.skipIf` as an added skip): every
    place the suite runs (local, the CI `Test` job, `publish.yml`'s build job) is a git checkout, so a run
    without git fails instead of passing silently.

## Guarantee audit (P0)

- "runtime state is not committed" → floor: the vitest test (index membership + `check-ignore` exit
  codes) in the required `Test` check. `.gitignore` alone is advisory (`git add -f` bypasses it); the
  test is the backstop.
- "the hooks still work without the file" → floor: the existing `enforce-writes-scope.test.cjs`
  no-scope cases (unchanged).

## Trust audit (P2)

- No untrusted input is ingested. The test runs `git` with fixed argv over repo-relative literals.

## Determinism audit (P5)

- The test's branches are exit-code / exact-array membership tests.

## Open questions (HALT)

- none (the classification above is from live reads; approval is GATE 1).
