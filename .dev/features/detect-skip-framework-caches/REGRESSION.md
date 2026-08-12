# REGRESSION — detect-skip-framework-caches

**Base:** `4d24ad4111fb4fe9a4a8f310f459f01a3f036a74` (`origin/main`, the branch's fork point).

**Base selection is orchestration, and it is advisory** — stated per this stage's two-clocks
discipline. The auto-detect rule (`git status --porcelain` non-empty → `base = HEAD`) would have
misfired here: the working tree's only dirty path was `.pharn/writes-scope.json`, which this stage's
own Step 0 setter had just written, and which the stage itself designates always-writable scratch.
Taking `base = HEAD` would have made `inside` empty and produced a vacuously green comparison. The
feature is committed (`10872cc`), so the meaningful base is the merge-base, passed explicitly. The
**verdict** below is unaffected by this choice being advisory — it is computed by
`check-regress.mjs` from the two captured exit-code maps, not by this stage.

## Partition (`check-regress.mjs scope`, exit 0 — no fix #7 escape)

**Inside (the changed scope):**

- `src/lib/detect-archetype.ts`
- `tests/detect-archetype.test.ts`
- `docs/commands/init.md`
- `CHANGELOG.md`
- `.dev/features/detect-skip-framework-caches/{PLAN,GRILL}.md` — loop-owned
- `.pharn/writes-scope.json`, `.pharn/pharn-dev-regress/*.json` — loop-owned scratch

**Declared writes** were the plan's four `## Files` paths **plus** the loop-owned patterns
`.dev/features/**` and `.pharn/**`. Naming that explicitly because it is the one place this run
widened a declared list: the loop artifacts were written by `/pharn-dev-plan`, `/pharn-dev-grill`, and this stage
— **not** by `/pharn-dev-build` — so counting them as a build escape would have been a false positive on
fix #7. `escaped: []` — every product file the build wrote is one of the four the plan declared.

**Outside:** 46 deterministic test files (`.dev/floor/*.test.mjs`, `.claude/hooks/*.test.cjs`) plus
whole-repo `validate`. `outside_eval_pairs: []` — this repo commits no eval pairs today.

**Style gates skipped** (the deterministic config-touch rule): `inside` touches none of
`eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`, `.markdownlint-cli2.jsonc`. Over
outside files — byte-identical at base and head — a style result cannot flip without shared config
changing, so the gates are provably unnecessary and are absent from **both** maps. This also avoids
the `npm ci` cost in the baseline worktree.

## Per-gate exit codes

| gate       | base | head | flipped |
| ---------- | ---- | ---- | ------- |
| `tests`    | 0    | 0    | no      |
| `validate` | 0    | 0    | no      |

Both sides ran the identical gate set in a detached `git worktree` at the base SHA (removed
afterwards; the working tree was never checked out to another ref). The floor suite reported
`tests 748 / pass 748 / fail 0` on **both** sides.

**Harness correction worth recording:** the first capture recorded `tests: 1` on *both* sides. That
was not a failing test — it was this stage's own Bash: zsh does not word-split an unquoted parameter
expansion, so `node --test $TESTS` received all 46 paths as a single filename and exited 1 with
`Could not find '…'`. Both captures were re-run through `git ls-files … | xargs node --test`. Note
the failure mode: it flipped **both** sides identically, so the deterministic comparison would still
have said `no-regressions` — a false GREEN by coincidence rather than a false RED. The floor
compared what it was given faithfully; what it was given was wrong. That is precisely the
orchestration-is-advisory boundary this stage declares, observed live.

## Verdict (floor — `check-regress.mjs verdict`, exit 0)

```json
{ "regressions": [], "pre_existing": [], "verdict": "no-regressions" }
```

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.**

Honest residual (P7): this catches **exactly what its suite catches, nothing more**. The outside
suite here is the 46 floor/hook tests plus whole-repo `validate`; a breakage outside the feature
that no deterministic check covers is invisible to it. This certifies the **comparison**, not the
feature — it is not a statement that the increment is correct or that nothing broke.
