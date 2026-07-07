# REGRESSION — init-install-capabilities

- base: `43e16b37e62333edd06ff043ca242dd56a8dfc01` (HEAD — working-tree dogfood build)
- verdict source: `.dev/floor/check-regress.mjs verdict` (deterministic; zero LLM judgment)

## Inside / outside partition

- **inside** (16 — the feature's declared `## Files`, all within scope → no fix#7 breach):
  the 9 `src/` files + 7 `tests/*.test.ts` files.
- **outside** gates run: `tests` (44 floor/hook `*.test.mjs` / `*.test.cjs`, none touched by the
  feature) + `validate` (whole-repo). Style gates **skipped** — no shared style config
  (`eslint.config.mjs` / `.prettierrc.json` / `.prettierignore` / `.markdownlint-cli2.jsonc`) is inside
  the changed scope, so a style flip over byte-identical outside files is provably impossible (P5/P7).
  No committed eval pairs exist in this repo → `outside_eval_pairs: 0`.

## Per-gate exit codes (base → head)

| gate     | base | head | flip?           |
| -------- | ---- | ---- | --------------- |
| tests    | 1    | 1    | no (pre-existing RED) |
| validate | 0    | 0    | no              |

- `regressions[]`: **none**.
- `pre_existing[]`: `tests` — the floor/hook `node --test` suite is RED at the clean baseline SHA
  (independent of this feature; RED→RED is not a flip, so it is correctly **not** a regression). This
  increment touched no `.dev/floor/*` or `.claude/hooks/*` file.

## Verdict

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.** Stage does not
fail.

Honest residual (P0/P7): `/pharn-dev-regress` catches exactly what its deterministic suite catches —
nothing more. This is "no deterministically-detectable breakage outside the feature," **not** a claim
that nothing broke. The product `vitest` suite (the feature's own spec, P1) is covered by
`/pharn-dev-build`'s GREEN `npm run check` and is re-run by `/pharn-dev-verify` next.
