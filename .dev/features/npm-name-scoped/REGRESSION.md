# REGRESSION — npm-name-scoped

- **Base:** `907efac` (main / merge-base of `feat/npm-name-scoped`) — the pre-feature fork point.
- **Head:** `5502b3b` (`chore: scope npm package to @pharn-dev/pharn`).
- **Verdict source:** `.dev/floor/check-regress.mjs verdict` (exit `0`) — deterministic exit-code comparison, zero LLM judgment.

## Inside / outside partition (`check-regress.mjs scope`, exit 0)

- **Inside (13 product files, all ⊆ the plan's `## Files`):** `package.json`, `package-lock.json`, `README.md`, `SECURITY.md`, `CLAUDE.md`, `CHANGELOG.md`, `docs/getting-started.md`, `docs/contributing.md`, `docs/troubleshooting.md`, `docs/RELEASING.md`, `.github/ISSUE_TEMPLATE/bug_report.md`, `src/index.ts`, `src/steps/prereqs.ts`.
- **`escaped: []`** — no changed product file lies outside the declared writes (fix #7 clean; the build did not escape its `## Files`).
- Apparatus artifacts (`.dev/features/npm-name-scoped/**`, `.pharn/**`) are excluded from the changed set — they are written by the plan/grill/regress stages under their own scopes, not by the build.
- **Outside gates:** `tests` (44 floor/hook `*.test.mjs` / `*.test.cjs`) + `validate` (whole-repo). **`outside_eval_pairs: []`** (no committed eval pair).

## Baseline-fidelity note (prior REVIEW lesson #1)

The feature commit `5502b3b` touches **only** the 13 product files — **nothing** under `.dev/floor/`, no `*.test.mjs`/`*.test.cjs`, no capability, no `test-*/` fixture. The outside gates read **only** those (unchanged) inputs, so their exit codes are **byte-identical at `907efac` and `5502b3b`**. Both measurements were taken **in the working tree** (with the gitignored `test-*/` install fixtures present), holding the environment constant — deliberately avoiding the detached-`git worktree` baseline that is blind to gitignored dirs (which would falsely flip a `test-*/`-driven gate GREEN→RED).

## Per-gate exit codes (base → head)

| gate       | base | head | classification |
| ---------- | ---- | ---- | -------------- |
| `tests`    | 1    | 1    | pre-existing (RED→RED) — a floor test counts the gitignored `test-*/` install capabilities |
| `validate` | 1    | 1    | pre-existing (RED→RED) — RED on `test-*/pharn/floor/test-fixtures/red/skill.md`, a deliberate red fixture in an install copy |

- **`regressions: []`** — no gate flipped pass→fail.
- **`pre_existing: ["tests", "validate"]`** — RED at the baseline **and** at HEAD; owned by the repo's known `test-*/` contamination (prior REVIEW lessons #1/#2), **not** by this increment. This increment changed none of their inputs.

## Verdict

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.** (`check-regress.mjs verdict` exit 0.)

_Honest residual (P0/P7): `/pharn-dev-regress` catches exactly what its deterministic suite catches — nothing more. This is "no detectable outside-the-feature breakage," not "nothing broke." A regression no deterministic check covers would be invisible here._
