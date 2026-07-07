# REGRESSION — ship-completion-retry (regressions OUTSIDE the feature)

- **Base:** `4268305` (working-tree dogfood build → `base = HEAD`; the increment is uncommitted, so base = the current commit and head = the working tree).
- **Verdict (FLOOR, `check-regress.mjs verdict`):** `no-regressions` (exit 0). **No deterministically-detectable breakage outside the feature.**

## Inside / outside partition (deterministic, `check-regress.mjs scope` exit 0 — no escape)

- **Inside (the build's writes = the plan's `## Files`, 6 paths):**
  `.claude/commands/pharn-ship.md`, `.claude/commands/pharn-verify.md`, `.dev/floor/check-verify.mjs`,
  `.dev/floor/check-verify.test.mjs`, `.dev/floor/check-build-complete.mjs`, `.dev/floor/check-build-complete.test.mjs`.
  `inside ⊆ declared` → **no fix#7 scope escape**.
- The feature's own pipeline artifacts (`PLAN.md`, `GRILL.md`, this `REGRESSION.md`) live under
  `.dev/features/ship-completion-retry/` and are **not** build outputs subject to `## Files` — excluded from
  the `--changed` set (advisory scoping; the verdict below is the floor part).

## Per-gate `base → head` (identical both sides)

| gate                                                                              | base | head | result |
| --------------------------------------------------------------------------------- | ---- | ---- | ------ |
| `tests` (38 outside `*.test.{mjs,cjs}`, excl. the inside `check-verify.test.mjs`) | 0    | 0    | OK     |
| `validate` (`validate.mjs .`, whole-repo)                                         | 0    | 0    | OK     |
| `structural:…/expected-injection-comment.json` (trust-fence eval pair)            | 0    | 0    | OK     |

- **`regressions[]`:** none. **`pre_existing[]`:** none.
- **Style gates (`lint` / `format:check` / `lint:md`) were SKIPPED** by the deterministic config-touch rule
  (the increment changes no shared style config — `eslint.config.mjs` / `.prettierrc*` / markdownlint), so a
  style flip over the byte-identical outside files is provably impossible. (Style was still confirmed GREEN at
  head by the build stage's `npm run check`.)

## Honest residual (P0/P7)

`/pharn-dev-regress` catches **exactly what its deterministic suite catches — nothing more.** `no-regressions`
means no gate that was GREEN at the base flipped RED outside the feature — **not** "nothing broke." A
regression no test / rule / eval covers is invisible here. This certifies the **comparison**, not the feature.
