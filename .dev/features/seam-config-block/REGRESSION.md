# REGRESSION — seam-config-block

- base: `d1c4829` (working-tree dogfood build → base = HEAD, per `git status --porcelain` non-empty)
- verdict source: `.dev/floor/check-regress.mjs verdict` (exit `0`) — machine report:
  `.dev/features/seam-config-block/regression-report.json`

## Inside / outside partition (`check-regress.mjs scope`, exit 0 — no escape)

**Inside (the feature's changed scope = the plan's `## Files`, `inside ⊆ declared`, `escaped: []`):**

- `src/lib/seam-config.ts`, `src/types.ts`, `src/lib/pharn-config.ts`,
  `src/steps/install.ts`, `src/steps/install-archetype.ts`,
  `tests/seam-config.test.ts`, `tests/pharn-config.test.ts`

Pipeline bookkeeping (`.pharn/**` scratch, `.dev/features/**` stage artifacts written by
plan/grill/regress under their own scopes — **not** the build) was excluded from `--changed`; the
build's writes were hook-pinned to the 7 files above, so nothing landed outside them via the build.

**Outside gate set (decided once, identical at base and head):**

- `tests` — `node --test` over the 44 outside floor/hook suites (`.dev/floor/*.test.mjs` +
  `.claude/hooks/*.test.cjs`); none are inside the feature.
- `validate` — `node .dev/floor/validate.mjs .` (whole-repo; a named granularity limit).
- **Skipped:** style gates (`lint`/`format:check`/`lint:md`) — inside touched no shared style config,
  so an outside style flip is provably impossible. **No** structural eval pairs — none are committed
  with both halves (trust-fence has an `actual` `findings.json` but its `expected` lives as prose per
  `eval-format.md`, so there is no `EXPECTED::ACTUAL` pair to run).

## Per-gate exit codes (`base → head`)

| gate       | base | head | result |
| ---------- | ---- | ---- | ------ |
| `tests`    | 0    | 0    | OK     |
| `validate` | 0    | 0    | OK     |

- `regressions[]` (base == 0 && head != 0, outside the feature): **none**
- `pre_existing[]` (already red at baseline — excluded, never blamed on the feature): **none**

## Verdict

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature** (stage passes;
`check-regress.mjs verdict` exit 0).

Honest residual (P0/P7): `/pharn-dev-regress` catches **exactly what its suite catches — nothing more.** A
regression outside the feature that **no** deterministic gate covers is invisible here. This is "no
deterministically-detectable breakage outside the feature," **not** "nothing broke." (The CLI's own
`vitest` `.test.ts` suite is not in this outside set by design — it was already gated GREEN by
`/pharn-dev-build`'s `npm run check`; this stage guards the floor/hook tooling + `validate`, which
`npm run check` does not run.)
