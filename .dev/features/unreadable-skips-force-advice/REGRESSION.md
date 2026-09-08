# REGRESSION — unreadable-skips-force-advice

- base: `19eb3457296584913d220b549df70b0c57d558fb` (working tree is dirty → base = HEAD, the
  dogfood-build state test in Step 1)
- inside (the changed scope): `src/commands/update.ts`, `tests/update.test.ts`
- outside gates run: 46 stdlib `node --test` files + whole-repo `validate`
- style gates: **skipped** — `inside` touches no shared style config
  (`eslint.config.mjs` / `.prettierrc` / `.prettierignore` / `.markdownlint-cli2.jsonc`), so a style
  flip over byte-identical outside files is provably impossible. Absent from **both** maps.

## Per-gate exit codes

| gate       | base | head | verdict     |
| ---------- | ---- | ---- | ----------- |
| `tests`    | 0    | 0    | no flip     |
| `validate` | 0    | 0    | no flip     |

`regressions[]`: none. `pre_existing[]`: none.

## Two orchestration decisions, recorded (advisory — the verdict is not)

1. **The first `scope` call exited 1** on three paths: `.pharn/writes-scope.json`,
   `.dev/features/unreadable-skips-force-advice/PLAN.md`, and `.../GRILL.md`. None is a fix #7 breach:
   `.pharn/**` is `ALWAYS`-writable in `.claude/hooks/enforce-writes-scope.cjs`, `PLAN.md` is in
   `pharn-dev-plan.md`'s own `writes:`, and `GRILL.md` is in `pharn-dev-grill.md`'s. They were written
   by *other* stages under *their* floor-enforced scopes, so comparing them against the **build**
   stage's `## Files` is the wrong comparison set. `scope` was re-run over the build stage's actual
   writes and exited **0** with `escaped: []`. The code/test partition is identical either way.
2. **The first capture of the `tests` gate was vacuous and was thrown away.** The shell is zsh, which
   does not word-split an unquoted expansion, so `node --test $TESTS` received all 46 paths as one
   bogus argument and exited 1 at *both* sides. That would have been reported as a matching
   `pre_existing` red — a self-consistent lie. Both sides were re-captured with `xargs node --test`
   (748 assertions, exit 0) and the verdict above is computed from those real runs.

REGRESSIONS: none — no deterministically-detectable breakage outside the feature.

Residual, named (P7): `/pharn-dev-regress` catches exactly what its suite catches. A regression no
deterministic check covers is invisible to it. This is not a statement that nothing broke.
