# SHIP — corrupt-config-named-error

Gated `/pharn-dev-ship` run (no `--loop`). Increment: audit finding **P-7 (MED, Dim F)** — a corrupt
`pharn.config.json` was reported as an absent one, and the prescribed remedy overwrote it.

## Stages, in order

| #   | stage                | outcome                                                                            |
| --- | -------------------- | ---------------------------------------------------------------------------------- |
| 1   | `/pharn-dev-plan`    | `PLAN.md` written; **GATE 1** was pre-approved by the human for this shape         |
| 2   | `/pharn-dev-grill`   | `GRILL.md` — 7 advisory concerns (1 important, 6 minor), 0 blocking; gates nothing |
| 3   | `/pharn-dev-build`   | 4 files written (exactly the plan's `## Files`); floor run                         |
| 4   | `/pharn-dev-regress` | `regression-report.json` + `REGRESSION.md`                                         |
| 5   | `/pharn-dev-verify`  | `verify-report.json` + `VERIFY.md`                                                 |
| 6   | `/pharn-dev-review`  | `REVIEW.md` — **GATE 2**, where this run ends                                      |

The run ended at **GATE 2**, not at a RED-verdict STOP. No stage returned a non-GREEN verdict.

## The structural verdicts read, verbatim

- **`/pharn-dev-build`** → `node .dev/floor/validate.mjs .` exit code **`0`**
  (`FLOOR: GREEN — 0 capabilities checked in .`).
- **`/pharn-dev-regress`** → `regression-report.json` `.verdict` = **`"no-regressions"`**
  (`regressions: []`, `pre_existing: []`; `check-regress.mjs scope` also returned `escaped: []`, so
  the build did not leave its declared `## Files`).
- **`/pharn-dev-verify`** → `verify-report.json` `.verdict` = **`"PASS"`** (`failing_gates: []`;
  `test` / `validate` / `lint` / `format:check` / `lint:md` / `typecheck` all exit 0).

Each was read as the branch condition for proceeding. Nothing proceeded on this agent's judgment.

**All three were recomputed twice more after the first push.** `main` advanced by eleven PRs between
the build and the first push — among them a per-command flag allowlist in `src/index.ts` (#161), the
move of the trusted docs to the project root (#163), and vitest 4 → 5 (#166) — and again to #171
during review round 2. Verdicts were re-derived from scratch at each rebased HEAD, against the new
fork point (`a382bc3`, then `80412de`) on freshly installed deps, rather than carried forward. The
values above are the latest; all three passes agree.

## Review round 2 (after the PR was opened)

Two findings raised on the PR were fixed on the same branch, which is why this file describes more
than one pass:

- **`displayPath`** — the message interpolated `configPath(cwd)` raw, so a working directory carrying
  ESC or a newline reached the terminal. This is the same channel `parseLocation` exists to close,
  with a different source, so leaving it made the increment's own comment half-true. Fixed and
  mutation-checked.
- **`docs/troubleshooting.md`** — the grill's one `important` finding, originally deferred because a
  sibling PR owned the file. That PR merged, so the gap was closed here.

The second one widened the build scope, and that was done **through the plan**: `docs/troubleshooting.md`
was added to `PLAN.md`'s `## Files` and the writes-scope re-derived from it _before_ the file was
written, so fix#7 gated the docs edit exactly as it gated the original three. `check-regress.mjs
scope` then confirmed `escaped: []` against the amended list. Widening scope by editing outside
`## Files` and reconciling afterwards would have made the hook's guarantee retroactive, which is not
a guarantee.

## Pointers (cited, not restated — P4)

- `.dev/features/corrupt-config-named-error/REVIEW.md` — the four advisory lenses, the GREEN verdict,
  a round-2 section recording which findings external review closed, and the one `important` finding
  about `tests/list.test.ts` that is still **out of this increment's scope** and needs a human
  decision. It also carries a proposed canon lesson, deliberately **not** promoted.
- `.dev/features/corrupt-config-named-error/GRILL.md` — advisory; its one `important` finding was the
  `docs/troubleshooting.md` gap, deferred at the time because a sibling PR owned that file and
  **closed in round 2** once that PR merged. The grill log is left as it was written, so the deferral
  and its reversal both stay visible.
- `REGRESSION.md` records one transient `test: 1` at HEAD (the known load-sensitive
  `tests/lint-gate.test.ts` 5s timeout), how it was ruled out (standalone re-run plus three clean
  `npm test` runs plus a clean re-capture), and why it was not recorded as a result.

## What this file is, and is not

`/pharn-dev-ship` added **no** floor primitive to this run: every guarantee above belongs to a
sub-stage's own checker. Running the stages in order was **advisory orchestration**; only the three
named verdicts are floor-grade.

Chain ran; the named floor verdicts are as shown — this is **NOT** a judgment that the increment is
good or wise; that is the human's call at the post-review gate. No merge, no seal.
