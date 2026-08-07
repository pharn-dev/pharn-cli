# REGRESSION — update-drift-safe

- **base:** `0bf92a24e6402e514f7ea6ae79f0ba2aeb6364ad` (working tree is dirty → base = `HEAD`, the
  pre-build state, since the whole increment is uncommitted)
- **verdict:** `no-regressions` — `.dev/floor/check-regress.mjs verdict` exit **0**
- machine report: [`regression-report.json`](regression-report.json) (the helper's stdout, verbatim)

## Per-gate comparison (the floor: two exit codes, compared)

| Gate       | Command                          | base | head | Flip? |
| ---------- | -------------------------------- | ---- | ---- | ----- |
| `tests`    | `node --test` × 44 outside suites | 0    | 0    | no    |
| `validate` | `node .dev/floor/validate.mjs .`  | 0    | 0    | no    |

`regressions: []` · `pre_existing: []`.

**Style gates skipped, deterministically (P5).** `inside` touches none of `eslint.config.mjs`,
`.prettierrc`, `.prettierignore`, `.markdownlint-cli2.jsonc`, so a style flip over the byte-identical
outside files is provably impossible. They are absent from **both** maps, so the gate sets match.
(They were nevertheless run over the whole repo during the build: `npm run check` and `npm run lint:md`
are both green.)

## Inside / outside partition

`inside` = 40 paths (the increment's source, tests and docs — listed in `regression-report.json`).
`outside` = the 44 committed `*.test.mjs` / `*.test.cjs` floor + hook suites, plus whole-repo
`validate`. No committed eval pair falls outside the feature, so `outside_eval_pairs` is empty.

## Two honest notes about this run's ORCHESTRATION (advisory, not the verdict)

1. **`check-regress.mjs scope` exited 1 — and it is NOT a build escape.** It flagged three changed
   paths as outside the plan's `## Files`:
   - `.pharn/writes-scope.json` — the scope setter's own output; `.pharn/**` is always-writable
     scratch by design (`enforce-writes-scope.cjs`).
   - `.dev/features/update-drift-safe/PLAN.md` — written by `/pharn-dev-plan`, under **its** scope.
   - `.dev/features/update-drift-safe/GRILL.md` — written by `/pharn-dev-grill`, under **its** scope.

   None was written while the build's scope was active, and a genuine escape would have been **denied
   at write time** by the pre-write hook — the actual floor for fix #7 — rather than detected here.
   The gap is in the helper's INPUT: `--changed` is "everything that changed in the working tree",
   which in a single-session dogfood run necessarily includes the sibling stages' artifacts. Reported,
   not silently worked around; a follow-up should let `scope` exclude the pipeline's own artifact
   paths. **The `verdict` call is unaffected** — it consumes only the two exit-code maps.

2. **The first capture of this run was WRONG and was discarded.** It recorded `tests: 1` on both sides;
   the cause was a shell-quoting bug in my harness (the 44 test paths were passed to `node --test` as a
   single argument, so it reported "Could not find …" and exited 1). Because the fault was symmetric it
   would have produced the same `no-regressions` verdict from bad inputs. It was re-run correctly —
   `tests` is **0 at both** base and head — and the numbers above are from that clean run. Recording
   this because a verdict computed from inputs known to be unreliable is exactly the thing this
   pipeline exists to prevent, even when the answer happens to match.

   Related, and the reason both sides run in **fresh `git worktree` checkouts**: `validate.mjs` scans
   the repo directory, and the gitignored `test-*/` fixture installs in the working tree make it RED.
   Comparing a fixture-polluted head against a clean baseline would have manufactured a false
   `validate` regression. Both sides are therefore clean checkouts, with the working-tree diff +
   untracked files overlaid onto the head one.

## Verdict

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.**

Residual, stated plainly (P0/P7): this catches **exactly what its suite catches, nothing more.** A
regression that no deterministic check covers is invisible to it. "No regressions" means "no
outside gate flipped pass→fail" — **not** "nothing broke."
