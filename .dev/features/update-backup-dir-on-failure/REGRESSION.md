# REGRESSION — update-backup-dir-on-failure

Base: `b12e6ac164eac942d8492a3bfbb41c927b071583` (working-tree dogfood build —
`git status --porcelain` was non-empty, so the deterministic rule resolves `base = HEAD`).

## Inside / outside partition

`node .dev/floor/check-regress.mjs scope` → **exit 0**, `escaped: []`. No changed path fell outside a
declared write, so there is no fix #7 scope breach to report.

Inside (6):

- `src/commands/update.ts`, `tests/update.test.ts`, `docs/commands/update.md` — the plan's `## Files`
- `.pharn/writes-scope.json` — the loop's own scope state, rewritten by `set-writes-scope.cjs` at
  every stage; `enforce-writes-scope.cjs` treats `.pharn/**` as always-writable scratch
- `.dev/features/update-backup-dir-on-failure/PLAN.md`, `GRILL.md` — the loop's own stage artifacts,
  each written under its own command's `writes:` frontmatter

The last three are declared writes of the **stage commands**, not of the plan; they were passed to
`--declared` as such rather than being quietly dropped from `--changed`, so the fix #7 cross-check
still ran over every changed path.

Outside: **46** test files (`*.test.mjs` / `*.test.cjs`), **0** eval pairs.

Style gates (`lint` / `format:check` / `lint:md`) were **skipped** by the deterministic config-touch
rule: `inside` touches none of `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`,
`.markdownlint-cli2.jsonc`, so a style flip over byte-identical outside files is provably impossible.
The baseline worktree therefore needed no `npm ci`.

## Gates — base → head (exit codes)

| gate       | base | head | result |
| ---------- | ---- | ---- | ------ |
| `tests`    | 0    | 0    | stable |
| `validate` | 0    | 0    | stable |

`tests` = `node --test` over the 46 outside files (748 assertions, 0 fail at both ends).
`validate` = `node .dev/floor/validate.mjs .` (whole-repo — the named granularity limit).

`regressions[]`: empty. `pre_existing[]`: empty.

## A measurement fault found and corrected during this run

The first capture recorded `tests=1` at **both** ends and would have been reported as a pre-existing
red. It was neither: the shell here is **zsh**, which does not word-split an unquoted parameter
expansion, so the newline-joined file list reached `node --test` as a single argument and it exited 1
with `Could not find '<the whole list>'`. The suite had not run at all. Re-captured by expanding
`git ls-files` inline at each location; both ends then ran the full 748 assertions.

Recorded because the orchestration around this stage is **advisory** (only the exit-code comparison
is floor-grade): a gate that silently fails to execute produces a symmetric, innocuous-looking pair of
exit codes, and `check-regress.mjs` cannot tell "ran and failed" from "never ran" — both are just
`1`. The fail-closed helper was not the thing that caught this; reading the captured output was.

## Verdict

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.**
(`check-regress.mjs verdict` → `"no-regressions"`, exit 0.)

Honest residual (P0/P7): this catches **exactly what its suite catches, nothing more**. A regression
no deterministic check covers — a broken behavior with no test, rule, or eval — is invisible to it.
The claim is "deterministically-detectable breakage outside the feature is caught", **not** "nothing
broke", and this certifies the comparison only, never the feature.
