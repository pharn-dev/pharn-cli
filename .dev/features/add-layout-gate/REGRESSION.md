# REGRESSION — add-layout-gate

Base: **`a8e9aca`** (`feat: record capability source provenance so update preserves manual adds (#76)`).
Resolved deterministically: `git status --porcelain` was non-empty → this is a working-tree dogfood
build → `base = HEAD`, i.e. the last committed state, which is exactly the pre-build tree.

## Partition

`inside` — the build-attributable changed set, all six of which are declared in the plan's `## Files`:

```text
CHANGELOG.md
CLAUDE.md
docs/commands/add.md
docs/reference/pharn-config.md
src/commands/add.ts
tests/add.test.ts
```

`node .dev/floor/check-regress.mjs scope` over that set returned **`escaped: []`** and **exit 0** — the
build did not escape its plan's `## Files` (fix #7).

**Scoping correction, recorded rather than silently applied.** The first `scope` call used the raw
`git diff --name-only a8e9aca` + untracked set, which additionally contained
`.pharn/writes-scope.json`, `.dev/features/add-layout-gate/PLAN.md`, and
`.dev/features/add-layout-gate/GRILL.md`, and therefore exited **1** with three blocking P0 fix#7
findings. Those three are **not build outputs**: `PLAN.md` was written by `/pharn-dev-plan` and
`GRILL.md` by `/pharn-dev-grill`, each under its **own** Step-0 writes-scope, and `.pharn/**` is the
always-writable scratch every stage's setter rewrites (`enforce-writes-scope.cjs`; the stage command's
own Step-0 caveat names this). Attributing another stage's declared artifact to the build would be a
false breach, so `--changed` was narrowed to the build-attributable set and re-run. Both `scope`
invocations are reported here; nothing was dropped without saying so.

`outside` — 44 test files (the `.claude/hooks/*.test.cjs` + `.dev/floor/*.test.mjs` universe, none of
which is inside). `outside_eval_pairs` — **empty**: the one committed eval pair
(`.dev/features/trust-fence/findings.json`) has no `evals/expected/` counterpart installed in this
repo, so no `structural:*` gate exists to run.

## Gate results

| Gate       | base (`a8e9aca`) | head | flipped? |
| ---------- | ---------------- | ---- | -------- |
| `tests`    | 0                | 0    | no       |
| `validate` | 0                | 0    | no       |

`tests` = `node --test` over the 44 outside files → **666 tests, 666 pass, 0 fail** at HEAD, and exit 0
at the baseline worktree. `validate` = `node .dev/floor/validate.mjs .` → `FLOOR: GREEN — 0 capabilities
checked` (whole-repo granularity, the stage's named limit).

**Style gates (`lint` / `format:check` / `lint:md`) were SKIPPED on BOTH sides**, per the deterministic
config-touch rule: `inside` touches none of `eslint.config.mjs`, `.prettierrc`, `.prettierignore`,
`.markdownlint-cli2.jsonc`, so a style result over the byte-identical outside files cannot flip. The
gate set is therefore identical on both sides, which is what keeps the comparison conclusive rather
than `inconclusive`. (All three were separately GREEN at HEAD during `/pharn-dev-build` Step 2b/3 —
that is build evidence, not a regress gate.)

**A measurement error was caught and corrected before the verdict.** The first capture ran
`node --test $OUTSIDE` unquoted under **zsh**, which does not word-split unquoted parameter expansions
— so `node --test` received all 44 paths as one nonexistent filename and exited 1 on **both** sides.
That would have compared `1 → 1` and reported "no regressions" while having executed **zero** outside
tests. Both captures were re-run through `xargs`, and the numbers above are from those runs. Recorded
because a green verdict over a gate that silently measured nothing is precisely the failure this stage
exists to prevent.

## Verdict (FLOOR — computed by `.dev/floor/check-regress.mjs verdict`, exit 0)

```json
{ "regressions": [], "pre_existing": [], "verdict": "no-regressions" }
```

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.**

**The honest residual (P0/P7):** this catches exactly what its suite catches, nothing more. A
regression outside the feature that no deterministic check covers — a broken behavior with no test,
rule, or eval — is invisible to this stage. The claim is *"deterministically-detectable breakage
outside the feature is caught,"* **not** *"nothing broke."* The verdict certifies the comparison; it
does not certify the increment. Note also that `src/**` has no `node --test` coverage in the outside
universe (the TypeScript suite runs under vitest via `npm run check`, which `/pharn-dev-verify` gates) —
so this stage's `tests` gate speaks only to the floor helpers and hooks.
