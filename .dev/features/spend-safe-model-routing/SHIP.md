# SHIP — spend-safe-model-routing (gated run)

`/pharn-dev-ship` roll-up — **advisory**. This records that the chain ran and its floor verdicts; it is
**not** a self-issued "shipped", an approval, or a `PHARN ✓ reviewed` seal. The standing decision is the
human's at GATE 2.

## Stages that ran, in order

| Stage           | Outcome                                                                                  |
| --------------- | ---------------------------------------------------------------------------------------- |
| `/pharn-dev-plan`    | PLAN.md written; **GATE 1** approved as written (doc-link resolved URL-free)              |
| `/pharn-dev-grill`   | GRILL.md — 6 advisory concerns (0 blocking); actionable ones absorbed into build         |
| `/pharn-dev-build`   | 8 files written; floor GREEN                                                              |
| `/pharn-dev-regress` | regression-report.json — `no-regressions`                                                |
| `/pharn-dev-verify`  | verify-report.json — `PASS`                                                               |
| `/pharn-dev-review`  | REVIEW.md — GREEN, 0 blocking findings                                                    |

**Run ended at GATE 2** (post-review human decision) — not a RED-verdict stop.

## Structural verdicts read (verbatim — the floor clock)

- **`/pharn-dev-build` → floor:** `npm run check` **GREEN** (`format:check` + `lint` + `typecheck` + `test`
  395/395). `node .dev/floor/validate.mjs .` = **0 on a clean checkout of HEAD** (CI truth); the dirty
  local working tree exits `1` **only** from gitignored `test-*/` install fixtures — unrelated to this
  increment, which adds no PHARN markdown capability. (`lint:md` = 0, run explicitly since `npm run check`
  omits it.)
- **`/pharn-dev-regress` → `regression-report.json` `.verdict` = `"no-regressions"`** (base `8b5a87c` → head
  `844bc92`; outside gates `tests` 1→1 pre-existing, `validate` 0→0; both captured in fresh worktrees so
  gitignored `test-*/` is held constant).
- **`/pharn-dev-verify` → `verify-report.json` `.verdict` = `"PASS"`** (gates `test`/`validate`/`lint`/
  `format:check`/`lint:md` all 0; `verifiers.registered` = 0 — floor gates only).

## Advisory artifacts (cited, not restated — P4)

- **`.dev/features/spend-safe-model-routing/REVIEW.md`** — 4 principle-lenses; GREEN, 0 blocking. Two advisory
  findings for the human to weigh: **P3 (important)** the renderer's home in `model-routing.ts` (adjudicated
  defensible one-axis, extract later if a second UI renderer lands); **P1 (minor)** the init-outro string is
  untested (per the `remove-dead-docs-url` repo precedent).
- **`.dev/features/spend-safe-model-routing/GRILL.md`** — advisory pre-build interrogation (6 concerns).

## What landed (for the human's context)

Spend-safe default at the SoT (`DEFAULT_MODEL_ROUTING.stages.review`: `fable-5/max` → `opus-4-8/high`, with
rationale) + post-install visibility (a "Models per stage" block in the `init` outro and a `MODELS` note in
`pharn status`, both rendered from the written `config.models`) + a "Model routing" doc section + tests +
CHANGELOG (no version bump). `fable-5/max` cross-model review is now a documented opt-in. Existing configs
are not migrated (`models` is user-owned after init).

---

Chain ran; the named floor verdicts are as shown — this is **NOT** a judgment that the increment is good or
wise; that is the human's call at the post-review gate.
