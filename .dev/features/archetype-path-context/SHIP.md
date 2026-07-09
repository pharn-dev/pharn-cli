# SHIP — archetype-path-context (gated /pharn-dev-ship roll-up; ADVISORY)

Thin roll-up of a **gated** `/pharn-dev-ship` run. `/pharn-dev-ship` adds **no** floor primitive — every guarantee below
belongs to a sub-stage. This records **that the chain ran and its floor verdicts**; it is **not** a
self-issued "shipped", an approval, or a `PHARN ✓ reviewed` seal.

## Stages run, in order — ended at GATE 2 (human decision)

| stage | outcome | verdict source |
| --- | --- | --- |
| `/pharn-dev-plan` | PLAN.md written; **GATE 1 approved** (Q1 both, Q2 path-scope migrations, Q3 real express dep) | human halt |
| `/pharn-dev-grill` | GRILL.md — 5 advisory concerns (0 blocking); proceeded (grill gates nothing) | advisory (no verdict) |
| `/pharn-dev-build` | 4 files built; floor GREEN | **`validate.mjs` exit = 0** |
| `/pharn-dev-regress` | no regressions outside the feature | **`regression-report.json` .verdict = `no-regressions`** |
| `/pharn-dev-verify` | all floor gates green | **`verify-report.json` .verdict = `PASS`** |
| `/pharn-dev-review` | GREEN — 0 blocking, 3 advisory + 1 lesson candidate | no structural verdict (advisory) |

The run **ended at GATE 2** — the post-review human decision (merge / fix / abandon). No RED-verdict STOP
occurred; every gated stage returned its GREEN floor verdict.

## Structural verdicts read, verbatim (the only floor-grade content)

- **`/pharn-dev-build`** → `node .dev/floor/validate.mjs .` exit code **`0`** (GREEN). (Substantive floor for this
  TS increment: `npm run check` — 566 vitest tests passed, lint/format/typecheck clean.)
- **`/pharn-dev-regress`** → `regression-report.json` `.verdict` = **`no-regressions`** (base
  `186b55d4…191c`, the feature commit's parent; `regressions: []`; `tests` gate `pre_existing` RED→RED,
  not a flip; `validate` GREEN→GREEN).
- **`/pharn-dev-verify`** → `verify-report.json` `.verdict` = **`PASS`** (`test`/`validate`/`lint`/`format:check`/`lint:md`
  all exit 0; `verifiers.registered: 0` — floor gates only).

## Pointers (cited, not restated — P4)

- **`.dev/features/archetype-path-context/REVIEW.md`** — the 4-lens review: GREEN, 0 floor-gate
  (blocking) findings; 3 advisory (1 important P3 — pure classification growing in the I/O file, contra
  its header axis; 2 minor P1 coverage gaps: `app/api` api-dir branch, `route.js/.mjs` + deep DB
  representative-only); 1 proposed lesson candidate (path-scope structural signals on introduction — the
  `.sql` signal has flipped 3×), for a human-gated `/pharn-dev-memory-promote`.
- **`.dev/features/archetype-path-context/GRILL.md`** (advisory) — 5 pre-build concerns; #1 (false-negative
  direction) and #2 (eval set-member coverage) were addressed during build.

## What this increment landed

Threaded a lowercased ancestor-`segments` chain through `detect-archetype.ts`'s `walk → classifyEntry` and
scoped the four over-broad file-tree rules to their documented locations (`api/`, `route.*`, `.sql`,
`migrations/`, `.tsx/.jsx`); loosened `capability-index.ts`'s `parseApplies` to accept unquoted YAML
`applies` tokens (split-whole-then-validate, fail-closed preserved). Determinism preserved; no new
archetype/enum member; no `pharn.config.json`/legacy-pin surface touched.

## GATE-2 fix iteration (human-directed: "fix advisory findings first")

At the first GATE 2 the human chose to fix the review's advisory findings before deciding. Applied within
an extended plan `## Files` (re-scoped, fix #7), then **re-verified** — all floor verdicts still GREEN:

- **P3 (important):** extracted the pure `classifyEntry` + its 3 constants from `detect-archetype.ts` (I/O)
  to `archetype.ts` (pure rules), exported; the I/O file now imports it and owns only the walk + read.
- **P1 (minor ×2):** added a direct `classifyEntry` unit-test block (every branch incl. `app/api`,
  `route.js`/`route.mjs`, deep DB) + an `app/api/` integration case.
- **Re-verified verdicts:** `/pharn-dev-verify` → `verify-report.json` .verdict = **`PASS`** (594 vitest
  tests); `/pharn-dev-regress` → `regression-report.json` .verdict = **`no-regressions`** (base
  `186b55d…191c`, full increment+fix). `REVIEW.md` addendum records all three advisory findings **addressed**.

The fix is currently **uncommitted** on top of `b7dc5b6` (2 src + 2 test files changed + the plan/artifacts).
The run is back at **GATE 2** for the human's decision.

## The standing decision is the human's

Chain ran; the named floor verdicts are as shown — this is **NOT** a judgment that the increment is good
or wise; that is the human's call at the post-review gate. `/pharn-dev-ship` does not merge, push, or seal.
