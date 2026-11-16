import { log } from '@clack/prompts';
import { terminalSafe } from './terminal-safe.js';

// The ONE place the CLI turns a failure into user-visible output: which stream
// the line goes to, and whether the failure came from an exception. Nothing
// here exits: each call site's exit must come AFTER its
// `finally { repo.cleanup() }` (Node skips `finally` on `process.exit`).

/**
 * The next step offered after an exception-derived failure — the only copy in
 * `src/**`; exported so a test can assert it without re-encoding the wording.
 */
export const PHARN_DEBUG_HINT =
  'Re-run with PHARN_DEBUG=1 for full error output.';

/**
 * The message of a caught `unknown`. `String(err)` can itself throw (a
 * null-prototype object, a hostile `toString`), and this is the last thing
 * between a failure and the user, so it names the class of value instead of
 * crashing inside the reporter.
 */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return String(err);
  } catch {
    return 'an unstringifiable value was thrown';
  }
}

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
 * A caught exception, BOXED: `throw undefined` is legal, so a bare
 * `err?: unknown` could not tell a curated refusal from an exception whose
 * value is `undefined`. Callers that defer their exit past a `finally` carry
 * this shape through to the reporter.
 */
export interface FatalCause {
  err: unknown;
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
