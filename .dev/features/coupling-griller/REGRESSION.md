# REGRESSION — coupling-griller

**Base:** `456fc08` (working-tree dogfood → `base = HEAD`, per `git status --porcelain` non-empty). ·
**Verdict source:** `.dev/floor/check-regress.mjs verdict` (exit 0). · **This is a FLOOR verdict** (exit-code
comparison); the orchestration around it (scoping, running the suite) is advisory.

## Inside / outside partition (deterministic — `check-regress.mjs scope`, exit 0, no breach)

- **Inside (the feature):** `pharn-pipeline/grillers/coupling/**` — the 7 product files the build wrote,
  all covered by the plan's `## Files` (`escaped: []` — the build did **not** leave its declared scope, fix #7).
- **Orchestration note (advisory, honest):** the pipeline's own feature-trace apparatus
  (`.dev/features/coupling-griller/PLAN.md`, `GRILL.md`, and these reports) is written by the plan/grill/regress
  **stages**, not by the build; it is intentionally excluded from the build's fix#7 scope and from the
  `--changed` breach set. Excluding a fixed, known directory is deterministic, not a judgment call. The
  **verdict** below rests only on exit codes.

## Per-gate exit codes (identical gate set at base and HEAD)

| gate                       | base | head | result |
| -------------------------- | ---- | ---- | ------ |
| `tests` (218 stdlib tests) | 0    | 0    | OK     |
| `validate` (whole-repo)    | 0    | 0    | OK     |
| `structural:trust-fence`   | 0    | 0    | OK     |

- `regressions[]`: **none** · `pre_existing[]`: **none**
- Purely additive increment — **zero** modified tracked files (`git diff HEAD` empty; the 9 new files are
  untracked-new), so no outside gate could flip.

## Verdict

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.**

_Honest residual (P0/P7): `/pharn-dev-regress` catches exactly what its suite catches — nothing more. A broken
behavior with no test / rule / eval is invisible here. This certifies the **comparison** (no outside gate
flipped GREEN→RED), not that the feature is whole._
