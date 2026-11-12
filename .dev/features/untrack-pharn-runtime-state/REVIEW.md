# REVIEW — untrack-pharn-runtime-state

Floor first: `node .dev/floor/validate.mjs .` → `FLOOR: GREEN — 0 capabilities checked in .`. The
increment adds no PHARN markdown capability, so that gate is vacuous here; the build floor
(`npm run check`) was GREEN and `/pharn-dev-regress` returned `no-regressions`. Everything below is
**advisory**.

Reviewed: the uncommitted diff over `f83b736a` — `.gitignore`, eight index removals under `.pharn/`,
and the new `tests/repo-runtime-state.test.ts` (see `regression-report.json` `.inside`).

## Floor-gate findings (blocking)

None.

- **L-floor (P0):** the one guarantee — "the dev loop's runtime state is not committed" — reduces to
  the new vitest test in the required `Test` check: exact membership of `git ls-files .pharn` in
  `['.pharn/ci.yml']`, and `git check-ignore -q` exit codes (0 for the nine runtime paths, 1 for
  `ci.yml`). The `.gitignore` block is labelled advisory in the test's own comment (a forced add
  bypasses it), with the index assertion as the backstop. The hook's behaviour without the scope
  file is unchanged and already covered by `enforce-writes-scope.test.cjs`'s "no scope" cases (48/48
  pass at HEAD).
- **L-eval (P1):** the test failed before the change (10 of 11 cases: the index assertion and all
  nine ignore cases; the `ci.yml` case passed) and passes after it (11/11).
- **L-trust (P2):** no untrusted input. The test spawns `git` with fixed argv over literals, no shell.
  Nothing in the reviewed files read as an instruction.
- **L-axis (P3):** one config block, one test file with one reason to change; no `src/` file touched.

## Advisory findings

```yaml
- type: FINDING
  rule_id: "P0"
  severity: important
  file: ".claude/hooks/enforce-writes-scope.cjs:29"
  problem: "Sessions started in a .claude/worktrees/<name>/ worktree still have every Write/Edit denied after this change: the hook takes ROOT and the scope file from process.cwd(), which is the main checkout, and an absent scope file falls back to DEFAULT_SAFE_SET globs relative to that root. This increment removes the stale scope, not the cwd mismatch; the PR must say so, and the hook's root resolution is a separate follow-up."
  evidence: "return fs.realpathSync(process.cwd());"
```

```yaml
- type: FINDING
  rule_id: "P6"
  severity: minor
  file: ".claude/commands/pharn-dev-regress.md:78"
  problem: "Step 1 defines inside as every changed and untracked path, which includes the feature's own .dev/features/<name>/ stage artifacts; check-regress scope then reports them as escaped. Both this run and supervise-stage excluded them by hand. The command should say so (or the helper should skip the active feature's folder), so the exclusion is not an ad hoc judgment each run."
  evidence: "`inside = git diff --name-only <base>` **plus** untracked-new files"
```

```yaml
- type: FINDING
  rule_id: "P1"
  severity: minor
  file: "tests/repo-runtime-state.test.ts:17"
  problem: "The test runs git in process.cwd() and so assumes vitest starts at the repo root (true for npm test and the CI Test job). Stated in the test's header comment; a run from a subdirectory would check that directory's view of the index instead."
  evidence: "git runs in the process cwd, which is the repo root under vitest"
```

## Proposed lesson (candidate only — not written to canon)

- **Candidate:** "/pharn-dev-regress's inside set must exclude the active feature's own
  `.dev/features/<name>/` artifacts before `check-regress.mjs scope`, or the scope check reports the
  loop's own PLAN/GRILL as an escape." Provenance: this increment (`untrack-pharn-runtime-state`,
  base `f83b736a`) and `supervise-stage` (`REGRESSION.md` "this feature's own stage artifacts are not
  build output"). Promotion is a separate, human-gated `/pharn-dev-memory-promote` run.

VERDICT: GREEN (0 floor findings; 3 advisory findings — 1 important, 2 minor).
