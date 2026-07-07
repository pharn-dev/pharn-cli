# REGRESSION — crypto-lens (regressions OUTSIDE the feature) — iteration 2 (post-GATE-2 refinement)

- **Base:** `4376cff` (HEAD — working-tree dogfood build; `git status --porcelain` non-empty → base = HEAD, P5)
- **Verdict source:** `.dev/floor/check-regress.mjs verdict` (deterministic exit-code comparison; ZERO LLM-judge)

## Inside / outside partition (deterministic — `check-regress.mjs scope`, exit 0, no escaped paths)

- **Inside (the feature — now 15 declared `## Files`):** `pharn-review/insecure-crypto/**` (lens + 4 eval cases + 8 expected) and `.dev/floor/scan-code-crypto.{mjs,test.mjs}`. The GATE-2 refinement added `case-md5-cachekey` (+2 expected). `changed ⊆ declared` held — the build did not escape its scope (fix #7). _(Pipeline-trace artifacts under `.dev/features/crypto-lens/**` are written by the stages under their own scopes, not build outputs — correctly excluded from the changed-set.)_
- **Outside gates run:** `tests` (25 committed test files, via `git ls-files … | xargs node --test`), `validate` (whole-repo), `structural:trust-fence` (the one committed eval pair).
- **Style gates:** skipped deterministically — `inside` touches no shared style config (P5/P7).

## Per-gate exit codes (base → head)

| gate                     | base | head | result                                              |
| ------------------------ | ---- | ---- | --------------------------------------------------- |
| `tests` (25 files)       | 0    | 0    | OK — pass both sides                                |
| `validate` (whole-repo)  | 0    | 0    | OK — GREEN 19 (base) → GREEN 20 (head), both exit 0 |
| `structural:trust-fence` | 0    | 0    | OK                                                  |

- `regressions[]`: **none**
- `pre_existing[]`: **none**

## Verdict

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.** `check-regress.mjs verdict` returned `"no-regressions"` (exit 0). The refinement only **added/modified inside-feature files** (scanner + lens + evals); no existing outside file changed, so the outside surface is byte-identical at base and head.

**Honest residual (P0/P7):** `/pharn-dev-regress` catches **exactly what its suite catches — nothing more.** This is "deterministically-detectable breakage outside the feature is caught," **not** "nothing broke," and **not** a judgment that the feature is good.

## Orchestration note (advisory — two clocks)

The **verdict** is floor-grade (the exit-code comparison in `check-regress.mjs`); the capture (base worktree + head, same gate-id set both sides) is advisory orchestration. Test-file lists are passed via `git ls-files … | xargs node --test` (robust word-splitting) — the lesson candidate this run surfaced.
