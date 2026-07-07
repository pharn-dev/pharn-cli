# REGRESSION — archetype-missing-signal

**Verdict (floor, `check-regress.mjs verdict` exit 0):** `no-regressions`.

## Base + partition

- **Base:** `6402a3e` (dirty working tree → `base = HEAD`; baseline was a clean detached `HEAD` worktree).
- **Inside (the feature's product changes, `escaped: []` — build stayed in its `## Files`):**
  - `src/lib/detect-archetype.ts`
  - `tests/detect-archetype.test.ts`
- **Partition note:** `--changed` is the feature's product changes only; the `.dev/**` stage artifacts (this + the prior `archetype-io-boundary` increment's PLAN/GRILL/REVIEW/etc.) and `.pharn/**` scratch are excluded — each was written by its own stage under its own writes-scope, not by `/pharn-dev-build`, and none is an input to a deterministic gate.

## Outside gates — `base → head` exit codes

| gate | base | head | result |
| --- | --- | --- | --- |
| `tests` (44 floor `.mjs`/`.cjs` suites, `node --test`) | 0 | 0 | OK |
| `validate` (`node .dev/floor/validate.mjs .`) | 0 | 0 | OK |

- **Style gates skipped** — `inside` touched no shared style config (P5/P7).
- **Eval pairs: none** — no committed `EXPECTED::ACTUAL` structural pair exists.

## Result

- `regressions[]`: **none**; `pre_existing[]`: **none**.

REGRESSIONS: none — no deterministically-detectable breakage outside the feature.

**Honest residual (P0/P7):** `/pharn-dev-regress` catches exactly what its suite catches — nothing more. This is "no deterministically-detectable regression outside the feature," not "nothing broke." The verdict is floor-grade (an exit-code comparison); the orchestration around it is advisory.
