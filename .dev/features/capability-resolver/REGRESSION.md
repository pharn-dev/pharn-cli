# REGRESSION — capability-resolver

- **Base:** `HEAD` (`0614549`) — working tree is dirty (a dogfood build), so the pre-build baseline is HEAD.
- **Verdict source:** `.dev/floor/check-regress.mjs verdict` (deterministic exit-code comparison — zero LLM judgment in the core).

## Inside / outside partition (`check-regress.mjs scope`, exit 0)

- **Inside (the feature's changed product surface):** `src/types.ts`, `src/lib/archetype.ts`, `src/lib/resolve-capabilities.ts`, `tests/archetype.test.ts`, `tests/resolve-capabilities.test.ts`.
- **Escaped scope:** none — every changed product file is covered by the plan's `## Files` (fix #7 clean). Dev-loop apparatus (`.dev/`, `.pharn/`) is excluded from the product partition by the dev/product boundary (written by the plan/grill/setter stages under their own scopes, not the build).
- **Outside gates run:** the `tests` gate (`node --test` over all **44** `.test.mjs`/`.test.cjs` floor + hook suites, none of which are inside) and the `validate` gate (`node .dev/floor/validate.mjs .`). No committed capability eval pairs exist, so no `structural:*` gate. Style gates skipped (deterministic config-touch rule: inside touches no shared style config).

## Per-gate exit codes (base → head)

| gate | base | head | result |
| --- | --- | --- | --- |
| `tests` (44 outside suites) | 0 | 0 | OK |
| `validate` (whole-repo) | 0 | 0 | OK |

- **regressions:** none
- **pre_existing:** none

## Verdict

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.** (`check-regress.mjs verdict` exit 0.)

Honest residual (P0/P7): this certifies **only** the comparison — `/pharn-dev-regress` catches exactly what its suite catches, nothing more. A broken behavior with no test/rule/eval covering it is invisible here. "No regressions" means "no gate flipped GREEN→RED outside the feature," **not** "nothing broke."
