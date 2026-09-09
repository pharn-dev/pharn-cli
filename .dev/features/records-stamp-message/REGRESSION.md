# REGRESSION — records-stamp-message

- base: `558b8dd8082e28f9d9b2e85eae0a1d5e95a8c868` (working tree is dirty → base = HEAD, the
  dogfood-build state test in Step 1)
- inside (the changed scope): `CHANGELOG.md`, `src/lib/install-records.ts`,
  `tests/install-records.test.ts`
- outside gates run: 46 stdlib test files (`.claude/hooks/*.test.cjs` + `.dev/floor/*.test.mjs`,
  748 assertions) + whole-repo `validate`
- outside eval pairs: none (`outside_eval_pairs: []` — no committed expected↔actual pair sits
  outside this feature)
- style gates: **skipped** — `inside` touches no shared style config (`eslint.config.mjs` /
  `.prettierrc` / `.prettierignore` / `.markdownlint-cli2.jsonc`), so a style flip over
  byte-identical outside files is provably impossible. Absent from **both** maps.

## Per-gate exit codes

| gate       | base | head | verdict |
| ---------- | ---- | ---- | ------- |
| `tests`    | 0    | 0    | no flip |
| `validate` | 0    | 0    | no flip |

`regressions[]`: none. `pre_existing[]`: none.

## Two orchestration decisions, recorded (advisory — the verdict is not)

1. **The first `scope` call exited 1** on three paths: `.pharn/writes-scope.json`,
   `.dev/features/records-stamp-message/PLAN.md`, and `.../GRILL.md`. None is a fix #7 breach —
   `.pharn/**` is `ALWAYS`-writable scratch in `.claude/hooks/enforce-writes-scope.cjs`, `PLAN.md`
   is in `pharn-dev-plan.md`'s own `writes:`, and `GRILL.md` is in `pharn-dev-grill.md`'s. Each was
   written by a *different* stage under *its* floor-enforced scope, so comparing them against the
   **build** stage's `## Files` is the wrong comparison set. `scope` was re-run over the build
   stage's actual writes and exited **0** with `escaped: []`. The inside/outside partition is
   identical either way. (Same call and same resolution as the `unreadable-skips-force-advice` run
   — this is now the third recurrence of a known orchestration wrinkle, not a new finding.)
2. **The test gate is invoked with node's own glob patterns, not a shell-expanded list.**
   `node --test .claude/hooks .dev/floor` treats each directory as a *test file* on node v24.13.1
   and exits 1 with `MODULE_NOT_FOUND` at **both** sides — a self-consistent lie that would have
   been reported as a matching `pre_existing` red. Both sides were captured with
   `node --test '.claude/hooks/*.test.cjs' '.dev/floor/*.test.mjs'`, which reports **748 passing
   assertions** at base and 748 at head. The counts are recorded here precisely so a future vacuous
   run is visible rather than silently green.

The gate set is identical on both sides (`tests`, `validate`), which is what keeps the comparison
valid rather than `inconclusive`.

REGRESSIONS: none — no deterministically-detectable breakage outside the feature.

Residual, named (P7): `/pharn-dev-regress` catches exactly what its suite catches. A regression no
deterministic check covers is invisible to it. This is not a statement that nothing broke — and note
that the vitest suite (`npm run check`, 1127 tests) is the **build** stage's floor, not this stage's:
this stage compares the stdlib gates that can run in a dependency-free baseline worktree.
