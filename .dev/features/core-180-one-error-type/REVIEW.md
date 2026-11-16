# REVIEW — core-180-one-error-type

## Floor results

These floor checks were in place before this review:

- `node .dev/floor/validate.mjs .` is GREEN. It checks 0 capabilities, so it says nothing about a TypeScript increment.
- `npm run check` was GREEN at the build.
- `/pharn-dev-regress` reported no-regressions: tests, validate, lint, format:check and lint:md were identical at base and head.
- `/pharn-dev-verify` was PASS. Its gates were `test:coverage` (98.09/95.13/98.85/98.84), typecheck, lint, format:check, lint:md and validate.

The verify gates were re-run after the review fix below.

Reviewed: `git diff 790d9c3..HEAD`, covering `src/`, `tests/`, `eslint.config.mjs`, docs, `CLAUDE.md` and `CHANGELOG.md`; `src/` plus `tests/` add up to +1023 / −591 lines. The increment is `trust: untrusted`, and nothing in it read as an instruction.

## Floor-gate findings (blocking)

None. Each lens's result:

- L-floor (P0):
  - "`process.exit(` only in `src/index.ts` and `src/lib/fatal-signal.ts`" reduces to the `no-restricted-properties` rule under `--max-warnings 0`, which runs in the required Lint job. A new `lint-rules` row shows the rule fires in `src/commands/update.ts`. `grep -n "process.exit(" src` now matches only those two files, plus one comment in `repo.ts` that names clack's exit.
  - "The clone is removed on every path" is mutation-checked. Dropping `repo.cleanup()` from add's `finally` turned two `clone-cleanup` cases red; restoring it turned them green.
  - "Exit codes and streams unchanged" rests on the command suites. 548 of 563 passed with no edit. The other 15 (uninstall) changed only their exit-code mechanism. All of them print through the real `reportCliError`.
- L-eval (P1): there is no capability or `rule_id`. The new behaviour ships with `cli-error.test.ts`, the `runCli` describe, `clone-cleanup.test.ts` and the dist-smoke "exits promptly" table. That table covers seven refusal paths and one success path.
- L-trust (P2): no new input is ingested. Every printed message still passes through `terminalSafe` in `logError` / `logErrorPlain`. The new unexpected-error path uses `reportFatalPlain`.
- L-axis (P3): `cli-error.ts` holds the type and has no dependencies. `report-error.ts` stays the one printer, now also the top-level one. No command→command or step→step import was added.

## Advisory findings

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: important
  file: 'src/index.ts:598'
  problem: 'Exits on the network paths are not covered by the "exits promptly" claim. An error after a fetch whose deadline fired used to be ended by process.exit; it now waits for the event loop to drain. On Node >= 24.2 undici honours the abort and readCapped cancels bodies, but no test reaches the network. Accepted at GATE 1 (question 6); the PR body must name it.'
  evidence: 'export async function runCli(): Promise<void> { try { await main(); } catch (err) { process.exitCode = reportCliError(err); } }'
- type: FINDING
  rule_id: 'P7'
  severity: minor
  file: 'src/steps/add-picker.ts:25'
  problem: "Once add throws CliError, nothing produced PickerAddOutcome's `error` kind or the FatalCause box on AddResult, and add.ts kept a dead branch for it. FIXED in this review (commit 6ef91ff), declared in PLAN.md as a review amendment."
  evidence: "| { kind: 'error'; message: string; cause?: FatalCause };"
- type: FINDING
  rule_id: 'P3'
  severity: minor
  file: 'src/index.ts:434'
  problem: 'The argv refusals (`refuse()`, unknown command) still call process.exit(1) in place. It is allowed in index.ts and they run before any command, but they are a second way to end a run. Left alone by the GATE 1 decision; C5.5 rewrites argv parsing and may convert them to CliError.'
  evidence: 'console.error(USAGE_POINTER);\n  process.exit(1);'
- type: FINDING
  rule_id: 'P7'
  severity: minor
  file: 'tests/pharn-config.test.ts:182'
  problem: 'The lib suites that no longer reach process.exit (pharn-config, node-prereq, prereqs) keep their stubProcessExit() calls. They are harmless: a stray exit would surface as a ProcessExit instead of killing the worker. Kept to avoid churn; they could go once C5.2 lands.'
  evidence: 'stubProcessExit();'
- type: FINDING
  rule_id: 'P4'
  severity: minor
  file: 'src/lib/pharn-config.ts:391'
  problem: '`loadConfigOrExit` / `loadArchetypeConfigOrExit` keep their names although they now throw. Their doc comments say so. GATE 1 decision (4): C5.2 renames them.'
  evidence: 'export function loadConfigOrExit('
```

## Lessons (candidates; not promoted)

- A src import in `tests/helpers.ts` breaks every command suite: `clack-stub.ts` imports helpers from inside the `@clack/prompts` mock factory, so the real clack loads mid-factory (114 failures, measured). Test helpers that touch `src/` belong in `tests/support/`, not in `helpers.ts`.
- After changing a shared test helper, re-run the command suites, not only the suites that import the helper directly.

The standing decision is the human's. This review gates nothing.
