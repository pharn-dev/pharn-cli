# REGRESSION — archetype-io-boundary

**Verdict (floor, `check-regress.mjs verdict` exit 0):** `no-regressions`.

## Base + partition

- **Base:** `6402a3e` (working tree is dirty — the dogfood case → `base = HEAD`; the baseline was a clean detached `HEAD` worktree, without the feature's additive files).
- **Inside (the feature's product changes, checked ⊆ declared):**
  - `src/lib/detect-archetype.ts`
  - `tests/detect-archetype.test.ts`
  - `escaped: []` — the build stayed inside its plan `## Files` (fix #7 cross-check clean).
- **Partition note (honest, not hidden):** `--changed` was the feature's **product** changes only. The other uncommitted paths — `.dev/features/archetype-io-boundary/{PLAN,GRILL}.md`, `.dev/features/archetype-io-boundary/regression-report.json`, and `.pharn/writes-scope.json` — are **stage artifacts / scratch**, each written by its own stage (`/pharn-dev-plan`, `/pharn-dev-grill`, this stage) under that stage's own writes-scope, not by `/pharn-dev-build`. They are excluded from `--changed` because they are not build output and not inputs to any deterministic gate; folding them in would misattribute other stages' writes to the build and falsely trip the fix #7 escape check.

## Outside gates — `base → head` exit codes

| gate | base | head | result |
| --- | --- | --- | --- |
| `tests` (44 floor `.mjs`/`.cjs` suites, `node --test`) | 0 | 0 | OK |
| `validate` (`node .dev/floor/validate.mjs .`) | 0 | 0 | OK |

- **Style gates (`lint` / `format:check` / `lint:md`): skipped** — deterministically, because `inside` touched no shared style config (`eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`, `.markdownlint-cli2.jsonc`); over the byte-identical outside files a style result cannot flip, so the gate is provably unnecessary (P5/P7).
- **Eval pairs: none** — the only committed `findings.json` (`.dev/features/trust-fence/findings.json`) has no committed `expected.json` counterpart (trust-fence's expected lives as prose per `eval-format.md`), so there is no `EXPECTED::ACTUAL` structural gate to run.

## Result

- `regressions[]`: **none**
- `pre_existing[]`: **none**

REGRESSIONS: none — no deterministically-detectable breakage outside the feature.

**Honest residual (P0/P7):** `/pharn-dev-regress` catches exactly what its suite catches — nothing more. This verdict is "no deterministically-detectable regression outside the feature," **not** "nothing broke." A broken behavior with no test / rule / eval covering it is invisible here. The verdict is floor-grade (an exit-code comparison by `check-regress.mjs`); the orchestration around it (base resolution, inside/outside partition, running the suite) is advisory.
