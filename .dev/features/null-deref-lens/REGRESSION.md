# REGRESSION — null-deref lens

**Question answered:** did building the null-deref lens break anything **outside** the feature?
**Base:** `HEAD` (working-tree dogfood build — `git status --porcelain` non-empty, so base = HEAD = the committed
state without the feature). **Verdict source:** `.dev/floor/check-regress.mjs verdict` (deterministic exit-code
comparison; ZERO LLM-judge in its core).

## Inside / outside partition (deterministic — `check-regress.mjs scope`, `escaped: []`)

- **Inside (the feature's 15 build outputs):** `pharn-review/null-deref/**` (lens + 4 cases + 8 expected) +
  `.dev/floor/scan-code-null-deref.mjs` + `.test.mjs`. All ⊆ the plan's `## Files` → **no scope breach** (fix #7
  re-confirmed). The pipeline trace dir `.dev/features/null-deref-lens/**` (PLAN/GRILL/REGRESSION/… written by
  other stages) is not a build output and is excluded from the changed set.
- **Outside gate set (run at base and at HEAD, identical both sides):** `tests` (the 31 committed `*.test.*` suites
  — the untracked new scanner test is inside, excluded), `validate` (whole-repo floor), `structural:trust-fence`
  (the one committed outside eval pair: `pharn-review/trust-fence/evals/expected/expected-injection-comment.json` ↔
  `.dev/features/trust-fence/findings.json`).
- **Style gates (`lint` / `format:check` / `lint:md`) skipped** deterministically: `inside` touches no shared style
  config (`eslint.config.mjs` / `.prettierrc.json` / `.prettierignore` / `.markdownlint-cli2.jsonc`), so an
  outside-file style result cannot flip — skip is provably safe (and avoids `npm ci` in the baseline worktree).

## Per-gate exit codes (base → head)

| gate                   | base | head | result |
| ---------------------- | ---- | ---- | ------ |
| tests (31 outside)     | 0    | 0    | OK     |
| validate (whole-repo)  | 0    | 0    | OK     |
| structural:trust-fence | 0    | 0    | OK     |

- `regressions[]`: **none**
- `pre_existing[]`: **none**

> **Capture note (honest — orchestration is advisory):** the first `tests`-gate capture read `1` at **both** base
> and head — a shell word-splitting artifact (an unquoted newline-separated file list reached `node --test` as a
> single blob arg, so it errored identically on both sides, never a real failure — `npm test` passes 443/0). Re-run
> with `xargs` (shell-agnostic splitting), the gate reads `0`/`0`. The **verdict** would have been `no-regressions`
> either way (base == head ⇒ no flip), but the corrected capture reflects the true green.

## Verdict

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.** (`verdict:
"no-regressions"`, `check-regress.mjs verdict` exit 0.)

**Honest residual (P0/P7):** `/pharn-dev-regress` catches **exactly what its suite catches — nothing more.** A
regression that no deterministic check covers (a broken behavior with no test / rule / eval) is invisible here. This
is "deterministically-detectable breakage outside the feature is caught," **not** "nothing broke." The comparison —
not the feature's overall wholeness — is what is certified (P0).
