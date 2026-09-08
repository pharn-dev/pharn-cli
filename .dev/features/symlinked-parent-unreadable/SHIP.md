# SHIP — symlinked-parent-unreadable

A `/pharn-dev-ship` roll-up. **Advisory**: it records that the chain ran and what each stage's floor
verdict was. It is not an approval, not a `PHARN ✓ reviewed` seal, and not a judgment that the
increment is good.

## Stages that ran, in order

| # | stage                 | outcome                                                                 |
| - | --------------------- | ----------------------------------------------------------------------- |
| 1 | `/pharn-dev-plan`     | `PLAN.md` written; halted at **GATE 1**                                   |
| — | **GATE 1 (human)**    | **approved** — the human answered the approval halt with `continue`, taking both recommended options (fresh branch off `origin/main`; delete the unreachable leaf branch) |
| 2 | `/pharn-dev-grill`    | `GRILL.md` — 6 advisory findings (0 blocking). Gates nothing; proceeded    |
| 3 | `/pharn-dev-build`    | built; floor GREEN                                                        |
| 4 | `/pharn-dev-regress`  | `regression-report.json` — `no-regressions`                               |
| 5 | `/pharn-dev-verify`   | `verify-report.json` — `PASS`                                             |
| 6 | `/pharn-dev-review`   | `REVIEW.md` — GREEN, 0 floor-gate findings, 2 advisory                    |
| — | **GATE 2 (human)**    | **delegated in advance** — the human instructed, mid-run: open a PR, act on CodeRabbit's valid findings, merge when checks are green. Recorded honestly: the decision was the human's, given before the stage completed, not self-issued |

## Structural verdicts read, verbatim

- **`/pharn-dev-build` → `node .dev/floor/validate.mjs .` exit code: `0`** (`FLOOR: GREEN — 0 capabilities
  checked in .` — vacuous, no markdown capability in this increment). The repo floor `npm run check`
  (format:check → lint → typecheck → 953 vitest tests) was GREEN at the same point.
- **`/pharn-dev-regress` → `regression-report.json` `.verdict`: `"no-regressions"`** (`check-regress.mjs
  verdict` exit 0). Base `19eb345` (= `git merge-base HEAD origin/main`), 46 outside stdlib test files /
  748 cases + whole-repo `validate`, all `0 → 0`. `regressions: []`, `pre_existing: []`, `escaped: []`.
- **`/pharn-dev-verify` → `verify-report.json` `.verdict`: `"PASS"`** (`check-verify.mjs` exit 0). Gates
  `test` / `validate` / `lint` / `format:check` / `lint:md` all `0`; `failing_gates: []`;
  `verifiers: {registered: 0, findings: []}` — no verifiers exist, so the verdict is floor gates only.

## Pointers (cited, not restated — P4)

- `.dev/features/symlinked-parent-unreadable/REVIEW.md` — the four-lens review and its 2 advisory
  findings. Both were acted on after the review, under the plan's own writes-scope: the leaf reason
  string no longer stutters in `status`'s report, and `symlink-guard.ts`'s docstring now states each
  caller's actual guard rather than assuming one. `npm run check` re-run GREEN afterwards.
- `.dev/features/symlinked-parent-unreadable/GRILL.md` — advisory, pre-build. Two of its six findings
  were folded into the build (one `try` spanning the walk and the leaf lstat, so the fix trades no dead
  arm for another; the chmod ordering constraint pinned in the reworked test).
- `.dev/features/symlinked-parent-unreadable/{PLAN,REGRESSION,VERIFY}.md` and the two `*-report.json`.

## Doc reconciliation surfaced for a human (never agent-edited)

`THREAT-MODEL.md:227-231` cites `src/lib/apply-update.ts:57-61` for the claim that `status` classifies a
symlink as `unreadable` rather than hashing it. This increment makes that claim true for symlinked
*parents* too, and moves those line numbers. The file is hook-denied to agents.

---

Chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is good or
wise; that is the human's call at the post-review gate.
