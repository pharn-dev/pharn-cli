# REGRESSION — deserialization-lens (did building the feature break anything OUTSIDE it?)

- Base: `a78c5e4960e3ce83f6cb896f601d85082265c1e1` (working-tree dogfood build → `base = HEAD`, per `git status --porcelain` non-empty).
- Partition (deterministic, `.dev/floor/check-regress.mjs scope`, exit 0, `escaped: []`): **inside** = the 12 build `## Files` (product lens + evals + the scanner + its test); the pipeline trace artifacts (`PLAN.md`, `GRILL.md`, this report) are excluded from `inside` — they are written under their own per-stage writes-scopes, not the build's `## Files` (matches the injection-lens precedent).
- Style gates (`lint` / `format:check` / `lint:md`) **skipped** deterministically: `inside` touches no shared style config (`eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`, `.markdownlint-cli2.jsonc`), so an outside style result cannot flip. No `npm ci` in the baseline worktree.

## Outside gates — `base → head` exit codes (captured; the verdict reads only these ints)

| gate                                           | base | head | result |
| ---------------------------------------------- | ---- | ---- | ------ |
| `tests` (23 outside `*.test.{mjs,cjs}`)        | 0    | 0    | OK     |
| `validate` (whole-repo `validate.mjs`)         | 0    | 0    | OK     |
| `structural:trust-fence` (committed eval pair) | 0    | 0    | OK     |

- `tests` was run at the immutable base SHA in a detached `git worktree` and at HEAD in the working tree, over the **same** 23 committed test files (the outside universe — the feature's own `scan-code-deserialization.test.mjs` is `inside` and excluded). `validate` and `structural:trust-fence` likewise ran identically both sides.
- `regressions: []` · `pre_existing: []`.

## Note on a corrected capture (honesty, P6)

A first capture recorded `tests: base 1 / head 1` (which the verdict would have excluded as _pre-existing_). Investigation showed this was **not** a real failure but a shell word-splitting artifact of the capture invocation (the multi-file test list was passed to `node --test` as a single garbled argument under zsh, which errored identically on both sides). The capture was corrected to split the file list robustly (`git ls-files … | xargs node --test`); the outside `tests` gate then genuinely ran the suite and is GREEN both sides. The authoritative project gate `npm test` is GREEN (279/279) at HEAD independently.

## Verdict (deterministic — `.dev/floor/check-regress.mjs verdict`, exit 0)

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.**

Honest residual (P0/P7): `/pharn-dev-regress` catches **exactly what its suite catches — nothing more.** A regression no deterministic check covers (a broken behavior with no test / rule / eval) is invisible here. This report certifies **the comparison** — "the outside gates that were GREEN at the baseline are still GREEN at HEAD" — **not** that the feature is correct or that nothing broke. That is `/pharn-dev-verify` (floor gates) and the human's review to weigh.
