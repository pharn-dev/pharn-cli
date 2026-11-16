# GRILL — core-180-one-error-type

ADVISORY. These findings raise concerns for the human and gate nothing (P0). Spec hash recomputed this run:
`bca940a5…`, equal to the plan's `spec_content_hash` (no drift). Registered grillers: 0
(`count-grillers.mjs`: `{"registered":0}`), so only the inline axes ran.

## Findings

```yaml
- type: FINDING
  rule_id: P5
  severity: important
  file: '.dev/features/core-180-one-error-type/PLAN.md:31'
  problem: "Wrapping main()'s whole body in try/catch would also catch the test stub's ProcessExit, which refuse() throws under stubProcessExit. index.test's 46 `rejects.toThrow(ProcessExit)` assertions would then fail. Each refusal would also print an extra '⚠ process.exit(1)' line and its hint, so the 'prints one error line' cases would fail too."
  evidence: '`main()` = `try { await dispatch() } catch (err) { process.exitCode = reportCliError(err) }`, the current body renamed `dispatch`'
```

Resolution for the build: leave `main()` byte-for-byte. Add an exported `runCli()` that awaits `main()` inside the
one try/catch, sets `process.exitCode = reportCliError(err)` and returns. The entry block becomes `void runCli()`.
In production `refuse()`'s `process.exit` never returns, so the catch only ever sees what a command threw. The
existing index tests keep calling `main()` unchanged, and the new "one exit point" describe drives `runCli()`.
This also shrinks the conflict surface with C5.5 to the bottom of the file.

```yaml
- type: FINDING
  rule_id: P5
  severity: important
  file: '.dev/features/core-180-one-error-type/PLAN.md:36'
  problem: 'In a catch that maps library error classes to forms, a CliError thrown inside the try (a drift refusal under the lock, a cancel) must be passed through before the instanceof checks. Otherwise it is wrapped as a failure and earns a PHARN_DEBUG hint.'
  evidence: 'Catch blocks map `ProjectLockedError` / … to the form they print today and wrap the rest with `CliError.failure`'
```

`CliError.failure(err)` passes an existing CliError through, which covers the default branch. The refusal branches
must not match a CliError either (none of those classes extends it). One cli-error unit test pins the pass-through.

```yaml
- type: FINDING
  rule_id: P1
  severity: advisory
  file: '.dev/features/core-180-one-error-type/PLAN.md:72'
  problem: "The harness change makes every command suite print through the real reportCliError. A suite that never checked the stream would still pass if a form were printed by the wrong function (clack vs plain). The --json suites' 'no clack chrome' checks are the guard, so keep them unchanged."
  evidence: '`run()` reports a thrown CliError through the real `reportCliError` and returns its code'
```

```yaml
- type: FINDING
  rule_id: P0
  severity: advisory
  file: '.dev/features/core-180-one-error-type/PLAN.md:33'
  problem: 'Under update.ts the aborted-backup notice must keep its order: the fatal line first, then the notice, both before the lock and the clone are released (they are silent). Verify that an existing update suite case covers a failure after the backup. If none does, add one to clone-cleanup or update.test.'
  evidence: 'a failure after the backup prints `⚠ msg` (+hint) then the aborted-backup notice and throws `CliError.reported()`'
```

```yaml
- type: FINDING
  rule_id: P4
  severity: advisory
  file: '.dev/features/core-180-one-error-type/PLAN.md:83'
  problem: "Docs beyond the three named files may describe the old crash output (a stack trace) or 'exit only after cleanup'. Grep docs/ for 'stack', 'PHARN_DEBUG' and 'process.exit' before claiming they are in sync."
  evidence: '`docs/architecture.md` — §Source … `docs/contributing.md` …'
```

```yaml
- type: FINDING
  rule_id: P7
  severity: advisory
  file: '.dev/features/core-180-one-error-type/PLAN.md:69'
  problem: 'Deleting src/lib/confirm.ts drops a module the 90/85/90/90 coverage floors counted, and the new cli-error.ts must be fully covered. Run test:coverage at verify time; do not assume.'
  evidence: '`src/lib/confirm.ts` — DELETED'
```

## Summary

There are two real build-shaping concerns. Finding 1: the catch must not swallow the test stub's `ProcessExit`, so
add a `runCli()` wrapper and leave `main()` untouched. Finding 2: pass inner CliErrors through before classifying.
The rest are verification reminders: stream assertions, backup-notice order, a docs grep, and coverage.

ADVISORY VERDICT: 6 concerns raised (2 important, 4 advisory, 0 blocking), for the human to weigh before
/pharn-dev-build. This is not a judgment that the plan is sound.
