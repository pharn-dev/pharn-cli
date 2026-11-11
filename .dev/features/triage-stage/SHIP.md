# SHIP — triage-stage

Gated `/pharn-dev-ship` run (no `--loop`). Ended at **GATE 2**, the human's merge / fix / abandon decision.

## Stages, in order

1. `/pharn-dev-plan` → `PLAN.md`. **GATE 1:** approved as written by the maintainer, 2026-11-11, with
   version 0.18.1 chosen. Amended during build (dated in `## Files`): four tests whose "unknown stage"
   example was `triage`, and `tests/release-consistency.test.ts` (`KNOWN_TAGS` += `v0.18.0`).
2. `/pharn-dev-grill` → `GRILL.md` (advisory; 0 blocking-severity, 1 important, 2 minor). The important
   one (doc wording on what an older pharn does with a `triage` key) was addressed in the build.
3. `/pharn-dev-build` → floor: `node .dev/floor/validate.mjs .` exit **0** (`FLOOR: GREEN`); `npm run check`
   exit 0; `npm run build` exit 0.
4. `/pharn-dev-regress` → `regression-report.json` `.verdict` = **`"no-regressions"`** (base `30ed793`).
5. `/pharn-dev-verify` → `verify-report.json` `.verdict` = **`"PASS"`** (`failing_gates: []`).
6. `/pharn-dev-review` → `REVIEW.md` (advisory; see it for the findings — not restated here).

## What landed

`triage` in `PRODUCT_STAGES` (after `grill`); the vendored checker refreshed to pharn-oss `3afbb125`
(7.7.1) with its `frontmatter-core.mjs` import, both sha256-pinned; stage-enumerating tests and docs;
CHANGELOG `0.18.1` and the version bump. pharn-oss `MIN_CLI` needs no change (its own block names no
`triage` key).

Chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is good or
wise; that is the human's call at the post-review gate.
