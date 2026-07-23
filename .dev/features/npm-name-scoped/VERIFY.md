# VERIFY — npm-name-scoped

- **Verdict source:** `.dev/floor/check-verify.mjs` (exit `1`) — deterministic `PASS iff every gate exit 0`. No LLM owns this number.
- **Feature:** the `pharn` → `@pharn-dev/pharn` npm-name rename (HEAD `5502b3b`).

## FLOOR layer — deterministic gates (whole-repo, at HEAD)

| gate           | exit | result |
| -------------- | ---- | ------ |
| `test`         | 0    | ✅ GREEN — 387/387 vitest, incl. the USAGE (`toContain('Usage:')`) and prereqs assertions |
| `lint`         | 0    | ✅ GREEN — eslint clean |
| `format:check` | 0    | ✅ GREEN — prettier clean (src) |
| `lint:md`      | 0    | ✅ GREEN — markdownlint clean (docs + root `.md`) |
| `validate`     | 1    | ❌ RED — **pre-existing**, whole-repo (see below) |

**`structural:*`** — none (the increment ships no committed eval pair; `outside_eval_pairs: []`).

## The single failing gate is pre-existing and increment-irrelevant

`validate` is **whole-repo** and RED because of the gitignored `test-*/` install fixtures (e.g. `test-spa/pharn/floor/test-fixtures/red/skill.md`, a **deliberate** red fixture inside an installed copy) — **not** any file this increment touched. This is:

- **Proven RED→RED (not caused here) by `/pharn-dev-regress`** this run: `validate` `base:1 / head:1`, listed under `pre_existing`, `verdict: no-regressions` (`regression-report.json`).
- **Identical to the prior shipped `canonical-npm-name` increment** (`verify-report.json`: `validate:1`, `verdict: FAIL`, `failing_gates:[validate]`) — the repo's known `test-*/` contamination (prior REVIEW lessons #1/#2), which forces `validate` RED on **every** increment regardless of content.

Every gate that reflects **this increment's** files is GREEN.

## ADVISORY layer — verifiers

`count-verifiers.mjs .` → `{"registered":0}`. **No verifiers registered — floor gates only.** Step 2 is a no-op; nothing annotates the verdict.

## Verdict

**VERIFY FAILS: gate `validate` red — stage FAILS** (deterministic; `check-verify.mjs` exit 1). Honestly reported: the floor verdict is FAIL because `validate` is whole-repo and the repo carries pre-existing `test-*/` contamination. **No increment-relevant gate failed.**

_Honest residual (P0/P7): verified = the named gates passed; this is NOT a guarantee of correctness beyond what those gates check — and here the failing gate is a pre-existing environmental condition, not a defect in the increment. The `test-*/`-scoping of the floor tooling is a separate, known cleanup (prior REVIEW lesson #2), out of this increment's single axis._
