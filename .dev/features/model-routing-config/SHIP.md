# SHIP — model-routing-config (gated /pharn-dev-ship roll-up)

Thin, advisory roll-up of one gated `/pharn-dev-ship` run. It records **that the chain ran and its floor verdicts** — it is **not** a "shipped" decision, an approval, or a `PHARN ✓ reviewed` seal.

## Stages run, in order

| # | stage | kind | outcome |
| - | ----- | ---- | ------- |
| 1 | `/pharn-dev-plan` | human gate | **GATE 1** — plan approved (all 3 open questions resolved to recommended: dev-loop stage set, 4 short model ids, effort `{low,high,max}`) |
| 2 | `/pharn-dev-grill` | advisory | 5 concerns (0 blocking, 1 important, 4 minor) → `GRILL.md`; proceeded (grill gates nothing) |
| 3 | `/pharn-dev-build` | FLOOR | GREEN |
| 4 | `/pharn-dev-regress` | FLOOR | `no-regressions` |
| 5 | `/pharn-dev-verify` | FLOOR | `PASS` |
| 6 | `/pharn-dev-review` | advisory | GREEN (0 blocking, 2 advisory) → `REVIEW.md` |

**Run ended at GATE 2** (post-review human decision) — not at a RED STOP. No stage returned a non-GREEN floor verdict.

## Structural (floor) verdicts read — verbatim

- **`/pharn-dev-build`** → `node .dev/floor/validate.mjs .` exit code = **`0`** (GREEN). Product floor `npm run check` = GREEN (format:check, lint, typecheck, **506** vitest tests).
- **`/pharn-dev-regress`** → `.dev/features/model-routing-config/regression-report.json` `.verdict` = **`"no-regressions"`** (outside gates `tests` 0→0, `validate` 0→0; base `0381ccb`; 663 floor-test assertions green at base and head).
- **`/pharn-dev-verify`** → `.dev/features/model-routing-config/verify-report.json` `.verdict` = **`"PASS"`** (gates `test`/`validate`/`lint`/`format:check`/`lint:md` all 0; `failing_gates: []`; 0 verifiers registered).

## Advisory artifacts (cited, not restated — P4)

- `.dev/features/model-routing-config/REVIEW.md` — 4 lenses, verdict GREEN; **2 advisory findings**. The standing item for the human: the **important P7** finding — "bad → reject" ships as a validator *function* but no shipped read path invokes it (deferred with the subagent-generation consumer; wiring `readPharnConfig` would change its `null`-on-bad-shape contract shared by add/update/status/list). Plus a **minor P5** optional-chaining hardening in `resolveStageModel`.
- `.dev/features/model-routing-config/GRILL.md` — advisory pre-build interrogation (the wrong-type validator test case it raised was absorbed into the build).

## What landed

`src/lib/model-routing.ts` (new: `MODEL_IDS`/`EFFORT_LEVELS`/`PIPELINE_STAGES` allowlists, `DEFAULT_MODEL_ROUTING`, `validateModelRouting`, `resolveStageModel`, `ModelRoutingError`); `src/types.ts` (additive `EffortLevel`/`ModelId`/`PipelineStage`/`StageModel`/`ModelRouting` + optional `models?` on `PharnConfig`); `src/steps/install.ts` + `src/steps/install-archetype.ts` (write `models: DEFAULT_MODEL_ROUTING` on every fresh install); tests `tests/model-routing.test.ts` (new) + assertions in `tests/install.test.ts` and `tests/init-archetype.test.ts`. **Subagent generation that realizes routing is deferred (per the brief).** Nothing committed; the working tree is uncommitted.

## GATE-2 outcome (human-directed follow-up)

At GATE 2 the human **committed the increment** (`b12a94b feat: add per-stage model routing to pharn.config.json`) and directed **both** advisory fixes ("do 3 and 4"):

- **P7 (read-path wiring)** — `readPharnConfig` now calls `validateModelRouting`; a present-but-invalid `models` block makes the config unloadable (returns `null` → "run init"), consistent with the existing shape guard; absent `models` stays legacy/valid (P7). `src/lib/pharn-config.ts` + `tests/pharn-config.test.ts`.
- **P5 (hardening)** — `resolveStageModel` uses optional chaining (`routing.stages?.[stage]`). `src/lib/model-routing.ts` + `tests/model-routing.test.ts`.

Plan `## Files` was amended (fix #7) to bring the two new targets into scope. **Re-verified on the fixed working tree:** `npm run check` GREEN (**509** vitest tests, +3); `/pharn-dev-verify` = **`PASS`** (all 5 gates 0); `/pharn-dev-regress` = **`no-regressions`** (base `b12a94b` → HEAD, outside gates 0→0; `regression-report.json` updated). The fix is **uncommitted** on top of `b12a94b`.

## Standing decision

The chain ran; the named floor verdicts are as shown — **this is NOT a judgment that the increment is good or wise; that is the human's call at the post-review gate.**
