# REGRESSION — lint-gate-no-soft-tier

**Base:** `dd8af181cea7188dfa64977b76248291f4b9e85a` (`dd8af18`) — resolved by the deterministic state
test in Step 1: `git status --porcelain` is non-empty (a working-tree dogfood build), so `base = HEAD`.
Captured in a detached `git worktree` at that immutable SHA, so the baseline is reproducible and the
working tree was never disturbed.

## Partition (computed by `check-regress.mjs scope`, exit 0)

`scope` exited **0** — every changed path is inside the plan's declared `## Files`, so there is **no
fix#7 scope breach**. `inside` is 6 files, exactly the declared write set:

| inside (the feature) |
| --- |
| `CHANGELOG.md` |
| `CLAUDE.md` |
| `docs/contributing.md` |
| `eslint.config.mjs` |
| `package.json` |
| `tests/lint-gate.test.ts` |

Loop-owned artifacts (`.pharn/writes-scope.json`, `.dev/features/lint-gate-no-soft-tier/**`) were
excluded from `changed` before partitioning, as they are the loop's own outputs and not the feature.

Outside gate inputs derived by `scope`: **46 outside test files** (`*.test.mjs` / `*.test.cjs` — the
floor and hook suites), **0 outside eval pairs**.

## Gate set (identical at both ends — a mismatch would be `inconclusive`, never a silent pass)

The style-gate skip rule **did not apply**: `inside` contains `eslint.config.mjs`, a shared style
config, which is precisely the case where a style result on byte-identical outside files *can* flip. So
`lint` / `format:check` / `lint:md` were run at both ends, and the baseline worktree first obtained
devDeps via `npm ci` (the named cost, `LIMITS.md §3c` analog — incurred only on a config-touching
feature).

Note the `lint` gate's *definition* legitimately differs across the two ends — that is this feature:
`eslint src` at base, `eslint src tests scripts --max-warnings 0` at head. The comparison asked of it is
still the right one: the gate was green, and it is green now, over a strictly wider file set.

| gate | base | head | result |
| --- | --- | --- | --- |
| `tests` (46 floor/hook files) | 0 | 0 | OK |
| `validate` | 0 | 0 | OK |
| `lint` | 0 | 0 | OK |
| `format:check` | 0 | 0 | OK |
| `lint:md` | 0 | 0 | OK |

- `regressions[]`: **none**
- `pre_existing[]`: **none**

### One measurement correction, recorded rather than buried

The first baseline capture reported `tests = 1` (red). That was **an error in this stage's own
orchestration, not a repo failure**: the shell here is zsh, where an unquoted `$TESTS` does **not**
word-split, so `node --test` received all 46 paths as a single filename and exited 1 with
`Could not find '<the whole list>'`. Both ends would have recorded the same spurious `1`, and the
helper would have classified it `pre_existing` — verdict `no-regressions` for the wrong reason, with the
`tests` gate silently vacuous. Re-captured with `git ls-files … | xargs node --test`, both ends are a
genuine 0. This is the measurement-discipline trap the increment's own brief names, in a new costume:
a false RED that decays into a false GREEN.

## Verdict (FLOOR — `check-regress.mjs verdict`, exit 0)

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.**

**Honest residual (P0/P7):** `/pharn-dev-regress` catches **exactly what its suite catches — nothing
more.** The claim above is "deterministically-detectable breakage outside the feature is caught," **not**
"nothing broke." A regression no deterministic check covers is invisible here. In particular, this
repo's outside gate set is the 46 stdlib floor/hook tests plus the four repo-wide gates; the vitest
suite over `src/**` is exercised at HEAD by `/pharn-dev-build`'s floor (`npm run check`, GREEN) and by
`/pharn-dev-verify`, not by this stage's outside partition.
