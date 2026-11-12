# GRILL — untrack-pharn-runtime-state

Plan: `.dev/features/untrack-pharn-runtime-state/PLAN.md`. Spec-hash check: recomputed
`sha256(ARCHITECTURE.md)` = `bca940a5…3c4e`, equal to the plan's `spec_content_hash` (no drift).
Registered grillers: `{"registered":0,"grillers":[]}` (`.dev/floor/count-grillers.mjs .`), so only
the inline axes ran.

## Findings

### P0 — honest scope of the fix

```yaml
- type: FINDING
  rule_id: "P0"
  severity: important
  file: ".dev/features/untrack-pharn-runtime-state/PLAN.md:17"
  problem: "The worktree-session denial is the most visible symptom, but this increment does not cure it: with the main checkout's scope file absent, the hook falls back to DEFAULT_SAFE_SET resolved against the main checkout, which still denies every path under .claude/worktrees/<name>/. The PR body and roll-up must not claim worktree sessions are unblocked; the hook's root resolution is a separate follow-up."
  evidence: "Untracking does NOT fix that cwd mismatch (an absent scope file falls back to `DEFAULT_SAFE_SET`, whose globs are relative to the main checkout); it is a separate follow-up."
```

### P1 — eval robustness

```yaml
- type: FINDING
  rule_id: "P1"
  severity: minor
  file: ".dev/features/untrack-pharn-runtime-state/PLAN.md:94"
  problem: "The test runs git in process.cwd(), so it is only meaningful when vitest starts at the repo root (true for npm test and the CI Test job). Say so in the test, matching the cwd-relative reads other repo-file tests already do, rather than resolving a path the isolation guard cannot vet."
  evidence: "`tests/repo-runtime-state.test.ts`, via `git` in the repo root (`spawnSync`, no shell)"
```

```yaml
- type: FINDING
  rule_id: "P1"
  severity: minor
  file: ".dev/features/untrack-pharn-runtime-state/PLAN.md:98"
  problem: "git check-ignore exits 128 on a fatal error; the assertions compare against 0 and 1 exactly, so an error fails the test (fail-closed), which is the right direction. Missing git entirely is the skip path. Confirm the RED-first run: before the index change the ls-files assertion and the check-ignore cases must fail."
  evidence: "`git check-ignore -q` exits 0 for each of the eight runtime paths"
```

### P6 — discovery completeness

```yaml
- type: FINDING
  rule_id: "P6"
  severity: minor
  file: ".dev/features/untrack-pharn-runtime-state/PLAN.md:74"
  problem: "The eight index entries are declared in ## Files so /pharn-dev-regress's scope partition accepts their deletion; check-build-complete passes only because the working copies stay on disk. In a fresh clone after merge they are absent, so re-running check-build-complete on this PLAN later would list them missing. Record that in SHIP.md rather than treating it as a build gap."
  evidence: "`.pharn/writes-scope.json` — removed from the index (`git rm --cached`), working copy kept"
```

## Summary

The plan is small and grounded: every classification cites the file's writer, and the no-dependency
claim is backed by the hook's absent-file branch and its existing temp-dir tests. The main concern
is wording, not mechanics: the increment removes the stale scope and the restore-before-commit chore,
but sessions in a `.claude/worktrees/` worktree remain blocked by the hook's cwd-based root. That
must be stated as a follow-up, not implied as fixed. The test's cwd dependence and the after-merge
existence quirk are minor and should be documented where they live.

ADVISORY VERDICT: 4 concerns raised (0 blocking-severity, 1 important, 3 minor) — for the human to
weigh before /pharn-dev-build.
