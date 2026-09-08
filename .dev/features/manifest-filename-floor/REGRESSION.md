# REGRESSION — manifest-filename-floor

- base: `2b1201895d36b70a2b44282d4dbaf2301b157e0d` (working tree dirty → `base = HEAD`, per the
  deterministic base rule; `git status --porcelain` was non-empty). It is also
  `git merge-base HEAD origin/main`, so the two rules agree here.
- machine report: `.dev/features/manifest-filename-floor/regression-report.json`

## The exact partition

The full change set given to the scope helper — `git diff --name-only HEAD` plus
`git ls-files --others --exclude-standard` (minus the gitignored `prompts/`) — was six paths:

| path                                                | changed by                  |
| --------------------------------------------------- | --------------------------- |
| `src/lib/install-manifest.ts`                        | `/pharn-dev-build`          |
| `tests/install-manifest.test.ts`                     | `/pharn-dev-build`          |
| `tests/update.test.ts`                               | `/pharn-dev-build`          |
| `.pharn/writes-scope.json`                           | every stage's Step 0 setter |
| `.dev/features/manifest-filename-floor/PLAN.md`      | `/pharn-dev-plan`           |
| `.dev/features/manifest-filename-floor/GRILL.md`     | `/pharn-dev-grill`          |

The **build-only** subset — the first three rows — is byte-identical to the plan's `## Files`. The
verdict below was computed with exactly that subset as `--inside`.

## The fix #7 scope check — raw result, and why it is not a build escape

Given the FULL working-tree diff, `check-regress.mjs scope` exited **1** with three blocking P0
findings: `.pharn/writes-scope.json` (the hook's own always-writable scratch state),
`.dev/features/manifest-filename-floor/PLAN.md` (`/pharn-dev-plan`'s declared `writes:`) and
`GRILL.md` (`/pharn-dev-grill`'s). None is a write `/pharn-dev-build` made. This is the known
structural interaction between `base = HEAD` and the loop writing its own artifacts into the tree —
the same one recorded for `records-key-segment-rule`. Re-run over the three PRODUCT files only, the
helper exited **0** with `escaped: []`. Both runs are recorded here; the first is not hidden.

## Gate set and results

Style gates (`lint` / `format:check` / `lint:md`) were **skipped by the deterministic config-touch
rule** — `inside` touches no shared style config (`eslint.config.mjs`, `.prettierrc.json`,
`.prettierignore`, `.markdownlint-cli2.jsonc`), so an outside-file style result provably cannot flip.
The same gate-ids ran on both sides.

| gate       | command                                             | base | head |
| ---------- | --------------------------------------------------- | ---- | ---- |
| `tests`    | `node --test <46 outside *.test.mjs / *.test.cjs>`   | 0    | 0    |
| `validate` | `node .dev/floor/validate.mjs .`                     | 0    | 0    |

`outside_tests` is the 46-file stdlib suite the scope helper returned (every `*.test.mjs` /
`*.test.cjs` under `.claude/hooks/` and `.dev/floor/`); no committed eval pair is outside this
feature, so `outside_eval_pairs` is empty.

**A measurement error worth recording (P6).** The first capture attempt read `tests: 1` on BOTH
sides. That was not a gate result: the session shell is **zsh**, which does not word-split an
unquoted `$TESTS`, so `node --test` received all 46 paths as ONE argument and answered
`Could not find '<...>'` — identically at base and head. Because the flip test compares base to head,
the bug would have produced a *correct* `no-regressions` verdict from a *meaningless* measurement.
It was caught by reading the failure rather than the verdict, and re-run under `setopt SH_WORD_SPLIT`;
the table above is that second, real capture.

## Verdict (FLOOR — `check-regress.mjs`, exit 0)

```json
{ "regressions": [], "pre_existing": [], "verdict": "no-regressions" }
```

No outside gate flipped pass→fail. The verdict is the helper's exit-code comparison, not a judgment
about whether the increment is good.
