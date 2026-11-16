# PLAN — core-180-one-error-type (Linear CORE-180, C5.1, epic CORE-154)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: add `CliError extends Error { exitCode }` (refusal / failure / error-line / cancel = exit 0 / already-reported forms); commands, steps and lib throw it instead of calling `process.exit`; `src/index.ts` `main()` catches once, prints through the one reporter, sets `process.exitCode` and returns. `finally` blocks then run on every path, so update.ts's holder refs, every deferred exit and the "exit only after cleanup" ordering rule go. Exit codes and output streams unchanged.
- base: origin/main @ 790d9c3. Branch `przemek/core-180-c51-one-error-type-and-one-exit-point`.
- layer(s): pharn-cli `src/` (commands, steps, lib), `eslint.config.mjs`, `tests/`, `docs/`, `CLAUDE.md`, `CHANGELOG.md`.
- constitution_refs: [P0, P1, P3, P4, P5, P7]

## Why (discovery, live state this run)

- `process.exit(` appears in 17 src files (62 grep hits incl. comments): add 6, init 8, remove 7, status 7, uninstall 4, update 9, pharn-config 2, prereqs 1, node-prereq 1, confirm 1 (`cancelAndExit`, exit 0), index 3, fatal-signal 1. The eslint `no-restricted-properties` rule already allowlists 12 files (`PROCESS_EXIT_ALLOWLIST`, "until C5.1 narrows the list").
- Every command reports a failure in one of five shapes: `reportFatal(msg)` (⚠, no hint = refusal), `reportFatal(msg,{err})` (⚠ + PHARN_DEBUG hint/dump = failure), `logError(msg)` (no ⚠ = precondition line), `cancelAndExit()` (`log.info`, exit 0), or notes printed first then a bare exit (`status --strict`, the `add` picker with failed picks, update's backup notice after a failure). Each has a `…Plain` twin under `--json`.
- CORE-190 moved the command suites onto `tests/support/harness.ts`; its `run()` turns a stubbed `process.exit` into the exit code. `ProcessExit` is now referenced only in: helpers, harness, index.test (46, argv refusals — index.ts keeps its `process.exit`), pharn-config.test (29), commands/uninstall.test (12), node-prereq.test (9), prereqs.test (8), confirm.test (4), overwrite-check.test (2).
- `PHARN_DEBUG` and `log.error` are lint-confined to `src/lib/report-error.ts`, so the top-level printer lives there.
- Unexpected (non-CliError) throws today reach `main().catch(e => { console.error(e); process.exit(1) })` — a full stack. The ticket wants exit 1 with the stack only under `PHARN_DEBUG=1`.

## Design

- `src/lib/cli-error.ts` (NEW): `class CliError extends Error { readonly exitCode: number; readonly form; readonly output: 'clack' | 'plain'; readonly cause?: { err: unknown } }` with factories:
  `CliError.refusal(msg, {json})` (⚠, no hint), `CliError.failure(err, {json, message?})` (⚠ + hint/dump; returns `err` unchanged when it is already a CliError, so an inner refusal is never re-wrapped), `CliError.error(msg, {json})` (one line, no ⚠ — TTY gates, prereqs, config load, bad address), `CliError.cancel(msg = 'Cancelled. Nothing was changed.')` (exit 0, `log.info`), `CliError.reported(exitCode = 1)` (prints nothing: the site printed a multi-line note first).
- `src/lib/report-error.ts`: add `reportCliError(err: unknown): number` — prints a CliError by its form/output through the existing `reportFatal` / `logError` / `…Plain` functions and returns its exit code; any other value is unexpected: `⚠ <message>` + hint as PLAIN stderr lines (stdout stays clean for a `--json` consumer), `console.error(err)` (the stack) only under `PHARN_DEBUG`, exit 1. The header contract "nothing here exits; the caller must exit after its finally" is replaced by "throw a CliError; index.ts prints it once".
- `src/index.ts`: `main()` = `try { await dispatch() } catch (err) { process.exitCode = reportCliError(err) }`, the current body renamed `dispatch` (otherwise unchanged); the entry block becomes `void main()`. `refuse()` and the unknown-command `process.exit(1)` stay as they are (index.ts is allowed; C5.5 owns argv parsing, so the conflict surface is the function header only).
- Commands: each `reportX(...); process.exit(n)` becomes `throw CliError.x(...)` at the point of decision, INSIDE the try whose `finally` cleans the clone / releases the lock. Catch blocks map `ProjectLockedError` / `CapabilityRemovalError` / `OverwriteRefusedError` / `RemoveBackupError` / `SymlinkedTargetError` / `UninstallError` to the form they print today and wrap the rest with `CliError.failure`. Spinners are stopped in the same catch before the rethrow, so frames are unchanged.
  - update.ts: `backupRef`, `spinnerRef`, `refusalRef`, `failure`, `cancelled`, the boxed `PlanOutcome.failed` and the defensive `!outcome` branch go. `applyUnderLock` owns its spinner in a local try/catch; a failure after the backup prints `⚠ msg` (+hint) then the aborted-backup notice and throws `CliError.reported()` (same lines, same order). `planFromClone` throws instead of returning `refused` / `failed`.
  - init.ts / add.ts: the `refusal` / `failure` / `outcome` / `result` deferred-exit variables go; add's picker with failed picks keeps its outro then throws `CliError.reported()`.
  - status.ts: the `exitCode` local and the `report === undefined` sentinel go; a strict failure throws `CliError.reported()` (notes already printed, no outro); `--json` strict keeps `process.exitCode = 1` after the one stdout write (unchanged).
- `src/lib/confirm.ts` DELETED (`cancelAndExit` → `throw CliError.cancel()` at its 6 call sites). Steps keep returning `'cancel'` values (no API churn); their "must not exit" comments are updated.
- `src/lib/pharn-config.ts` (`loadConfigOrExit`, `loadArchetypeConfigOrExit` — names kept, they still end the command with exit 1), `src/steps/prereqs.ts`, `src/steps/node-prereq.ts`: throw `CliError.error(msg, {json})`.
- Kept: `fatal-signal.ts` (SIGINT/SIGTERM 130/143), the `exit` listeners in `repo.ts` and `project-lock.ts` (clack's `block()` still calls `process.exit(0)` on Ctrl-C during a spinner); their comments now name that as the only `process.exit` they guard against.

## Files

- `src/lib/cli-error.ts` — NEW: the CliError class and its five forms — layer lib
- `src/lib/report-error.ts` — add `reportCliError` (the top-level printer); new header contract — layer lib
- `src/index.ts` — `main()` catches once and sets `process.exitCode`; body → `dispatch()`; entry `void main()` — layer entry
- `src/commands/init.ts` — throws; deferred exits removed — layer command
- `src/commands/add.ts` — throws; boxed `result` / `outcome` errors removed — layer command
- `src/commands/remove.ts` — throws — layer command
- `src/commands/update.ts` — throws; holder refs, `failure`, deferred exits removed — layer command
- `src/commands/status.ts` — throws; `exitCode` / sentinel removed — layer command
- `src/commands/uninstall.ts` — throws — layer command
- `src/lib/confirm.ts` — DELETED — layer lib
- `src/lib/pharn-config.ts` — loaders throw CliError — layer lib
- `src/steps/prereqs.ts` — throws — layer step
- `src/steps/node-prereq.ts` — throws — layer step
- `src/steps/overwrite-check.ts` — comment only — layer step
- `src/steps/add-picker.ts` — review amendment (cheap advisory fix): drop the `cause?: FatalCause` box and `PickerAddOutcome`'s `error` kind, which nothing produces once add throws CliError — layer step
- `src/lib/min-cli-gate.ts` — comment only — layer lib
- `src/lib/update-render.ts` — comment only — layer lib
- `src/lib/repo.ts` — backstop comment only — layer lib
- `src/lib/project-lock.ts` — comment only (if its wording names other exits) — layer lib
- `eslint.config.mjs` — `PROCESS_EXIT_ALLOWLIST` = `src/index.ts`, `src/lib/fatal-signal.ts`; the message drops "until C5.1" — layer dev tooling
- `tests/lint-rules.test.ts` — ADD one row: `process.exit` in a command file (`src/commands/update.ts`) fires — layer test
- `tests/cli-error.test.ts` — NEW: unit test of the top-level catch (`reportCliError`): each form's stream / glyph / exit code, `CliError(0)` cancel, `CliError(1)`, an unexpected Error → exit 1 with `⚠ msg` + hint, stack ONLY with `PHARN_DEBUG=1`, a non-Error thrown value, `failure()` passing a CliError through, the `--json` forms touch no clack and no stdout — layer test
- `tests/index.test.ts` — APPEND one describe "main (the one exit point)": a command rejecting with `CliError.cancel()` → exitCode 0, a refusal → 1 + its line, a plain Error → 1 and no stack; `main()` itself never rejects — layer test
- `tests/helpers.ts` — add `exitCodeOf(fn)` / `exitCodeOfAsync(fn)` (run; a CliError → `reportCliError` → its code); `stubProcessExit` kept (index.test, harness safety net) — layer test
- `tests/support/exit-code.ts` — NEW (build amendment): `exitCodeOf` / `exitCodeOfAsync` live here, not in `tests/helpers.ts`, because `clack-stub.ts` imports helpers from inside the `@clack/prompts` mock factory; a src import there loads the REAL clack mid-factory (measured: 114 command-suite failures) — layer test
- `tests/support/harness.ts` — `run()` reports a thrown CliError through the real `reportCliError` and returns its code (the ProcessExit branch kept as a net); add `watchClones()` (the TMPDIR-private clone watcher, today local to init.test) — layer test
- `tests/confirm.test.ts` — REWRITTEN in place: its two `it`s (same names) now drive `CliError.cancel()` through `reportCliError` (exit 0, `log.info` default / custom message) — layer test
- `tests/node-prereq.test.ts` — `toThrow(ProcessExit)` → `exitCodeOf(...)`; the log.error / stderr assertions and test names unchanged — layer test
- `tests/prereqs.test.ts` — same rewrite — layer test
- `tests/pharn-config.test.ts` — same rewrite (29 refs) — layer test
- `tests/commands/uninstall.test.ts` — `rejects.toMatchObject(new ProcessExit(n))` → the harness `run(...)` exit code (or `rejects.toMatchObject({ exitCode: n })`); names unchanged — layer test
- `tests/commands/clone-cleanup.test.ts` — NEW: for init, init --dry-run, add, update, update --dry-run, status: the temp clone is gone after a refusal (MIN_CLI), a THROWN error inside the clone phase (missing subtree / unwritable destination), and a cancel where the command prompts; exit codes 1 / 1 / 0 — layer test
- `tests/dist-smoke.test.ts` — ADD an `it.each` over all 7 commands in a no-config, no-.git project: the spawned bundle exits with today's code well inside the spawn timeout (not killed → no hanging handle), no stack frame — layer test
- `docs/architecture.md` — §Source "Every exit happens after that" → the one-exit-point model (commands throw CliError; index.ts prints, sets exitCode) — layer docs
- `docs/contributing.md` — the invariant sentence: `process.exit` only in `src/index.ts` and `src/lib/fatal-signal.ts`; module list `confirm` → `cli-error`; test table adds `cli-error.test.ts` — layer docs
- `CLAUDE.md` — module map Reporting adds `cli-error`; the invariant bullet names the two files (no line-count growth) — layer docs
- `CHANGELOG.md` — one line under `## [Unreleased]` (open question 3) — layer docs
- `docs/troubleshooting.md` — "When the `PHARN_DEBUG` hint appears": an unexpected internal error now ends with `⚠ <message>` and the hint, not a stack trace (added at build per GRILL finding 5, the docs grep) — layer docs

## Contracts satisfied

- CLAUDE.md "Code invariants are eslint rules" — the allowlist narrows to two files; `tests/lint-rules.test.ts` proves it fires.
- CLAUDE.md "`--json` reports keep their bytes; stdout carries exactly one object, diagnostics go to stderr" — `--json` forms print plain stderr only; the unexpected-error path is plain stderr.
- CLAUDE.md "The project lock" / "The clone is data" — unchanged; the lock and the clone now release through their own `finally` on every thrown path.

## Evals to write (P1)

- top-level catch → CliError(0) cancel: exit 0, `log.info('Cancelled. Nothing was changed.')`, stderr empty
- top-level catch → CliError refusal (1): `⚠ msg` on stderr, no PHARN_DEBUG hint
- top-level catch → failure: `⚠ msg` + hint; under PHARN_DEBUG the original dumped, hint suppressed
- top-level catch → unexpected Error: exit 1, `⚠ msg` + hint, no stack frame; with PHARN_DEBUG=1 the stack printed
- main() → never rejects; sets process.exitCode from the thrown error
- each command's success / refusal / cancel exit codes and streams — the existing command suites, unchanged, now through the real printer
- temp clone removed after a refusal, a thrown error and a cancel (per clone-owning command)
- spawned bundle: each of the 7 commands exits promptly with today's code
- lint: `process.exit` in a command file fires `processExit`

## Guarantee audit (P0)

- "`process.exit(` only in index.ts and fatal-signal.ts" → floor: eslint `no-restricted-properties` (Lint gate) + `tests/lint-rules.test.ts`.
- "exit codes and output streams unchanged" → floor: the command suites (Test gate) run the real commands through the real `reportCliError`; advisory for paths no suite reaches.
- "the temp clone is removed on every path, including a thrown error" → floor: `finally` + `tests/commands/clone-cleanup.test.ts`; Ctrl-C during a spinner and signals stay on the existing `exit` / fatal-signal backstops (tested in the repo / lock / fatal-signal suites).
- "each command exits promptly, no hanging handles" → floor for the non-network paths only (dist-smoke spawn with a timeout). Network paths: advisory — the residual in open question 6.
- "holder refs gone" → advisory (review / grep; no floor primitive warranted, P7).

## Trust audit (P2)

- No new untrusted input. Messages from the clone (MIN_CLI text, error messages) keep flowing through `reportFatal` / `logError`, which already `terminalSafe` them; `reportCliError` adds no print path that bypasses them (the unexpected-Error path goes through `reportFatalPlain`).

## Determinism audit (P5)

- `reportCliError` branches on `instanceof CliError` and an enum `form` — membership tests. No guessing fallback: any other value is "unexpected → exit 1".

## Test deletions

- NONE. No test file and no `it` / `describe` is deleted; `confirm.test.ts` keeps its two `it` names while its subject becomes `CliError.cancel()`. Only `src/lib/confirm.ts` (source) is deleted.

## Open questions — RESOLVED at GATE 1 (2026-11-16, orchestrator for the user)

All six resolved as recommended: (1) leave `refuse()` / unknown-command in index.ts (C5.5 rewrites them); (2) plain stderr; (3) the one CHANGELOG line as proposed; (4) keep the `…OrExit` names (C5.2 renames them) and update each one's doc comment to say it throws a CliError; (5) steps keep returning `'cancel'`; (6) follow the ticket, name the residual in the PR body, and the dist-smoke "exits promptly" cases include refusal paths, not only success.

Original questions, for the record:

1. index.ts `refuse()` and the unknown-command branch keep `process.exit(1)` (an allowed file; C5.5 rewrites argv parsing). **Recommend: leave them** — C5.5 may convert them to throws.
2. Unexpected (non-CliError) output: plain `⚠ <message>` + `PHARN_DEBUG` hint on stderr (no clack chrome), the stack only under `PHARN_DEBUG=1`. **Recommend: plain**, so a `--json` consumer's stderr stays chrome-free.
3. CHANGELOG: one line under `### Changed`: "Internal: commands end through one error type and one exit point; exit codes and output are unchanged, except that an unexpected crash prints `⚠ <message>` and the `PHARN_DEBUG=1` hint instead of a stack trace." **Recommend: this line** (the crash-output change is user-visible, if only for bugs).
4. Keep the names `loadConfigOrExit` / `loadArchetypeConfigOrExit` (they still end the command with exit 1). **Recommend: keep** — renaming touches six command files the sibling tickets also edit.
5. The steps (`archetype-summary`, `overwrite-check`, `add-picker`) keep returning `'cancel'` rather than throwing. **Recommend: keep** (P7; no behaviour gain).
6. Residual: an error path that follows a fetch whose deadline fired used to be cut short by `process.exit`; it now ends when the event loop drains. On the Node floor (24.2) undici honours the abort and `readCapped` cancels bodies, so nothing should linger, but no test can reach the network. **Recommend: follow the ticket (set exitCode and return)** and name this residual in the PR, rather than re-adding a `process.exit` after the report.
