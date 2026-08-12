# REGRESSION — trust-map-records-era

**Base:** `3645fdf41f0f98b75615da4735125005a878545d` (`main`, PR #92).
**Base resolution:** `git status --porcelain` non-empty → working-tree dogfood build → `base = HEAD`.

## Partition

**Inside (the changed scope)** — 4 product files + 4 loop artifacts:

```
CHANGELOG.md
LIMITS.md
THREAT-MODEL.md
docs/reference/pharn-records.md
.dev/features/trust-map-records-era/{PLAN,GRILL,SHIP}.md
.dev/features/trust-map-records-era/regression-report.json
```

**Outside:** 46 deterministic test files (`.dev/floor/*.test.mjs`, `.claude/hooks/*.test.cjs`),
0 committed eval pairs.

**Scope check:** `check-regress.mjs scope` → exit **0**, `escaped: []`.

> **First run exited 1.** The plan's `## Files` declared only the 4 product files, so the loop's own
> `PLAN.md` / `GRILL.md` / `SHIP.md` — each written under its **own** stage's declared scope — were
> reported as escaping the build's scope. The helper compares every changed path against the **plan's**
> list and has no concept of a loop-owned artifact written by a different stage. Resolved by
> **declaring** them in `## Files` (human decision at the halt), not by suppressing the check.

## Gate set

Identical at base and head. **Style gates skipped** by the deterministic config-touch rule: `inside`
touches no shared style config (`eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`,
`.markdownlint-cli2.jsonc`), so a style flip over byte-identical outside files is provably impossible.

| Gate | base | head | flip |
| --- | --- | --- | --- |
| `tests` (46 outside files, `node --test`) | 1 | 1 | none — RED on both sides |
| `validate` (`node .dev/floor/validate.mjs .`, whole-repo) | 0 | 0 | none |

## Result

- `regressions[]`: **none**
- `pre_existing[]`: **`tests`** — the outside test gate was **already RED at the baseline**, before this
  increment existed. It is therefore **not** a regression, and this stage does **not** claim it is fine;
  it claims only that this increment did not cause it. Worth a separate look.

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.**
(`check-regress.mjs verdict` → `"no-regressions"`, exit 0.)

---

**Honest residual (P0/P7):** `/pharn-dev-regress` catches exactly what its suite catches — nothing more. A
regression no deterministic check covers is invisible to it. This is a docs-only increment touching
zero executable code, so the comparison is close to vacuous by construction: it confirms nothing
outside flipped, not that the prose is true. Prose correctness rests on the anchor table
(`PLAN.md` D8) and human review, both explicitly advisory.
