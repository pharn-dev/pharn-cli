# REGRESSION — archetype file-tree scan

**Verdict (floor — `.dev/floor/check-regress.mjs verdict`, exit 0):**
`REGRESSIONS: none — no deterministically-detectable breakage outside the feature.`

- **Base:** `509c00f` (working-tree dogfood build → `base = HEAD`; `git status` was non-empty).
- **Inside (the feature's product changes, ⊆ the plan's `## Files`):**
  `src/lib/archetype.ts`, `src/lib/detect-archetype.ts`, `src/types.ts`,
  `tests/archetype.test.ts`, `tests/detect-archetype.test.ts`.
  The changed-set is the build's **product** changes (git diff vs base + untracked), with the pipeline's
  own bookkeeping dirs (`.dev/**`, `.pharn/**`) excluded — each stage writes those under **its own**
  per-stage writes-scope; they are not part of THIS increment's build `## Files`. `scope` confirmed
  **escaped = []** (no fix #7 breach).

## Outside-scope gates (identical set at base and head)

| gate       | base | head | result |
| ---------- | ---- | ---- | ------ |
| `tests`    | 0    | 0    | OK — 663/663 floor tests (`node --test` over 44 `*.test.mjs`) pass at both |
| `validate` | 0    | 0    | OK — `.dev/floor/validate.mjs .` GREEN at both (0 markdown capabilities) |

- **`regressions[]`:** none.
- **`pre_existing[]`:** none (the baseline was fully GREEN).
- **Style gates** (`lint` / `format:check` / `lint:md`): **skipped** deterministically — `inside` touches
  no shared style config (`eslint.config.mjs`, `.prettierrc`, `.prettierignore`, `.markdownlint-cli2.jsonc`),
  so a style flip over the byte-identical outside files is provably impossible (`npm ci` cost avoided).
- **Committed eval pairs** (`structural:*`): none tracked (`evals/expected/*.json` is empty), so no
  structural gate ran.

## Notes (honest, per P0/P7)

- A first capture pass hit a Bash variable-expansion bug that made `node --test` emit filenames with a
  spurious `exit 1`. It was re-run correctly (663/663 pass, exit 0 at both base and head) **and** the
  failing-set was diffed base↔head to rule out an aggregate-exit-code masking a new failure. The report
  above is the corrected run.
- The `tests` gate is a **single aggregate** exit code over 44 files; its guarantee is "no pass→fail flip
  in the floor suite," at suite granularity. Per-file precision for THIS feature lives in the CLI's own
  vitest suite (`npm run check`, 401/401 green), which is **inside** scope (the feature changed its test
  files) and is therefore verified at `/pharn-dev-build` and `/pharn-dev-verify`, not re-compared here.

**Residual (named, not hidden):** `/pharn-dev-regress` catches exactly what its deterministic suite catches —
nothing more. "No regressions" means **no deterministically-detectable breakage outside the feature**, NOT
"nothing broke." This certifies the comparison, not the increment as a whole (P0).
