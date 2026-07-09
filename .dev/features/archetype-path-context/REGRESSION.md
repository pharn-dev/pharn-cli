# REGRESSION — archetype-path-context (re-run after GATE-2 fix)

**Verdict (FLOOR, `check-regress.mjs verdict`):** `no-regressions` — exit `0`.

Re-run after the GATE-2 fix iteration (P3 extraction + P1 coverage), measuring the **entire increment +
fix** against the pre-feature baseline. Pure exit-code comparison, zero LLM judgment.

## Base + scope partition

- **base:** `186b55d` (`186b55d4c9be259142fc9f7513828a06aa86191c`) — the pre-feature parent of the
  feature commit `b7dc5b6`. `git diff` is taken against the **working tree**, so the still-uncommitted fix
  is included in the measured set.
- **inside (declared `## Files`, now 6):** `src/lib/archetype.ts`, `src/lib/capability-index.ts`,
  `src/lib/detect-archetype.ts`, `tests/archetype.test.ts`, `tests/capability-index.test.ts`,
  `tests/detect-archetype.test.ts`. `scope` exit `0`, `escaped: []`.
- **outside gate set:** `tests` (44 stdlib `node --test` floor + hook tests) and `validate`. Style gates
  skipped (`inside` touches no shared style config). No outside eval pairs.

## Per-gate base → head (exit codes)

| gate       | base | head | classification |
| ---------- | ---- | ---- | -------------- |
| `tests`    | 1    | 1    | **pre_existing** (RED→RED, not a flip) |
| `validate` | 0    | 0    | clean (GREEN→GREEN) |

`regressions[]`: **none**. `pre_existing[]`: `tests` (the same node-runner aggregate-exit quirk as the
first run — 594/594 vitest + all `node --test` cases actually pass; identical at base and head, unrelated
to this feature, which touches only `src/lib` + vitest `.test.ts`). The fix (extracting `classifyEntry`
to `archetype.ts`) changes no `.mjs` floor script, so no outside gate could flip.

## Honest residual (P0/P7)

`/pharn-dev-regress` catches exactly what its deterministic suite catches — nothing more. Certifies the
comparison, not the feature as a whole.
