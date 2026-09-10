# REGRESSION — pax-fail-closed

Base: **`80412de`** (`fix: warn about a configured proxy before update's FIRST fetch, not its second
(#171)`). This stage has now run three times — bases `558b8dd`, `a382bc3` and `80412de`, as `main`
moved underneath the branch and as `SECURITY.md` was added to the increment — returning the same
verdict each time. This file records the last of them, which is the commit that actually ships.
Resolved by the deterministic state test in Step 1: `git status --porcelain` is non-empty (a
working-tree build), so `base = HEAD`.

## Partition

**Inside (the changed scope)** — matches the plan's `## Files` exactly, `escaped: []`:

- `src/lib/tar-extract.ts`
- `tests/tar-extract.test.ts`
- `CHANGELOG.md`
- `SECURITY.md` — added to the plan's `## Files` by human direction after the first review, and the
  scope re-set from the amended plan before it was written, so fix #7 still gated the write rather
  than being worked around. The amendment and its reasoning are recorded in `PLAN.md`.

**Not passed as `inside`, and why** (stated rather than silently dropped): `.pharn/writes-scope.json`
is always-writable stage scratch declared by `enforce-writes-scope.cjs`, and
`.dev/features/pax-fail-closed/**` are the pipeline stages' own artifacts, each declared in the
`writes:` frontmatter of the command that emits it (`pharn-dev-plan`, `-grill`, `-regress`, `-verify`,
`-review`, `-ship`). Neither was written by `/pharn-dev-build`, so counting them as a build escape
would manufacture a false fix#7 breach.

**Outside gates run:** 46 committed `*.test.mjs` / `*.test.cjs` files (`.dev/floor/**`,
`.claude/hooks/**`) plus whole-repo `validate`. **0 outside eval pairs** — this repo commits none.

**Style gates skipped**, deterministically and not by preference: `inside` touches no shared style
config (`eslint.config.mjs`, `.prettierrc`, `.prettierignore`, `.markdownlint-cli2.jsonc`), so over
the outside files — byte-identical at base and head — a style result cannot flip. The skip keeps the
gate set identical on both sides, which is what `check-regress.mjs` requires.

## Per-gate exit codes

| gate       | base | head | flipped |
| ---------- | ---- | ---- | ------- |
| `tests`    | 0    | 0    | no      |
| `validate` | 0    | 0    | no      |

## Verdict (FLOOR — `check-regress.mjs verdict`, exit 0)

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.**

`regressions: []`, `pre_existing: []`.

## Residual (named, not hidden)

`/pharn-dev-regress` catches **exactly what its suite catches — nothing more.** This run compared 46
stdlib test files and `validate`; a regression outside the feature that no deterministic check covers
is invisible to it. The claim above is "deterministically-detectable breakage outside the feature is
caught", **not** "nothing broke", and it certifies the comparison only — never the feature.

One observation worth recording for the human, which is **not** a regression by this stage's
definition (it did not flip, and it is outside the compared gate set): `tests/lint-gate.test.ts`
times out under machine load in the vitest suite — seen here twice during a concurrent
`test:coverage` run, then passing 7/7 in 8.06 s standalone on a quiet machine. It shells out to
eslint, it is pre-existing, and it is unrelated to this increment, which touches only the tar reader.
