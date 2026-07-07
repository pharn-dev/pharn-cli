# SHIP — placeholder-as-done lens (gated /pharn-dev-ship roll-up)

**Advisory roll-up only.** `/pharn-dev-ship` adds no floor primitive; every guarantee below belongs to a sub-stage.
This records **that the chain ran and its floor verdicts** — it is **not** a self-issued "shipped", an approval, or
a `PHARN ✓ reviewed` seal.

## Stages run, in order

| stage                | what it did                                                       | outcome                                                                                     |
| -------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `/pharn-dev-plan`    | scoped the increment; pinned `spec_content_hash`; **GATE 1** halt | human **approved** (with the open question resolved: empty-body detection **on the floor**) |
| `/pharn-dev-grill`   | interrogated the approved plan (advisory; gates nothing)          | 4 concerns raised (0 blocking, 4 minor) → `GRILL.md`                                        |
| `/pharn-dev-build`   | wrote the 18 planned files; ran the floor                         | proceeded (see FLOOR verdict)                                                               |
| `/pharn-dev-regress` | re-ran the outside-scope suite at baseline vs HEAD                | proceeded (see FLOOR verdict)                                                               |
| `/pharn-dev-verify`  | re-ran the repo's deterministic gates once at HEAD                | proceeded (see FLOOR verdict)                                                               |
| `/pharn-dev-review`  | floor-first + 4 advisory lenses; **GATE 2**                       | verdict GREEN, 0 blocking → `REVIEW.md`                                                     |

**Where the run ended:** at **GATE 2** (post-review human decision), not at a RED-verdict STOP.

## Structural floor verdicts read (verbatim — these are the guarantees)

- **`/pharn-dev-build` → `node .dev/floor/validate.mjs .` exit code = `0`** (GREEN — 24 capabilities checked). GREEN → proceed.
- **`/pharn-dev-regress` → `regression-report.json` `.verdict` = `"no-regressions"`** (`check-regress.mjs verdict` exit 0; outside gates `tests` / `validate` / `structural:trust-fence` all `0→0`). → proceed.
- **`/pharn-dev-verify` → `verify-report.json` `.verdict` = `"PASS"`** (`check-verify.mjs` exit 0; gates `test` / `validate` / `lint` / `format:check` / `lint:md` all `0`, `failing_gates: []`). → proceed.
  - _Disclosed:_ the **first** verify run FAILED on `format:check` + `lint:md` (cosmetic style nits in the feature's own declared-scope files + one `PLAN.md` `MD004`); corrected in place (prettier + `+`→`-`), CASE hit-lines re-confirmed unchanged (14/14/13/•/15), re-verified to a genuine PASS. See `VERIFY.md`. (This is the increment-style catch L9 routes to verify.)

## Advisory artifacts (cited, not restated — P4)

- **`.dev/features/placeholder-lens/REVIEW.md`** — GATE-2 review: verdict GREEN, 0 blocking floor-findings, 2 advisory-minor observations (two-passes-in-one-scanner-file; raw-text Pass A vs. markdown-fixture prose), plus **one proposed lesson candidate** for a separate human-gated `/pharn-dev-memory-promote` run (the raw-text-scanner markdown-prose gotcha). Read the file; not restated here.
- **`.dev/features/placeholder-lens/GRILL.md`** — advisory plan interrogation (4 minor concerns). Read the file.
- **`.dev/features/placeholder-lens/REGRESSION.md`**, **`VERIFY.md`** — the human renders of the two floor verdicts above.

## Standing decision

The chain ran; the named floor verdicts are as shown — **this is NOT a judgment that the increment is good or wise;
that is the human's call at the post-review gate (GATE 2).** `/pharn-dev-ship` does not merge, push, commit, or apply
the `PHARN ✓ reviewed` seal. The 18 build files are written and uncommitted in the working tree for the human to
inspect, then merge / fix / abandon.
