# REGRESSION — placeholder-as-done lens

**Question answered:** did building the placeholder-as-done lens break anything **outside** the feature?
**Base:** `HEAD` (working-tree dogfood build — `git status --porcelain` non-empty, so base = HEAD = the committed
state without the feature; base SHA `bb1a7e36ba32320c45c5c8623acca831264c6d80`). **Verdict source:**
`.dev/floor/check-regress.mjs verdict` (deterministic exit-code comparison; ZERO LLM-judge in its core).

## Inside / outside partition (deterministic — `check-regress.mjs scope`, `escaped: []`)

- **Inside (the feature's 18 build outputs):** `pharn-review/placeholder-as-done/**` (lens + 5 cases + 10 expected) +
  `.dev/floor/scan-code-placeholder.mjs` + `.test.mjs`. All ⊆ the plan's `## Files` → **no scope breach**
  (fix #7 re-confirmed at regress time). The pipeline trace dir `.dev/features/placeholder-lens/**` (PLAN/GRILL/…
  written by other stages) is not a build output and is excluded from the changed set.
- **Outside gate set (run at base and at HEAD, identical both sides):** `tests` (the 28 committed `*.test.*`
  suites — the untracked new scanner test is inside, excluded), `validate` (whole-repo floor),
  `structural:trust-fence` (the one committed outside eval pair:
  `…/expected-injection-comment.json` ↔ `.dev/features/trust-fence/findings.json`).
- **Style gates (`lint` / `format:check` / `lint:md`) skipped** deterministically: `inside` touches no shared style
  config (`eslint.config.mjs` / `.prettierrc.json` / `.prettierignore` / `.markdownlint-cli2.jsonc`), so an
  outside-file style result cannot flip — skip is provably safe (and avoids `npm ci` in the baseline worktree).

## Per-gate exit codes (base → head)

| gate                   | base | head | result |
| ---------------------- | ---- | ---- | ------ |
| tests (28 outside)     | 0    | 0    | OK     |
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
