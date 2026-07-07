# SHIP — duplicated-logic lens (gated `/pharn-dev-ship` roll-up)

Advisory roll-up of one gated `/pharn-dev-ship` run. `/pharn-dev-ship` adds **no** floor primitive: every verdict
below belongs to a sub-stage's own checker. This file records **that the chain ran and its floor
verdicts** — it is **not** an approval, a "shipped", or a `PHARN ✓ reviewed` seal.

## Stages run, in order

| stage            | artifact                 | structural verdict (read verbatim)              |
| ---------------- | ------------------------ | ----------------------------------------------- |
| plan (GATE 1)    | `PLAN.md`                | human **approved** (with floor scanner)         |
| grill (advisory) | `GRILL.md`               | 5 concerns, 0 blocking-severity (gates nothing) |
| build            | 15 files                 | `validate.mjs` exit **0** (GREEN, 25 caps)      |
| regress          | `regression-report.json` | `.verdict` = **"no-regressions"** (exit 0)      |
| verify           | `verify-report.json`     | `.verdict` = **"PASS"** (exit 0)                |
| review (GATE 2)  | `REVIEW.md`              | GREEN — 0 blocking floor findings (advisory)    |

**Where the run ended:** **GATE 2** (post-review), the second non-negotiable human gate. Every gated
stage returned its floor-GREEN verdict; no RED-verdict STOP occurred.

## The structural verdicts (each is a sub-stage's floor, not `/pharn-dev-ship`'s)

- **build → `node .dev/floor/validate.mjs .` exit `0`** (GREEN — 25 capabilities; was 24 + `duplicated-logic`).
- **regress → `regression-report.json` `.verdict` = `"no-regressions"`** — outside gates `tests` /
  `validate` / `structural:trust-fence` all `0 → 0`; `regressions: []`, `pre_existing: []`. (A zsh
  word-split mis-measurement of the `tests` gate was caught and re-measured — see `REGRESSION.md`.)
- **verify → `verify-report.json` `.verdict` = `"PASS"`** — gates `test` / `validate` / `lint` /
  `format:check` / `lint:md` all `0`; `failing_gates: []`; `verifiers.registered: 0` (floor-only).

## Advisory outputs (cited, not restated — P4)

- **`REVIEW.md`** — GREEN with **2 advisory findings** (a `PLAN.md` doc-drift on the scanner's algorithm
  description; the on-theme `mask()` duplication in the scanner, consolidation deferred P7) + **1 proposed
  lesson candidate** (the zsh `node --test` word-split hazard in regress/verify) for a future human-gated
  `/pharn-dev-memory-promote`. See `REVIEW.md`; not restated here.
- **`GRILL.md`** — 5 advisory concerns (P7 trigger; mask duplication; merge/occurrence edge-tests;
  one-line `file` for a multi-site defect; hash-precision) that shaped the build. Advisory; gated nothing.

## Standing decision — the human's (GATE 2)

The chain ran and the named floor verdicts are as shown — **this is NOT a judgment that the increment is
good or wise; that is the human's call at the post-review gate.** `/pharn-dev-ship` does not merge, push,
commit, or apply the `PHARN ✓ reviewed` seal. Merge / fix / abandon is yours.
