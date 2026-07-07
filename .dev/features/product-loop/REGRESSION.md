# REGRESSION — product-loop (did building /pharn-loop break anything OUTSIDE the feature?)

- **base:** `843e74aa7c832f698b0b849bee7497aac676e7d7` (working-tree dogfood build → base = HEAD, P5 auto-detect)
- **verdict (FLOOR, `check-regress.mjs verdict`):** `no-regressions` — exit 0
- **inside (the feature's declared `## Files`, `escaped: []` — no fix #7 scope breach):**
  - `.claude/commands/pharn-loop.md`
  - `.dev/floor/check-loop.mjs`
  - `.dev/floor/check-loop.test.mjs`

## Outside-scope gate comparison (base → head, exit codes)

| gate                                                                          | base | head | result |
| ----------------------------------------------------------------------------- | ---- | ---- | ------ |
| `tests` (626 outside tests: all tracked `*.test.mjs` / `*.test.cjs`)          | 0    | 0    | OK     |
| `validate` (`node .dev/floor/validate.mjs .` — whole-repo)                    | 0    | 0    | OK     |
| `structural:…/trust-fence/…/expected-injection-comment.json` (committed pair) | 0    | 0    | OK     |

- **regressions:** none
- **pre_existing:** none

**Style gates (`lint` / `format:check` / `lint:md`) were SKIPPED** deterministically (P5/P7): `inside`
touches no shared style config (`eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`,
`.markdownlint-cli2.jsonc`), so a style-result flip over the byte-identical outside files is provably
impossible.

## Capture note (P6 — verify before assert)

The first capture of the `tests` gate read exit 1 at **both** base and head. Investigation showed this was
a **capture-harness artifact**, not a test result: the run shell is **zsh**, where unquoted `$LIST` is **not**
word-split, so `node --test $LIST` received all 43 paths as a single argument (`Could not find '<list>'`).
Re-captured with `git ls-files … | xargs node --test` (shell-agnostic splitting): **626 tests, 626 pass, 0
fail** at both base and head. The gate maps above are the corrected, real exit codes.

## Verdict

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.** The build was purely
additive (3 new files in floor-ignored dirs; **zero** existing tracked files modified; `check-ship.mjs` and
the dev loop byte-unchanged), so every outside gate is green at both base and head.

_Honest residual (P0/P7):_ `/pharn-dev-regress` catches **exactly what its suite catches — nothing more**. A
regression that no deterministic check covers is invisible here. "no-regressions" certifies the
**comparison**, not that the feature is whole — that is the human's call at the post-review gate.
