# REGRESSION — config-loader-honest-errors

- **Base (pre-feature):** `cb27fbb` (the commit before the feature landed as `bd8e861` + `d313461`).
  Auto-detect would have picked `HEAD` (dirty tree), but the feature is COMMITTED, so `--base cb27fbb`
  is the honest pre-feature state — otherwise the whole feature would be invisible to the comparison.
- **Verdict (deterministic, `check-regress.mjs`):** `no-regressions` — exit 0.

## Partition

- **inside** (23 files, = the plan's `## Files`; `scope` reported `escaped: []` → the build never wrote
  outside its declared scope): `src/lib/{pharn-config,model-routing,seam-config}.ts`,
  `src/commands/{add,status,update,remove,list,init}.ts`, `src/steps/install.ts`,
  `pharn-contracts/seam-config.md`, `.dev/floor/check-seam-config.mjs` (+ its test),
  `docs/troubleshooting.md`, `CHANGELOG.md`, and the 8 `tests/*.test.ts`.
- **outside:** 43 deterministic floor tests (`.dev/floor/*.test.mjs`, `.claude/hooks/*.test.cjs`) +
  whole-repo `validate.mjs`. No committed eval pairs. Style gates SKIPPED (inside touched no shared
  style config — deterministic P5 skip: an outside style flip is then provably impossible).

## Per-gate exit codes (base → head)

| gate     | base (`cb27fbb`) | head | result |
| -------- | ---------------- | ---- | ------ |
| tests    | 0 (650 pass)     | 0 (650 pass) | OK |
| validate | 0                | 0    | OK |

- `regressions[]`: none (no gate flipped pass→fail).
- `pre_existing[]`: none (no gate was already red at baseline).

## Verdict

REGRESSIONS: none — no deterministically-detectable breakage outside the feature.

**Honest residual (P0/P7):** `/pharn-dev-regress` catches exactly what its suite catches — nothing more. This
verdict means no OUTSIDE deterministic gate flipped pass→fail; it is **not** a claim that "nothing
broke." A regression no test/rule/eval covers is invisible here. The feature's own correctness is the
job of `/pharn-dev-verify` (floor gates) and `/pharn-dev-review` (advisory), not this comparison.
