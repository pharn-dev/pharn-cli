# REGRESSION — race-condition-lens

- **Base (pre-build):** `7cca07e` (working-tree dogfood build → `git status --porcelain` non-empty → `base = HEAD`).
- **Verdict:** `no-regressions` — `.dev/floor/check-regress.mjs verdict` exit **0** (deterministic exit-code comparison; ZERO LLM-judge).

## Inside / outside partition (deterministic — `check-regress.mjs scope`, exit 0, no fix#7 escape)

**Inside (the feature — from the plan's `## Files`, all 4 declared writes; `inside ⊆ declared`, nothing escaped):**

- `pharn-review/race-condition/race-condition.md`
- `pharn-review/race-condition/evals/cases/case-check-then-act-injection.md`
- `pharn-review/race-condition/evals/expected/expected-check-then-act-injection.json`
- `pharn-review/race-condition/evals/expected/expected-check-then-act-injection.md`

The pipeline-trace files (`PLAN.md`, `GRILL.md`) under `.dev/features/race-condition-lens/` are written by the
plan/grill stages under their own writes-scopes — **not** build output — so they are correctly excluded from
`--changed` (matching the off-by-one precedent, whose `inside` is product files only). Passing them would
false-positive the fix#7 escape check.

**Outside (must not regress):** 36 test files (the whole `git ls-files '*.test.mjs' '*.test.cjs'` universe — the
feature adds **no** test file, so all tests are outside) + 1 committed eval pair
(`pharn-review/trust-fence/evals/expected/expected-injection-comment.json` ↔ `.dev/features/trust-fence/findings.json`).
**Style gates (`lint` / `format:check` / `lint:md`) skipped** deterministically — the inside touches no shared style
config (`eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`, `.markdownlint-cli2.jsonc`), so an outside style
flip is provably impossible (no `npm ci` incurred).

## Per-gate exit codes: base → head (identical gate set both sides)

| gate                     | base (`7cca07e`) | head (working tree) | classification |
| ------------------------ | ---------------- | ------------------- | -------------- |
| `tests` (`npm test`)     | 0                | 0                   | OK             |
| `validate`               | 0                | 0                   | OK             |
| `structural:trust-fence` | 0                | 0                   | OK             |

- **`regressions[]`:** none.
- **`pre_existing[]`:** none.

## Honest note on the `tests` gate invocation (P6)

A first capture used an ad-hoc explicit `node --test $(git ls-files …)` list and returned exit **1 at BOTH base
and head** — which `check-regress.mjs` would have classified as `pre_existing` (base ≠ 0), never a regression. On
investigation the canonical `npm test` (the glob invocation in `package.json`, and exactly what `/pharn-dev-verify`
runs as its floor gate) returned exit **0 — GREEN** at HEAD. The `1` was a **flaky artifact** of the ad-hoc
list invocation (a transient collision among the floor tests that themselves create git worktrees / temp dirs),
**not** a real failure and **not** caused by this feature (the baseline worktree — without the feature's files —
reproduced neither the failure canonically nor a feature-specific one). The gate was therefore **re-captured with
the canonical `npm test`** at both base and head → **0 / 0**, recorded above. This is surfaced, not hidden (P6).

## Verdict (stated plainly)

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.**

**Honest residual (P0/P7):** `/pharn-dev-regress` catches **exactly what its suite catches — nothing more.** All three
outside gates were GREEN at the `7cca07e` baseline and stay GREEN at HEAD, so nothing deterministically-detectable
outside the race-condition lens broke. This is **not** a claim that "nothing broke" in general — a regression no
deterministic check covers is invisible here. This certifies **only the comparison**, never the feature as a whole
(that is the human's call at the post-review gate).
