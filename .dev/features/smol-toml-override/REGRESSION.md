# REGRESSION — smol-toml-override

- base: `a289d27b2785f1766aa4ae8805686854693c9683` (`git status --porcelain` non-empty → a
  working-tree dogfood build → `base = HEAD`, per the deterministic state test)
- verdict source: `.dev/floor/check-regress.mjs verdict` → exit **0**
- machine report: [`regression-report.json`](regression-report.json)

## Partition (inside / outside)

`check-regress.mjs scope` → exit **0**, `escaped: []` — no changed path fell outside the declared
writes-scope (fix #7).

**Inside (9):** `package.json`, `package-lock.json`, `tests/dependency-overrides.test.ts`,
`CHANGELOG.md` — the plan's four `## Files` — plus the pipeline's own artifacts
(`.dev/features/smol-toml-override/{PLAN,GRILL}.md`) and always-writable scratch
(`.pharn/writes-scope.json`, `.pharn/pharn-dev-regress/*.json`).

The two exempt classes were **declared explicitly**, not filtered out of `--changed` before the check
saw them: `.pharn/**` is `ALWAYS`-writable in the enforcement hook itself
(`.claude/hooks/enforce-writes-scope.cjs:61`), and each `.dev/features/<name>/*` artifact is written
under its own stage's writes-scope, not `/pharn-dev-build`'s. Every changed path was passed to `scope`;
nothing was hidden from the fix #7 cross-check.

**Outside:** 46 `*.test.mjs` / `*.test.cjs` files (748 assertions), 0 committed eval pairs.

## Per-gate exit codes

| gate           | base | head | result |
| -------------- | ---- | ---- | ------ |
| `tests`        | 0    | 0    | held   |
| `validate`     | 0    | 0    | held   |
| `lint`         | 0    | 0    | held   |
| `format:check` | 0    | 0    | held   |
| `lint:md`      | 0    | 0    | held   |

- `regressions[]`: **none**
- `pre_existing[]`: **none**

## Two orchestration facts, recorded because they change how much this run is worth

**1. The style gates were run although the skip rule said skip — a deliberate widening.** The rule
runs `lint` / `format:check` / `lint:md` only if `inside` touches a shared style config; none of the
four was touched. But its stated rationale is that a style flip over byte-identical outside files is
*provably impossible* unless shared config changed — and that premise **does not hold for a lockfile
change**. `npm run lint:md` executes `markdownlint-cli2`, which imports `parsers/toml-parse.mjs`
eagerly, which imports `smol-toml` — the very package this increment moves. Skipping would have
blinded the run to this increment's single most relevant regression risk. The baseline worktree ran
`npm ci` and resolved **`smol-toml@1.7.0`**; the head tree carries **`1.7.2`**. So the `lint:md` row
above is a genuine A/B across the version change, not a formality. The deviation only **widens**
coverage and was applied identically to both sides, so it cannot manufacture a false green.

**2. The first `tests` capture was hollow, and is not what the table reports.** The initial run passed
all 46 paths to `node --test` as a **single argument** (this shell is zsh, which does not word-split
an unquoted parameter expansion), producing `Could not find '<all 46 paths>'` and exit **1** at *both*
ends. The exit-code comparison was unaffected — identical on both sides, so no regression could have
been masked — but the gate measured **nothing**. It was re-captured through `xargs`, and the table
above reports the corrected run: **748 tests, 0 fail, exit 0 at base and at head**. Recorded rather
than quietly overwritten, because "a gate that is green while checking nothing" is precisely the
failure this pipeline exists to catch.

## Verdict

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.**

This certifies **the comparison only** (P0). `/pharn-dev-regress` catches exactly what its suite catches
and nothing more: a breakage no deterministic check covers is invisible to it. "No regressions" is
**not** a statement that the increment is correct, and not a statement that nothing broke — only that
every gate green at `a289d27` is still green at HEAD.
