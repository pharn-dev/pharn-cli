# SHIP — diff-unreadable-partition (gated mode, no `--loop`)

Branch `fix/diff-unreadable-partition`, base `main` @ `8ff7240`. Nothing committed, nothing pushed.

## Stages run, in order

| # | stage | outcome |
| --- | --- | --- |
| 1 | `/pharn-dev-plan` | `PLAN.md` written; **GATE 1** reached and passed — human answered "Approve as written" and "Leave them; they're intentional" (the staged `package.json` pair) |
| 2 | `/pharn-dev-grill` | `GRILL.md` — 5 advisory concerns (0 blocking); **gates nothing**, proceeded |
| 3 | `/pharn-dev-build` | 6 files written; floor run |
| 4 | `/pharn-dev-regress` | `regression-report.json` + `REGRESSION.md` |
| 5 | `/pharn-dev-verify` | `verify-report.json` + `VERIFY.md` |
| 6 | `/pharn-dev-review` | `REVIEW.md` — **GATE 2**, where this run ends |

**Ended at GATE 2** — the chain completed; no stage returned a RED verdict.

## The structural verdicts read, verbatim

- **`/pharn-dev-build` → floor:** `node .dev/floor/validate.mjs .` **exit 0**; `npm run check` **exit 0**.
- **`/pharn-dev-regress` → `regression-report.json` `.verdict`:** **`"no-regressions"`** (helper exit 0).
  `regressions: []`, `pre_existing: []`. Outside gates `tests` 0→0, `validate` 0→0.
- **`/pharn-dev-verify` → `verify-report.json` `.verdict`:** **`"PASS"`** (helper exit 0).
  `failing_gates: []`; gates `test`/`validate`/`lint`/`format:check`/`lint:md` all 0.
  `verifiers: {registered: 0, findings: []}` — advisory layer empty, and **not** a verdict input.
- **`/pharn-dev-review` → no structural verdict, and none was invented.** `REVIEW.md` is prose; its
  `severity` values are LLM assignments (advisory, `finding-shape.md`). Its only floor-grade content —
  `validate.mjs` GREEN — was already gated at stages 3 and 5.

## Pointers (cited, not restated — P4)

- `.dev/features/diff-unreadable-partition/PLAN.md` — the approved intent, plus the post-grill amendment
- `.dev/features/diff-unreadable-partition/GRILL.md` — advisory, gates nothing
- `.dev/features/diff-unreadable-partition/REGRESSION.md` / `regression-report.json`
- `.dev/features/diff-unreadable-partition/VERIFY.md` / `verify-report.json`
- `.dev/features/diff-unreadable-partition/REVIEW.md` — read this at the gate

## Two things a reader should not have to dig for

1. **A capture error was caught and corrected mid-run, not buried.** The first regress capture recorded
   `tests=1` at base *and* head, which reads as a benign "pre-existing" RED. It was neither: `zsh` does
   not word-split unquoted parameter expansions, so all 46 outside test files reached `node --test` as a
   single filename. Re-captured via `xargs`: 748 tests, 748 pass, both sides. Details in `REGRESSION.md`.
2. **A pre-existing vacuous test was fixed** (inside the plan's `## Files`): `tests/diff.test.ts` named a
   missing file but rewrote it with identical bytes, so `diff.ts`'s `missing` arm was uncovered at the
   baseline. `diff.ts` is now 100% lines and branches. Details in `VERIFY.md` and `REVIEW.md`.

## Manual end-to-end (outside every floor verdict — recorded, not certified)

Run against a real `pharn-dev/pharn-oss@main` clone (367 files, 28 capabilities, skills v2.5.0, `pharn`
layout), comparing a binary built from the **baseline** `diff.ts` against one built with the fix:

| evidence | OLD binary | NEW binary |
| --- | --- | --- |
| directory at `pharn/CONSTITUTION.md` | `⚠ EISDIR: illegal operation on a directory, read`, **exit 1**, whole report lost | `UNREADABLE … — the path is not a regular file`, **366 others still compared**, plain **0**, `--strict` **1** |
| symlink → `/etc/hostname` (different bytes) | listed under **DIFFERS FROM** | `UNREADABLE … — the path is a symlink`; zero DIFFERS sections |
| symlink → byte-identical copy | **`No drift — 367 file(s) match`**, `--strict` **exit 0** | `UNREADABLE … — the path is a symlink`, `--strict` **1**, plain **0** |
| dangling symlink | **MISSING (expected but absent)** | `UNREADABLE … — the path is a symlink` |
| parent is a regular file (ENOTDIR) | **MISSING** | `UNREADABLE … — the path could not be inspected` |

Fixture restored after each; final state `No drift — 367 file(s) match`, `--strict` exit 0.

These are **evidence for the human**, not a floor verdict — no checker consumed them.

---

The chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is
good or wise; that is the human's call at the post-review gate.
