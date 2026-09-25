# SHIP — `release-0-6-0`

Gated mode (no `--loop`). Increment: bump `package.json` / `package-lock.json` version from `0.5.0`
to `0.6.0`, fold `CHANGELOG.md`'s `[Unreleased]` section into `## [0.6.0] — 2026-09-25`, restore
an empty `[Unreleased]` scaffold, and update link definitions.

**Note:** mid-chain restart. The initial PLAN.md omitted `package-lock.json` from `## Files`, which
caused a scope breach detected by `/pharn-dev-regress`. The human chose "Update PLAN.md and restart
build." PLAN.md was updated to include `package-lock.json`; the writes-scope was re-set; the build
files were already correct. The pipeline then ran cleanly from `/pharn-dev-regress` onwards.

## Stages run, in order

| # | stage | outcome |
| --- | --- | --- |
| 1 | `/pharn-dev-plan` | `PLAN.md` written; **GATE 1** pre-approved by human |
| 2 | `/pharn-dev-grill` | `GRILL.md` written — advisory, gates nothing |
| 3 | `/pharn-dev-build` | files written, floor GREEN |
| 3a | PLAN.md updated | `package-lock.json` added to `## Files`; scope reset |
| 4 | `/pharn-dev-regress` | `regression-report.json` + `REGRESSION.md` |
| 5 | `/pharn-dev-verify` | `verify-report.json` + `VERIFY.md` |
| 6 | `/pharn-dev-review` | `REVIEW.md` |

**Where the run ended: GATE 2** — the post-review human decision.

## Structural verdicts read, verbatim

| stage | verdict source | value |
| --- | --- | --- |
| `/pharn-dev-build` | `node .dev/floor/validate.mjs .` exit code | **0** |
| `/pharn-dev-regress` | `regression-report.json` `.verdict` | **`"no-regressions"`** |
| `/pharn-dev-verify` | `verify-report.json` `.verdict` | **`"PASS"`** |

`/pharn-dev-regress` `.regressions[]` is empty; `/pharn-dev-verify` `.failing_gates[]` is empty and
`verifiers.registered` is `0`.

`/pharn-dev-review` has **no** structural verdict and this command did not invent one. Its four lenses
are advisory; the human reads `REVIEW.md` at GATE 2.

## Pointers

- `.dev/features/release-0-6-0/REVIEW.md` — **read this at GATE 2**; one minor advisory finding
  (heading separator cosmetic inconsistency).
- `.dev/features/release-0-6-0/GRILL.md` — advisory pre-build interrogation.
- `.dev/features/release-0-6-0/REGRESSION.md` / `VERIFY.md` — human renders of the two floor verdicts.

---

The chain ran; the named floor verdicts are as shown — this is **NOT** a judgment that the increment
is good or wise; that is the human's call at the post-review gate. Nothing here is a `PHARN ✓ reviewed`
seal, an approval, or a self-issued "shipped".
