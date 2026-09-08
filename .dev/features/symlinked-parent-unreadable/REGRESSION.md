# REGRESSION — symlinked-parent-unreadable

**Base:** `19eb345` — resolved deterministically, not asserted: `git merge-base HEAD origin/main`
returns `19eb3457296584913d220b549df70b0c57d558fb`, which is also `HEAD~1` (the branch forked from
`origin/main` and origin advanced to the same commit). **HEAD:** `4cc8dc8`.

## Inside / outside partition (the floor helper, not the agent)

`node .dev/floor/check-regress.mjs scope` — **exit 0**, `escaped: []`. Every changed file is covered by
the plan's declared `## Files`, so there is no fix #7 scope breach to report.

**Inside (10 files, the feature's own scope):** `src/lib/apply-update.ts`, `src/lib/diff.ts`,
`src/lib/symlink-guard.ts`, `tests/apply-update.test.ts`, `tests/diff.test.ts`,
`tests/symlink-guard.test.ts`, `tests/update.test.ts`, `docs/commands/status.md`,
`docs/commands/update.md`, `CHANGELOG.md`.

**Outside:** 46 stdlib test files (`.claude/hooks/*.test.cjs`, `.dev/floor/*.test.mjs`) — **748 test
cases** — plus the whole-repo `validate`. `outside_eval_pairs` is empty (no committed eval pair sits
outside this feature).

## Per-gate exit codes

| gate       | base `19eb345` | head `4cc8dc8` | flip |
| ---------- | -------------- | -------------- | ---- |
| `tests`    | 0              | 0              | none |
| `validate` | 0              | 0              | none |

`tests` = `node --test` over all 46 outside files (748 pass at both ends); `validate` =
`node .dev/floor/validate.mjs .` (GREEN, 0 capabilities — vacuous, and named as such).

**Style gates (`lint` / `format:check` / `lint:md`) were SKIPPED by the deterministic config-touch
rule:** `inside` touches none of `eslint.config.mjs`, `.prettierrc`, `.prettierignore`,
`.markdownlint-cli2.jsonc`, so over the byte-identical outside files a style flip is provably
impossible. They are absent from **both** maps, so the gate sets match and the comparison stays valid.

## Verdict (FLOOR — `check-regress.mjs verdict`, exit 0)

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.**
`regressions: []`, `pre_existing: []`.

## Honest residual (P7)

This catches **exactly what its suite catches, nothing more.** The 748 outside cases and `validate` are
the deterministic coverage that exists; a breakage outside the feature that no check covers is
invisible here, and this is not a claim that "nothing broke". Two further limits, named rather than
implied:

- The **vitest** suite (`tests/**/*.test.ts`, 953 cases) is not part of the outside gate set — it needs
  installed devDeps, which the stdlib-only baseline worktree deliberately does not obtain. It is
  covered **at HEAD** by `/pharn-dev-verify`'s `npm test` gate, and it is GREEN there, so no vitest gate
  can have flipped pass→fail undetected.
- `validate` is whole-repo, so a flip would be reported at repo granularity rather than per file.

The verdict certifies the **comparison**, not the increment.
