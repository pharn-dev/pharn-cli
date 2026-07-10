# SHIP — remove-dead-docs-url

Thin, **advisory** roll-up of a gated `/pharn-dev-ship` run. It records that the chain ran and its floor verdicts — it is **not** an approval, a "shipped" mark, or a `PHARN ✓ reviewed` seal.

## Original request → what this run actually did

The request had two parts. Discovery (P6) split them:

1. **Migrate the CLI install to the new `pharn/` layout — DEFERRED (not built).** Live-verified this run: pharn-oss has **no** `pharn/` top-level dir on `main` or `migrations-griller` (0/1385 paths), no open PRs. The human confirmed the reorg is "planned / happening now" — i.e. **not merged**. The CLI must mirror the real upstream layout, never invent one, so this half was not built. Re-run it once pharn-oss lands `pharn/` on `main`.
2. **Fix the dead `DOCS_URL` — BUILT.** Human decision: "just remove the URL." Scoped as the increment `remove-dead-docs-url` and carried through the full gated chain below.

## Stages that ran, in order, and where the run ended

| stage | what happened |
| ----- | ------------- |
| `/pharn-dev-plan` | PLAN.md written; **GATE 1** — human **approved as written**. |
| `/pharn-dev-grill` | GRILL.md: 1 concern (0 blocking, 1 minor/advisory — outro has no rendering test; already acknowledged by the plan). Advisory, gated nothing. |
| `/pharn-dev-build` | 3 files, deletion-only (+2/−7). Floor GREEN. |
| `/pharn-dev-regress` | no feature-attributable regression. |
| `/pharn-dev-verify` | all floor gates PASS; 0 verifiers. |
| `/pharn-dev-review` | REVIEW.md: GREEN, 0 floor findings, 0 blocking. |

**Run ended at GATE 2** (post-review human decision) — not at a RED-verdict STOP.

## Structural verdicts read, verbatim (the floor — the only guaranteed parts)

- **`/pharn-dev-build`** → `node .dev/floor/validate.mjs .` exit code = **`0`** (GREEN). (Repo floor `npm run check` also exit 0: format:check + lint + typecheck + **594/594** vitest.)
- **`/pharn-dev-regress`** → `regression-report.json` `.verdict` = **`"no-regressions"`** (exit 0). The one RED gate (`tests`) is `1→1` **pre_existing** — pre-existing `test-app`/`lens-scanner-map` node-runner drift, RED→RED, not attributable to this increment (see REGRESSION.md for the worktree-confound analysis + sound same-environment re-measurement).
- **`/pharn-dev-verify`** → `verify-report.json` `.verdict` = **`"PASS"`** (exit 0); `failing_gates: []`.

## Advisory artifacts (cited, not restated — P4)

- `.dev/features/remove-dead-docs-url/REVIEW.md` — 4-lens review (GREEN; proposes one **candidate** lesson about the regress worktree/`test-app` confound, for a separate human-gated `/pharn-dev-memory-promote` run — not written to canon here).
- `.dev/features/remove-dead-docs-url/GRILL.md` — advisory pre-build interrogation (1 minor concern).

## Honest close (P0)

The chain ran; the named floor verdicts are as shown — this is **NOT** a judgment that the increment is good or wise. That is the human's call at the post-review gate: **merge / fix / abandon.** `/pharn-dev-ship` does not merge, push, commit, or seal. The change is currently **uncommitted** in the working tree.
