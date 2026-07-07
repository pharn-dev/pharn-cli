# REGRESSION — swallowed-exception lens

**Question answered:** did building the swallowed-exception lens break anything **outside** the feature?
**Base:** `HEAD` (working-tree dogfood build — `git status --porcelain` non-empty, so base = HEAD = the committed
state without the feature). **Verdict source:** `.dev/floor/check-regress.mjs verdict` (deterministic exit-code
comparison; ZERO LLM-judge in its core).

## Inside / outside partition (deterministic — `check-regress.mjs scope`, `escaped: []`)

- **Inside (the feature's 15 build outputs):** `pharn-review/swallowed-exception/**` (lens + 4 cases + 8 expected) +
  `.dev/floor/scan-code-swallowed-exception.mjs` + `.test.mjs`. All ⊆ the plan's `## Files` → **no scope breach**
  (fix #7 re-confirmed). The pipeline trace dir `.dev/features/swallowed-exception-lens/**` (PLAN/GRILL/… written by
  other stages) is not a build output and is excluded from the changed set.
- **Outside gate set (run at base and at HEAD, identical both sides):** `tests` (the 27 committed `*.test.*` suites —
  the untracked new scanner test is inside, excluded), `validate` (whole-repo floor), `structural:trust-fence` (the
  one committed outside eval pair: `…/expected-injection-comment.json` ↔ `.dev/features/trust-fence/findings.json`).
- **Style gates (`lint` / `format:check` / `lint:md`) skipped** deterministically: `inside` touches no shared style
  config (`eslint.config.mjs` / `.prettierrc.json` / `.prettierignore` / `.markdownlint-cli2.jsonc`), so an
  outside-file style result cannot flip — skip is provably safe (and avoids `npm ci` in the baseline worktree).

## Per-gate exit codes (base → head)

| gate                   | base | head | result |
| ---------------------- | ---- | ---- | ------ |
| tests (27 outside)     | 0    | 0    | OK     |
| validate (whole-repo)  | 0    | 0    | OK     |
| structural:trust-fence | 0    | 0    | OK     |

- `regressions[]`: **none**
- `pre_existing[]`: **none**

## Verdict

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.** (`verdict:
"no-regressions"`, `check-regress.mjs verdict` exit 0.)

**Honest residual (P0/P7):** `/pharn-dev-regress` catches **exactly what its suite catches — nothing more.** A
regression that no deterministic check covers (a broken behavior with no test / rule / eval) is invisible here. This
is "deterministically-detectable breakage outside the feature is caught," **not** "nothing broke." The comparison —
not the feature's overall wholeness — is what is certified (P0).
