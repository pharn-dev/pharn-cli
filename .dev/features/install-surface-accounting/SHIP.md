# SHIP — install-surface-accounting (`/pharn-dev-ship --loop`, cap 3)

Stages run, in order: `/pharn-dev-plan` → GATE 1 (approved with one change to Q2, 2026-10-13) → `/pharn-dev-grill` → `/pharn-dev-build` → `/pharn-dev-regress` → `/pharn-dev-verify` → `/pharn-dev-review`, then the loop body twice more. The run ended at **STOP_CAP** after iteration 3.

## Floor verdicts, verbatim

| stage                | verdict read                                                           |
| -------------------- | ---------------------------------------------------------------------- |
| `/pharn-dev-build`   | `node .dev/floor/validate.mjs .` exit `0`                              |
| `/pharn-dev-regress` | `regression-report.json` `.verdict` = `no-regressions`                 |
| `/pharn-dev-verify`  | `verify-report.json` `.verdict` = `FAIL`, `failing_gates` = `["test"]` |

## Loop

| iteration | verify | regress          | `check-ship.mjs` decision |
| --------- | ------ | ---------------- | ------------------------- |
| 1         | `FAIL` | `no-regressions` | `CONTINUE` (exit 3)       |
| 2         | `FAIL` | `no-regressions` | `CONTINUE` (exit 3)       |
| 3         | `FAIL` | `no-regressions` | `STOP_CAP` (exit 1)       |

`node .dev/floor/check-ship.mjs … --iter 3 --cap 3` → `"decision": "STOP_CAP"`, reason: "cap reached: iter 3 >= cap 3 without floor-GREEN — stop and hand to the human".

The `test` gate's only failures in all three iterations were in `tests/lint-gate.test.ts` (unchanged by this increment): `Test timed out in 5000ms` on its `eslint --stdin` child processes while the shared host's load average was 50–290. Iteration 2's fix addressed a review finding (the init outro), not this gate; no fix to it exists within the plan's `## Files`. See `VERIFY.md` for the out-of-loop evidence.

## GATE 2 decision (human, 2026-10-13)

Accepted despite `STOP_CAP`. The coordinator's reasoning, recorded as given: the only red was the `lint-gate.test.ts` eslint-spawn timeout on an overloaded host; the same failure hit every other branch built on this machine at the same time, those branches' CI was green, and CI remains the authoritative test run. The `.mjs` `COPY_FILENAME_RE` strictness (an upstream `.mjs` hook named outside the allowlist refuses the run, as a `.cjs` one does) was accepted and stays documented.

## After the rebase onto origin/main (`f196f25`, #275–#285 and #284)

Conflicts resolved keeping both sides' intent; every CHANGELOG entry kept. Added at rebase (declared in `PLAN.md`): `isInstallRootPath` (orphans, `pharn uninstall`) takes `.mjs` hooks through the install's own name filters; `init --dry-run` prints the not-shipped warning and `--dry-run --json` carries `absentUpstream`.

Gates re-run on the rebased head: `format:check` 0, `lint` 0, `lint:md` 0, `typecheck` 0, `CI=1 npx vitest run --maxWorkers=2 --testTimeout=120000` 0 (97 files, 2645 passed, 1 skipped), `npm run test:coverage -- --maxWorkers=2 --testTimeout=120000` 0 (all files 97.96 / 94.57 / 98.28 / 98.71), `npm run build` 0, `node .dev/floor/validate.mjs .` 0. These are informational re-runs, not a fourth loop iteration; the loop verdict above stands.

## Pointers

- Review (advisory): [`REVIEW.md`](REVIEW.md)
- Grill (advisory): [`GRILL.md`](GRILL.md)

chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is good or wise; that is the human's call at the post-review gate.
