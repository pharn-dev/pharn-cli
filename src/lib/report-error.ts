import { log } from '@clack/prompts';
import { CliError, errorMessage, type FatalCause } from './cli-error.js';
import { terminalSafe } from './terminal-safe.js';

// The ONE place the CLI turns a failure into user-visible output: which stream
// the line goes to, and whether the failure came from an exception. Nothing
// here exits. A command THROWS a CliError (lib/cli-error.ts); `runCli`
// (src/index.ts) hands it to `reportCliError` once, after every `finally` on
// the way up has run, and sets `process.exitCode` from the result.

export { errorMessage, type FatalCause };

/**
 * The next step offered after an exception-derived failure — the only copy in
 * `src/**`; exported so a test can assert it without re-encoding the wording.
 */
export const PHARN_DEBUG_HINT =
  'Re-run with PHARN_DEBUG=1 for full error output.';

/**
 * Print one error-level line to **stderr** (clack's `log.*` defaults to
 * stdout). Callers own the wording; this owns the stream and what the terminal
 * may INTERPRET: a fatal message can carry text from the fetched archive, so
 * control and Unicode format characters are stripped here, `\n` and `\t` kept.
 */
export function logError(message: string): void {
  log.error(terminalSafe(message, { keepNewlines: true }), {
    output: process.stderr,
  });
}

/**
 * Report a fatal failure: `⚠ <message>` on stderr, plus — ONLY when a `cause`
 * is passed — the `PHARN_DEBUG` affordance. The box's PRESENCE marks "this came
 * from an exception", which keeps the hint off a curated refusal (no stack to
 * dump) and gives it to every thrown value, `undefined` included. Under
 * `PHARN_DEBUG` the original is dumped and the hint suppressed.
 */
export function reportFatal(message: string, cause?: FatalCause): void {
  logError(`⚠ ${message}`);
  if (cause === undefined) return;
  if (process.env.PHARN_DEBUG) {
    console.error(cause.err);
    return;
  }
  // The hint travels with the fatal message to stderr; `log.info`, since it is
  // an affordance, not a second failure.
  log.info(PHARN_DEBUG_HINT, { output: process.stderr });
}

/**
 * `logError` without clack's chrome, for `--json` modes: one plain stderr line
 * with the same terminal-safety.
 */
export function logErrorPlain(message: string): void {
  console.error(terminalSafe(message, { keepNewlines: true }));
}

/**
 * `reportFatal` for `--json` modes: the same message and cause rules, as plain
 * stderr lines. Nothing here touches stdout.
 */
export function reportFatalPlain(message: string, cause?: FatalCause): void {
  logErrorPlain(`⚠ ${message}`);
  if (cause === undefined) return;
  if (process.env.PHARN_DEBUG) {
    console.error(cause.err);
    return;
  }
  console.error(PHARN_DEBUG_HINT);
}

/**
 * THE TOP-LEVEL CATCH's printer: report what a command threw and return the
 * exit code to set. A CliError is printed by its form, through the reporters
 * above (`plain` → the `--json` twins). Anything else is a bug that escaped a
 * command: `⚠ <message>` plus the PHARN_DEBUG hint as plain stderr lines (no
 * clack chrome, nothing on stdout, so a `--json` consumer stays clean), the
 * original with its stack only under PHARN_DEBUG, exit 1.
 */
export function reportCliError(err: unknown): number {
  if (!(err instanceof CliError)) {
    reportFatalPlain(errorMessage(err), { err });
    return 1;
  }
  switch (err.form) {
    case 'refusal':
      (err.plain ? reportFatalPlain : reportFatal)(err.message);
      break;
    case 'failure':
      (err.plain ? reportFatalPlain : reportFatal)(err.message, err.fatalCause);
      break;
    case 'error':
      (err.plain ? logErrorPlain : logError)(err.message);
      break;
    case 'cancel':
      log.info(err.message);
      break;
    case 'reported':
      break;
  }
  return err.exitCode;
}
