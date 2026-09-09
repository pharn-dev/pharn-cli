# SHIP — ci-smoke-built-bundle

Gated `/pharn-dev-ship` run (no `--loop`). Origin: audit finding **P-4** — the shipped `dist/index.js`
is never executed anywhere, so `src/version.ts`'s `createRequire('../package.json')` depth assumption
and `scripts/build.mjs`'s `external` list ship unexercised.

## Stages run, in order

| stage                | outcome                                                                     |
| -------------------- | --------------------------------------------------------------------------- |
| `/pharn-dev-plan`    | `PLAN.md` written; spec hash `bca940a5…` pinned                               |
| **GATE 1**           | **pre-approved by the human** for this finding, conditional on the plan staying within the audit's minimal fix — it does (3 files, no `src/` change) |
| `/pharn-dev-grill`   | `GRILL.md` — 4 concerns (0 blocking, 1 important, 3 minor); advisory, gates nothing |
| `/pharn-dev-build`   | 3 files written under a fix #7 scope pinned to the plan's `## Files`           |
| `/pharn-dev-regress` | `regression-report.json`                                                      |
| `/pharn-dev-verify`  | `verify-report.json`; 0 verifiers registered → floor gates only               |
| `/pharn-dev-review`  | `REVIEW.md` — GREEN, 0 floor-gate findings, 3 advisory                        |

The run ended at **GATE 2** — the post-review human decision — not at a RED-verdict STOP.

## Structural verdicts read, verbatim

These three, and only these, decided proceed-or-stop. No prose from any stage gated anything.

| stage                | verdict source                             | value                                 |
| -------------------- | ------------------------------------------ | ------------------------------------- |
| `/pharn-dev-build`   | `node .dev/floor/validate.mjs .` exit code | **`0`** (`FLOOR: GREEN`)              |
| `/pharn-dev-regress` | `regression-report.json` `.verdict`        | **`"no-regressions"`** (exit `0`)     |
| `/pharn-dev-verify`  | `verify-report.json` `.verdict`            | **`"PASS"`** (exit `0`, `failing_gates: []`) |

`/pharn-dev-regress` compared the six gates (`format:check`, `lint`, `lint:md`, `typecheck`, `test`,
`validate`) at base `377e1f5fe30b8d43903a9305272a929393ed9b8e` and at HEAD — all `0 → 0`,
`regressions[]` and `pre_existing[]` both empty. `check-regress.mjs scope` returned `escaped: []`, so
nothing was written outside the declared writes-scope.

## Pointers (cited, not restated — P4)

- `.dev/features/ci-smoke-built-bundle/REVIEW.md` — the four review lenses and the three advisory
  findings, two of which are doc staleness **outside** this increment's declared `## Files`
  (`docs/contributing.md:47`, `CLAUDE.md:28`) and therefore left for the human to direct.
- `.dev/features/ci-smoke-built-bundle/GRILL.md` — advisory; its one `important` concern (the
  `external`-drift claim covering one direction, not both) was acted on in the built comments.
- `.dev/features/ci-smoke-built-bundle/VERIFY.md`, `REGRESSION.md` — the per-gate tables and each
  stage's named residual.

## Beyond the floor verdicts, for the human's benefit

Two things were checked that no verdict above covers, because a green gate table would otherwise be
read as more than it is:

- The new CI step was run **locally, exactly as CI runs it**: `npm run build` (exit 0), then
  `node dist/index.js --version && node dist/index.js --help` (exit 0, printing `0.4.0` then the
  usage text).
- The new test was **mutation-verified**: deleting the step from the live workflow turned it RED; the
  workflow was then restored byte-for-byte. That mutation also revealed a redundant ordering
  assertion, which was removed rather than kept as decoration.

---

The chain ran; the named floor verdicts are as shown — this is **NOT** a judgment that the increment
is good or wise; that is the human's call at the post-review gate. No merge, no seal, no
`PHARN ✓ reviewed` stamp has been applied.
