# VERIFY — coupling-griller

**Verdict source:** `.dev/floor/check-verify.mjs` (exit 1). · **FLOOR layer owns the verdict** (exit-code
threshold: PASS iff every gate exit 0). · **Advisory layer:** `count-verifiers.mjs` → `{"registered":0}` —
**no verifiers registered; floor gates only.**

## Floor gates (whole-repo, at HEAD)

| gate           | exit | result                                          |
| -------------- | ---- | ----------------------------------------------- |
| `test`         | 0    | PASS — 218 stdlib tests                         |
| `validate`     | 0    | PASS — `FLOOR: GREEN — 14 capabilities`         |
| `lint`         | 0    | PASS — eslint clean                             |
| `format:check` | 0    | PASS — prettier clean (whole repo)              |
| `lint:md`      | 1    | **FAIL** — markdownlint (see attribution below) |

_(No `structural:*` gate: this feature ships `evals/expected/*` but no committed actual `findings.json`
— the live griller runner is deferred, P7, exactly as every griller. Absent gate, not a failing one.)_

## VERDICT: **VERIFY FAILS** — gate `lint:md` red — stage FAILS

## Failure attribution (honest — the failure is PRE-EXISTING and OUTSIDE this increment)

The sole failing gate, `lint:md`, is red because of **4 MD026 (trailing-punctuation-in-heading) errors
in `.dev/features/comprehension-griller/REVIEW.md`** — a **committed, tracked** apparatus file of a
_different, already-merged_ feature. This increment **did not touch it** (git confirms it is not in this
run's untracked set), so it is **pre-existing whole-repo markdown-lint debt at HEAD**, most plausibly
surfaced by a devDep bump (the repo is actively bumping `prettier`/lint tooling).

**Every file THIS increment produced passes every gate.** My own initial `format:check` misses (4 files)
and the one `lint:md` MD060 table-alignment miss in `REGRESSION.md` were fixed (prettier `--write` on my
files only); the remaining `lint:md` failure is entirely the pre-existing `comprehension-griller` file.

Because `/pharn-dev-verify` gates are **whole-repo by design** ("PASS requires the whole repo clean, not
just the increment's files"), a pre-existing whole-repo violation correctly makes the verdict FAIL — this
is faithful, not fudged. It is **not** evidence of a defect in the coupling griller.

**For the human (this is a STOP, not an auto-fix):**

1. Fix the pre-existing `.dev/features/comprehension-griller/REVIEW.md` MD026 headings in a **separate**
   increment (one axis of change — not bundled into this griller PR, P7), then re-run `/pharn-dev-verify`; or
2. decide whether `.dev/features/**` apparatus REVIEW/GRILL trace should be in `lint:md`'s scope at all
   (a `.markdownlint-cli2.jsonc` / ignore-config question — human + trusted-config territory); or
3. accept the pre-existing debt knowingly and proceed.

## Honest residual (P0/P7)

Verified = the named gates passed; `lint:md` did **not**. This certifies only what the gates check — it
is not a guarantee of correctness beyond them. With zero verifiers, no advisory annotations were
produced. `/pharn-dev-verify` does not ensure the feature is correct — it reports the gate exit codes.
