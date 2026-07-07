# REGRESSION — secrets-lens (regressions OUTSIDE the feature)

- **Base:** `edb423d` (HEAD — working-tree dogfood build; `git status --porcelain` non-empty → base = HEAD, P5)
- **Verdict source:** `.dev/floor/check-regress.mjs verdict` (deterministic exit-code comparison; ZERO LLM-judge)

## Inside / outside partition (deterministic — `check-regress.mjs scope`, exit 0, no escaped paths)

- **Inside (the feature — 12 declared `## Files`):** `pharn-review/secrets-in-code/**` (lens + 3 evals) and `.dev/floor/scan-code-secrets.{mjs,test.mjs}`. `changed ⊆ declared` held — the build did not escape its scope (fix #7). _(Pipeline-trace artifacts under `.dev/features/secrets-lens/**` are written by the plan/grill/regress stages under their own scopes, not build outputs — correctly excluded from the changed-set.)_
- **Outside gates run:** `tests` (21 committed test files), `validate` (whole-repo), `structural:trust-fence` (the one committed eval pair, `pharn-review/trust-fence/…expected-injection-comment.json` ↔ `.dev/features/trust-fence/findings.json`).
- **Style gates (`lint`/`format:check`/`lint:md`):** **skipped** deterministically — `inside` touches no shared style config (`eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`, `.markdownlint-cli2.jsonc`), so an outside style result cannot flip (P5/P7). Absent from both maps.

## Per-gate exit codes (base → head)

| gate                          | base | head | result                                              |
| ----------------------------- | ---- | ---- | --------------------------------------------------- |
| `tests` (21 files, 231 tests) | 0    | 0    | OK — 231 pass both sides                            |
| `validate` (whole-repo)       | 0    | 0    | OK — GREEN 14 (base) → GREEN 15 (head), both exit 0 |
| `structural:trust-fence`      | 0    | 0    | OK                                                  |

- `regressions[]`: **none**
- `pre_existing[]`: **none**

## Verdict

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.** `check-regress.mjs verdict` returned `"no-regressions"` (exit 0): every outside gate green at both base and head, zero pass→fail flips.

**Honest residual (P0/P7):** `/pharn-dev-regress` catches **exactly what its suite catches — nothing more.** A regression no deterministic check covers (a broken behavior with no test/rule/eval) is invisible here. This is "deterministically-detectable breakage outside the feature is caught," **not** "nothing broke," and certainly **not** a judgment that the feature is good.

## Orchestration note (advisory — the two clocks)

The **verdict** is floor-grade (exit-code comparison). The **capture** (running the suite at base/head) is my orchestration and is advisory: an initial capture reported `tests: 1` at both base and head — traced to a **zsh word-splitting quirk** (unquoted `$var` is not field-split in zsh, so the 21 test paths were passed to `node --test` as one newline-blob argument → "Could not find" → exit 1), **not** a test failure. Re-captured with a proper zsh array → `tests: 0` at both sides (231/231 pass, confirmed via `npm test` 240/0). The quirk appeared identically on both sides, so the verdict was never in question; the fix only makes the captured maps honest.
