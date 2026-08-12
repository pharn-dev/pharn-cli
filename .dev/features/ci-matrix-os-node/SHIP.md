# SHIP — ci-matrix-os-node (M7)

A thin, **advisory** roll-up of a `/pharn-dev-ship` run. It records **that the chain ran and its floor verdicts** — nothing more.

## Stages run, in order

| # | stage | outcome |
| --- | --- | --- |
| 1 | `/pharn-dev-plan` | `PLAN.md` written; **GATE 1** — human approved with three amendments |
| 2 | `/pharn-dev-grill` | `GRILL.md` — 5 concerns (advisory, gates nothing); proceeded |
| 3 | `/pharn-dev-build` | files written; floor GREEN |
| — | probe (Phase A/B) | draft PR #91; **HALT 1** results table → human approved line-item R1 + a new red-class |
| 4 | `/pharn-dev-regress` | `regression-report.json` + `REGRESSION.md` |
| 5 | `/pharn-dev-verify` | `verify-report.json` + `VERIFY.md` |
| 6 | `/pharn-dev-review` | `REVIEW.md` |

**Where the run ended: GATE 2** — the post-review human gate. Not at a RED-verdict STOP; every structural verdict read GREEN.

## Structural verdicts read, verbatim

| stage | verdict source | value |
| --- | --- | --- |
| `/pharn-dev-build` | `node .dev/floor/validate.mjs .` exit code | **0** (`FLOOR: GREEN — 0 capabilities checked in .`) |
| `/pharn-dev-regress` | `regression-report.json` `.verdict` | **`"no-regressions"`** (`check-regress.mjs verdict` exit 0) |
| `/pharn-dev-verify` | `verify-report.json` `.verdict` | **`"PASS"`** (`check-verify.mjs` exit 0, `failing_gates: []`) |

Each was read as a deterministic value, not judged. `/pharn-dev-review` has **no** structural verdict and none was invented for it (P0, fix #3): its `REVIEW.md` is prose, and a finding's `severity` is LLM-assigned and advisory.

## External execution proof (not a floor verdict — an observed artifact)

PR **#91**, run `31521684401`: `ubuntu-latest` × {20, 22, 24}, `windows-latest` × 24, `macos-latest` × 24 — **all five green**, plus `floor`, `CodeQL`, `gitleaks`, `Socket Security`.

The first probe run (`31520548206`) was **red on `windows-latest / node 24`** and produced this increment's most valuable output: a real, shipped, cross-platform bug in `readDiskState` (`errno-shape divergence` — a new §3 red-class accepted by the human at HALT 1). Fixed under line-item R1 in `489e8a4`.

## Pointers (cited, not restated — P4)

- `.dev/features/ci-matrix-os-node/REVIEW.md` — 0 floor-gate findings, 5 advisory; **3 of them concern the dev-loop's own stage commands**, not this increment's product code.
- `.dev/features/ci-matrix-os-node/GRILL.md` — advisory, pre-build.
- `.dev/features/ci-matrix-os-node/REGRESSION.md`, `VERIFY.md` — the human renders of the two machine verdicts above.

## Standing item requiring a human, which no verdict here covers

**Branch-protection required checks.** This PR renames the merge gate from one `check` job to five per-cell names. This sandbox cannot read repo settings, so the current state is **unverified**. Both branches, verbatim, are in the PR description and were handed over at HALT 1.

---

Chain ran; the named floor verdicts are as shown — this is **NOT** a judgment that the increment is good or wise; that is the human's call at the post-review gate.
