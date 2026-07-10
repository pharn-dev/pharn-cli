# REGRESSION — init-archetype-default

- **Base:** `f58094e` (working tree is dirty → base = HEAD; a working-tree dogfood build)
- **Verdict:** `REGRESSIONS: none — no deterministically-detectable breakage outside the feature`
- **Determinism:** the verdict is `.dev/floor/check-regress.mjs verdict`'s output verbatim (exit 0). The orchestration below is advisory; only the exit-code comparison is the guarantee.

## Inside / outside partition

- **Inside (changed, plan-authorized):** `src/commands/init.ts`, `src/index.ts` (modified) + 19 deleted legacy files (9 `src/steps/*.ts`, 9 `tests/*.test.ts`, `tests/init-v2.test.ts`) + `tests/init.test.ts`, `tests/index.test.ts` (rewritten). `check-regress scope` → `escaped: []` (no write-scope breach; every change is covered by the plan's `## Files` + `### Deleted`).
- **Outside test universe:** 44 `*.test.mjs` / `*.test.cjs` (floor + hook suites). None are inside the feature.
- **Style gates:** skipped — `inside` touches no shared style config (`eslint.config.mjs`, `.prettierrc.json`, …), so an outside style flip is provably impossible.
- **Eval pairs:** none committed here (no outside `structural:*` gate).

## Per-gate base → head (exit codes)

| gate       | base | head | classification |
| ---------- | ---- | ---- | -------------- |
| `tests`    | 1    | 1    | pre_existing   |
| `validate` | 0    | 0    | OK             |

- **`validate` 0 → 0 (OK):** this TS-only increment adds no markdown capability, so it cannot affect `validate` over the tracked repo.
- **`tests` 1 → 1 (pre_existing):** the aggregate `.mjs/.cjs` suite is already red at the **clean committed baseline** `f58094e` (measured in a fresh `git worktree`, none of this increment's changes present). It is therefore independent of this increment; `check-regress` excludes pre-existing red from blame. Named, not hidden — the outside `.mjs/.cjs` suite has a pre-existing failure that predates and is unrelated to this work.

## Measurement-correction note (honest — the first capture was inconsistent)

The **first** head capture reported `validate` `0 → 1`, i.e. an apparent regression. Root cause (verified, not assumed): `test-app/` is a **gitignored, 0-tracked-file** local build artifact (from `npm run build:install-local`) present in the working tree but **absent** from the clean `git worktree` baseline. `validate.mjs .` is whole-repo, so at head it scanned `test-app/pharn/floor/test-fixtures/red/skill.md` (a deliberately-invalid "red" fixture) and at base it did not — the two runs measured **different file universes**, violating check-regress's "same scoped gates at base and head by construction" precondition. This was an orchestration bug in the capture, not a code regression.

**Correction:** the head `validate` gate was re-measured over the **same tracked scope** as the baseline (untracked `test-app/` set aside, then restored) → `0` GREEN, and confirmed all failures were solely the `test-app/` fixture. The deterministic verdict was then re-run over the corrected, apples-to-apples inputs → `no-regressions` (exit 0). No code change was made to reach green; only the measurement scope was made consistent. The `check-regress.mjs verdict` JSON in `regression-report.json` is the corrected run.

## Honest residual (P0/P7)

`/pharn-dev-regress` catches exactly what its deterministic suite catches — nothing more. A broken behavior with no test/rule/eval outside the feature is invisible here. This verdict certifies **the comparison**, not that the increment is whole.
