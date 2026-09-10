# REGRESSION — `fold-changelog-unreleased`

**Base:** `5fd0714690147fc4927fa268084bfb073613c3f9` (`git merge-base HEAD origin/main` — the pre-build
baseline; the build is committed at `316f32b`, so the base was passed explicitly rather than taken
from the working-tree heuristic).

## Partition

`scope` (`.dev/floor/check-regress.mjs scope`) exited **0** — `escaped: []`, so every changed path is
covered by a declared writes-scope and the build did not escape its plan's `## Files` (fix #7).

| side | paths |
| --- | --- |
| inside (build) | `CHANGELOG.md`, `.markdownlint-cli2.jsonc` — exactly the plan's `## Files` |
| inside (pipeline artifacts) | `.dev/features/fold-changelog-unreleased/PLAN.md`, `…/GRILL.md` — written by `/pharn-dev-plan` and `/pharn-dev-grill` under **their own** `writes:` scopes, declared as such to `scope` rather than attributed to the build |
| outside | 46 `*.test.mjs` / `*.test.cjs` files; 0 committed eval pairs |

There are **no** committed eval pairs in this repo (no `*/evals/expected/*.json`), consistent with
`validate` reporting `0 capabilities checked` — so `outside_eval_pairs` is empty and no
`structural:*` gate exists to run.

## Style gates: RUN, not skipped

The skip rule runs `lint` / `format:check` / `lint:md` **only if** `inside` touches a shared style
config. It does — **`.markdownlint-cli2.jsonc` is the file this increment edits** — so all three ran
at both sides. This is precisely the case the rule exists for: over the outside files (byte-identical
at base and head) a style result can flip *only* when shared config changed, and here it changed.

The baseline worktree therefore needed devDeps. Rather than `npm ci`, `node_modules` was APFS-cloned
(`cp -Rc`) from the project checkout — **equivalent here and verified, not assumed**:
`git diff --name-only <base> HEAD -- package.json package-lock.json` is **empty**, so base and head
resolve to the same dependency tree. Noted as a deviation from the literal instruction.

## Per-gate exit codes (identical gate set both sides)

| gate | base | head | flip |
| --- | --- | --- | --- |
| `tests` (46 files, `node --test`) | 0 | 0 | — |
| `validate` (`.dev/floor/validate.mjs .`) | 0 | 0 | — |
| `lint` (eslint, `--max-warnings 0`) | 0 | 0 | — |
| `format:check` (prettier) | 0 | 0 | — |
| `lint:md` (markdownlint-cli2) | 0 | 0 | — |

`regressions[]`: **empty**. `pre_existing[]`: **empty**.

Worth stating because it is the one gate whose *meaning* changed: `lint:md` is 0 on both sides, but
it is not measuring the same thing on both sides. At base it linted **23** files with `CHANGELOG.md`
excluded; at head it lints **24** with the changelog in scope. The exit code did not flip — the gate
got **wider** while staying green, which is the whole point of the increment. A widened gate is not a
regression, and `check-regress` correctly does not treat it as one.

## Verdict (FLOOR — `.dev/floor/check-regress.mjs verdict`, exit 0)

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.**

`regression-report.json` carries the helper's JSON verbatim (`.verdict = "no-regressions"`).

**Honest residual (P0/P7):** this catches **exactly what its suite catches — nothing more.** A
regression no deterministic check covers is invisible to it. The claim is "deterministically-detectable
breakage outside the feature is caught", **not** "nothing broke". In particular, nothing in this repo
asserts the *content* of `CHANGELOG.md`, so no gate here could have caught a prose loss during the
fold — that property is carried by the increment's own Phase A / Phase B conservation checks, not by
this stage.

This certifies the **comparison**, not the feature.
