# VERIFY — core-180-one-error-type

The gates ran at HEAD `239fb25`, the build commit. The same gate set was run again at `6ef91ff`, after the review's add-picker fix. Every gate exited 0, the verdict was PASS, `test` reported 3422 passed and 1 skipped, and coverage was 98.11/95.15/98.85/98.84.

## Floor layer: the deterministic gates, which own the verdict

| gate         | exit |
| ------------ | ---- |
| test         | 0    |
| validate     | 0    |
| lint         | 0    |
| format:check | 0    |
| lint:md      | 0    |
| typecheck    | 0    |

- `test` ran as `npm run test:coverage`, the command CI runs, so the coverage floors 90/85/90/90 were enforced here too. Results: 100 files, 3422 passed, 1 skipped. All-files coverage was 98.09 statements, 95.13 branches, 98.85 functions and 98.84 lines.
- `structural:*`: none. The feature ships no committed eval pair. Its evals are vitest suites, run under `test`:
  - `tests/cli-error.test.ts`;
  - the "runCli (the one exit point)" describe in `tests/index.test.ts`;
  - `tests/commands/clone-cleanup.test.ts`;
  - the dist-smoke "exits on its own, promptly" table;
  - the `lint-rules` row for `process.exit` in a command file.

Verdict from `check-verify.mjs`, verbatim: **PASS**. `failing_gates`: none.

## Advisory layer: verifiers

No verifiers are registered (`count-verifiers.mjs`: `{"registered":0}`), so only the floor gates ran.

## What this does and does not say

The named gates passed. That is not a judgment that the increment is correct beyond what those gates check.

Two things remain unproven:

- The "exits promptly" property is tested only on paths that do not use the network. An error after a fetch whose deadline fired now ends when the event loop drains, instead of being cut short by `process.exit`. This is the residual named in PLAN.md (open question 6).
- That every exit code and stream is unchanged is shown only for the paths the command suites reach. They all passed unchanged, now through the real `reportCliError`.
