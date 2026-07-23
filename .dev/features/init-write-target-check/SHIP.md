# SHIP — init-write-target-check (roll-up; advisory)

`/pharn-dev-ship` (gated mode) ran the build loop in order. **Where it ended: GATE 2** — the post-review
human decision (merge / fix / abandon). Nothing was merged, sealed, or committed.

## Stages run, in order

| stage       | outcome                        | structural verdict (read verbatim)                                    |
| ----------- | ------------------------------ | --------------------------------------------------------------------- |
| plan        | approved at **GATE 1**         | human chose slot=A (post-fetch, unify) + derivation=A (shared lib)    |
| grill       | advisory, proceeded            | 6 concerns (0 blocking, 3 important, 3 minor) — `GRILL.md`             |
| build       | floor GREEN                    | `npm run check` GREEN (382 tests) + `lint:md` GREEN; `validate` — see note |
| regress     | proceeded                      | `regression-report.json` `.verdict` = **`no-regressions`**            |
| verify      | proceeded                      | `verify-report.json` `.verdict` = **`PASS`**                          |
| review      | GATE 2 (present)               | `REVIEW.md` — GREEN, 0 blocking, 2 minor advisory (no structural verdict) |

## Structural verdicts, verbatim (what `/pharn-dev-ship` branched on)

- **build → `node .dev/floor/validate.mjs .` exit:** raw working-tree exit **1** — **but all 15 findings
  are under gitignored `test-*/` scratch** (local `pharn init` fixtures + the floor's own deliberately-red
  negative fixtures), provably **not** repo state and **not** this diff. Per the `/pharn-dev-build` contract,
  `validate` "gates nothing" for a non-markdown-capability increment; the build floor is **`npm run check`
  = GREEN (382 tests)** + `lint:md` GREEN. The sound clean-worktree `validate` (tracked HEAD + this diff,
  no scratch) = **0 / GREEN, "0 capabilities checked"**. Proceed rested on the GREEN build floor, with the
  raw RED surfaced (not hidden) and deterministically attributed to gitignored scratch (`git status` shows
  the diff touches no `test-*/`; `test-*/` are `.gitignore`d).
- **regress → `regression-report.json` `.verdict` = `no-regressions`** (outside `tests` gate 0 → 0 on the
  clean-tree comparison; `validate`/style gates provably cannot flip and were skipped).
- **verify → `verify-report.json` `.verdict` = `PASS`** (`test`/`validate`/`lint`/`format:check`/`lint:md`
  all 0; `validate` measured over the clean tracked tree, GREEN; 0 verifiers registered).

## Pointers (cited, not restated — P4)

- `.dev/features/init-write-target-check/REVIEW.md` — the four-lens review (GREEN; 2 minor advisory
  findings: a P2 display-sanitization note and a P3 config-filename-literal note; **read it for the
  merge decision**).
- `.dev/features/init-write-target-check/GRILL.md` — advisory pre-build interrogation (the 3 important
  findings — mandatory RCE-surface guard, mirror-consistency test, redrawn `init.md` diagram — were
  folded into the build).
- `REGRESSION.md` / `VERIFY.md` — the scratch-confound reconciliations in full.

## Two items surfaced for the human (not agent-acted)

1. **Proposed lesson candidate** (in `REVIEW.md`, not written to canon): cwd-scanning floor gates
   (`validate.mjs .`, `lens-scanner-map`, `count-*`) are confounded by gitignored `test-*/` scratch —
   promote via a human-gated `/pharn-dev-memory-promote` run if you agree.
2. **Tooling axis (separate increment):** scope the `.dev/floor` cwd-scanners to `git ls-files` so local
   scratch stops producing spurious RED. Not touched here (different axis; `.dev/floor/`).

## Honest line (P0)

The chain ran; the named floor verdicts are as shown — **this is NOT a judgment that the increment is
good or wise; that is the human's call at the post-review gate.** `/pharn-dev-ship` did not merge, push, seal
(`PHARN ✓ reviewed`), or commit anything.
