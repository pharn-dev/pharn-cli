# REGRESSION — add-dest-drift-backup

**Base:** `4942006` — `origin/main` after this branch was rebased onto it twice (`#132`, then `#131`).
The baseline was re-captured at that commit and BOTH verdicts recomputed; nothing here is carried
over from the pre-rebase run.

## Partition

`inside` (14 paths — the build's own writes, every one covered by the plan's `## Files`):

```text
CHANGELOG.md  CLAUDE.md  docs/commands/add.md
src/commands/add.ts  src/commands/remove.ts
src/lib/dest-drift.ts  src/lib/install-manifest.ts  src/lib/install-records.ts
src/lib/symlink-guard.ts
tests/add.test.ts  tests/dest-drift.test.ts  tests/install-manifest.test.ts
tests/install-records.test.ts  tests/remove.test.ts
```

`src/lib/symlink-guard.ts` was **added to the plan's `## Files` and the setter re-run** before it was
touched — `#131` made `findSymlinkComponent` non-total and gave it a docstring enumerating where each
caller stands, which `collectDestDrift` falsifies by existing. That is the route `/pharn-dev-build`
Step 0 prescribes for a path a rebase pulls into range; the alternative (writing it anyway) is the
bypass the hook exists to prevent.

`check-regress.mjs scope` returned **`escaped: []`, exit 0** — no path escaped the declared
writes-scope (fix #7). The pipeline's own artifacts (`.dev/features/add-dest-drift-backup/**`,
`.pharn/writes-scope.json`) are excluded from `inside` by construction: they are written by the
plan/grill/regress stages under **their own** per-stage scopes, not by `/pharn-dev-build`, so they are
not build writes to partition. Stated rather than assumed.

`outside_eval_pairs`: none (this repo commits no eval pairs yet).

## Per-gate comparison (base → head)

| gate           | base | head | verdict |
| -------------- | ---- | ---- | ------- |
| `tests`        | 0    | 0    | ok      |
| `validate`     | 0    | 0    | ok      |
| `test`         | 0    | 0    | ok      |
| `typecheck`    | 0    | 0    | ok      |
| `lint`         | 0    | 0    | ok      |
| `format:check` | 0    | 0    | ok      |
| `lint:md`      | 0    | 0    | ok      |
| `build`        | 0    | 0    | ok      |

`tests` = `node --test` over the 46 outside `*.test.mjs` / `*.test.cjs` floor tests (748 assertions).
The other seven are the repo's own npm gates — the same six CI runs, plus `validate`. The baseline was
captured in a detached `git worktree` at `19eb345` with `npm ci`, then removed; the head capture ran in
the working tree. The gate set is identical on both sides, which is what keeps the comparison from
reading `inconclusive`.

**Style gates were RUN, not skipped.** The deterministic skip rule permits skipping them (no shared
style config in `inside`), but `npm ci` was already required for `test`/`typecheck` at the baseline, so
their marginal cost was zero and running them strictly widens coverage.

**One capture caveat, named rather than buried.** The first pass ran `node --test` at its default
parallelism and produced exit `1` on **both** sides with zero reported failures — the three
writes-scope hook tests share the one `.pharn/writes-scope.json` and race when interleaved with 45
other files. Re-run with `--test-concurrency=1`, it is stably `0`. Both captures above were taken
serially. This is an artifact of invoking those tests concurrently, not a gate this repo's CI runs;
had it been left flaky, the comparison itself would have been unreliable — worse than not running it.

`regressions[]`: empty. `pre_existing[]`: empty.

## Verdict (FLOOR — `check-regress.mjs verdict`, exit 0)

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.**

The verdict is a comparison of two exit-code maps, computed by the helper, not by judgment. The
orchestration around it — choosing the base, partitioning inside/outside, deciding the gate set,
running the suites — is **advisory**.

**Residual, named not hidden:** `/pharn-dev-regress` catches exactly what its suite catches, nothing
more. The claim is "deterministically-detectable breakage outside the feature is caught," **not**
"nothing broke." A behavior with no test, rule, or eval covering it is invisible to this stage.
