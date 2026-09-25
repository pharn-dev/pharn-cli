# REGRESSION — release-0-6-0

## Base

`4de071bd0b9a0afb47533777252773ab989c4f99` (HEAD — working-tree dogfood build, base = HEAD per Step 1 rule)

## Inside / Outside Partition

**Inside** (the changed scope):
- `package.json`
- `CHANGELOG.md`
- `package-lock.json`

**Outside tests** (node --test, 46 files): all `.test.mjs` and `.test.cjs` files in `.claude/hooks/` and `.dev/floor/`.

**Outside eval pairs**: none.

**Style gates**: SKIPPED — `inside` does not touch any shared style config (`eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`, `.markdownlint-cli2.jsonc`).

## Per-gate exit codes

| gate | base | head |
| --- | --- | --- |
| `tests` | 0 | 0 |
| `validate` | 0 | 0 |

## Regressions

None.

## Pre-existing failures

None in the outside gate set. (Note: 6 vitest `.test.ts` failures exist in the working tree at both baseline and HEAD — `tests/bounded-read.test.ts` × 1 and `tests/update.test.ts` × 5, all due to `CAP_DAC_OVERRIDE` / root environment — but the vitest suite is not in the outside gates for this increment, which uses `node --test` over the `.test.mjs` / `.test.cjs` files only.)

## Deterministic verdict

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.**

Honest residual: this verdict catches exactly what the suite catches — nothing more. A regression no deterministic check covers is invisible. The claim is "deterministically-detectable breakage outside the feature is caught," not "nothing broke."
