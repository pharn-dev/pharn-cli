# SHIP — features-readme-relocation

Chain run: `/pharn-dev-plan → [GATE 1 approved] → /pharn-dev-grill → /pharn-dev-build → /pharn-dev-regress → /pharn-dev-verify → /pharn-dev-review → [GATE 2]`.
Branch: `feat/features-readme-relocation` (`9008669..HEAD`). `main` was moved back to `origin/main`; every commit for this increment is on the one branch.

## Stages, in order, and where the run ended

| Stage | Ran | Outcome |
| --- | --- | --- |
| `/pharn-dev-plan` | yes | `PLAN.md` written; halted at **GATE 1**; 5 open questions resolved by the human, then approved as written |
| `/pharn-dev-grill` | yes | `GRILL.md` — 7 concerns (advisory, gates nothing); proceeded |
| `/pharn-dev-build` | yes | floor **GREEN** after finishing the incomplete work |
| `/pharn-dev-regress` | yes | **`no-regressions`** |
| `/pharn-dev-verify` | yes | **`PASS`** |
| `/pharn-dev-review` | yes | `REVIEW.md` — 5 findings, 0 blocking, + 4 plan deviations |

Ended at **GATE 2** — the human decides merge / fix / abandon.

## Structural verdicts read, verbatim

- **`/pharn-dev-build` → `node .dev/floor/validate.mjs .` exit code: `0`.** No gitignored `test-*/` trees were present, so this is a genuine GREEN and not the dirty-tree artifact that repo's floor is prone to.
  - It was **not** green on arrival: the relocation commit `ba512a6` left `format:check` failing on 5 files and `lint:md` MD060 on `docs/commands/init.md:138`, and had not written `package-lock.json`. Fixed in `6461838` before the verdict was read.
- **`/pharn-dev-regress` → `regression-report.json` `.verdict`: `"no-regressions"`.** `outside_gates`: `tests` base 0 → head 0; `validate` base 0 → head 0. `regressions: []`. Base `9008669`, run in a detached worktree.
- **`/pharn-dev-verify` → `verify-report.json` `.verdict`: `"PASS"`.** `gates`: `format:check` 0, `lint` 0, `lint:md` 0, `test` 0, `typecheck` 0, `validate` 0. `failing_gates: []`. `verifiers`: registered 0 — floor gates only.

## Pointers (cited, not restated — P4)

- `.dev/features/features-readme-relocation/PLAN.md` — the approved plan and the 7 GATE-1 decisions
- `.dev/features/features-readme-relocation/GRILL.md` — advisory, gates nothing
- `.dev/features/features-readme-relocation/REVIEW.md` — the findings and the 4 plan deviations
- `.dev/features/features-readme-relocation/regression-report.json`, `verify-report.json` — the machine verdicts above

## What is NOT established by the above

- **No live end-to-end install was run.** pharn-oss's relocation is committed locally (`213985d`) but unpushed, and `src/lib/repo.ts` always fetches `main` HEAD — so an install today fetches the pre-relocation tree. The plan's four end-to-end confirmations are pinned by **tests**, not by a live run.
- `/pharn-dev-regress` widened its gate set to the full suite at both ends (vitest rejected the 55-file outside filter), so its granularity claim is weaker than an outside-scoped run.
- 0 grillers and 0 verifiers are registered in this repo, so both plug-in slots were no-ops.

## Standing decision

The chain ran; the named floor verdicts are as shown — **this is NOT a judgment that the increment is good or wise; that is the human's call at the post-review gate.** Nothing was merged, pushed, or sealed, and no `PHARN ✓ reviewed` seal was applied.
