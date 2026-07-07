# REGRESSION — seam-config-validator

- **base:** `17ec6e4d` (working-tree dogfood → base = HEAD; `git status` non-empty)
- **verdict (floor, `check-regress.mjs verdict`):** `no-regressions` — exit 0

## Inside / outside partition (deterministic, `check-regress.mjs scope` — exit 0, no escape)

- **inside (the feature's product/tooling changes):** `.dev/floor/check-seam-config.mjs`,
  `.dev/floor/check-seam-config.test.mjs`, `pharn-contracts/seam-config.md`. All ⊆ the plan's `## Files`
  — **no fix #7 escape**. (The `.dev/features/seam-config-validator/**` audit trail is pipeline
  bookkeeping, not a build output, and is excluded from the partition — matching the established
  convention, e.g. `security-griller`.)
- **outside gates run:** `tests` (the 20 committed test suites, excluding the feature's own),
  `validate` (whole-repo), `structural:trust-fence` (the one committed eval pair).

## Per-gate base → head (exit codes)

| gate                     | base | head | result |
| ------------------------ | ---- | ---- | ------ |
| `tests`                  | 0    | 0    | OK     |
| `validate`               | 0    | 0    | OK     |
| `structural:trust-fence` | 0    | 0    | OK     |

- **regressions[]:** none.
- **pre_existing[]:** none (among the gates run).

## Style gates were correctly SKIPPED (deterministic optimization, P5/P7)

`lint` / `format:check` / `lint:md` were **not** run: the deterministic skip rule runs them only when
`inside` touches a shared style config (`eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`,
`.markdownlint-cli2.jsonc`). This feature's inside touches **none**, so over the byte-identical outside
files a style flip is provably impossible — the gates are skipped and absent from both maps.

> **Honest note for the human (not a regress finding):** the repo currently has a **pre-existing**
> `lint:md` failure (4 `MD026` trailing-punctuation errors in
> `.dev/features/comprehension-griller/REVIEW.md`, a committed file this increment did **not** touch).
> Because regress skipped style gates (above), it neither ran nor blamed `lint:md` here — correctly (it
> is not a flip caused by this feature). It **will** surface at `/pharn-dev-verify`, whose gate is
> **absolute** (all gates GREEN _now_), not a base→head comparison. Flagged so that verify FAIL is
> understood as pre-existing, not this increment's regression.

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.** Honest residual
(P0/P7): `/pharn-dev-regress` catches exactly what its suite catches — a regression no deterministic
check covers is invisible. This is the comparison's guarantee, **not** a certification that the feature
as a whole is correct.
