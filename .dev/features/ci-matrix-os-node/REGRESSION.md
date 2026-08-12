# REGRESSION — ci-matrix-os-node (M7)

**Base:** `21db522c0fe23c30c53510b954cccd4e34662e83` (`git merge-base HEAD origin/main` — the branch's fork point).

**Base resolution — an advisory orchestration call, named rather than silent.** `git status --porcelain` was non-empty, whose literal reading is "a working-tree dogfood build → `base = HEAD`". The only dirty entry was `.pharn/writes-scope.json` — this stage's **own** Step 0 side-effect, which the command itself declares always-writable scratch. Taking `base = HEAD` would have compared HEAD to itself and produced a vacuous verdict over an empty `inside`. The feature is committed on a branch, so the merge-base is the real pre-build baseline. Recorded because the verdict is floor-grade only *given* this choice, and the choice was mine.

## Partition

`scope` exited **0** — every changed path is inside the plan's declared `## Files`, so there is **no fix#7 scope breach**. `inside` is 6 files, exactly the declared write set:

| inside (the feature) |
| --- |
| `.dev/floor/check-soft-tier.mjs` |
| `.dev/floor/check-soft-tier.test.mjs` |
| `.gitattributes` |
| `.github/workflows/ci.yml` |
| `CHANGELOG.md` |
| `src/lib/apply-update.ts` |

Loop-owned artifacts (`.pharn/writes-scope.json`, `.dev/features/ci-matrix-os-node/**`) were excluded from `--changed`, following the convention the previous increment records (`.dev/features/lint-gate-no-soft-tier/REGRESSION.md:22`).

`outside_tests` = **46** test files (the whole `*.test.mjs` / `*.test.cjs` universe minus this feature's own `check-soft-tier.test.mjs`). `outside_eval_pairs` = **none**: no `<cap>/evals/expected/*.json` exists in this repo today (the single `evals/expected` hit is a `.md` under `.dev/floor/test-fixtures/`), which is why no `structural:*` gate appears — matching the previous increment's report, which likewise carried none.

## Gates

| gate | base | head | |
| --- | --- | --- | --- |
| `tests` (46 files, 748 tests) | 0 | 0 | OK |
| `validate` | 0 | 0 | OK |
| `format:check` | 0 | 0 | OK |
| `lint` | 0 | 0 | OK |
| `lint:md` | 0 | 0 | OK |

**The style gates were RUN, not skipped — deliberately, and it exposes a gap in the skip rule.** The rule skips `lint`/`format:check`/`lint:md` unless `inside` touches a shared style config, enumerated as `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`, `.markdownlint-cli2.jsonc`. This increment adds **`.gitattributes`**, which is *precisely* a file that changes the bytes on disk that style gates read — and it is not in that list. The alternative to running them was a platform-dependent argument that no flip is possible on macOS; running them costs one `npm ci` in the baseline worktree and needs no argument at all. **Reported, not fixed:** `.gitattributes` belongs in that enumeration, in `.claude/commands/pharn-dev-regress.md` — outside this increment's whitelist, so it is the human's call.

`regressions[]`: **empty**. `pre_existing[]`: **empty**.

## Two harness bugs found in this stage's own orchestration (P6 — the numbers were verified, not trusted)

The first two baseline captures both recorded `tests: 1`. **Neither was a real failure**, and accepting either would have been the worst available outcome: `check-regress`'s table excludes a gate that is red at base as PRE-EXISTING, so `tests` — the single most important gate — would have been **dropped from the comparison entirely** while the stage still reported `no-regressions`.

1. **zsh does not word-split unquoted parameter expansion.** The command doc's `node --test <outside_tests...>` idiom, written as `node --test $TESTS`, passes all 46 paths as **one** argument under zsh (unlike bash). Node reported `Could not find '<all 46 paths concatenated>'` and exited 1.
2. **macOS `xargs` has no `-a` flag.** The first fix attempt died on usage and again exited 1.

Corrected to `xargs node --test < list`, and every capture now carries a **liveness assertion** — the log must contain a real `ℹ fail 0` summary before its exit code is recorded. Verified: 748 tests ran at both base and head.

**This is a floor-adjacent hazard in the stage itself, and it is worth a human's attention:** the verdict core (`check-regress.mjs`) is tested and correct, but it is only as good as the exit codes the command's **Bash** hands it, and that Bash is shell-dependent and silently degrades to a plausible-looking `1`. A capture that never ran is indistinguishable from a capture that ran and failed, by exit code alone. Reported here; `.claude/commands/pharn-dev-regress.md` is outside this increment's whitelist.

## Verdict

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.** (`check-regress.mjs verdict` exit **0**, `"verdict": "no-regressions"` — see `regression-report.json`.)

The verdict is floor-grade: an exit-code comparison, not a judgment. Everything around it — choosing the base, the inside/outside partition, running the suite — is advisory orchestration, and the two harness bugs above are exactly why that distinction is not a formality.

**Honest residual (P0/P7):** `/pharn-dev-regress` catches **exactly what its suite catches — nothing more.** A regression no deterministic check covers is invisible here. The claim is "deterministically-detectable breakage outside the feature is caught," **not** "nothing broke."
