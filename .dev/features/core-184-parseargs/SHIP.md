# SHIP — core-184-parseargs (CORE-184, C5.5)

Stages, in order:

1. `/pharn-dev-plan` → `PLAN.md`. GATE 1: approved by the orchestrator (acting for the user) with answers to the five
   open questions, recorded in `PLAN.md`.
2. `/pharn-dev-grill` → `GRILL.md` (advisory; 2 important, 4 minor findings, all addressed in the build).
3. `/pharn-dev-build` → floor verdict: `node .dev/floor/validate.mjs .` exit **0** (GREEN); `npm run check` green
   (99 files, 3,405 tests) and `npm run build` green.
4. `/pharn-dev-regress` → `regression-report.json` `.verdict`: **`no-regressions`** (iteration 2).
5. `/pharn-dev-verify` → `verify-report.json` `.verdict`: **`PASS`** (iteration 2).
6. `/pharn-dev-review` → `REVIEW.md`: no floor-gate finding; five advisory findings, two fixed in-run, three noted
   for follow-up.

Iterations: verify iteration 1 passed, but two stale doc sentences (`docs/commands/list.md`,
`docs/commands/status.md`) turned up while reading the docs. Both files were added to the plan's `## Files` and
fixed, and regress and verify were re-run (iteration 2, verdicts above). The review's one-line follow-up in
`src/lib/cli-args.ts` (`word!` in place of an unreachable `?? ''`) was re-checked by re-running the verify gates
and the build.

Build note: the argv contract moved to `src/lib/cli-args.ts`, where one `util.parseArgs` (strict: false, tokens)
is checked against the help tables. `src/index.ts` is now main plus dispatch. minimist and `@types/minimist` are
removed. `--json` implies `--dry-run` and `--compact` implies `--json`. New refusals: `Option takes no value` and
`Repeated option`. The `Unknown command` echo is escaped.

Pointers: `REVIEW.md` (the findings), `GRILL.md` (advisory).

The run ended at GATE 2. The orchestrator's GATE 2 rule (regress clean, verify PASS, no blocking review finding)
is met. Per that rule the next step is commit, push, PR and green CI. No merge.

Post-PR iteration (orchestrator, to clear pharn-ci's TESTS_NOT_EXERCISING_CHANGES warn): `scripts/build.mjs`
reverted (its stale `minimist` external is harmless; C5.6 #385 rewrites the file); new `tests/main.test.ts` statically
imports `src/index.ts` and runs `main(argv)` end to end on the real commands (`main` now takes `args`, defaulting to
`process.argv.slice(2)`); the unreachable `--json`/`--compact` guards in `src/commands/{init,update}.ts` became the
same implication the parser applies, with their failure rows turned into positive tests. Re-checked with
`npm run check` and `npm run build` before the push.

The chain ran and the named floor verdicts are as shown. This is NOT a judgment that the increment is good or
wise; that is the human's call at the post-review gate.
