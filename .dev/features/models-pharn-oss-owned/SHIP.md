# SHIP — models-pharn-oss-owned

Roadmap Phase 2.0 (token-reduction roadmap, approved by the maintainer 2026-09-25): pharn-oss owns the
`models` block; `init` copies it, `update` migrates it, `status` labels it truthfully.

## Gate decisions — model decisions under delegation, NOT human approvals

The maintainer delegated both human gates to the model in chat on 2026-09-25 ("Plan approval (GATE 1)
and the merge/fix decision (GATE 2) are delegated to you. Record them in SHIP.md as model decisions made
under that delegation, never as human approvals"). Every decision below was made by the model
(`claude-opus-5-5`) under that delegation. **No human approved any of them.**

| gate            | decision (model, under delegation)                                                                                                                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GATE 1          | Plan approved as written, then amended once to fold the grill's findings (record key moved to `install-records.ts`; see `PLAN.md` "Grill fold-ins"). The one open choice — delegate to the installed checker vs. a pinned copy — decided in `PLAN.md`. |
| GATE 2, iter. 1 | **Fix.** `REVIEW.md` iteration 1 carried two important advisory defects (a converted old default losing its authorship; an unserializable upstream block half-installing) plus minor ones. The loop body re-ran within the plan's `## Files`.          |
| GATE 2, iter. 2 | **Merge**, once the PR's required checks are green (the maintainer's standing instruction: `gh pr merge --squash`, `--admin` only if review is required; stop if the auto-mode classifier denies the merge).                                           |

## Stages run, in order

| #   | stage                     | outcome                                                                              |
| --- | ------------------------- | ------------------------------------------------------------------------------------ |
| 1   | `/pharn-dev-plan`         | `PLAN.md`; GATE 1 (delegated)                                                        |
| 2   | `/pharn-dev-grill`        | `GRILL.md` — 9 advisory concerns (1 important), folded into the plan                 |
| 3   | `/pharn-dev-build`        | 42 planned paths; `npm run check` GREEN                                              |
| 4   | `/pharn-dev-regress`      | `regression-report.json`                                                             |
| 5   | `/pharn-dev-verify`       | `verify-report.json`                                                                 |
| 6   | `/pharn-dev-review`       | `REVIEW.md` iteration 1 (four lenses + an independent read-only probe); GATE 2 → fix |
| 7   | fix (within `## Files`)   | 3 defects fixed, 6 wording/test gaps closed, 2 accepted and named                    |
| 8   | regress → verify → review | iteration 2; `check-ship.mjs --iter 2 --cap 3` → `STOP_GREEN`; GATE 2 → merge        |

## Structural verdicts read, verbatim

| stage                     | verdict source                             | iteration 1        | iteration 2        |
| ------------------------- | ------------------------------------------ | ------------------ | ------------------ |
| `/pharn-dev-build`        | `node .dev/floor/validate.mjs .` exit code | `0`                | `0`                |
| `/pharn-dev-regress`      | `regression-report.json` `.verdict`        | `"no-regressions"` | `"no-regressions"` |
| `/pharn-dev-verify`       | `verify-report.json` `.verdict`            | `"PASS"`           | `"PASS"`           |
| stop (`--loop` semantics) | `.dev/floor/check-ship.mjs` decision       | —                  | `STOP_GREEN`       |

`.regressions[]`, `.pre_existing[]` and `.failing_gates[]` are empty; `verifiers.registered` is `0`.
`/pharn-dev-review` has no structural verdict and none was invented; it is read at GATE 2.

## After the PR opened

CI's `Test` job failed once: two new tests measured a note's line width with the color codes CI turns
on (picocolors reads `CI`), so a 62-column line counted as 71. The product was unaffected; the tests
now measure visible columns (`stripVTControlCharacters`). The whole suite was re-run locally under
`CI=1` (1818 passed) with `npm run check` and the coverage ratchet green, then pushed.

## Stage models

The maintainer asked that each stage run on the model this repo's `pharn.config.json` `models` block
assigns. This repo has no `pharn.config.json`, so no block assigns one: every stage ran on the session
model, `claude-opus-5-5`. (The stage commands' `model_tier:` is PHARN's own frontmatter field, inert
to the platform.)

## Pointers

- `REVIEW.md` — iteration 1 findings and the iteration 2 resolution table (read at GATE 2).
- `GRILL.md` (advisory), `REGRESSION.md` / `VERIFY.md` (human renders of the floor verdicts).

## For the human — reconciliations only you can make

The trusted docs are human-only (write-protected by `.claude/hooks/protect-trusted-paths.cjs`), so
this run did not edit them:

- `CONSTITUTION.md` P3 — "this CLI owns the `pharn.config.json` schema" is now true for every key
  except `models`, whose schema and defaults pharn-oss owns (your decision of 2026-09-25). P3's
  enforceable clause (one change-reason per file, no sibling-leaf imports) still holds: pharn-oss's
  rules sit in their own file, `src/lib/model-config.ts`.
- `THREAT-MODEL.md` §3.1 — lists `models` among the local-origin fields ("the `models`/`seam`
  defaults"). It is now a fourth network-derived field, validated at its ingest boundary by
  `checkModelsBlock` (`readUpstreamModels`).

---

The chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is
good or wise; that is the human's call at the post-review gate, made here by the model under the
maintainer's explicit delegation and recorded as such. Nothing here is a `PHARN ✓ reviewed` seal, an
approval, or a self-issued "shipped".
