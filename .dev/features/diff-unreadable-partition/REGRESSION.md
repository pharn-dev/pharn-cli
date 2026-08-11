# REGRESSION — diff-unreadable-partition

**Base:** `8ff7240` (working-tree dogfood build — `git status --porcelain` non-empty, so the base is
`HEAD` per the stage's deterministic base rule; the baseline is the committed tree, HEAD is the working
tree with the increment applied).

## Inside / outside partition

**Inside (the changed scope) — 6 files, exactly the plan's `## Files`:**

`src/lib/diff.ts`, `src/commands/status.ts`, `tests/diff.test.ts`, `tests/status.test.ts`,
`docs/commands/status.md`, `CHANGELOG.md`.

`node .dev/floor/check-regress.mjs scope` over that set → **exit 0**, `escaped: []`, `findings: 0`,
`outside_tests: 46`, `outside_eval_pairs: 0`.

### Five paths excluded from `--changed`, each justified against live state (orchestration is ADVISORY)

A first `scope` run passed the raw `git diff --name-only HEAD` + untracked list and exited **1** with
five blocking fix#7 findings. Choosing `--changed` is **orchestration — advisory**, so that run is
recorded here rather than hidden, along with the deterministic reason each path is not a build escape:

| path | why it is not a build escape | how that was verified this run |
| --- | --- | --- |
| `package.json` | Pre-existing staged change (version bump + `globals` devDep), acknowledged at GATE 1 and deliberately left in place | `git diff --cached --name-only` lists it; `git diff --name-only -- package.json` is **empty** → the build wrote nothing to it |
| `package-lock.json` | Same | Same — staged only, zero unstaged diff |
| `.pharn/writes-scope.json` | Process scratch, rewritten by **every** stage's own Step 0 setter | `ALWAYS = [".pharn/**"]` in `.claude/hooks/enforce-writes-scope.cjs:61` |
| `.dev/features/diff-unreadable-partition/PLAN.md` | Written by `/pharn-dev-plan` under **its** writes-scope, not the build's | The plan stage's setter run is in this session's record |
| `.dev/features/diff-unreadable-partition/GRILL.md` | Written by `/pharn-dev-grill` under **its** writes-scope | Same |

No path the **build** wrote is outside the plan's `## Files`. The fix#7 guarantee is intact.

## Gate set

`tests` + `validate`. **Style gates skipped** by the stage's deterministic config-touch rule: none of
`eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`, `.markdownlint-cli2.jsonc` is in `inside`
(each checked, 0 changed), so a style flip over byte-identical outside files is provably impossible and
the baseline `npm ci` cost is not incurred.

## Per-gate exit codes

| gate | base (`8ff7240`) | head | flipped? |
| --- | --- | --- | --- |
| `tests` (46 outside `*.test.mjs` / `*.test.cjs`, stdlib `node --test`) | 0 | 0 | no |
| `validate` (`.dev/floor/validate.mjs .`, whole-repo) | 0 | 0 | no |

The outside suite ran **748 tests, 748 pass, 0 fail** at base and again at head.

### A capture error caught and corrected (recorded, not buried)

The first capture recorded `tests=1` at **both** sides, which `check-regress.mjs` correctly read as
`pre_existing` rather than a regression. That RED was **not a failing test**: the shell is `zsh`, which
does not word-split unquoted parameter expansions, so all 46 paths reached `node --test` as a single
filename and it exited 1 with `Could not find '<the whole list>'`. Re-captured via `xargs`, both sides
run clean. The verdict below is computed from the corrected maps; the stale ones were overwritten, not
merged. Worth stating plainly: a gate that never ran is not a gate that passed, and the identical-RED
symmetry would have let it slide through as "pre-existing" unexamined.

## Regressions / pre-existing

- `regressions[]`: **none**
- `pre_existing[]`: **none**

## Verdict (FLOOR — `.dev/floor/check-regress.mjs verdict`, exit 0)

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.**

**The honest residual (P7):** this catches **exactly what its suite catches, nothing more**. The claim
is "deterministically-detectable breakage outside the feature is caught", **not** "nothing broke". A
regression no deterministic check covers is invisible to this stage. And `validate` is whole-repo, so
its granularity is the repo, not the file.
