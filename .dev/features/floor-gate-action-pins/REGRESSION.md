# REGRESSION — floor-gate-action-pins

- **base:** `112e22616993bf219fc251a4f0c5d008ea017cb2` (working-tree dogfood build → `base = HEAD`)
- **machine report:** `.dev/features/floor-gate-action-pins/regression-report.json`

## Partition

`inside` (build-attributable, identical to the plan's `## Files`):

- `.dev/floor/check-action-pins.mjs`
- `.dev/floor/check-action-pins.test.mjs`

`check-regress.mjs scope` → **exit 0**, `escaped: []`. The build wrote exactly its declared `## Files`.

The working tree also holds the **previous increment's** three workflow files (`pin-floor-actions`, uncommitted and intentionally stacked) plus the loop-owned `.pharn/writes-scope.json` and `.dev/features/**` artifacts. None is a write of *this* build: the workflow files predate it in this tree, `.pharn/**` is `ALWAYS`-writable in `enforce-writes-scope.cjs:61`, and each `.dev/features/**` artifact was written under its own stage's scope. The build's own scope was floor-pinned to the two floor paths, so a write outside them would have been denied at write time.

`outside_tests`: 44 committed test files. The new test file is **inside**, so it is correctly not an outside gate. `outside_eval_pairs`: none.

## Gate table (base → head, exit codes)

| gate | base | head | flip |
| --- | --- | --- | --- |
| `tests` (`node --test`, 44 outside files) | 0 | 0 | none |
| `validate` (`validate.mjs .`, whole-repo) | 0 | 0 | none |

`regressions[]`: **empty.** `pre_existing[]`: **empty.** Style gates skipped deterministically — `inside` touches no shared style config.

## Verdict

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.**

`check-regress.mjs verdict` → **exit 0**, `"no-regressions"`.

## The honest residual (P7)

The comparison catches exactly what the suite covers. Unlike the previous increment — where the residual was severe because *no* gate read the changed files — this increment's own artifact **is** a gate, and it was exercised directly rather than only compared: 18 hermetic tests plus a live repo-consistency assertion, all collected by floor.yml's exact `node --test` command (verified by name: `684 = 666 baseline + 18`, exit 0), and a true-negative check in a scratch copy of the real workflows confirming the gate returns exit 1 with `{"file":".github/workflows/floor.yml","line":22,"ref":"actions/setup-node@v7","reason":"floating-ref"}` when a floating ref is reintroduced. Those are the evidence that the feature works; this stage only certifies that adding it broke nothing else.
