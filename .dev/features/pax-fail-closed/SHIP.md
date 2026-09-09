# SHIP — pax-fail-closed

Gated `/pharn-dev-ship` run (no `--loop`). Chain ran to completion and ended at **GATE 2**, the
post-review human decision.

## Stages run, in order

| stage                | outcome                                                                                                                             |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `/pharn-dev-plan`    | `PLAN.md` written; **GATE 1** — pre-approved by the human for the minimal-fix shape (throw, do not implement PAX), same three files |
| `/pharn-dev-grill`   | `GRILL.md` — 5 advisory concerns; advisory, gates nothing; proceeded                                                                |
| `/pharn-dev-build`   | 3 files written; floor run                                                                                                          |
| `/pharn-dev-regress` | `regression-report.json` + `REGRESSION.md`                                                                                          |
| `/pharn-dev-verify`  | `verify-report.json` + `VERIFY.md`                                                                                                  |
| `/pharn-dev-review`  | `REVIEW.md` — 0 floor-gate, 2 advisory minor, 1 doc reconciliation                                                                  |

## Structural verdicts read, verbatim

- **`/pharn-dev-build`** → `node .dev/floor/validate.mjs .` exit code: **`0`**
  (`FLOOR: GREEN — 0 capabilities checked in .`)
- **`/pharn-dev-regress`** → `regression-report.json` `.verdict`: **`"no-regressions"`**
  (helper exit 0; `regressions: []`, `pre_existing: []`; base `80412de`)
- **`/pharn-dev-verify`** → `verify-report.json` `.verdict`: **`"PASS"`**
  (helper exit 0; `failing_gates: []`; gates `test` / `validate` / `lint` / `format:check` /
  `lint:md` / `typecheck` all 0)

No stage returned a non-GREEN verdict, so the chain was never STOPped; it ran to GATE 2.

All three were **re-run twice**: once after rebasing onto a `main` that had moved by eight merged PRs
(including a major `vitest` 4 -> 5 bump), and again after the human re-opened the increment to add
`SECURITY.md` and the missing elision test. Every re-run returned the same three verdicts, and the
ones recorded above are measured against the commit that actually ships. See `VERIFY.md` for the one
unattributable transient `npm test` red observed during the first re-run, and for why the results map
was re-captured from a genuine gate run rather than edited.

**The increment grew once, by human direction, and the growth is recorded rather than back-dated.**
`SECURITY.md` was added to `PLAN.md`'s `## Files` with its reasoning, and the writes-scope re-set from
the amended plan before the file was written — so fix #7 gated that write instead of being bypassed.
`THREAT-MODEL.md` carries the same stale sentence, is floor-write-protected and human-only, and is
deliberately left for the human.

## Pointers (cited, not restated — P4)

- `.dev/features/pax-fail-closed/REVIEW.md` — the four lenses, the two advisory findings, and the
  `THREAT-MODEL.md` / `SECURITY.md` doc reconciliation carried forward for a human.
- `.dev/features/pax-fail-closed/GRILL.md` — advisory; its `P5` concern (a `g` payload that does not
  parse cleanly must throw rather than yield partial keywords) was adopted before the build.
- `.dev/features/pax-fail-closed/REGRESSION.md`, `VERIFY.md` — the human renders of the two machine
  verdicts above.

## What this file is not

Chain ran; the named floor verdicts are as shown — this is **NOT** a judgment that the increment is
good or wise; that is the human's call at the post-review gate. No merge, no push, no
`PHARN ✓ reviewed` seal was applied by this run.
