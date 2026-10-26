# SHIP — default-channel-latest

Gated `/pharn-dev-ship` run (no `--loop`). Ended at **GATE 2** (post-review human decision).

## Stages, in order

1. `/pharn-dev-plan` → `PLAN.md`; **GATE 1** passed 2026-10-26 ("Approve as written", Q1–Q3 answered with the
   recommended options — see `PLAN.md` `## Resolved decisions`). Before planning, the API showed pharn-oss
   release `v7.1.3` (non-draft, tag commit `35202ff8…`, `SKILLS_VERSION` 7.1.3 = tag).
2. `/pharn-dev-grill` → `GRILL.md` (advisory; 0 blocking, 3 important, 3 minor). Proceeded, as the stage
   gates nothing.
3. `/pharn-dev-build` → floor verdict: `node .dev/floor/validate.mjs .` exit **0**; `npm run check` GREEN.
   During build the plan's `## Files` was reformatted to one path per line (the writes-scope parser reads
   one per bullet) and extended with test-fallout files, two comment-only `src/` files, the shipped `v0.14.1`
   tag in `tests/release-consistency.test.ts`, and (after review) `docs/reference/pharn-config.md` — each
   recorded in `PLAN.md`.
4. `/pharn-dev-regress` → `regression-report.json` `.verdict`: **`no-regressions`** (`tests` 0 → 0,
   `validate` 0 → 0). A first attempt mis-ran `node --test` (zsh did not split the file list); corrected
   before the verdict was recorded — see `REGRESSION.md`.
5. `/pharn-dev-verify` → `verify-report.json` `.verdict`: **`PASS`** (test, validate, lint, format:check,
   lint:md, typecheck all 0; 0 verifiers registered).
6. `/pharn-dev-review` → `REVIEW.md` (3 minor advisory findings). The three were fixed (two misplaced doc
   comments, one stale reference-doc row); `npm run check`, regress (`no-regressions`) and verify (`PASS`)
   were re-run on the fixed tree and the reports above are from that run.

## Pointers

- Review: `.dev/features/default-channel-latest/REVIEW.md` (findings not restated here).
- Grill (advisory): `.dev/features/default-channel-latest/GRILL.md`.
- Trusted-doc draft `LIMITS.updated.md` (§1d, §3b, §3e): applied to `LIMITS.md` by the human with a
  one-off patch script, and the draft removed in the same commit.

## Standing decision

The chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is good or
wise; that is the human's call at the post-review gate. Nothing here merges, releases or seals.
