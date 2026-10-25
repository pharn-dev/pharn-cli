# REGRESSION — markdown-it-15-0-3

- **Base:** `c530ab49` (HEAD; the build is uncommitted in the working tree, so `git status` non-empty → `base = HEAD`).
- **Inside:** `CHANGELOG.md`, `package-lock.json`, `package.json`, `tests/dependency-overrides.test.ts` — equal to the plan's `## Files`; `check-regress.mjs scope` exit 0, `escaped: []`. Orchestration note (advisory): `.pharn/` (scratch) and `.dev/features/markdown-it-15-0-3/*` (the loop's own artifacts) were left out of `--changed`, as in earlier features (e.g. `update-remove-dropped-capabilities`).
- **Outside gates** (same set at base and head): `tests` (46 `.dev/floor/*` + `.claude/hooks/*` suites, `node --test`), `validate` (whole-repo), and — deliberately widened past the style-skip rule — `lint:md`, `format:check`, `lint` and `vitest`. The skip rule assumes only a style CONFIG file can flip a style gate over unchanged files; this increment swaps the markdown linter's own version (`markdownlint` 0.41.1 → 0.42.0), so `lint:md` could flip with no config change. Base ran in a fresh detached worktree after `npm ci --ignore-scripts`. No committed eval pairs (`outside_eval_pairs: []`).

| gate         | base | head |
| ------------ | ---- | ---- |
| tests        | 0    | 0    |
| validate     | 0    | 0    |
| lint:md      | 0    | 0    |
| format:check | 0    | 0    |
| lint         | 0    | 0    |
| vitest       | 0    | 0    |

`regressions: []`, `pre_existing: []` (see `regression-report.json`).

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.** This catches exactly what the suite above catches, nothing more; a break no test, lint or eval covers would be invisible here.
