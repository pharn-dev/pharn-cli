# REGRESSION — injection-lens (regressions OUTSIDE the feature)

- **Base:** `b53dacc` (HEAD — working-tree dogfood build; `git status --porcelain` non-empty → base = HEAD, P5)
- **Verdict source:** `.dev/floor/check-regress.mjs verdict` (deterministic exit-code comparison; ZERO LLM-judge)

## Inside / outside partition (deterministic — `check-regress.mjs scope`, exit 0, no escaped paths)

- **Inside (the feature — 12 declared `## Files`):** `pharn-review/injection/**` (lens + 3 eval cases + 6 expected) and `.dev/floor/scan-code-injection.{mjs,test.mjs}`. `changed ⊆ declared` held — the build did not escape its scope (fix #7). _(Pipeline-trace artifacts under `.dev/features/injection-lens/**` are written by the plan/grill/regress stages under their own scopes, not build outputs — correctly excluded from the changed-set.)_
- **Outside gates run:** `tests` (22 committed test files), `validate` (whole-repo), `structural:trust-fence` (the one committed eval pair, `pharn-review/trust-fence/…expected-injection-comment.json` ↔ `.dev/features/trust-fence/findings.json`).
- **Style gates (`lint`/`format:check`/`lint:md`):** **skipped** deterministically — `inside` touches no shared style config (`eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`, `.markdownlint-cli2.jsonc`), so an outside style result cannot flip (P5/P7). Absent from both maps.

## Per-gate exit codes (base → head)

| gate                     | base | head | result                                              |
| ------------------------ | ---- | ---- | --------------------------------------------------- |
| `tests` (22 files)       | 0    | 0    | OK — pass both sides                                |
| `validate` (whole-repo)  | 0    | 0    | OK — GREEN 15 (base) → GREEN 16 (head), both exit 0 |
| `structural:trust-fence` | 0    | 0    | OK                                                  |

- `regressions[]`: **none**
- `pre_existing[]`: **none**

## Verdict

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.** `check-regress.mjs verdict` returned `"no-regressions"` (exit 0): every outside gate green at both base and head, zero pass→fail flips. The increment only **added** new files (no existing outside file changed), so the outside surface is byte-identical at base and head — the comparison was never in doubt, and it is captured deterministically regardless.

**Honest residual (P0/P7):** `/pharn-dev-regress` catches **exactly what its suite catches — nothing more.** A regression no deterministic check covers (a broken behavior with no test/rule/eval) is invisible here. This is "deterministically-detectable breakage outside the feature is caught," **not** "nothing broke," and certainly **not** a judgment that the feature is good.

## Orchestration note (advisory — the two clocks)

The **verdict** is floor-grade (the exit-code comparison in `check-regress.mjs`). The **capture** (resolving the base, partitioning inside/outside via `scope`, running the suite at base/head in a detached `git worktree`) is my orchestration and is **advisory**. The baseline worktree ran the stdlib-only core gates without `npm ci` (style gates skipped by the config-touch rule), and the same gate-id set (`tests`, `validate`, `structural:trust-fence`) was applied at both sides, so `check-regress.mjs` had a well-formed comparison and never went inconclusive.
