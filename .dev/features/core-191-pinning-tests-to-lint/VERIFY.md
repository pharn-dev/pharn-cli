# VERIFY — core-191-pinning-tests-to-lint

Head: `d8cebe8` (the build commit) plus this run's stage artifacts. Gates ran once each, in the working tree, with exit codes captured to `.pharn/pharn-dev-verify/results.json` and reduced by `.dev/floor/check-verify.mjs`.

| gate         | command                               | exit |
| ------------ | ------------------------------------- | ---- |
| test         | `CI=1 npx vitest run --maxWorkers=2`  | 0    |
| typecheck    | `npm run typecheck`                   | 0    |
| lint         | `npm run lint`                        | 0    |
| format:check | `npm run format:check`                | 0    |
| lint:md      | `npm run lint:md`                     | 0    |
| validate     | `node .dev/floor/validate.mjs .`      | 0    |

`test` ran with `CI=1` because CI turns picocolors on. No committed eval pair belongs to this increment, so there is no `structural:*` gate.

Verifiers (advisory layer): `count-verifiers.mjs` → `{"registered":0}`. None ran, none could flip the verdict.

Grill finding 4 (coverage floors): `npx vitest run --coverage --maxWorkers=2` exited 0 with the thresholds enforced (All files: 97.95 % statements, 95.11 % branches, 98.73 % functions, 98.7 % lines). Advisory extra run, not a `check-verify` input.

Suite wall time (heavy.sh, `--maxWorkers=2`, same machine, same worktree; base = detached checkout of `a4bbcb9`):

| run   | files | tests | vitest duration |
| ----- | ----- | ----- | --------------- |
| base3 | 109   | 3779  | 18.18 s         |
| base4 | 109   | 3779  | 18.01 s         |
| head1 | 105   | 3668  | 15.37 s         |
| head2 | 105   | 3668  | 15.87 s         |
| head3 | 105   | 3668  | 14.97 s         |

`lint-gate.test.ts` alone took 2.84 s on the base (7 eslint spawns); `publish-workflow.test.ts` went 1.63 s → 0.16 s; the new `lint-rules.test.ts` takes 0.56 s.

Verdict (`check-verify.mjs`, verbatim): **PASS**, `failing_gates: []`. The named deterministic gates passed. This is not a judgment that the increment is good or wise; that stays with the human at the post-review gate.
