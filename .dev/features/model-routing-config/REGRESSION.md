# REGRESSION — model-routing-config

- Base: `0381ccb` (working-tree dogfood build → `base = HEAD`; the increment is uncommitted, so HEAD is the pre-build baseline).
- Verdict source: `.dev/floor/check-regress.mjs verdict` (deterministic exit-code comparison — ZERO LLM judgment in the core).

## Inside / outside partition (deterministic, `check-regress.mjs scope` — exit 0, no escape)

**Inside (the feature's changed code, ⊆ the plan's `## Files` — no fix#7 escape):**

- `src/lib/model-routing.ts`, `src/types.ts`, `src/steps/install.ts`, `src/steps/install-archetype.ts`
- `tests/model-routing.test.ts`, `tests/install.test.ts`, `tests/init-archetype.test.ts`

(The working tree also holds pipeline artifacts — `.dev/features/model-routing-config/*`, `.pharn/writes-scope.json` — written by the plan/grill/regress stages under their own scopes, not by `/pharn-dev-build`; they are not feature code and are excluded from the build-scope check.)

**Outside gates run (identical set at base and head):** `tests` (the 44 committed `*.test.mjs`/`*.test.cjs` floor + hook tests = 663 assertions), `validate` (`.dev/floor/validate.mjs .`, whole-repo). Style gates (`lint`/`format:check`/`lint:md`) **skipped** deterministically — the inside touches no shared style config, so an outside style flip is provably impossible. No committed eval pairs exist → no `structural:*` gate.

## Per-gate exit codes (base → head)

| gate       | base | head | result |
| ---------- | ---- | ---- | ------ |
| `tests`    | 0    | 0    | OK     |
| `validate` | 0    | 0    | OK     |

- `regressions`: none
- `pre_existing` (already red at baseline, never blamed on the feature): none

## Verdict

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.** Stage passes (`check-regress.mjs verdict` exit 0).

**Honest residual (P0/P7):** `/pharn-dev-regress` catches exactly what its suite catches — nothing more. Here the suite is the 44 `.mjs`/`.cjs` floor + hook tests and `validate`; the **product `vitest` suite (`tests/*.test.ts`) is NOT in this `node --test` universe** (a named granularity limit) — but it is covered by the build floor (`npm run check`, GREEN, 506 tests) and re-run at `/pharn-dev-verify`. So "nothing regressed" here means: nothing the floor `.mjs` suite + `validate` covers flipped pass→fail outside the feature — not a claim that the increment is correct (that is review's advisory job).
