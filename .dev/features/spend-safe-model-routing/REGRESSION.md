# REGRESSION — spend-safe-model-routing

- **Base:** `8b5a87c` (= `844bc92^`, the commit immediately before this increment). The increment was
  auto-committed as `844bc92` ("feat: spend-safe review default and surface model routing") — exactly
  the 8 product files + pipeline artifacts — so the working-tree auto-detect (`base = HEAD`) would have
  compared the increment against itself. Base was set to the pre-increment parent instead (advisory
  orchestration; the verdict below stays floor).
- **HEAD:** `844bc92` (this increment).

## Inside / outside partition (deterministic — `check-regress.mjs scope`)

- **Inside (changed, 8):** `CHANGELOG.md`, `docs/reference/pharn-config.md`, `src/commands/status.ts`,
  `src/lib/model-routing.ts`, `src/steps/install-archetype.ts`, `tests/init-archetype.test.ts`,
  `tests/model-routing.test.ts`, `tests/status.test.ts`. All ⊆ the plan's declared `## Files` → **no
  scope breach** (`scope` exit 0).
- **Outside tests:** 44 floor/hook `*.test.mjs` + `*.test.cjs` (the increment changed **zero** of them).
- **Outside eval pairs:** none in this repo (no committed `trust-fence` expected↔actual pair).
- **Style gates (`lint` / `format:check` / `lint:md`):** **skipped** deterministically — the inside set
  touches no shared style config (`eslint.config.mjs`, `.prettierrc`, `.prettierignore`,
  `.markdownlint-cli2.jsonc`), so an outside style flip is provably impossible.

## Per-gate exit codes (base → head)

| Gate       | base (`8b5a87c`) | head (`844bc92`) | flip?         |
| ---------- | ---------------- | ---------------- | ------------- |
| `tests`    | 1                | 1                | no (1 → 1)    |
| `validate` | 0                | 0                | no (0 → 0)    |

Both sides were captured in **fresh `git worktree` checkouts**, so the gitignored `test-*/` local
install trees (intentional red negative fixtures) are absent on **both** — matching what CI sees on a
clean checkout. That is why `validate` reads GREEN→GREEN here even though `validate.mjs .` exits 1 in
the dirty local working tree; holding `test-*/` constant is the honest comparison. The `tests` gate is
**pre-existing** RED (1 at base, before this increment) — the fresh worktree has no `node_modules`, so
some floor/hook tests can't resolve deps; it is identical at head (the increment touched no `.mjs`/
`.cjs`), so it is **not** a regression.

## Verdict (FLOOR — `check-regress.mjs verdict`, exit 0)

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.** `regressions: []`;
`pre_existing: ["tests"]`.

Honest residual (P7): `/pharn-dev-regress` catches exactly what its deterministic suite catches — nothing
more. A behavior with no floor test/rule/eval that broke outside the feature would be invisible. The
claim is "deterministically-detectable breakage outside the feature is caught," not "nothing broke."
This certifies only the comparison, never that the increment is whole.
