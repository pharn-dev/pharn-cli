import { log } from '@clack/prompts';

// The ONE place the CLI turns a failure into user-visible output. Two axes, one
// file (P3): WHICH STREAM the line goes to, and WHETHER the failure came from an
// exception. `lib/confirm.ts`'s `cancelAndExit` is the precedent — a tiny shared
// surface, kept just as small.
//
// Nothing here exits. Every call site keeps its own `process.exit`, because the
// exit must happen AFTER that command's `finally { repo.cleanup() }` (Node skips
// `finally` on `process.exit`) — an invariant a reporter that exited for you
// would quietly break.

/**
 * The next step offered after an exception-derived failure. Exported so a test
 * can assert its presence without re-encoding the wording, and deliberately the
 * ONLY copy in `src/**` — nine hand-rolled `if (process.env.PHARN_DEBUG)` blocks
 * used to sit beside eight fatal exits, and the hint itself beside exactly two
 * of them.
 */
export const PHARN_DEBUG_HINT =
  'Re-run with PHARN_DEBUG=1 for full error output.';

/**
 * The message of a caught `unknown`, without the `instanceof` dance at 20 sites.
 *
 * `String(err)` is itself fallible: a null-prototype object (`Object.create(null)`)
 * or one with a hostile `toString` makes it throw `TypeError: Cannot convert
 * object to primitive value`. This function is the LAST thing standing between a
 * failure and the user, so it must never become the thing that crashes — a throw
 * here would swallow the fatal message entirely and replace it with a stack from
 * inside the error reporter. Name the class of value instead and let the exit
 * code carry the rest (P5: the terminal fallback is a named message, not a crash).
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
 * Print one error-level line to **stderr**.
 *
 * `@clack/prompts` defaults `log.*` to `process.stdout`, so before this every
 * fatal message landed on stdout: `pharn update --yes > out.log 2> err.log`
 * exited 1 with 0 bytes on stderr, leaving the operator grepping an empty file.
 * Exit codes were always correct — this is the stream contract, not correctness.
 *
 * The message is passed through verbatim. Callers own their wording; this owns
 * the stream.
 */
export function logError(message: string): void {
  log.error(message, { output: process.stderr });
}

/**
 * A caught exception, BOXED. The box is the point: `throw undefined` is legal
 * JavaScript, so a bare `err?: unknown` parameter cannot tell "no exception —
 * this is a curated refusal" from "an exception whose value happens to be
 * `undefined`", and would silently drop the affordance for the second. Callers
 * that defer their exit past a `finally` already carry this exact shape
 * (`commands/init.ts`, `commands/update.ts`), so the box now travels intact all
 * the way to the reporter instead of being flattened one line short of it.
 */
export interface FatalCause {
  err: unknown;
}

/**
 * Report a fatal failure: `⚠ <message>` on stderr, plus — and ONLY when a
 * `cause` is passed — the `PHARN_DEBUG` affordance.
 *
 * **Passing the cause is the single axis** that marks "this came from an
 * exception". That is what keeps the hint off a curated refusal — a bad
 * argument, a version/layout gate refusal, the non-TTY message — where there is
 * no stack to dump and offering one would be a lie. Because the axis is the
 * box's PRESENCE and not its contents, it is total: every thrown value,
 * `undefined` included, still gets the affordance.
 *
 * Under `PHARN_DEBUG` the original is dumped through `console.error` (already
 * stderr) and the hint is suppressed, since it would be noise beside the stack
 * it was offering to print.
 */
export function reportFatal(message: string, cause?: FatalCause): void {
  logError(`⚠ ${message}`);
  if (cause === undefined) return;
  if (process.env.PHARN_DEBUG) {
    console.error(cause.err);
    return;
  }
  // The hint is part of the fatal message, so it travels with it to stderr
  // rather than being the one line of it left on stdout. It stays `log.info`
  // (not `log.error`): it is an affordance, not a second failure.
  log.info(PHARN_DEBUG_HINT, { output: process.stderr });
}
