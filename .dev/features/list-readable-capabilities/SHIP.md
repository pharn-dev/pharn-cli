# SHIP — list-readable-capabilities

Advisory roll-up of a gated `/pharn-dev-ship` run (no `--loop`). This file records **that the chain ran and its floor verdicts** — it is NOT an approval, a "shipped" mark, or a `PHARN ✓ reviewed` seal. The merge/fix/abandon decision is the human's, at the post-review gate.

## Stages run (in order) and where the run ended

| stage       | ran | structural verdict read (verbatim)                        |
| ----------- | --- | --------------------------------------------------------- |
| plan        | ✓   | approved at **GATE 1** (em-dash bullet, footer trimmed)   |
| grill       | ✓   | advisory — 3 minor concerns, 0 blocking (gates nothing)   |
| build       | ✓   | **FLOOR: `validate.mjs` exit 0** (fixture-free / CI cond.) |
| regress     | ✓   | **`regression-report.json` .verdict = `no-regressions`**  |
| verify      | ✓   | **`verify-report.json` .verdict = `PASS`**                |
| review      | ✓   | advisory — **GREEN**, 0 floor findings, 1 minor advisory  |

Ended at **GATE 2** (post-review human decision) — the normal terminus of a gated run. No RED-verdict STOP occurred.

## Structural verdicts, verbatim

- **build → `validate.mjs` exit code: `0` (GREEN).** `npm run check` also GREEN (422 vitest tests pass). The working-tree `validate` shows exit 1 **only** because gitignored `test-*/` fixture installs contain red-by-design capability fixtures; measured fixture-free (a `git worktree` at HEAD with this feature's diff applied — the CI condition), `validate` is a clean 0. The increment adds zero markdown capabilities, so it is vacuously green w.r.t. `validate` regardless.
- **regress → `regression-report.json` `.verdict`: `"no-regressions"`.** No outside gate flipped pass→fail. The `tests` gate is `pre_existing` (exit 1 identical at base and head — a pre-existing `.mjs/.cjs` suite failure, not introduced by this feature).
- **verify → `verify-report.json` `.verdict`: `"PASS"`.** Gates `test`/`validate`/`lint`/`format:check`/`lint:md` all exit 0; `failing_gates: []`. `verifiers: { registered: 0 }` — floor gates only.

## Pointers (cited, not restated — P4)

- Review: `.dev/features/list-readable-capabilities/REVIEW.md` (GREEN; the one minor advisory is a P3 cohesion taste-call on `capability-groups.ts`).
- Grill (advisory): `.dev/features/list-readable-capabilities/GRILL.md` (3 minor concerns — a P3 seam, a P7 picker-refactor blast-radius note, a P1 "evals" labeling nit).
- Plan: `.dev/features/list-readable-capabilities/PLAN.md` (amended post-approval to add `CHANGELOG.md` to `## Files` — the deliverable was in the original ship checklist but omitted from the first plan draft; declared properly + re-scoped, never a hook bypass).

## What landed

`src/lib/capability-groups.ts` (new pure renderer + shared `ROLE_GROUPS`), `src/lib/capability-picker.ts` (re-sources `ROLE_GROUPS`), `src/commands/list.ts` (uses the renderer, one-sentence footer), `tests/capability-groups.test.ts` (new), `tests/list.test.ts` (extended), `docs/commands/list.md` (rendered sample), `CHANGELOG.md` (`[Unreleased] › Changed`, no version bump). `pharn list --json` unchanged (byte-identical).

## Honest line

Chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is good or wise; that is the human's call at the post-review gate.
