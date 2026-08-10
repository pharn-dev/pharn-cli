# REGRESSION — pin-floor-actions

- **base:** `112e22616993bf219fc251a4f0c5d008ea017cb2` (= `origin/main`; resolved by the deterministic state test — `git status --porcelain` non-empty → working-tree dogfood build → `base = HEAD`)
- **machine report:** `.dev/features/pin-floor-actions/regression-report.json` (the helper's `verdict` JSON verbatim)

## Partition (inside / outside)

`inside` — the build-attributable changed set, identical to the plan's `## Files`:

- `.github/workflows/ci.yml`
- `.github/workflows/floor.yml`
- `.github/workflows/publish.yml`

`node .dev/floor/check-regress.mjs scope` → **exit 0**, `escaped: []`. No fix #7 breach: the build wrote exactly its declared `## Files` and nothing else.

**Attribution, stated openly (this was a judgment call in the ADVISORY orchestration layer, not the floor).** The working tree also carries three loop-owned paths — `.pharn/writes-scope.json`, `.dev/features/pin-floor-actions/PLAN.md`, `.dev/features/pin-floor-actions/GRILL.md`. Run with the *full* changed list, `scope` reports all three as `escaped`. They are **not** build writes, and the floor says so independently of any judgment of mine:

- `.pharn/**` is in `ALWAYS` in `.claude/hooks/enforce-writes-scope.cjs:61` — always-writable scratch by construction, never an escape (the regress command's own Step 0 names this).
- `PLAN.md` / `GRILL.md` were each written by their own stage under **that stage's** floor-enforced scope (`--target` pinned to the single artifact), not under the build's.

The decisive point is that `enforce-writes-scope.cjs` was **live during the build** with `scope[]` pinned to exactly the three workflow paths — so a build write outside them would have been *denied at write time*, not merely reported here. Both `scope` runs are recorded so the attribution is visible rather than assumed.

`outside_tests`: 44 files (every committed `*.test.mjs` / `*.test.cjs`). `outside_eval_pairs`: none — the repo has no `*/evals/expected/*.json`.

## Gate table (base → head, exit codes)

| gate | base | head | flip |
| --- | --- | --- | --- |
| `tests` (`node --test`, 44 outside test files — 666 assertions) | 0 | 0 | none |
| `validate` (`node .dev/floor/validate.mjs .`, whole-repo) | 0 | 0 | none |

`regressions[]`: **empty.** `pre_existing[]`: **empty.**

**Style gates skipped — deterministically, not by choice.** `inside` touches none of `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`, `.markdownlint-cli2.jsonc`, so over the byte-identical outside files a style flip is provably impossible. Skipped on both sides, absent from both maps (a gate-set mismatch would have failed `inconclusive`).

## Orchestration correction (recorded, not hidden)

The first baseline/HEAD capture returned `tests=1` on **both** sides. That was **my invocation bug, not the repo's**: zsh does not word-split unquoted variables, so all 44 paths reached `node --test` as a single argument (`Could not find '<44 paths concatenated>'`). A gate that never ran is not a gate, so the measurement was discarded and both sides re-captured with explicit splitting (`${=…}`) — yielding `tests=0` / 666 passing on both. Note this failure mode was **symmetric and would have produced a `no-regressions` verdict anyway**; it is recorded because a verdict computed over a gate that never executed would have been worthless despite being green. This is squarely the advisory-orchestration clock: the *comparison* is floor-grade, but *whether the right thing was compared* rests on me.

## Verdict

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.**

`node .dev/floor/check-regress.mjs verdict` → **exit 0**, `"verdict": "no-regressions"`. This is the floor's comparison of captured exit codes; no model judged it, and a flipped gate would have been a regression whether or not it "looked" like one.

**The honest residual (P7):** `/pharn-dev-regress` catches exactly what its suite catches — nothing more. This suite is 44 `node --test` files plus whole-repo `validate`; **none of them reads `.github/workflows/**`** (verified by grep at plan time). So for *this* increment the comparison is close to vacuous: it proves the change broke no existing gate, which is meaningful only because the change also touches nothing those gates cover. The claim is "deterministically-detectable breakage outside the feature is caught," **not** "nothing broke." The evidence that the edited workflows themselves are sound is the PR's own floor run — a different check, owed at Phase C, not this one.
