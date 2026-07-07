# SHIP — swallowed-exception lens (gated chain roll-up)

**Increment:** a ROOT `pharn-review/swallowed-exception/` partial-floor lens that reads untrusted CODE and flags
catch blocks that swallow errors (empty catch, or a log-only catch with no `throw`/`return`/`reject`/`next(`),
backed by a NEW deterministic `.dev/floor/scan-code-swallowed-exception.mjs` scanner + 23 hermetic tests. Mirrors the
`injection` lens precedent. One axis; the 15 files the plan's `## Files` named.

## Stages that ran, in order, and where the run ended

| stage            | what ran                                                        | structural verdict (verbatim)                            |
| ---------------- | --------------------------------------------------------------- | -------------------------------------------------------- |
| plan (GATE 1)    | wrote PLAN.md, pinned spec hash, halted for approval            | human **approved** (empty + log-only scope)              |
| grill (advisory) | interrogated PLAN.md; spec-hash matched                         | 4 concerns (0 blocking) — gates nothing                  |
| build            | wrote the 15 files; ran the floor                               | `validate` exit **0** (GREEN — 23 caps)                  |
| regress          | outside gates at base=HEAD vs HEAD                              | `regression-report.json` .verdict = **`no-regressions`** |
| verify           | project gates at HEAD (test/validate/lint/format:check/lint:md) | `verify-report.json` .verdict = **`PASS`**               |
| review (GATE 2)  | floor-first + 4 advisory lenses                                 | `REVIEW.md` — GREEN, 0 floor-gate findings               |

**The run reached GATE 2 (post-review).** Every gated stage proceeded on its own deterministic floor verdict (read,
never judged): build `validate` exit 0 → regress `no-regressions` → verify `PASS`. No RED-verdict STOP occurred.

## Structural verdicts read (the floor-grade proceed basis)

- **build → `validate` exit code:** `0` (`FLOOR: GREEN — 23 capabilities checked`).
- **regress → `regression-report.json` `.verdict`:** `no-regressions` (`check-regress.mjs verdict` exit 0; all outside
  gates base 0 → head 0; `escaped: []` — the build stayed within its `## Files`).
- **verify → `verify-report.json` `.verdict`:** `PASS` (`check-verify.mjs` exit 0; every gate exit 0;
  `verifiers.registered: 0` — floor gates only).

## Advisory pointers (NOT verdicts — cited, not restated, P4)

- **`.dev/features/swallowed-exception-lens/REVIEW.md`** — GREEN; 0 floor-gate (blocking) findings; 2 minor advisory
  findings (the scanner's mask/brace determinism surface; the JS/TS language scope, now documented) + **1 proposed
  lesson candidate** ("dev-pipeline stages must emit prettier-clean markdown artifacts", human-gated via
  `/pharn-dev-memory-promote`, never self-promoted).
- **`.dev/features/swallowed-exception-lens/GRILL.md`** — advisory; 4 concerns (0 blocking). The two actionable ones
  (brace-matcher edge-case tests; concrete `file_resolves` line-pinning) were honored during build.

## Honest standing

Chain ran; the named floor verdicts are as shown — this is **NOT** a judgment that the increment is good or wise;
that is the human's call at the post-review gate. `/pharn-dev-ship` added no new floor primitive — every guarantee
belongs to a sub-stage (`validate` / `check-regress` / `check-verify`); running the sequence and reading the verdicts
is advisory orchestration. `/pharn-dev-ship` does **not** merge, push, or apply the `PHARN ✓ reviewed` seal — the
merge / fix / abandon decision is yours (GATE 2).
